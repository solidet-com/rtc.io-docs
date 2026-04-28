---
id: security
title: Security model
description: What rtc.io guarantees, what's spoofable, and how to think about end-to-end encryption, reserved events, TURN credential leakage, and CORS.
---

# Security model

rtc.io rides on top of standard WebRTC primitives, so the security baseline is whatever the browser ships:

- **All media is DTLS-SRTP encrypted** between the two browsers. Even your TURN relay only sees ciphertext (TURN forwards UDP packets it can't read).
- **All DataChannel traffic is SCTP over DTLS.** Same encryption envelope.
- **The signaling server sees offers, answers, ICE candidates, and any `socket.server.emit` payloads.** Once the peer connection is up, your `socket.emit` traffic is end-to-end encrypted between browsers.

What this means: **the signaling server is not a privileged party for the data path.** Even if you don't trust your hosting provider, your media is unreadable to them once the connection is established.

## What the signaling server *can* see

- Socket ids of who's talking to whom.
- Room ids (in your application-level events).
- Any application-level events you push through `socket.server.emit` (the explicit escape hatch). Use this only for things you're OK with the server seeing — typically `join-room`, presence, ICE-credential vending.
- Bytes of `#rtcio:message` envelopes (offers/answers/candidates). These contain SDP and ICE candidate info but no media.

What it can't see:

- Your `socket.emit` traffic (DataChannel).
- Your camera/mic.
- File transfers, chat, anything that goes over a peer-to-peer channel.

## Reserved event spoofing

DataChannels carry JSON envelopes with an event name. A malicious peer could try to send `{ e: "peer-connect", d: [{ id: "victim" }] }` to fire your `peer-connect` listener for a fake id.

rtc.io filters those on receive:

```ts title="rtc.ts (excerpt)"
if (name.startsWith(INTERNAL_EVENT_PREFIX) || RESERVED_EVENTS.has(name)) {
  this.log("warn", "Ctrl: dropped reserved event from peer", { peer, name });
  return;
}
```

Reserved names: `peer-connect`, `peer-disconnect`, `track-added`, anything starting with `#rtcio:`. These can only be fired by your local socket. A peer trying to spoof one is logged and dropped.

This is the same kind of trust boundary socket.io has between client and server, just reflected per-peer.

## What peers *can* spoof

Anything that isn't a reserved event. Application-level events (`chat`, `media-state`, `position`, etc.) are fully under peer control. Treat them as untrusted input:

- Validate shape and types before using them.
- Rate-limit per peer if the event is amplifying (e.g. starting an N-way fanout).
- Don't trust a peer's claim about their own identity beyond what your room model already enforces — the socket id is authoritative, peer-supplied names are not.

In the demo we use `id: socket.id` as the trust anchor and `name` as cosmetic display data. A peer can lie about their name; they can't change what id arrives at the server.

## TURN credentials

If you put a long-lived TURN username/password in the client bundle, it's public. Anyone can scrape your build artifacts and use your TURN bandwidth for their own apps.

Don't do that. The right pattern:

1. Server holds a TURN secret (or uses Cloudflare/Twilio's token-mint API).
2. Client requests fresh credentials at connect time.
3. Server returns short-lived (5–10 min) HMAC-signed credentials.

There's a worked example in [ICE and TURN](ice-and-turn).

## Origin / CORS

rtc.io's signaling traffic is regular socket.io. The `cors.origin` server option controls who can connect:

```ts
const server = new Server({
  cors: { origin: ["https://yourapp.com", "https://staging.yourapp.com"] },
});
```

In dev `origin: "*"` is fine. In prod, lock it down to your origins so random sites can't piggy-back on your server.

## Authentication

The library has **no opinion** on auth — that's your server's job. Two reasonable patterns:

**Token in the connect query:**

```ts
// client
const socket = io(URL, {
  iceServers: [...],
  auth: { token: jwt },
});

// server
io.use((socket, next) => {
  const ok = verifyJwt(socket.handshake.auth.token);
  if (!ok) return next(new Error("unauthorized"));
  socket.data.userId = ok.sub;
  next();
});
```

**Server-side room membership:**

Refuse `join-room` for users not on the allow-list. The server is the only authority that decides which sockets are in which socket.io rooms; without joining the room, peers don't get the `#rtcio:init-offer` and never start a peer connection.

```ts
socket.on("join-room", async ({ roomId }) => {
  const allowed = await isMember(socket.data.userId, roomId);
  if (!allowed) return;
  socket.join(roomId);
  socket.to(roomId).emit("#rtcio:init-offer", { source: socket.id });
});
```

## Rate limiting

The server is a relay. A misbehaving client can `#rtcio:message` thousands of times a second and force the server to fan them out. Add per-socket rate limiting at the socket.io middleware layer:

```ts
import rateLimit from "p-throttle";

const throttle = rateLimit({ limit: 50, interval: 1000 });

io.use((socket, next) => {
  socket.use((event, next) => throttle(() => next()));
  next();
});
```

50 events/sec/socket is plenty for normal signaling and would slow down a flood.

## Disposing of media on leave

When a user leaves the room, **stop the local tracks** so the camera/mic indicator goes off:

```ts
localStream.getTracks().forEach(t => t.stop());
```

Just disconnecting the socket isn't enough — the `MediaStream` still owns the camera until the tracks are explicitly stopped. This is a privacy issue in shared browser environments (kiosk, lab computer) where the next user otherwise sees their camera light on.

## End-to-end vs hop-by-hop

DTLS-SRTP/SCTP guarantees the link is secure between the two endpoints. It does **not** guarantee identity beyond that — you're trusting the peer is who the server told you they are. If you need stronger identity (e.g. for medical or financial use), layer your own auth on top: have the server vouch for each peer's identity in a signed envelope, verify on the client.

For most apps the socket-id-is-identity model is fine.
