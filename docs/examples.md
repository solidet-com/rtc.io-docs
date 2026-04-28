---
id: examples
title: Examples
description: Runnable rtc.io examples — minimal video call, broadcast chat, per-peer messaging, file transfer, late-joiner replay, unordered DataChannels. Each one boots in a browser-native Node.js sandbox.
sidebar_position: 4
---

import StackBlitz from '@site/src/components/StackBlitz';
import LiveDemoLink from '@site/src/components/LiveDemoLink';
import {
  minimalVideo,
  broadcastChat,
  perPeerRpc,
  fileTransfer,
  lateJoinerReplay,
  unorderedChannel,
} from '@site/src/examples';

# Examples

Six self-contained projects, one per concept. Each shows the source inline so you can scan it without leaving the page; click **Run live** on any of them to open it in a real StackBlitz tab — that's where camera/mic prompts, fullscreen, and the like work properly.

All examples connect to the public signaling server at [`server.rtcio.dev`](server/public-server). Open the StackBlitz preview in **two tabs** to see the two ends connect.

## 1 · Minimal video call

The 60-line version of `rtcio-web`. `getUserMedia` → `socket.emit('camera', new RTCIOStream(local))`, two `<video>` elements, that's it.

<StackBlitz
  files={minimalVideo}
  template="node"
  file="src/main.ts"
  title="Minimal video call"
  summary="Two browsers, peer-to-peer audio + video, no UI library. Mirror this when you want to drop rtc.io into an existing app."
/>

## 2 · Broadcast chat (no media)

If you only need a peer-to-peer chat, presence indicator, or shared whiteboard state, you don't need `getUserMedia` at all. `socket.createChannel('chat')` is a broadcast DataChannel — every peer in the room shares it; late joiners are auto-included.

<StackBlitz
  files={broadcastChat}
  template="node"
  file="src/main.ts"
  title="Broadcast chat"
  summary="One createChannel('chat'), every peer shares it. 30 lines including the DOM."
/>

## 3 · Per-peer messaging (RPC pattern)

`socket.peer(id).emit('ping', payload)` sends to one peer; the receiver replies via `socket.peer(payload.from).emit('pong', ...)`. The same shape works for one-to-one chat, RPC, leader election, and per-peer auth handshakes.

<StackBlitz
  files={perPeerRpc}
  template="node"
  file="src/main.ts"
  title="Per-peer ping/pong"
  summary="Open in two tabs, click 'Ping' on each peer row. Reply round-trips over the same per-peer ctrl DataChannel."
/>

## 4 · File transfer with backpressure

Custom per-peer ordered DataChannel + 16 KB chunks + the `send()` / `'drain'` flow-control contract. The same approach scales to multi-GB files without OOMing the tab — the library's queue budget is the safety net.

<StackBlitz
  files={fileTransfer}
  template="node"
  file="src/main.ts"
  title="File transfer · backpressure handled correctly"
  summary="Pick a file in tab #1 to send it to tab #2. Progress bar pauses while the buffer drains."
/>

## 5 · Late-joiner stream replay

`socket.emit('screen', stream)` registers the stream so any peer that joins afterward gets it automatically. `socket.untrackStream(stream)` removes it from the registry when the share ends.

<StackBlitz
  files={lateJoinerReplay}
  template="node"
  file="src/main.ts"
  title="Screen share that survives a late joiner"
  summary="Click 'Share screen' in tab #1 first, THEN open tab #2 — the share lands immediately, even though it started before the second tab connected."
/>

## 6 · Unordered, lossy DataChannel (cursor sync)

Pass `{ ordered: false, maxRetransmits: 0 }` to `createChannel`. The SCTP stream becomes unreliable + unordered — perfect for cursor positions, pose tracking, game state, anything where the next packet is more useful than the last one.

<StackBlitz
  files={unorderedChannel}
  template="node"
  file="src/main.ts"
  title="Unordered DataChannel — cursor sync"
  summary="Move your mouse over the canvas. Each peer's cursor is broadcast over an unreliable + unordered DataChannel — stale frames drop on the floor."
/>

## 7 · The full reference app

For a production-shaped React + Vite app that uses every feature above plus device pickers, mobile UI, password rooms, and image-paste in chat — the demo runs live, not in a sandbox:

<LiveDemoLink />

## How these examples work

The source for each example is rendered inline on this page. Clicking **Run live** opens a real [StackBlitz](https://stackblitz.com) tab — StackBlitz's [WebContainer runtime](https://blog.stackblitz.com/posts/introducing-webcontainers/) runs a real Node.js process (including `npm install` and Vite) directly in your browser. Camera/mic prompts come from the StackBlitz origin, not `docs.rtcio.dev`, so all the WebRTC features behave the same way they would on your own host.

The `<StackBlitz>` component on this site uses [@stackblitz/sdk](https://www.npmjs.com/package/@stackblitz/sdk)'s `openProject` API to post the inline file map at click time — no GitHub repo per example, no API keys, no docs build step.
