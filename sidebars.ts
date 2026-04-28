import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'introduction',
    'getting-started',
    'examples',
    'how-it-works',
    {
      type: 'category',
      label: 'Tutorial',
      collapsed: false,
      items: [
        'tutorial/intro',
        'tutorial/server',
        'tutorial/client',
        'tutorial/streams',
        'tutorial/chat',
        'tutorial/files',
        'tutorial/deploy',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/perfect-negotiation',
        'guides/ice-and-turn',
        'guides/datachannels',
        'guides/streams',
        'guides/stream-tuning',
        'guides/backpressure',
        'guides/lifecycle',
        'guides/stats',
        'guides/security',
      ],
    },
    {
      type: 'category',
      label: 'Client API',
      collapsed: false,
      items: [
        'api/socket',
        'api/peer',
        'api/server-namespace',
        'api/rtciostream',
        'api/rtciochannel',
        'api/rtciobroadcastchannel',
        'api/events',
        'api/options',
      ],
    },
  ],
  serverSidebar: [
    'server/overview',
    'server/installation',
    'server/quickstart',
    'server/public-server',
    'server/protocol',
    'server/rooms',
    'server/customization',
    'server/deployment',
    'server/cors',
    'server/scaling',
  ],
};

export default sidebars;
