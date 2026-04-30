---
id: datachannels
title: DataChannels
description: Broadcast vs per-peer channels, the negotiated:true model, hash IDs, ordering, retransmits, and what happens when you call createChannel.
---

import StackBlitz from '@site/src/components/StackBlitz';
import { broadcastChat, perPeerRpc, fileTransfer, unorderedChannel } from '@site/src/examples';

# DataChannels

DataChannels are how two peers exchange arbitrary bytes (or strings, or JSON envelopes) once a connection is up. rtc.io exposes them in three flavors:

| Flavor | API | Use |
|---|---|---|
| **Ctrl channel** | `socket.emit / socket.on` | Implicit; one channel per peer; carries `socket.emit` user events |
| **Broadcast channel** | `socket.createChannel(name)` | One logical channel shared with every peer (and any peer that joins later) |
| **Per-peer channel** | `socket.peer(id).createChannel(name)` | A named channel just between you and one peer |

This page covers what's happening under each.

## The ctrl channel

Every peer connection in rtc.io starts with a built-in DataChannel called `rtcio:ctrl`, opened with `negotiated: true, id: 0, ordered: true`. Both sides create it independently with the same id, so there's **no DC-OPEN handshake** — it's open as soon as SCTP is up. That's also why `peer-connect` fires when the ctrl channel opens: it's the canonical "this peer is reachable for traffic" signal.

`socket.emit('event', ...args)` and `socket.peer(id).emit('event', ...args)` both go over this channel as JSON envelopes:

```ts
{ e: "event-name", d: [arg1, arg2, ...] }
```

The receiving side parses, then dispatches to:

1. Global listeners registered with `socket.on('event-name', ...)`
2. Per-peer listeners registered with `socket.peer(senderId).on('event-name', ...)`

Reserved event names (`peer-connect`, `peer-disconnect`, `track-added`, anything starting with `#rtcio:`) are filtered on receive — peers can't spoof them, only your local socket can fire them.

## Custom channels: the negotiated:true model

When you call `socket.createChannel('chat', { ordered: true })`, rtc.io creates a DataChannel with:

```ts
peer.connection.createDataChannel("rtcio:ch:chat", {
  negotiated: true,
  id: hashChannelName("chat"),  // deterministic
  ordered: true,
});
```

`negotiated: true` means: *don't* run the in-band DC-OPEN handshake; assume both sides already know about this channel. The `id` is the SCTP stream id; both sides must pick the same one or messages won't pair up.

We pick that id by hashing the name (FNV-1a) modulo 1023, then `+1`:

```ts title="rtc.ts (excerpt)"
function hashChannelName(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 1023) + 1;  // [1, 1023] — id 0 is reserved for ctrl
}
```

The 1023 cap is **Chromium's `kMaxSctpStreams`** — a higher id throws `OperationError: RTCDataChannel creation failed`. Firefox is more permissive but we pick the lowest common denominator.

Why hash? Because both sides need the same id without an extra round-trip. A name-based hash means `socket.createChannel("chat")` on every peer produces the same id. No coordination, no signaling.

### Hash collisions

Two distinct channel names that happen to hash to the same id would collide. rtc.io checks for this on every `createChannel` and throws a clear error:

```
[rtc-io] Channel 'sloths' hash-collides with existing channel 'foo' on peer abc123
(both names hash to SCTP id 47). Pick a different channel name.
```

With ~30 channel names you have ~50% chance of a collision (birthday paradox over 1023 slots). For most apps you're nowhere near that, but if you start hitting collisions, rename the channels — the error message tells you which.

## Broadcast channels

```ts
const chat = socket.createChannel("chat", { ordered: true });
chat.on("msg", (text) => append(text));
chat.emit("msg", "hello everyone");
```

`socket.createChannel` returns an `RTCIOBroadcastChannel`. Internally it tracks a `Map<peerId, RTCIOChannel>` — one per-peer channel under the hood, fanned out by `emit`.

It also adds itself to a `_channelDefs` registry so that **any peer who joins later** automatically gets a matching channel attached and bound to the broadcast object's listeners. You don't have to do anything for late-joiner support — call `socket.createChannel("chat")` once at startup and it covers everyone.

Events:

- `open` / `close` / `error` / `drain` — same as a single `RTCIOChannel`, dispatched per-peer (the broadcast channel forwards them).
- `peer-left` (special) — fires when one peer's underlying channel closes (e.g. they disconnected). The broadcast channel itself stays open as long as at least one peer is on it.

```ts
chat.on("peer-left", (peerId) => console.log("lost", peerId));
chat.on("msg", (text) => append(text));   // same handler for all peers
```

Closing the broadcast (`chat.close()`) closes every peer channel and prevents future late joiners from being attached.

## Per-peer channels

```ts
const file = socket.peer(targetId).createChannel("file", { ordered: true });
file.on("open", () => console.log("ready"));
```

`socket.peer(id).createChannel` returns an `RTCIOChannel` directly — no broadcast wrapper. This is the right shape for things like file transfer, RPC, or per-pair coordination where you don't want every peer to receive your bytes.

For the channel to actually carry traffic, **both sides** must call `createChannel` with the same name. Otherwise the SCTP transport drops messages on the receive side because no one's listening on that stream id.

A common pattern: open the per-peer channel from `peer-connect`:

```ts
socket.on("peer-connect", ({ id }) => {
  const file = socket.peer(id).createChannel("file", { ordered: true });
  attachFileReceiver(file, ...);
});
```

Both sides run this, so both sides create the channel with the same hash id. The negotiated:true model takes care of the rest.

## ChannelOptions

| Option | Default | Effect |
|---|---|---|
| `ordered` | `true` | In-order delivery. Set `false` to allow lower-latency, possibly out-of-order delivery (good for interactive things like cursor positions). |
| `maxRetransmits` | unlimited | Number of retransmission attempts before giving up on a packet. Mutually exclusive with `maxPacketLifeTime`. |
| `maxPacketLifeTime` | unlimited | Maximum ms to keep retrying a packet. Mutually exclusive with `maxRetransmits`. |
| `queueBudget` | 1 MB | Library-side cap on bytes buffered *before* the channel is open (or while above the high watermark). Not passed to `RTCDataChannel`. |
| `highWatermark` | 16 MB | `bufferedAmount` threshold above which `send()` returns `false` and the library queues. Library-only; the browser doesn't expose this as a constructor option. |
| `lowWatermark` | 1 MB | `bufferedAmount` value at which `'drain'` fires. Forwarded to `RTCDataChannel.bufferedAmountLowThreshold`. Must be < `highWatermark`. |

`maxRetransmits` and `maxPacketLifeTime` are mutually exclusive — if both are set the browser ignores one. Use one or the other for unreliable channels.

A telemetry channel that prefers freshness over reliability:

```ts
const telemetry = socket.createChannel("cursor", {
  ordered: false,
  maxRetransmits: 0,
});
```

A reliable, ordered file channel with a smaller queue budget:

```ts
const file = socket.peer(id).createChannel("file", {
  ordered: true,
  queueBudget: 4 * 1024 * 1024,  // 4 MB
});
```

## Reading and writing

```ts
// Send a structured event (JSON envelope, like socket.io).
chan.emit("msg", { user: "alice", text: "hi" });

// Send raw bytes or a raw string. Returns false if the channel is queueing.
chan.send(arrayBuffer);
```

Receive sides:

```ts
chan.on("msg", (payload) => { ... });   // for emit/JSON envelopes
chan.on("data", (buf: ArrayBuffer) => { ... });   // for send (binary or string)
chan.on("open", () => console.log("ready"));
chan.on("close", () => console.log("gone"));
chan.on("error", (e) => console.error(e));
chan.on("drain", () => console.log("buffer drained, safe to keep sending"));
```

`send` is the right call for streaming binary blobs (file chunks, codec output). `emit` is for typed application messages. They use the same wire transport but the dispatch is different on the receive side: `emit`-ed envelopes go to the named event listener, raw `send` payloads go to `'data'`.

## When to use which

- **`socket.emit('user-event', ...)`** — quick, ergonomic, broadcasts to every peer. Right for chat, presence, room state.
- **`socket.peer(id).emit('user-event', ...)`** — same, but targeted. Right for per-peer RPC, "you specifically pinged me back."
- **Broadcast channel** — when you have a stream of structured events that's the same shape for everyone, especially if you want a `peer-left` hook or fine-grained backpressure semantics.
- **Per-peer channel** — when traffic is genuinely 1:1 (file transfer, large blobs). The broadcast wrapper would just fan out and waste bandwidth.

For "should I emit on `socket` or on a custom channel" the practical answer is: start with `socket.emit`. If you need flow control, ordering tweaks, binary, or a `peer-left` event — graduate to a custom channel.

## All four shapes, runnable

Each embed below is a tiny self-contained app — click **Open 2nd tab ↗** inside the preview and you'll see the channel come up between the two tabs.

### Ordered, reliable broadcast — chat

<StackBlitz
  files={broadcastChat}
  template="node"
  file="src/main.ts"
  title="Broadcast chat"
  summary="One createChannel('chat'), every peer shares it."
/>

### Targeted per-peer — RPC

<StackBlitz
  files={perPeerRpc}
  template="node"
  file="src/main.ts"
  title="socket.peer(id).emit / .on"
  summary="Send to one peer, get a reply back. Click 'Open 2nd tab ↗' inside the preview, then click Ping."
/>

### Per-peer with backpressure — file transfer

<StackBlitz
  files={fileTransfer}
  template="node"
  file="src/main.ts"
  title="File transfer with backpressure"
  summary="16 KB chunks, send() / drain. Same approach scales to GB-sized files."
/>

### Unordered, lossy — game/cursor state

<StackBlitz
  files={unorderedChannel}
  template="node"
  file="src/main.ts"
  title="Unordered DataChannel — cursor sync"
  summary="ordered:false + maxRetransmits:0 = stale frames dropped. Latest wins."
/>
