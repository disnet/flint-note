import { test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchApp, closeApp } from '../helpers/electron-app';
import { captureScreenshot } from '../helpers/screenshot';
import {
  openChatPanel,
  openShelfPanel,
  closeFloatingPanels
} from '../helpers/navigation';
import { setupDemoVault, setThemeDirect } from '../helpers/data-setup';
import { waitForAnimations } from '../helpers/wait-utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_VAULT_PATH = path.join(__dirname, '../example-vault');

test.describe('Chat and Shelf Screenshots', () => {
  test('capture chat panel', async () => {
    console.log('\n📸 Capturing chat panel screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      // Try to open chat panel
      await openChatPanel(window);
      await waitForAnimations(window, 500);

      // Light theme
      console.log('  Capturing light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'chat',
        name: 'chat-panel-light',
        description: 'AI chat panel in light theme'
      });

      // Dark theme
      console.log('  Capturing dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'chat',
        name: 'chat-panel-dark',
        description: 'AI chat panel in dark theme'
      });

      await closeFloatingPanels(window);

      console.log('\n✅ Chat panel screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });

  test('capture shelf panel', async () => {
    console.log('\n📸 Capturing shelf panel screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      // Try to open shelf panel
      await openShelfPanel(window);
      await waitForAnimations(window, 500);

      // Light theme
      console.log('  Capturing light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'chat',
        name: 'shelf-panel-light',
        description: 'Shelf panel in light theme'
      });

      // Dark theme
      console.log('  Capturing dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'chat',
        name: 'shelf-panel-dark',
        description: 'Shelf panel in dark theme'
      });

      await closeFloatingPanels(window);

      console.log('\n✅ Shelf panel screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });
});
