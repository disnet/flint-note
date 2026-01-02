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

test.describe('Feature Screenshots', () => {
  test('capture daily notes view', async () => {
    console.log('\n📸 Capturing daily notes screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      await navigateToSystemView(window, 'daily');
      await waitForAnimations(window);

      // Light theme
      console.log('  Capturing light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'features',
        name: 'daily-notes-light',
        description: 'Daily notes view in light theme'
      });

      // Dark theme
      console.log('  Capturing dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'features',
        name: 'daily-notes-dark',
        description: 'Daily notes view in dark theme'
      });

      console.log('\n✅ Daily notes screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });

  test('capture inbox view', async () => {
    console.log('\n📸 Capturing inbox screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      await navigateToSystemView(window, 'inbox');
      await waitForAnimations(window);

      // Light theme
      console.log('  Capturing light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'features',
        name: 'inbox-light',
        description: 'Inbox view in light theme'
      });

      // Dark theme
      console.log('  Capturing dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'features',
        name: 'inbox-dark',
        description: 'Inbox view in dark theme'
      });

      console.log('\n✅ Inbox screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });

  test('capture review view', async () => {
    console.log('\n📸 Capturing review screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      await navigateToSystemView(window, 'review');
      await waitForAnimations(window);

      // Light theme
      console.log('  Capturing light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'features',
        name: 'review-light',
        description: 'Review (spaced repetition) view in light theme'
      });

      // Dark theme
      console.log('  Capturing dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'features',
        name: 'review-dark',
        description: 'Review (spaced repetition) view in dark theme'
      });

      console.log('\n✅ Review screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });

  test('capture routines view', async () => {
    console.log('\n📸 Capturing routines screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      await navigateToSystemView(window, 'routines');
      await waitForAnimations(window);

      // Light theme
      console.log('  Capturing light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'features',
        name: 'routines-light',
        description: 'Routines view in light theme'
      });

      // Dark theme
      console.log('  Capturing dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'features',
        name: 'routines-dark',
        description: 'Routines view in dark theme'
      });

      console.log('\n✅ Routines screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });

  test('capture note types view', async () => {
    console.log('\n📸 Capturing note types screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      await navigateToSystemView(window, 'types');
      await waitForAnimations(window);

      // Light theme
      console.log('  Capturing light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'features',
        name: 'note-types-light',
        description: 'Note types view in light theme'
      });

      // Dark theme
      console.log('  Capturing dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'features',
        name: 'note-types-dark',
        description: 'Note types view in dark theme'
      });

      console.log('\n✅ Note types screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });
});
