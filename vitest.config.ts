import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    // Isolate each test file to prevent process.env conflicts between parallel tests
    isolate: true,
    // Use forks instead of threads to ensure complete process isolation
    pool: 'forks'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
