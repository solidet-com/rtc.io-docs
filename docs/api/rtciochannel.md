---
id: rtciochannel
title: RTCIOChannel
description: A typed wrapper around RTCDataChannel — emit, send, on, off, once, close, plus backpressure-aware queue and watermarks.
---

import StackBlitz from '@site/src/components/StackBlitz';
import { fileTransfer } from '@site/src/examples';

# RTCIOChannel

```ts
import type { RTCIOChannel } from "rtc.io";

const ch = socket.peer(id).createChannel("file", { ordered: true });
```

`RTCIOChannel` wraps a single `RTCDataChannel` between you and one peer. You don't construct it directly — you get one back from `socket.peer(id).createChannel(name, options)` or as the per-peer entries inside an `RTCIOBroadcastChannel`.

## Sending

### `emit(name, ...args)`

```ts
ch.emit(eventName: string, ...args: any[]): void
```

Sends a JSON envelope `{ e: name, d: args }`. Receivers handle it via `ch.on(name, ...)`. Same idiom as `socket.emit`, scoped to this channel:

```ts
ch.emit("hello", { from: "alice" });
ch.emit("update", 1, 2, 3);  // multi-arg
```

A trailing function argument (the socket.io ack idiom) is dropped with a warning.

### `send(data)`

```ts
ch.send(data: ArrayBuffer | string): boolean
```

Send raw bytes or a raw string. Used for streaming binary blobs (file chunks, codec output) where the JSON envelope shape doesn't fit. Returns `true` if sent immediately, `false` if queued or refused (channel full, queue budget exceeded).

```ts
const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
const ok = ch.send(buf);
if (!ok) await new Promise((r) => ch.once("drain", r));
```

See [Backpressure & flow control](/docs/guides/backpressure) for the full pattern.

## Receiving

### `on(event, handler)` / `off(event, handler)` / `once(event, handler)`

```ts
ch.on(event: string, handler: (...args: any[]) => void): this
ch.off(event: string, handler: (...args: any[]) => void): this
ch.once(event: string, handler: (...args: any[]) => void): this
```

Standard EventEmitter-style listener registration. `once` auto-removes the handler after the first invocation.

Three special event names are dispatched by the library itself:

| Event | Args | Fires when |
|---|---|---|
| `open` | none | Channel opened (SCTP up, ready to send) |
| `close` | none | Channel closed (peer left, you called close, transport died) |
| `error` | `(err)` | Channel error or queue-budget overrun |
| `data` | `(buf: ArrayBuffer | string)` | Raw payload arrived (from `send`, not `emit`) |
| `drain` | none | `bufferedAmount` fell below `LOW_WATERMARK` (1 MB) |

Plus any event name you've `emit`ed: `ch.emit("chat", msg)` → `ch.on("chat", (msg) => ...)`.

```ts
ch.on("open", () => console.log("ready"));
ch.on("close", () => console.log("gone"));
ch.on("error", (e) => console.error("channel error:", e));
ch.on("data", (chunk) => receiver.push(chunk));
ch.on("drain", () => console.log("buffer drained"));
ch.on("msg", (text) => append(text));   // user-defined event
```

## State

### `readyState: RTCDataChannelState`

```ts
"connecting" | "open" | "closing" | "closed"
```

Live property. Mirrors `RTCDataChannel.readyState`; if the channel hasn't been attached yet (rare), defaults to `"connecting"`.

### `bufferedAmount: number`

Live property. Mirrors `RTCDataChannel.bufferedAmount` — bytes queued in the browser's transport, not yet sent. Use this with the watermark constants if you're implementing your own throttling:

```ts
const HIGH_WATERMARK = 16_777_216;
if (ch.bufferedAmount > HIGH_WATERMARK) {
  // back off
}
```

## Closing

### `close()`

```ts
ch.close(): void
```

Closes the underlying `RTCDataChannel` and clears any queued payloads. Fires `close` on both ends.

If the channel is already in `closing` or `closed` state, this is a no-op.

## Watermarks (constants)

The library exports the following constants for reference:

```ts
HIGH_WATERMARK = 16 * 1024 * 1024  // 16 MB — set as bufferedAmount threshold
LOW_WATERMARK  =  1 * 1024 * 1024  //  1 MB — bufferedAmountLowThreshold
QUEUE_BUDGET   =  1 * 1024 * 1024  //  1 MB — default JS queue budget
```

The first two control when `send` returns false vs true. The third controls how many bytes can sit in the JS queue (queued *before* the channel opens, or queued because `bufferedAmount` is high).

You can override `QUEUE_BUDGET` per-channel:

```ts
const ch = socket.peer(id).createChannel("file", {
  queueBudget: 32 * 1024 * 1024,   // 32 MB
});
```

## Internal: `_attach(dc)` / `_isAttached()`

These are library internals you'll see in stack traces. They wire the wrapper to an underlying `RTCDataChannel`. You don't call them.

## Patterns

### Backpressure-aware streaming send

```ts
async function streamFile(ch, file) {
  if (ch.readyState !== "open") {
    await new Promise((r) => ch.once("open", r));
  }
  const CHUNK = 16 * 1024;
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
    if (!ch.send(buf)) {
      await new Promise((r) => ch.once("drain", r));
    }
  }
  ch.emit("eof");
}
```

### Receiver assembling chunks

```ts
const chunks: ArrayBuffer[] = [];
ch.on("data", (chunk) => chunks.push(chunk));
ch.on("eof", () => {
  const blob = new Blob(chunks, { type: "application/octet-stream" });
  download(blob);
});
```

### Channel-scoped pub/sub

```ts
const ch = socket.createChannel("game-events", { ordered: false });
ch.on("position", (p) => updatePeer(p));
ch.on("score", (s) => bumpScore(s));

ch.emit("position", { x, y });
ch.emit("score", 1);
```

## Error handling

`error` fires for two reasons:

1. The underlying `RTCDataChannel` raised an `error` event — usually a transport problem.
2. You exceeded the queue budget while the channel was queueing — `RTCIOChannel: queue budget exceeded — wait for 'drain' before sending more`.

If you see (2), either raise the budget for that channel or back off your sender.

If a `send`/`emit` triggers an exception in the underlying transport (rare; usually means the channel was closed mid-call), `error` fires with the underlying error and `send` returns false.

## What's not on RTCIOChannel

- No ack callbacks. DataChannels don't have them. If you need confirmation, encode it in your protocol.
- No "pause"/"resume" methods. The watermark + drain pattern is the API.
- No re-open after close. If you want a fresh channel, call `createChannel(name)` again — the library returns the existing instance if the channel is still alive, otherwise opens a new one.

## Live example

A full file transfer with the `send()` / `'drain'` backpressure contract — the chunk-and-await pattern that lets you ship multi-GB files without OOMing the tab.

<StackBlitz
  files={fileTransfer}
  template="node"
  file="src/main.ts"
  title="File transfer over a per-peer RTCIOChannel"
  summary="Pick a file in tab #1 to send it to tab #2. Watch the progress bar — backpressure pauses sends when the buffer is full."
/>
