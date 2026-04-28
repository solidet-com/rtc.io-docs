---
id: chat
title: 4. Add chat
description: Open a broadcast DataChannel for chat. Messages flow peer-to-peer; the server doesn't see them.
---

# 4. Add chat

You'd think chat needs a server. It doesn't — once peers are connected, they talk directly via DataChannels. The server isn't involved in chat traffic at all.

## Open a broadcast channel

```ts
const chat = socket.createChannel("chat", { ordered: true });
```

`createChannel` returns an `RTCIOBroadcastChannel`. It's logically one channel that's shared with every connected peer (and any peer that joins later). Internally it's a `Map<peerId, RTCIOChannel>` — one per-peer DataChannel under the hood — but you don't see that.

The `ordered: true` flag forces in-order delivery (the SCTP default for new channels). For chat that's what you want.

## Send and receive

```ts
chat.on("msg", (msg: { name: string; text: string; at: number }) => {
  appendChat(msg.name, msg.text, msg.at);
});

chat.emit("msg", { name: NAME, text: "hello", at: Date.now() });
```

`emit` and `on` here work the same way as `socket.emit` / `socket.on` — JSON envelopes with an event name and args. The difference is that traffic is scoped to this channel; events on other channels don't fire here.

## Wire up the UI

Add a chat box to the page:

```ts
const log = document.createElement("div");
log.style.cssText = "border:1px solid #333;padding:10px;width:300px;height:200px;overflow:auto;";
document.body.appendChild(log);

const input = document.createElement("input");
input.placeholder = "Type and hit Enter";
input.style.cssText = "width:300px;margin-top:6px;";
document.body.appendChild(input);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && input.value.trim()) {
    const msg = { name: NAME, text: input.value, at: Date.now() };
    chat.emit("msg", msg);
    appendChat(msg.name, msg.text, msg.at);   // local echo
    input.value = "";
  }
});

function appendChat(from: string, text: string, at: number) {
  const time = new Date(at).toLocaleTimeString();
  const line = document.createElement("div");
  line.textContent = `[${time}] ${from}: ${text}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

chat.on("msg", ({ name, text, at }) => appendChat(name, text, at));
```

Reload both tabs. Type in one, watch it appear in both. You'll notice it's instantaneous — there's no server hop.

## What about late joiners?

Both peers register `createChannel("chat", { ordered: true })` at startup. When a third tab joins:

1. The new tab also calls `createChannel("chat")`.
2. The library's `_channelDefs` registry — which records every broadcast channel name + options you've ever called `createChannel` with — gets walked for each new peer connection.
3. The new tab opens a per-peer DataChannel to each existing peer with the matching name.
4. The library calls `_addPeer` on each existing tab's broadcast channel, attaching the new peer's underlying channel and replaying every `on(...)` subscription onto it.

Result: the new tab's `chat.on("msg")` handler fires for messages from any of the existing peers, and `chat.emit("msg", ...)` fans out to all of them.

You don't write any of this. The replay registry takes care of it.

## Detecting peers leaving

Broadcast channels expose a `peer-left` event for when one of the underlying per-peer channels closes:

```ts
chat.on("peer-left", (peerId) => {
  appendChat("system", `${peerId} left the chat`, Date.now());
});
```

This is broadcast-channel-scoped. To know about *peer connection* lifecycle (which is broader than chat), use `socket.on("peer-disconnect", ...)`.

## Why DataChannels not the server

You could route chat through the server — `socket.server.emit("chat", msg)` and a server handler that broadcasts. It works. But:

- **Latency.** Server-routed chat is ~80–150 ms one-way (your → server → peer). DataChannel chat is ~10–30 ms (your → peer directly).
- **Privacy.** Server-routed chat goes through your server in plaintext. DataChannel chat is end-to-end encrypted (DTLS-SCTP). The server can't read it.
- **Cost.** Server-routed chat adds CPU and bandwidth on your server. DataChannel chat is free.

For chat that doesn't need persistence, peer-to-peer wins on every axis. For chat that *does* need persistence (history surviving reloads), keep server-routed.

## Multiple channels

You can open as many channels as you want, each with its own ordering/retransmit profile. A common shape:

```ts
const chat = socket.createChannel("chat", { ordered: true });
const cursors = socket.createChannel("cursor", { ordered: false, maxRetransmits: 0 });
const reactions = socket.createChannel("reaction", { ordered: false });
```

`chat` is reliable and ordered (every message matters). `cursors` is unreliable and unordered (freshness > completeness). `reactions` is somewhere in between (unordered but eventually-consistent).

Each channel has its own SCTP stream id (derived deterministically from the name — see [DataChannels](/docs/guides/datachannels)). They don't interfere with each other.

## What's next

[Next: 5. File transfer →](files)
