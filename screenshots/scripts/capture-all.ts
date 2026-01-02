/**
 * Run all screenshot capture scripts
 *
 * This file exists for documentation purposes.
 * Playwright automatically discovers and runs all capture-*.ts files.
 *
 * Usage:
 *   npx playwright test --project=electron          # Run all captures
 *   npx playwright test capture-editor              # Run only editor captures
 *   npx playwright test --project=electron --debug  # Debug mode
 */

import { test } from '@playwright/test';

test.describe('All Screenshots', () => {
  test.skip('placeholder', () => {
    // This file serves as documentation.
    // All capture-*.ts files are run automatically by Playwright.
  });
});
