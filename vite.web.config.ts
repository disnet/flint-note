import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import wasm from 'vite-plugin-wasm';
import path from 'path';

// Standalone Vite config for web build (non-Electron)
export default defineConfig(({ mode }) => ({
  plugins: [wasm(), svelte()],
  root: 'src/renderer',
  base: '/app/',
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
    outDir: '../../website/app',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.web.html')
    }
  }
}));
