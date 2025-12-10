import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import wasm from 'vite-plugin-wasm';
import path from 'path';

// Standalone Vite config for renderer build
export default defineConfig({
  plugins: [wasm(), svelte()],
  root: 'src/renderer',
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
    target: 'esnext'
  }
});
