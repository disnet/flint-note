/**
 * Configuration Utilities
 *
 * Utilities for loading, validating, and managing flint-note configuration.
 */

import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';

interface WorkspaceConfig {
  version: string;
  workspace_root: string;
  default_note_type: string;
  mcp_server: {
    name: string;
    version: string;
    port: number;
    log_level: string;
    log_file: string;
  };
  search: {
    index_enabled: boolean;
    index_path: string;
    rebuild_on_startup: boolean;
    max_results: number;
  };
  note_types: {
    auto_create_directories: boolean;
    require_descriptions: boolean;
  };
  deletion: {
    require_confirmation: boolean;
    create_backups: boolean;
    backup_path: string;
    allow_note_type_deletion: boolean;
    max_bulk_delete: number;
  };
  features: {
    auto_linking: boolean;
    auto_tagging: boolean;
    content_analysis: boolean;
  };
  security: {
    restrict_to_workspace: boolean;
    max_file_size: number;
    allowed_extensions: string[];
  };
}

export class ConfigManager {
  #configPath: string;
  public config: WorkspaceConfig | null = null;

  constructor(workspaceRoot: string) {
    this.#configPath = path.join(workspaceRoot, '.flint-note', 'config.yml');
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<WorkspaceConfig> {
    try {
      const configContent = await fs.readFile(this.#configPath, 'utf-8');
      this.config = yaml.load(configContent) as WorkspaceConfig;
      this.validateConfig();
      return this.config;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Create default config if file doesn't exist
        this.config = this.getDefaultConfig();
        await this.save();
        return this.config;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to load configuration: ${errorMessage}`);
    }
  }

  /**
   * Save configuration to file
   */
  async save(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    try {
      await this.ensureConfigDirectory();
      const configYaml = yaml.dump(this.config, {
        indent: 2,
        lineWidth: 80,
        noRefs: true,
        sortKeys: true
      });
      await fs.writeFile(this.#configPath, configYaml, 'utf-8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to save configuration: ${errorMessage}`);
    }
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): WorkspaceConfig {
    return {
      version: '1.1.0',
      workspace_root: '.',
      default_note_type: 'general',
      mcp_server: {
        name: 'flint-note',
        version: '0.1.0',
        port: 3000,
        log_level: 'info',
        log_file: '.flint-note/mcp-server.log'
      },
      search: {
        index_enabled: true,
        index_path: '.flint-note/search-index.json',
        rebuild_on_startup: false,
        max_results: 50
      },
      note_types: {
        auto_create_directories: true,
        require_descriptions: true
      },
      deletion: {
        require_confirmation: true,
        create_backups: true,
        backup_path: '.flint-note/backups',
        allow_note_type_deletion: true,
        max_bulk_delete: 10
      },
      features: {
        auto_linking: false,
        auto_tagging: false,
        content_analysis: false
      },
      security: {
        restrict_to_workspace: true,
        max_file_size: 10485760, // 10MB
        allowed_extensions: ['.md', '.txt']
      }
    };
  }

  /**
   * Validate configuration structure and values
   */
  validateConfig(): void {
    if (!this.config) {
      throw new Error('Configuration is null or undefined');
    }

    // Validate required fields
    const requiredFields: (keyof WorkspaceConfig)[] = [
      'version',
      'workspace_root',
      'default_note_type'
    ];
    for (const field of requiredFields) {
      if (!this.config[field]) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    // Validate default note type name
    if (!this.isValidNoteTypeName(this.config.default_note_type)) {
      throw new Error(`Invalid default note type name: ${this.config.default_note_type}`);
    }

    // Validate MCP server configuration
    if (this.config.mcp_server) {
      if (
        this.config.mcp_server.port &&
        (this.config.mcp_server.port < 1 || this.config.mcp_server.port > 65535)
      ) {
        throw new Error('MCP server port must be between 1 and 65535');
      }

      const validLogLevels = ['debug', 'info', 'warn', 'error'];
      if (
        this.config.mcp_server.log_level &&
        !validLogLevels.includes(this.config.mcp_server.log_level)
      ) {
        throw new Error(`Invalid log level: ${this.config.mcp_server.log_level}`);
      }
    }

    // Validate security settings
    if (this.config.security) {
      if (
        this.config.security.max_file_size &&
        (this.config.security.max_file_size < 1024 ||
          this.config.security.max_file_size > 104857600)
      ) {
        throw new Error('Max file size must be between 1KB and 100MB');
      }
    }
  }

  /**
   * Validate note type name for filesystem safety
   */
  isValidNoteTypeName(name: string): boolean {
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    const reservedNames = ['.flint-note', '.', '..', 'CON', 'PRN', 'AUX', 'NUL'];

    return (
      Boolean(name) &&
      name.length > 0 &&
      name.length <= 255 &&
      validPattern.test(name) &&
      !reservedNames.includes(name.toUpperCase())
    );
  }

  /**
   * Ensure configuration directory exists
   */
  async ensureConfigDirectory(): Promise<void> {
    const configDir = path.dirname(this.#configPath);
    try {
      await fs.access(configDir);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        await fs.mkdir(configDir, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  /**
   * Get configuration value by key path
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get<T = any>(keyPath: string, defaultValue?: T): T | undefined {
    if (!this.config) {
      return defaultValue;
    }

    const keys = keyPath.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Set configuration value by key path
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(keyPath: string, value: any): void {
    if (!this.config) {
      this.config = this.getDefaultConfig();
    }

    const keys = keyPath.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    current[lastKey] = value;
  }

  /**
   * Update configuration with partial updates
   */
  update(updates: Partial<WorkspaceConfig>): void {
    if (!this.config) {
      this.config = this.getDefaultConfig();
    }

    this.config = this.deepMerge(this.config, updates);
    this.validateConfig();
  }

  /**
   * Deep merge two objects
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result[key] = this.deepMerge(result[key] || {}, source[key] as any) as any;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result[key] = source[key] as any;
      }
    }

    return result;
  }

  /**
   * Get current configuration
   */
  getConfig(): WorkspaceConfig | null {
    return this.config;
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = this.getDefaultConfig();
  }

  /**
   * Export configuration as JSON
   */
  toJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  fromJSON(jsonString: string): void {
    try {
      this.config = JSON.parse(jsonString);
      this.validateConfig();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to import configuration from JSON: ${errorMessage}`);
    }
  }
}

/**
 * Helper function to create a configuration manager
 */
export function createConfigManager(workspaceRoot: string): ConfigManager {
  return new ConfigManager(workspaceRoot);
}

/**
 * Helper function to load configuration
 */
export async function loadConfig(workspaceRoot: string): Promise<WorkspaceConfig> {
  const configManager = new ConfigManager(workspaceRoot);
  await configManager.load();
  const config = configManager.getConfig();
  if (!config) {
    throw new Error('Failed to load configuration');
  }
  return config;
}

/**
 * Helper function to save configuration
 */
export async function saveConfig(
  workspaceRoot: string,
  config: WorkspaceConfig
): Promise<void> {
  const configManager = new ConfigManager(workspaceRoot);
  configManager.config = config;
  configManager.validateConfig();
  await configManager.save();
}
