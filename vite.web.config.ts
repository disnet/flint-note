import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import wasm from 'vite-plugin-wasm';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { rename, unlink } from 'fs/promises';
import { existsSync } from 'fs';

// Plugin to rename index.web.html to index.html in the output
function renameHtmlPlugin(): Plugin {
  return {
    name: 'rename-html',
    async closeBundle() {
      const outDir = path.resolve(__dirname, 'web-app');
      const oldPath = path.join(outDir, 'index.web.html');
      const newPath = path.join(outDir, 'index.html');

      if (existsSync(oldPath)) {
        if (existsSync(newPath)) {
          await unlink(newPath);
        }
        await rename(oldPath, newPath);
      }
    }
  };
}

// Standalone Vite config for web build (non-Electron)
export default defineConfig(({ mode }) => ({
  plugins: [
    wasm(),
    svelte(),
    renameHtmlPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Flint Notes',
        short_name: 'Flint',
        description:
          'A note-taking app that helps you capture ideas, connect them together, and make them part of how you think',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5MB for WASM files
      }
    })
  ],
  root: 'src/renderer',
  base: '/',
  define: {
    'import.meta.env.DEV': JSON.stringify(mode === 'development'),
    'import.meta.env.WEB_BUILD': JSON.stringify(true)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: '../../web-app',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.web.html')
    }
  }
}));
