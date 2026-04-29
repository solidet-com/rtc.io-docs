---
id: intro
title: Build a video room
description: Step-by-step build of a real video room — server, client, streams, chat, file transfer, deployment. Mirrors the public demo at rtcio.dev.
---

import LiveDemoLink from '@site/src/components/LiveDemoLink';

# Tutorial: Build a video room

Over the next ~30 minutes you'll build a working browser-to-browser video room with:

- **Audio + video** between two or more participants.
- **A presence list** ("who's in the room").
- **Broadcast chat** over a peer-to-peer DataChannel.
- **File transfer** between peers.
- **A signaling server** — either ours (`server.rtcio.dev`) or your own.

This mirrors the demo at [rtcio.dev](https://rtcio.dev) — code is intentionally small enough to fit in your head.

## What you need

- Node 18+ (for the server step).
- A modern browser (Chrome, Edge, Firefox, Safari 16+).
- Two browser tabs for testing locally — or two devices on the same network for the more realistic case.

You don't need:

- Any WebRTC knowledge. The whole point of the library is that you don't write SDPs or ICE candidates.
- A signing/key infrastructure. Your local dev runs on `http://localhost`; getUserMedia works at localhost without HTTPS.

## How the tutorial is organized

| Step | What you'll do |
|---|---|
| [Server](server) | Set up either the public server or run your own |
| [Client](client) | Connect, join a room, see peers |
| [Streams](streams) | Wire up camera/mic, see them on the other end |
| [Chat](chat) | Broadcast chat over a DataChannel |
| [Files](files) | Per-peer file transfer with progress |
| [Deploy](deploy) | Get it onto the internet |

Each step builds on the previous. By the end you'll have a complete app you could ship.

## Code style

We'll use TypeScript-flavored JS (the `as` casts and `: Type` annotations are optional — drop them for plain JS if you prefer). Snippets are runnable as-is in a Vite project; if you're using a different bundler the code is identical, just the build setup differs.

For brevity we use vanilla DOM in the snippets (`document.getElementById`, `srcObject`, raw event listeners). In a real React/Vue/Svelte app you'd wrap the same calls in components. The library doesn't care.

## Skipping ahead

If you've used WebRTC libraries before and just want a working starting point, [the demo source on GitHub](https://github.com/solidet-com/rtc.io/tree/main/rtcio-web) is a complete React app — closer to what you'd actually ship. It uses the same APIs this tutorial covers, plus production niceties (mobile UI, password-protected rooms, device pickers) that are out of scope here.

<LiveDemoLink
  blurb="A complete React + Vite app built on rtc.io — the production-shaped version of what this tutorial walks through. Opens in a real tab so camera, mic, screen-share and fullscreen all behave the way they would in your own app."
/>

If you want the API reference, head to the [Client API](/docs/api/socket) section.

Otherwise, start with [Server →](server).
