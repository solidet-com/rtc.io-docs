import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'rtc.io',
  tagline: 'WebRTC peer-to-peer media and data channels with socket.io ergonomics',
  favicon: 'img/favicon.svg',

  url: 'https://docs.rtcio.dev',
  baseUrl: '/',

  organizationName: 'solidet-com',
  projectName: 'rtc.io',

  onBrokenLinks: 'warn',

  headTags: [
    {
      tagName: 'meta',
      attributes: {
        name: 'description',
        content:
          'rtc.io — gold-standard WebRTC client and signaling server for the browser. Peer-to-peer media streams, broadcast and per-peer DataChannels, perfect negotiation, ICE restart, backpressure — wrapped in a socket.io emit/on API.',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'keywords',
        content:
          'webrtc, peer-to-peer, p2p, datachannel, mediastream, signaling, socket.io, perfect negotiation, ice, turn, sctp, broadcast channel, file transfer, screen sharing, video chat, rtc.io',
      },
    },
    {
      tagName: 'meta',
      attributes: { property: 'og:type', content: 'website' },
    },
    {
      tagName: 'meta',
      attributes: { property: 'og:site_name', content: 'rtc.io' },
    },
    {
      tagName: 'meta',
      attributes: { name: 'twitter:card', content: 'summary_large_image' },
    },
  ],

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    [
      // Local search index, no third-party API key required. Indexes both the
      // /docs section and the marketing pages so visitors can search either
      // from any page in the site.
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/docs',
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        searchBarShortcut: true,
        searchBarShortcutHint: true,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          // Docs live in their own repository (solidet-com/rtc.io-docs).
          // The "Edit this page" link goes there directly so contributors land
          // on the right tree without a docs/ prefix.
          editUrl: 'https://github.com/solidet-com/rtc.io-docs/edit/master/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    metadata: [
      {
        name: 'description',
        content:
          'rtc.io — WebRTC peer-to-peer media and data channels with socket.io ergonomics. Perfect negotiation, ICE handling, backpressure, broadcast channels, late-joiner stream replay — all behind a familiar emit/on API.',
      },
      {
        name: 'keywords',
        content:
          'webrtc, peer-to-peer, p2p, datachannel, mediastream, signaling, socket.io, perfect negotiation, ice, turn, sctp, broadcast channel, file transfer, screen sharing, video chat',
      },
    ],
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'rtc.io',
      logo: {
        alt: 'rtc.io',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'docSidebar',
          sidebarId: 'serverSidebar',
          position: 'left',
          label: 'Server',
        },
        {
          to: '/docs/examples',
          label: 'Examples',
          position: 'left',
        },
        {
          to: '/docs/tutorial/intro',
          label: 'Tutorial',
          position: 'left',
        },
        {
          to: '/docs/api/socket',
          label: 'API',
          position: 'left',
        },
        {
          to: '/why',
          label: 'Why rtc.io',
          position: 'left',
        },
        {
          href: 'https://rtcio.dev',
          label: 'Demo',
          position: 'right',
        },
        {
          href: 'https://www.npmjs.com/package/rtc.io',
          label: 'npm',
          position: 'right',
        },
        {
          href: 'https://github.com/solidet-com/rtc.io',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting started', to: '/docs/getting-started' },
            { label: 'Examples', to: '/docs/examples' },
            { label: 'Tutorial', to: '/docs/tutorial/intro' },
            { label: 'Client API', to: '/docs/api/socket' },
            { label: 'Server API', to: '/docs/server/overview' },
            { label: 'Why rtc.io', to: '/why' },
          ],
        },
        {
          title: 'Packages',
          items: [
            { label: 'rtc.io on npm', href: 'https://www.npmjs.com/package/rtc.io' },
            { label: 'rtc.io-server on npm', href: 'https://www.npmjs.com/package/rtc.io-server' },
          ],
        },
        {
          title: 'Resources',
          items: [
            { label: 'Live demo', href: 'https://rtcio.dev' },
            { label: 'Public signaling server', href: 'https://server.rtcio.dev' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: 'https://github.com/solidet-com/rtc.io' },
            { label: 'Issues', href: 'https://github.com/solidet-com/rtc.io/issues' },
            { label: 'Discussions', href: 'https://github.com/solidet-com/rtc.io/discussions' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} rtc.io. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.vsLight,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'json', 'typescript', 'tsx', 'jsx'],
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: false,
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
