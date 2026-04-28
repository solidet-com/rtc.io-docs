---
id: lifecycle
title: Lifecycle events
description: peer-connect, peer-disconnect, ICE state changes, connection state changes — what fires when, and how to use them safely.
---

# Lifecycle events

A peer connection in rtc.io has many possible states (signaling, ICE, DTLS, SCTP — each with its own machine). Most of the time you can ignore all of that and listen to two events: `peer-connect` and `peer-disconnect`. This page covers exactly when they fire and what to do with them.

## peer-connect

Fires once the **ctrl DataChannel** to a peer opens. That's the practical "this peer is ready for traffic" signal:

- The signaling round-trip is complete.
- ICE has produced a working pair.
- DTLS is up.
- SCTP is open.
- Your `socket.emit('event', ...)` will reach this peer.

```ts
socket.on("peer-connect", ({ id }) => {
  console.log("peer up:", id);
  // Push initial state to the new peer.
  socket.peer(id).emit("media-state", { mic: micOn, cam: camOn });
  // Open per-peer channels here so both sides do it symmetrically.
  const file = socket.peer(id).createChannel("file", { ordered: true });
});
```

`peer-connect` is the right hook for:

- Sending your current state to a freshly-connected peer (presence, mute status, position in a shared doc).
- Opening per-peer DataChannels (both sides should open them on `peer-connect` for the negotiated:true matching to work).
- Acquiring per-peer resources (a transfer slot, a UI tile, a stats poller).

It is **not** the right hook for opening broadcast channels — those should be opened once at startup so the `_channelDefs` registry covers late joiners.

## peer-disconnect

Fires when the peer connection is torn down — manual leave, ICE failure with no recovery, tab close, or a peer who simply stopped responding past the timeout.

```ts
socket.on("peer-disconnect", ({ id }) => {
  console.log("peer gone:", id);
  // Release per-peer resources, remove tile, etc.
});
```

Crucially: `peer-disconnect` only fires **if `peer-connect` fired first**. If a connection failed during the initial handshake (ICE never reached `connected`), you don't get a phantom disconnect for it. That keeps acquire-on-connect / release-on-disconnect patterns balanced — every release has a matching acquire.

## ICE restarts don't fire disconnect

If the network blips (Wi-Fi → cellular handoff, IP change), `iceConnectionState` will go through `disconnected` → `failed`. rtc.io watches for `failed` and calls `restartIce()` automatically. The application-level `peer-disconnect` event does **not** fire during a restart — your tile stays up, the chat keeps going, and once ICE re-establishes the connection resumes.

If the restart fails (genuinely permanent loss), the connection eventually transitions to `closed` and *then* `peer-disconnect` fires.

## The lower-level states

If you want finer-grained UI (e.g. a "reconnecting…" badge), poll the connection state directly. rtc.io stores each peer's `RTCPeerConnection` on the peer entry:

```ts
const peer = socket.getPeer(peerId);
console.log(peer.connection.connectionState);
// → "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed"

console.log(peer.connection.iceConnectionState);
// → "new" | "checking" | "connected" | "completed" | "failed" | "disconnected" | "closed"
```

You can attach your own listeners to these (rtc.io overwrites them — but the event still fires after rtc.io's handler runs):

```ts
const peer = socket.getPeer(peerId);
peer.connection.addEventListener("connectionstatechange", () => {
  if (peer.connection.connectionState === "disconnected") {
    showReconnectingBadge(peerId);
  }
});
```

## Reserved events

The library emits several lifecycle events. **Peers cannot spoof them** — the ctrl-channel handler filters them out:

| Event | Fires when |
|---|---|
| `peer-connect` | Ctrl DataChannel to a peer opens |
| `peer-disconnect` | Peer connection closes after `peer-connect` already fired |
| `track-added` | A new track joins an existing remote `MediaStream` (e.g. peer turned camera on after starting with audio only) |

Internal events (signaling, server escape hatch) are prefixed `#rtcio:` and are also filtered. See [Reserved events](/docs/api/events) for the complete list.

## socket.io-level lifecycle

`io()` returns a Socket that still does ordinary socket.io things. The `connect`/`disconnect`/`connect_error` events fire on the socket.io connection — they're independent of peer lifecycles:

```ts
socket.on("connect", () => console.log("signaling server reachable"));
socket.on("disconnect", () => console.log("signaling lost"));
socket.on("connect_error", (err) => console.error("signaling error:", err.message));
```

These tell you about the **signaling channel**, not your peer-to-peer connections. If signaling drops mid-call, your existing peer connections keep working — you just can't onboard new joiners until socket.io reconnects.

In the rtc.io demo we show this with a "Signaling server unreachable — existing peers stay connected over P2P" banner.

## Cleanup on tab close

Browsers don't reliably fire `disconnect` events when a tab closes. The standard pattern is to send a final `leave-room` over socket.io on `pagehide`/`beforeunload`, but those events have caveats too (only fired if not throttled).

```ts
window.addEventListener("pagehide", () => {
  socket.server.emit("leave-room", { roomId, id: socket.id });
  socket.disconnect();
});
```

The server side then echoes a `user-disconnected` to the room. Your remaining peers get notified within milliseconds rather than waiting for the socket.io heartbeat timeout (~25–45 s).

## Mounting/unmounting (React)

A common pitfall: if you call `socket.connect()` in `useEffect` and don't disconnect on cleanup, every navigation leaves a stale connection. Either:

- Connect once at app startup and keep the singleton (the common case).
- Or properly disconnect/cleanup on unmount.

In `rtcio-web` we connect at app startup and cleanly leave the room on unmount of the Call screen. The signaling socket itself stays open across screens to avoid reconnect churn.

## Quick reference

```
io()  →  signaling open                     ← socket "connect"
        |
        +─→  application "join-room"        ← your code
                |
                +─→  #rtcio:init-offer       ← server fans out
                          |
                          +─→ peer connection setup
                                  |
                                  +─→ ICE checks → DTLS → SCTP
                                          |
                                          +─→ ctrl channel "open"  ← peer-connect 🎉
                                                  |
                                                  +─→ traffic flows
                                                          |
                                                          +─→ teardown
                                                                  |
                                                                  +─→ "close"
                                                                          |
                                                                          +─→ peer-disconnect
```
