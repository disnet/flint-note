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

      // Create welcome note
      await this.createWelcomeNote();
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
        schema_version: '1.1.0',
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
- When renaming notes, always use the rename_note tool to update the title field only (preserves links)

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
        entry =>
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
      );

      let totalNotes = 0;
      for (const noteType of noteTypes) {
        const typePath = path.join(this.rootPath, noteType.name);
        const typeEntries = await fs.readdir(typePath);
        const notes = typeEntries.filter(
          file => file.endsWith('.md') && !file.startsWith('.') && !file.startsWith('_')
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
        purpose: 'Track daily events, reflections, and activities',
        agentInstructions: [
          'Each day\'s title should be formatted as "YYYY-MM-DD"',
          'Ask about key events and accomplishments from the day',
          'Encourage reflection on lessons learned or insights gained',
          'Help identify priorities for the next day',
          "When creating other notes types link to today's entry",
          'Suggest connections to previous daily entries when relevant',
          "Capture daily entries with minimal editorializing - stay close to the user's original words and tone.",
          'Fix obvious typos and improve clarity without changing meaning.',
          'Create wikilinks to related notes when relevant topics are mentioned'
        ],
        metadataSchema: {
          fields: [
            {
              name: 'date',
              type: 'date',
              description: 'Date of entry',
              required: true,
              constraints: {
                format: 'YYYY-MM-DD'
              }
            },
            {
              name: 'mood',
              type: 'select',
              description: 'Daily mood rating',
              required: false,
              constraints: {
                options: ['excellent', 'good', 'neutral', 'challenging', 'difficult']
              }
            },
            {
              name: 'tags',
              type: 'array',
              description: 'Topics or themes',
              required: false
            }
          ]
        }
      },
      {
        name: 'reading',
        purpose: 'Track articles, papers, books, and other reading material',
        agentInstructions: [
          'Always ask for author information and publication context',
          'Offer to search the web to fill in missing information',
          'Extract and organize key insights and takeaways',
          'Request a personal rating and ask what made it memorable',
          'Suggest connections to other readings or note types',
          'Encourage noting specific quotes with page/section references'
        ],
        metadataSchema: {
          fields: [
            {
              name: 'title',
              type: 'string',
              description: 'Title of the material',
              required: true
            },
            {
              name: 'author',
              type: 'string',
              description: 'Author or creator',
              required: false
            },
            {
              name: 'type',
              type: 'select',
              description: 'Type of reading',
              required: true,
              constraints: {
                options: ['book', 'article', 'paper', 'blog_post', 'documentation']
              }
            },
            {
              name: 'status',
              type: 'select',
              description: 'Reading status',
              required: false,
              constraints: { options: ['to_read', 'reading', 'completed', 'abandoned'] }
            },
            {
              name: 'rating',
              type: 'number',
              description: 'Personal rating',
              required: false,
              constraints: { min: 1, max: 5 }
            },
            {
              name: 'tags',
              type: 'array',
              description: 'Categories or topics',
              required: false
            },
            {
              name: 'url',
              type: 'string',
              description: 'Web link for online content',
              required: false
            },
            {
              name: 'published_date',
              type: 'date',
              description: 'Publication date',
              required: false
            }
          ]
        }
      },
      {
        name: 'todos',
        purpose: 'Track tasks, action items, and things that need to be done',
        agentInstructions: [
          'Help break down large tasks into smaller, actionable items',
          'Titles should be concise, descriptive, and action oriented',
          'Ask about priorities and deadlines',
          'Suggest realistic timeframes and dependencies',
          'Encourage regular status updates and progress tracking',
          'Connect related todos and identify recurring patterns'
        ],
        metadataSchema: {
          fields: [
            {
              name: 'title',
              type: 'string',
              description: 'Task or todo list name',
              required: true
            },
            {
              name: 'priority',
              type: 'select',
              description: 'Priority level',
              required: false,
              constraints: { options: ['low', 'medium', 'high', 'urgent'] }
            },
            {
              name: 'status',
              type: 'select',
              description: 'Current status',
              required: true,
              constraints: {
                options: [
                  'not_started',
                  'in_progress',
                  'completed',
                  'on_hold',
                  'cancelled'
                ]
              }
            },
            {
              name: 'due_date',
              type: 'date',
              description: 'Target completion date',
              required: false
            },
            {
              name: 'tags',
              type: 'array',
              description: 'Categories or contexts',
              required: false
            }
          ]
        }
      },
      {
        name: 'projects',
        purpose: 'Track ongoing projects, goals, and long-term initiatives',
        agentInstructions: [
          'Ask about project scope, goals, and success criteria',
          'Help identify key milestones and deadlines',
          'Encourage breaking projects into manageable phases',
          'Suggest resource gathering and stakeholder identification',
          'Track progress and help identify blockers or risks'
        ],
        metadataSchema: {
          fields: [
            {
              name: 'title',
              type: 'string',
              description: 'Project name',
              required: true
            },
            {
              name: 'status',
              type: 'select',
              description: 'Current status',
              required: true,
              constraints: {
                options: ['planning', 'active', 'on_hold', 'completed', 'cancelled']
              }
            },
            {
              name: 'priority',
              type: 'select',
              description: 'Priority level',
              required: false,
              constraints: { options: ['low', 'medium', 'high'] }
            },
            {
              name: 'start_date',
              type: 'date',
              description: 'Project start date',
              required: false
            },
            {
              name: 'target_date',
              type: 'date',
              description: 'Target completion date',
              required: false
            },
            {
              name: 'team_members',
              type: 'array',
              description: 'People involved',
              required: false
            },
            {
              name: 'tags',
              type: 'array',
              description: 'Project categories or skills',
              required: false
            }
          ]
        }
      },
      {
        name: 'goals',
        purpose: 'Track long-term personal and professional goals',
        agentInstructions: [
          'Help define specific, measurable, achievable goals',
          'Ask about motivation and personal significance',
          'Encourage breaking goals into smaller milestones',
          'Suggest regular check-ins and progress reviews',
          'Help identify potential obstacles and mitigation strategies',
          'Connect goals to daily actions and habits'
        ],
        metadataSchema: {
          fields: [
            { name: 'title', type: 'string', description: 'Goal name', required: true },
            {
              name: 'category',
              type: 'select',
              description: 'Goal category',
              required: false,
              constraints: {
                options: [
                  'personal',
                  'professional',
                  'health',
                  'financial',
                  'learning',
                  'relationships'
                ]
              }
            },
            {
              name: 'timeline',
              type: 'select',
              description: 'Target timeframe',
              required: false,
              constraints: { options: ['short_term', 'medium_term', 'long_term'] }
            },
            {
              name: 'status',
              type: 'select',
              description: 'Current status',
              required: true,
              constraints: {
                options: [
                  'not_started',
                  'in_progress',
                  'achieved',
                  'on_hold',
                  'abandoned'
                ]
              }
            },
            {
              name: 'target_date',
              type: 'date',
              description: 'Target achievement date',
              required: false
            },
            {
              name: 'tags',
              type: 'array',
              description: 'Related themes or skills',
              required: false
            }
          ]
        }
      },
      {
        name: 'games',
        purpose: 'Track video games played, progress, and experiences',
        agentInstructions: [
          'Ask about genre and gameplay style preferences',
          'Encourage documenting memorable moments and achievements',
          'Help track completion status and playtime',
          'Suggest connections to similar games or genres',
          'Ask about what made the experience unique or noteworthy'
        ],
        metadataSchema: {
          fields: [
            { name: 'title', type: 'string', description: 'Game title', required: true },
            { name: 'genre', type: 'array', description: 'Game genre', required: false },
            {
              name: 'status',
              type: 'select',
              description: 'Play status',
              required: true,
              constraints: {
                options: ['wishlist', 'playing', 'completed', 'dropped', 'on_hold']
              }
            },
            {
              name: 'rating',
              type: 'number',
              description: 'Personal rating',
              required: false,
              constraints: { min: 1, max: 5 }
            },
            {
              name: 'tags',
              type: 'array',
              description: 'Themes or characteristics',
              required: false
            },
            {
              name: 'release_year',
              type: 'number',
              description: 'Year released',
              required: false
            }
          ]
        }
      },
      {
        name: 'movies',
        purpose: 'Track movies watched, reviews, and recommendations',
        agentInstructions: [
          'Ask about what drew them to watch this particular movie',
          'Offer to search the web to fill in metadata',
          'Encourage discussing themes, cinematography, and performances',
          'Help identify what made the movie memorable or forgettable',
          'Suggest similar movies or directors they might enjoy',
          'Ask about emotional impact and lasting impressions'
        ],
        metadataSchema: {
          fields: [
            { name: 'title', type: 'string', description: 'Movie title', required: true },
            {
              name: 'director',
              type: 'string',
              description: 'Director name',
              required: false
            },
            {
              name: 'year',
              type: 'number',
              description: 'Release year',
              required: false,
              constraints: { min: 1900, max: 2030 }
            },
            { name: 'genre', type: 'array', description: 'Movie genre', required: false },
            {
              name: 'rating',
              type: 'number',
              description: 'Personal rating',
              required: false,
              constraints: { min: 1, max: 5 }
            },
            {
              name: 'watched_date',
              type: 'date',
              description: 'Date watched',
              required: false
            },
            {
              name: 'runtime_minutes',
              type: 'number',
              description: 'Movie length in minutes',
              required: false,
              constraints: { min: 1 }
            },
            {
              name: 'tags',
              type: 'array',
              description: 'Themes or characteristics',
              required: false
            }
          ]
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
        const constraints = [];
        if (field.constraints.min !== undefined)
          constraints.push(`min: ${field.constraints.min}`);
        if (field.constraints.max !== undefined)
          constraints.push(`max: ${field.constraints.max}`);
        if (field.constraints.options)
          constraints.push(
            `options: [${field.constraints.options.map(o => `"${o}"`).join(', ')}]`
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

  /**
   * Create welcome note explaining the vault structure
   */
  async createWelcomeNote(): Promise<void> {
    const welcomePath = path.join(this.rootPath, 'Welcome to Flint Note.md');

    const welcomeContent = `# Welcome to Your Flint Note Vault

Congratulations! Your flint-note vault has been successfully initialized with a comprehensive set of default note types designed to help you capture and organize your knowledge effectively.

## Your Default Note Types

Your vault comes pre-configured with the following note types:

### 📅 Daily Notes
Track daily events, reflections, and activities. Perfect for journaling and maintaining a record of your day-to-day experiences.

### 📚 Reading Notes
Capture insights from books, articles, papers, and other reading material. Includes fields for authors, ratings, and key takeaways.

### ✅ Todos
Manage tasks, action items, and things that need to be done. Features priority levels, due dates, and status tracking.

### 🎯 Projects
Track ongoing projects, goals, and long-term initiatives. Helps you manage scope, timelines, and progress.

### 🎯 Goals
Document and track your long-term personal and professional goals with action plans and progress updates.

### 🎮 Games
Keep track of video games you've played, your experiences, and what made them memorable.

### 🎬 Movies
Record your thoughts on movies you've watched, including ratings, memorable scenes, and recommendations.

## Getting Started

1. **Create your first note**: Use any of the note types above to start capturing your thoughts and experiences
2. **Customize as needed**: Each note type can be modified to better fit your specific needs
3. **Add new note types**: Create additional note types for specialized topics or workflows
4. **Connect your notes**: Use tags and cross-references to build a connected knowledge base

## Tips for Success

- **Be consistent**: Regular use of your daily notes can help establish a journaling habit
- **Use metadata**: The structured fields help you organize and find your notes later
- **Connect ideas**: Look for opportunities to link related notes and concepts
- **Review regularly**: Periodically review your goals and projects to stay on track

## Need Help?

Each note type comes with built-in agent instructions that will guide you through creating well-structured, useful notes. The system will ask relevant questions and suggest helpful additions to your content.

Happy note-taking!
`;

    await fs.writeFile(welcomePath, welcomeContent, 'utf-8');
  }
}
