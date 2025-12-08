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
  // Canary builds have a different productName set in electron-builder.canary.yml
  if (app.name === 'Flint Canary') {
    return 'canary';
  }
  return 'production';
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
 * Override the userData path for dev builds to isolate them from production.
 *
 * On macOS, the case-insensitive filesystem causes 'flint' (from package.json)
 * and 'Flint' (from electron-builder productName) to resolve to the same directory.
 * This function redirects dev builds to a distinct 'Flint Dev' directory.
 *
 * IMPORTANT: Must be called very early in main process initialization,
 * before any code calls app.getPath('userData').
 */
export function setupDevUserDataPath(): void {
  if (!app.isPackaged) {
    const platform = os.platform();
    const homeDir = os.homedir();
    let devUserDataPath: string;

    switch (platform) {
      case 'darwin':
        devUserDataPath = path.join(
          homeDir,
          'Library',
          'Application Support',
          'Flint Dev'
        );
        break;
      case 'win32':
        devUserDataPath = path.join(
          process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
          'Flint Dev'
        );
        break;
      default:
        // Linux and other Unix-like systems
        devUserDataPath = path.join(homeDir, '.config', 'Flint Dev');
    }

    app.setPath('userData', devUserDataPath);
  }
}
