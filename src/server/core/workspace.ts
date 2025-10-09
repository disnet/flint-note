/**
 * Workspace Manager
 *
 * Handles initialization and management of flint-note workspaces,
 * including directory structure, configuration, and default note types.
 */

import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import type { MetadataSchema } from './metadata-schema.js';
import { DatabaseMigrationManager } from '../database/migration-manager.js';
import type { DatabaseManager } from '../database/schema.js';

interface WorkspaceConfig {
  workspace_root: string;
  default_note_type: string;
  database: {
    schema_version: string;
    last_migration: string;
  };
  mcp_server: {
    port: number;
    log_level: string;
  };
  search: {
    index_enabled: boolean;
    index_path: string;
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
  version?: string;
}

// Partial config interface for handling old configurations during upgrade
interface PartialWorkspaceConfig {
  workspace_root?: string;
  default_note_type?: string;
  database?: {
    schema_version?: string;
    last_migration?: string;
  };
  mcp_server?: {
    port?: number;
    log_level?: string;
  };
  search?: {
    index_enabled?: boolean;
    index_path?: string;
  };
  note_types?: {
    auto_create_directories?: boolean;
    require_descriptions?: boolean;
  };
  deletion?: {
    require_confirmation?: boolean;
    create_backups?: boolean;
    backup_path?: string;
    allow_note_type_deletion?: boolean;
    max_bulk_delete?: number;
  };
  version?: string;
}

interface WorkspaceStats {
  workspace_root: string;
  note_types: number;
  total_notes: number;
  config_version: string;
  last_updated: string;
}

interface DefaultNoteType {
  name: string;
  purpose: string;
  agentInstructions: string[];
  metadataSchema: MetadataSchema;
}

export class Workspace {
  public readonly rootPath: string;
  public readonly flintNoteDir: string;
  public readonly configPath: string;
  public readonly searchIndexPath: string;
  public readonly logPath: string;
  public config: WorkspaceConfig | null = null;
  #databaseManager: DatabaseManager | null = null;

  /**
   * Helper to check if workspace is required and available
   * @param workspace - Workspace instance to check
   * @throws Error if workspace is not available
   */
  static requireWorkspace(workspace?: unknown): void {
    if (!workspace) {
      throw new Error(
        'No vault configured. Use the create_vault tool to create a new vault, or list_vaults and switch_vault to use an existing one.'
      );
    }
  }

  /**
   * Check if a directory contains an existing Flint vault
   * @param vaultPath - Path to check for existing vault
   * @returns Promise<boolean> - True if directory contains a valid Flint vault
   */
  static async isExistingVault(vaultPath: string): Promise<boolean> {
    try {
      const flintNoteDir = path.join(vaultPath, '.flint-note');
      const configPath = path.join(flintNoteDir, 'config.yml');

      // Check if .flint-note directory exists
      const flintNoteStat = await fs.stat(flintNoteDir);
      if (!flintNoteStat.isDirectory()) {
        return false;
      }

      // Check if config.yml exists and is readable
      const configStat = await fs.stat(configPath);
      if (!configStat.isFile()) {
        return false;
      }

      // Try to read and parse the config to ensure it's valid
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(configContent) as PartialWorkspaceConfig;

      // Basic validation - must have workspace_root
      return Boolean(config && config.workspace_root);
    } catch {
      // If any error occurs (file doesn't exist, permission denied, etc.), not a vault
      return false;
    }
  }

  constructor(rootPath: string, databaseManager?: DatabaseManager) {
    this.rootPath = path.resolve(rootPath);
    this.flintNoteDir = path.join(this.rootPath, '.flint-note');
    this.configPath = path.join(this.flintNoteDir, 'config.yml');
    this.searchIndexPath = path.join(this.flintNoteDir, 'search-index.json');
    this.logPath = path.join(this.flintNoteDir, 'mcp-server.log');
    this.#databaseManager = databaseManager || null;
  }

  /**
   * Set the database manager for migrations
   */
  setDatabaseManager(databaseManager: DatabaseManager): void {
    this.#databaseManager = databaseManager;
  }

  /**
   * Initialize the workspace with required directories and files
   */
  async initialize(): Promise<void> {
    try {
      // Create .flint-note directory if it doesn't exist
      await this.ensureDirectory(this.flintNoteDir);

      // Load or create configuration
      await this.loadOrCreateConfig();

      // Handle database migrations if database manager is available
      if (this.#databaseManager && this.config) {
        await this.handleDatabaseMigrations();
      }

      // Create default note type if it doesn't exist
      await this.ensureDefaultNoteType();

      // Initialize search index
      await this.initializeSearchIndex();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize workspace: ${errorMessage}`);
    }
  }

  /**
   * Initialize vault with all default note types
   */
  async initializeVault(): Promise<void> {
    try {
      // Create .flint-note directory if it doesn't exist
      await this.ensureDirectory(this.flintNoteDir);

      // Load or create configuration
      await this.loadOrCreateConfig();

      // Handle database migrations if database manager is available
      if (this.#databaseManager && this.config) {
        await this.handleDatabaseMigrations();
      }

      // Create all default note types
      await this.createDefaultNoteTypes();

      // Initialize search index
      await this.initializeSearchIndex();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize vault: ${errorMessage}`);
    }
  }

  /**
   * Handle database migrations when needed
   */
  private async handleDatabaseMigrations(): Promise<void> {
    if (!this.#databaseManager || !this.config) {
      return;
    }

    try {
      const currentSchemaVersion = this.config.database?.schema_version;

      const migrationResult = await DatabaseMigrationManager.checkAndMigrate(
        currentSchemaVersion,
        this.#databaseManager,
        this.rootPath
      );

      if (migrationResult.migrated) {
        // Update config with new schema version and timestamp
        this.config.database = {
          schema_version: migrationResult.toVersion,
          last_migration: new Date().toISOString()
        };

        // Save updated config
        await this.saveConfig();

        console.log(
          `Database migration completed: ${migrationResult.fromVersion} -> ${migrationResult.toVersion}`
        );

        if (migrationResult.migratedLinks) {
          console.log('Links migration completed successfully');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Database migration failed:', errorMessage);
      throw new Error(`Database migration failed: ${errorMessage}`);
    }
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        await fs.mkdir(dirPath, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  /**
   * Load existing config or create default configuration
   */
  async loadOrCreateConfig(): Promise<void> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const partialConfig = yaml.load(configContent) as PartialWorkspaceConfig;

      // Check if config needs upgrading
      if (this.needsConfigUpgrade(partialConfig)) {
        this.config = this.upgradeConfig(partialConfig);
        await this.saveConfig();
      } else {
        this.config = partialConfig as WorkspaceConfig;
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Create default configuration
        this.config = this.getDefaultConfig();
        await this.saveConfig();
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to load config: ${errorMessage}`);
      }
    }
  }

  /**
   * Get default configuration object
   */
  getDefaultConfig(): WorkspaceConfig {
    return {
      workspace_root: '.',
      default_note_type: 'daily',
      database: {
        schema_version: DatabaseMigrationManager.getCurrentSchemaVersion(),
        last_migration: new Date().toISOString()
      },
      mcp_server: {
        port: 3000,
        log_level: 'info'
      },
      search: {
        index_enabled: true,
        index_path: '.flint-note/search-index.json'
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
      version: '1.1.0'
    };
  }

  /**
   * Check if the configuration needs upgrading
   */
  needsConfigUpgrade(config: PartialWorkspaceConfig): boolean {
    // Check if database config is missing
    if (!config.database) {
      return true;
    }

    // Check if deletion config is missing or incomplete
    if (!config.deletion) {
      return true;
    }

    // Check if any required deletion fields are missing
    const requiredDeletionFields = [
      'require_confirmation',
      'create_backups',
      'backup_path',
      'allow_note_type_deletion',
      'max_bulk_delete'
    ];

    for (const field of requiredDeletionFields) {
      if (!(field in config.deletion)) {
        return true;
      }
    }

    // Check version-based upgrades
    if (!config.version || this.compareVersions(config.version, '1.1.0') < 0) {
      return true;
    }

    // Check database schema version (only if database exists)
    if (config.database) {
      if (
        !config.database.schema_version ||
        this.compareVersions(config.database.schema_version, '1.1.0') < 0
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Upgrade configuration to latest schema
   */
  upgradeConfig(oldConfig: PartialWorkspaceConfig): WorkspaceConfig {
    const defaultConfig = this.getDefaultConfig();

    // Deep merge old config with defaults, preserving existing values
    const upgradedConfig: WorkspaceConfig = {
      workspace_root: oldConfig.workspace_root || defaultConfig.workspace_root,
      default_note_type: oldConfig.default_note_type || defaultConfig.default_note_type,
      database: {
        schema_version: defaultConfig.database.schema_version, // Always use current schema version
        last_migration: new Date().toISOString() // Update migration timestamp on upgrade
      },
      mcp_server: {
        port: oldConfig.mcp_server?.port || defaultConfig.mcp_server.port,
        log_level: oldConfig.mcp_server?.log_level || defaultConfig.mcp_server.log_level
      },
      search: {
        index_enabled:
          oldConfig.search?.index_enabled ?? defaultConfig.search.index_enabled,
        index_path: oldConfig.search?.index_path || defaultConfig.search.index_path
      },
      note_types: {
        auto_create_directories:
          oldConfig.note_types?.auto_create_directories ??
          defaultConfig.note_types.auto_create_directories,
        require_descriptions:
          oldConfig.note_types?.require_descriptions ??
          defaultConfig.note_types.require_descriptions
      },
      deletion: {
        require_confirmation:
          oldConfig.deletion?.require_confirmation ??
          defaultConfig.deletion.require_confirmation,
        create_backups:
          oldConfig.deletion?.create_backups ?? defaultConfig.deletion.create_backups,
        backup_path:
          oldConfig.deletion?.backup_path || defaultConfig.deletion.backup_path,
        allow_note_type_deletion:
          oldConfig.deletion?.allow_note_type_deletion ??
          defaultConfig.deletion.allow_note_type_deletion,
        max_bulk_delete:
          oldConfig.deletion?.max_bulk_delete ?? defaultConfig.deletion.max_bulk_delete
      },
      version: defaultConfig.version
    };

    return upgradedConfig;
  }

  /**
   * Compare two version strings (simple semver comparison)
   */
  compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }

    return 0;
  }

  /**
   * Save current configuration to file
   */
  async saveConfig(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    const configYaml = yaml.dump(this.config, {
      indent: 2,
      lineWidth: 80,
      noRefs: true
    });
    await fs.writeFile(this.configPath, configYaml, 'utf-8');
  }

  /**
   * Ensure the default note type exists
   */
  async ensureDefaultNoteType(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const defaultType = this.config.default_note_type;
    const defaultTypePath = path.join(this.rootPath, defaultType);

    await this.ensureDirectory(defaultTypePath);
  }

  /**
   * Get default description for a note type
   */
  getDefaultNoteTypeDescription(typeName: string): string {
    return `# ${typeName.charAt(0).toUpperCase() + typeName.slice(1)} Notes

## Purpose
General-purpose notes for miscellaneous thoughts, ideas, and information that don't fit into other specific categories.

## Agent Instructions
- Keep notes organized and well-structured
- Use clear headings and formatting
- Link to related notes when appropriate
- Extract actionable items when present

## Metadata Schema (Optional)
Expected frontmatter fields:
- tags: List of relevant tags
- created: Creation date
- updated: Last update date
`;
  }

  /**
   * Initialize search index file
   */
  async initializeSearchIndex(): Promise<void> {
    try {
      await fs.access(this.searchIndexPath);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        const emptyIndex = {
          version: '1.0.0',
          last_updated: new Date().toISOString(),
          notes: {}
        };
        await fs.writeFile(
          this.searchIndexPath,
          JSON.stringify(emptyIndex, null, 2),
          'utf-8'
        );
      }
    }
  }

  /**
   * Ensure a note type directory exists
   */
  async ensureNoteType(typeName: string): Promise<string> {
    // Validate note type name
    if (!this.isValidNoteTypeName(typeName)) {
      throw new Error(`Invalid note type name: ${typeName}`);
    }

    const typePath = path.join(this.rootPath, typeName);
    await this.ensureDirectory(typePath);

    // Create description file in .flint-note config directory if required and doesn't exist
    if (this.config?.note_types.require_descriptions) {
      const descriptionPath = path.join(this.flintNoteDir, `${typeName}_description.md`);
      try {
        await fs.access(descriptionPath);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          const description = this.getDefaultNoteTypeDescription(typeName);
          await fs.writeFile(descriptionPath, description, 'utf-8');
        }
      }
    }

    return typePath;
  }

  /**
   * Validate note type name for filesystem safety
   */
  isValidNoteTypeName(name: string): boolean {
    // Must be non-empty, contain only safe characters, and not be a reserved name
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
   * Get the full path for a note type
   */
  getNoteTypePath(typeName: string): string {
    return path.join(this.rootPath, typeName);
  }

  /**
   * Get the full path for a note file
   */
  getNotePath(typeName: string, filename: string): string {
    return path.join(this.rootPath, typeName, filename);
  }

  /**
   * Validate that a path is within the workspace
   */
  isPathInWorkspace(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(this.rootPath);
    return resolvedPath.startsWith(resolvedRoot);
  }

  /**
   * Get workspace statistics
   */
  async getStats(): Promise<WorkspaceStats> {
    try {
      const entries = await fs.readdir(this.rootPath, { withFileTypes: true });
      const noteTypes = entries.filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
      );

      let totalNotes = 0;
      for (const noteType of noteTypes) {
        const typePath = path.join(this.rootPath, noteType.name);
        const typeEntries = await fs.readdir(typePath);
        const notes = typeEntries.filter(
          (file) => file.endsWith('.md') && !file.startsWith('.') && !file.startsWith('_')
        );
        totalNotes += notes.length;
      }

      return {
        workspace_root: this.rootPath,
        note_types: noteTypes.length,
        total_notes: totalNotes,
        config_version: this.config?.version || '1.0.0',
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get workspace stats: ${errorMessage}`);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): WorkspaceConfig | null {
    return this.config;
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<WorkspaceConfig>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    this.config = { ...this.config, ...updates };
    await this.saveConfig();
  }

  /**
   * Get default note type definitions
   */
  getDefaultNoteTypes(): DefaultNoteType[] {
    return [
      {
        name: 'daily',
        purpose: 'Daily notes for tracking progress and capturing daily thoughts',
        agentInstructions: [
          'Extract actionable items and suggest appropriate note types for follow-up',
          'Identify and link related notes mentioned in daily entries',
          'Link to related notes when appropriate',
          "Preserve the user's voice and thinking style completely",
          'Focus on structural help, not content generation',
          'Suggest connections to previous daily notes or related project notes'
        ],
        metadataSchema: {
          fields: []
        }
      },
      {
        name: 'note',
        purpose: 'General-purpose notes for thoughts, ideas, and information',
        agentInstructions: [
          'Identify and create wikilinks to related existing notes',
          'Use clear headings and formatting',
          'Extract actionable items when present',
          'Help build connections between related concepts',
          'Help categorize notes that might benefit from more specific note types',
          "NEVER alter the user's content or voice - only enhance organization"
        ],
        metadataSchema: {
          fields: []
        }
      }
    ];
  }

  /**
   * Create all default note types
   */
  async createDefaultNoteTypes(): Promise<void> {
    const defaultNoteTypes = this.getDefaultNoteTypes();

    for (const noteType of defaultNoteTypes) {
      await this.createNoteType(noteType);
    }
  }

  /**
   * Create a single note type with all its components
   */
  async createNoteType(noteType: DefaultNoteType): Promise<void> {
    // Create note type directory
    const typePath = path.join(this.rootPath, noteType.name);
    await this.ensureDirectory(typePath);

    // Create description file in the note type directory
    const descriptionPath = path.join(typePath, '_description.md');
    const descriptionContent = this.formatNoteTypeDescription(noteType);
    await fs.writeFile(descriptionPath, descriptionContent, 'utf-8');
  }

  /**
   * Format note type description for default note types
   */
  formatNoteTypeDescription(noteType: DefaultNoteType): string {
    const formattedName = noteType.name.charAt(0).toUpperCase() + noteType.name.slice(1);

    let content = `# ${formattedName}\n\n`;
    content += `## Purpose\n${noteType.purpose}\n\n`;
    content += '## Agent Instructions\n';

    for (const instruction of noteType.agentInstructions) {
      content += `- ${instruction}\n`;
    }
    content += '\n';

    content += '## Metadata Schema\n';
    for (const field of noteType.metadataSchema.fields) {
      const requiredText = field.required ? 'required' : 'optional';
      let constraintText = '';

      if (field.constraints) {
        const constraints: string[] = [];
        if (field.constraints.min !== undefined)
          constraints.push(`min: ${field.constraints.min}`);
        if (field.constraints.max !== undefined)
          constraints.push(`max: ${field.constraints.max}`);
        if (field.constraints.options)
          constraints.push(
            `options: [${field.constraints.options.map((o) => `"${o}"`).join(', ')}]`
          );
        if (field.constraints.format)
          constraints.push(`format: ${field.constraints.format}`);
        if (field.constraints.pattern)
          constraints.push(`pattern: ${field.constraints.pattern}`);

        if (constraints.length > 0) {
          constraintText = `, ${constraints.join(', ')}`;
        }
      }

      content += `- ${field.name}: ${field.description} (${requiredText}, ${field.type}${constraintText})\n`;
    }

    return content;
  }
}
