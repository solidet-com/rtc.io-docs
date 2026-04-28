---
id: how-it-works
title: How it works
sidebar_position: 3
description: An end-to-end walk through what happens between socket.emit and a peer receiving the message — signaling, offer/answer, ICE, DataChannel attach, stream replay.
---

# How it works

This page traces a full session — from `io(url)` to peer connection up to a chat message arriving on the other side. If you only care about the API, you can skip to [Getting started](getting-started). If you want to understand why your `emit` works without you ever seeing an SDP offer, this is the page.

## The pieces

```
┌──────────────┐                 socket.io                ┌──────────────┐
│  Browser A   │  ──────────────────────────────────────  │  Browser B   │
│              │                  (signaling)              │              │
│  rtc.io      │                                           │  rtc.io      │
│  Socket      │                                           │  Socket      │
└──────┬───────┘                                           └──────┬───────┘
       │                                                          │
       │              RTCPeerConnection (DTLS-SRTP/SCTP)           │
       └──────────────────────────────────────────────────────────┘
                            peer-to-peer media + data
```

There's only one server. It speaks `socket.io`. Its single job is to let two browsers exchange ~5 messages so they can establish a direct peer connection — after that the server is out of the loop.

## Step 1 — `io(url)`: a socket.io connection

When you call `io(url, opts)`:

```ts
const socket = io("https://server.rtcio.dev", {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});
```

…rtc.io's `Socket` extends `socket.io-client`'s `Socket` and adds:

- a `peers` map (one `RTCPeerConnection` per remote socket id);
- a per-peer signaling queue (so concurrent offer/answer/candidate messages don't interleave);
- listeners for the rtc.io reserved events (`#rtcio:init-offer`, `#rtcio:message`).

Nothing else happens yet. There's no `RTCPeerConnection` until a peer shows up.

## Step 2 — joining a room (your code)

The library has no opinion on rooms. You write:

```ts
socket.server.emit("join-room", { roomId, name });
```

`socket.server.emit` is the *escape hatch* — it goes straight through socket.io, bypassing rtc.io's DataChannel routing. The server side handles it:

```ts
socket.on("join-room", ({ roomId, name }) => {
  socket.data.name = name;
  socket.join(roomId);

  // Tell every existing peer in the room to initiate an offer to the new one.
  socket.to(roomId).emit("user-connected", { id: socket.id, name });
  socket.to(roomId).emit("#rtcio:init-offer", { source: socket.id });
});
```

Two server-to-client emits go out:

- `user-connected` — your application-level event, useful for showing a roster.
- `#rtcio:init-offer` — an rtc.io reserved event. Tells the existing peer (the **polite** side) to start an offer toward the joiner.

## Step 3 — `RTCPeerConnection` setup

The polite side receives `#rtcio:init-offer`. The library's listener creates a fresh `RTCPeerConnection`, sets `oniceconnectionstatechange`, `onconnectionstatechange`, `onicecandidate`, `onnegotiationneeded`, `ontrack`, `ondatachannel`, and **immediately creates the ctrl DataChannel**:

```ts
peer.connection.createDataChannel("rtcio:ctrl", {
  negotiated: true,
  id: 0,
  ordered: true,
});
```

The `negotiated: true` + `id: 0` combination is important: both sides will create a DataChannel with the same id and label, *without* exchanging a DC-OPEN handshake. Once SCTP comes up they're already paired. (The same pattern is used for every named channel; the id is a hash of the channel name. See [DataChannels](guides/datachannels).)

The polite side then either:

- replays any local streams onto the new peer (`socket.emit("camera", stream)` calls made before the peer existed are stored in a registry and re-applied to new peers);
- or, if there are no streams yet, just lets the ctrl DataChannel float through.

`addTransceiver(track, { direction: "sendonly", streams: [media] })` is what registers a local track for sending. The browser's `onnegotiationneeded` fires automatically.

## Step 4 — Perfect negotiation

`onnegotiationneeded` runs the [W3C perfect-negotiation pattern](guides/perfect-negotiation). In one paragraph:

> Both sides can call `setLocalDescription()` at any time. If both sides do it simultaneously you have *glare*. The fix: pick one side as **polite** (rolls back its offer if a remote one comes in mid-flight) and the other **impolite** (ignores remote offers when it's mid-offer itself). rtc.io marks the polite side as the *initiator* of the connection — the one who got `#rtcio:init-offer` — and the impolite side as the *receiver*.

In practice that's:

```
polite                          impolite
─────                          ─────────
makeOffer()  →─── offer ────→   setRemoteDescription
                               makeAnswer()
setRemoteDescription  ←── answer ───
trickle ICE candidates →── candidates ──→ trickle ICE candidates
```

All of which is wrapped behind `socket.emit("#rtcio:message", ...)` to the server, and `socket.to(target).emit("#rtcio:message", ...)` from the server back. The server is just relaying envelopes:

```ts
type MessagePayload<T> = { source: string; target: string; data: T };
```

…where `data` is one of `{ description }`, `{ candidate }`, `{ mid, events }`, or `{ mid }`. The library multiplexes everything onto this single envelope. The server only registers one handler:

```ts
socket.on("#rtcio:message", (data) => {
  socket.to(data.target).emit("#rtcio:message", data);
});
```

That's the entire contract.

## Step 5 — DataChannel + media open

Once SCTP is up, the ctrl DataChannel's `onopen` fires on both sides. rtc.io's listener:

1. Drains any queued envelopes (messages buffered while the channel was still connecting).
2. Emits `peer-connect` on the local socket — your app's hook for "this peer is ready."

Once DTLS-SRTP is up, the remote tracks fire `ontrack` on the receiving side. rtc.io looks up which `RTCIOStream` they belong to (via the `stream-meta` envelope) and calls your `socket.on("camera", ...)` handler with a wrapped `RTCIOStream`.

All subsequent traffic — `socket.emit("chat")`, `socket.peer(id).emit("rpc")`, `chat.emit("msg")`, `file.send(buf)` — flows over DataChannels and never touches the server.

## What goes over what

| Traffic | Transport |
|---|---|
| Offer/answer/ICE candidates | socket.io → server → socket.io |
| `socket.server.emit/on` | socket.io → server → socket.io |
| `socket.emit('user-event', ...)` | DataChannel `rtcio:ctrl` (id 0), broadcast to all peers |
| `socket.peer(id).emit(...)` | DataChannel `rtcio:ctrl`, targeted to one peer |
| `socket.createChannel('x')` traffic | DataChannel `rtcio:ch:x` (negotiated id from hash of name) |
| `RTCIOStream` audio/video | RTP over DTLS-SRTP transceivers |

## What you don't have to think about

- **Glare** — handled by the polite/impolite pattern.
- **Stale answers** — if `setRemoteDescription` rejects on a stable signaling state, rtc.io drops the answer and waits for the next one rather than throwing.
- **ICE failures** — `iceConnectionState === "failed"` triggers `restartIce()`. The connection self-heals if the network blips.
- **Late joiners** — streams you `emit`ed before peer X showed up get replayed onto peer X automatically.
- **Track changes** — toggle a track's `enabled`, replace it via `replaceTrack`, or `addTrack`/`removeTrack` on the underlying `MediaStream` — rtc.io reuses idle transceivers and avoids spinning up new ones.
- **Backpressure** — every channel has a `bufferedAmount` watermark and a queue budget; `send()` returns false when the channel is full and emits `drain` when it's safe to resume.
- **Channel pairing** — `negotiated:true` with deterministic ids means no DC-OPEN handshake, no glare on the channel layer.

## What you do have to think about

- **Your application protocol.** rtc.io doesn't tell you what events to send or how to model rooms. It gives you `emit`/`on` and lets you decide.
- **TURN if you need it.** STUN handles ~80% of NATs. Symmetric NATs (some corporate networks, carrier-grade NAT) need a TURN relay. See [ICE and TURN](guides/ice-and-turn).
- **Mesh limits.** Connections are full-mesh: N peers means N×(N−1)/2 connections. That's fine up to 6–8 peers. Beyond that you want an SFU.

## Next

- **[Perfect negotiation](guides/perfect-negotiation)** — the W3C pattern in detail.
- **[ICE and TURN](guides/ice-and-turn)** — connectivity beyond STUN.
- **[DataChannels](guides/datachannels)** — broadcast vs per-peer, hash collisions, options.
