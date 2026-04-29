---
id: peer
title: socket.peer(id)
description: Targeted per-peer messaging — emit, on, off, createChannel scoped to one peer.
---

import StackBlitz from '@site/src/components/StackBlitz';
import { perPeerRpc } from '@site/src/examples';

# socket.peer(id)

```ts
socket.peer(peerId: string): {
  emit(event: string, ...args: any[]): void;
  on(event: string, handler: (...args) => void): void;
  off(event: string, handler: (...args) => void): void;
  createChannel(name: string, options?: ChannelOptions): RTCIOChannel;
}
```

A scoped view of a single peer's ctrl channel. `emit` reaches only that peer; `on` only fires for events *from* that peer; `createChannel` opens a DataChannel between just the two of you.

## emit — targeted ctrl message

```ts
socket.peer(targetId).emit("rpc", { method: "ping" });
```

Goes over the same ctrl DataChannel as `socket.emit`, but only one peer receives it (we send only to that peer's connection). The event-name reservation rules apply: you can't `emit("peer-connect", ...)` because the receiver filters it out.

If the targeted peer doesn't exist (wrong id, peer left), the call is a no-op. No error is thrown.

A trailing function argument (the socket.io ack idiom) is dropped with a warning. DataChannels don't have acks.

## on / off — peer-scoped listeners

```ts
socket.peer(targetId).on("rpc-result", handler);
socket.peer(targetId).off("rpc-result", handler);
```

These register handlers on the per-peer listener map (`_peerListeners`). They fire **in addition to** any global `socket.on(name, ...)` handlers — so if you have both, both run.

A typical separation:

- `socket.on("chat", ...)` — global chat handler, you don't care which peer.
- `socket.peer(id).on("rpc-result", ...)` — you sent an RPC to one peer, you only want that peer's reply.

Per-peer listeners are automatically cleaned up when the peer disconnects.

## createChannel — per-peer DataChannel

```ts
const file = socket.peer(targetId).createChannel("file", { ordered: true });
```

Opens a [DataChannel](rtciochannel) between you and just that peer. Both sides need to call `createChannel` with the same name — typically inside `peer-connect` for symmetry:

```ts
socket.on("peer-connect", ({ id }) => {
  const file = socket.peer(id).createChannel("file", { ordered: true });
  file.on("data", (chunk) => receiver.push(chunk));
});
```

The channel uses `negotiated:true` with a deterministic SCTP id derived from the channel name (see [DataChannels](/docs/guides/datachannels) for the hashing details). If both sides don't open the channel with the same name, sends will be dropped at the SCTP layer on the receive side.

## Patterns

### Request/response RPC

```ts
function rpc(peerId, method, params) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const onReply = (msg) => {
      if (msg.id !== id) return;
      socket.peer(peerId).off("rpc-reply", onReply);
      msg.error ? reject(msg.error) : resolve(msg.result);
    };
    socket.peer(peerId).on("rpc-reply", onReply);
    socket.peer(peerId).emit("rpc-call", { id, method, params });
  });
}

// On the responder side:
socket.peer(senderId).on("rpc-call", async ({ id, method, params }) => {
  try {
    const result = await dispatch(method, params);
    socket.peer(senderId).emit("rpc-reply", { id, result });
  } catch (err) {
    socket.peer(senderId).emit("rpc-reply", { id, error: err.message });
  }
});
```

You'd usually want to wrap this in a tiny helper. The point is that `socket.peer(id)` makes per-peer correlation easy.

### Targeted state push on join

```ts
socket.on("peer-connect", ({ id }) => {
  socket.peer(id).emit("media-state", { mic: micOn, cam: camOn });
});
```

Standard pattern: when a new peer's ctrl channel opens, push your current state. The new peer receives it on `peer.on("media-state", ...)` (or via a global `socket.on`).

### One-to-one large transfer

For a per-peer file transfer, open a per-peer channel rather than a broadcast — broadcast would fan your bytes to peers that don't need them.

```ts
socket.on("peer-connect", ({ id }) => {
  const ch = socket.peer(id).createChannel("file", { ordered: true });
  // both sides do this; channel matches automatically.
});

await sendFileOverChannel(socket.peer(id).createChannel("file"), file);
```

Calling `createChannel("file")` again is idempotent — you get back the same channel instance.

## Limits

- Don't call `socket.peer(id).emit(...)` from inside an `onnegotiationneeded` handler. The ctrl channel may not be open yet during early negotiation; rtc.io will queue the envelope, but you should generally wait for `peer-connect` before sending.
- The `id` is the remote socket's `socket.id` as known to the signaling server. If your room logic uses different identifiers, map between them in your application code.

## Live example

A simple ping/pong RPC. `socket.peer(id).emit('ping', ...)` sends to one peer; the receiver replies via `socket.peer(payload.from).emit('pong', ...)`. Click **Open 2nd tab ↗** inside the preview, then click each peer's **Ping** button.

<StackBlitz
  files={perPeerRpc}
  template="node"
  file="src/main.ts"
  title="Per-peer ping/pong"
  summary="Targeted send + reply — same shape as RPC, fan-out, or any 'one peer at a time' protocol."
/>
