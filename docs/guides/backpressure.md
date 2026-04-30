---
id: backpressure
title: Backpressure & flow control
description: How rtc.io keeps DataChannel buffers from blowing up — the queue budget, watermarks, drain events, and what `send` returning false means.
---

import StackBlitz from '@site/src/components/StackBlitz';
import { fileTransfer } from '@site/src/examples';

# Backpressure & flow control

DataChannels have a `bufferedAmount` — the number of bytes you've queued for transmission that haven't gone out yet. If you call `send()` faster than the pipe can drain, that number grows without bound. Eventually the browser kills the connection or runs out of memory.

The standard fix is to back off when `bufferedAmount` gets high, and resume when it drops. rtc.io does that for you, but understanding the mechanism matters as soon as you're sending large payloads (file transfers, codec output, anything > a few hundred KB).

## The two watermarks

```ts title="channel.ts (defaults)"
export const HIGH_WATERMARK = 16_777_216;  // 16 MB — pause sending above this
export const LOW_WATERMARK  =  1_048_576;  //  1 MB — resume sending below this
```

When `bufferedAmount ≥ HIGH_WATERMARK`, `channel.send()` returns `false` and your bytes are held in the JS-side queue. When `bufferedAmount` falls back through `LOW_WATERMARK`, the browser fires `bufferedamountlow` (driven by `RTCDataChannel.bufferedAmountLowThreshold`, which the library sets to the channel's `lowWatermark`) and rtc.io emits `'drain'` on your channel.

Both are configurable per-channel via `ChannelOptions` if the defaults don't fit your shape:

```ts
const live = socket.peer(id).createChannel("live", {
  highWatermark: 8 * 1024 * 1024,   // pause once 8 MB are in flight
  lowWatermark:  2 * 1024 * 1024,   // resume once it's back under 2 MB
});
```

When to tune them:

- **Lower `highWatermark`** caps the OS-side transport buffer. Less memory pressure and shorter steady-state end-to-end latency, at the cost of throughput on bursty senders (you spend more time pausing).
- **Higher `highWatermark`** lets the browser hold more bytes in flight — useful on high-bandwidth fat-pipe links (gigabit LAN, server-to-server) where you want a deeper pipeline and the memory's available.
- **Higher `lowWatermark`** fires `'drain'` sooner, so the sender resumes earlier — smoother throughput, fuller transport buffer on average.
- **Lower `lowWatermark`** fires `'drain'` later, after a deeper drain — burstier throughput, more headroom between bursts.

`lowWatermark` must stay below `highWatermark`; otherwise drain fires immediately on every send and the throttling collapses. The library doesn't enforce this — it's on you. Tune the ratio (1:16 by default) before tuning the absolute numbers.

## The queue budget

Bytes you call `send()` with *before the channel is open* (or while `bufferedAmount` is high) get queued in JS, not in the browser's transport. There's a per-channel cap on that queue:

```ts
export const QUEUE_BUDGET = 1_048_576;  // 1 MB default
```

If you exceed it, rtc.io fires `'error'` on the channel with a clear message:

```
RTCIOChannel: queue budget exceeded — wait for 'drain' before sending more
```

You can raise it per-channel if you have headroom and want more buffering:

```ts
const file = socket.peer(id).createChannel("file", { queueBudget: 16 * 1024 * 1024 });
```

The budget applies to JS queueing only. Once the channel opens and bytes flow into the browser's transport, that's what `bufferedAmount` measures.

## What `send` returns

```ts
const ok = channel.send(arrayBuffer);
```

- **`true`** — sent immediately. Channel is open and below high-water.
- **`false`** — queued (or refused). One of:
  - Channel is still `connecting` — buffered, will flush on `'open'`.
  - `bufferedAmount` ≥ the channel's `highWatermark` — back off until `'drain'`.
  - There's already a queue — your send is appended to it.
  - Queue budget exceeded — `'error'` fires, no buffering happened.

`emit` (the higher-level JSON envelope API) wraps `send` and behaves the same way:

```ts
const ok = channel.emit("event", payload);  // returns boolean
```

## The drain pattern

For large transfers, the canonical loop is:

```ts
async function streamFile(channel, file) {
  if (channel.readyState !== "open") {
    await new Promise((res) => channel.once("open", res));
  }

  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
    if (!channel.send(buf)) {
      await new Promise((res) => channel.once("drain", res));
    }
  }
}
```

`once("drain")` resolves the next time `bufferedAmount` falls through the channel's `lowWatermark` (1 MB by default). The `send`-then-await-drain loop is the simplest correct pattern for streaming a file or any large blob.

## Picking a chunk size

```ts
export const FILE_CHUNK_SIZE = 16 * 1024;  // 16 KB
```

16 KB is the sweet spot:

- The SCTP message limit advertised by Chromium is 256 KB, but smaller messages trickle through firewalls more reliably.
- Smaller chunks → finer-grained progress reporting and faster cancellation.
- Larger chunks → slightly less per-message overhead.

For interactive payloads (cursor positions, RPC requests) you don't need to chunk — `emit` a JSON envelope and you're done. Chunking matters only when a single payload would dwarf the queue budget.

## Send order

If `send` returns false, the channel queues your data and tries to flush on the next `open`/`drain`. **Order is preserved.** Don't try to recover from a `false` return by calling `send` again immediately — that just appends another item. Wait for `'drain'`.

## Receiving with backpressure

The receiving side has a separate buffer (the SCTP receive window). It can't directly tell you "I'm overwhelmed" — that's not a thing in WebRTC's DataChannel API. If you're processing each `'data'` event on a slow main thread (e.g. CPU-bound parsing), the receive buffer can grow.

Two practical mitigations:

1. **Process in chunks but batch state updates.** If you `setState` per chunk, React re-renders on every receive. Buffer chunks in memory and flush state every N ms or N bytes.
2. **Use a Web Worker for parsing.** Move the CPU work off the main thread; send the parsed result back as a `postMessage`.

This is a general "don't block the main thread" issue, not rtc.io specific.

## What happens on close

If the channel closes mid-send, the queue is dropped and `'close'` fires. Pending `await drain` promises are reject-resolvable too — wrap them with the channel's `'close'` listener:

```ts
function waitForDrain(channel) {
  return new Promise((resolve, reject) => {
    const onDrain = () => { cleanup(); resolve(); };
    const onClose = () => { cleanup(); reject(new Error("channel closed")); };
    const cleanup = () => {
      channel.off("drain", onDrain);
      channel.off("close", onClose);
    };
    channel.on("drain", onDrain);
    channel.on("close", onClose);
  });
}
```

The bundled file-transfer helper in our [tutorial](/docs/tutorial/files) does exactly this.

## Diagnosing buffer bloat

`channel.bufferedAmount` is read at any time:

```ts
console.log(channel.readyState, channel.bufferedAmount);
```

If you see it pinned near the channel's `highWatermark` for long stretches, your sender is faster than the link. Either chunk smaller, throttle the producer, accept the existing rtc.io pause/drain cycle, or raise `highWatermark` if you have memory headroom and want a deeper pipeline.

If `bufferedAmount` is consistently zero and you're still seeing slowness, the bottleneck is on the wire (cellular, congested router) or in receive-side processing — not in your sender.

## Per-peer stats

For end-to-end visibility, `socket.getSessionStats(peerId)` exposes the round-trip time and the codec stats for the active connection:

```ts
const stats = await socket.getSessionStats(peerId);
console.log(stats.rtt, stats.codecs, stats.outboundRTP);
```

For data-only stats (no media), see [Stats](stats).

## Live: a real backpressure-aware sender

The whole `send()` returning `false` → `await once('drain')` loop, in 60 lines.

<StackBlitz
  files={fileTransfer}
  template="node"
  file="src/main.ts"
  title="File transfer · backpressure handled correctly"
  summary="Pick a file in tab #1 to send to tab #2. The progress bar pauses when the buffer fills past the high watermark."
/>
