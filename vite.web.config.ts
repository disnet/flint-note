import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import wasm from 'vite-plugin-wasm';
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
