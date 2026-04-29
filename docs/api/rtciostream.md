---
id: rtciostream
title: RTCIOStream
description: A typed wrapper around MediaStream — emit it, receive it, swap tracks, listen to track changes.
---

import StackBlitz from '@site/src/components/StackBlitz';
import { minimalVideo, lateJoinerReplay } from '@site/src/examples';

# RTCIOStream

```ts
import { RTCIOStream } from "rtc.io";

const stream = new RTCIOStream(mediaStream);
// or
const stream = new RTCIOStream(stableId, mediaStream);
```

`RTCIOStream` is a thin wrapper around a `MediaStream` that gives the library a stable identity to track per-stream. Both peers see the same `id` after the first replay, so you can correlate streams to people across the connection.

## Constructor

```ts
new RTCIOStream(mediaStream: MediaStream)
new RTCIOStream(id: string, mediaStream: MediaStream)
```

The single-arg form auto-generates a UUID for the id. The two-arg form lets you provide a stable identifier (useful if you want a stream's identity to survive page reload).

```ts
const camera = new RTCIOStream(localMedia);
console.log(camera.id);   // "550e8400-e29b-41d4-a716-446655440000"

const stable = new RTCIOStream("alice-camera", localMedia);
console.log(stable.id);   // "alice-camera"
```

## Properties

### `id: string`

The stream's identity on the wire. After the first send, the receiver's local `RTCIOStream` adopts the sender's id (so both sides agree).

```ts
camera.id;            // sender side: locally-generated UUID
remoteCamera.id;      // receiver side: same UUID after the first track lands
```

### `mediaStream: MediaStream`

The underlying browser `MediaStream`. Use it for `<video>.srcObject`, `getTracks()`, anything you'd do with a normal `MediaStream`.

```ts
videoEl.srcObject = camera.mediaStream;
camera.mediaStream.getAudioTracks()[0].enabled = false;   // mute
```

## Methods

### `addTrack(track) / removeTrack(track)`

Pass-throughs to the underlying `MediaStream`. The wrapper listens to the `MediaStream`'s `addtrack`/`removetrack` events, so calling these *will* trigger `onTrackChanged` callbacks (which the library uses internally to keep transceivers in sync).

```ts
const newAudio = (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks()[0];
camera.removeTrack(camera.mediaStream.getAudioTracks()[0]);
camera.addTrack(newAudio);
// onTrackChanged fires; rtc.io reuses the existing audio transceiver via replaceTrack.
```

### `replace(stream)`

Replace all tracks with the tracks from `stream`. Removes existing ones, adds the new ones. Each removal/addition triggers the `onTrackChanged` callbacks.

```ts
const fresh = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
camera.replace(fresh);
```

### `onTrackChanged(callback)`

```ts
onTrackChanged(callback: (stream: MediaStream) => void): () => void
```

Register a callback that fires whenever a track is added to or removed from the underlying `MediaStream`. Returns an unsubscribe function.

This is what the library uses internally to react to track swaps and call `replaceTrack` on the existing `RTCRtpSender`. You can use it from app code if you want to react to track changes (e.g. update a "camera is on" indicator):

```ts
const off = camera.onTrackChanged((stream) => {
  const hasVideo = stream.getVideoTracks().length > 0;
  setCameraOn(hasVideo);
});

// Later:
off();
```

### `onTrackAdded(callback)` / `onTrackRemoved(callback)`

```ts
onTrackAdded(callback: (track: MediaStreamTrack) => void): () => void
onTrackRemoved(callback: (track: MediaStreamTrack) => void): () => void
```

Per-track variants of `onTrackChanged`. They fire when the **platform** mutates the stream (e.g. the WebRTC stack delivers a new remote track, or drops one when the remote stops sending) and hand you the specific `MediaStreamTrack` involved. Programmatic `addTrack` / `removeTrack` on a local copy does not fire these — for the user-driven case, use `onTrackChanged`.

Each returns an unsubscribe function. Callbacks are also cleared on `dispose()`, so internal listeners cannot outlive the wrapper.

```ts
const off = remoteStream.onTrackRemoved((track) => {
  console.log("remote dropped a", track.kind, "track");
});
```

These are the primitives behind the receive-side [`track-added`](events#track-added) and [`track-removed`](events#track-removed) events; you usually want those instead unless you're holding a stream wrapper directly.

### `toJSON()`

Returns the wire-format string `"[RTCIOStream] <id>"`. The library uses this when serializing stream metadata. Receivers detect this string in incoming JSON and substitute back the local `RTCIOStream` instance.

You'd normally not call this yourself.

## Sending an RTCIOStream

`socket.emit` with an `RTCIOStream` (or any object containing one) routes through transceivers, not the ctrl channel:

```ts
socket.emit("camera", new RTCIOStream(localMedia));
socket.emit("camera", { id: socket.id, name: "alice", camera: new RTCIOStream(localMedia) });
socket.emit("screen", new RTCIOStream(displayMedia));
```

The library deep-walks args looking for any `RTCIOStream` instance. If found:

1. The stream is added to the replay registry (so late joiners get it).
2. For every connected peer, `addTransceiver` is called for each track.
3. The browser fires `onnegotiationneeded`; rtc.io creates a fresh offer.

Per-peer emit is also supported for sending a stream to one specific peer:

```ts
socket.peer(targetId).emit("private-cam", new RTCIOStream(localMedia));
```

This skips the replay registry — only that peer gets it, and late joiners don't.

## Receiving an RTCIOStream

The receive side handler shape mirrors the emit:

```ts
socket.on("camera", (cam) => {
  // cam is an RTCIOStream
  videoEl.srcObject = cam.mediaStream;
});

socket.on("camera", ({ id, name, camera }) => {
  // structured arg shape mirrors what was emitted
  videoEl.srcObject = camera.mediaStream;
  label.textContent = name;
});
```

The wrapper you receive is a fresh `RTCIOStream` constructed by the library, with the same `id` as the sender's instance. You can call `onTrackChanged` on it to react to track changes (e.g. peer turned camera on after starting with audio only — fires the [`track-added`](events) event too).

## Lifecycle

The library auto-replays registered streams to new peers — so once you `emit`, the stream is "live" for the rest of the session. To stop replaying (e.g. user stopped sharing screen), call:

```ts
socket.untrackStream(myStream);
```

This drops it from the registry. Already-connected peers still have the transceivers; you'll need to either `stop()` the underlying tracks or `replaceTrack(null)` if you want media to actually stop flowing. See [Streams](/docs/guides/streams) for the full pattern.

### `dispose()`

```ts
dispose(): void
```

Detaches the wrapper's platform-event listeners and clears all registered `onTrackChanged` / `onTrackAdded` / `onTrackRemoved` callbacks. Use it when you're done with the wrapper but the underlying `MediaStream` lives on — e.g. you handed it to a `<video>` element and the wrapper would otherwise pin closures referencing the (now-dead) peer.

The library calls this for you on every inbound stream when its peer disconnects, so you almost never need to call it yourself.

## Common pitfalls

- **Don't pass the raw `MediaStream` to `socket.emit`.** It looks like it would work but the library only detects `RTCIOStream` instances. Wrap with `new RTCIOStream(media)`.
- **Don't construct a new wrapper on every render.** Identity matters — re-emitting a fresh wrapper would create a new id and start a fresh stream registration. Hold onto one wrapper for the lifetime of the underlying media.
- **Track changes vs replace.** `replaceTrack` (track-level) doesn't fire `addtrack`/`removetrack` on the `MediaStream` — only `addTrack`/`removeTrack` (stream-level) do. The library uses the latter for its callback wiring, so swap tracks via `removeTrack` + `addTrack` if you want `onTrackChanged` to fire.

## Live examples

### Minimal: `socket.emit('camera', new RTCIOStream(local))`

<StackBlitz
  files={minimalVideo}
  template="node"
  file="src/main.ts"
  title="Minimal video"
  summary="Click 'Open 2nd tab ↗' inside the preview to bring a peer online."
/>

### Late-joiner replay + `untrackStream`

The library keeps a registry of every `RTCIOStream` you `emit` and replays them to peers that join later. Calling `socket.untrackStream(s)` drops the entry — the stream stops being replayed to brand-new peers, but already-connected peers are unaffected.

<StackBlitz
  files={lateJoinerReplay}
  template="node"
  file="src/main.ts"
  title="Screen share that survives a late joiner"
  summary="Click 'Share screen' in tab #1, THEN open tab #2 — the share lands instantly because emit() registers the stream for replay."
/>
