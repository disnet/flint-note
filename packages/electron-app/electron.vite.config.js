import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            rollupOptions: {
                input: {
                    index: 'src/main/index.ts'
                }
            }
        }
    },
    preload: {
        plugins: [externalizeDepsPlugin()]
    },
    renderer: {
        plugins: [svelte()]
    }
});
