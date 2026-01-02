import { _electron as electron, ElectronApplication, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface LaunchOptions {
  /** Use clean userData directory for isolated state */
  cleanState?: boolean;
  /** Custom user data path (only used if cleanState is false) */
  userDataPath?: string;
  /** Path to markdown directory to import as vault */
  importVault?: string;
  /** Name for the imported vault */
  vaultName?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Viewport size (default: 1600x900) */
  viewport?: { width: number; height: number };
}

const DEFAULT_VIEWPORT = { width: 1600, height: 900 };

// Track temp directories for cleanup
const tempDirs: string[] = [];

// Base directory for all temp screenshot data
const TEMP_BASE_DIR = path.join(os.tmpdir(), 'flint-screenshots');

/**
 * Clean up old temp directories from previous runs
 * This prevents accumulation of leftover data
 */
function cleanupOldTempDirs(): void {
  try {
    if (fs.existsSync(TEMP_BASE_DIR)) {
      const entries = fs.readdirSync(TEMP_BASE_DIR);
      for (const entry of entries) {
        const entryPath = path.join(TEMP_BASE_DIR, entry);
        try {
          fs.rmSync(entryPath, { recursive: true, force: true });
        } catch {
          // Ignore individual cleanup errors
        }
      }
    }
  } catch {
    // Ignore if directory doesn't exist or can't be read
  }
}

/**
 * Launch the Flint Electron app for screenshot automation
 */
export async function launchApp(options: LaunchOptions = {}): Promise<{
  electronApp: ElectronApplication;
  window: Page;
}> {
  const mainPath = path.join(__dirname, '../../out/main/index.js');

  // Verify the built app exists
  if (!fs.existsSync(mainPath)) {
    throw new Error(`Built app not found at ${mainPath}. Run 'npm run build' first.`);
  }

  // Clean up any old temp directories from previous runs
  cleanupOldTempDirs();

  // Create temp userData path for clean state
  let userDataPath = options.userDataPath;
  if (options.cleanState) {
    const tempDir = path.join(os.tmpdir(), 'flint-screenshots', Date.now().toString());
    fs.mkdirSync(tempDir, { recursive: true });
    tempDirs.push(tempDir);
    userDataPath = tempDir;
  }

  // Build args array
  const args = [mainPath];
  if (options.importVault) {
    args.push('--import', options.importVault);
    if (options.vaultName) {
      args.push('--vault-name', options.vaultName);
    }
  }

  const electronApp = await electron.launch({
    args,
    env: {
      ...process.env,
      // Use custom userData path if specified
      ...(userDataPath ? { FLINT_USER_DATA_PATH: userDataPath } : {}),
      // Mark as screenshot mode (if the app wants to check)
      FLINT_SCREENSHOT_MODE: '1',
      ...options.env
    }
  });

  // Wait for the first BrowserWindow to open
  const window = await electronApp.firstWindow();

  // Set viewport size
  const viewport = options.viewport || DEFAULT_VIEWPORT;
  await window.setViewportSize(viewport);

  // Wait for app to be ready
  await waitForAppReady(window);

  return { electronApp, window };
}

/**
 * Wait for the app to be fully loaded and ready
 */
export async function waitForAppReady(window: Page): Promise<void> {
  // Wait for either the main app or first-time experience to be visible
  await window.waitForSelector(
    '.main-view, .first-time-experience, [data-first-time], .vault-selector',
    { timeout: 30000 }
  );

  // Additional wait for any loading states to finish
  try {
    await window.waitForSelector('.loading-state, .loading-spinner', {
      state: 'hidden',
      timeout: 5000
    });
  } catch {
    // No loading state found, that's fine
  }

  // Wait for animations to settle
  await window.waitForTimeout(500);
}

/**
 * Close the Electron app and cleanup
 */
export async function closeApp(electronApp: ElectronApplication): Promise<void> {
  await electronApp.close();
}

/**
 * Cleanup all temporary directories created during testing
 */
export function cleanupTempDirs(): void {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  tempDirs.length = 0;
}

// Cleanup on process exit
process.on('exit', cleanupTempDirs);
process.on('SIGINT', () => {
  cleanupTempDirs();
  process.exit();
});
