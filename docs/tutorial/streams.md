---
id: streams
title: 3. Send camera and mic
description: Wrap a MediaStream in RTCIOStream, emit it, render the remote stream in a video element.
---

# 3. Send camera and mic

A peer connection without media is just signaling overhead. Let's add audio + video.

## Get local media

`getUserMedia` returns a `MediaStream` with audio and video tracks:

```ts
const local = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
});
```

Browsers will prompt for permission. Approve it.

`localhost` works without HTTPS. Any other origin (including `127.0.0.1` in some browsers) needs HTTPS — Vite's dev server is fine, just stay on `localhost`.

## Wrap it as RTCIOStream

```ts
import io, { RTCIOStream } from "rtc.io";

const camera = new RTCIOStream(local);
```

`RTCIOStream` is a thin wrapper that gives the library a stable id to track the stream by. Both peers see the same id once it's been replayed across the connection.

Display the local stream in a `<video>` element so you can see yourself:

```ts
const localVideo = document.querySelector<HTMLVideoElement>("video.local");
localVideo.srcObject = local;
```

(Make sure to mute the local video — `<video muted>` — or you'll hear yourself echo.)

## Emit it

```ts
socket.emit("camera", { id: socket.id, name: NAME, camera });
```

`socket.emit` with an `RTCIOStream` (or any object containing one — the library deep-walks args) routes through transceivers, not the ctrl channel. Specifically:

1. The stream gets registered in rtc.io's replay registry — late joiners receive it automatically.
2. For every currently connected peer, `addTransceiver` is called for each track (audio, video) with `direction: "sendonly"`.
3. The library kicks off a renegotiation. Peers exchange a fresh offer/answer round.
4. On the receiving side, `ontrack` fires; the library matches it back to the original `RTCIOStream` (using a small `mid`-handshake under the hood) and dispatches your `socket.on("camera", ...)` handler.

## Receive remote streams

```ts
socket.on("camera", ({ id, name, camera }: {
  id: string;
  name: string;
  camera: RTCIOStream;
}) => {
  console.log("got camera from", name);
  attachRemoteVideo(id, name, camera.mediaStream);
});
```

A small render helper:

```ts
function attachRemoteVideo(peerId: string, name: string, stream: MediaStream) {
  let el = document.getElementById(`peer-${peerId}`) as HTMLVideoElement | null;
  if (!el) {
    el = document.createElement("video");
    el.id = `peer-${peerId}`;
    el.autoplay = true;
    el.playsInline = true;
    el.style.cssText = "width:300px;border-radius:8px;background:#1a1a1a;";
    document.body.appendChild(el);

    const label = document.createElement("div");
    label.id = `label-${peerId}`;
    label.textContent = name;
    document.body.appendChild(label);
  }
  el.srcObject = stream;
}
```

## Putting it together

Updated `src/main.ts`:

```ts title="src/main.ts"
import io, { RTCIOStream } from "rtc.io";

const SERVER = "http://localhost:3001";
const ROOM = new URLSearchParams(location.search).get("room") ?? "rtcio-tutorial";
const NAME = prompt("Your name?") ?? "Guest";

const socket = io(SERVER, {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

const local = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
});

const localVideo = Object.assign(document.createElement("video"), {
  autoplay: true, playsInline: true, muted: true, srcObject: local,
});
localVideo.style.cssText = "width:300px;border-radius:8px;background:#1a1a1a;";
document.body.appendChild(localVideo);

const camera = new RTCIOStream(local);

socket.on("connect", () => {
  socket.server.emit("join-room", { roomId: ROOM, name: NAME });
  socket.emit("camera", { id: socket.id, name: NAME, camera });
});

socket.on("camera", ({ id, name, camera }) => {
  attachRemoteVideo(id, name, camera.mediaStream);
});

socket.on("peer-disconnect", ({ id }) => {
  document.getElementById(`peer-${id}`)?.remove();
  document.getElementById(`label-${id}`)?.remove();
});

function attachRemoteVideo(peerId: string, name: string, stream: MediaStream) {
  let el = document.getElementById(`peer-${peerId}`) as HTMLVideoElement | null;
  if (!el) {
    el = Object.assign(document.createElement("video"), {
      id: `peer-${peerId}`, autoplay: true, playsInline: true,
    }) as HTMLVideoElement;
    el.style.cssText = "width:300px;border-radius:8px;background:#1a1a1a;";
    document.body.appendChild(el);
    const label = Object.assign(document.createElement("div"), {
      id: `label-${peerId}`, textContent: name,
    });
    document.body.appendChild(label);
  }
  el.srcObject = stream;
}
```

Reload both tabs. You should now see your camera in the local tile and the other tab's camera in a remote tile.

## What about late joiners

Open a third tab. It should automatically see both of the existing peers' cameras — even though the existing peers `emit`-ed *before* the third tab existed.

That's the replay registry at work. When the third tab's peer connection comes up, the library iterates each existing peer's registered streams and calls `addTransceiver` for each. The third tab's `socket.on("camera", ...)` fires with both streams.

You don't write any of that. It's just there.

## Toggling mic and camera

To mute, set `track.enabled = false` — don't remove the track:

```ts
local.getAudioTracks().forEach(t => t.enabled = false);   // mute
local.getVideoTracks().forEach(t => t.enabled = false);   // camera off
```

The transceiver stays alive; the remote side just sees zeroed-out frames/silence. Toggle back to `true` to resume. No re-negotiation, no signaling.

If you want peers to see your mute state in their UI, broadcast it via `socket.emit`:

```ts
function setMic(on: boolean) {
  local.getAudioTracks().forEach(t => t.enabled = on);
  socket.emit("media-state", { id: socket.id, mic: on, cam: camOn, roomId: ROOM });
}

socket.on("media-state", ({ id, mic, cam }) => {
  // Update your UI for peer `id`.
});
```

The Quickstart server's `media-state` handler echoes this for you and caches it for late joiners.

## Switching mic / camera mid-call

If the user picks a different microphone, swap the track. The library's stream wrapper listens to `addtrack`/`removetrack` on the underlying `MediaStream` and calls `replaceTrack` on the existing `RTCRtpSender`:

```ts
async function switchMic(deviceId: string) {
  const fresh = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
  const newTrack = fresh.getAudioTracks()[0];
  const oldTrack = local.getAudioTracks()[0];
  if (oldTrack) {
    oldTrack.stop();
    local.removeTrack(oldTrack);
  }
  local.addTrack(newTrack);
}
```

No re-negotiation either — `replaceTrack` is a track-level operation that doesn't change the SDP.

## What's next

[Next: 4. Add chat →](chat)
