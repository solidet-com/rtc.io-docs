---
id: introduction
title: Introduction
sidebar_position: 1
slug: /
description: rtc.io is a WebRTC client and signaling server with socket.io ergonomics. Streams, broadcast and per-peer DataChannels, perfect negotiation, ICE handling — wrapped behind emit/on.
---

import StackBlitz from '@site/src/components/StackBlitz';

# Introduction

[**rtc.io**](https://github.com/solidet-com/rtc.io) ([npm](https://www.npmjs.com/package/rtc.io)) is a WebRTC library for the browser, paired with a thin Node signaling server. It wraps the messy parts of `RTCPeerConnection` — perfect negotiation, ICE candidates, transceivers, DataChannel matching, glare resolution — behind an API that mirrors **socket.io**:

:::note On the name
`rtc.io` is the npm package name. The project lives at **[rtcio.dev](https://rtcio.dev)** (docs at [docs.rtcio.dev](https://docs.rtcio.dev), source on [GitHub](https://github.com/solidet-com/rtc.io)). The `rtc.io` web *domain* is an older, unrelated project we have no affiliation with.
:::

```ts
socket.emit("chat", "hello everyone");
socket.on("chat", (msg) => console.log(msg));
```

Except that `emit` and `on` here travel **directly between browsers** over a peer-to-peer DataChannel — not through the server. The server's only job is to relay setup messages until the peer connection is alive; after that it's out of the data path.

## What's in the box

`rtc.io` is two npm packages:

- **`rtc.io`** — the browser client. Extends `socket.io-client`, adds `RTCPeerConnection` orchestration, stream replay for late joiners, broadcast and per-peer DataChannels, transparent flow control.
- **`rtc.io-server`** — a Node signaling server. Extends `socket.io`, registers a single relay handler for the rtc.io message envelope. Everything else (rooms, presence, app events) is your code.

We also host a free public signaling server at **[server.rtcio.dev](https://server.rtcio.dev)** — point your `io()` URL there to skip the server step entirely while prototyping. **Please read the [public server caveats](server/public-server) before using it for anything beyond a private demo** — the public server is shared with everyone using rtc.io, so anyone who joins a room with the same name lands in the same call.

## What you get

- **Built on socket.io.** rtc.io's client extends `socket.io-client`'s `Socket`, and `rtc.io-server` extends socket.io's `Server`. Every existing socket.io idiom — `io()`, `emit`, `on`, namespaces, rooms on the server, the wire protocol, reconnection — works unchanged. We add peer-to-peer media and DataChannels behind that same API. The credit for the API shape goes to the socket.io team.
- **Standard WebRTC, no surprises.** Native `RTCPeerConnection` under the hood. No SFU, no media server, no custom protocol on the wire. Once connected, your browsers speak DTLS-encrypted SRTP and SCTP straight to each other.
- **Perfect negotiation handled for you.** The W3C polite/impolite pattern with stale-answer detection, manual rollback for older browsers, automatic ICE restart on `connection failed`. Connection failures don't strand calls.
- **Multiple named channels per peer.** A built-in ctrl channel for `socket.emit`, plus any number of named channels — broadcast (`socket.createChannel`) for everyone, or per-peer (`socket.peer(id).createChannel`) for one-to-one. Each has its own ordering and retransmit semantics.
- **Streams as first-class.** Wrap a `MediaStream` in `RTCIOStream`, `emit` it. Late joiners receive it automatically via the replay registry. Toggle tracks at runtime — transceivers are reused.
- **Backpressure built-in.** Per-channel queue budget, high/low watermarks tied to `bufferedAmount`, `drain` events. Big payloads don't blow up your tab.

## What it isn't

- **Not an SFU.** Connections are full-mesh; every browser sends to every other. Great up to ~6–8 peers; for 30+ person rooms or recording, an SFU like [mediasoup](https://mediasoup.org) or [LiveKit](https://livekit.io) is the right choice and rtc.io is happy to coexist.
- **Not opinionated about rooms or auth.** The server is a relay. Wiring up `join-room`, presence, history, OAuth — that's your application code (we have an [example](server/quickstart) but it's just an example).
- **Not a polyfill.** It assumes a modern browser with full WebRTC support (Chrome, Edge, Firefox, Safari 16+).

For a longer write-up of *why* we built it, what use cases pulled us toward it, and how it sits next to peerjs, simple-peer, and the SFU ecosystem, see [Why rtc.io](/why).

## A taste

```ts
import io, { RTCIOStream } from "rtc.io";

const socket = io("https://server.rtcio.dev", {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

// Local camera/mic — ask for permission *before* joining the room so that
// a peer who joins during the browser prompt doesn't see you with an empty
// tile until you accept.
const local = await navigator.mediaDevices.getUserMedia({
  video: true, audio: true,
});
const camera = new RTCIOStream(local);

socket.server.emit("join-room", { roomId: "demo", name: "alice" });
socket.emit("camera", { stream: camera, metadata: { displayName: "Alice" } });

// Remote camera. Metadata you put alongside the stream rides through verbatim.
socket.on("camera", ({ stream, metadata }) => {
  document.querySelector("video.remote").srcObject = stream.mediaStream;
  label.textContent = metadata.displayName;
});

// Chat.
const chat = socket.createChannel("chat", { ordered: true });
chat.on("msg", (text) => append(text));
chat.emit("msg", "hi");

// Lifecycle.
socket.on("peer-connect", ({ id }) => console.log("peer up", id));
socket.on("peer-disconnect", ({ id }) => console.log("peer gone", id));
```

That's the entire surface for a working video room. Keep going to [Getting started](getting-started) for a complete walkthrough.

import { minimalVideo } from '@site/src/examples';

## Try it without leaving this page

Two browsers, eight lines of `rtc.io`, peer-to-peer audio + video. Click below to boot the project, then hit the floating **Open 2nd tab ↗** button in the corner of the preview to spawn a second peer.

<StackBlitz
  files={minimalVideo}
  template="node"
  file="src/main.ts"
  title="Minimal video call · 60 lines, runnable"
  summary="Boots a Vite dev server inside the page and connects to server.rtcio.dev. Click 'Open 2nd tab ↗' inside the preview to call yourself."
/>

For the whole reference app — chat, screen-share, file transfer, mobile UI, device pickers — see [rtcio.dev](https://rtcio.dev) (source on [GitHub](https://github.com/solidet-com/rtc.io/tree/main/rtcio-web)).

## Wire compatibility

The 1.x line uses a unified envelope (`#rtcio:message`) that older 0.x clients don't speak. Pin `rtc.io@^1.1.0` and `rtc.io-server@^1.1.0` together. Mismatched versions silently drop signaling traffic.

## License

MIT.
