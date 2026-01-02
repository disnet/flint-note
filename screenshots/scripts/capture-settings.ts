import { test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchApp, closeApp } from '../helpers/electron-app';
import { captureScreenshot } from '../helpers/screenshot';
import { navigateToSystemView } from '../helpers/navigation';
import { setupDemoVault, setThemeDirect } from '../helpers/data-setup';
import { waitForAnimations } from '../helpers/wait-utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_VAULT_PATH = path.join(__dirname, '../example-vault');

test.describe('Settings Screenshots', () => {
  test('capture settings panels', async () => {
    console.log('\n📸 Capturing settings screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      // Wait for vault import to complete
      await setupDemoVault(window);

      // Navigate to settings
      await navigateToSystemView(window, 'settings');
      await waitForAnimations(window);

      // === LIGHT THEME ===
      console.log('  Capturing light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'settings',
        name: 'settings-overview-light',
        description: 'Settings panel in light theme'
      });

      // === DARK THEME ===
      console.log('  Capturing dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'settings',
        name: 'settings-overview-dark',
        description: 'Settings panel in dark theme'
      });

      console.log('\n✅ Settings screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });
});
