import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': 'src'
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: 'src/main/index.ts'
        },
        external: ['typescript', /^typescript\//]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': 'src'
      }
    },
    build: {
      rollupOptions: {
        external: ['typescript', /^typescript\//]
      }
    }
  },
  renderer: {
    plugins: [svelte()],
    resolve: {
      alias: {
        '@': 'src'
      }
    }
  }
});
