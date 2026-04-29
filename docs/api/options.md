---
id: options
title: SocketOptions & ChannelOptions
description: Options accepted by io() and createChannel — iceServers, debug, ordered, retransmits, queue budget, plus everything socket.io-client supports.
---

# Options

Two option bags surface in rtc.io: the one passed to `io(url, options)` and the one passed to `createChannel(name, options)`.

## SocketOptions

Passed to `io(url, options)`. Extends socket.io-client's `SocketOptions`, so any option that works on plain socket.io works here. The fields specific to rtc.io are:

```ts
interface SocketOptions extends Partial<RootSocketOptions> {
  iceServers: RTCIceServer[];
  debug?: boolean;
  watchdog?: {
    timeout?: number;       // ms
    hintTimeout?: number;   // ms
    hintTTL?: number;       // ms
  };
}
```

### `iceServers`

```ts
iceServers: RTCIceServer[]
```

Standard `RTCIceServer` array. Used for the underlying `RTCPeerConnection`. Default if omitted: a pair of Google STUN servers:

```ts
[{ urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] }]
```

For TURN configuration and credential vending, see [ICE and TURN](/docs/guides/ice-and-turn).

### `debug`

```ts
debug?: boolean   // default false
```

Turns on per-step library logging. Useful while wiring up your first connection, noisy in production.

```ts
const socket = io(URL, { iceServers: [...], debug: true });
```

Lines look like:

```
[rtc-io][X6AAAJ] Initialized polite peer { peer: "abc123" }
[rtc-io][X6AAAJ] Sent offer { peer: "abc123" }
[rtc-io][X6AAAJ] Received answer { peer: "abc123", signalingState: "have-local-offer" }
[rtc-io][X6AAAJ] Ctrl channel open { peer: "abc123" }
```

The 6-character tag is the last 6 of `socket.id`.

### `watchdog`

```ts
watchdog?: {
  timeout?: number;       // ms · default 12_000
  hintTimeout?: number;   // ms · default 2_500
  hintTTL?: number;       // ms · default 30_000
}
```

Tunes the per-peer liveness watchdog that decides when an unhealthy WebRTC connection should be torn down. **All three fields are in milliseconds.** See [Lifecycle](/docs/guides/lifecycle) for the full state machine.

- **`timeout`** *(ms)* — how long to wait after `connectionState` flips to `disconnected`/`failed` before declaring the peer dead. Larger values tolerate longer NAT rebinds, mobile network handoffs, and ICE restarts; smaller values free resources sooner at the risk of tearing down recoverable peers.
- **`hintTimeout`** *(ms)* — the shorter grace window used when the server-side `peer-left` hint corroborates the disconnect within `hintTTL`. Set this equal to `timeout` to ignore the hint entirely.
- **`hintTTL`** *(ms)* — how long a fresh `peer-left` hint stays "fresh" enough to shorten the watchdog. Beyond this window the hint is ignored. Set to `0` to never use the shortened path.

Each field is independent; omit one to keep its default.

```ts
const socket = io(URL, {
  iceServers: [...],
  watchdog: {
    timeout: 30_000,       // ms — tolerate longer mobile network blips
    hintTimeout: 5_000,    // ms — still trust server hints, but a bit looser
    hintTTL: 60_000,       // ms — accept hints from up to a minute ago
  },
});
```

Negative values, `NaN`, and non-numeric inputs are silently ignored — the documented default is used in their place.

### Inherited from socket.io-client

Pass any of these directly to `io()`:

- `auth: { token: jwt }` — payload read by your `io.use(...)` middleware on the server.
- `query: { roomId: "demo" }` — query string appended to the WebSocket URL.
- `reconnection: false` — disable auto-reconnect.
- `reconnectionAttempts`, `reconnectionDelay`, `reconnectionDelayMax`, `randomizationFactor` — backoff knobs.
- `transports: ["websocket"]` — skip the long-poll fallback if you only target browsers that support WebSocket.
- `withCredentials: true` — send cookies cross-origin.
- `forceNew: true` — don't reuse a multiplexed `Manager` for this connection.
- `path: "/socket.io"` — server path; only change if your server uses a non-default path.
- `multiplex: true` — share a `Manager` between multiple `io()` calls to the same origin.

The full list lives in the [socket.io-client docs](https://socket.io/docs/v4/client-options/).

## ChannelOptions

Passed as the second arg to `socket.createChannel(name, options)` and `socket.peer(id).createChannel(name, options)`.

```ts
interface ChannelOptions {
  ordered?: boolean;
  maxRetransmits?: number;
  maxPacketLifeTime?: number;
  queueBudget?: number;
}
```

### `ordered`

```ts
ordered?: boolean   // default true
```

True (the default) means in-order delivery — slightly higher latency in exchange for predictable ordering. Right for chat, file transfer, anything where order matters.

False means the SCTP layer can deliver out-of-order, but with lower latency on packet loss. Right for telemetry-style messages (cursor positions, joystick inputs) where freshness matters more than sequence.

```ts
const cursors = socket.createChannel("cursor", { ordered: false });
```

### `maxRetransmits`

```ts
maxRetransmits?: number    // default unlimited
```

Cap on retransmit attempts per packet. Mutually exclusive with `maxPacketLifeTime` — set one or the other, not both.

`maxRetransmits: 0` plus `ordered: false` is the lowest-latency setting: each packet is sent once, and if it's lost, it's gone.

```ts
const realtime = socket.createChannel("input", {
  ordered: false,
  maxRetransmits: 0,
});
```

### `maxPacketLifeTime`

```ts
maxPacketLifeTime?: number    // default unlimited, in milliseconds
```

Time-based equivalent of `maxRetransmits` — the SCTP layer keeps retrying for up to this many milliseconds, then gives up. Useful when you want bounded latency:

```ts
const ranged = socket.createChannel("position", {
  ordered: false,
  maxPacketLifeTime: 100,   // give up after 100 ms
});
```

### `queueBudget`

```ts
queueBudget?: number    // default 1 MB (1_048_576)
```

Library-side cap on the number of bytes that can sit in the JS-side queue (used while the channel is `connecting` or while `bufferedAmount` is at high-water). Exceeding it fires `error` on the channel.

This is **library state**, not passed through to `RTCDataChannel` — it just controls how much we're willing to buffer for you before the channel is ready.

```ts
const file = socket.peer(id).createChannel("file", {
  ordered: true,
  queueBudget: 32 * 1024 * 1024,    // 32 MB
});
```

For most apps the 1 MB default is fine. Raise it for big single-file transfers; lower it if you're tight on memory and want immediate backpressure.

## Defaults at a glance

| Option | Default |
|---|---|
| `iceServers` | Google STUN (1 + 2) |
| `debug` | `false` |
| `watchdog.timeout` | `12_000` ms |
| `watchdog.hintTimeout` | `2_500` ms |
| `watchdog.hintTTL` | `30_000` ms |
| `ordered` | `true` |
| `maxRetransmits` | unlimited (no cap) |
| `maxPacketLifeTime` | unlimited |
| `queueBudget` | 1 MB |

## Worked recipes

**A reliable broadcast chat:**

```ts
const chat = socket.createChannel("chat", { ordered: true });
```

**Low-latency telemetry, lossy:**

```ts
const t = socket.createChannel("position", { ordered: false, maxRetransmits: 0 });
```

**Bounded-latency game state:**

```ts
const g = socket.createChannel("input", { ordered: false, maxPacketLifeTime: 50 });
```

**Per-peer file transfer with bigger queue:**

```ts
const f = socket.peer(id).createChannel("file", {
  ordered: true,
  queueBudget: 16 * 1024 * 1024,
});
```

**Production socket with TURN and verbose logging during incident:**

```ts
const socket = io(URL, {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:turn.example.com:3478", username, credential },
  ],
  debug: location.search.includes("debug=1"),
  auth: { token: jwt },
});
```
