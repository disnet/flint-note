import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// electron-vite config for main and preload only
// Renderer is built separately using vite.renderer.config.ts
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
        external: ['typescript', /^typescript\//, 'canvas']
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
  }
});
