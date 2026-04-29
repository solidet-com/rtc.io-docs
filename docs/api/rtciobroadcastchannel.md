---
id: rtciobroadcastchannel
title: RTCIOBroadcastChannel
description: A named DataChannel shared with every peer — emit broadcasts, on/off fires for any peer, plus peer-left notifications.
---

import StackBlitz from '@site/src/components/StackBlitz';
import { broadcastChat, unorderedChannel } from '@site/src/examples';

# RTCIOBroadcastChannel

```ts
const chat = socket.createChannel("chat", { ordered: true });
```

A broadcast channel is a logical DataChannel shared with every connected peer (and any peer that joins later). Internally it's a `Map<peerId, RTCIOChannel>` — one per-peer DataChannel under the hood, fanned out by the broadcast wrapper.

## Construction

You don't construct it directly. Call `socket.createChannel(name, options)` — the library returns either a fresh instance or the existing one if the name is already registered.

```ts
const chat = socket.createChannel("chat", { ordered: true });
const game = socket.createChannel("game-events", { ordered: false, maxRetransmits: 0 });
```

The name is registered in an internal `_channelDefs` list, so peers that join later automatically get a matching channel attached.

## Sending

### `emit(name, ...args)`

```ts
chat.emit(eventName: string, ...args: any[]): void
```

Fans the JSON envelope out to every peer's per-peer channel:

```ts
chat.emit("msg", { user: "alice", text: "hi" });
```

Synchronous. Doesn't wait for delivery.

### `send(data)`

```ts
chat.send(data: ArrayBuffer | string): boolean
```

Raw bytes, fanned out. Returns `true` only if every peer's per-peer `send` returned true; if any peer was queueing, returns false.

You probably won't `send` raw bytes on a broadcast channel — chunked file transfer is better as a per-peer thing. But it works if you have a use case.

## Receiving

### `on(event, handler)` / `off(event, handler)` / `once(event, handler)`

```ts
chat.on(event: string, handler: (...args: any[]) => void): this
```

Registers a listener that fires for the named event from **any** peer's per-peer channel underneath. The handler doesn't receive the sender's id directly — if you need it, include it in the payload.

```ts
chat.on("msg", (msg) => {
  console.log(msg.user, "said", msg.text);
});
```

Special events dispatched by the broadcast wrapper:

| Event | Args | Fires when |
|---|---|---|
| `peer-left` | `(peerId)` | One peer's underlying channel closed |
| `close` | none | All peers gone (auto-fires when the last per-peer channel closes), or you called `chat.close()` |
| `error` | `(err)` | Some per-peer channel raised an error |
| `drain` | none | A per-peer channel fired drain (so you can resume sending) |

Plus any user event name you've `emit`ed to it.

```ts
chat.on("peer-left", (peerId) => console.log("lost", peerId));
chat.on("close", () => console.log("everyone left"));
```

`peer-left` is the broadcast-channel-scoped equivalent of `socket.on("peer-disconnect")`. It fires only for the per-peer channel underneath, not the whole peer connection.

## State

### `peerCount: number`

Live property. Number of peers currently attached to this broadcast channel.

```ts
console.log(`${chat.peerCount} people in the channel`);
```

### `closed: boolean`

Live property. True after `chat.close()` has been called. A closed broadcast channel won't accept new peers.

## Closing

### `close()`

```ts
chat.close(): void
```

Closes every per-peer channel and prevents future late joiners from being attached. Fires `close` once.

```ts
chat.close();
chat.peerCount;   // 0
chat.closed;      // true
```

## Late joiner attachment

When a new peer's connection comes up:

1. The library walks `_channelDefs` (the registry of `{ name, options }` you've created broadcast channels with).
2. For each one, it creates a matching per-peer DataChannel to the new peer.
3. The broadcast channel's `_addPeer(peerId, channel)` is called, which:
   - Saves the channel in the broadcast's peer map.
   - Replays every `on(event, handler)` subscription onto the new channel (so handlers fire for the new peer's traffic too).
   - Wires `drain`, `error`, `close` from the per-peer channel up to the broadcast.

You don't write any of this — it's automatic. You just call `socket.createChannel("chat")` once at startup.

## Patterns

### Chat channel

```ts
// Both peers run this on init.
const chat = socket.createChannel("chat", { ordered: true });
chat.on("msg", (msg) => append(msg));

// Send.
chat.emit("msg", { user: userName, text: input.value, time: Date.now() });
```

### Cursor positions (unreliable, frequent)

```ts
const cursors = socket.createChannel("cursor", {
  ordered: false,
  maxRetransmits: 0,
});

cursors.on("pos", ({ peerId, x, y }) => updateCursor(peerId, x, y));

window.addEventListener("mousemove", (e) => {
  cursors.emit("pos", { peerId: socket.id, x: e.clientX, y: e.clientY });
});
```

`maxRetransmits: 0` and `ordered: false` give you the lowest-latency, lossy delivery — perfect for "show roughly where everyone's mouse is" semantics. Lost packets just mean a slightly stale cursor.

### Game state

```ts
const game = socket.createChannel("game", { ordered: true });

game.on("score", ({ peerId, delta }) => bumpScore(peerId, delta));
game.on("peer-left", (peerId) => removeFromScoreboard(peerId));
```

### Re-using on different connections

The broadcast channel is per-`Socket`, not per-app. If you create a `Socket`, then create a second `Socket` (e.g. for a separate room), each one has its own `_channelDefs` and its own broadcast channels. The broadcast wrapper does not span sockets.

## Limits

- The broadcast channel itself isn't a separate SCTP stream — it's `peerCount` separate streams, each with its own buffered amount. `chat.send(buf)` may queue on some peers and not others.
- `peer-left` doesn't tell you *why* — could be a clean leave, an ICE failure, or a tab close. If you need the reason, listen to `socket.on("peer-disconnect")` instead.
- A peer that `createChannel`s a name without you having `createChannel`-ed it on your side gets a one-sided channel: their sends don't reach you. Both sides need the same `createChannel("name")` call. Broadcast channels handle this automatically *for the broadcast registration* — but if you want per-peer custom channels, see [`socket.peer().createChannel`](peer).

## Live examples

### Ordered, reliable — chat

The classic shape: every peer's text shows up in every other peer's log.

<StackBlitz
  files={broadcastChat}
  template="node"
  file="src/main.ts"
  title="Broadcast chat"
  summary="A 30-line chat using one createChannel('chat'). Click 'Open 2nd tab ↗' inside the preview to chat with yourself."
/>

### Unordered, lossy — cursor sync

Pass `{ ordered: false, maxRetransmits: 0 }` and the SCTP transport stops queuing or retransmitting — the latest cursor position wins, stale frames are dropped on the floor. Right shape for game state, presence indicators, anything where the next packet is more useful than the last.

<StackBlitz
  files={unorderedChannel}
  template="node"
  file="src/main.ts"
  title="Unordered DataChannel — cursor sync"
  summary="Move your mouse over the canvas. Each peer's cursor is synced via an unreliable + unordered DataChannel."
/>
