/**
 * Platform detection utility for Flint
 * Detects whether running in Electron or web browser
 */

/**
 * Check if running in Electron (window.api exposed by preload script)
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.api;
}

/**
 * Check if running in web browser (no Electron APIs)
 */
export function isWeb(): boolean {
  return !isElectron();
}

/**
 * Check if AI features are available (requires Electron + chat server)
 */
export function isAIAvailable(): boolean {
  return isElectron() && !!window.api?.getChatServerPort;
}

/**
 * Check if file system operations are available
 */
export function isFileSystemAvailable(): boolean {
  return isElectron() && !!window.api?.showItemInFolder;
}

/**
 * Check if secure storage (system keychain) is available
 */
export function isSecureStorageAvailable(): boolean {
  return isElectron() && !!window.api?.secureStorageAvailable;
}

/**
 * Check if auto-updater is available
 */
export function isAutoUpdaterAvailable(): boolean {
  return isElectron() && !!window.api?.checkForUpdates;
}
