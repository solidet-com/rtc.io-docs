import React from 'react';

/**
 * Pointer card for the live reference demo at https://rtcio.dev.
 * Replaces the heavy GitHub-based StackBlitz embed of the rtcio-web project —
 * users get the live experience in a real tab (with real camera/mic
 * permissions, real fullscreen, etc.) instead of a sandboxed iframe.
 */
export default function LiveDemoLink({
  blurb = 'See the full reference app — chat, screen-share, file transfer, password-protected rooms — running in a real browser tab.',
  github = 'https://github.com/solidet-com/rtc.io/tree/main/rtcio-web',
  href = 'https://rtcio.dev',
}: {
  blurb?: React.ReactNode;
  github?: string;
  href?: string;
}) {
  return (
    <aside
      style={{
        margin: '1.75rem 0',
        padding: '1.1rem 1.25rem',
        borderRadius: 12,
        border: '1px solid var(--ifm-color-emphasis-300)',
        background:
          'linear-gradient(140deg, rgba(229,176,130,0.08), rgba(243,236,224,0.025))',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            fontSize: '0.7rem',
            fontFamily: 'var(--ifm-font-family-monospace)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ifm-color-emphasis-700)',
            marginBottom: 4,
          }}
        >
          Reference app
        </div>
        <div
          style={{
            fontSize: '1.05rem',
            color: 'var(--ifm-color-content)',
            fontWeight: 600,
          }}
        >
          rtcio.dev — the full demo, live
        </div>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '0.92rem',
          color: 'var(--ifm-color-emphasis-800)',
          lineHeight: 1.55,
        }}
      >
        {blurb}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 8,
            background: 'var(--ifm-background-surface-color)',
            color: 'var(--ifm-color-content)',
            fontWeight: 600,
            fontSize: '0.88rem',
            textDecoration: 'none',
            border: '1px solid var(--ifm-color-emphasis-500)',
          }}
        >
          ▶ Open rtcio.dev
        </a>
        <a
          href={github}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 8,
            background: 'var(--ifm-background-surface-color)',
            color: 'var(--ifm-color-content)',
            fontWeight: 500,
            fontSize: '0.88rem',
            textDecoration: 'none',
            border: '1px solid var(--ifm-color-emphasis-300)',
          }}
        >
          Source on GitHub →
        </a>
      </div>
    </aside>
  );
}
