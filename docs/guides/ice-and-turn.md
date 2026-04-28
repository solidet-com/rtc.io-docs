---
id: ice-and-turn
title: ICE, STUN, and TURN
description: How rtc.io discovers connection paths, when STUN is enough, when you need TURN, and how to wire one up.
---

# ICE, STUN, and TURN

WebRTC connects two peers by trying every plausible network path between them and using the first one that works. That process is called **ICE** (Interactive Connectivity Establishment), and the inputs to it are called **ICE servers**.

## What's an ICE server

A list of `RTCIceServer` objects you pass when creating the socket:

```ts
const socket = io(URL, {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:turn.example.com:3478", username: "alice", credential: "..." },
  ],
});
```

Two flavors:

- **STUN** — a server that *only* tells you what your public IP/port look like from the internet's perspective. Cheap (one UDP round-trip), no relay. Used to punch through most NATs.
- **TURN** — a server that *relays* media between you and your peer. Used when direct paths fail (symmetric NATs, restrictive firewalls). Expensive (every byte of media goes through it).

If you don't pass `iceServers`, rtc.io falls back to a pair of Google's public STUN servers:

```ts title="rtc.ts (excerpt)"
this.servers = {
  iceServers: opts?.iceServers?.length
    ? opts.iceServers
    : [{ urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] }],
};
```

That's enough for ~80% of NATs. The other 20% need TURN.

## When you need TURN

You need TURN if your users are behind:

- **Symmetric NATs** — common in carrier-grade NAT (mobile networks, some ISPs), some corporate networks.
- **UDP-blocking firewalls** — a few enterprise networks drop all outbound UDP. TURN over TCP/TLS works around this.
- **Mobile networks doing aggressive port mapping** — random outgoing ports, no inbound, no STUN punch.

Symptoms: ICE never reaches `connected`. Logs show candidates exchanged but `iceConnectionState` flipping between `checking` and `failed`. Your demo works on your home WiFi and breaks on a phone hotspot.

## Picking a TURN server

Three reasonable options:

### 1. Cloudflare Realtime TURN (free tier)

Sign up, generate credentials, plug them into `iceServers`:

```ts
iceServers: [
  { urls: "stun:stun.cloudflare.com:3478" },
  {
    urls: [
      "turn:turn.cloudflare.com:3478?transport=udp",
      "turn:turn.cloudflare.com:3478?transport=tcp",
      "turns:turn.cloudflare.com:5349?transport=tcp",
    ],
    username: "<from cloudflare dashboard>",
    credential: "<from cloudflare dashboard>",
  },
],
```

Free tier covers most prototypes. They have a token-mint API for short-lived credentials if you want to avoid hardcoding.

### 2. Twilio Network Traversal Service

Pay-as-you-go, well-documented. Their SDK gives you fresh credentials per session.

### 3. Self-hosted [coturn](https://github.com/coturn/coturn)

Best if you're already running infrastructure. Couple of `apt-get`s and a config file:

```conf
# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
realm=example.com
user=alice:supersecret
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
```

Then your client:

```ts
iceServers: [
  { urls: "turn:turn.example.com:3478", username: "alice", credential: "supersecret" },
  { urls: "turns:turn.example.com:5349", username: "alice", credential: "supersecret" },
],
```

`turns:` is TURN over TLS — useful for getting through corporate proxies that only allow port 443/tcp outbound.

## Forcing relay-only (for testing)

To verify TURN actually works, pass a `iceTransportPolicy` of `relay` so the browser ignores host/srflx candidates:

```ts
iceServers: [{ urls: "turn:..." , username, credential }],
// then in the underlying RTCConfiguration the library passes:
//   { iceTransportPolicy: "relay" }
```

rtc.io doesn't expose `iceTransportPolicy` directly today (the underlying `RTCConfiguration` is built from `iceServers` only). For now you can monkey-patch the polyfill or wait for a future option.

## Generating short-lived credentials

Putting a long-lived TURN password in the browser is bad — anyone can steal it and use your TURN bandwidth.

The fix: have your server mint short-lived (e.g. 10 min) HMAC-signed credentials per call. Coturn's [REST API auth](https://github.com/coturn/coturn/blob/master/turndb/schema.userdb.redis) is the standard pattern:

```ts title="server.ts"
import crypto from "node:crypto";

function turnCredentials(secret: string, ttl = 600) {
  const username = String(Math.floor(Date.now() / 1000) + ttl);
  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");
  return { username, credential };
}

socket.on("ask-ice", (cb) => {
  cb({
    iceServers: [
      { urls: "stun:turn.example.com:3478" },
      { urls: "turn:turn.example.com:3478", ...turnCredentials(SHARED_SECRET) },
    ],
  });
});
```

Client side:

```ts
const { iceServers } = await new Promise((res) =>
  socket.server.emit("ask-ice", res)
);
const socket = io(URL, { iceServers });
```

## Debugging connectivity

Use `socket.getIceCandidateStats(peerId)` to see which candidates each side gathered and which one was selected:

```ts
const stats = await socket.getIceCandidateStats(peerId);
console.log(stats);
// → { localCandidates, remoteCandidates, candidatePairs }
```

Each candidate has a `type`: `host` (LAN), `srflx` (STUN-discovered public), `prflx` (peer-reflexive), `relay` (TURN). If you see only `host` candidates and you're testing across networks, your STUN server isn't reachable. If you see `srflx` but ICE still fails, you're looking at a symmetric NAT and need TURN.

[`getSessionStats`](stats) gives you the round-trip time on the selected pair — useful for picking which candidate type ended up live.

## Mesh limits, not network limits

A reminder: even with perfect TURN, rtc.io is full-mesh. N peers means N×(N−1)/2 connections; doubling the participant count quadruples the upload bandwidth per peer. That's not an ICE issue, it's a topology issue — see [the introduction](/) for when to reach for an SFU.
