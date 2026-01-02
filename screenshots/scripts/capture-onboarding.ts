import { test } from '@playwright/test';
import { launchApp, closeApp } from '../helpers/electron-app';
import { captureScreenshot } from '../helpers/screenshot';
import { waitForAnimations } from '../helpers/wait-utils';

test.describe('Onboarding Screenshots', () => {
  test('capture first-time experience', async () => {
    console.log('\n📸 Capturing onboarding screenshots...\n');

    // Launch with clean state to show first-time experience
    const { electronApp, window } = await launchApp({ cleanState: true });

    try {
      // Wait for first-time experience to load
      console.log('  Waiting for first-time experience...');
      await window.waitForSelector(
        '.first-time-experience, [data-first-time], .vault-selector',
        { timeout: 15000 }
      );
      await waitForAnimations(window);

      // Capture the welcome/vault selection screen
      console.log('  Capturing welcome screen...');
      await captureScreenshot(window, {
        category: 'onboarding',
        name: 'welcome-screen',
        description: 'Initial welcome screen for new users'
      });

      // Try to interact with vault creation if available
      const createButton = await window.$(
        'button:has-text("Create New Vault"), button:has-text("New Vault")'
      );
      if (createButton) {
        await createButton.click();
        await waitForAnimations(window, 500);

        // Capture the vault creation dialog/form
        console.log('  Capturing vault creation...');
        await captureScreenshot(window, {
          category: 'onboarding',
          name: 'vault-creation',
          description: 'Vault creation dialog'
        });
      }

      console.log('\n✅ Onboarding screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });
});
