---
id: installation
title: Installation
description: Install rtc.io-server, project structure, TypeScript setup, dev server.
---

# Installation

## Requirements

- Node 18 or newer.
- A package manager (npm, pnpm, yarn — pick one).

## Install

```bash
npm install rtc.io-server
```

`rtc.io-server` brings in `socket.io@^4.7.4` as a dependency. You don't need to install it separately.

## Minimal project

```bash
mkdir my-rtcio-server && cd my-rtcio-server
npm init -y
npm install rtc.io-server
```

Edit `package.json`:

```json title="package.json"
{
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  }
}
```

Create `index.js`:

```js title="index.js"
import { Server, RtcioEvents } from "rtc.io-server";

const server = new Server({ cors: { origin: "*" } });

server.on("connection", (socket) => {
  console.log("connected", socket.id);

  socket.on("join-room", ({ roomId, name }) => {
    socket.data.name = name;
    socket.join(roomId);
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
console.log("rtc.io-server listening on 3001");
```

Run it:

```bash
npm run dev
```

That's a working server.

## TypeScript

Install the TypeScript toolchain:

```bash
npm install -D typescript @types/node ts-node-dev
```

Create `tsconfig.json`:

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["**/*.ts"]
}
```

Update `package.json`:

```json title="package.json"
{
  "type": "module",
  "scripts": {
    "dev": "ts-node-dev --respawn index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

Rename `index.js` → `index.ts`. Same code, with types you can use:

```ts title="index.ts"
import { Server, RtcioEvents, Socket } from "rtc.io-server";

const server = new Server({ cors: { origin: "*" } });

server.on("connection", (socket: Socket) => {
  socket.on("join-room", ({ roomId, name }: { roomId: string; name: string }) => {
    socket.data.name = name;
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", { id: socket.id, name });
    socket.to(roomId).emit(RtcioEvents.INIT_OFFER, { source: socket.id });
  });
});

server.listen(3001);
```

For a fully typed event surface (events you `emit`/`on`), use socket.io's typed-events generics:

```ts
type ClientToServer = {
  "join-room": (data: { roomId: string; name: string }) => void;
};

type ServerToClient = {
  "user-connected": (data: { id: string; name: string }) => void;
  "user-disconnected": (data: { id: string }) => void;
};

const server = new Server<ClientToServer, ServerToClient>({ cors: { origin: "*" } });

server.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    socket.data.name = name;        // typed
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", { id: socket.id, name });   // typed
  });
});
```

The four generics are `ClientToServer, ServerToClient, InterServer, SocketData`. See [socket.io typed events docs](https://socket.io/docs/v4/typescript/) for the full pattern.

## Project layout

A common shape for a real signaling server:

```
my-rtcio-server/
├─ package.json
├─ tsconfig.json
├─ index.ts                 # entrypoint
├─ src/
│  ├─ rooms.ts             # join-room, leave-room, presence
│  ├─ auth.ts              # io.use middleware
│  ├─ ice.ts               # short-lived TURN credential vending
│  └─ scaling.ts           # adapter setup if you horizontally scale
└─ .env
```

`index.ts` wires the pieces:

```ts
import { Server } from "rtc.io-server";
import { authMiddleware } from "./src/auth";
import { wireRooms } from "./src/rooms";
import { wireIce } from "./src/ice";

const server = new Server({
  cors: { origin: process.env.ALLOWED_ORIGINS?.split(",") ?? "*" },
});

server.use(authMiddleware);

server.on("connection", (socket) => {
  wireRooms(socket);
  wireIce(socket);
});

server.listen(parseInt(process.env.PORT ?? "3001"));
```

Each `wireX` function is a `(socket: Socket) => void` that registers handlers. Easier to test than one giant connection handler.

## Live reload

For TS, `ts-node-dev` (above) restarts on file changes. For plain JS, `node --watch index.js` (Node 18.11+).

## Production build

For TS:

```bash
npm run build
node dist/index.js
```

For plain JS, just `node index.js` — no build step.

## Next

- **[Quickstart](quickstart)** — finish the example, wire the client.
- **[Customization](customization)** — auth, room policy, ICE vending.
- **[Deployment](deployment)** — getting it onto Heroku/Fly/your-own-box.
