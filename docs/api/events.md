---
id: events
title: Reserved events
description: peer-connect, peer-disconnect, track-added, track-removed, plus the #rtcio:* internal namespace — what they mean and how to use them.
---

# Reserved events

A handful of event names have library-defined semantics. Peers can't spoof them — the ctrl-channel `onmessage` filter drops them on receive.

| Event | Where it fires | Args | Purpose |
|---|---|---|---|
| `peer-connect` | `socket.on(...)` | `({ id })` | Ctrl DataChannel to a peer opened |
| `peer-disconnect` | `socket.on(...)` | `({ id })` | Peer connection closed (only after peer-connect fired) |
| `track-added` | `socket.on(...)` | `({ peerId, stream, track })` | A new track joined an existing remote `MediaStream` |
| `track-removed` | `socket.on(...)` | `({ peerId, stream, track })` | A track was dropped from an existing remote `MediaStream` |
| `peer-left` | `RTCIOBroadcastChannel.on(...)` | `(peerId)` | One peer's per-channel underlying connection closed |
| `open` / `close` / `error` / `drain` / `data` | `RTCIOChannel.on(...)` | varies | Channel-level events |
| `#rtcio:*` | internal only | varies | Library signaling — never use |

This page covers the user-visible ones (the first five). Internal `#rtcio:*` events are documented in the [signaling protocol](/docs/server/protocol).

## peer-connect

```ts
socket.on("peer-connect", ({ id }: { id: string }) => {
  // Peer is ready for traffic.
});
```

Fires when the ctrl DataChannel to a peer opens. That's the practical "peer is reachable" signal — see [Lifecycle events](/docs/guides/lifecycle) for the full flow.

Use it for:

- Sending initial state to the new peer (`socket.peer(id).emit("media-state", ...)`).
- Opening per-peer DataChannels that need symmetric creation on both sides (`socket.peer(id).createChannel("file", ...)`).
- Acquiring per-peer resources (UI tile, stats poller, transfer slot).

## peer-disconnect

```ts
socket.on("peer-disconnect", ({ id }: { id: string }) => {
  // Peer connection is gone for good.
});
```

Fires when the peer connection closes — but **only if `peer-connect` already fired**. If a connection failed during the initial handshake (ICE never reached `connected`), no phantom `peer-disconnect` is emitted.

This pairing makes acquire/release patterns safe: every `peer-disconnect` you see has a matching `peer-connect`.

ICE restarts (transient network failures) do NOT fire `peer-disconnect`. The library calls `restartIce()` automatically and the connection self-heals. Only permanent close (manual disconnect, ICE failure with no recovery, tab close) triggers it.

## track-added

```ts
socket.on("track-added", ({ peerId, stream, track }: {
  peerId: string,
  stream: MediaStream,
  track: MediaStreamTrack,
}) => {
  // A new kind of track arrived on an existing remote stream.
});
```

Fires when a track is added to an *existing* remote `MediaStream` after the initial `ontrack` has already happened. Useful for "they turned the camera on" UI changes after a peer started with audio only.

```ts
socket.on("track-added", ({ peerId, stream, track }) => {
  if (track.kind === "video") {
    showVideoTile(peerId, stream);
  }
});
```

The library wires this up via `MediaStream.onaddtrack` on the receive side. The first track on a fresh stream is delivered via `socket.on("camera", ...)` (or whatever event the sender emitted with); only *subsequent* tracks fire `track-added`.

## track-removed

```ts
socket.on("track-removed", ({ peerId, stream, track }: {
  peerId: string,
  stream: MediaStream,
  track: MediaStreamTrack,
}) => {
  // The remote peer dropped a track from this stream.
});
```

Fires when the WebRTC stack removes a track from a remote `MediaStream` — for example, the remote peer stopped a screen share, switched their camera off via `removeTrack`, or ended a transceiver. The event always pairs with the same `stream` argument the receiver originally got via `socket.on("camera", ...)` (or whichever event the sender emitted with), so you can correlate it back to your tile.

```ts
socket.on("track-removed", ({ peerId, stream, track }) => {
  if (track.kind === "video" && stream.getVideoTracks().length === 0) {
    hideVideoTile(peerId);
  }
});
```

The library wires this up via `MediaStream.onremovetrack` — only *platform-driven* removals fire it. Your own `stream.removeTrack(...)` on a local copy does not.

`track-removed` is partial-departure detection (the peer is still there, they just dropped one track). For the peer leaving entirely, listen on [`peer-disconnect`](#peer-disconnect).

## Reserved namespace

Any event name starting with `#rtcio:` is reserved for library internals. The ctrl-channel filter drops these on receive, so peers can't spoof them.

The full list:

| Event | Direction | Carrier | Purpose |
|---|---|---|---|
| `#rtcio:init-offer` | server → client | socket.io | Tell an existing peer to initiate an offer to a newcomer |
| `#rtcio:message` | bidirectional via server | socket.io | Multiplexed envelope for offers, answers, candidates, stream-meta |
| `#rtcio:peer-left` | server → client | socket.io | Hint that a socket has disconnected; the client uses it to shorten its WebRTC liveness watchdog |
| `#rtcio:offer` | reserved | — | Reserved for future use |
| `#rtcio:answer` | reserved | — | Reserved for future use |
| `#rtcio:candidate` | reserved | — | Reserved for future use |
| `#rtcio:stream-meta` | reserved | — | Reserved for future use |

`#rtcio:init-offer`, `#rtcio:message` and `#rtcio:peer-left` are the three the library actually uses. The others exist as constants on `RtcioEvents` but aren't currently emitted; they're reserved so future protocol changes can use them without breaking apps that listen to those names.

## RtcioEvents constants

```ts
import { RtcioEvents } from "rtc.io";

RtcioEvents.OFFER;        // "#rtcio:offer"
RtcioEvents.ANSWER;       // "#rtcio:answer"
RtcioEvents.CANDIDATE;    // "#rtcio:candidate"
RtcioEvents.MESSAGE;      // "#rtcio:message"
RtcioEvents.STREAM_META;  // "#rtcio:stream-meta"
RtcioEvents.INIT_OFFER;   // "#rtcio:init-offer"
RtcioEvents.PEER_LEFT;    // "#rtcio:peer-left"
```

Use these in server code instead of typing the strings:

```ts
socket.to(roomId).emit(RtcioEvents.INIT_OFFER, { source: socket.id });
```

The same constants are exported from `rtc.io-server` for server-side use.

## Filter rationale

A peer that could spoof `peer-connect` could fire your acquire-on-connect handler for an arbitrary id, leaking resources. A peer that could spoof `track-added` or `track-removed` could fake track lifecycle events from someone who never shared one. The filter prevents all of them.

If you genuinely need to send a custom lifecycle event peer-to-peer, pick a non-reserved name (e.g. `app:peer-up`). Reserved names exist exactly because they're authoritative — only the local library is allowed to emit them.
