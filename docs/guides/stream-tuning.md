---
id: stream-tuning
title: Stream tuning · why high-motion looks laggy
description: Why screen shares of games or video feel laggy out of the box, and the four knobs you turn to fix it — frameRate constraint, contentHint, encoder maxBitrate, and audio DSP.
---

# Stream tuning · why high-motion looks laggy

If you've shared a screen of a game (or a video, or anything that moves a lot) over rtc.io and the receiver sees a soft, low-frame-rate, slightly-behind picture, **that's not rtc.io misbehaving — it's the browser's default capture and encode settings doing exactly what they were designed to do**: optimise for an IDE, a slide deck, a call where one face is talking. Those defaults are wrong for high-motion content, and there are four knobs you turn to fix it.

## The four knobs

### 1 · Capture frame rate (`getDisplayMedia` constraints)

Browsers cap captured screen frame rate to **30 fps or lower** when you call `getDisplayMedia({ video: true })` with no constraint. The OS only sends frames at that rate; the encoder can't make up frames it never received.

```ts
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: {
    frameRate: { ideal: 60, max: 60 },
    width:     { ideal: 1920 },
    height:    { ideal: 1080 },
  },
});
```

`ideal` is a hint, not a requirement — the browser may clamp to 30 if the OS / window manager won't deliver more. Chromium on macOS in particular caps at 30 fps for `screen` capture; tab capture runs at 60.

### 2 · Track `contentHint`

A WebRTC video encoder has to choose between **frame rate** and **per-frame detail** under any given bitrate budget. The `contentHint` property tells it which to favor:

| Hint | Encoder bias |
| --- | --- |
| `'motion'` | Prefer frame rate; tolerate softer details. **Right for games, video, animations.** |
| `'detail'` / `'text'` | Prefer sharpness; tolerate lower frame rate. Right for IDEs, slide decks, design tools. |
| `'speech'` | (audio) Voice-tuned codec settings. Right for calls. |
| `'music'` | (audio) Preserves dynamic range. Right for game audio, system audio capture. |

```ts
const [video] = stream.getVideoTracks();
(video as MediaStreamTrack & { contentHint?: string }).contentHint = 'motion';
```

Setting the hint is one line and is the single highest-leverage change for "why does my game look bad".

### 3 · Encoder `maxBitrate` via `setParameters`

Even after you ask for 60 fps and tell the encoder to favor motion, **Chromium caps the outgoing video bitrate at around 2.5 Mbps for screen capture by default**. That's enough for a 1080p slide deck and visibly insufficient for 1080p60 game footage.

You raise it with `RTCRtpSender.setParameters`:

```ts
import { socket } from "rtc.io";

// rtc.io exposes the underlying RTCPeerConnection per peer:
const conn = socket.getPeer(peerId)?.connection;
if (!conn) return;

for (const sender of conn.getSenders()) {
  if (sender.track?.kind !== "video") continue;
  // (filter to the screen-share track if you have multiple)

  const params = sender.getParameters();
  params.encodings = (params.encodings ?? [{}]).map((enc) => ({
    ...enc,
    maxBitrate: 8_000_000,    // 8 Mbps — comfortable for 1080p60 motion
    maxFramerate: 60,
  }));
  await sender.setParameters(params);
}
```

This is per-peer — you call it once for every connected peer, and once more in your `peer-connect` handler so the cap is also applied when a new peer joins mid-share. The reference demo (`rtcio-web`) does this in `startScreenShare()`.

How high to go:

| Resolution + framerate | Comfortable cap |
| --- | --- |
| 720p30 (slides, IDE) | 1.5–2.5 Mbps (default is fine) |
| 720p60 (light motion) | 4 Mbps |
| 1080p30 (HD video) | 4–5 Mbps |
| 1080p60 (games, animation) | 6–10 Mbps |
| 1440p60 | 12–18 Mbps |
| 4K30 | 20–35 Mbps |

The browser still adapts downward when the network is congested; `maxBitrate` is a ceiling, not a floor.

### 4 · Audio DSP for non-voice sources

When you `getDisplayMedia({ audio: true })` (system audio capture), the browser runs the same voice-call DSP chain by default — **noise suppression, echo cancellation, automatic gain control**. That chain crushes game sound effects, music, and explosions because it was tuned to suppress everything that isn't a single human voice.

```ts
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: { /* ... */ },
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
});

stream.getAudioTracks().forEach((t) => {
  (t as MediaStreamTrack & { contentHint?: string }).contentHint = 'music';
});
```

For voice (`getUserMedia` with mic), keep the DSP on — that's what it's for.

## Other things that look like rtc.io lag but aren't

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Smooth start, gets choppy after a few seconds | Bandwidth ramp-down — congestion control thinks the link is congested | Open `chrome://webrtc-internals` and check `availableOutgoingBitrate` for the screen sender. If it's collapsing, the bottleneck is the network. |
| Laggy in one direction only | Asymmetric upload/download | The sender's upload is the cap. Wired Ethernet >> Wi-Fi for screen share. |
| Constant low fps no matter what | Browser fell back to software encoder | Check `chrome://gpu` — hardware video encode should be enabled. Some OS configurations disable it. |
| Receiver buffers a lot | Receiver is decoding on CPU | Same: hardware decode on the receiver side. |
| Goes through a TURN server | Relayed traffic adds latency + bandwidth cost | Check `getStats()` — `candidate-pair[type]` should be `host` or `srflx`, not `relay`. |

## What rtc.io itself does and doesn't do here

rtc.io owns:

- The signaling pattern, perfect negotiation, ICE restart, glare resolution.
- The DataChannel layer (backpressure, broadcast/per-peer matching).
- The lifecycle model (peer-connect / peer-disconnect / track-added).

rtc.io deliberately *doesn't* own:

- The encoder. That's the browser. We don't transcode; we don't recompress; we don't insert frames.
- The capture pipeline. `getUserMedia` / `getDisplayMedia` are the platform's. The constraints you pass go to the OS.
- Codec selection. The browser negotiates the codec list with the remote peer.

Tuning streams is therefore mostly about **passing the right hints to the platform** — capture constraints, `contentHint`, `setParameters`. rtc.io exposes the underlying `RTCPeerConnection` via `socket.getPeer(peerId).connection` precisely so you have full access to the WebRTC stats and parameter APIs without rtc.io standing in the way.

## A worked snippet, end-to-end

The four knobs together. Treat this as a starting point — every value here is
worth profiling against your own network and content type before you ship.
The reference demo at [rtcio.dev](https://rtcio.dev) deliberately uses the
plain `getDisplayMedia({ video: true, audio: true })` defaults so the path
through the library matches what most apps will do on day one; reach for
these knobs when you've got a concrete quality complaint to fix.

```ts
const raw = await navigator.mediaDevices.getDisplayMedia({
  video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
});

raw.getVideoTracks().forEach((t) => ((t as any).contentHint = 'motion'));
raw.getAudioTracks().forEach((t) => ((t as any).contentHint = 'music'));

const screen = new RTCIOStream(raw);
socket.emit('screenshare', { id: socket.id, name: userName, stream: screen });

// Bump every existing peer's outgoing screen-share encoder.
queueMicrotask(() => {
  for (const p of peers) {
    const conn = socket.getPeer(p.id)?.connection;
    if (!conn) continue;
    for (const sender of conn.getSenders()) {
      if (sender.track?.kind !== 'video') continue;
      if (!raw.getVideoTracks().some((t) => t.id === sender.track?.id)) continue;
      const params = sender.getParameters();
      params.encodings = (params.encodings ?? [{}]).map((enc) => ({
        ...enc, maxBitrate: 8_000_000, maxFramerate: 60,
      }));
      sender.setParameters(params).catch(() => {});
    }
  }
});

// Same path runs again on `peer-connect` so the cap also applies to
// peers that join mid-share.
```

That's the whole "make screen sharing not look like 2014 Skype" recipe.
