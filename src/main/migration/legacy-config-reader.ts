/**
 * Legacy Config Reader
 *
 * Reads vault paths from the old Flint app's config.yml file.
 * This allows lazy migration by populating the vault switcher with
 * known legacy vaults without migrating them upfront.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import yaml from 'js-yaml';
import { logger } from '../logger';

/**
 * Vault info as stored in the legacy config.yml
 */
export interface LegacyConfigVault {
  /** Vault identifier */
  id: string;
  /** Display name */
  name: string;
  /** Filesystem path to the vault directory */
  path: string;
  /** ISO timestamp of creation */
  created?: string;
  /** ISO timestamp of last access */
  last_accessed?: string;
  /** ISO timestamp of last modification */
  last_modified?: string;
}

/**
 * Structure of the legacy config.yml file
 */
interface LegacyConfig {
  /** Currently active vault ID */
  current_vault?: string;
  /** Map of vault ID to vault info */
  vaults?: Record<string, LegacyConfigVault>;
  /** Config version */
  version?: string;
  /** Various settings */
  settings?: Record<string, unknown>;
}

/**
 * Get the path to the legacy Flint app's config.yml.
 * Always uses the production app name "Flint" regardless of current build type.
 */
export function getLegacyConfigPath(): string {
  const platform = os.platform();
  const home = os.homedir();

  switch (platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Flint', 'config.yml');
    case 'win32':
      return path.join(
        process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
        'Flint',
        'config.yml'
      );
    default:
      // Linux and other Unix-like systems
      return path.join(home, '.config', 'Flint', 'config.yml');
  }
}

/**
 * Read vault paths from the legacy app's config.yml.
 *
 * @returns Array of vault info objects, filtered to only include vaults
 *          that still exist on disk
 */
export async function readLegacyVaultPaths(): Promise<LegacyConfigVault[]> {
  const configPath = getLegacyConfigPath();

  logger.debug('Looking for legacy config', { configPath });

  if (!fs.existsSync(configPath)) {
    logger.debug('Legacy config not found');
    return [];
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(content) as LegacyConfig;

    if (!config || !config.vaults) {
      logger.debug('Legacy config has no vaults');
      return [];
    }

    const allVaults = Object.values(config.vaults);
    logger.debug('Found vaults in legacy config', { count: allVaults.length });

    // Filter to only include vaults that still exist on disk
    const existingVaults = allVaults.filter((vault) => {
      if (!vault.path) {
        logger.debug('Vault has no path, skipping', { vaultId: vault.id });
        return false;
      }
      const exists = fs.existsSync(vault.path);
      if (!exists) {
        logger.debug('Vault path no longer exists, skipping', {
          vaultId: vault.id,
          path: vault.path
        });
      }
      return exists;
    });

    logger.info('Read legacy vault paths', {
      total: allVaults.length,
      existing: existingVaults.length
    });

    return existingVaults;
  } catch (error) {
    logger.error('Failed to read legacy config', {
      configPath,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

/**
 * Get the currently active vault ID from the legacy config.
 *
 * @returns The current vault ID, or undefined if not found
 */
export async function getLegacyCurrentVaultId(): Promise<string | undefined> {
  const configPath = getLegacyConfigPath();

  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(content) as LegacyConfig;
    return config?.current_vault;
  } catch {
    return undefined;
  }
}
