/**
 * Inline StackBlitz examples for the rtc.io docs site.
 *
 * Each entry is a self-contained Vite + TypeScript project that boots in a
 * StackBlitz WebContainer and connects to the public signaling server at
 * `server.rtcio.dev`. Open the embed in two tabs and the two ends of the
 * sample come up against each other automatically.
 *
 * Why files-as-strings: the StackBlitz SDK posts the project to the embed at
 * mount time, so we don't need a separate GitHub repo per example, and the
 * source is rendered + downloadable straight from docs.rtcio.dev.
 *
 * Why a shared `viteConfig`: every example shares the same toolchain. Pulling
 * it into one constant keeps the per-example diff focused on what's different
 * about that example's rtc.io call site.
 */

const SHARED_PACKAGE_JSON = (deps: Record<string, string> = {}) =>
  JSON.stringify(
    {
      name: 'rtcio-example',
      private: true,
      type: 'module',
      scripts: {
        // `start` is what StackBlitz's WebContainer runs after `npm install`.
        // Aliasing it to the dev server boots the embed straight into the
        // running Vite preview — no terminal step for the user.
        start: 'vite --host',
        dev: 'vite --host',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        'rtc.io': '^1.2.0',
        ...deps,
      },
      devDependencies: {
        vite: '^5.4.0',
        typescript: '^5.4.0',
      },
    },
    null,
    2,
  ) + '\n';

const VITE_CONFIG = `import { defineConfig } from 'vite';
export default defineConfig({
  server: { host: true, port: 5173 },
  // The default esbuild target rewrites top-level await; rtc.io is fine
  // with modern Chrome but we leave this to the platform default.
});
`;

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      strict: true,
      jsx: 'preserve',
      skipLibCheck: true,
      isolatedModules: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ['src'],
  },
  null,
  2,
) + '\n';

const SHARED_README = (title: string, body: string) =>
  `# ${title}\n\n${body}\n\nOpen the preview URL in **two tabs** to see the two ends connect.\nUses the public signaling server at \`server.rtcio.dev\` — no setup required.\n`;

const SHARED_STYLE = `:root {
  --bg: #0a0908;
  --fg: #f3ece0;
  --accent: #e5b082;
  --line: #2a241c;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  min-height: 100vh;
  padding: 24px;
}
button {
  font: inherit;
  background: var(--accent);
  color: var(--bg);
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
input, textarea {
  font: inherit;
  background: var(--bg);
  border: 1px solid var(--line);
  color: var(--fg);
  padding: 10px 12px;
  border-radius: 8px;
  width: 100%;
}
.card {
  background: rgba(243,236,224,0.04);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 20px;
}
h1 { font-size: 1.4rem; margin: 0 0 16px; }
small { color: #98917f; }
`;

function shared(extraDeps: Record<string, string> = {}) {
  return {
    'package.json': SHARED_PACKAGE_JSON(extraDeps),
    'vite.config.ts': VITE_CONFIG,
    'tsconfig.json': TSCONFIG,
    'src/styles.css': SHARED_STYLE,
  };
}

// ─── 1. Minimal video call ──────────────────────────────────────────────────
const minimalVideoMain = `import io, { RTCIOStream } from 'rtc.io';
import './styles.css';

// Hard-to-guess room id keeps strangers out of the demo on the shared
// public server. First tab mints one; second tab inherits it from ?room=…
const params = new URLSearchParams(location.search);
let ROOM = params.get('room');
if (!ROOM) {
  ROOM = crypto.randomUUID();
  history.replaceState(null, '', \`?room=\${ROOM}\`);
}
const NAME = \`guest-\${Math.random().toString(36).slice(2, 6)}\`;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = \`
  <div class="card">
    <h1>Minimal video call · room <code>\${ROOM}</code></h1>
    <p><small>Open this URL in another tab to see the call connect peer-to-peer.</small></p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <video id="local" autoplay playsinline muted style="width:100%;border-radius:8px;background:#000;aspect-ratio:16/10"></video>
      <video id="remote" autoplay playsinline style="width:100%;border-radius:8px;background:#000;aspect-ratio:16/10"></video>
    </div>
    <p id="status" style="margin-top:12px"><small>Connecting…</small></p>
  </div>\`;

const localEl = document.getElementById('local') as HTMLVideoElement;
const remoteEl = document.getElementById('remote') as HTMLVideoElement;
const status = document.getElementById('status')!;

const socket = io('https://server.rtcio.dev', {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});

socket.server.emit('join-room', { roomId: ROOM, name: NAME });

const local = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
localEl.srcObject = local;
socket.emit('camera', new RTCIOStream(local));

socket.on('camera', (remote: RTCIOStream) => {
  remoteEl.srcObject = remote.mediaStream;
  status.innerHTML = '<small>Connected · streaming P2P</small>';
});

socket.on('peer-connect', ({ id }) => console.log('peer joined', id));
socket.on('peer-disconnect', ({ id }) => {
  console.log('peer left', id);
  status.innerHTML = '<small>Peer left. Open another tab to reconnect.</small>';
});
`;

const minimalVideoIndex = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>rtc.io · minimal video</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`;

export const minimalVideo = {
  ...shared(),
  'index.html': minimalVideoIndex,
  'src/main.ts': minimalVideoMain,
  'README.md': SHARED_README(
    'Minimal video call',
    'Two browsers, one room, peer-to-peer audio + video. Eight lines of rtc.io plus a couple of `<video>` elements.',
  ),
};

// ─── 2. Broadcast chat (no media) ───────────────────────────────────────────
const broadcastChatMain = `import io from 'rtc.io';
import './styles.css';

const params = new URLSearchParams(location.search);
let ROOM = params.get('room');
if (!ROOM) { ROOM = crypto.randomUUID(); history.replaceState(null, '', \`?room=\${ROOM}\`); }
const NAME = \`guest-\${Math.random().toString(36).slice(2, 6)}\`;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = \`
  <div class="card">
    <h1>Broadcast chat · room <code>\${ROOM}</code></h1>
    <p><small>Every peer (and any peer that joins later) shares one DataChannel.</small></p>
    <div id="log" style="height:280px;overflow:auto;background:#0a0908;border:1px solid var(--line);border-radius:8px;padding:10px;font-family:ui-monospace,monospace;font-size:13px"></div>
    <form id="form" style="display:flex;gap:8px;margin-top:10px">
      <input id="msg" placeholder="say hi…" autocomplete="off" />
      <button type="submit">Send</button>
    </form>
    <p style="margin-top:10px"><small>Joined as <code>\${NAME}</code> · open another tab to chat with yourself.</small></p>
  </div>\`;

const log = document.getElementById('log')!;
const form = document.getElementById('form') as HTMLFormElement;
const msg = document.getElementById('msg') as HTMLInputElement;

const append = (line: string, dim = false) => {
  const row = document.createElement('div');
  row.textContent = line;
  if (dim) row.style.opacity = '0.55';
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
};

const socket = io('https://server.rtcio.dev', {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});

socket.server.emit('join-room', { roomId: ROOM, name: NAME });

// One broadcast channel, every peer shares it. Late joiners are auto-included
// because the library replays \`_channelDefs\` on each new peer connection.
const chat = socket.createChannel('chat', { ordered: true });

chat.on('msg', (m: { name: string; text: string }) => {
  append(\`\${m.name}: \${m.text}\`);
});

socket.on('peer-connect', ({ id }) => append(\`\${id.slice(-4)} joined\`, true));
socket.on('peer-disconnect', ({ id }) => append(\`\${id.slice(-4)} left\`, true));

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = msg.value.trim();
  if (!text) return;
  chat.emit('msg', { name: NAME, text });
  append(\`you: \${text}\`);
  msg.value = '';
});
`;

const chatIndex = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>rtc.io · broadcast chat</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`;

export const broadcastChat = {
  ...shared(),
  'index.html': chatIndex,
  'src/main.ts': broadcastChatMain,
  'README.md': SHARED_README(
    'Broadcast chat',
    'A `socket.createChannel("chat")` broadcast DataChannel. No media. Every peer in the room sees every message; late joiners are auto-included.',
  ),
};

// ─── 3. Per-peer messaging (RPC pattern) ────────────────────────────────────
const perPeerRpcMain = `import io from 'rtc.io';
import './styles.css';

const params = new URLSearchParams(location.search);
let ROOM = params.get('room');
if (!ROOM) { ROOM = crypto.randomUUID(); history.replaceState(null, '', \`?room=\${ROOM}\`); }
const NAME = \`guest-\${Math.random().toString(36).slice(2, 6)}\`;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = \`
  <div class="card">
    <h1>Per-peer messaging · room <code>\${ROOM}</code></h1>
    <p><small>RPC over <code>socket.peer(id).emit/on</code> — message goes to one peer, not all.</small></p>
    <div id="peers" style="display:flex;flex-direction:column;gap:8px"></div>
    <p style="margin-top:10px"><small>You are <code>\${NAME}</code>. Open in two tabs.</small></p>
  </div>\`;

const peersBox = document.getElementById('peers')!;
const renderPeer = (id: string) => {
  const row = document.createElement('div');
  row.id = \`peer-\${id}\`;
  row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:10px;background:rgba(0,0,0,.25);border:1px solid var(--line);border-radius:8px';
  row.innerHTML = \`
    <code style="flex:1">peer \${id.slice(-6)}</code>
    <button data-ping="\${id}">Ping</button>
    <span data-status="\${id}" style="opacity:.7">—</span>\`;
  peersBox.appendChild(row);
};
const dropPeer = (id: string) => document.getElementById(\`peer-\${id}\`)?.remove();

const socket = io('https://server.rtcio.dev', {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});

socket.server.emit('join-room', { roomId: ROOM, name: NAME });

// Library lifecycle event — fires when the ctrl DataChannel to the peer opens,
// which is the moment \`socket.peer(id).emit\` becomes deliverable.
socket.on('peer-connect', ({ id }) => {
  renderPeer(id);
  // Send the new peer our hello on connect.
  socket.peer(id).emit('hello', { name: NAME });
  // Listen for their replies to our pings.
  socket.peer(id).on('pong', (data: { rtt: number }) => {
    document.querySelector(\`[data-status="\${id}"]\`)!.textContent =
      \`pong · \${data.rtt.toFixed(1)} ms\`;
  });
});

socket.on('peer-disconnect', ({ id }) => dropPeer(id));

// Global handlers — fire for messages from ANY peer.
socket.on('hello', (m: { name: string }) => console.log('hello from', m.name));
socket.on('ping', function (this: any, payload: { sentAt: number; from: string }) {
  // Reply directly to the sender.
  socket.peer(payload.from).emit('pong', {
    rtt: performance.now() - payload.sentAt,
  });
});

peersBox.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const id = target.dataset.ping;
  if (!id) return;
  socket.peer(id).emit('ping', { sentAt: performance.now(), from: socket.id });
  document.querySelector(\`[data-status="\${id}"]\`)!.textContent = 'sent…';
});
`;

export const perPeerRpc = {
  ...shared(),
  'index.html': minimalVideoIndex.replace('minimal video', 'per-peer messaging'),
  'src/main.ts': perPeerRpcMain,
  'README.md': SHARED_README(
    'Per-peer messaging (RPC pattern)',
    'Targeted send via `socket.peer(id).emit()`. The library routes over the per-peer ctrl DataChannel — same wire as broadcast emit, but only the named peer sees it.',
  ),
};

// ─── 4. File transfer with backpressure ─────────────────────────────────────
const fileTransferMain = `import io, { RTCIOChannel } from 'rtc.io';
import './styles.css';

const params = new URLSearchParams(location.search);
let ROOM = params.get('room');
if (!ROOM) { ROOM = crypto.randomUUID(); history.replaceState(null, '', \`?room=\${ROOM}\`); }
const NAME = \`guest-\${Math.random().toString(36).slice(2, 6)}\`;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = \`
  <div class="card">
    <h1>File transfer · room <code>\${ROOM}</code></h1>
    <p><small>Per-peer ordered DataChannel · respects backpressure via <code>send() === false</code> &amp; <code>'drain'</code>.</small></p>
    <input id="file" type="file" />
    <progress id="prog" max="100" value="0" style="width:100%;margin-top:10px;display:none"></progress>
    <p id="status"><small>Open a second tab to bring a peer online.</small></p>
    <div id="received" style="margin-top:14px;display:flex;flex-direction:column;gap:8px"></div>
    <p style="margin-top:10px"><small>You are <code>\${NAME}</code>.</small></p>
  </div>\`;

const fileInput = document.getElementById('file') as HTMLInputElement;
const prog = document.getElementById('prog') as HTMLProgressElement;
const status = document.getElementById('status')!;
const received = document.getElementById('received')!;

const socket = io('https://server.rtcio.dev', {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});
socket.server.emit('join-room', { roomId: ROOM, name: NAME });

const channels = new Map<string, RTCIOChannel>();

socket.on('peer-connect', ({ id }) => {
  // Both sides call createChannel('file'); negotiated:true means each end
  // describes the same SCTP stream id in its initial SDP, so the channel is
  // open without a DC-OPEN handshake.
  const ch = socket.peer(id).createChannel('file', { ordered: true });
  channels.set(id, ch);
  attachReceiver(ch);
  status.innerHTML = \`<small>Peer \${id.slice(-4)} ready · pick a file to send.</small>\`;
});

socket.on('peer-disconnect', ({ id }) => {
  channels.delete(id);
  if (channels.size === 0) status.innerHTML = '<small>No peers connected.</small>';
});

interface FileMeta { tid: string; name: string; size: number; mime: string }

function attachReceiver(channel: RTCIOChannel) {
  let state: { meta: FileMeta; chunks: ArrayBuffer[]; bytes: number } | null = null;

  channel.on('meta', (meta: FileMeta) => {
    state = { meta, chunks: [], bytes: 0 };
  });

  channel.on('data', (chunk: ArrayBuffer) => {
    if (!state) return;
    state.chunks.push(chunk);
    state.bytes += chunk.byteLength;
  });

  channel.on('eof', () => {
    if (!state) return;
    const blob = new Blob(state.chunks, { type: state.meta.mime });
    const url = URL.createObjectURL(blob);
    const row = document.createElement('a');
    row.href = url;
    row.download = state.meta.name;
    row.textContent = \`📥 \${state.meta.name} (\${(blob.size/1024).toFixed(1)} KB) — click to download\`;
    row.style.cssText = 'color:var(--accent);text-decoration:underline';
    received.appendChild(row);
    state = null;
  });
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (channels.size === 0) {
    alert('No peers connected — open this URL in another tab first.');
    return;
  }
  prog.style.display = 'block';
  prog.value = 0;

  const tid = crypto.randomUUID();
  const CHUNK = 16 * 1024;

  for (const [, channel] of channels) {
    channel.emit('meta', { tid, name: file.name, size: file.size, mime: file.type });
  }

  let sent = 0;
  for (let off = 0; off < file.size; off += CHUNK) {
    const buf = await file.slice(off, off + CHUNK).arrayBuffer();
    for (const [, channel] of channels) {
      // send() returning false means the chunk was queued. Wait for the
      // 'drain' event before pushing more — this is the entire backpressure
      // contract.
      if (!channel.send(buf)) {
        await new Promise<void>((r) => channel.once('drain', () => r()));
      }
    }
    sent += buf.byteLength;
    prog.value = Math.round((sent / file.size) * 100);
  }

  for (const [, channel] of channels) channel.emit('eof', { tid });
  status.innerHTML = \`<small>Sent <strong>\${file.name}</strong> to \${channels.size} peer(s).</small>\`;
});
`;

const fileTransferIndex = minimalVideoIndex.replace('minimal video', 'file transfer');

export const fileTransfer = {
  ...shared(),
  'index.html': fileTransferIndex,
  'src/main.ts': fileTransferMain,
  'README.md': SHARED_README(
    'File transfer with backpressure',
    'Custom per-peer DataChannel + 16 KB chunks + the `send()` / `drain` flow-control contract. The same approach scales to GB-sized files without OOMing the tab.',
  ),
};

// ─── 5. Late-joiner stream replay ───────────────────────────────────────────
const lateJoinerMain = `import io, { RTCIOStream } from 'rtc.io';
import './styles.css';

const params = new URLSearchParams(location.search);
let ROOM = params.get('room');
if (!ROOM) { ROOM = crypto.randomUUID(); history.replaceState(null, '', \`?room=\${ROOM}\`); }
const NAME = \`guest-\${Math.random().toString(36).slice(2, 6)}\`;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = \`
  <div class="card">
    <h1>Late-joiner stream replay · room <code>\${ROOM}</code></h1>
    <p>
      <small>Click <strong>Share screen</strong> in tab #1, then open this URL in tab #2.<br>
      Tab #2 sees the screen share immediately even though it joined late — the library
      replays registered streams to every new peer.</small>
    </p>
    <button id="share">Share screen</button>
    <button id="stop" disabled>Stop sharing</button>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      <video id="local" autoplay playsinline muted style="width:100%;border-radius:8px;background:#000;aspect-ratio:16/10"></video>
      <video id="remote" autoplay playsinline style="width:100%;border-radius:8px;background:#000;aspect-ratio:16/10"></video>
    </div>
    <p style="margin-top:10px"><small>You are <code>\${NAME}</code>.</small></p>
  </div>\`;

const localEl = document.getElementById('local') as HTMLVideoElement;
const remoteEl = document.getElementById('remote') as HTMLVideoElement;
const shareBtn = document.getElementById('share') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;

const socket = io('https://server.rtcio.dev', {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});

socket.server.emit('join-room', { roomId: ROOM, name: NAME });

let myStream: RTCIOStream | null = null;

shareBtn.addEventListener('click', async () => {
  const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
  myStream = new RTCIOStream(display);
  localEl.srcObject = display;
  // emit() is enough — late joiners auto-receive this stream because the
  // library keeps a replay registry keyed by the stream's id.
  socket.emit('screen', myStream);
  shareBtn.disabled = true;
  stopBtn.disabled = false;

  display.getVideoTracks()[0].addEventListener('ended', () => stopBtn.click());
});

stopBtn.addEventListener('click', () => {
  if (!myStream) return;
  myStream.mediaStream.getTracks().forEach((t) => t.stop());
  // untrackStream drops it from the replay registry so peers joining AFTER
  // we stop sharing don't see a dead stream attached.
  socket.untrackStream(myStream);
  myStream = null;
  localEl.srcObject = null;
  shareBtn.disabled = false;
  stopBtn.disabled = true;
});

socket.on('screen', (s: RTCIOStream) => {
  remoteEl.srcObject = s.mediaStream;
});
`;

const lateJoinerIndex = minimalVideoIndex.replace('minimal video', 'late-joiner replay');

export const lateJoinerReplay = {
  ...shared(),
  'index.html': lateJoinerIndex,
  'src/main.ts': lateJoinerMain,
  'README.md': SHARED_README(
    'Late-joiner stream replay',
    'Demonstrates the `socket.emit(ev, RTCIOStream)` + `socket.untrackStream(stream)` lifecycle. Open one tab, share your screen, then open a second tab — it sees the share immediately even though the share started before it connected.',
  ),
};

// ─── 6. Unordered, lossy DataChannel (game state) ───────────────────────────
const unorderedChannelMain = `import io, { type RTCIOBroadcastChannel } from 'rtc.io';
import './styles.css';

const params = new URLSearchParams(location.search);
let ROOM = params.get('room');
if (!ROOM) { ROOM = crypto.randomUUID(); history.replaceState(null, '', \`?room=\${ROOM}\`); }
const NAME = \`guest-\${Math.random().toString(36).slice(2, 6)}\`;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = \`
  <div class="card">
    <h1>Unordered DataChannel · room <code>\${ROOM}</code></h1>
    <p><small>Move your mouse over the dark canvas. <code>{ ordered: false, maxRetransmits: 0 }</code> means
    the latest position wins — stale frames don't queue up.</small></p>
    <div id="canvas" style="position:relative;height:380px;background:#0a0908;border:1px solid var(--line);border-radius:8px;overflow:hidden;cursor:crosshair">
    </div>
    <p style="margin-top:10px"><small>You are <code>\${NAME}</code>.</small></p>
  </div>\`;

const canvas = document.getElementById('canvas')!;

const socket = io('https://server.rtcio.dev', {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});

socket.server.emit('join-room', { roomId: ROOM, name: NAME });

// ordered: false  + maxRetransmits: 0  =  unreliable, unordered SCTP — this
// is the right shape for cursor positions, game state, etc. The library
// uses the same negotiated:true scheme internally; both sides match by name.
const cursors: RTCIOBroadcastChannel = socket.createChannel('cursors', {
  ordered: false,
  maxRetransmits: 0,
});

const dots = new Map<string, HTMLDivElement>();
const dotFor = (id: string) => {
  let d = dots.get(id);
  if (d) return d;
  d = document.createElement('div');
  d.style.cssText = 'position:absolute;width:14px;height:14px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent);pointer-events:none;transition:transform 60ms linear;transform:translate(-50%,-50%)';
  canvas.appendChild(d);
  dots.set(id, d);
  return d;
};

cursors.on('move', (m: { id: string; x: number; y: number }) => {
  const d = dotFor(m.id);
  d.style.left = m.x + 'px';
  d.style.top = m.y + 'px';
});

socket.on('peer-disconnect', ({ id }) => {
  dots.get(id)?.remove();
  dots.delete(id);
});

let last = 0;
canvas.addEventListener('mousemove', (e) => {
  const now = performance.now();
  if (now - last < 16) return; // rough 60fps cap before backpressure does it for us
  last = now;
  const r = canvas.getBoundingClientRect();
  cursors.emit('move', { id: socket.id, x: e.clientX - r.left, y: e.clientY - r.top });
});
`;

const unorderedIndex = minimalVideoIndex.replace('minimal video', 'unordered datachannel');

export const unorderedChannel = {
  ...shared(),
  'index.html': unorderedIndex,
  'src/main.ts': unorderedChannelMain,
  'README.md': SHARED_README(
    'Unordered, lossy DataChannel (cursor sync)',
    'Pass `{ ordered: false, maxRetransmits: 0 }` to `createChannel`. The SCTP stream is unreliable + unordered — perfect for cursors, game state, pose tracking, anything where the next packet is more useful than the last one.',
  ),
};
