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

## How rtc.io decides a peer is gone

A peer can disappear for many reasons — clean leave, tab close, OS sleep, NAT timeout, route change. rtc.io's job is to detect each of those without false-positives that kill working calls. There are two signals that feed the disconnect path:

1. **WebRTC liveness** (authoritative). When `connectionState` becomes `disconnected` or `failed`, a per-peer **watchdog** is armed. If the connection hasn't returned to `connected` within a bounded grace window (~12 s by default), the peer is force-closed and `peer-disconnect` fires. This catches every form of departure that a browser can detect — abrupt tab close, OS suspend, route loss — independent of the signaling channel.

2. **Server peer-left hint** (advisory). The signaling server emits `#rtcio:peer-left` to a leaving socket's rooms (the `rtc.io-server` does this for you in `addDefaultListeners`; you don't need to implement it). The library treats this as a *hint*, not an order. If the WebRTC layer also reports trouble, both signals agree and cleanup runs immediately. If the WebRTC layer says the peer is still connected, the hint is recorded but **does not** tear the peer down — your call survives a signaling-only outage (server crash, mobile data → wifi, signaling firewall change) without dropping P2P.

   When a hint exists and the WebRTC layer later goes unhealthy, the watchdog uses a much shorter grace window (~2.5 s) — both signals corroborate that the peer is gone, so there's no point waiting through the longer window meant for transient ICE blips.

The combined effect: tab-close detection in roughly 5–10 s end-to-end (browser-detected ICE drop + shortened watchdog), with no risk of tearing down a healthy P2P call when only signaling has dropped.

The 12 s and 2.5 s windows are defaults — tune them per socket via [`watchdog`](/docs/api/options#watchdog) (`timeout`, `hintTimeout`, `hintTTL`, all in milliseconds) if your network warrants longer NAT-rebind tolerance or you want faster cleanup.

```
       ┌─────────────────────┐
       │ connectionState =   │
       │ 'disconnected'      ├────────► arm 12 s watchdog
       │ or 'failed'         │
       └─────────┬───────────┘
                 │
                 │      hint received within
                 │      30 s of state change?
                 │
                 ▼
       ┌─────────────────────┐
       │ shorten watchdog    │
       │ to 2.5 s            │
       └─────────────────────┘

       ┌─────────────────────┐
       │ #rtcio:peer-left    │
       │ from server         │
       └─────────┬───────────┘
                 │
        WebRTC state currently...
                 │
        ┌────────┴────────┐
        │                 │
   unhealthy            healthy
        │                 │
   cleanup now      record hint;
                    do NOT teardown
                    (call stays alive)
```

You can lean on `peer-disconnect` as the single contract: it fires exactly when the library has decided the peer is gone for good. You don't need to listen to `user-disconnected` at the application layer for cleanup logic, though it remains available on `socket.server` for application-level concerns like presence rosters.

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
| `track-removed` | A track is dropped from an existing remote `MediaStream` (e.g. peer ended a screen share) |

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

### Signaling reconnect

socket.io-client auto-reconnects by default (`reconnection: true`, infinite retries, exponential backoff) and **buffers** outgoing `emit` calls during the gap. So most signaling traffic — offers, answers, ICE candidates emitted during the outage — lands cleanly when the socket comes back. The library adds a few things on top:

- **Existing P2P connections are not torn down on signaling drop.** They run over STUN/TURN, not the signaling server. A signaling outage does not kill an in-progress call.
- **The watchdog stays authoritative.** A signaling-only outage cannot trigger `peer-disconnect` — only the WebRTC liveness state can. (See [How rtc.io decides a peer is gone](#how-rtcio-decides-a-peer-is-gone) above.)
- **Stuck peers are nudged on reconnect.** Every `connect` event after the first walks the peer table; for any peer currently in `disconnected` or `failed`, the library calls `restartIce()`. The recovery offer rides the freshly-restored signaling channel instead of a stale one from before the drop.
- **Peer-left hints across the gap still cross-check WebRTC.** If a `#rtcio:peer-left` arrives buffered after a long outage, it's still treated as advisory — recorded if the WebRTC layer disagrees, applied immediately if both signals agree.

What you typically still want to handle in app code:

```ts
// Re-join the room on every connect (initial + reconnect). socket.io
// reconnect re-establishes the transport but does not replay your join.
socket.on("connect", () => {
  socket.server.emit("join-room", { roomId, name });
});
```

For production deployments where reconnect churn matters, enable [`connectionStateRecovery`](https://socket.io/docs/v4/connection-state-recovery) on the server. That preserves `socket.id` across short drops, so existing peers keep finding you by the same id without needing the watchdog to reap a stale entry.

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
