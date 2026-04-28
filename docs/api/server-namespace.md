---
id: server-namespace
title: socket.server
description: The escape hatch — emit and on directly on the underlying socket.io connection, bypassing all DataChannel routing.
---

# socket.server

```ts
socket.server: {
  emit(event: string, ...args: any[]): this;
  on(event: string, handler: (...args) => void): this;
  off(event: string, handler: (...args) => void): this;
}
```

`socket.server` is rtc.io's escape hatch. Anything you emit here goes straight through socket.io to the signaling server — same as if you'd written plain `socket.io-client` code. Anything you listen to here fires for events the server pushes back.

This is the right surface for:

- **Room/lobby management** — `join-room`, `leave-room`, presence broadcasts the server fans out.
- **Auth handshakes** that need server validation.
- **ICE-credential vending** (`ask-ice` → server returns short-lived TURN creds).
- **App-level events that should funnel through your server**, not peer-to-peer.

It is **not** the right surface for:

- Chat, RPC, app data — use `socket.emit` (peer-to-peer ctrl channel) or a custom channel.
- Streams — use `socket.emit('camera', stream)` so the library wires up transceivers.

## Why the escape hatch exists

`socket.emit` is overridden in rtc.io's `Socket` to route over DataChannels by default. For application events that *should* go through the server, you need a way to reach the underlying socket.io emitter without rtc.io's DataChannel routing. That's `socket.server`.

Internally it's just bound copies of the parent class's `emit`/`on`/`off`:

```ts title="rtc.ts (excerpt)"
this._rawEmit = (ev, ...args) => super.emit(ev, ...args);
this._rawOn = (ev, h) => super.on(ev as any, h);
this._rawOff = (ev, h) => super.off(ev as any, h);

get server() {
  return {
    emit: (ev, ...args) => { this._rawEmit(ev, ...args); return this; },
    on: (ev, h) => { this._rawOn(ev, h); return this; },
    off: (ev, h) => { this._rawOff(ev, h); return this; },
  };
}
```

So `socket.server.emit("join-room", ...)` is `super.emit("join-room", ...)` — vanilla socket.io.

## Usage examples

### join-room

```ts
// Client
socket.server.emit("join-room", { roomId: "stand-up", name: "alice" });
socket.server.on("user-connected", ({ id, name }) => roster.add(id, name));
socket.server.on("user-disconnected", ({ id }) => roster.remove(id));

// Server
socket.on("join-room", ({ roomId, name }) => {
  socket.data.name = name;
  socket.join(roomId);
  // Tell every existing peer in the room to initiate an offer to the new one.
  socket.to(roomId).emit("user-connected", { id: socket.id, name });
  socket.to(roomId).emit("#rtcio:init-offer", { source: socket.id });
});
```

`#rtcio:init-offer` is also emitted on `server.on(...)`, but you generally don't need to listen for it — rtc.io's internal listener handles it.

### Authentication

Pass a token in the `auth` payload (socket.io standard); validate server-side before letting the connection proceed:

```ts
// Client
const socket = io(URL, {
  iceServers: [...],
  auth: { token: jwt },
});

// Server
io.use((socket, next) => {
  const ok = verifyJwt(socket.handshake.auth.token);
  if (!ok) return next(new Error("unauthorized"));
  socket.data.userId = ok.sub;
  next();
});
```

The middleware runs before `connect` fires. Failed auth shows up on the client as `connect_error`.

### Server-mediated events

If you want a "report this user" feature, the server is the right place to log it (the user shouldn't trust other peers to do it):

```ts
// Client
socket.server.emit("report", { peerId, reason });

// Server
socket.on("report", async ({ peerId, reason }) => {
  await db.reports.insert({ from: socket.data.userId, target: peerId, reason });
});
```

### ICE credential vending

Don't put long-lived TURN credentials in the client bundle. Mint them on demand:

```ts
// Server
import crypto from "node:crypto";

socket.on("ask-ice", (cb) => {
  const ttl = 600;  // 10 min
  const username = String(Math.floor(Date.now() / 1000) + ttl);
  const credential = crypto.createHmac("sha1", TURN_SECRET).update(username).digest("base64");
  cb({
    iceServers: [
      { urls: "stun:turn.example.com:3478" },
      { urls: "turn:turn.example.com:3478", username, credential },
    ],
  });
});

// Client
const { iceServers } = await new Promise((res) =>
  socket.server.emit("ask-ice", res)
);
const socket = io(URL, { iceServers });
```

Note that the ack callback (the second argument to `socket.server.emit`) **does** work here — `socket.server` is plain socket.io, which supports acks.

## What goes through `socket.server`

Anything your app explicitly opts into. The server has no default handlers from rtc.io's side — you wire up exactly the events you want. The library only auto-handles `#rtcio:message` and `#rtcio:init-offer`; everything else is your code.

If you don't need application-level routing through the server, don't write any. The peer-to-peer DataChannel covers most use cases.
