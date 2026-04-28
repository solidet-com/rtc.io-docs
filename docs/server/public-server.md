---
id: public-server
title: Public server (server.rtcio.dev)
description: A free public signaling server for prototyping. URL, supported events, limits, when to migrate to your own. Includes important caveats about the shared/global namespace.
---

# Public signaling server

We host **[server.rtcio.dev](https://server.rtcio.dev)** as a free public signaling endpoint, running the same code as the [Quickstart](quickstart). It's a "just works" backend for prototyping, learning rtc.io, and small demos.

:::danger Read this before using it

**The public server is a single, shared, unauthenticated namespace.**

Every app pointing at `server.rtcio.dev` lands in the same room namespace. The server has no concept of which app a connection came from, no authentication, no room ownership, and no ability to tell two unrelated demos apart. **If two apps pick the same `roomId`, their users will join the same call — including with strangers.**

For prototyping, this is fine *if* your room ids are hard to guess. **Use a UUID or 16+ random characters via `crypto.randomUUID()`** — never short, predictable strings (`test`, `demo`, `room-1`, your name, etc.). The reference demo at [rtcio.dev](https://rtcio.dev) ships rooms like `amber-cedar-a1b2c3d4` for exactly this reason.

For anything you ship, please **[run your own server](quickstart)** — it's `npm install rtc.io-server` and a 30-line file. That gives you authentication, room ownership, persistence, rate limiting, abuse handling, and full control over who joins what.

The public server is a courtesy for prototypes. It is not a hosted SaaS, has no SLA, no privacy guarantees against accidental room sharing, and no liability. **Do not use it for anything that can't be safely shared with a stranger by accident.**
:::

## URL

```ts
const socket = io("https://server.rtcio.dev", {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

// Generate a hard-to-guess room id BEFORE you join.
const roomId = crypto.randomUUID();

socket.server.emit("join-room", { roomId, name });
```

That's the entire setup. No account, no API key, no install. Tabs that join the same `roomId` find each other — which is exactly why the `roomId` needs to be unguessable on a shared server.

### What "hard to guess" means in practice

| Room id | Entropy | Stranger-collision risk |
|---|---|---|
| `"meeting"` | ~0 bits | Near-certain on any non-trivial day |
| `"team-standup"` | ~0 bits | Near-certain (everyone names rooms this) |
| `"alice-2026-04-28"` | low | High (anyone could guess your pattern) |
| `crypto.randomUUID()` | 122 bits | Astronomically low |
| 16 hex chars (`crypto.getRandomValues`) | 64 bits | Effectively zero for any plausible population |

**TL;DR: don't pick a room name a human would pick.**

## What it supports

The public server handles exactly the events the [Quickstart](quickstart) describes:

- `join-room` — join the named room, learn about existing peers, kick off the WebRTC handshake.
- `user-connected` / `user-disconnected` — presence broadcasts.
- `media-state` — echoes mic/cam state, caches the latest so late joiners see who's muted.
- `stopScreenShare` — broadcasts to the room.
- `#rtcio:message` and `#rtcio:init-offer` — the rtc.io signaling primitives. Auto-handled.

That's enough for a working video room with chat, file transfer, screen share, and presence — everything you see in [the demo](https://rtcio.dev).

## What it doesn't support

- **Auth.** Anyone can join any `roomId`. Treat them as discoverable: don't put credentials or sensitive state in your room ids.
- **TURN.** It only does signaling. If your users are behind symmetric NATs you'll need a TURN server (see [ICE and TURN](/docs/guides/ice-and-turn)).
- **Custom events.** Anything beyond the events above is not relayed. Send your own custom events peer-to-peer (`socket.emit('foo', ...)`) instead of through the server.
- **History.** No messages or files are stored. The server is a stateless relay.
- **SLA.** Best-effort. We host it. Sometimes we restart it. Don't build a paying product on top.

If any of these are blockers, [run your own](installation) — it's about 30 lines.

## Health and limits

We don't publish hard limits but they exist:

- Per-process socket count is capped (we'll restart if it gets exhausted).
- Per-IP rate limits are loose but applied.
- Max concurrent peers per room is implicitly bounded by full-mesh viability — past 6–8 peers, your *clients* run out of upload bandwidth before we run out of capacity.

For reference, the demo at [rtcio.dev](https://rtcio.dev) points at this server.

## CORS

`origin: "*"` — anything can connect. That's intentional; this is a public service.

## Migration to your own server

When your prototype graduates to "real app," the migration is one line:

```diff
-const socket = io("https://server.rtcio.dev", {
+const socket = io("https://signaling.yourapp.com", {
```

Your server runs the [Quickstart](quickstart) code (or your customized variant). Wire compatibility is identical because it's literally the same library.

## Running locally instead

If you don't want to depend on the public server even during dev, point at localhost:

```ts
const socket = io(import.meta.env.VITE_SIGNALING ?? "http://localhost:3001", {
  iceServers: [...],
});
```

Then run the [Quickstart](quickstart) server on port 3001 and it's identical to production behavior. The demo app (`rtcio-web`) does this — `VITE_RTCIO_SERVER` overrides the public default.

## Reporting issues

If `server.rtcio.dev` is unreachable or behaving weirdly, file an issue on [GitHub](https://github.com/solidet-com/rtc.io/issues) with:

- The URL you're connecting to.
- Approximate time and your timezone.
- Browser console output (especially with `debug: true` enabled on the socket).

## Why we host it

So you can `npm install rtc.io` and have a working video call in the next minute. Most "let me try this WebRTC library" attempts die at the "now configure a signaling server" step. Skipping it is the only way the path stays five minutes long.
