import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import wasm from 'vite-plugin-wasm';
import path from 'path';

// Plugin to rename index.web.html to index.html in the output
function renameHtmlPlugin(): Plugin {
  return {
    name: 'rename-html',
    generateBundle(_, bundle) {
      if (bundle['index.web.html']) {
        bundle['index.html'] = bundle['index.web.html'];
        bundle['index.html'].fileName = 'index.html';
        delete bundle['index.web.html'];
      }
    }
  };
}

// Standalone Vite config for web build (non-Electron)
export default defineConfig(({ mode }) => ({
  plugins: [wasm(), svelte(), renameHtmlPlugin()],
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
