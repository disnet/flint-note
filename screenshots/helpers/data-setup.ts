import { Page } from 'playwright';
import { waitForAnimations, waitForLoading } from './wait-utils';

/**
 * Wait for the vault to be ready and main view to be visible
 * Used after launching with --import to wait for import completion
 */
export async function waitForVaultReady(window: Page): Promise<void> {
  // Wait for main view - this means import is complete and vault is ready
  await window.waitForSelector('.main-view', { timeout: 30000 });
  await waitForLoading(window);
  await waitForAnimations(window, 500);
}

/**
 * Wait for the demo vault to be set up
 * When using launchApp with importVault option, this just waits for import to complete
 */
export async function setupDemoVault(window: Page): Promise<void> {
  await waitForVaultReady(window);
}

/**
 * Set the app theme to light, dark, or system
 * Navigates to settings to change the theme
 */
export async function setTheme(
  window: Page,
  theme: 'light' | 'dark' | 'system'
): Promise<void> {
  // Navigate to settings
  await window.click('.nav-item:has-text("Settings")');
  await waitForAnimations(window);

  // Find and change the theme select
  const themeSelect = await window.$(
    'select:near(:text("Theme")), .theme-select, select[name="theme"]'
  );

  if (themeSelect) {
    await themeSelect.selectOption(theme);
    await waitForAnimations(window, 300);
  } else {
    // Try to find theme toggle buttons as fallback
    const themeButton = await window.$(
      `button:has-text("${theme}"), label:has-text("${theme}")`
    );
    if (themeButton) {
      await themeButton.click();
      await waitForAnimations(window, 300);
    }
  }

  // Navigate back
  await window.keyboard.press('Escape');
  await waitForAnimations(window);
}

/**
 * Set theme by directly manipulating the document
 * This is more reliable for screenshots as it doesn't require navigation
 */
export async function setThemeDirect(
  window: Page,
  theme: 'light' | 'dark'
): Promise<void> {
  await window.evaluate((t) => {
    // Set data-theme attribute on document
    document.documentElement.setAttribute('data-theme', t);
    document.body.setAttribute('data-theme', t);

    // Also set the class for themes that use classes
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(t);
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(t);
  }, theme);

  await waitForAnimations(window, 200);
}
