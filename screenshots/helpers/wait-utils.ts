import { Page } from 'playwright';

/**
 * Wait for animations to complete
 */
export async function waitForAnimations(window: Page, timeout = 500): Promise<void> {
  await window.waitForTimeout(timeout);
}

/**
 * Wait for element to be visible and stable
 */
export async function waitForStable(
  window: Page,
  selector: string,
  timeout = 5000
): Promise<void> {
  await window.waitForSelector(selector, { state: 'visible', timeout });
  // Additional stability wait
  await window.waitForTimeout(200);
}

/**
 * Wait for any loading indicators to disappear
 */
export async function waitForLoading(window: Page): Promise<void> {
  const loadingSelectors = [
    '.loading-state',
    '.loading-spinner',
    '[data-loading="true"]',
    '.skeleton'
  ];

  for (const selector of loadingSelectors) {
    try {
      const element = await window.$(selector);
      if (element) {
        await window.waitForSelector(selector, {
          state: 'hidden',
          timeout: 10000
        });
      }
    } catch {
      // Element may have been removed, continue
    }
  }
}

/**
 * Wait for network requests to settle
 */
export async function waitForNetworkIdle(window: Page, timeout = 5000): Promise<void> {
  try {
    await window.waitForLoadState('networkidle', { timeout });
  } catch {
    // Network may not fully idle in Electron, continue anyway
  }
  await window.waitForTimeout(200);
}

/**
 * Wait for a specific element to appear with text content
 */
export async function waitForText(
  window: Page,
  selector: string,
  text: string,
  timeout = 5000
): Promise<void> {
  await window.waitForSelector(`${selector}:has-text("${text}")`, {
    state: 'visible',
    timeout
  });
}
