---
id: streams
title: Streams
description: How RTCIOStream wraps a MediaStream, how late joiners receive your camera, and how to swap tracks at runtime without dropping the connection.
---

import StackBlitz from '@site/src/components/StackBlitz';
import { minimalVideo, lateJoinerReplay } from '@site/src/examples';

# Streams

Sending audio/video in WebRTC means attaching `MediaStreamTrack`s to an `RTCRtpSender`. rtc.io wraps that with two ergonomic ideas:

- **`RTCIOStream`** — a typed, identifiable wrapper around a `MediaStream`.
- **A replay registry** — streams you `emit` are remembered, so when peer N joins later they get those same streams without you doing anything.

## RTCIOStream

```ts
import { RTCIOStream } from "rtc.io";

const local = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
const myCamera = new RTCIOStream(local);
```

The constructor either takes a `MediaStream` (auto-generates a UUID for `id`) or `(id: string, mediaStream)` if you want a stable identifier across reloads. The `id` survives the wire trip — both peers see the same `RTCIOStream.id` so you can correlate streams to people.

Two ways to send it:

```ts
// Broadcast: emit reaches every connected peer (and replays for late joiners).
socket.emit("camera", myCamera);

// Per-peer: address one peer specifically.
socket.peer(peerId).emit("screen", myCamera);
```

On the receive side, the handler shape is symmetric:

```ts
socket.on("camera", (stream: RTCIOStream) => {
  const peerName = (stream as any).peerName;  // your app metadata, see below
  videoEl.srcObject = stream.mediaStream;
});
```

## How `emit` of a stream works under the hood

Three things happen the moment you call `socket.emit("camera", myCamera)`:

1. **Library detects the `RTCIOStream`** in your args and treats this as a stream emit (not a ctrl-channel emit).
2. **Stream + event metadata are stored** in a registry keyed by stream id. Future peer connections will replay this.
3. **For every currently connected peer**, `addTransceiver` is called for each track (`audio`, `video`) with `direction: "sendonly"` and the underlying `MediaStream` as the associated stream. The browser fires `onnegotiationneeded`, rtc.io creates a fresh offer, and the transceiver lights up.

When the remote browser receives the resulting tracks, it fires `ontrack`. rtc.io looks up which `RTCIOStream` they belong to (via a `mid` lookup using a small handshake — see the `stream-meta` payload in [How it works](/docs/how-it-works)) and dispatches your `socket.on("camera", ...)` handlers with the wrapped stream.

## Attaching metadata to a stream

The `RTCIOStream` doesn't have to be the only arg. `socket.emit` deep-walks the payload looking for any `RTCIOStream`; the rest of the object/array shape is preserved verbatim across the wire. Use this to ship app-level metadata (display name, the kind of stream, the source app) alongside the stream — no second ctrl emit needed:

```ts
// ✅ The library finds the RTCIOStream nested inside the payload
socket.emit("stream", {
  screen: new RTCIOStream(displayStream),
  metadata: { userId: "abc123", displayName: "Alice", kind: "screen" },
});

// Receive side mirrors the emitted shape
socket.on("stream", (payload: {
  screen: RTCIOStream;
  metadata: { userId: string; displayName: string; kind: "camera" | "screen" };
}) => {
  video.srcObject = payload.screen.mediaStream;
  label.textContent = payload.metadata.displayName;
});
```

The metadata is stored alongside the stream in the replay registry, so a late joiner receives the same `{ screen, metadata }` payload they would have received if they'd been there from the start. Re-emit with the same `RTCIOStream` instance and fresh metadata to update — the registry overwrites by stream id.

Things to keep in mind:

- **Only `RTCIOStream` instances are detected**, not bare `MediaStream` — a `MediaStream` JSON-serialises to `{}` and the receiver gets nothing.
- **Hold the wrapper stable.** One `RTCIOStream` per underlying media for the whole session; a fresh wrapper on every emit creates a new stream id and registers a duplicate.
- **JSON-safe metadata only.** Once the stream tokens are swapped in, the payload goes through `JSON.stringify`. Functions and class instances (other than `RTCIOStream` itself) won't survive the trip.

## Ask for permission *before* `join-room`

Order the user-facing flow as **getUserMedia → join-room → emit**, not the other way around:

```ts
// ✅ permission first, then join, then emit
const local = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
const camera = new RTCIOStream(local);
socket.server.emit("join-room", { roomId, name });
socket.on("peer-connect", () => socket.emit("camera", camera));
```

If you `join-room` first, a peer who joins while you're still sitting on the browser's permission prompt sees you as already in the room but with no stream attached — they render an empty tile and only see your camera once you accept the prompt (which can be tens of seconds later, or never if the user rejects). Asking for permission up-front gives you a stream you can `emit` the moment a peer connects, so newcomers see media immediately.

(For apps where the user might join the room and *then* opt into camera — voice-only fallback, lobby UI, etc. — that's fine too; just be aware that the empty-tile state is on you to render. The library will deliver the stream whenever you `emit` it.)

## Late joiners

If peer A `emit`s a camera, then peer B joins the room afterwards, peer B should see A's camera. Without intervention, B wouldn't — A's `emit` happened before B existed.

rtc.io handles this with the replay registry. Whenever a new peer connection is created, rtc.io iterates the registry and calls `addTransceiver` for every previously-emitted stream:

```ts title="rtc.ts (excerpt)"
private replayStreamsToPeer(peer: RTCPeer) {
  for (const streamKey in this.streamEvents) {
    const events = this.streamEvents[streamKey];
    const stream = this.getRTCIOStreamDeep(events);
    if (stream) this.addTransceiverToPeer(peer, stream);
  }
}
```

This is exactly what late joiners need. You don't write any code for it.

The flip side: if a stream goes away, the registry still has it. Late joiners would receive a dead stream as if it were active. That's what `untrackStream` is for:

```ts
socket.untrackStream(myCamera);
```

This drops the stream from the registry. Already-connected peers are unaffected; signal them at the application level if you want them to remove the tile (e.g. emit a `stop-share` event).

## Toggling tracks (mute, camera off)

The right way to mute a mic isn't to remove the track; it's to set `track.enabled = false`. The track stays in the transceiver, the transmission continues at low overhead, and the remote side just sees zeroed-out frames/silence.

```ts
local.getAudioTracks().forEach(t => t.enabled = false);  // mute mic
local.getVideoTracks().forEach(t => t.enabled = false);  // camera off
```

This won't trigger any signaling. It's purely a browser-side flag.

## Swapping tracks (mic / camera switch)

When the user picks a different microphone mid-call, you don't need to rebuild the connection — `MediaStream.addTrack`/`removeTrack` triggers `RTCIOStream`'s internal listener, which drives the library to call `replaceTrack` on the existing `RTCRtpSender`:

```ts title="In your app"
async function switchMic(deviceId: string) {
  const fresh = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: deviceId } }
  });
  const newTrack = fresh.getAudioTracks()[0];

  const oldTrack = localStream.getAudioTracks()[0];
  if (oldTrack) {
    oldTrack.stop();
    localStream.removeTrack(oldTrack);
  }
  localStream.addTrack(newTrack);
  // RTCIOStream's `addtrack`/`removetrack` listener fires onTrackChanged.
  // The library reuses idle transceivers via replaceTrack — no SDP renegotiation.
}
```

`onTrackChanged` is exposed publicly on `RTCIOStream` if you want to react to remote-side track changes too:

```ts
remoteStream.onTrackChanged((stream) => {
  console.log("remote tracks now:", stream.getTracks().map(t => t.kind));
});
```

It returns an unsubscribe function.

## Track-added (late tracks)

If a peer adds a *new kind* of track to an existing stream (e.g. starts with audio only, adds video later), the receiving side fires `track-added`:

```ts
socket.on("track-added", ({ peerId, stream, track }) => {
  console.log(peerId, "added a", track.kind, "track to", stream.id);
});
```

This is an rtc.io reserved event — you can listen but a peer can't spoof it. Useful for "they turned the camera on now" UI changes without your own application-level signaling.

## Track-removed (partial departure)

The mirror of `track-added`: when the WebRTC stack drops a track from a remote stream — the remote ended a screen share, called `removeTrack` and renegotiated, or stopped a transceiver — the receive side fires `track-removed`:

```ts
socket.on("track-removed", ({ peerId, stream, track }) => {
  if (track.kind === "video" && stream.getVideoTracks().length === 0) {
    hideVideoTile(peerId);
  }
});
```

The `stream` argument is the same `MediaStream` you originally got via `socket.on("camera", ...)`, so you can correlate it back to the same tile. Use this for "they turned the camera off" UI without inventing app-level events.

`track-removed` is for *partial* departures — the peer is still connected, they just dropped a track. For the peer leaving entirely, listen on `peer-disconnect`.

## Synthetic streams

If a peer's tracks arrive without an associated `MediaStream` (rare, can happen with some SFU configurations), rtc.io creates a synthetic one and continues:

```
[rtc-io] ontrack: no associated stream, created synthetic { peer, trackKind, trackId }
```

The receive side still fires `track-added` and the stream still has a fresh id. Most apps don't notice this; it's a robustness fallback.

## Screen share

Screen share is just another stream:

```ts
const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
const screen = new RTCIOStream(display);
socket.emit("screenshare", { id: socket.id, name: userName, stream: screen });

// Stop:
display.getVideoTracks()[0].addEventListener("ended", () => {
  socket.untrackStream(screen);
  socket.emit("stopScreenShare", { id: socket.id });  // app-level
});
```

The two emits are intentional: `screenshare` is the stream announcement (replays to late joiners). `stopScreenShare` is just a regular ctrl-channel event so already-connected peers can remove the tile. `untrackStream` removes the stream from the replay registry so future joiners don't see it.

## Multiple streams

You can `emit` more than one stream — rtc.io tracks each by id. A typical layout:

```ts
socket.emit("camera", { id: socket.id, camera: cameraStream });
socket.emit("screenshare", { id: socket.id, stream: screenStream });
```

The receive side gets both via separate `on` handlers, and both replay to late joiners.

## Stats per stream

For diagnostics you can drill into per-peer connection stats:

```ts
const stats = await socket.getSessionStats(peerId);
// → { rtt, codecs, inboundRTP[], outboundRTP[], ... }
```

`outboundRTP[].kind` lets you see which media is going out and at what bitrate. See [Stats](stats) for a full tour.

## When the stream looks laggy

If you're seeing soft, low-frame-rate, or behind-real-time video — especially when sharing a game or video — it's almost always the browser's default capture and encode settings, not rtc.io. See **[Stream tuning · why high-motion looks laggy](stream-tuning)** for the four knobs (`frameRate` constraint, `contentHint`, encoder `maxBitrate`, audio DSP) that fix it.

## Live examples

### Two-tab video call

<StackBlitz
  files={minimalVideo}
  template="node"
  file="src/main.ts"
  title="Minimal video call"
  summary="Click 'Open 2nd tab ↗' inside the preview to see the call connect peer-to-peer."
/>

### Late-joiner replay in action

Click **Share screen** in tab #1 *first*, then hit **Open 2nd tab ↗**. The second tab sees the share land instantly — even though it joined after the share started — because `socket.emit('screen', stream)` registered the stream for replay.

<StackBlitz
  files={lateJoinerReplay}
  template="node"
  file="src/main.ts"
  title="Screen share that survives a late joiner"
  summary="emit() registers; untrackStream() de-registers; new peers receive the registry on connect."
/>
