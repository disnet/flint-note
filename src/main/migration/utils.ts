/**
 * Utility functions for legacy vault migration
 */

import fs from 'fs';
import path from 'path';

/**
 * Candidate directory names for the sync directory, in order of preference
 */
const SYNC_DIRECTORY_CANDIDATES = [
  'notes',
  'notes-migration',
  'flint-notes',
  'migrated-notes'
];

/**
 * Marker file that indicates a directory is an Automerge sync directory
 */
const AUTOMERGE_MARKER = '.automerge';

/**
 * Get a safe sync directory name that doesn't conflict with existing directories
 *
 * @param vaultPath - The vault base path
 * @returns A safe directory name to use for sync
 */
export function getSafeSyncDirectory(vaultPath: string): string {
  for (const name of SYNC_DIRECTORY_CANDIDATES) {
    const dir = path.join(vaultPath, name);

    // If directory doesn't exist, we can use it
    if (!fs.existsSync(dir)) {
      return name;
    }

    // If it exists and has our marker, it's a sync directory we can reuse
    const markerPath = path.join(dir, AUTOMERGE_MARKER);
    if (fs.existsSync(markerPath)) {
      return name;
    }

    // Directory exists but isn't ours - try next candidate
  }

  // All candidates taken, use timestamp fallback
  return `notes-${Date.now()}`;
}

/**
 * Check if a directory is an Automerge sync directory
 */
export function isAutomergeSyncDirectory(dirPath: string): boolean {
  const markerPath = path.join(dirPath, AUTOMERGE_MARKER);
  return fs.existsSync(markerPath);
}

/**
 * Ensure the sync directory exists and has the marker file
 */
export function ensureSyncDirectory(vaultPath: string, syncDirName: string): string {
  const syncDir = path.join(vaultPath, syncDirName);

  // Create the directory if it doesn't exist
  if (!fs.existsSync(syncDir)) {
    fs.mkdirSync(syncDir, { recursive: true });
  }

  // Create the marker file if it doesn't exist
  const markerPath = path.join(syncDir, AUTOMERGE_MARKER);
  if (!fs.existsSync(markerPath)) {
    fs.writeFileSync(
      markerPath,
      JSON.stringify(
        {
          created: new Date().toISOString(),
          type: 'flint-automerge-sync'
        },
        null,
        2
      )
    );
  }

  return syncDir;
}

/**
 * Get the vault name from a path (usually the directory name)
 */
export function getVaultNameFromPath(vaultPath: string): string {
  return path.basename(vaultPath) || 'Migrated Vault';
}

/**
 * Check if a directory contains a legacy vault (.flint-note/search.db)
 */
export function containsLegacyVault(dirPath: string): boolean {
  const dbPath = path.join(dirPath, '.flint-note', 'search.db');
  return fs.existsSync(dbPath);
}

/**
 * Scan a directory for legacy vaults (non-recursive)
 *
 * This is useful for detecting vaults in common locations like ~/Documents
 */
export function scanForLegacyVaults(searchPath: string): string[] {
  const vaults: string[] = [];

  try {
    if (!fs.existsSync(searchPath)) {
      return vaults;
    }

    // Check if the searchPath itself is a vault
    if (containsLegacyVault(searchPath)) {
      vaults.push(searchPath);
    }

    // Check immediate subdirectories
    const entries = fs.readdirSync(searchPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(searchPath, entry.name);
        if (containsLegacyVault(subPath)) {
          vaults.push(subPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning for legacy vaults in ${searchPath}:`, error);
  }

  return vaults;
}

/**
 * Get common locations where vaults might be stored
 */
export function getCommonVaultLocations(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) return [];

  return [
    path.join(home, 'Documents'),
    path.join(home, 'Documents', 'Flint'),
    path.join(home, 'Flint'),
    home
  ].filter((p) => fs.existsSync(p));
}
