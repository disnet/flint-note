/**
 * Build Type Detection and Configuration
 *
 * Provides utilities to detect whether the app is running as dev, canary, or production,
 * and configures environment-specific paths to ensure build isolation.
 */

import { app } from 'electron';
import path from 'path';
import os from 'os';

export type BuildType = 'production' | 'canary' | 'dev';

/**
 * Detect the current build type based on packaging state and app name.
 */
export function getBuildType(): BuildType {
  // Dev builds run via `electron .` or electron-vite are not packaged
  if (!app.isPackaged) {
    return 'dev';
  }
  // Canary builds can be detected by:
  // 1. productName set to 'Flint Canary' in electron-builder.canary.yml
  // 2. Executable name containing 'canary' (e.g., flint-canary.exe on Windows)
  // 3. App path containing 'Canary' (e.g., /Applications/Flint Canary.app on macOS)
  if (isCanaryBuild()) {
    return 'canary';
  }
  return 'production';
}

/**
 * Check if this is a canary build using multiple detection methods.
 */
function isCanaryBuild(): boolean {
  // Method 1: Check app.name (productName from electron-builder)
  if (app.name === 'Flint Canary') {
    return true;
  }

  // Method 2: Check executable path for 'canary' (case-insensitive)
  const execPath = process.execPath.toLowerCase();
  if (execPath.includes('canary')) {
    return true;
  }

  // Method 3: Check app path for 'Canary'
  try {
    const appPath = app.getAppPath().toLowerCase();
    if (appPath.includes('canary')) {
      return true;
    }
  } catch {
    // getAppPath might not be available in all contexts
  }

  return false;
}

/**
 * Get the appropriate Windows App User Model ID for the current build type.
 */
export function getAppUserModelId(): string {
  const buildType = getBuildType();
  switch (buildType) {
    case 'dev':
      return 'com.flintnote.flint-dev';
    case 'canary':
      return 'com.flintnote.flint-canary';
    default:
      return 'com.flintnote.flint';
  }
}

/**
 * Override the userData path for dev and canary builds to isolate them from production.
 *
 * On macOS, the case-insensitive filesystem causes 'flint' (from package.json)
 * and 'Flint' (from electron-builder productName) to resolve to the same directory.
 * This function redirects dev builds to a distinct 'Flint Dev' directory.
 *
 * For canary builds, we also need to explicitly set the path because Electron
 * might use the package.json 'name' field rather than electron-builder's productName.
 *
 * IMPORTANT: Must be called very early in main process initialization,
 * before any code calls app.getPath('userData').
 */
export function setupUserDataPath(): void {
  // Allow override via environment variable (used for screenshot automation and testing)
  if (process.env.FLINT_USER_DATA_PATH) {
    app.setPath('userData', process.env.FLINT_USER_DATA_PATH);
    return;
  }

  const platform = os.platform();
  const homeDir = os.homedir();

  // Determine the directory name based on build type
  let dirName: string;
  if (!app.isPackaged) {
    dirName = 'Flint Dev';
  } else if (isCanaryBuild()) {
    dirName = 'Flint Canary';
  } else {
    // Production build - use default 'Flint' (let Electron handle it)
    return;
  }

  let userDataPath: string;
  switch (platform) {
    case 'darwin':
      userDataPath = path.join(homeDir, 'Library', 'Application Support', dirName);
      break;
    case 'win32':
      userDataPath = path.join(
        process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
        dirName
      );
      break;
    default:
      // Linux and other Unix-like systems
      userDataPath = path.join(homeDir, '.config', dirName);
  }

  app.setPath('userData', userDataPath);
}

// Keep the old name as an alias for backwards compatibility
export const setupDevUserDataPath = setupUserDataPath;
