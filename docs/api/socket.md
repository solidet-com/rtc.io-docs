---
id: socket
title: Socket
description: The main entry point — io() returns a Socket. emit, on, peer(), createChannel, server escape hatch, untrackStream, stats helpers.
---

# Socket

The `Socket` is what you get back from `io()`. It extends `socket.io-client`'s `Socket` and adds peer-to-peer routing for `emit`/`on` and the WebRTC orchestration that makes that routing work.

```ts
import io from "rtc.io";

const socket = io(url, options);
```

## Construction

```ts
io(url?: string, options?: SocketOptions): Socket
```

- **`url`** — full URL of your signaling server. Optional; if omitted, defaults to the page's origin (via socket.io's URL parser).
- **`options`** — see [SocketOptions](options).

`io` is also re-exported as `connect` and as the default export. All three are the same function.

```ts
import io from "rtc.io";
import { io, connect } from "rtc.io";
import { default as io } from "rtc.io";
```

## socket.emit

```ts
socket.emit(event: string, ...args: any[]): this
```

Three different routings depending on what you pass:

| You pass | Routing |
|---|---|
| Args containing an `RTCIOStream` (deep search) | Stream is added as transceivers; metadata replays for late joiners |
| `event` starts with `#rtcio:` | Sent through socket.io to the signaling server (internal) |
| Anything else | Broadcast over the **ctrl DataChannel** to every connected peer |

Examples:

```ts
// Broadcast a chat message to all peers (DataChannel).
socket.emit("chat", { text: "hello", from: "alice" });

// Broadcast a media stream (transceivers + replay registry).
socket.emit("camera", new RTCIOStream(localMedia));

// You almost never want to emit a #rtcio:* event directly.
```

If you pass a callback as the last argument (the socket.io ack idiom), it's silently dropped — DataChannels have no ack channel. We log a warning so you don't think it just got lost.

## socket.on / off / once

Inherited from `socket.io-client`. These are normal event-emitter methods, but the events they listen for include the events `socket.emit` puts on the ctrl channel.

```ts
socket.on("chat", (msg) => append(msg));
socket.on("peer-connect", ({ id }) => acquire(id));
socket.on("peer-disconnect", ({ id }) => release(id));
socket.on("track-added", ({ peerId, stream, track }) => updateTile(peerId, track.kind));
```

The reserved events (`peer-connect`, `peer-disconnect`, `track-added`) are dispatched by the library when their conditions trigger. See [Lifecycle events](/docs/guides/lifecycle).

## socket.peer(id)

```ts
socket.peer(peerId: string): {
  emit(event: string, ...args: any[]): void;
  on(event: string, handler: (...args) => void): void;
  off(event: string, handler: (...args) => void): void;
  createChannel(name: string, options?: ChannelOptions): RTCIOChannel;
}
```

Targeted, per-peer messaging. Same ctrl channel under the hood, but only that one peer receives the envelope:

```ts
socket.peer(targetId).emit("rpc", { method: "ping" });
socket.peer(targetId).on("rpc-result", (res) => console.log(res));
```

`createChannel` here opens a **per-peer DataChannel** (not broadcast) — see [RTCIOChannel](rtciochannel).

The handlers registered via `socket.peer(id).on` only fire for events from *that* peer. Combine with `socket.on(...)` (which fires for events from *any* peer) as needed.

## socket.createChannel

```ts
socket.createChannel(name: string, options?: ChannelOptions): RTCIOBroadcastChannel
```

Open a broadcast DataChannel: every connected peer (and any peer that joins later) shares it. See [RTCIOBroadcastChannel](rtciobroadcastchannel).

```ts
const chat = socket.createChannel("chat", { ordered: true });
chat.on("msg", (text) => append(text));
chat.emit("msg", "hi");
```

If you call `createChannel("chat")` more than once with the same name, the same `RTCIOBroadcastChannel` instance is returned and the second `options` is ignored.

## socket.server

```ts
socket.server: {
  emit(event: string, ...args: any[]): this;
  on(event: string, handler: (...args) => void): this;
  off(event: string, handler: (...args) => void): this;
}
```

Escape hatch: emit/listen straight on socket.io, bypassing all DataChannel routing. Use this for things only the server should see/route — `join-room`, auth handshakes, ICE credential vending, presence broadcasts that go through the server.

```ts
socket.server.emit("join-room", { roomId, name });
socket.server.on("user-connected", ({ id, name }) => addRoster(id, name));
socket.server.on("user-disconnected", ({ id }) => removeRoster(id));
```

## socket.untrackStream

```ts
socket.untrackStream(stream: RTCIOStream): this
```

Drops a stream from the replay registry. Useful when the stream is being shut down (screen share stopped) and you don't want late joiners to see it as still active.

```ts
socket.untrackStream(screenShareStream);
// Already-connected peers are unaffected — signal them at the app level
// to remove the tile.
socket.emit("stop-share", { id: socket.id });
```

This **does not** remove transceivers from existing peer connections. Replace tracks (`replaceTrack(null)`) or stop the underlying `MediaStream` if you want the media flow to actually end.

## socket.getPeer

```ts
socket.getPeer(peerId: string): RTCPeer | undefined
```

Returns the internal peer entry for direct access to the underlying `RTCPeerConnection` and rtc.io's per-peer state. Mostly useful for debugging:

```ts
const p = socket.getPeer(peerId);
console.log(p.connection.connectionState);
console.log(Object.keys(p.streams));
console.log(Object.keys(p.channels));
```

The shape is intentionally not part of the stable API — fields may move between minor versions. Pin a major when you depend on it.

## Stats helpers

```ts
socket.getStats(peerId: string): Promise<Map<string, any[]> | null>
socket.getSessionStats(peerId: string): Promise<SessionStats | null>
socket.getIceCandidateStats(peerId: string): Promise<IceCandidateStats | null>
```

See [Stats & diagnostics](/docs/guides/stats) for shapes and when to use which.

## socket.debug

```ts
socket.debug: boolean
```

Turn on per-step library logging. Equivalent to passing `{ debug: true }` to `io(...)`. Logs are tagged with the last 6 chars of the local socket id.

## socket.id

```ts
socket.id: string | undefined
```

Inherited from socket.io. The remote-side identity of this socket. Available after `connect`.

```ts
socket.on("connect", () => console.log("my id is", socket.id));
```

## Connection lifecycle (socket.io-level)

These are inherited from `socket.io-client`. Listed here as reminders:

- `socket.connect()` — manually open if you constructed with `autoConnect: false`.
- `socket.disconnect()` — close the signaling. Existing peer connections are left untouched until you also clean them up (or the page unloads).
- Events: `connect`, `disconnect`, `connect_error`. See `socket.io-client` docs for the full list.

## Behavior reference

### What `emit` doesn't do

- It doesn't send your event to socket.io. Use `socket.server.emit` for that.
- It doesn't wait for delivery confirmation. There's no ack on a DataChannel; if you need confirmation, encode it in your protocol.

### What happens to events received from peers

The ctrl-channel `onmessage` handler:

1. Drops messages that don't parse as JSON.
2. Drops messages with a reserved event name (`#rtcio:*`, `peer-connect`, `peer-disconnect`, `track-added`) — peers can't spoof those.
3. Dispatches to global listeners registered via `socket.on(eventName, ...)`.
4. Dispatches to per-peer listeners registered via `socket.peer(senderId).on(eventName, ...)`.

Both registrations receive the full `args` array spread, the same way socket.io's emit/on works.

### Multiplexing

If you call `io(url1)` and then `io(url2)`, each gets its own underlying socket.io connection (and its own peer connections). If you call `io(url1)` twice with the same URL, they reuse the same `Manager` (multiplexed namespaces) by default — pass `forceNew: true` to opt out.

The library also caches by URL+path so re-`io()`ing the same backend is cheap.
