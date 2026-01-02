import { test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchApp, closeApp } from '../helpers/electron-app';
import { captureScreenshot } from '../helpers/screenshot';
import { toggleSidebar } from '../helpers/navigation';
import { setupDemoVault, setThemeDirect } from '../helpers/data-setup';
import { waitForAnimations } from '../helpers/wait-utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_VAULT_PATH = path.join(__dirname, '../example-vault');

test.describe('Editor Screenshots', () => {
  test('capture main editor views', async () => {
    console.log('\n📸 Capturing editor screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      // Wait for vault import to complete
      await setupDemoVault(window);

      // === LIGHT THEME ===
      console.log('  Capturing light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'editor',
        name: 'main-view-light',
        description: 'Main editor view with sidebar in light theme'
      });

      // Editor without sidebar
      await toggleSidebar(window);
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'editor',
        name: 'editor-focused-light',
        description: 'Editor view with sidebar hidden for focused writing'
      });

      // Show sidebar again
      await toggleSidebar(window);
      await waitForAnimations(window);

      // === DARK THEME ===
      console.log('  Capturing dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'editor',
        name: 'main-view-dark',
        description: 'Main editor view with sidebar in dark theme'
      });

      // Editor without sidebar (dark)
      await toggleSidebar(window);
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'editor',
        name: 'editor-focused-dark',
        description: 'Editor view with sidebar hidden in dark theme'
      });

      console.log('\n✅ Editor screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });
});
