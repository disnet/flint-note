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
      { text: 'Guides', link: '/guides/installation' }
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Flint?', link: '/' },
          { text: 'Getting Started', link: '/getting-started' }
        ]
      },
      {
        text: 'Features',
        items: [
          { text: 'Notes & Organization', link: '/features/notes' },
          { text: 'AI Agent', link: '/features/agent' },
          { text: 'Review System', link: '/features/review-system' }
        ]
      },
      {
        text: 'Guides',
        items: [
          { text: 'Installation', link: '/guides/installation' },
          { text: 'Configuration', link: '/guides/configuration' }
        ]
      }
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/yourusername/flint' }],

    footer: {
      copyright: 'Copyright © 2025'
    }
  }
});
