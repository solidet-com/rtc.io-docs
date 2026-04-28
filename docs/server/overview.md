---
id: overview
title: Server overview
description: rtc.io-server is a thin signaling relay built on socket.io. It moves <5 messages between peers so they can establish a peer connection, then it's out of the loop.
---

# Server overview

`rtc.io-server` is a tiny extension of `socket.io`. It exists to do exactly one thing: relay rtc.io's signaling envelope (`#rtcio:message`) between two browsers so they can set up a peer-to-peer `RTCPeerConnection`. Once they're connected, the server isn't in the data path.

## What the server does

```ts
import { Server } from "rtc.io-server";
const server = new Server({ cors: { origin: "*" } });
server.listen(3001);
```

That's a working signaling server. Everything that's needed for a peer connection is in `Server` — it auto-registers a relay handler on every `connection`:

```ts title="rtc.io-server/index.ts (simplified)"
class Server extends socketio.Server {
  constructor(opts) {
    super(opts);
    super.on("connection", (socket) => addDefaultListeners(socket));
  }
}

function addDefaultListeners(socket) {
  socket.on("#rtcio:message", (payload) => {
    socket.to(payload.target).emit("#rtcio:message", payload);
  });
}
```

The relay is one line: it takes the envelope, looks up the target socket id, forwards it. The library on the client side multiplexes offers, answers, ICE candidates, and stream metadata into that envelope, so the relay alone is enough to support every signaling round-trip.

## What the server doesn't do

Everything else is your code. The server has no opinion about:

- **Rooms.** No `join-room` handler is built in. You write it (it's about 5 lines using socket.io's `socket.join`).
- **Presence.** No "user-connected" / "user-disconnected" broadcast. Yours.
- **Authentication.** No middleware. You add `io.use((socket, next) => ...)` if you want auth.
- **Persistence.** Chat history, file storage, anything stateful — yours.
- **`#rtcio:init-offer`.** This is the kickoff event the client expects ("hey, there's a new peer in the room — start an offer to them"). The server has to decide *who* is in *which* room and emit it appropriately. The library handles the receive side.

This is by design: signaling is generic, room logic is application-specific. We don't want to bake your auth model into the library.

## A complete example

```ts title="server.ts"
import { Server, RtcioEvents } from "rtc.io-server";

const server = new Server({ cors: { origin: "*" } });

server.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    socket.data.name = name;
    socket.join(roomId);

    // Tell every existing peer to initiate an offer to the newcomer.
    socket.to(roomId).emit("user-connected", { id: socket.id, name });
    socket.to(roomId).emit(RtcioEvents.INIT_OFFER, { source: socket.id });
  });

  socket.on("disconnecting", () => {
    socket.rooms.forEach((roomId) => {
      if (roomId === socket.id) return;
      socket.to(roomId).emit("user-disconnected", { id: socket.id });
    });
  });
});

server.listen(3001);
```

That's the whole server. ~25 lines including imports.

## When to use the public server

We host **[server.rtcio.dev](https://server.rtcio.dev)** as a free, public signaling endpoint. It runs the example above (room joins + presence + init-offer) plus a tiny `media-state` echo for the demo app. Point your client there and skip the server step entirely:

```ts
const socket = io("https://server.rtcio.dev", {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});
```

It's the right choice when:

- You're prototyping.
- You're learning rtc.io and don't want to set up infrastructure.
- You're building a small app that's OK depending on a third-party server.

It's the wrong choice when:

- You need auth or per-room access control.
- You can't have your room ids visible to a third party.
- You need an SLA — it's best-effort, no guarantees.
- You need custom server-side events.

In any of those cases, [run your own](installation). It's about a 30-line file.

## What's installed where

`rtc.io-server` lives on your Node server. The browser doesn't import it. The two packages talk over their shared signaling protocol — pin matching versions:

```bash
# server
npm install rtc.io-server@^1.1.0

# client
npm install rtc.io@^1.1.0
```

The 1.x line uses a unified envelope (`#rtcio:message`); older 0.x clients aren't wire-compatible.

## Full API surface

```ts
import {
  Server, ServerOptions, RtcioEvents,
  Socket, Namespace, BroadcastOperator, RemoteSocket, Event, DisconnectReason,
  addDefaultListeners,
} from "rtc.io-server";
```

- **`Server`** — extends `socket.io`'s `Server`. Same constructor, same `listen`/`emit`/etc.
- **`ServerOptions`** — extends `socket.io`'s `ServerOptions`.
- **`RtcioEvents`** — string constants for the rtc.io reserved event names.
- **`addDefaultListeners(socket)`** — registers the `#rtcio:message` relay. Called automatically; exported for advanced use cases (e.g. you want to register it on a specific namespace only).
- **socket.io re-exports** — `Socket`, `Namespace`, `BroadcastOperator`, `RemoteSocket`, `Event`, `DisconnectReason` — for convenience in TypeScript code that needs the types.

## Next

- **[Installation](installation)** — npm install, project setup.
- **[Quickstart](quickstart)** — minimal working server with rooms.
- **[Public server](public-server)** — what server.rtcio.dev offers and its limits.
- **[Protocol](protocol)** — the actual wire envelope format.
- **[Customization](customization)** — your own room logic, auth, ICE vending, scaling.
- **[Deployment](deployment)** — Heroku, Fly, Docker, bare metal.
