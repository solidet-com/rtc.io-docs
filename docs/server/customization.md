---
id: customization
title: Customization
description: Add auth, room access control, custom events, ICE-credential vending. The server is a relay; everything else is your code.
---

# Customization

`rtc.io-server` ships with one built-in handler (the `#rtcio:message` relay). Everything else — auth, room access control, custom application events, TURN credential vending — is your code.

This page collects the common patterns. They're all socket.io idioms; the server doesn't do anything magical.

## Authentication

Use `Server.use(...)` to add middleware that runs before `connect`:

```ts title="auth.ts"
import { Socket } from "rtc.io-server";
import jwt from "jsonwebtoken";

export function authMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("missing token"));

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    socket.data.userId = (payload as any).sub;
    socket.data.username = (payload as any).username;
    next();
  } catch (err) {
    next(new Error("invalid token"));
  }
}
```

```ts title="index.ts"
import { Server } from "rtc.io-server";
import { authMiddleware } from "./auth";

const server = new Server({ cors: { origin: process.env.ALLOWED_ORIGINS!.split(",") } });
server.use(authMiddleware);

server.on("connection", (socket) => {
  // socket.data.userId is now populated.
});
```

Client passes the token via `auth`:

```ts
const socket = io(URL, {
  iceServers: [...],
  auth: { token: jwt },
});
```

If the middleware calls `next(err)`, the client gets `connect_error` with `err.message`. Show it in your UI:

```ts
socket.on("connect_error", (err) => {
  if (err.message === "invalid token") forceLogout();
});
```

## Room access control

Refuse `join-room` for users not on the allow-list. Without joining the socket.io room, peers don't get `#rtcio:init-offer` and never start a connection.

```ts
socket.on("join-room", async ({ roomId, name }) => {
  const allowed = await isMember(socket.data.userId, roomId);
  if (!allowed) {
    socket.emit("error", { code: "forbidden", roomId });
    return;
  }

  socket.data.name = name;
  socket.join(roomId);
  socket.to(roomId).emit("user-connected", { id: socket.id, name });
  socket.to(roomId).emit(RtcioEvents.INIT_OFFER, { source: socket.id });
});
```

Where `isMember` is whatever your room-membership model is — a database lookup, an in-memory set, an API call to your auth service.

## Per-room limits

Cap the number of peers per room (e.g. for full-mesh viability):

```ts
const MAX_PEERS = 8;

socket.on("join-room", ({ roomId, name }) => {
  const room = server.sockets.adapter.rooms.get(roomId);
  if (room && room.size >= MAX_PEERS) {
    socket.emit("error", { code: "room-full", roomId });
    return;
  }
  // proceed with the normal join flow
});
```

## ICE credential vending

Don't ship long-lived TURN credentials in the client bundle. Mint short-lived ones server-side using HMAC of an expiration timestamp (the [coturn REST API auth](https://github.com/coturn/coturn/blob/master/turndb/schema.userdb.redis) format):

```ts title="ice.ts"
import crypto from "node:crypto";

const TURN_SECRET = process.env.TURN_SECRET!;
const TURN_HOST = process.env.TURN_HOST!;
const TTL = 600;   // 10 min

export function wireIce(socket: Socket) {
  socket.on("ask-ice", (cb) => {
    const username = String(Math.floor(Date.now() / 1000) + TTL);
    const credential = crypto.createHmac("sha1", TURN_SECRET).update(username).digest("base64");
    cb({
      iceServers: [
        { urls: `stun:${TURN_HOST}:3478` },
        { urls: `turn:${TURN_HOST}:3478?transport=udp`, username, credential },
        { urls: `turn:${TURN_HOST}:3478?transport=tcp`, username, credential },
        { urls: `turns:${TURN_HOST}:5349?transport=tcp`, username, credential },
      ],
    });
  });
}
```

Client:

```ts
const ack = await new Promise<{ iceServers: RTCIceServer[] }>((res) =>
  socket.server.emit("ask-ice", res)
);
const callSocket = io(URL, { iceServers: ack.iceServers });
```

Cloudflare and Twilio have equivalent APIs that return ready-to-use credentials — same shape on the wire.

## Custom application events

Anything beyond signaling is your code. The server is a pub/sub on top of socket.io rooms:

```ts
socket.on("chat-message", (msg: { roomId: string; text: string }) => {
  // Server-side validation, persistence, fanout.
  if (typeof msg.text !== "string" || msg.text.length > 1000) return;
  socket.to(msg.roomId).emit("chat-message", {
    ...msg,
    from: socket.data.userId,
    at: Date.now(),
  });
});
```

When peer-to-peer is the right transport (chat that doesn't need persistence), skip the server entirely:

```ts
// client side, both peers run this
const chat = socket.createChannel("chat", { ordered: true });
chat.on("msg", append);
chat.emit("msg", text);
```

The decision tree:

- Should the server see this? → `socket.server.emit` / handler on the server.
- Should the server NOT see this? → `socket.emit` (DataChannel) or a custom channel.

## Persisting chat history

If you want history that survives reloads, the server is the right place. The peer-to-peer path is intentionally ephemeral.

```ts
socket.on("join-room", async ({ roomId, name }) => {
  // ...usual join flow...
  const history = await db.messages.findRecent(roomId, 50);
  socket.emit("chat-history", history);
});

socket.on("chat-message", async (msg) => {
  await db.messages.insert(msg);
  socket.to(msg.roomId).emit("chat-message", msg);
});
```

You'd then drop or supplement the peer-to-peer chat channel and use server-routed messages instead.

## Logging and metrics

socket.io's middleware lets you tap any event:

```ts
server.use((socket, next) => {
  socket.use((event, next) => {
    const [name, ...args] = event;
    log.info({ socketId: socket.id, event: name, argSize: JSON.stringify(args).length });
    next();
  });
  next();
});
```

For per-room metrics, count `server.sockets.adapter.rooms.get(roomId)?.size` periodically.

## Rate limiting

Socket-level (every event):

```ts
import rateLimit from "p-throttle";
const throttle = rateLimit({ limit: 50, interval: 1000 });

server.on("connection", (socket) => {
  socket.use((event, next) => throttle(() => next()));
});
```

Or per-event:

```ts
const messageThrottle = rateLimit({ limit: 10, interval: 1000 });
socket.on("chat-message", async (msg, ack) => {
  await messageThrottle(async () => {
    await persist(msg);
    socket.to(msg.roomId).emit("chat-message", msg);
  })();
});
```

50 events/sec/socket is comfortable for normal use; you'd see floods well above that.

## Error handling

Express-style middleware errors don't translate. socket.io errors are signaled by `next(new Error(...))` in middleware (results in `connect_error` on the client) or by emitting an error event from a handler (you decide the shape):

```ts
socket.on("join-room", async ({ roomId }) => {
  try {
    await checkAccess(roomId, socket.data.userId);
    // ...
  } catch (err) {
    socket.emit("error", { code: "join-failed", message: err.message, roomId });
  }
});
```

Use a consistent error shape so the client can render uniformly.

## Custom namespaces

If you have unrelated apps sharing a server (e.g. an admin panel and the call), use socket.io namespaces:

```ts
import { Server, addDefaultListeners } from "rtc.io-server";

const server = new Server({ cors: { origin: "*" } });

const calls = server.of("/calls");
calls.on("connection", (socket) => {
  // Manually attach the rtc.io message relay.
  addDefaultListeners(socket);
  // ...your join-room handler...
});

const admin = server.of("/admin");
admin.on("connection", (socket) => {
  // No rtc.io relay here — admin panel doesn't do WebRTC.
});

server.listen(3001);
```

Clients connect to namespaces by path:

```ts
const socket = io("https://yourapp.com/calls", { iceServers: [...] });
```

## Sanity checks

- **Forgot to emit `#rtcio:init-offer`?** New peers join, but no peer connection is ever established. Check your `join-room` handler.
- **Multiple `join-room` events stack rooms?** `socket.join` is idempotent (re-joining the same room is a no-op). Kicking previous rooms is your concern — track current room per socket if needed.
- **Listeners running twice?** Double-registration. Make sure you wire handlers inside the `connection` callback, not at module scope.
