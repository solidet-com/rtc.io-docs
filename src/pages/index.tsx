import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';

const installSnippet = `npm install rtc.io rtc.io-server`;

const clientSnippet = `import io, { RTCIOStream } from "rtc.io";

const socket = io("https://server.rtcio.dev", {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

// Ask for camera/mic *before* joining — a peer who arrives during the
// browser permission prompt would otherwise see you as "in the room"
// with no stream attached.
const local = await navigator.mediaDevices.getUserMedia({
  video: true, audio: true,
});
const camera = new RTCIOStream(local);

socket.server.emit("join-room", { roomId: "demo", name: "alice" });

// You can ship app metadata alongside the stream — the library walks args
// for any RTCIOStream and preserves the rest of the shape verbatim.
socket.emit("camera", { stream: camera, metadata: { displayName: "Alice" } });

socket.on("camera", ({ stream, metadata }) => {
  videoEl.srcObject = stream.mediaStream;
  label.textContent = metadata.displayName;
});`;

export default function Home() {
  return (
    <Layout
      title="rtc.io — peer-to-peer media and data"
      description="rtc.io is a WebRTC client and signaling server with socket.io ergonomics. Streams, broadcast and per-peer DataChannels, perfect negotiation, ICE handling — all wrapped behind a familiar emit/on API."
    >
      <header className="hero hero--rtcio">
        <div className="container hero--rtcio__inner">
          <div className="hero--rtcio__wordmark" aria-label="rtc.io">
            rtc<span className="hero--rtcio__dot">.</span>io
          </div>
          <p className="hero--rtcio__eyebrow">
            WebRTC client &middot; signaling server &middot; socket.io ergonomics
          </p>
          <h1 className="hero__title">
            Peer-to-peer media and data,<br />
            behind <code>emit</code> &amp; <code>on</code>.
          </h1>
          <p className="hero__subtitle">
            Browser-to-browser streams, broadcast and per-peer DataChannels, file transfers,
            late-joiner replay, perfect negotiation — all wrapped behind the socket.io API
            you already know. The server stays a thin signaling relay.
          </p>
          <div className="hero--rtcio__cta">
            <Link className="button button--primary button--lg" to="/docs/getting-started">
              Get started
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/tutorial/intro">
              Tutorial
            </Link>
            <Link className="button button--secondary button--lg" href="https://rtcio.dev">
              Try the demo &rarr;
            </Link>
          </div>
          <div className="hero--rtcio__code">
            <CodeBlock language="bash">{installSnippet}</CodeBlock>
            <CodeBlock language="ts" title="client.ts">{clientSnippet}</CodeBlock>
          </div>
        </div>
      </header>

      <main className="container landing-features">
        <div className="landing-features__grid">
          <Feature
            title="Perfect negotiation, baked in"
            body="W3C polite/impolite roles, stale-answer detection, manual rollback fallback, automatic ICE restart on failure. You never see an offer, an answer, or an ICE candidate."
            link="/docs/guides/perfect-negotiation"
            linkLabel="Read the guide"
          />
          <Feature
            title="Channels like socket.io rooms"
            body="createChannel('chat') is a broadcast DataChannel that every peer (and any peer that joins later) shares. Per-peer channels for one-to-one. ordered/unordered, custom budgets."
            link="/docs/guides/datachannels"
            linkLabel="DataChannels guide"
          />
          <Feature
            title="Streams as first-class"
            body="emit('camera', new RTCIOStream(media)) — the library reuses transceivers, handles late joiners by replaying registered streams, and lets you toggle tracks on the fly."
            link="/docs/guides/streams"
            linkLabel="Streams guide"
          />
          <Feature
            title="Backpressure that actually works"
            body="High/low watermarks, a per-channel queue budget, drain events. Big file transfers don't blow up your tab; slow peers don't pin memory forever."
            link="/docs/guides/backpressure"
            linkLabel="Backpressure guide"
          />
          <Feature
            title="Self-hosted or hosted signaling"
            body="rtc.io-server is a thin socket.io extension you can drop on Heroku, Fly, or your own box. We also host server.rtcio.dev — free, public, perfect for prototypes."
            link="/docs/server/public-server"
            linkLabel="Public server"
          />
          <Feature
            title="No SDP wrangling"
            body="ICE candidates, transceivers, glare resolution, MID matching, stream replay — handled by the library. You write emit and on."
            link="/docs/how-it-works"
            linkLabel="How it works"
          />
        </div>
      </main>
    </Layout>
  );
}

function Feature({ title, body, link, linkLabel }: { title: string; body: string; link: string; linkLabel: string }) {
  return (
    <div className="landing-feature">
      <h3 className="landing-feature__title">{title}</h3>
      <p className="landing-feature__body">{body}</p>
      <Link to={link} className="landing-feature__link">{linkLabel} →</Link>
    </div>
  );
}
