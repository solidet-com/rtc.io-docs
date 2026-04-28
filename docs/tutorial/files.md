---
id: files
title: 5. File transfer
description: Per-peer file transfer over a binary DataChannel, with backpressure and progress.
---

# 5. File transfer

For files you want a per-peer DataChannel — broadcast would fan-out the bytes to peers that don't need them. The library's per-peer channels are exactly the same thing as the broadcast wrapper underneath, just one entry deep.

## Open the channel

```ts
socket.on("peer-connect", ({ id }) => {
  const file = socket.peer(id).createChannel("file", { ordered: true });
  attachFileReceiver(file);
  fileChannels.set(id, file);
});

const fileChannels = new Map<string, RTCIOChannel>();
```

Both sides have to call `createChannel("file")` so the SCTP stream ids match (they're hashed from the name — see [DataChannels](/docs/guides/datachannels) for the why). Doing it inside `peer-connect` is the natural symmetric place; both sides run that listener when their ctrl channel opens.

## The wire protocol

Pick a tiny envelope shape. Three message types:

```
1. emit('meta', { tid, name, size, mime })       — start of a transfer
2. send(arrayBuffer)*                            — chunked binary, repeated
3. emit('eof', { tid })                          — end of transfer
```

`tid` (transfer id) lets the receiver attribute chunks to the right transfer if you support concurrent ones. We'll keep it simple — one transfer at a time — but the tid is still useful so the receiver can correlate `eof` with the matching `meta`.

## Sending a file

```ts title="src/file.ts"
import type { RTCIOChannel } from "rtc.io";

const CHUNK = 16 * 1024;   // 16 KB

export async function sendFile(ch: RTCIOChannel, file: File): Promise<void> {
  if (ch.readyState !== "open") {
    await new Promise((res) => ch.once("open", res));
  }

  const tid = crypto.randomUUID();
  ch.emit("meta", { tid, name: file.name, size: file.size, mime: file.type || "application/octet-stream" });

  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
    if (!ch.send(buf)) {
      // Channel is queueing — wait for drain so we don't blow the budget.
      await new Promise((res) => ch.once("drain", res));
    }
  }

  ch.emit("eof", { tid });
}
```

Three details worth highlighting:

- **`ch.send(buf)` returns false when the channel is full.** Without a wait-for-drain, your loop would queue the entire file into JS memory and exceed the queue budget. This is the canonical [backpressure](/docs/guides/backpressure) pattern.
- **`ch.send` for binary; `ch.emit` for the structured `meta` and `eof` envelopes.** Same channel, different dispatch on the receive side.
- **16 KB chunks.** Big enough to amortize overhead, small enough for fine-grained progress and to stay well under the SCTP message limit.

## Receiving a file

```ts title="src/file.ts (continued)"
type ReceiverState = {
  meta: { tid: string; name: string; size: number; mime: string };
  chunks: ArrayBuffer[];
  bytesReceived: number;
};

export function attachFileReceiver(ch: RTCIOChannel): void {
  let state: ReceiverState | null = null;

  ch.on("meta", (meta) => {
    if (typeof meta?.tid !== "string") return;
    state = { meta, chunks: [], bytesReceived: 0 };
    console.log("incoming file:", meta.name, "(" + meta.size + " bytes)");
  });

  ch.on("data", (chunk: ArrayBuffer) => {
    if (!state) return;   // stray chunk with no meta — ignore
    state.chunks.push(chunk);
    state.bytesReceived += chunk.byteLength;
    const pct = (state.bytesReceived / state.meta.size * 100).toFixed(1);
    console.log("receiving:", pct + "%");
  });

  ch.on("eof", ({ tid }) => {
    if (!state || tid !== state.meta.tid) return;
    const blob = new Blob(state.chunks, { type: state.meta.mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = state.meta.name;
    link.textContent = "Download " + state.meta.name;
    document.body.appendChild(link);
    state = null;
  });
}
```

Three handlers — one per message type. The `data` handler fires for the raw `send(buf)` payloads; the `meta` and `eof` handlers fire for the structured envelopes.

The download link uses an [object URL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static), which is a synthetic URL pointing at the blob in browser memory. Click to download. Remember to `URL.revokeObjectURL(url)` when you're done with it (especially for big files) to free memory.

## Wire up the UI

```ts title="src/main.ts (additions)"
import { sendFile, attachFileReceiver } from "./file";

const fileInput = document.createElement("input");
fileInput.type = "file";
document.body.appendChild(fileInput);

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileChannels.forEach((ch) => sendFile(ch, file));
  fileInput.value = "";
});
```

Pick a file. It gets sent to every connected peer over their per-peer file channel. Each peer receives `meta` → chunks → `eof` and assembles a downloadable blob.

## Why per-peer not broadcast

A broadcast channel could carry this — the wrapper would fan to every peer. But for big payloads:

- You're sending the entire file N times either way (one per recipient). Broadcast doesn't save bandwidth.
- Per-peer gives you per-peer progress visibility (you can show "Sending to alice — 80%") and per-peer error handling (one peer's connection breaking doesn't stop the others).
- Per-peer also gives you natural backpressure isolation: a slow peer doesn't block sends to a fast peer (each per-peer channel has its own `bufferedAmount`).

The pattern in the demo app uses per-peer file channels and shows progress per recipient.

## Concurrent transfers

To support multiple in-flight transfers, key your receiver state by `tid`:

```ts
const transfers = new Map<string, ReceiverState>();

ch.on("meta", (meta) => {
  transfers.set(meta.tid, { meta, chunks: [], bytesReceived: 0 });
});

ch.on("data", (chunk) => {
  // Without a tid in the data envelope, you have to assume chunks are interleaved
  // by tid in the order their metas arrived. Easier: just enforce one transfer at
  // a time, or include the tid as a 16-byte prefix on each chunk.
});
```

A simple approach: include a 16-byte prefix on each chunk that's the binary form of the tid. The send-loop slices the prefix into the buffer; the receive handler reads it out. This adds overhead but lets you cleanly multiplex.

For most apps, one-at-a-time is fine.

## Cleanup

When the peer disconnects, drop the channel reference and revoke any blob URLs you'd held onto:

```ts
socket.on("peer-disconnect", ({ id }) => {
  fileChannels.delete(id);
  // Already-received files are independent — keep their blob URLs alive
  // until the user actually downloads them, then revoke.
});
```

The library closes the underlying DataChannel for you. Your only job is to release any application state that referred to it.

## What's next

[Next: 6. Deploy →](deploy)
