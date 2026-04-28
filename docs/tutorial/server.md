---
id: server
title: 1. Set up the server
description: Use server.rtcio.dev or run your own. The minimal viable signaling server is 25 lines.
---

# 1. Set up the server

The signaling server's only job is to relay setup messages between two browsers so they can establish a peer connection. Once they're connected, it's out of the loop.

You have two choices:

## Option A: Use the public server

The fastest path. We host **[server.rtcio.dev](https://server.rtcio.dev)**, free, no setup. It runs the [Quickstart](/docs/server/quickstart) code with rooms, presence, and media-state echo. Use it for prototypes and learning.

If you go this route, **skip to the next step** ([Client →](client)). You don't need to install anything for the server.

```ts
const socket = io("https://server.rtcio.dev", {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});
```

When you're ready to ship, swap to Option B.

## Option B: Run your own

For real apps where you want auth, custom events, or to not depend on third-party infra:

```bash
mkdir my-rtcio-server && cd my-rtcio-server
npm init -y
npm pkg set type=module
npm install rtc.io-server
```

Create `index.js`:

```js title="index.js"
import { Server, RtcioEvents } from "rtc.io-server";

const server = new Server({
  cors: { origin: "*" },   // tighten this in production
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
server.listen(port);
console.log(`rtc.io-server listening on ${port}`);

// Cache the most recent media-state per socket so late joiners learn who's muted.
const lastMediaState = new Map();

server.on("connection", (socket) => {
  console.log("connected", socket.id);

  socket.on("join-room", ({ roomId, name }) => {
    socket.data.name = name;

    // Snapshot existing peers BEFORE joining so we don't include the newcomer.
    const existing = Array.from(server.sockets.adapter.rooms.get(roomId) ?? []);
    socket.join(roomId);

    // Backfill the newcomer with the existing roster + their last media state.
    existing.forEach((id) => {
      const peer = server.sockets.sockets.get(id);
      if (!peer) return;
      socket.emit("user-connected", { id, name: peer.data.name });
      const state = lastMediaState.get(id);
      if (state) {
        socket.emit("media-state", { id, roomId, mic: state.mic, cam: state.cam });
      }
    });

    // Tell every existing peer about the newcomer.
    socket.to(roomId).emit("user-connected", { id: socket.id, name });

    // Kick off the WebRTC handshake from the existing peers' side.
    socket.to(roomId).emit(RtcioEvents.INIT_OFFER, { source: socket.id });
  });

  socket.on("media-state", (data) => {
    if (!data?.roomId) return;
    if (typeof data.mic === "boolean" && typeof data.cam === "boolean") {
      lastMediaState.set(socket.id, { mic: data.mic, cam: data.cam });
    }
    socket.to(data.roomId).emit("media-state", data);
  });

  socket.on("disconnecting", () => {
    lastMediaState.delete(socket.id);
    socket.rooms.forEach((roomId) => {
      if (roomId === socket.id) return;
      socket.to(roomId).emit("user-disconnected", { id: socket.id });
    });
  });
});
```

Run it:

```bash
node --watch index.js
```

You should see:

```
rtc.io-server listening on 3001
```

That's the entire server. ~50 lines including comments.

## Sanity check

Make sure it's reachable. In another terminal:

```bash
curl -I "http://localhost:3001/socket.io/?EIO=4&transport=polling"
```

You should get a `200 OK` response (with a `Set-Cookie` for the session). If you get connection refused, the server isn't running on the port you think.

## What's next

Either way, your signaling server is ready:

- Public: `https://server.rtcio.dev`.
- Local: `http://localhost:3001`.

Pick whichever URL you'll use for the rest of the tutorial. From here on, snippets show `http://localhost:3001` — substitute as needed.

[Next: 2. Connect a client →](client)
