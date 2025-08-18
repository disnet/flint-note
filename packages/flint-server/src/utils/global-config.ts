/**
 * Global Configuration Utilities
 *
 * Manages global flint-note configuration including vault registry,
 * platform-specific config directories, and vault switching.
 */

import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import yaml from 'js-yaml';
import { resolvePath } from './path.js';

export interface VaultInfo {
  id: string;
  name: string;
  path: string;
  created: string;
  last_accessed: string;
  description?: string;
}

interface GlobalConfig {
  version: string;
  current_vault: string | null;
  vaults: Record<string, VaultInfo>;
  settings: {
    auto_switch_on_create: boolean;
    backup_on_vault_switch: boolean;
    max_recent_vaults: number;
  };
}

export class GlobalConfigManager {
  #configDir: string;
  #configPath: string;
  #config: GlobalConfig | null = null;

  constructor() {
    this.#configDir = this.getPlatformConfigDir();
    this.#configPath = path.join(this.#configDir, 'config.yml');
  }

  /**
   * Get platform-specific configuration directory
   */
  getPlatformConfigDir(): string {
    const platform = os.platform();
    const homeDir = os.homedir();

    // Check for XDG_CONFIG_HOME first (for testing and Linux systems)
    if (process.env.XDG_CONFIG_HOME) {
      return path.join(process.env.XDG_CONFIG_HOME, 'flint-note');
    }

    switch (platform) {
      case 'win32':
        // Windows: Use APPDATA or fallback to user profile
        return process.env.APPDATA
          ? path.join(process.env.APPDATA, 'flint-note')
          : path.join(homeDir, 'AppData', 'Roaming', 'flint-note');

      case 'darwin':
        // macOS: Use Application Support directory
        return path.join(homeDir, 'Library', 'Application Support', 'flint-note');

      default:
        // Unix-like systems: Use ~/.config
        return path.join(homeDir, '.config', 'flint-note');
    }
  }

  /**
   * Load global configuration from file
   */
  async load(): Promise<GlobalConfig> {
    try {
      await this.ensureConfigDirectory();
      const configContent = await fs.readFile(this.#configPath, 'utf-8');
      this.#config = yaml.load(configContent) as GlobalConfig;

      // Run migrations before validation
      const needsSave = await this.runMigrations();

      this.validateConfig();

      // Save if migrations were applied
      if (needsSave) {
        await this.save();
      }

      return this.#config;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Create default config if file doesn't exist
        this.#config = this.getDefaultConfig();
        await this.save();
        return this.#config;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to load global configuration: ${errorMessage}`);
    }
  }

  /**
   * Save global configuration to file
   */
  async save(): Promise<void> {
    if (!this.#config) {
      throw new Error('No configuration to save');
    }

    try {
      await this.ensureConfigDirectory();
      const configYaml = yaml.dump(this.#config, {
        indent: 2,
        lineWidth: 80,
        noRefs: true,
        sortKeys: true
      });
      await fs.writeFile(this.#configPath, configYaml, 'utf-8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to save global configuration: ${errorMessage}`);
    }
  }

  /**
   * Get default global configuration
   */
  getDefaultConfig(): GlobalConfig {
    return {
      version: '1.0.0',
      current_vault: null,
      vaults: {},
      settings: {
        auto_switch_on_create: true,
        backup_on_vault_switch: false,
        max_recent_vaults: 10
      }
    };
  }

  /**
   * Validate configuration structure and values
   */
  validateConfig(): void {
    if (!this.#config) {
      throw new Error('Configuration is null or undefined');
    }

    // Validate required fields
    if (!this.#config.version) {
      throw new Error('Missing required field: version');
    }

    if (!this.#config.vaults || typeof this.#config.vaults !== 'object') {
      throw new Error('Invalid vaults configuration');
    }

    if (!this.#config.settings || typeof this.#config.settings !== 'object') {
      throw new Error('Invalid settings configuration');
    }

    // Validate current vault exists if set
    if (this.#config.current_vault && !this.#config.vaults[this.#config.current_vault]) {
      throw new Error(
        `Current vault '${this.#config.current_vault}' does not exist in vault registry`
      );
    }

    // Validate each vault entry
    for (const [vaultId, vaultInfo] of Object.entries(this.#config.vaults)) {
      if (!this.isValidVaultId(vaultId)) {
        throw new Error(`Invalid vault ID: ${vaultId}`);
      }

      if (!vaultInfo.name || !vaultInfo.path || !vaultInfo.created) {
        throw new Error(`Incomplete vault info for vault: ${vaultId}`);
      }

      // Validate id field matches vault key (after migration should be consistent)
      if (vaultInfo.id && vaultInfo.id !== vaultId) {
        throw new Error(`Vault ID mismatch: key '${vaultId}' vs id '${vaultInfo.id}'`);
      }

      // Validate timestamps
      try {
        new Date(vaultInfo.created);
        new Date(vaultInfo.last_accessed);
      } catch {
        throw new Error(`Invalid timestamp in vault: ${vaultId}`);
      }
    }
  }

  /**
   * Run migrations on loaded configuration
   * Returns true if the configuration was modified and needs to be saved
   *
   * This method handles backward compatibility for configuration files
   * that were saved before certain fields were added to the schema.
   */
  async runMigrations(): Promise<boolean> {
    if (!this.#config) {
      return false;
    }

    let modified = false;

    // Migration: Add missing id fields to VaultInfo objects
    // Some configs were saved before the 'id' field was added to VaultInfo.
    // For these, we use the vault key as the id since they should match.
    for (const [vaultId, vaultInfo] of Object.entries(this.#config.vaults)) {
      if (!vaultInfo.id) {
        vaultInfo.id = vaultId;
        modified = true;
      }
    }

    return modified;
  }

  /**
   * Validate vault ID for filesystem and config safety
   */
  isValidVaultId(id: string): boolean {
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    const reservedIds = ['config', 'cache', 'logs', 'temp', 'backup'];

    return (
      Boolean(id) &&
      id.length > 0 &&
      id.length <= 64 &&
      validPattern.test(id) &&
      !reservedIds.includes(id.toLowerCase())
    );
  }

  /**
   * Ensure configuration directory exists
   */
  async ensureConfigDirectory(): Promise<void> {
    try {
      await fs.access(this.#configDir);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        await fs.mkdir(this.#configDir, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  /**
   * Add a new vault to the registry
   */
  async addVault(
    id: string,
    name: string,
    vaultPath: string,
    description?: string
  ): Promise<void> {
    if (!this.#config) {
      await this.load();
    }

    if (!this.isValidVaultId(id)) {
      throw new Error(`Invalid vault ID: ${id}`);
    }

    if (this.#config!.vaults[id]) {
      throw new Error(`Vault with ID '${id}' already exists`);
    }

    // Validate vault path exists and is accessible
    try {
      const stats = await fs.stat(vaultPath);
      if (!stats.isDirectory()) {
        throw new Error(`Vault path is not a directory: ${vaultPath}`);
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`Vault path does not exist: ${vaultPath}`);
      }
      throw error;
    }

    const now = new Date().toISOString();
    this.#config!.vaults[id] = {
      id,
      name,
      path: resolvePath(vaultPath),
      created: now,
      last_accessed: now,
      description
    };

    // Set as current vault if it's the first one and auto_switch is enabled
    if (
      Object.keys(this.#config!.vaults).length === 1 ||
      this.#config!.settings.auto_switch_on_create
    ) {
      this.#config!.current_vault = id;
    }

    await this.save();
  }

  /**
   * Remove a vault from the registry
   */
  async removeVault(id: string): Promise<void> {
    if (!this.#config) {
      await this.load();
    }

    if (!this.#config!.vaults[id]) {
      throw new Error(`Vault with ID '${id}' does not exist`);
    }

    delete this.#config!.vaults[id];

    // Clear current vault if it was the one being removed
    if (this.#config!.current_vault === id) {
      // Set to the first available vault, or null if no vaults left
      const remainingVaults = Object.keys(this.#config!.vaults);
      this.#config!.current_vault =
        remainingVaults.length > 0 ? remainingVaults[0] : null;
    }

    await this.save();
  }

  /**
   * Switch to a different vault
   */
  async switchVault(id: string): Promise<void> {
    if (!this.#config) {
      await this.load();
    }

    if (!this.#config!.vaults[id]) {
      throw new Error(`Vault with ID '${id}' does not exist`);
    }

    // Update last accessed time
    this.#config!.vaults[id].last_accessed = new Date().toISOString();
    this.#config!.current_vault = id;

    await this.save();
  }

  /**
   * Get current vault information
   */
  getCurrentVault(): VaultInfo | null {
    if (!this.#config || !this.#config.current_vault) {
      return null;
    }

    return this.#config.vaults[this.#config.current_vault] || null;
  }

  /**
   * Get current vault path
   */
  getCurrentVaultPath(): string | null {
    const currentVault = this.getCurrentVault();
    return currentVault ? currentVault.path : null;
  }

  /**
   * List all vaults
   */
  listVaults(): Array<{ info: VaultInfo; is_current: boolean }> {
    if (!this.#config) {
      return [];
    }

    return Object.entries(this.#config.vaults).map(([id, info]) => ({
      id,
      info,
      is_current: id === this.#config!.current_vault
    }));
  }

  /**
   * Get vault by ID
   */
  getVault(id: string): VaultInfo | null {
    if (!this.#config) {
      return null;
    }

    return this.#config.vaults[id] || null;
  }

  /**
   * Update vault information
   */
  async updateVault(
    id: string,
    updates: Partial<Pick<VaultInfo, 'name' | 'description'>>
  ): Promise<void> {
    if (!this.#config) {
      await this.load();
    }

    if (!this.#config!.vaults[id]) {
      throw new Error(`Vault with ID '${id}' does not exist`);
    }

    if (updates.name) {
      this.#config!.vaults[id].name = updates.name;
    }

    if (updates.description !== undefined) {
      this.#config!.vaults[id].description = updates.description;
    }

    await this.save();
  }

  /**
   * Check if a vault exists
   */
  hasVault(id: string): boolean {
    return this.#config ? Boolean(this.#config.vaults[id]) : false;
  }

  /**
   * Get configuration directory path
   */
  getConfigDir(): string {
    return this.#configDir;
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.#configPath;
  }

  /**
   * Export configuration as JSON
   */
  toJSON(): string {
    return JSON.stringify(this.#config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  async fromJSON(jsonString: string): Promise<void> {
    try {
      this.#config = JSON.parse(jsonString);
      this.validateConfig();
      await this.save();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to import global configuration from JSON: ${errorMessage}`);
    }
  }

  /**
   * Reset configuration to defaults
   */
  async reset(): Promise<void> {
    this.#config = this.getDefaultConfig();
    await this.save();
  }

  /**
   * Get recent vaults (sorted by last accessed)
   */
  getRecentVaults(limit?: number): Array<{ info: VaultInfo; is_current: boolean }> {
    const allVaults = this.listVaults();
    const sorted = allVaults.sort(
      (a, b) =>
        new Date(b.info.last_accessed).getTime() -
        new Date(a.info.last_accessed).getTime()
    );

    const maxResults = limit || this.#config?.settings.max_recent_vaults || 10;
    return sorted.slice(0, maxResults);
  }
}

/**
 * Helper function to create a global configuration manager
 */
export function createGlobalConfigManager(): GlobalConfigManager {
  return new GlobalConfigManager();
}

/**
 * Helper function to get current vault path
 */
export async function getCurrentVaultPath(): Promise<string | null> {
  const globalConfig = new GlobalConfigManager();
  await globalConfig.load();
  return globalConfig.getCurrentVaultPath();
}

/**
 * Helper function to initialize vault system and get current vault path
 * Returns null if no vault is configured
 */
export async function initializeVaultSystem(): Promise<string | null> {
  const globalConfig = new GlobalConfigManager();
  await globalConfig.load();

  const currentPath = globalConfig.getCurrentVaultPath();
  if (currentPath) {
    return currentPath;
  }

  // No current vault configured
  return null;
}
