---
id: stats
title: Stats & diagnostics
description: getStats, getSessionStats, getIceCandidateStats — what you get back, when each one is useful.
---

# Stats & diagnostics

`RTCPeerConnection.getStats()` is one of the most useful debugging tools in WebRTC and one of the worst-documented. rtc.io exposes three flavors so you don't have to deal with the raw `RTCStatsReport` shape unless you want to:

```ts
socket.getStats(peerId);              // raw, grouped by stat type
socket.getSessionStats(peerId);       // pre-distilled session summary
socket.getIceCandidateStats(peerId);  // ICE pair selection details
```

All three are async and return `null` if the peer doesn't exist (e.g. they already disconnected).

## getStats — raw, grouped

```ts
const stats = await socket.getStats(peerId);
```

Returns a `Map<string, { report, description }[]>` where each key is a stat type — `inbound-rtp`, `outbound-rtp`, `transport`, `candidate-pair`, `local-candidate`, `remote-candidate`, `codec`, etc. — and the value is an array of reports of that type.

This is the lowest-level helper. You'd use it when you want to dig into a specific metric the higher-level helpers don't expose.

```ts
const stats = await socket.getStats(peerId);
const outbound = stats.get("outbound-rtp")?.[0]?.report;
console.log("kbps out:", (outbound.bytesSent * 8 / 1000) / outbound.timestamp);
```

## getSessionStats — distilled session summary

```ts
const session = await socket.getSessionStats(peerId);
```

Returns a curated object with just the metrics you usually want. Shape (subject to small additions across versions):

```ts
{
  rtt: number,                 // ms, round-trip on the active candidate pair
  jitter: number,              // ms, average jitter
  packetsLost: number,         // total
  packetsSent: number,         // total
  packetsReceived: number,
  bytesSent: number,
  bytesReceived: number,
  inboundRTP: Array<{          // one per receiving track (audio, video, etc.)
    kind: string,
    bytesReceived: number,
    framesPerSecond: number,
    frameWidth: number,
    frameHeight: number,
    ...
  }>,
  outboundRTP: Array<{
    kind: string,
    bytesSent: number,
    framesPerSecond: number,
    ...
  }>,
  codecs: Array<{ mimeType: string, payloadType: number, ... }>,
}
```

This is the right call for periodic UI updates — a "ping" badge, bandwidth counter, framerate display. The cost is one `getStats()` round per peer per call, so don't poll faster than ~once per second per peer.

In the demo app we use this to drive the per-peer signal-strength badge:

```ts title="Call.tsx (excerpt)"
useEffect(() => {
  const poll = async () => {
    const updates: Record<string, number | null> = {};
    for (const peer of peersRef.current) {
      const s = await socket.getSessionStats(peer.id);
      updates[peer.id] = s?.rtt != null ? Math.round(s.rtt) : null;
    }
    setPeerPings(updates);
  };
  const id = setInterval(poll, 3000);
  return () => clearInterval(id);
}, []);
```

## getIceCandidateStats — connection path

```ts
const ice = await socket.getIceCandidateStats(peerId);
```

Returns the candidates exchanged and which pair the connection actually settled on:

```ts
{
  localCandidates: Array<{ id, candidateType, ... }>,    // host | srflx | prflx | relay
  remoteCandidates: Array<{ id, candidateType, ... }>,
  candidatePairs: Array<{
    state,                                                // "succeeded" | "failed" | ...
    nominated,                                            // true on the active pair
    localCandidateId, remoteCandidateId,
    currentRoundTripTime, ...
  }>,
}
```

Use this when ICE doesn't reach `connected`. The candidate types tell you whether STUN worked (`srflx` candidates present), whether TURN was tried (`relay`), and which pair won the nomination.

A common diagnostic flow when things won't connect:

1. Both sides see `host` candidates only? → STUN unreachable. Check your STUN URL, firewall.
2. Both sides see `srflx`, no `relay`, no nominated pair? → Symmetric NAT. Add TURN.
3. Only one side has `srflx`? → That side's STUN is broken (or STUN is asymmetric blocked).
4. Lots of `failed` pairs and one `succeeded` `relay` pair? → TURN is doing its job.

See [ICE and TURN](ice-and-turn) for what to do with each result.

## Throttling and overhead

`getStats()` walks the entire transport machinery and synthesizes a fresh report each call — it's not free. Once a second per active peer is fine. Once a frame is not.

Don't `Promise.all` ten peers' stats inside a high-frequency render loop. Either move the polling to a single interval or stagger the calls.

## Browser differences

Stat names and shapes vary slightly across Chrome, Firefox, and Safari. The session-stats helper papers over the worst differences but you'll occasionally see `undefined` for fields a particular browser doesn't expose. Always null-check before doing math:

```ts
const fps = stats?.inboundRTP?.[0]?.framesPerSecond ?? 0;
```

## Logging during dev

Pair stats with the `debug: true` socket option to get full lifecycle context in the console. The combination of "I see ICE state cycling" + the candidate pair stats is usually enough to diagnose connectivity issues without breaking out Wireshark.
