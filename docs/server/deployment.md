---
id: deployment
title: Deployment
description: Heroku, Fly.io, Render, Docker, bare metal — how to ship rtc.io-server to production.
---

# Deployment

The signaling server is a stateless Node process that needs:

- **A long-lived process** (no Vercel-style 10-second timeouts — WebSockets stay open as long as users are in the call).
- **WebSocket support** (most modern hosts; verify before you commit).
- **Sticky sessions** if you scale horizontally (see [Scaling](scaling)).

That's it. No Redis, no database, no cache — unless you add them yourself for app features.

## Heroku

Drop the [Quickstart](quickstart) into a repo with a `Procfile`:

```
web: node index.js
```

The free tier is gone, so this is paid. Hobby dyno (~$7/mo) handles a few hundred concurrent users.

`PORT` is set automatically. CORS:

```ts
cors: { origin: process.env.ALLOWED_ORIGINS!.split(",") },
```

Set the env var:

```bash
heroku config:set ALLOWED_ORIGINS=https://yourapp.com,https://www.yourapp.com
```

Heroku supports WebSockets out of the box, no extra config needed.

## Fly.io

Best for low-latency global deployments — they have edges in 30+ regions and you can deploy to multiple at once.

```bash
fly launch
fly deploy
```

`fly.toml`:

```toml
app = "my-rtcio-server"
primary_region = "iad"

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
```

`auto_stop_machines = false` is important: stopping a machine while users are connected drops their signaling session.

For multi-region, set `regions = ["iad", "fra", "syd"]` and add an adapter (see [Scaling](scaling)) so peers across regions still see each other.

## Render

Web Service, Node.js, free tier:

- Build command: `npm install && npm run build` (if TypeScript) or just `npm install`.
- Start command: `npm start` or `node index.js`.
- Set `PORT` is automatic, just listen on `process.env.PORT`.

Free tier sleeps after inactivity, so first joiners eat a cold-start hit. Paid plan keeps it warm.

## Railway

Same shape as Render. Connect your repo, point at `index.js`, done. They auto-detect Node and set `PORT`.

## Docker (anywhere)

For Kubernetes, Cloud Run, ECS, anywhere container-shaped:

```dockerfile title="Dockerfile"
FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "index.js"]
```

For TypeScript, build first:

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

Build:

```bash
docker build -t my-rtcio-server .
docker run -p 3001:3001 -e ALLOWED_ORIGINS=https://yourapp.com my-rtcio-server
```

## Cloud Run / serverless caveats

WebSockets work on Cloud Run but each request has a max duration (60 min default, configurable to 60 min). Set `--timeout=60m` and your users have to refresh after an hour. For longer sessions, use a long-lived host (Heroku/Fly/Render).

Vercel / Netlify Functions are **not suitable** — they're stateless and short-lived.

## Bare metal / VPS

Any Linux VPS works. Behind a reverse proxy (nginx) for TLS termination:

```nginx
server {
  listen 443 ssl http2;
  server_name signaling.yourapp.com;

  ssl_certificate     /etc/letsencrypt/live/signaling.yourapp.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/signaling.yourapp.com/privkey.pem;

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
  }
}
```

`proxy_read_timeout` matters — default 60s closes idle WebSockets. 86400 = 24h.

Run the Node process with a process manager so it auto-restarts:

```bash
# systemd
[Service]
ExecStart=/usr/bin/node /opt/rtc.io-server/index.js
Restart=always
Environment=PORT=3001
Environment=ALLOWED_ORIGINS=https://yourapp.com
```

## Health checks

Add a health endpoint via the underlying HTTP server:

```ts
import { Server } from "rtc.io-server";
import http from "node:http";

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const server = new Server(httpServer, { cors: { origin: "*" } });
// ... handlers ...
httpServer.listen(3001);
```

Useful for load balancer health probes. Don't expose anything sensitive (peer counts, room names) on it without auth.

## TLS in production

WebRTC requires HTTPS in the browser (camera/mic permissions are gated on secure context). Your signaling server should be `https://` for the same origin reasons. All the platforms above (Heroku/Fly/Render/Railway) terminate TLS for free; for bare metal use Let's Encrypt.

The browser `getUserMedia` permission also requires the page itself to be served over HTTPS. Mixed content (HTTPS page → ws:// signaling) won't work in modern browsers.

## Sanity checks

After deploying, verify:

```bash
curl -I https://signaling.yourapp.com/socket.io/?EIO=4&transport=polling
# Should return 200 with socket.io's session id

# In the browser console on your site:
const s = io("https://signaling.yourapp.com");
s.on("connect", () => console.log("connected", s.id));
```

If `connect` doesn't fire:

- CORS — server's `cors.origin` doesn't include your page's origin.
- Path — server's `path` doesn't match what the client expects (default `/socket.io`).
- TLS — mixed content, expired cert.
- WebSocket blocked — try `transports: ["websocket"]` on the client to see if a polling fallback was the only thing working (rare on modern hosts but possible).

## Cost (rough)

For a server that signals 1k concurrent peer connections:

- Heroku Hobby ~$7/mo.
- Fly.io ~$5/mo on shared-cpu-1x.
- Render Web Service ~$7/mo on Starter.
- Bare-metal $5/mo VPS works fine.

The signaling server is cheap. If you spend more, you're probably running TURN (which scales with media bandwidth, not signaling rate). See [ICE and TURN](/docs/guides/ice-and-turn).
