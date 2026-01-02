import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ScreenshotOptions {
  /** Category folder (e.g., 'editor', 'settings') */
  category: string;
  /** Screenshot filename (without extension) */
  name: string;
  /** Full page screenshot (default: false) */
  fullPage?: boolean;
  /** Specific element selector to capture */
  selector?: string;
  /** Custom viewport before capture */
  viewport?: { width: number; height: number };
  /** Optional description for metadata */
  description?: string;
}

/** Get today's date in YYYY-MM-DD format */
function getDateFolder(): string {
  const date = new Date();
  return date.toISOString().split('T')[0];
}

/** Ensure output directory exists */
function ensureOutputDir(category: string): string {
  const outputDir = path.join(__dirname, '../output', getDateFolder(), category);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return outputDir;
}

/**
 * Capture a screenshot with organized output
 */
export async function captureScreenshot(
  window: Page,
  options: ScreenshotOptions
): Promise<string> {
  const { category, name, fullPage = false, selector, viewport, description } = options;

  // Set viewport if specified
  if (viewport) {
    await window.setViewportSize(viewport);
    await window.waitForTimeout(300); // Wait for resize
  }

  const outputDir = ensureOutputDir(category);
  const filename = `${name}.png`;
  const filepath = path.join(outputDir, filename);

  if (selector) {
    // Capture specific element
    const element = await window.$(selector);
    if (element) {
      await element.screenshot({ path: filepath, scale: 'device' });
    } else {
      console.warn(`Element not found: ${selector}, falling back to full page`);
      await window.screenshot({ path: filepath, fullPage, scale: 'device' });
    }
  } else {
    await window.screenshot({ path: filepath, fullPage, scale: 'device' });
  }

  // Write metadata file if description provided
  if (description) {
    const metadataPath = path.join(outputDir, `${name}.json`);
    const viewportSize = await window.viewportSize();
    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          filename,
          description,
          category,
          capturedAt: new Date().toISOString(),
          viewport: viewport || viewportSize
        },
        null,
        2
      )
    );
  }

  console.log(`  Screenshot saved: ${filepath}`);
  return filepath;
}

/**
 * Capture multiple viewport sizes for responsive documentation
 */
export async function captureResponsive(
  window: Page,
  options: Omit<ScreenshotOptions, 'viewport'>
): Promise<string[]> {
  const viewports = [
    { width: 1600, height: 900, suffix: 'desktop' },
    { width: 1280, height: 800, suffix: 'laptop' },
    { width: 1024, height: 768, suffix: 'tablet' }
  ];

  const paths: string[] = [];

  for (const vp of viewports) {
    const filepath = await captureScreenshot(window, {
      ...options,
      name: `${options.name}-${vp.suffix}`,
      viewport: { width: vp.width, height: vp.height }
    });
    paths.push(filepath);
  }

  // Reset to default viewport
  await window.setViewportSize({ width: 1600, height: 900 });

  return paths;
}

/**
 * Capture both light and dark theme variants
 */
export async function captureBothThemes(
  window: Page,
  options: Omit<ScreenshotOptions, 'name'>,
  baseName: string,
  setTheme: (window: Page, theme: 'light' | 'dark') => Promise<void>
): Promise<{ light: string; dark: string }> {
  // Capture light theme
  await setTheme(window, 'light');
  await window.waitForTimeout(300);
  const lightPath = await captureScreenshot(window, {
    ...options,
    name: `${baseName}-light`
  });

  // Capture dark theme
  await setTheme(window, 'dark');
  await window.waitForTimeout(300);
  const darkPath = await captureScreenshot(window, {
    ...options,
    name: `${baseName}-dark`
  });

  return { light: lightPath, dark: darkPath };
}

/**
 * Capture a screenshot sequence (for animations/transitions)
 */
export async function captureSequence(
  window: Page,
  options: Omit<ScreenshotOptions, 'name'>,
  steps: Array<{
    name: string;
    action: () => Promise<void>;
    delay?: number;
  }>
): Promise<string[]> {
  const paths: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Execute action
    await step.action();

    // Wait for any transitions
    await window.waitForTimeout(step.delay || 300);

    // Capture
    const filepath = await captureScreenshot(window, {
      ...options,
      name: `${String(i + 1).padStart(2, '0')}-${step.name}`
    });
    paths.push(filepath);
  }

  return paths;
}
