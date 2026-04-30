---
id: getting-started
title: Getting started
sidebar_position: 2
description: Install rtc.io, connect a client to a signaling server, exchange media, send a chat message. Five minutes end-to-end.
---

import StackBlitz from '@site/src/components/StackBlitz';

# Getting started

In five minutes you'll have two browser tabs talking to each other over a peer-to-peer connection: video, audio, and a broadcast chat channel.

We'll skip running a server for now and use the public **[server.rtcio.dev](https://server.rtcio.dev)** signaling endpoint. Self-hosting is one `npm install` away and is covered in [the server section](server/installation).

:::caution Heads-up about the public server

`server.rtcio.dev` is a single shared, unauthenticated namespace — every app pointing at it lands in the same room namespace. **Always use a hard-to-guess `roomId` (a UUID, or 16+ random characters via `crypto.randomUUID()`)**. Short or predictable names like `demo`, `test`, or `team-standup` will almost certainly collide with other people running the same tutorial. The snippets below use `crypto.randomUUID()` so they're collision-safe out of the box. Read [the public server caveats](server/public-server) before using it for anything beyond a private experiment.
:::

## Install

The client is one npm package:

```bash
npm install rtc.io
```

If you're using a CDN (no build step), [esm.sh](https://esm.sh) serves rtc.io with its bare-specifier dependencies (`socket.io-client`, etc.) resolved for the browser:

```html
<script type="module">
  import io, { RTCIOStream } from "https://esm.sh/rtc.io";
  // ...
</script>
```

:::note Don't open the file with `file://`
Browsers treat `file://` as an opaque origin: ESM imports from CDNs and `getUserMedia` are both blocked. Serve the page over HTTP — e.g. `python3 -m http.server` or `npx serve` — and open `http://localhost:<port>/`. `localhost` counts as a secure context, so the camera/mic prompt works.
:::

## Minimum viable peer connection

A complete two-tab demo. Save as `index.html`, open it in two tabs, you'll see your camera in both and audio flowing both ways.

```html title="index.html"
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>rtc.io minimal demo</title>
  <style>
    body { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 16px; background: #0a0908; }
    video { width: 100%; aspect-ratio: 16/9; background: #1a1a1a; border-radius: 8px; }
  </style>
</head>
<body>
  <video id="local" autoplay playsinline muted></video>
  <video id="remote" autoplay playsinline></video>

  <script type="module">
    import io, { RTCIOStream } from "https://esm.sh/rtc.io";

    // Hard-to-guess room id is essential on the shared public server.
    // First tab generates one; second tab reads it from `?room=...`.
    const params = new URLSearchParams(location.search);
    let ROOM = params.get("room");
    if (!ROOM) {
      ROOM = crypto.randomUUID();
      // Drop the room id into the URL so you can copy it into a second tab.
      history.replaceState(null, "", `?room=${ROOM}`);
    }

    const socket = io("https://server.rtcio.dev", {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    const local = await navigator.mediaDevices.getUserMedia({
      video: true, audio: true,
    });
    document.getElementById("local").srcObject = local;
    const camera = new RTCIOStream(local);

    socket.server.emit("join-room", { roomId: ROOM, name: "guest" });
    socket.emit("camera", camera);

    socket.on("camera", (remote) => {
      document.getElementById("remote").srcObject = remote.mediaStream;
    });
  </script>
</body>
</html>
```

Serve the directory (`python3 -m http.server 8080`) and open `http://localhost:8080/` in two tabs (or two browsers). Grant camera/mic access in each.

What just happened, in order:

1. `io(...)` opens a socket.io connection to `server.rtcio.dev`. Behind it lives `Manager` + `Socket` from `socket.io-client`, with rtc.io's `RTCPeerConnection` orchestration layered on top.
2. `socket.server.emit("join-room", ...)` is the *only* application-level event the demo backend understands — it joins the socket.io room and tells every existing peer to start an offer to the newcomer.
3. The first tab to load establishes the room. When the second tab joins, both tabs run the [perfect-negotiation](guides/perfect-negotiation) handshake against each other, transparent to your code.
4. Once the peer connection is alive, `socket.emit("camera", new RTCIOStream(local))` adds your local stream's tracks as `sendonly` transceivers. The other tab's `socket.on("camera")` handler fires with an `RTCIOStream` wrapper around the remote `MediaStream`.

Note that **the signaling server never sees your media or your chat traffic**. Once the offer/answer/ICE handshake completes, it's not in the data path.

## What `socket.emit` actually does

`rtc.io`'s `Socket` overrides `emit` so the same call has three different routings depending on what you pass:

| You pass… | It goes via… |
|---|---|
| An event name + an `RTCIOStream` | The `RTCPeerConnection`'s transceivers (becomes a media track) |
| An internal event (prefix `#rtcio:`) | The signaling server (offers, answers, candidates) |
| Anything else | The **ctrl DataChannel** — every connected peer, peer-to-peer |

So `socket.emit("chat", "hi")` is a peer-to-peer broadcast over a DataChannel. It does not touch the server.

For the same reason `socket.on("chat", ...)` listens to that DataChannel (and to the per-peer listener registry — see [`socket.peer(...)`](api/peer)). It's not a socket.io event listener; rtc.io intercepts those names.

If you want to talk to the actual signaling server (e.g. application-level events the server routes for you), use `socket.server.emit("foo", ...)` — that's the explicit escape hatch. We use it for `join-room` because rooms are a server concern.

## Adding chat

Append a chat box to the demo:

```ts
const chat = socket.createChannel("chat", { ordered: true });
chat.on("msg", (text) => console.log("peer says:", text));

document.querySelector("input").addEventListener("change", (e) => {
  chat.emit("msg", e.target.value);
});
```

`createChannel` opens a [broadcast DataChannel](api/rtciobroadcastchannel): every peer (and any peer that joins later) shares it. Both sides have to call `createChannel("chat")` for the channel to exist between them — otherwise sends are dropped at the SCTP layer.

The `ordered: true` flag forces in-order delivery (the SCTP default for new channels). Set it to `false` if you'd rather have lower latency at the cost of out-of-order arrivals.

## Detecting peers

```ts
socket.on("peer-connect", ({ id }) => console.log("peer up:", id));
socket.on("peer-disconnect", ({ id }) => console.log("peer gone:", id));
```

`peer-connect` fires when the peer's ctrl DataChannel opens — that's the signal that broadcast channels and `socket.emit` traffic will reach them. `peer-disconnect` fires symmetrically when the peer connection is torn down (manual leave, ICE failure, tab close), but **only if `peer-connect` already fired** — so you can safely use these events to balance acquire/release patterns.

These events are reserved: peers can't spoof them. See [Reserved events](api/events) for the full list.

## What about the lobby / room logic?

The minimal demo above uses `server.rtcio.dev`, which has the bare minimum room logic baked in: `join-room` joins a socket.io room, presence is announced, and `#rtcio:init-offer` is fanned out to existing peers. That's enough for a video room.

For anything more — auth, presence persistence, custom rooms — you'll [run your own server](server/installation). It's about a 30-line file.

## See the full reference app

If you'd rather skip the local setup and just look at the production-shaped version — chat, screen share, file transfer, mobile UI, password-protected rooms — it's running live at **[rtcio.dev](https://rtcio.dev)**, with the source on GitHub.

import LiveDemoLink from '@site/src/components/LiveDemoLink';
import { minimalVideo, broadcastChat } from '@site/src/examples';

<LiveDemoLink />

## Or start with the 60-line version

Same room, no React, no router, no production polish — just `getUserMedia` and `socket.emit('camera', new RTCIOStream(...))`. The code is below; click **Run live** to open it in a real StackBlitz tab so the camera/mic prompts come from the embed origin, not from this docs site.

<StackBlitz
  files={minimalVideo}
  template="node"
  file="src/main.ts"
  title="Minimal video · src/main.ts"
  summary="Eight lines of rtc.io plus two <video> elements. Click 'Open 2nd tab ↗' inside the preview to call yourself."
/>

## A non-media broadcast channel

If you only need a peer-to-peer chat, presence indicator, or shared whiteboard state, you don't have to touch `getUserMedia` at all. `socket.createChannel('chat')` is a broadcast DataChannel — every peer in the room shares it, late joiners are auto-included.

<StackBlitz
  files={broadcastChat}
  template="node"
  file="src/main.ts"
  title="Broadcast chat · src/main.ts"
  summary="A 30-line chat using one createChannel('chat'). Open in multiple tabs to see the broadcast in action."
/>

## Next

- **[Tutorial: Build a video room](tutorial/intro)** — guided end-to-end, with the public server.
- **[How it works](how-it-works)** — what's actually happening behind `emit`.
- **[Why rtc.io](/why)** — the design choices, the trade-offs, the comparison with peerjs / simple-peer / SFUs.
- **[Perfect negotiation](guides/perfect-negotiation)** — the reason your offers don't collide.
- **[Server quickstart](server/quickstart)** — when you outgrow the public server.

:::tip Working with a coding assistant?
The library repo ships an [`AGENTS.md`](https://github.com/solidet-com/rtc.io/blob/main/AGENTS.md) — a single-file primer that documents the API, the patterns, and the common pitfalls in a form a language model can absorb in one read. Hand it over and your assistant will stop guessing at the API.
:::
