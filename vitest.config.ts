import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['test/app/setup.ts'],
    include: ['test/app/**/*.{test,spec}.{js,ts}', 'src/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', 'out', 'build', 'test/server']
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});
