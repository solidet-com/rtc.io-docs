---
id: quickstart
title: Quickstart
description: A full-featured rtc.io signaling server with rooms, presence, media-state echo — the same code that powers server.rtcio.dev.
---

# Quickstart

This is the production-grade signaling server we use for [server.rtcio.dev](public-server). It supports:

- **Rooms** — `join-room` joins a socket.io room, broadcasts presence to existing peers, sends `#rtcio:init-offer` so they kick off the WebRTC handshake.
- **Presence** — `user-connected` / `user-disconnected`.
- **Media-state echo** — when a peer toggles mic/cam, broadcast it; remember the latest state so late joiners see who's muted.
- **Stop-share echo** — broadcast a `stopScreenShare` so peers can drop the share tile.

Roughly 30 lines. Pair it with the demo client to get a working video room.

## The code

```ts title="index.ts"
import { Server, RtcioEvents } from "rtc.io-server";

const server = new Server({
  cors: { origin: "*" },
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
server.listen(port);
console.log(`rtc.io-server listening on ${port}`);

// Cache the most recent media-state per socket so late joiners see who's
// muted. Cleared on disconnect.
const lastMediaState = new Map<string, { mic: boolean; cam: boolean }>();

server.on("connection", (socket) => {
  console.log("connected", socket.id);

  socket.on("join-room", ({ roomId, name }: { roomId: string; name: string }) => {
    console.log("join-room", name, roomId);
    socket.data.name = name;

    // Snapshot existing peers BEFORE joining the room.
    const existing = Array.from(server.sockets.adapter.rooms.get(roomId) ?? []);
    socket.join(roomId);

    // Backfill the new socket with each existing peer's identity + last media state.
    existing.forEach((id) => {
      const existingSocket = server.sockets.sockets.get(id);
      if (!existingSocket) return;
      socket.emit("user-connected", { id, name: existingSocket.data.name });
      const state = lastMediaState.get(id);
      if (state) {
        socket.emit("media-state", { id, roomId, mic: state.mic, cam: state.cam });
      }
    });

    // Tell every existing peer about the newcomer.
    socket.to(roomId).emit("user-connected", { id: socket.id, name });

    // And kick off the WebRTC handshake from the existing peers' side.
    socket.to(roomId).emit(RtcioEvents.INIT_OFFER, { source: socket.id });
  });

  socket.on("media-state", (data: { roomId: string; mic: boolean; cam: boolean; id: string }) => {
    if (!data?.roomId) return;
    if (typeof data.mic === "boolean" && typeof data.cam === "boolean") {
      lastMediaState.set(socket.id, { mic: data.mic, cam: data.cam });
    }
    socket.to(data.roomId).emit("media-state", data);
  });

  socket.on("stopScreenShare", (data: { roomId?: string }) => {
    if (data.roomId) socket.to(data.roomId).emit("stopScreenShare", data);
  });

  socket.on("disconnecting", () => {
    console.log("disconnecting", socket.id);
    lastMediaState.delete(socket.id);
    socket.rooms.forEach((roomId) => {
      if (roomId === socket.id) return;
      socket.to(roomId).emit("user-disconnected", { id: socket.id });
    });
  });
});
```

## Walkthrough

### Step 1 — Construct the Server

```ts
const server = new Server({ cors: { origin: "*" } });
```

`cors.origin: "*"` is fine for prototypes. In production set it to your domain(s):

```ts
cors: { origin: ["https://yourapp.com", "https://staging.yourapp.com"] }
```

The `Server` auto-registers the `#rtcio:message` relay handler on every connection. You don't write that handler yourself.

### Step 2 — Listen on a port

```ts
const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
server.listen(port);
```

Heroku, Fly, Render, and most PaaS platforms set `PORT` for you. Local dev defaults to 3001.

### Step 3 — Handle `join-room`

The new peer's socket sends `join-room` with `{ roomId, name }`. Your handler:

1. **Stashes the name** in `socket.data.name` so other handlers can read it. socket.io's `data` is a per-socket object that survives the connection.
2. **Snapshots existing peers** before joining. Otherwise, `socket.join(roomId)` would include the new socket itself, and we'd emit user-connected to ourselves.
3. **Joins the socket.io room**. From now on, `socket.to(roomId).emit(...)` reaches everyone in the room except this socket.
4. **Backfills the newcomer** with each existing peer's identity and last-known media state. The newcomer's UI shows the existing roster immediately.
5. **Fans out `user-connected` and `#rtcio:init-offer`** to every existing peer. The first is your application-level presence signal. The second is the rtc.io reserved event that tells existing peers to start an offer to the newcomer.

`#rtcio:init-offer`'s payload is just `{ source: socket.id }` — the rtc.io client uses this to know which socket id to address the WebRTC handshake to.

### Step 4 — Echo `media-state`

When a peer toggles their mic or camera, they emit `media-state` to the server, which broadcasts it to the rest of the room and caches the latest:

```ts
lastMediaState.set(socket.id, { mic, cam });
socket.to(data.roomId).emit("media-state", data);
```

The cache is so late joiners learn the current mute state without waiting for the next toggle. Cleared on `disconnecting`.

### Step 5 — Echo `stopScreenShare`

Plain pass-through. The client emits this when they stop sharing; we forward to peers so they can drop the tile.

### Step 6 — Handle disconnect

`socket.rooms` is a Set of every room the socket belongs to (including a default room equal to `socket.id`). We iterate them, skip the self-room, and emit `user-disconnected` to each.

`disconnecting` fires *before* the socket actually leaves its rooms (so `socket.rooms` is still populated). `disconnect` fires after, when `socket.rooms` is empty.

## Pair with a client

```ts title="client.ts"
import io, { RTCIOStream } from "rtc.io";

const socket = io("http://localhost:3001", {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

socket.server.emit("join-room", { roomId: "demo", name: "alice" });

socket.server.on("user-connected", ({ id, name }) => addPeerCard(id, name));
socket.server.on("user-disconnected", ({ id }) => removePeerCard(id));

const local = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
socket.emit("camera", new RTCIOStream(local));

socket.on("camera", (cam) => {
  document.querySelector("video.remote").srcObject = cam.mediaStream;
});

socket.on("media-state", ({ id, mic, cam }) => updateBadges(id, mic, cam));
```

That's a complete client/server pair. With this server running, two browser tabs in the same room get a live video call.

## What's next

- **[Customization](customization)** — auth, per-user room access, custom events.
- **[CORS](cors)** — locking down origins.
- **[Scaling](scaling)** — when one process isn't enough.
- **[Deployment](deployment)** — getting this onto a real host.
