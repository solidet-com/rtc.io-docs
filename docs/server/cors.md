---
id: cors
title: CORS
description: Configure cross-origin access correctly for prod — what to set, what not to set.
---

# CORS

The signaling server runs on a different origin from your web app — `signaling.yourapp.com` vs `app.yourapp.com`, or `localhost:3001` vs `localhost:5173` in dev. Browsers refuse cross-origin requests by default; you have to opt in.

## The option

`Server` constructor accepts socket.io's `cors` option:

```ts
const server = new Server({
  cors: {
    origin: "https://yourapp.com",
    credentials: true,
  },
});
```

`origin` is what gets compared against the `Origin` request header.

## Allowed values

| Value | Effect |
|---|---|
| `"*"` | Any origin. **Don't use in production unless intentional.** |
| `"https://yourapp.com"` | Single exact match |
| `["https://yourapp.com", "https://staging.yourapp.com"]` | Array of exact matches |
| `(origin, cb) => cb(null, origin === ...)` | Function — full control |
| `/^https:\/\/.*\.yourapp\.com$/` | Regex |

## Production setup

Lock to your real origins:

```ts
const server = new Server({
  cors: {
    origin: process.env.ALLOWED_ORIGINS!.split(","),
    credentials: true,
  },
});
```

```bash
# .env or platform config
ALLOWED_ORIGINS=https://yourapp.com,https://www.yourapp.com,https://staging.yourapp.com
```

## Development setup

`origin: "*"` is fine for `npm run dev`. Don't ship that to prod — any origin (including malicious sites embedded in iframes) can connect to your server and consume capacity.

## Credentials

If you use cookie-based auth on the signaling endpoint, set `credentials: true` on the server **and** `withCredentials: true` on the client:

```ts
// server
new Server({ cors: { origin: "https://yourapp.com", credentials: true } });

// client
io(URL, { withCredentials: true, iceServers: [...] });
```

Note: `credentials: true` is incompatible with `origin: "*"` per the CORS spec. The browser refuses to send cookies cross-origin to a wildcard. You must list exact origins.

## Wildcard subdomains

socket.io accepts a regex:

```ts
cors: { origin: /^https:\/\/.*\.yourapp\.com$/ }
```

Or a function:

```ts
cors: {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);             // allow same-origin / no-origin requests
    if (origin.endsWith(".yourapp.com")) return cb(null, true);
    cb(new Error("origin not allowed"));
  },
}
```

The function form is the most flexible — you can check against a database, environment variable, etc.

## Headers and methods

socket.io sets the necessary CORS headers automatically once you specify `origin`. You don't need to configure `methods` or `allowedHeaders` unless you've added custom headers.

## Behind a reverse proxy

If your nginx is doing TLS termination (see [Deployment](deployment)), make sure it forwards the `Origin` header to the Node process. nginx does by default; some proxies strip it.

```nginx
location /socket.io/ {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  # Origin is forwarded automatically — don't strip it.
}
```

If you set CORS on the proxy *and* on socket.io, you can end up with double-`Access-Control-Allow-Origin` headers and the browser refuses the connection. Pick one — let socket.io do it (recommended) or let the proxy do it.

## Debugging CORS errors

If the browser console says "blocked by CORS":

1. Check the request `Origin` (browser DevTools → Network tab → the failing request → Headers).
2. Check what server `cors.origin` is matching against.
3. If `origin: "*"`, no CORS error happens — so if you see one with `"*"` set, the server isn't actually receiving that config (build cache, env var not loaded, wrong file).

The error always points at the server config, not the client. Clients can't "fix" CORS — they can only request a different origin.

## Same-origin

If your web app and signaling server share an origin (`https://yourapp.com` for both), CORS doesn't apply. You don't need any `cors.origin` setting.

This is rare in practice — usually the signaling server lives on a subdomain or different port. But if you co-host them (e.g. Express app serving both static files and the socket.io server), it's the simplest setup.

```ts
import express from "express";
import http from "node:http";
import { Server } from "rtc.io-server";

const app = express();
app.use(express.static("public"));

const httpServer = http.createServer(app);
const io = new Server(httpServer);    // no cors needed; same origin

httpServer.listen(3001);
```
