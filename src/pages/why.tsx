import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';

export default function Why() {
  return (
    <Layout
      title="Why rtc.io — what it's for, and how it relates to the libraries we love"
      description="An honest explainer of what we built rtc.io for, the use cases that pulled us toward it, and how it sits next to the great work in the WebRTC ecosystem — peerjs, simple-peer, mediasoup, LiveKit — and especially socket.io, which we extend rather than replace."
    >
      <main className="container container--rtcio-prose" style={{ maxWidth: 860, padding: '4rem 1.25rem 6rem' }}>
        <h1 style={{ fontSize: '2.5rem', lineHeight: 1.15, marginBottom: '0.5rem' }}>
          Why rtc.io
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'var(--ifm-color-emphasis-700)', marginBottom: '2rem' }}>
          A short, friendly explainer of what we built rtc.io for, the use cases
          that pulled us toward writing it, and how it relates to the libraries
          we love and learned from — especially{' '}
          <a href="https://socket.io">socket.io</a>, which rtc.io extends rather
          than replaces.
        </p>

        <h2>Standing on socket.io's shoulders</h2>
        <p>
          rtc.io is, fundamentally, a thin layer on top of{' '}
          <a href="https://socket.io">socket.io</a>. The signaling client is
          a subclass of <code>socket.io-client</code>'s <code>Socket</code>;
          the server (<code>rtc.io-server</code>) extends <code>socket.io</code>'s
          <code> Server</code>. <code>emit</code>, <code>on</code>,{' '}
          <code>once</code>, namespaces, the wire protocol, the reconnection
          handling, the room model on the server — every bit of that is
          socket.io's, unchanged.
        </p>
        <p>
          We picked socket.io because it is the API the JS ecosystem already
          knows, because the maintainers have spent a decade making it
          robust under real-world networks, and because building peer-to-peer
          on top of an event bus that everyone already trusts is a much
          better starting point than reinventing one. If rtc.io feels
          familiar, that's why — and the credit is socket.io's.
        </p>

        <h2>What rtc.io is for</h2>
        <p>
          We wrote rtc.io because we kept finding ourselves in the same
          shape of problem: a small group of browser users (often two,
          sometimes up to a handful) need to send <em>media</em> and{' '}
          <em>data</em> to each other directly, with a server in the middle
          only long enough to introduce them. The use cases that pulled us
          toward this shape:
        </p>
        <ul>
          <li>
            <strong>1-on-1 calls</strong> — sales, support, telehealth,
            tutoring, customer success. Two parties; latency and privacy
            matter; an SFU is overkill.
          </li>
          <li>
            <strong>Small group meetings</strong> (≤ 6–8 people) where
            mesh bandwidth is fine and a centralized media server adds
            cost without adding value.
          </li>
          <li>
            <strong>Collaborative cursors and presence</strong> in browser
            apps — Figma-style multiplayer dots, live typing indicators,
            shared selection — where a server round-trip is felt.
          </li>
          <li>
            <strong>Browser-to-browser file drop</strong> with proper
            backpressure — moving big files between two known parties
            without uploading them anywhere.
          </li>
          <li>
            <strong>Game state and pose tracking</strong> over unordered,
            unreliable channels (one packet supersedes the last; a
            retransmit is just stale data).
          </li>
          <li>
            <strong>IoT and robotics dashboards</strong> where a relay in
            the middle adds avoidable latency.
          </li>
          <li>
            <strong>Anywhere you'd reach for socket.io</strong> for chat,
            and then realise you'd rather the chat not pass through your
            server at all.
          </li>
        </ul>
        <p>
          For all of those, the friction point was always the same: the
          80% of the work is the <em>connection</em> — perfect negotiation,
          ICE restart, transceiver reuse, glare resolution, late-joiner
          replay, DataChannel backpressure — and the application logic is
          the 20% you actually wanted to write. rtc.io exists to make that
          80% disappear behind <code>emit</code> and <code>on</code>.
        </p>

        <h2>The libraries we learned from</h2>
        <p>
          The WebRTC and real-time landscape on the web is genuinely good.
          Each of the libraries below taught us something, and rtc.io
          exists alongside them, not in opposition to them.
        </p>

        <h3>socket.io</h3>
        <p>
          The transport, the API, the philosophy. rtc.io is built on it
          and inherits everything from it. Anywhere rtc.io feels
          well-shaped, that shape came from socket.io. We're enormously
          grateful to the maintainers and the community.
        </p>

        <h3>peerjs</h3>
        <p>
          peerjs has been around since 2013 and has introduced more
          developers to WebRTC than probably any other library. Its
          friendly <code>peer.call(id, stream)</code> /{' '}
          <code>peer.connect(id).send(data)</code> API is the one most
          people remember when they think "WebRTC, but easy." If you have
          a peerjs project running today and it does what you need, that's
          a great outcome — keep it.
        </p>
        <p>
          We started rtc.io because our app naturally wanted{' '}
          <em>multiple named channels per peer</em> (a chat broadcast plus
          a file channel plus an unordered cursor channel), and we wanted
          the channel set to be a first-class concept that late joiners
          inherit automatically. peerjs is built around one DataChannel +
          one media slot per connection by design — that's the right
          choice for many apps and the wrong one for the shape we kept
          building, so we wrote rtc.io for ours rather than fight peerjs
          on its home turf.
        </p>

        <h3>simple-peer</h3>
        <p>
          simple-peer is honest about what it is — a clean, well-tested
          wrapper around <code>RTCPeerConnection</code> that gives you
          offers, answers, candidates, and lets you transport them
          yourself. It's an excellent choice when you already have a
          signaling protocol you like and just want the WebRTC primitive
          with sensible defaults.
        </p>
        <p>
          rtc.io takes the opposite end of that contract: we wanted the
          signaling protocol to <em>also</em> be solved, by socket.io, so
          that "open a peer connection between Alice and Bob" was one
          line on each side. If you're hand-rolling signaling already,
          simple-peer might be the better fit — and you can mix and
          match: rtc.io is happy to coexist.
        </p>

        <h3>mediasoup, LiveKit, Janus, Jitsi</h3>
        <p>
          These are <strong>SFUs</strong> — selective forwarding units.
          They terminate every peer's stream on a server and forward it
          to subscribers. They are the right answer for:
        </p>
        <ul>
          <li>Large rooms (10+ participants) where mesh bandwidth blows up.</li>
          <li>Server-side recording and composition.</li>
          <li>Webinar-style broadcast to thousands of viewers.</li>
          <li>Hard SLAs across heterogeneous networks (simulcast, SVC).</li>
          <li>PSTN dial-in, transcription, server-side moderation.</li>
        </ul>
        <p>
          They are tremendous projects and they solve hard problems that
          rtc.io deliberately does not try to solve. If your room sizes
          are big or your media has to live on the server side, an SFU is
          the right tool — and rtc.io is happy to live next to one in the
          same app (use the SFU for the all-hands, use rtc.io for the
          1-on-1 sales call that came out of it).
        </p>

        <h2>The fundamental things we wanted differently</h2>
        <p>
          To be concrete, the four things below are what pushed us toward
          writing a new library rather than wrapping an existing one. They
          aren't faults of any other library — most of them are
          intentional design decisions in those libraries that simply
          don't match the shape of what we kept building.
        </p>

        <h3>1. Multiple named channels per peer, as a first-class idea</h3>
        <p>
          Our apps wanted <code>chat</code> (ordered, broadcast),{' '}
          <code>cursors</code> (unordered, lossy, broadcast), and{' '}
          <code>file</code> (ordered, per-peer, big) — at the same time,
          to the same peers. Each with its own delivery semantics,
          backpressure budget, and lifecycle.
        </p>
        <p>
          rtc.io models that directly:
        </p>
        <CodeBlock language="ts">{`socket.createChannel('chat',    { ordered: true });
socket.createChannel('cursors', { ordered: false, maxRetransmits: 0 });
socket.peer(id).createChannel('file', { ordered: true });`}</CodeBlock>
        <p>
          All three coexist on the same peer connection, share the SCTP
          transport, and are matched between sides by name (no DC-OPEN
          handshake; we use <code>negotiated:true</code> with a
          deterministic SCTP stream id).
        </p>

        <h3>2. Streams are <em>routable</em> through emit</h3>
        <p>
          Most libraries split media (<code>peer.addStream</code> /{' '}
          <code>peer.call</code>) from messaging. We wanted streams to
          flow through the same event bus our application already uses:
        </p>
        <CodeBlock language="ts">{`socket.emit('camera', new RTCIOStream(local));
socket.on('camera', (remote) => { videoEl.srcObject = remote.mediaStream; });`}</CodeBlock>
        <p>
          The library detects the <code>RTCIOStream</code> payload,
          attaches transceivers, registers the stream for replay, and on
          the receiving side fires the same <code>'camera'</code> event
          handler your other code already uses. One mental model, one API.
        </p>

        <h3>3. Late joiners are a default, not an exercise</h3>
        <p>
          Every stream you <code>emit</code> is registered. When peer{' '}
          <em>N</em> joins after a screen share has already started, they
          receive that share automatically — no application code has to
          remember to re-broadcast it. The same is true for broadcast
          channels: a late joiner enters the channel without anyone
          having to call <code>createChannel</code> on their behalf.
        </p>

        <h3>4. Backpressure as a built-in contract</h3>
        <p>
          <code>RTCDataChannel</code> exposes <code>bufferedAmount</code>{' '}
          and an event but no queue, no watermarks, no budget. Every app
          shipping a file transfer reinvents the same loop. rtc.io ships
          it: a high-water mark (16 MB), a low-water mark (1 MB), a
          per-channel queue budget, <code>send()</code> returns{' '}
          <code>false</code> when you should back off, and{' '}
          <code>'drain'</code> tells you when to resume.
        </p>

        <h2>What rtc.io is not</h2>
        <ul>
          <li>
            <strong>Not an SFU.</strong> If you need 30+ person rooms,
            recording, or server-side moderation of media, run mediasoup
            or LiveKit. We're happy to coexist.
          </li>
          <li>
            <strong>Not a replacement for socket.io.</strong> We
            <em>are</em> socket.io, with peer-to-peer added on top.
          </li>
          <li>
            <strong>Not a hosted SaaS.</strong> We run a free public
            signaling server at <code>server.rtcio.dev</code> for demos
            and prototypes (with the caveats below), but the expectation
            is you self-host once you ship — it's an{' '}
            <code>npm i rtc.io-server</code> away.
          </li>
          <li>
            <strong>Not a media engine.</strong> Codec selection, audio
            processing, jitter buffers — that's the browser's job.
          </li>
        </ul>

        <h2>About the public signaling server</h2>
        <div
          style={{
            padding: '1.25rem 1.5rem',
            margin: '1.5rem 0',
            borderRadius: 12,
            border: '1px solid #e5b08266',
            background: 'rgba(229,176,130,0.08)',
          }}
        >
          <strong>⚠️ Important: rooms on `server.rtcio.dev` are global and unauthenticated.</strong>
          <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            The free public server we host is shared with everyone using
            rtc.io for prototypes and demos. <strong>Anyone who joins a
            room with the same name will land in the same call, including
            strangers.</strong> The server has no concept of room ownership,
            no authentication, and no way to tell two unrelated apps apart.
          </p>
          <p style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            For prototyping, generate a hard-to-guess room id (a UUID, or
            16+ random characters — see{' '}
            <code>crypto.randomUUID()</code>). For anything real, please{' '}
            <Link to="/docs/server/quickstart">run your own server</Link>{' '}
            — it's a single <code>npm install</code> and a 30-line file.
            That gives you authentication, room ownership, persistence,
            and full control over who can join what.
          </p>
        </div>

        <h2>A small comparison, when it helps</h2>
        <p>
          The matrix below is offered for "I just need to pick one" cases.
          Every cell is a simplification — the prose above has the nuance,
          and every library named here is a great choice for the use cases
          it was built for.
        </p>
        <div style={{ overflowX: 'auto', margin: '1.5rem 0' }}>
          <table>
            <thead>
              <tr>
                <th>Capability</th>
                <th>rtc.io</th>
                <th>peerjs</th>
                <th>simple-peer</th>
                <th>SFU</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Topology</td>
                <td>Mesh (P2P)</td>
                <td>Mesh (P2P)</td>
                <td>Mesh (P2P)</td>
                <td>Star (server)</td>
              </tr>
              <tr>
                <td>Sweet-spot room size</td>
                <td>2–8</td>
                <td>2–4</td>
                <td>2–4</td>
                <td>10–10,000+</td>
              </tr>
              <tr>
                <td>Multiple named channels per peer</td>
                <td>built-in</td>
                <td>not the focus</td>
                <td>build it yourself</td>
                <td>varies</td>
              </tr>
              <tr>
                <td>Late-joiner stream replay</td>
                <td>automatic</td>
                <td>application-level</td>
                <td>application-level</td>
                <td>handled by server</td>
              </tr>
              <tr>
                <td>DataChannel backpressure helpers</td>
                <td>included</td>
                <td>application-level</td>
                <td>application-level</td>
                <td>n/a</td>
              </tr>
              <tr>
                <td>Familiar API shape</td>
                <td>socket.io</td>
                <td>EventEmitter</td>
                <td>EventEmitter</td>
                <td>vendor SDK</td>
              </tr>
              <tr>
                <td>Self-hosted signaling</td>
                <td>rtc.io-server</td>
                <td>peerjs-server</td>
                <td>roll your own</td>
                <td>the SFU is the server</td>
              </tr>
              <tr>
                <td>Server cost at scale</td>
                <td>≈ socket.io</td>
                <td>≈ socket.io</td>
                <td>≈ socket.io</td>
                <td>CPU-heavy (transcode)</td>
              </tr>
              <tr>
                <td>Recording, server-side composition</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>included</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>When rtc.io is the right choice</h2>
        <ul>
          <li>1-on-1 video calls (sales, support, telehealth, tutoring).</li>
          <li>Small-group calls and rooms (≤ 8 people).</li>
          <li>
            Collaborative cursors / presence / live editing — broadcast
            channel + ctrl channel.
          </li>
          <li>Browser-to-browser file transfer with proper backpressure.</li>
          <li>Game state sync (unordered <code>maxRetransmits:0</code> channels).</li>
          <li>Anywhere you'd reach for socket.io and want the data plane to skip the server.</li>
        </ul>

        <h2>When something else is the right choice</h2>
        <ul>
          <li>30+ person all-hands or webinars → an SFU (LiveKit, mediasoup).</li>
          <li>Server-side recording or composition → an SFU.</li>
          <li>PSTN dial-in / SIP integration → a SIP gateway (Daily, Twilio, an SFU with SIP).</li>
          <li>You already have a signaling protocol you love → simple-peer.</li>
          <li>You only need 1 DataChannel + 1 media slot and want the smallest bundle → peerjs is great for that.</li>
        </ul>

        <h2>The path from prototype to production</h2>
        <ol>
          <li>
            <strong>Day 1.</strong> <code>npm i rtc.io</code>, point at{' '}
            <code>server.rtcio.dev</code> (with a <em>random</em> room id —
            see the disclaimer above), copy the{' '}
            <Link to="/docs/getting-started">Getting started</Link>{' '}
            snippet, ship a working call.
          </li>
          <li>
            <strong>Day 7.</strong>{' '}
            <code>npm i rtc.io-server</code> on a small box. Move signaling
            off the public broker. Add auth in your{' '}
            <code>connection</code> handler.
          </li>
          <li>
            <strong>Day 30.</strong> Add a TURN server (coturn / Cloudflare
            Calls / Twilio) for users behind symmetric NAT.{' '}
            <Link to="/docs/guides/ice-and-turn">Guide</Link>.
          </li>
          <li>
            <strong>Day 90.</strong> If you've genuinely outgrown mesh
            (10+ video streams per room), bring an SFU into the picture —
            rtc.io and the SFU can coexist for the parts of the app each
            is best at.
          </li>
        </ol>

        <h2>The honest trade-offs</h2>
        <ul>
          <li>
            <strong>Mesh bandwidth scales O(n²).</strong> Above ~8 video
            streams an SFU wins on bandwidth alone.
          </li>
          <li>
            <strong>You depend on socket.io's footprint.</strong> If you
            don't already use it, you're adding it. We picked socket.io
            because it's the JS ecosystem's most-trusted event transport;
            we wouldn't try to replace it.
          </li>
          <li>
            <strong>Mobile + battery.</strong> Mesh keeps every peer's
            CPU encoding to N destinations. For mobile-heavy apps with 5+
            peers, profile carefully.
          </li>
          <li>
            <strong>You still need a TURN server in production.</strong>{' '}
            ~10–15% of users are behind a NAT that requires relay. That's
            WebRTC, not us — but it's a real cost.
          </li>
        </ul>

        <h2>The summary</h2>
        <p>
          rtc.io is the answer when you want WebRTC's economics (free P2P
          bandwidth, zero media on your server) with socket.io's
          ergonomics (the API everyone already knows), for room sizes
          most apps actually have (2–8). For everything else, the libraries
          we mentioned above are excellent — and we'd rather you use the
          right tool than the one we wrote.
        </p>
        <p>
          If you've never written WebRTC and were about to, please read{' '}
          <Link to="/docs/how-it-works">How it works</Link> before you
          reach for the spec. It will save you a month either way.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '3rem', flexWrap: 'wrap' }}>
          <Link className="button button--primary button--lg" to="/docs/getting-started">
            Get started
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/examples">
            Examples
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/how-it-works">
            How it works
          </Link>
          <Link className="button button--secondary button--lg" href="https://github.com/solidet-com/rtc.io">
            Source on GitHub
          </Link>
        </div>
      </main>
    </Layout>
  );
}
