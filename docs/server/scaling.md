---
id: scaling
title: Scaling
description: Sticky sessions, the socket.io adapter pattern, when one process is enough, when you need Redis.
---

# Scaling

A single Node process running rtc.io-server handles thousands of concurrent peers without breaking a sweat — signaling traffic is small (a few hundred bytes per peer per session) and the relay is one event handler.

That said, when you outgrow one process, the path is well-trodden. This page covers the patterns.

## When one process is enough

Roughly: **up to ~10k concurrent open sockets per process** is fine on modest hardware. Each socket is mostly idle (heartbeats every 25s + occasional signaling traffic).

Above that, or if you need geographic distribution, scale horizontally.

## Horizontal scaling: the problem

If you run two processes behind a load balancer, alice connects to process A and bob connects to process B. They join `roomId: "demo"`. Process A knows about alice; process B knows about bob. Each side's `socket.to("demo").emit(...)` only reaches sockets *on the same process*. The relay breaks.

The fix is socket.io's **adapter** abstraction: a pub/sub layer that lets `socket.to(room).emit(...)` fan out across processes.

## Redis adapter

The standard adapter for socket.io clusters:

```bash
npm install @socket.io/redis-adapter ioredis
```

```ts title="index.ts"
import { Server } from "rtc.io-server";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";

const pub = new Redis(process.env.REDIS_URL!);
const sub = pub.duplicate();

const server = new Server({ cors: { origin: "*" } });
server.adapter(createAdapter(pub, sub));
server.listen(3001);
```

Now any `socket.to(roomId).emit(...)` broadcasts the event to *every* process in the cluster. Sockets in the same room see each other regardless of which process they connected to.

The Redis adapter uses pub/sub channels — events don't persist, just fan out. So Redis is essentially stateless storage for socket.io; you're not committing to it as a database.

## Sticky sessions

Even with the adapter, **a single client must always hit the same process for the duration of the connection**. socket.io's WebSocket upgrade requires session affinity — without it, the upgrade race causes 400 errors.

Most platforms support this:

- **Heroku** — turn on session affinity in the dyno config (HTTP1 router).
- **Fly.io** — `[[services]]` with `internal_port` and a single `[handlers]` config; Fly's load balancer is sticky by client IP.
- **AWS ALB** — enable target group stickiness with a duration cookie.
- **nginx** — `ip_hash` or `hash $remote_addr` in the `upstream` block.
- **Cloudflare** — Cloudflare Tunnels do sticky-by-IP automatically.

Verify: open multiple tabs, check that they all hit the same process via a logged hostname/PID. If they don't, sticky sessions are off.

## Postgres / NATS / cluster adapters

The Redis adapter is the most popular. Alternatives:

- **`@socket.io/postgres-adapter`** — if you already run Postgres and don't want another moving piece.
- **`@socket.io/cluster-adapter`** — for in-memory clustering on a single host (Node `cluster` module).
- **`@socket.io/mongo-adapter`** — Mongo-backed.

All have the same API; pick whichever matches your existing infra.

## Cross-region

If you have processes in `us-east` and `eu-west` and a peer in each region, the adapter still works — Redis pub/sub fans out cross-region. Latency on signaling becomes (region A → Redis → region B). Doable, but signaling adds 100–200ms.

For genuinely global, deploy Redis in multiple regions with replication, or use a managed offering with global replication (Upstash Global, Redis Cloud Multi-Region).

The peer connections themselves go peer-to-peer (or through TURN); they don't go through the signaling server, so cross-region signaling latency doesn't affect the call quality once it's set up.

## Stateless design

Keep the server stateless. **Don't** stash per-socket state in a process-local `Map` if you scale horizontally — the entries don't survive a process restart and aren't visible to other processes.

The Quickstart's `lastMediaState` is process-local. For a single process it's fine. To scale, push it to Redis:

```ts
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

socket.on("media-state", async ({ roomId, mic, cam }) => {
  await redis.hset(`room:${roomId}:state`, socket.id, JSON.stringify({ mic, cam }));
  await redis.expire(`room:${roomId}:state`, 24 * 3600);   // GC stragglers
  socket.to(roomId).emit("media-state", { id: socket.id, roomId, mic, cam });
});

socket.on("disconnecting", async () => {
  for (const roomId of socket.rooms) {
    if (roomId !== socket.id) {
      await redis.hdel(`room:${roomId}:state`, socket.id);
    }
  }
});

// On join, backfill from Redis instead of the local Map.
socket.on("join-room", async ({ roomId }) => {
  // ...usual join...
  const stateMap = await redis.hgetall(`room:${roomId}:state`);
  for (const [id, raw] of Object.entries(stateMap)) {
    const { mic, cam } = JSON.parse(raw);
    socket.emit("media-state", { id, roomId, mic, cam });
  }
});
```

## Capacity planning

A rough envelope:

- **Concurrent sockets** is the dominant resource. ~5–10 KB heap per socket on modern Node.
- **Events per second** is small for signaling (every peer joins/leaves emit a handful, no continuous traffic).
- **Bandwidth** is negligible. SDP offers are ~5 KB; ICE candidates are a few hundred bytes; presence is tiny.

A 1 GB Heroku dyno can comfortably hold 50k concurrent sockets. The bottleneck is rarely CPU.

For a back-of-envelope:

```
peers_per_room  = 4
rooms          = N
concurrent     = N * peers_per_room

For 10k concurrent users → ~2.5k rooms. Easy on one process.
For 100k concurrent users → ~25k rooms. Easy on 2-4 processes with Redis.
```

## Health checks for the cluster

Each process should expose a `/health` (see [Deployment](deployment)). Behind a load balancer, configure unhealthy detection and rolling restarts.

When a process goes down with users connected, those users' signaling sessions drop. Their existing peer connections are unaffected (they're peer-to-peer). They'll see "Signaling server unreachable" in the demo's connection-lost banner; reconnecting reaches a different process and they regain the ability to onboard new joiners.

## What stays in-memory always

socket.io's adapter only fans out events. Per-socket state (auth, name, room membership) lives in `socket.data` on the process holding the socket. That's correct — sticky sessions guarantee the right process handles each client's events.

Cross-process queries (e.g. "give me every socket in room X across the cluster") use `server.sockets.in(room).fetchSockets()` which the adapter coordinates over Redis. It's slower than local; cache results if you query frequently.

## Don't scale prematurely

For most apps, one process is fine for the lifetime of the project. Add the adapter when you have evidence of single-process strain (CPU pegged, memory growing without bound, sockets dropping). Premature horizontal scaling adds complexity without benefit.
