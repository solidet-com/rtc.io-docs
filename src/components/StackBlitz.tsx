import React, { useMemo } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import CodeBlock from '@theme/CodeBlock';

interface StackBlitzProps {
  /**
   * Inline file map. Keys are paths relative to the project root, values
   * are file contents. The StackBlitz SDK posts this to the embed at click
   * time, so the project doesn't need to live in a separate GitHub repo.
   */
  files: Record<string, string>;
  /**
   * Path of the file to render inline as a syntax-highlighted block. The
   * preview/editor buttons send the user into the same project; this is
   * just what they read on the page before clicking.
   */
  file: string;
  /** StackBlitz template; almost always 'node' for our examples. */
  template?: 'javascript' | 'typescript' | 'node' | 'static' | 'html';
  /** Project dependencies for non-`node` templates. */
  dependencies?: Record<string, string>;
  /** A short label shown above the code block. */
  title?: string;
  /** Two-line description rendered above the code. */
  summary?: React.ReactNode;
  /** Optional caption rendered below the action bar. */
  caption?: React.ReactNode;
  /** Force a specific syntax-highlight language. Inferred from extension if omitted. */
  language?: string;
}

function inferLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'jsx':
      return 'jsx';
    case 'json':
      return 'json';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'md':
      return 'markdown';
    default:
      return 'text';
  }
}

function ActionButton({
  primary,
  href,
  onClick,
  children,
}: {
  primary?: boolean;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  // Both buttons use the surface-color background and the regular content
  // color so they read on both light and dark themes. Primary is
  // distinguished by a slightly darker / heavier border + bolder weight,
  // not by a saturated fill — the bright accent fill we had before was
  // unreadable in dark mode.
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: '0.85rem',
    fontWeight: primary ? 600 : 500,
    textDecoration: 'none',
    background: 'var(--ifm-background-surface-color)',
    color: 'var(--ifm-color-content)',
    border: `1px solid ${
      primary ? 'var(--ifm-color-emphasis-500)' : 'var(--ifm-color-emphasis-300)'
    }`,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background .15s, border-color .15s',
  };
  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = 'var(--ifm-color-emphasis-100)';
    e.currentTarget.style.borderColor = 'var(--ifm-color-emphasis-600)';
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = 'var(--ifm-background-surface-color)';
    e.currentTarget.style.borderColor = primary
      ? 'var(--ifm-color-emphasis-500)'
      : 'var(--ifm-color-emphasis-300)';
  };
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        onClick={onClick}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        style={style}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={style}
    >
      {children}
    </button>
  );
}

/**
 * Render an inline rtc.io example.
 *
 * The visible thing on the page is the source — syntax-highlighted, copyable,
 * scannable without leaving the doc. Two action buttons sit underneath:
 *   * "Open in StackBlitz" — full editor, new tab.
 *   * "Open live preview"  — preview-only, new tab.
 * Nothing iframes itself into the page; the docs stay fast, and the user
 * decides if they want to run it.
 */
export default function StackBlitz({
  files,
  file,
  template = 'node',
  dependencies,
  title,
  summary,
  caption,
  language,
}: StackBlitzProps) {
  const code = files[file] ?? '';
  const lang = language ?? inferLanguage(file);
  const fileList = useMemo(() => Object.keys(files), [files]);

  return (
    <figure
      style={{
        margin: '1.75rem 0',
        border: '1px solid var(--ifm-color-emphasis-200)',
        borderRadius: 12,
        background: 'var(--ifm-background-surface-color)',
        overflow: 'hidden',
      }}
    >
      {(title || summary) && (
        <header
          style={{
            padding: '0.85rem 1rem',
            borderBottom: '1px solid var(--ifm-color-emphasis-200)',
            background: 'var(--ifm-color-emphasis-100)',
          }}
        >
          {title && (
            <div
              style={{
                fontSize: '0.7rem',
                fontFamily: 'var(--ifm-font-family-monospace)',
                color: 'var(--ifm-color-emphasis-700)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: summary ? 4 : 0,
              }}
            >
              {title}
            </div>
          )}
          {summary && (
            <div
              style={{
                fontSize: '0.92rem',
                color: 'var(--ifm-color-content)',
                lineHeight: 1.5,
              }}
            >
              {summary}
            </div>
          )}
        </header>
      )}

      <div
        style={{
          // Drop the CodeBlock's own margin since we're nesting it inside
          // a card that already has padding/border.
          margin: 0,
        }}
      >
        <CodeBlock language={lang} title={file} showLineNumbers>
          {code.trimEnd()}
        </CodeBlock>
      </div>

      <BrowserOnly fallback={null}>
        {() => (
          <ActionBar
            files={files}
            file={file}
            template={template}
            dependencies={dependencies}
            title={title}
            fileCount={fileList.length}
          />
        )}
      </BrowserOnly>

      {caption && (
        <figcaption
          style={{
            padding: '0.5rem 1rem 0.85rem',
            fontSize: '0.82rem',
            color: 'var(--ifm-color-emphasis-700)',
            fontStyle: 'italic',
            background: 'var(--ifm-background-surface-color)',
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function ActionBar({
  files,
  file,
  template,
  dependencies,
  title,
  fileCount,
}: {
  files: Record<string, string>;
  file: string;
  template: NonNullable<StackBlitzProps['template']>;
  dependencies?: Record<string, string>;
  title?: string;
  fileCount: number;
}) {
  // SDK is loaded on demand the first time a button is clicked. Importing
  // it eagerly would ship ~30 KB to every page that has an embed; lazy
  // imports keep the docs page weight down for users who only read.
  const openInStackBlitz = async (view: 'editor' | 'preview') => {
    const sdk = (await import('@stackblitz/sdk')).default;
    sdk.openProject(
      {
        title: title ?? 'rtc.io example',
        description: '',
        template,
        files,
        dependencies,
      },
      {
        newWindow: true,
        openFile: file,
        view: view === 'preview' ? 'preview' : 'default',
      },
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '0.75rem 1rem',
        borderTop: '1px solid var(--ifm-color-emphasis-200)',
        background: 'var(--ifm-background-surface-color)',
      }}
    >
      <ActionButton primary onClick={() => openInStackBlitz('preview')}>
        ▶ Run live (new tab)
      </ActionButton>
      <ActionButton onClick={() => openInStackBlitz('editor')}>
        ⌨︎ Open editor in StackBlitz
      </ActionButton>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: '0.78rem',
          color: 'var(--ifm-color-emphasis-700)',
          fontFamily: 'var(--ifm-font-family-monospace)',
        }}
      >
        {fileCount} file{fileCount === 1 ? '' : 's'} · template: {template}
      </span>
    </div>
  );
}
