---
id: perfect-negotiation
title: Perfect negotiation
description: How rtc.io implements the W3C polite/impolite handshake — and why your offers don't collide.
---

# Perfect negotiation

`RTCPeerConnection` lets either side call `setLocalDescription()` at any time. That flexibility is essential for things like adding a screen-share mid-call (which fires `onnegotiationneeded` and demands a fresh offer), but it creates a new problem: what if both sides try to negotiate at the same moment?

The answer is the **perfect-negotiation pattern**, defined in the [W3C `RTCPeerConnection` example](https://w3c.github.io/webrtc-pc/#perfect-negotiation-example). rtc.io implements it for you, but understanding the shape helps when you read logs.

## The roles

When two peers meet, exactly one is the **polite** side and the other is **impolite**:

- **Polite** rolls back its in-flight offer if a remote one arrives mid-negotiation.
- **Impolite** ignores remote offers while it has its own offer in flight.

This asymmetry is what breaks ties. Without it, both sides would wait for each other forever (or worse, both would keep sending fresh offers in a livelock).

In rtc.io: the side that received `#rtcio:init-offer` is **polite**. The side that *originated* it (the new joiner being signaled to by existing peers) is **impolite**. Specifically:

```ts title="rtc.ts (excerpt)"
// Polite path: initiates the offer and replays any local streams immediately.
initializeConnection(payload, options = { polite: true }) { ... }

// Impolite path: stream replay deferred until after the initial offer/answer
// to prevent onnegotiationneeded racing with setRemoteDescription.
peer = this.createPeerConnection(payload, { polite: false });
```

## The state machine

Every peer entry in the library carries a `connectionStatus`:

```ts
{
  makingOffer: boolean,
  ignoreOffer: boolean,
  isSettingRemoteAnswerPending: boolean,
  negotiationNeeded: boolean,
  negotiationInProgress: boolean,
}
```

These are all the flags the W3C example asks for — plus two we added for `onnegotiationneeded` coalescing (we'll get to those).

### When an offer arrives

```
readyForOffer = !makingOffer && (signalingState === "stable" || isSettingRemoteAnswerPending)
offerCollision = (description.type === "offer" && !readyForOffer)
ignoreOffer = !polite && offerCollision   // impolite side discards
```

If `ignoreOffer` is true, we drop the offer and stay where we are — the impolite side's own offer wins. Otherwise:

```ts
isSettingRemoteAnswerPending = (description.type === "answer");
await peer.connection.setRemoteDescription(description);
```

If `setRemoteDescription` throws with `InvalidStateError` *and* it was a colliding offer, we do a **manual rollback** for browsers that don't support implicit rollback yet:

```ts
await peer.connection.setLocalDescription({ type: "rollback" });
await peer.connection.setRemoteDescription(description);
```

If it throws and the description was a stale answer arriving after we'd already moved to `stable`, we just drop it — that's expected during glare resolution.

### `onnegotiationneeded` coalescing

The browser fires `onnegotiationneeded` whenever transceiver state changes (a track added, replaced, direction toggled). Without coalescing, rapid changes trigger multiple offers and the negotiation queue gets noisy.

rtc.io coalesces them:

```ts
peer.connection.onnegotiationneeded = async () => {
  peer.connectionStatus.negotiationNeeded = true;
  if (peer.connectionStatus.negotiationInProgress) return;

  await Promise.resolve();  // yield so synchronous addTransceiver calls all set the flag

  while (peer.connectionStatus.negotiationNeeded) {
    peer.connectionStatus.negotiationNeeded = false;
    peer.connectionStatus.negotiationInProgress = true;
    try {
      peer.connectionStatus.makingOffer = true;
      await peer.connection.setLocalDescription();
      socket.emit(RtcioEvents.MESSAGE, { source, target, data: { description: localDescription } });
    } finally {
      peer.connectionStatus.makingOffer = false;
      peer.connectionStatus.negotiationInProgress = false;
    }
  }
};
```

The `while` loop catches the case where another `onnegotiationneeded` fired *while* we were in the middle of an offer — instead of starting a fresh handler, we just loop and emit another. One offer round per "stable" period.

## ICE restarts

`oniceconnectionstatechange` and `onconnectionstatechange` watch for `failed`:

```ts
peer.connection.onconnectionstatechange = () => {
  switch (peer.connection.connectionState) {
    case "failed":
      peer.connection.restartIce();
      break;
    case "closed":
      this.cleanupPeer(source);
      break;
  }
};
```

`restartIce()` triggers a new gathering pass with fresh ufrag/pwd values and a new offer. That handles temporary connectivity blips (Wi-Fi → cellular handoff, IP change). The application-level `peer-disconnect` event is *not* fired during a restart — only on permanent close.

The `disconnected` ICE state is intentionally ignored: it's transient. Either ICE recovers (back to `connected`) or escalates to `failed` (which we then restart).

## Per-peer signaling queue

Concurrent envelopes for the same peer get queued so the async steps in `setRemoteDescription`/`setLocalDescription` don't interleave:

```ts
private enqueueSignalingMessage = (payload) => {
  const peerId = payload.source;
  const prev = this.signalingQueues[peerId] ?? Promise.resolve();
  const current = prev
    .then(() => this.handleCallServiceMessage(payload))
    .catch((err) => log("error", "Signaling error", err))
    .finally(() => {
      // Detach when this is the tail so the entry can be GC'd.
      if (this.signalingQueues[peerId] === current) {
        delete this.signalingQueues[peerId];
      }
    });
  this.signalingQueues[peerId] = current;
};
```

This keeps the handler simple and prevents subtle bugs like processing an answer before the matching offer has finished `setLocalDescription`-ing.

## Debugging

Pass `debug: true` to enable per-step logging:

```ts
const socket = io(URL, { iceServers: [...], debug: true });
```

You'll see log lines tagged with the last 6 chars of the local socket id and a per-peer label, including:

- `Created impolite peer (deferred stream replay)` / `Initialized polite peer`
- `Received offer/answer { signalingState }`
- `Ignoring colliding offer (impolite)`
- `Implicit rollback not supported, doing manual rollback`
- `Dropping stale answer (already stable)`
- `onnegotiationneeded — creating offer`
- `Sent offer / Sent answer`
- `Ctrl channel open`
- `ICE state: ...`, `Connection state: ...`

Most production logs you'll see in a normal call are: `Initialized peer` → `Sent offer` → `Received answer` → `Ctrl channel open`.

## Why does any of this matter to me?

Honestly, in normal operation, none of it. You don't have to know about these flags to use rtc.io. They exist because every WebRTC library that doesn't implement them eventually hits a glare bug or a lost-offer bug in production, and your video room has dead air for the user who triggered it.

The takeaway: rtc.io won't crash on simultaneous renegotiations, won't lose offers if you toggle a track at exactly the wrong moment, and will reconnect itself when the network blips. That's the whole reason this section exists.
