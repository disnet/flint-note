/**
 * Automerge vault import functionality.
 * Detects and validates vaults stored in .automerge directories.
 */

import path from 'path';
import fs from 'fs';
import { logger } from './logger';

/**
 * Information about a detected automerge vault
 */
export interface AutomergeVaultInfo {
  /** Directory path containing .automerge/ */
  path: string;
  /** Vault name from manifest */
  name: string;
  /** Automerge document URL */
  docUrl: string;
  /** ISO timestamp when vault was created */
  created: string;
  /** Whether the manifest is valid */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Vault manifest schema (must match vault-manager.ts)
 */
interface VaultManifest {
  version: 1;
  docUrl: string;
  name: string;
  created: string;
}

/**
 * Detect if a directory contains a valid automerge vault.
 * Looks for .automerge/manifest.json with required fields.
 *
 * @param dirPath - Directory to check
 * @returns Vault info if found, null if not a vault
 */
export async function detectAutomergeVault(
  dirPath: string
): Promise<AutomergeVaultInfo | null> {
  const automergeDir = path.join(dirPath, '.automerge');
  const manifestPath = path.join(automergeDir, 'manifest.json');

  // Check if .automerge directory exists
  if (!fs.existsSync(automergeDir)) {
    return null;
  }

  // Check if manifest.json exists
  if (!fs.existsSync(manifestPath)) {
    logger.debug(`[AutomergeImport] No manifest found at ${manifestPath}`);
    return null;
  }

  try {
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest: Partial<VaultManifest> = JSON.parse(manifestContent);

    // Validate manifest structure
    if (manifest.version !== 1) {
      return {
        path: dirPath,
        name: manifest.name || 'Unknown',
        docUrl: manifest.docUrl || '',
        created: manifest.created || '',
        isValid: false,
        error: `Unsupported manifest version: ${manifest.version}`
      };
    }

    if (!manifest.docUrl) {
      return {
        path: dirPath,
        name: manifest.name || 'Unknown',
        docUrl: '',
        created: manifest.created || '',
        isValid: false,
        error: 'Manifest missing required field: docUrl'
      };
    }

    if (!manifest.name) {
      return {
        path: dirPath,
        name: 'Unknown',
        docUrl: manifest.docUrl,
        created: manifest.created || '',
        isValid: false,
        error: 'Manifest missing required field: name'
      };
    }

    logger.info(`[AutomergeImport] Detected valid vault at ${dirPath}: ${manifest.name}`);

    return {
      path: dirPath,
      name: manifest.name,
      docUrl: manifest.docUrl,
      created: manifest.created || new Date().toISOString(),
      isValid: true
    };
  } catch (error) {
    logger.warn(`[AutomergeImport] Failed to read manifest at ${manifestPath}:`, error);

    return {
      path: dirPath,
      name: 'Unknown',
      docUrl: '',
      created: '',
      isValid: false,
      error: `Failed to read manifest: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
