/**
 * Legacy vault detection
 *
 * Scans for legacy SQLite-based vaults that can be migrated to Automerge.
 */

import type { LegacyVaultInfo } from './types';
import { isLegacyVault, getDatabaseModTime, getNoteCounts } from './sqlite-reader';
import {
  getSafeSyncDirectory,
  getVaultNameFromPath,
  scanForLegacyVaults,
  getCommonVaultLocations
} from './utils';

/**
 * Check if an Automerge vault already exists for the given path
 *
 * This is called from the renderer via IPC, passing the current vault list.
 */
export function hasExistingVault(
  vaultPath: string,
  existingVaults: Array<{ baseDirectory?: string }>
): boolean {
  return existingVaults.some((vault) => vault.baseDirectory === vaultPath);
}

/**
 * Get information about a single legacy vault
 */
export async function getLegacyVaultInfo(
  vaultPath: string,
  existingVaults: Array<{ baseDirectory?: string }> = []
): Promise<LegacyVaultInfo | null> {
  if (!isLegacyVault(vaultPath)) {
    return null;
  }

  try {
    const counts = await getNoteCounts(vaultPath);
    const modTime = getDatabaseModTime(vaultPath);
    const syncDirName = getSafeSyncDirectory(vaultPath);
    const hasExisting = hasExistingVault(vaultPath, existingVaults);

    return {
      path: vaultPath,
      name: getVaultNameFromPath(vaultPath),
      noteCount: counts.total,
      epubCount: counts.epub,
      lastModified: modTime ?? new Date().toISOString(),
      hasExistingMigration: hasExisting,
      syncDirectoryName: syncDirName
    };
  } catch (error) {
    console.error(`Error getting vault info for ${vaultPath}:`, error);
    return null;
  }
}

/**
 * Detect all legacy vaults in common locations
 *
 * @param existingVaults - Current list of Automerge vaults (to check for duplicates)
 * @returns Array of legacy vault information
 */
export async function detectLegacyVaults(
  existingVaults: Array<{ baseDirectory?: string }> = []
): Promise<LegacyVaultInfo[]> {
  const results: LegacyVaultInfo[] = [];
  const locations = getCommonVaultLocations();

  for (const location of locations) {
    const vaultPaths = scanForLegacyVaults(location);

    for (const vaultPath of vaultPaths) {
      const info = await getLegacyVaultInfo(vaultPath, existingVaults);
      if (info) {
        results.push(info);
      }
    }
  }

  // Remove duplicates (same path might be found in multiple scans)
  const uniqueResults = results.filter(
    (vault, index, self) => index === self.findIndex((v) => v.path === vault.path)
  );

  return uniqueResults;
}

/**
 * Detect a legacy vault at a specific path (for manual selection)
 */
export async function detectLegacyVaultAtPath(
  vaultPath: string,
  existingVaults: Array<{ baseDirectory?: string }> = []
): Promise<LegacyVaultInfo | null> {
  return getLegacyVaultInfo(vaultPath, existingVaults);
}
