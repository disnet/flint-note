import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './scripts',
  timeout: 120000, // 2 minute timeout for Electron operations
  retries: 0,
  workers: 1, // Sequential execution required for Electron
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'off' // We handle screenshots manually
  },
  projects: [
    {
      name: 'electron',
      testMatch: /capture-.*\.ts$/
    }
  ],
  // Output directory for test artifacts
  outputDir: path.join(__dirname, 'output', 'artifacts')
});
