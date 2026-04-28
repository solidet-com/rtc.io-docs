---
id: deploy
title: 6. Deploy
description: Get the app onto the internet — static client on Vercel/Netlify, signaling on Heroku/Fly/Render, sane CORS.
---

# 6. Deploy

You've got a working app. Time to put it on the internet so other people can use it.

## What needs to be deployed

Two things:

| Piece | Where | What it needs |
|---|---|---|
| The client (Vite app) | Static hosting (Vercel, Netlify, Cloudflare Pages, S3, GitHub Pages, anywhere) | HTTPS — required for `getUserMedia` |
| The signaling server (Node) | A long-lived process host (Heroku, Fly, Render, Railway, your VPS) | HTTPS, WebSocket support, CORS |

Skipping the server step entirely and pointing at `server.rtcio.dev` is fine for prototypes — see [Public server](/docs/server/public-server). For a real product you'll want your own.

## The client

Build it:

```bash
npm run build
```

Vite produces a `dist/` directory. Drop it on any static host. Vercel and Netlify auto-detect Vite and need zero config:

```bash
# Vercel
vercel --prod

# Netlify
netlify deploy --prod --dir=dist
```

Cloudflare Pages, GitHub Pages, and S3+CloudFront are equally fine. The client is just static HTML/JS/CSS.

The only thing to remember: **set the signaling URL via env var**, not hardcoded:

```ts title="src/main.ts"
const SERVER = import.meta.env.VITE_SIGNALING ?? "https://server.rtcio.dev";
```

Then in your Vercel/Netlify project settings, add `VITE_SIGNALING=https://signaling.yourapp.com`. Vite inlines `import.meta.env.VITE_*` at build time.

## The signaling server

The server needs a Node host that supports WebSockets and keeps processes alive.

We covered the platform recipes in [Server: Deployment](/docs/server/deployment). Quick summary:

- **Heroku** — `git push heroku main`, set `ALLOWED_ORIGINS`, done.
- **Fly.io** — `fly launch`, multi-region for global low latency.
- **Render** — connect your repo, free tier sleeps after inactivity.
- **Docker** — anywhere container-shaped (Cloud Run, ECS, Kubernetes).
- **VPS** — nginx + systemd + Let's Encrypt.

Pick whichever matches your existing infra. Cost is ~$5–10/mo for any of them.

## CORS

Lock the server's origin to your real domain in production:

```ts title="index.js"
const server = new Server({
  cors: { origin: process.env.ALLOWED_ORIGINS.split(",") },
});
```

```bash
# Heroku
heroku config:set ALLOWED_ORIGINS=https://yourapp.com,https://www.yourapp.com

# Fly
fly secrets set ALLOWED_ORIGINS=https://yourapp.com,https://www.yourapp.com
```

`origin: "*"` in production lets any site connect to your server and burn capacity. Don't.

See [CORS](/docs/server/cors) for the full reference (regex / wildcard subdomain / function form).

## TURN

For users behind symmetric NATs (carrier-grade NAT on mobile networks, some corporate firewalls), STUN isn't enough. You need a TURN server.

Three reasonable paths:

- **Cloudflare Realtime TURN** — free tier, generate creds in their dashboard, plug into `iceServers`.
- **Twilio Network Traversal Service** — pay-per-use, well-documented.
- **Self-host coturn** — best if you already run infrastructure.

For all three, **don't ship long-lived TURN credentials in your client bundle.** Mint short-lived ones server-side. The pattern is in [ICE and TURN](/docs/guides/ice-and-turn).

Without TURN, your app works fine in dev (you and your peer share LAN) and breaks in production for ~20% of users. Test with a phone on cellular.

## Sanity check

After deploying:

```bash
curl -I "https://signaling.yourapp.com/socket.io/?EIO=4&transport=polling"
# Should be 200 with a Set-Cookie header
```

In a browser tab on your production site, open DevTools console:

```js
io.connected   // true if your app correctly initialized the socket
```

If `connect_error` shows up:

- CORS — server's allowed-origin doesn't include your page's origin.
- WebSocket blocked — try `transports: ["websocket"]` to verify the upgrade path.
- TLS — if your client is on HTTPS but you're connecting to `ws://...`, browsers block mixed content.

## Verify with two devices

Test from two physically separate networks (your laptop on home WiFi + your phone on cellular). If the call works, ICE is doing its job. If it doesn't:

1. Open `getIceCandidateStats` and look at the candidate types each side gathered. `srflx` means STUN is working; if both sides only see `host`, your STUN URL is unreachable.
2. If both sides have `srflx` but ICE never reaches `connected`, you're behind symmetric NATs and need TURN.

## Pre-launch checklist

- [ ] Client built with `VITE_SIGNALING` pointing at production server.
- [ ] Server `ALLOWED_ORIGINS` set to your real origins (no wildcard).
- [ ] HTTPS on both client and signaling.
- [ ] STUN configured (the Google default is fine).
- [ ] TURN configured if your audience may be behind symmetric NATs.
- [ ] Server health check at `/health` (for your load balancer).
- [ ] Some kind of error logging on the server (we use `pino` in the demo).
- [ ] If self-hosting Node: process manager (systemd, pm2, foreman) for auto-restart.

## What's next

You're done with the tutorial. You have:

- A signaling server.
- A client with video, audio, chat, file transfer.
- A working production deployment.

Where to from here:

- **Want a richer demo?** [The rtcio-web source](https://github.com/solidet-com/rtc.io/tree/master/rtcio-web) is a complete React app with screen sharing, device pickers, mobile UI.
- **Want to understand more deeply?** Read [How it works](/docs/how-it-works) and [Perfect negotiation](/docs/guides/perfect-negotiation).
- **Want to scale?** [Scaling](/docs/server/scaling) covers the Redis-adapter pattern.
- **Stuck on something?** Open an issue on [GitHub](https://github.com/solidet-com/rtc.io/issues).

Or just ship it.
