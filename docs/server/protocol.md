---
id: protocol
title: Signaling protocol
description: The exact wire format between rtc.io clients and server — #rtcio:message envelope, #rtcio:init-offer, what each payload variant means.
---

# Signaling protocol

The wire format between a `rtc.io` client and a `rtc.io-server` is a tiny set of socket.io events. If you're writing a custom server, or debugging, or porting the protocol, this is the spec.

## Event names

```ts
RtcioEvents.MESSAGE     = "#rtcio:message"
RtcioEvents.INIT_OFFER  = "#rtcio:init-offer"
RtcioEvents.PEER_LEFT   = "#rtcio:peer-left"

// Reserved for future use, currently unemitted:
RtcioEvents.OFFER       = "#rtcio:offer"
RtcioEvents.ANSWER      = "#rtcio:answer"
RtcioEvents.CANDIDATE   = "#rtcio:candidate"
RtcioEvents.STREAM_META = "#rtcio:stream-meta"
```

`#rtcio:message`, `#rtcio:init-offer` and `#rtcio:peer-left` are the three events in the active wire protocol. The others are reserved so future protocol changes can use them without name collisions on apps that listen for them.

## Envelope shape

Every signaling exchange uses one envelope:

```ts
type MessagePayload<T> = {
  source: string;   // socket.id of the sender
  target: string;   // socket.id of the recipient
  data: T;
};
```

The relay handler on the server is exactly:

```ts
socket.on("#rtcio:message", (p) => {
  socket.to(p.target).emit("#rtcio:message", p);
});
```

That's it. Server doesn't inspect `data`. The client multiplexes four payload variants into it.

## Payload variants

The `data` field is one of these four shapes (mutually exclusive — exactly one is set):

### 1. Description (offer / answer)

```ts
{ description: RTCSessionDescriptionInit }
```

The full SDP offer or answer:

```json
{
  "source": "socket-A",
  "target": "socket-B",
  "data": {
    "description": { "type": "offer", "sdp": "v=0\r\no=- ..." }
  }
}
```

### 2. ICE candidate

```ts
{ candidate: RTCIceCandidateInit }
```

A trickled ICE candidate:

```json
{
  "source": "socket-A",
  "target": "socket-B",
  "data": {
    "candidate": {
      "candidate": "candidate:434387814 1 udp 2122260223 192.168.1.115 42780 typ host",
      "sdpMid": "0",
      "sdpMLineIndex": 0,
      "usernameFragment": "kOfu"
    }
  }
}
```

End-of-candidates is signaled by an empty candidate; the server forwards it like any other.

### 3. Stream metadata response

```ts
{ mid: string; events: Record<string, any> }
```

When a peer receives an `ontrack`, it sends a `{ mid }` request to learn the stream's identity and any registered events. The owner replies with a `{ mid, events }` payload:

```json
{
  "source": "socket-A",
  "target": "socket-B",
  "data": {
    "mid": "abc-stream-id",
    "events": {
      "camera": [{ "id": "socket-A", "name": "alice", "camera": "[RTCIOStream] abc-stream-id" }]
    }
  }
}
```

Used so receivers can correlate tracks back to the original `RTCIOStream` and fire your `socket.on('camera', ...)` handlers with the right object shape.

### 4. Stream metadata request

```ts
{ mid: string }
```

The "what stream is this" probe sent by a receiver:

```json
{
  "source": "socket-B",
  "target": "socket-A",
  "data": { "mid": "abc-stream-id" }
}
```

The owner responds with variant 3 above. If the owner doesn't have any events registered for that stream yet, the request is silently ignored — the next `socket.emit` for that stream will push the metadata via the replay flow.

## #rtcio:peer-left

Fast-path notification from the server to the rooms a leaving socket was in:

```json
{ "id": "socket-id-of-the-departed" }
```

Emit it from a `disconnecting` handler so the socket is still listed in `socket.rooms`:

```ts
socket.on("disconnecting", () => {
  socket.rooms.forEach((roomId) => {
    if (roomId === socket.id) return;
    socket.to(roomId).emit(RtcioEvents.PEER_LEFT, { id: socket.id });
  });
});
```

`rtc.io-server`'s `addDefaultListeners` does this for you. You only need to wire it manually if you're writing a custom signaling server (or extending one that doesn't use `addDefaultListeners`).

The receiving client treats this as a **hint**, not authority. It cross-checks against the WebRTC `connectionState` for the matching peer:

- If the WebRTC layer also reports trouble (`disconnected`/`failed`), both signals corroborate and the client tears down the peer immediately.
- If the WebRTC layer still reports `connected`, the hint is recorded but ignored. This protects working P2P calls when the signaling channel drops independently — server crash, mobile data → wifi switch, signaling-only firewall change. If the connection later goes unhealthy within ~30 s, the watchdog uses a shortened grace window because both signals now agree.

This means a custom server is free to omit `#rtcio:peer-left`: the client's WebRTC-level liveness watchdog will still detect departed peers, just slower (~12 s vs ~2.5 s once the connection goes unhealthy). Wiring the hint is purely an optimisation.

## #rtcio:init-offer

The connection-kickoff event. Server emits it to existing peers in a room when a new peer joins:

```json
{ "source": "socket-newcomer" }
```

The receiving (existing) peer is the **polite** side. It creates an `RTCPeerConnection` toward `source`, replays any local streams onto it, and starts the offer.

Server-side emission is your code:

```ts
socket.to(roomId).emit(RtcioEvents.INIT_OFFER, { source: socket.id });
```

The library has the receive side wired automatically.

## Sequence: A and B join a room

Time flows top to bottom. `S` is the server, `A` is the existing peer, `B` is the newcomer.

```
B → S         join-room { roomId, name }
S → A         user-connected { id: B, name }
S → A         #rtcio:init-offer { source: B }

A             createPeerConnection(B), polite
A → S         #rtcio:message { source: A, target: B, data: { description: offer } }
S → B         #rtcio:message { source: A, target: B, data: { description: offer } }

B             createPeerConnection(A), impolite (not polite)
B → S         #rtcio:message { source: B, target: A, data: { description: answer } }
S → A         #rtcio:message { source: B, target: A, data: { description: answer } }

(both sides trickle ICE candidates in parallel)
A → S         #rtcio:message { source: A, target: B, data: { candidate: ... } }
S → B         #rtcio:message { source: A, target: B, data: { candidate: ... } }
B → S         #rtcio:message { source: B, target: A, data: { candidate: ... } }
S → A         #rtcio:message { source: B, target: A, data: { candidate: ... } }

(once SCTP is up, ctrl DataChannel opens on both sides — peer-connect fires)
```

5–8 message round trips and the peer connection is up. After that, no more `#rtcio:message` (unless a track changes and triggers a renegotiation).

## Renegotiation

When `onnegotiationneeded` fires (e.g. you `addTransceiver` for a screen share), the same envelope flow runs again — fresh offer, fresh answer, new candidates. The library coalesces back-to-back negotiations so you don't get a separate round per microtask.

## Backward compatibility

The 1.x line uses this single-envelope multiplex. Older 0.x clients sent `#rtcio:offer` / `#rtcio:answer` / `#rtcio:candidate` separately. **They're not wire-compatible** — pin matching majors:

```bash
npm install rtc.io@^1.1.0 rtc.io-server@^1.1.0
```

If you need to support a custom signaling server (e.g. one that doesn't speak socket.io), the relay logic is short enough to translate to any pub/sub. Just preserve `{ source, target, data }` and the four `data` variants.

## Why a single envelope

The original design had separate events per variant (offer/answer/candidate/stream-meta). The unified envelope is:

- **Easier to relay.** One handler on the server forwards all signaling traffic. No conditional dispatching.
- **Easier to log.** One event name to grep for.
- **Easier to extend.** New `data` variants don't require new event names; existing servers forward them transparently. (If you add a *new* event name you'd have to update the server's handler list.)

The trade-off is that you can't split signaling onto separate sockets or namespaces by event type. We've never wanted to.
