import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';

const installSnippet = `npm install rtc.io rtc.io-server`;

const clientSnippet = `import io, { RTCIOStream } from "rtc.io";

const socket = io("https://server.rtcio.dev", {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

socket.server.emit("join-room", { roomId: "demo", name: "alice" });

const local = await navigator.mediaDevices.getUserMedia({
  video: true, audio: true,
});

socket.emit("camera", new RTCIOStream(local));

socket.on("camera", (remote) => {
  videoEl.srcObject = remote.mediaStream;
});`;

export default function Home() {
  return (
    <Layout
      title="rtc.io — peer-to-peer media and data"
      description="rtc.io is a WebRTC client and signaling server with socket.io ergonomics. Streams, broadcast and per-peer DataChannels, perfect negotiation, ICE handling — all wrapped behind a familiar emit/on API."
    >
      <header className="hero hero--rtcio">
        <div className="container">
          <h1 className="hero__title">
            WebRTC, with socket.io ergonomics.
          </h1>
          <p className="hero__subtitle">
            Browser-to-browser media, broadcast channels, per-peer messaging, file transfers —
            wrapped behind <code>emit</code>/<code>on</code>. The server stays a thin signaling relay.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <Link className="button button--primary button--lg" to="/docs/getting-started">
              Get started
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/tutorial/intro">
              Tutorial
            </Link>
            <Link className="button button--secondary button--lg" href="https://rtcio.dev">
              Try the demo
            </Link>
          </div>
          <div style={{ maxWidth: 720, margin: '2.5rem auto 0', padding: '0 1rem' }}>
            <CodeBlock language="bash">{installSnippet}</CodeBlock>
            <CodeBlock language="ts" title="client.ts">{clientSnippet}</CodeBlock>
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: '4rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
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
    <div style={{
      padding: '1.5rem',
      borderRadius: '12px',
      border: '1px solid var(--ifm-toc-border-color)',
      background: 'var(--ifm-background-surface-color)',
    }}>
      <h3 style={{ marginTop: 0, fontSize: '1.05rem' }}>{title}</h3>
      <p style={{ fontSize: '0.95rem', color: 'var(--ifm-color-emphasis-700)', lineHeight: 1.55 }}>{body}</p>
      <Link to={link} style={{ fontSize: '0.9rem' }}>{linkLabel} →</Link>
    </div>
  );
}
