---
id: rooms
title: Rooms & presence
description: How socket.io rooms map to rtc.io call rooms — joining, leaving, presence broadcasts, late-joiner backfill, and the #rtcio:init-offer kickoff.
---

# Rooms & presence

`rtc.io-server` doesn't ship a built-in room model — it inherits socket.io's. A "room" is just a label you attach to a socket via `socket.join(roomId)`; `socket.to(roomId).emit(...)` then reaches every socket with that label.

This is enough to support full video calls. Here's the full pattern.

## Joining a room

The client emits a `join-room` event:

```ts
// client
socket.server.emit("join-room", { roomId: "stand-up", name: "alice" });
```

The server handles it:

```ts
// server
socket.on("join-room", ({ roomId, name }) => {
  socket.data.name = name;

  // Snapshot existing peers BEFORE joining so we don't include the newcomer.
  const existing = Array.from(server.sockets.adapter.rooms.get(roomId) ?? []);
  socket.join(roomId);

  // Backfill the newcomer with the existing roster.
  existing.forEach((id) => {
    const peer = server.sockets.sockets.get(id);
    if (peer) socket.emit("user-connected", { id, name: peer.data.name });
  });

  // Tell every existing peer about the newcomer.
  socket.to(roomId).emit("user-connected", { id: socket.id, name });

  // Kick off the WebRTC handshake from the existing peers' side.
  socket.to(roomId).emit(RtcioEvents.INIT_OFFER, { source: socket.id });
});
```

Three audiences:

| Audience | Event | Purpose |
|---|---|---|
| The newcomer (themself) | `user-connected` × N | Backfill — tell them who's already here |
| Existing peers | `user-connected` | "Someone joined" |
| Existing peers | `#rtcio:init-offer` | Start the WebRTC handshake toward the newcomer |

Snapshotting `existing` *before* `socket.join` is important. If you `join` first, the newcomer is already in the room and would get a self-broadcast and a self-init-offer — both bugs.

## Leaving a room

Two cases: explicit leave, and disconnect (tab close, network drop).

### Explicit leave

```ts
// client
socket.server.emit("leave-room", { roomId, id: socket.id });

// server
socket.on("leave-room", ({ roomId }) => {
  socket.leave(roomId);
  socket.to(roomId).emit("user-disconnected", { id: socket.id });
});
```

This is purely presence — you tell other peers in the room that you're leaving so they can update their UI. The peer connections themselves don't tear down here; they tear down when you actually disconnect (or when you call `peer.close()` on the client).

### Implicit disconnect

```ts
socket.on("disconnecting", () => {
  socket.rooms.forEach((roomId) => {
    if (roomId === socket.id) return;   // socket.io's default self-room
    socket.to(roomId).emit("user-disconnected", { id: socket.id });
  });
});
```

`disconnecting` fires *before* the rooms are flushed (so `socket.rooms` is still populated). `disconnect` fires after, when `socket.rooms` is empty — too late.

`socket.rooms` always contains `socket.id` itself (socket.io's default per-socket room). Skip that one.

## Why the existing peers initiate

The library's [perfect negotiation](/docs/guides/perfect-negotiation) pattern needs one polite and one impolite side per pair. The convention rtc.io uses: **the existing peer is polite (initiates)**, the newcomer is impolite (waits).

`#rtcio:init-offer` is what makes that asymmetric. When existing peer A receives `init-offer { source: B }`, A creates a peer connection and starts an offer to B. B receives the offer and responds.

If you flip this — newcomer initiates, existing receives — it works too in principle, but you'd lose the existing peer's stream replay (the polite path replays streams to the new peer; the impolite path defers replay until after the initial offer/answer). Stick with the convention.

## Multi-room sockets

A socket can be in multiple rooms simultaneously. socket.io supports it natively. rtc.io doesn't have an opinion — the library tracks peer connections per remote socket id, regardless of which room context produced them.

If you implement nested rooms or sub-channels (e.g. "main" + "breakout-A"), you'd typically open separate `RTCPeerConnection`s per room. That doesn't fit rtc.io's "one connection per peer pair" model — you'd want to multiplex multiple logical rooms over a single peer connection using broadcast channels with room-prefixed names instead:

```ts
const main = socket.createChannel("room:main", { ordered: true });
const breakoutA = socket.createChannel("room:breakout-A", { ordered: true });
```

Channel names are deterministic, so peers in the same logical room have the same hash id and pair up.

## Late joiners

When peer C joins a room that already has A and B in it:

1. Server fans `user-connected` and `#rtcio:init-offer` to A and B.
2. A and B both create peer connections to C (independently — they each get the init-offer).
3. C ends up with peer connections to both.

The mesh fills out. Your client doesn't have to do anything special; the library handles it.

If A had previously `socket.emit("camera", stream)`, that stream is in A's replay registry. When A creates the peer connection to C, the replay registry is iterated and C gets the camera too. Same for B's streams.

## Presence guarantees (and gotchas)

- `user-connected` and `user-disconnected` are **at-most-once**. If the server crashes mid-emit, a peer might miss the event.
- `disconnecting` may not fire reliably on all platforms — mobile Safari sometimes kills the socket without firing. Add a periodic "ping" / heartbeat at the application level if you can't tolerate ghost-presence.
- `socket.id` changes across reconnections. If you want stable identity, mint your own user id on auth and use that in `socket.data.userId`.

## Per-room caches

If your app remembers room state (last media-state, who's the current speaker, etc.), keep it in a `Map<roomId, ...>` and clean up on `disconnecting`:

```ts
const lastMediaState = new Map<string, { mic: boolean; cam: boolean }>();

socket.on("media-state", (data) => {
  if (data.roomId) {
    lastMediaState.set(socket.id, { mic: data.mic, cam: data.cam });
    socket.to(data.roomId).emit("media-state", data);
  }
});

socket.on("disconnecting", () => {
  lastMediaState.delete(socket.id);
});
```

This is in-memory; if you scale to multiple processes the cache is per-process. See [Scaling](scaling) for the patterns.

## Rate limits and abuse

A misbehaving client can flood `join-room` or `media-state`. Wrap your handlers with a per-socket rate limiter:

```ts
import rateLimit from "p-throttle";
const throttle = rateLimit({ limit: 50, interval: 1000 });

server.on("connection", (socket) => {
  socket.use((event, next) => throttle(() => next()));
  // ...
});
```

50 events/sec/socket is fine for normal usage and would slow a flood.
