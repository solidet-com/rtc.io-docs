---
id: client
title: 2. Connect a client
description: Bootstrap the client, join a room, watch peers come and go.
---

# 2. Connect a client

Time to spin up a browser app that talks to your signaling server.

## Project setup

If you don't already have a frontend, scaffold one with Vite:

```bash
npm create vite@latest my-rtcio-client -- --template vanilla-ts
cd my-rtcio-client
npm install rtc.io
npm run dev
```

The dev server starts on `http://localhost:5173`. Open it; you should see Vite's starter page.

## Replace the starter

Open `src/main.ts` and replace it entirely:

```ts title="src/main.ts"
import io from "rtc.io";

const SERVER = "http://localhost:3001";   // or "https://server.rtcio.dev"
const ROOM = new URLSearchParams(location.search).get("room") ?? "rtcio-tutorial";
const NAME = prompt("Your name?") ?? "Guest";

const socket = io(SERVER, {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

socket.on("connect", () => {
  console.log("connected to signaling, my id is", socket.id);
  socket.server.emit("join-room", { roomId: ROOM, name: NAME });
});

socket.server.on("user-connected", ({ id, name }: { id: string; name: string }) => {
  console.log("peer joined:", name, id);
});

socket.server.on("user-disconnected", ({ id }: { id: string }) => {
  console.log("peer left:", id);
});

socket.on("peer-connect", ({ id }: { id: string }) => {
  console.log("peer connection up:", id);
});

socket.on("peer-disconnect", ({ id }: { id: string }) => {
  console.log("peer connection down:", id);
});
```

Replace `index.html`'s body with something minimal:

```html title="index.html"
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>rtc.io tutorial</title>
</head>
<body style="background:#0a0908;color:#f3ece0;font-family:sans-serif;padding:24px;">
  <h1>rtc.io tutorial</h1>
  <p>Open the console — you should see peers come and go.</p>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

## Run it

`npm run dev` is already running. Open `http://localhost:5173` in two tabs (in the same browser, or in a private window for the second). Each tab will prompt for a name.

Watch the console in both tabs. You should see, in order:

```
connected to signaling, my id is <id>
peer joined: <other name> <other id>
peer connection up: <other id>
```

If only the first line appears, the second tab isn't reaching your server — check `SERVER` is correct.

## What's happening

The first tab connects, joins the room, and waits. The server records it as a member.

When the second tab joins, the server:

1. Tells the second tab about the first (`user-connected` to the joiner).
2. Tells the first tab about the second (`user-connected` to the room).
3. Tells the first tab to initiate a WebRTC handshake (`#rtcio:init-offer` to the room).

The library on the first tab receives the `#rtcio:init-offer`, creates a peer connection, exchanges offers/answers/ICE candidates with the second tab through the server. Once the WebRTC handshake completes and the ctrl DataChannel opens, both tabs fire `peer-connect`.

You haven't seen any of that — the library does it. You just watch the lifecycle events.

## Track peer state in your app

A more useful version maintains a list:

```ts title="src/main.ts (additions)"
type Peer = { id: string; name: string };
const peers = new Map<string, Peer>();

socket.server.on("user-connected", ({ id, name }) => {
  peers.set(id, { id, name });
  render();
});

socket.server.on("user-disconnected", ({ id }) => {
  peers.delete(id);
  render();
});

function render() {
  document.body.innerHTML = `
    <h1>rtc.io tutorial</h1>
    <p>You are ${NAME} (${socket.id ?? "..."}).</p>
    <h2>Peers in the room</h2>
    <ul>${Array.from(peers.values()).map(p => `<li>${p.name} (${p.id})</li>`).join("")}</ul>
  `;
}

socket.on("connect", render);
```

Reload both tabs. You'll see a live list of peers.

## A note on `peer-connect` vs `user-connected`

These two events fire at different times and mean different things:

- **`user-connected`** (server-routed) — fires the moment the server records the new socket joining the room. Triggers immediately on join.
- **`peer-connect`** (rtc.io reserved) — fires when the *peer-to-peer* DataChannel is open. Triggers a moment later, after offer/answer/ICE/SCTP.

For roster UI, use `user-connected`. For "this peer is reachable for `socket.emit`," use `peer-connect`. They're both useful.

## What's next

You have a working signaling-only setup. Time to add media.

[Next: 3. Send camera and mic →](streams)
