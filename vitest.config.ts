import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Test file patterns
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'out', 'build', 'dist'],

    // Global test setup
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/main/services/flintApiService.ts'],
      exclude: [
        'node_modules/',
        'out/',
        'build/',
        'dist/',
        'src/**/*.d.ts',
        'src/**/*.config.*',
        'src/**/*.test.*',
        'src/**/*.spec.*',
        'src/test/**/*',
        'src/renderer/**/*',
        'src/preload/**/*'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    },

    // Timeout configuration
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporter configuration
    reporters: ['default'],

    // Watch configuration
    watch: false,

    // Mock configuration
    clearMocks: true,
    restoreMocks: true,

    // Setup files
    setupFiles: ['src/test/setup.ts']
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },

  // Handle TypeScript and ES modules
  esbuild: {
    target: 'node18'
  }
});
