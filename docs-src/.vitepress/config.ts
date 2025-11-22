import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Flint Docs',
  description: 'A note-taking app built for deep knowledge',
  base: '/docs/',
  outDir: '../website/docs',

  head: [
    [
      'link',
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }
    ],
    [
      'link',
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }
    ],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }]
  ],

  themeConfig: {
    logo: '/apple-touch-icon.png',

    search: {
      provider: 'local'
    },

    outline: {
      level: [2, 3],
      label: 'On this page'
    },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Features', link: '/features/notes' },
      { text: 'Guides', link: '/guides/core-concepts' }
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [{ text: 'Getting Started', link: '/getting-started' }]
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Understanding Flint', link: '/guides/core-concepts' },
          { text: 'User Interface', link: '/guides/interface' }
        ]
      },
      {
        text: 'Features',
        collapsed: false,
        items: [
          { text: 'Notes & Markdown', link: '/features/notes' },
          { text: 'Search', link: '/features/search' },
          { text: 'Wikilinks & Backlinks', link: '/features/wikilinks' },
          { text: 'Agent', link: '/features/agent' },
          { text: 'Daily Notes', link: '/features/daily-notes' },
          { text: 'Review System', link: '/features/review-system' },
          { text: 'Organization', link: '/features/organization' },
          { text: 'Workspaces', link: '/features/workspaces' },
          { text: 'Multi-Vault', link: '/features/vaults' },
          { text: 'Editor', link: '/features/editor' }
        ]
      },
      {
        text: 'Advanced Features',
        collapsed: true,
        items: [
          { text: 'Workflows & Automation', link: '/features/workflows' },
          { text: 'Custom Functions', link: '/features/custom-functions' }
        ]
      },
      {
        text: 'Guides',
        collapsed: true,
        items: [
          { text: 'Installation', link: '/guides/installation' },
          { text: 'Configuration', link: '/guides/configuration' },
          { text: 'Keyboard Shortcuts', link: '/guides/shortcuts' },
          { text: 'Best Practices', link: '/guides/best-practices' },
          { text: 'Privacy & Security', link: '/guides/privacy-security' }
        ]
      },
      {
        text: 'Help',
        collapsed: true,
        items: [
          { text: 'Troubleshooting', link: '/guides/troubleshooting' },
          { text: 'FAQ', link: '/guides/faq' }
        ]
      }
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/yourusername/flint' }],

    footer: {
      copyright: 'Copyright © 2025'
    }
  }
});
