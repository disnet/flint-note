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

      // Create tutorial content
      await this.createTutorialContent();
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
        name: 'tutorial',
        purpose: 'Interactive tutorials for learning Flint concepts and best practices',
        agentInstructions: [
          'Guide users through tutorial steps with clear explanations',
          'Provide encouragement and helpful clarification',
          'Help users apply tutorial concepts to their own notes',
          'Answer questions about Flint features and workflows',
          'Suggest next steps for continued learning'
        ],
        metadataSchema: {
          fields: []
        }
      },
      {
        name: 'examples',
        purpose: 'Reference examples demonstrating Flint best practices and patterns',
        agentInstructions: [
          'Explain the techniques and patterns shown in examples',
          'Help users adapt examples to their specific needs',
          'Suggest related examples and tutorials for deeper learning',
          'Demonstrate effective note structure and AI interaction',
          'Show how to build on example concepts'
        ],
        metadataSchema: {
          fields: []
        }
      },
      {
        name: 'templates',
        purpose: 'Starter templates for common note-taking scenarios and workflows',
        agentInstructions: [
          'Help users customize templates for their specific use cases',
          'Suggest appropriate template usage and modifications',
          'Guide template-based note creation and organization',
          'Explain the structure and purpose of template elements',
          'Recommend when to create new templates'
        ],
        metadataSchema: {
          fields: []
        }
      },
      {
        name: 'note',
        purpose: 'General-purpose notes for thoughts, ideas, and information',
        agentInstructions: [
          'Keep notes organized and well-structured',
          'Use clear headings and formatting',
          'Link to related notes when appropriate',
          'Extract actionable items when present',
          'Help build connections between related concepts'
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

  /**
   * Create welcome note explaining the vault structure
   */
  async createWelcomeNote(): Promise<void> {
    const welcomePath = path.join(this.rootPath, 'Welcome to Flint.md');

    const welcomeContent = `# Welcome to Flint!

Welcome to your new Flint vault! Flint is an AI-powered note-taking system designed to help you capture, organize, and connect your knowledge through intelligent conversations with your AI assistant.

## What Makes Flint Different?

Unlike traditional note-taking apps, Flint puts **AI assistance at the center** of your workflow. Your AI agent doesn't just help you write—it helps you think, organize, and discover connections in your knowledge.

## Your Learning Path

Your vault has been set up with a complete learning system to get you started:

### 📚 **Tutorial Notes** (/tutorial/)
Interactive step-by-step tutorials that teach you Flint's core concepts:
- **Your First Note** - Create and edit notes with AI assistance
- **Working with AI** - Learn to have effective conversations with your agent
- **Smart Note-Taking** - Write notes that enhance AI interactions
- **Building Connections** - Use wikilinks to create knowledge graphs
- **Organizing with Types** - Create custom note types for your workflows
- **Advanced Features** - Master sophisticated Flint capabilities

### 📋 **Example Notes** (/examples/)
Real examples showing best practices and effective patterns for different scenarios.

### 📄 **Template Notes** (/templates/)
Starter templates you can copy and customize for common note-taking needs.

### 📝 **General Notes** (/note/)
Your space for everyday notes, thoughts, and ideas.

## Quick Start

**👉 Start here**: Open the first tutorial at [[tutorial/01-your-first-note]] to begin your Flint journey.

The tutorials are designed to be completed in order, but you can jump around based on your interests and needs.

## Key Concepts to Remember

- **Your AI agent is your partner** - Don't just write alone, engage it in conversation
- **Structure helps AI help you** - Well-organized notes lead to better AI assistance
- **Connections create value** - Link related notes to build a knowledge network
- **Iterate and improve** - Notes grow more valuable as you develop and refine them

## Need Help?

- **Ask your AI agent** - It's designed to help with Flint-specific questions
- **Check the tutorials** - They cover all major concepts and workflows
- **Experiment freely** - Flint is designed for exploration and learning

Ready to transform how you work with knowledge? Let's begin with your first tutorial!

**Next step**: [[tutorial/01-your-first-note]]
`;

    await fs.writeFile(welcomePath, welcomeContent, 'utf-8');
  }

  /**
   * Create comprehensive tutorial content for onboarding
   */
  async createTutorialContent(): Promise<void> {
    // Tutorial 1: Your First Note
    const tutorial1Path = path.join(this.rootPath, 'tutorial', '01-your-first-note.md');
    const tutorial1Content = `# Tutorial 1: Your First Note

Welcome to your first Flint tutorial! This interactive guide will walk you through creating and editing notes with AI assistance.

## What You'll Learn

- How to create and edit notes in Flint
- Basic markdown formatting
- Your first conversation with the AI agent
- How to save and organize your notes

## Step 1: Understanding This Note

You're currently reading a tutorial note! Notice how it's organized with clear headings and structured content. This is the kind of note structure that works well with Flint's AI assistant.

## Step 2: Try Some Basic Formatting

**Practice Exercise**: Try editing this note and add some content below. You can use:

- **Bold text** with double asterisks
- *Italic text* with single asterisks
- \`Code text\` with backticks
- Lists like this one!

**Your practice area** (edit this section):
[Try adding some content here - delete this text and write something about yourself or your goals with Flint]

## Step 3: Have Your First AI Conversation

Now let's engage the AI assistant! Here's how:

1. **Open the AI Assistant** - Look for the AI panel (usually on the right side)
2. **Ask a question** - Try asking: "Can you help me improve the content I just wrote?"
3. **Provide context** - The AI can see this note and will help you enhance it

**Suggested AI prompts to try**:
- "Help me organize my thoughts about [your topic]"
- "What other sections might be useful for this note?"
- "Can you suggest some wikilinks I could add to connect this to other concepts?"

## Step 4: Save and Navigate

Your changes are automatically saved! You can navigate between notes using:
- The sidebar navigation
- Wikilinks like [[tutorial/02-working-with-ai]]
- The search function

## Practice Challenge

Before moving on, try this:
1. Add a personal section to this note about why you're interested in Flint
2. Ask the AI to help you improve that section
3. Create your first wikilink to connect to a future note idea

## Next Steps

Ready for more? Continue to **[[tutorial/02-working-with-ai]]** to learn how to have effective conversations with your AI assistant.

**What you've accomplished**: ✅ Created and edited your first note, tried basic formatting, and engaged with the AI assistant!
`;

    // Tutorial 2: Working with AI
    const tutorial2Path = path.join(this.rootPath, 'tutorial', '02-working-with-ai.md');
    const tutorial2Content = `# Tutorial 2: Working with the AI Agent

In this tutorial, you'll learn how to have effective conversations with your AI assistant and leverage its capabilities for better note-taking.

## What Makes Flint's AI Different

Unlike generic AI assistants, your Flint AI agent:
- **Knows your notes** - It can see and reference your entire knowledge base
- **Understands context** - It knows what note type you're working with
- **Follows note-specific instructions** - Each note type has agent guidelines
- **Helps with structure** - It suggests organization and connections

## Effective AI Conversation Patterns

### 1. Ask for Help with Structure

Instead of: "Make this better"
Try: "Help me organize these ideas into clear sections with actionable insights"

**Practice**: Ask the AI to help structure a messy note or idea.

### 2. Request Specific Types of Analysis

Good prompts:
- "What are the key themes in this note?"
- "Help me identify action items from this meeting note"
- "Suggest related concepts I should link to"
- "What questions should I explore further on this topic?"

### 3. Use Your Notes as Context

The AI can reference other notes:
- "Based on my previous notes about [topic], how does this new information fit?"
- "Compare this to what I wrote in [[other-note-name]]"
- "What patterns do you see across my notes on this subject?"

## AI Features in Flint

### Task Management
The AI can help you:
- Extract action items from notes
- Break down complex projects
- Set priorities and deadlines
- Track progress across notes

### Knowledge Connections
Your AI assistant excels at:
- Suggesting relevant wikilinks
- Identifying related concepts
- Building knowledge graphs
- Finding patterns across notes

### Content Enhancement
Get help with:
- Improving clarity and structure
- Adding missing context
- Generating summaries
- Creating outlines

## Practice Exercises

### Exercise 1: Content Improvement
Ask the AI: "Help me improve the clarity and structure of this tutorial. What sections could be enhanced?"

### Exercise 2: Connection Building
Ask: "What other tutorial topics should I link to from this note? Suggest some potential wikilinks."

### Exercise 3: Question Generation
Ask: "What questions should I be thinking about regarding AI-assisted note-taking?"

## Common AI Conversation Patterns

### For New Notes
- "Help me brainstorm an outline for a note about [topic]"
- "What key points should I cover when writing about [subject]?"

### For Existing Notes
- "Review this note and suggest improvements"
- "Help me identify the main themes and organize them better"

### For Knowledge Building
- "How does this connect to my other notes?"
- "What should I explore next on this topic?"

## Tips for Success

1. **Be specific** - Clear, detailed requests get better responses
2. **Provide context** - Mention related notes or background information
3. **Iterate** - Build on the AI's suggestions with follow-up questions
4. **Ask for explanations** - Understanding the 'why' helps you learn

## Your AI Conversation Workspace

**Try it now**: Use the space below to practice having a conversation with your AI assistant about this tutorial.

[Practice area - ask the AI questions about what you've learned so far]

## Next Steps

Continue to **[[tutorial/03-smart-note-taking]]** to learn how to structure your notes for maximum AI effectiveness.

**What you've accomplished**: ✅ Learned effective AI conversation patterns and practiced getting specific, useful help from your assistant!
`;

    // Tutorial 3: Smart Note-Taking
    const tutorial3Path = path.join(this.rootPath, 'tutorial', '03-smart-note-taking.md');
    const tutorial3Content = `# Tutorial 3: Smart Note-Taking Techniques

Learn how to structure your notes to maximize AI assistance and build valuable knowledge over time.

## What Makes a "Smart" Note?

Smart notes in Flint are designed to:
- **Work well with AI** - Clear structure helps AI understand and enhance content
- **Connect to other knowledge** - Linked concepts build a knowledge network
- **Grow over time** - Notes that improve through iteration and AI assistance
- **Capture context** - Enough information for future understanding

## Key Principles of Smart Note-Taking

### 1. Start with Clear Structure

**Good structure example**:
\`\`\`markdown
# Main Topic

## Context
Why is this important? What's the background?

## Key Points
- Main idea 1 with explanation
- Main idea 2 with explanation
- Main idea 3 with explanation

## Connections
Related to: [[note-1]], [[note-2]]

## Questions & Next Steps
- What should I explore next?
- Action items or follow-ups
\`\`\`

### 2. Write for Your Future Self

Ask yourself:
- Will I understand this in 6 months?
- Have I captured enough context?
- What would I need to know to continue this work?

### 3. Think in Connections

Instead of isolated notes, think about:
- How does this relate to what I already know?
- What other concepts should I link to?
- Where might I reference this note from?

## The ORCA Method for Smart Notes

**O** - **Organize** with clear structure
**R** - **Relate** to other concepts
**C** - **Capture** sufficient context
**A** - **Act** on insights and connections

### Organize: Structure Your Content

Use consistent patterns:
- Clear headings that describe content
- Logical flow from general to specific
- Bullet points for lists and key ideas
- Code blocks for examples or templates

### Relate: Build Connections

- Use wikilinks [[like-this]] for related concepts
- Create "see also" sections
- Reference source materials
- Link to follow-up actions or questions

### Capture: Include Context

- Why is this important?
- What was the situation or trigger?
- Who was involved?
- When did this happen or when is it relevant?

### Act: Make Notes Actionable

- Include next steps or action items
- Ask questions that guide future exploration
- Create templates or frameworks you can reuse
- Set up connections for future notes

## Examples of Smart vs. Basic Notes

### Basic Note (harder for AI to help with):
\`\`\`
Meeting today was good. Talked about the project. Need to follow up.
\`\`\`

### Smart Note (AI can provide much better assistance):
\`\`\`
# Project Kickoff Meeting - Product Launch

## Context
First meeting for Q2 product launch initiative. Team: Sarah (PM), Mike (Dev), Lisa (Design).

## Key Decisions
- Launch target: May 15th
- MVP features: user auth, basic dashboard, mobile responsive
- Budget approved: $50k

## Action Items
- [ ] Sarah: Create detailed project timeline by Friday
- [ ] Mike: Research technical feasibility of mobile requirements
- [ ] Lisa: Draft initial wireframes for core user flows

## Questions & Risks
- How will this impact our existing user base?
- Do we have enough development resources?

## Related
- [[Q2-planning-notes]]
- [[product-roadmap-2024]]
- Previous launch: [[Q1-launch-retrospective]]
\`\`\`

## Practice Exercise: Transform a Note

**Before**: "Read a book about productivity. Had some good ideas."

**Your turn**: Rewrite this as a smart note with proper structure, context, and connections. Ask the AI to help you brainstorm what information might be missing.

**Practice area**:
[Transform the basic note above into a smart note here]

## AI-Friendly Writing Patterns

### 1. Use Descriptive Headings
- Good: "Key Insights from Customer Interview #3"
- Less helpful: "Notes"

### 2. Write Complete Thoughts
- Good: "The customer mentioned that our current UI is confusing during the checkout process, specifically the payment method selection"
- Less helpful: "UI confusing, checkout issues"

### 3. Include Your Reasoning
- Good: "I think we should prioritize mobile optimization because 70% of our traffic is mobile, and the current experience has high bounce rates"
- Less helpful: "Need mobile optimization"

### 4. Ask Explicit Questions
- Good: "How might we reduce the cognitive load during checkout while maintaining security requirements?"
- Less helpful: "Fix checkout"

## Common Note Types and Their Patterns

### Meeting Notes
- Context: Who, what, when, why
- Key decisions and action items
- Open questions and follow-ups
- Links to related projects or notes

### Research Notes
- Source information and credibility
- Key findings and insights
- How this relates to your work/interests
- Questions for further exploration

### Idea/Brainstorming Notes
- Original trigger or inspiration
- Core concept explanation
- Potential applications or next steps
- Related ideas or concepts

### Project Notes
- Objective and success criteria
- Current status and progress
- Blockers and challenges
- Next actions and timeline

## Advanced Smart Note Techniques

### 1. Progressive Summarization
- Start with raw notes/thoughts
- Bold the most important points
- Highlight the key insights
- Create summaries that link to details

### 2. Zettelkasten-Style Connections
- Each note has a focused, atomic concept
- Extensive cross-linking between related ideas
- Building arguments through note sequences
- Emergent themes from connection patterns

### 3. Template-Based Consistency
- Create templates for recurring note types
- Consistent structure aids AI understanding
- Easier to find information across notes
- Reduces cognitive load during creation

## Review and Improvement

Ask your AI assistant:
- "Review this note structure - what could make it more useful?"
- "What connections am I missing?"
- "How could I improve the clarity of this content?"
- "What questions should I be asking about this topic?"

## Next Steps

Continue to **[[tutorial/04-building-connections]]** to learn how to create powerful knowledge networks with wikilinks.

**What you've accomplished**: ✅ Learned the ORCA method for smart note-taking and practiced creating well-structured, AI-friendly notes!
`;

    // Tutorial 4: Building Connections
    const tutorial4Path = path.join(
      this.rootPath,
      'tutorial',
      '04-building-connections.md'
    );
    const tutorial4Content = `# Tutorial 4: Building Connections

Learn how to use wikilinks to create powerful knowledge networks that enhance both your thinking and AI assistance.

## Why Connections Matter

Connected notes create a "second brain" that:
- **Reveals patterns** - See relationships between ideas
- **Enhances AI context** - AI understands broader relationships
- **Improves recall** - Multiple paths to the same information
- **Generates insights** - Unexpected connections spark new ideas

## Wikilink Basics

### Creating Wikilinks
- Basic link: \`[[note-name]]\`
- Link with display text: \`[[note-name|display text]]\`
- Section links: \`[[note-name#section-heading]]\`

### When Wikilinks Are Created
- **Existing notes**: Click to navigate directly
- **New notes**: Click to create the linked note
- **Invalid links**: System indicates when links are broken

## Types of Connections

### 1. Direct Relationships
Connect notes that directly relate:
- **Cause and effect**: [[problem]] → [[solution]]
- **Part and whole**: [[project]] → [[task-1]], [[task-2]]
- **Category and example**: [[note-taking-methods]] → [[zettelkasten]]

### 2. Conceptual Relationships
Link related concepts:
- **Similar ideas**: [[productivity]] ↔ [[efficiency]]
- **Opposing views**: [[argument-for]] ↔ [[argument-against]]
- **Evolution of thought**: [[initial-idea]] → [[refined-concept]]

### 3. Temporal Relationships
Connect across time:
- **Before/after**: [[meeting-prep]] → [[meeting-notes]] → [[follow-up-actions]]
- **Iterations**: [[draft-v1]] → [[draft-v2]] → [[final-version]]
- **Timeline**: [[Q1-planning]] → [[Q2-planning]] → [[Q3-planning]]

### 4. Contextual Relationships
Connect by context:
- **Project groupings**: All notes tagged with [[project-alpha]]
- **Source materials**: [[book-summary]] → [[chapter-1-notes]]
- **People**: [[person-name]] connected to all related interactions

## Building Your Knowledge Graph

### Start Small, Think Big
Begin with obvious connections:
1. Link related project notes together
2. Connect source material to your insights
3. Link questions to potential answers
4. Connect similar concepts or topics

### Use Consistent Naming
- **Be specific**: [[productivity-book-notes]] vs [[notes]]
- **Use clear conventions**: [[YYYY-MM-DD-meeting-name]] for meetings
- **Avoid special characters**: Use hyphens instead of spaces

### Create Index Notes
Build "hub" notes that organize related concepts:

\`\`\`markdown
# Productivity Systems

An overview of different approaches to personal productivity.

## Core Concepts
- [[time-management]]
- [[task-prioritization]]
- [[workflow-optimization]]

## Specific Methods
- [[getting-things-done]]
- [[pomodoro-technique]]
- [[time-blocking]]

## Tools and Applications
- [[productivity-apps]]
- [[analog-systems]]
- [[hybrid-approaches]]

## My Experiments
- [[productivity-experiment-2024]]
- [[what-works-for-me]]
\`\`\`

## Advanced Connection Patterns

### 1. MOCs (Maps of Content)
Create navigational notes that organize topics:

\`\`\`markdown
# Learning and Development MOC

## Current Learning Projects
- [[language-learning-journey]]
- [[technical-skills-development]]

## Resources and Methods
- [[learning-techniques]]
- [[book-recommendations]]
- [[online-courses]]

## Reflections and Progress
- [[learning-retrospectives]]
- [[skill-assessment]]
\`\`\`

### 2. Progressive Connection Building
Start with basic links, then add complexity:

**Level 1**: Direct connections
- [[meeting-notes]] → [[action-items]]

**Level 2**: Thematic groupings
- [[project-alpha]] → [[meeting-notes]], [[research]], [[decisions]]

**Level 3**: Cross-theme insights
- [[project-alpha-lessons]] → [[general-project-management-principles]]

### 3. Question-Driven Connections
Use questions to guide connection building:
- "What led to this idea?" → [[source-inspiration]]
- "What's similar to this?" → [[related-concepts]]
- "What's next?" → [[follow-up-actions]]
- "Who cares about this?" → [[stakeholders]]

## Practical Connection Exercises

### Exercise 1: Audit Existing Notes
1. Review 5 recent notes
2. Ask: "What else in my vault relates to this?"
3. Add at least 2 wikilinks to each note
4. Ask AI: "What connections am I missing for this note?"

### Exercise 2: Create a Topic Map
1. Choose a subject you have multiple notes about
2. Create a new "map" note for that topic
3. Link to all related notes with brief descriptions
4. Identify gaps where new notes might be needed

### Exercise 3: Follow Connection Paths
1. Start with any note
2. Follow wikilinks for 5 "hops"
3. Notice what patterns or themes emerge
4. Create new connections based on what you discover

## AI-Assisted Connection Building

Ask your AI assistant to help:
- "What other notes in my vault relate to this topic?"
- "Suggest some wikilinks I should add to this note"
- "Help me organize these related notes into a coherent map"
- "What themes do you see across my connected notes?"

### Example AI Prompts for Connections
- "Based on this note about [[project-management]], what other concepts should I link to?"
- "I'm working on [[learning-spanish]]. What other notes might connect to language learning?"
- "Help me create a map of content note for all my notes about productivity"

## Connection Maintenance

### Regular Review
- Weekly: Check for broken links
- Monthly: Review connection patterns
- Quarterly: Reorganize major topic maps

### Quality over Quantity
Better to have:
- 5 meaningful, well-explained connections
- Than 20 superficial links without context

### Evolution Over Time
Your connection patterns will evolve:
- Early: Direct, obvious relationships
- Later: Subtle conceptual connections
- Advanced: Emergent themes and insights

## Signs of a Healthy Knowledge Graph

✅ **Easy navigation** - You can find related information quickly
✅ **Serendipitous discovery** - Following links leads to unexpected insights
✅ **Context richness** - AI provides better assistance due to connections
✅ **Pattern recognition** - You start seeing themes across different areas
✅ **Knowledge synthesis** - Connections help generate new ideas

## Troubleshooting Common Issues

### "I don't know what to link"
- Start with obvious relationships
- Ask: "What led to this?" and "What comes next?"
- Use the AI to suggest connections

### "Too many links feel overwhelming"
- Focus on the most important 3-5 connections
- Use clear, descriptive link text
- Group related links in sections

### "Links feel forced"
- Only link when there's a real relationship
- Explain why the connection matters
- Quality over quantity

## Next Steps

Continue to **[[tutorial/05-organizing-with-types]]** to learn how to create custom note types that enhance your workflow.

**What you've accomplished**: ✅ Learned to build powerful knowledge networks using wikilinks and understand how connections enhance both thinking and AI assistance!
`;

    // Tutorial 5: Organizing with Note Types
    const tutorial5Path = path.join(
      this.rootPath,
      'tutorial',
      '05-organizing-with-types.md'
    );
    const tutorial5Content = `# Tutorial 5: Organizing with Note Types

Learn how to create and use custom note types to optimize your workflow and enhance AI assistance for different kinds of content.

## Understanding Note Types

Note types in Flint are more than just folders—they're **intelligent organization systems** that:
- **Guide AI behavior** - Each type has specific agent instructions
- **Enforce structure** - Consistent organization patterns
- **Enable workflows** - Type-specific features and templates
- **Improve searchability** - Organized by purpose and content type

## Your Current Note Types

Your vault comes with these foundation types:
- **tutorial** - Interactive learning content (what you're reading now!)
- **examples** - Reference patterns and best practices
- **templates** - Starter frameworks for common scenarios
- **note** - General-purpose content

## When to Create New Note Types

Create a new note type when you have:

### Recurring Content Patterns
- Weekly reports with similar structure
- Research notes that need specific fields
- Meeting notes with consistent agenda items
- Project documentation with standard sections

### Unique AI Requirements
- Content that needs different kinds of assistance
- Specific analysis or processing needs
- Distinct writing styles or formats
- Specialized domain knowledge

### Workflow Optimization
- Content that follows a specific process
- Notes that trigger particular actions
- Information that needs regular review
- Content with compliance or formatting requirements

## Planning Your Note Type

Before creating a new type, consider:

### 1. Purpose and Scope
- What specific problem does this solve?
- How is this different from existing types?
- What content will live here?

### 2. Structure Requirements
- What sections or fields are always needed?
- What's optional vs. required?
- How should information be organized?

### 3. AI Agent Instructions
- How should the AI help with this content?
- What specific assistance is most valuable?
- What domain knowledge might be needed?

### 4. Metadata Needs
- What properties help organize this content?
- How will you search and filter?
- What taxonomies or tags make sense?

## Example: Creating a "Book Notes" Type

Let's walk through creating a custom note type for book notes:

### Step 1: Define the Purpose
"Capture insights from books I read, with consistent structure for easy review and connection to other ideas."

### Step 2: Design the Structure
\`\`\`markdown
# [Book Title] by [Author]

## Metadata
- **Rating**: /5 stars
- **Started**: [Date]
- **Finished**: [Date]
- **Genre**: [Category]
- **Recommended by**: [Source]

## Summary
One-paragraph overview of the main thesis or story.

## Key Insights
- Insight 1 with page reference
- Insight 2 with page reference
- Insight 3 with page reference

## Quotes
> "Memorable quote 1" (p. XX)
> "Memorable quote 2" (p. XX)

## Action Items
- [ ] Thing to try or implement
- [ ] Further research or reading

## Connections
Related to: [[other-book]], [[concept]], [[project]]

## Review Notes
Personal reflection on impact and application.
\`\`\`

### Step 3: Create Agent Instructions
For the "book-notes" type, the AI should:
- Help extract key insights from reading notes
- Suggest connections to other books or concepts
- Assist with summarization and synthesis
- Recommend follow-up reading or research
- Help identify actionable items

### Step 4: Set Up Metadata Schema
Useful fields might include:
- Author (required, text)
- Genre (optional, predefined options)
- Rating (optional, number 1-5)
- Status (required, options: reading/finished/abandoned)
- Date finished (optional, date)

## Practical Exercise: Design Your Note Type

Think about a recurring type of note you create. Design a custom note type:

### Your Note Type Planning Worksheet

**1. Purpose**: What problem will this note type solve?
[Your answer here]

**2. Content Structure**: What sections or fields are needed?
[Your answer here]

**3. AI Instructions**: How should the AI assist with this content?
[Your answer here]

**4. Example Note**: Create a sample note using your structure.
[Your example here]

Ask your AI assistant: "Help me refine this note type design. What am I missing? How could the structure be improved?"

## Common Note Type Patterns

### 1. Process-Oriented Types
For recurring workflows:
- **Meeting notes**: Agenda, attendees, decisions, actions
- **Project updates**: Status, progress, blockers, next steps
- **Daily journals**: Reflection prompts, gratitude, goals

### 2. Reference Types
For information storage:
- **People profiles**: Contact info, context, interaction history
- **Tool reviews**: Features, pros/cons, use cases
- **Recipe collection**: Ingredients, steps, variations, notes

### 3. Learning Types
For knowledge building:
- **Course notes**: Lessons, exercises, insights, applications
- **Research logs**: Questions, sources, findings, conclusions
- **Skill practice**: Exercises, progress, reflection, next steps

### 4. Creative Types
For ideation and creation:
- **Story ideas**: Characters, plot, themes, development
- **Design concepts**: Inspiration, sketches, iterations, feedback
- **Writing drafts**: Outlines, drafts, revisions, publication notes

## Best Practices for Note Types

### 1. Start Simple
- Begin with basic structure
- Add complexity based on actual use
- Evolve types over time

### 2. Be Consistent
- Use similar organizational patterns
- Maintain naming conventions
- Apply types consistently

### 3. Optimize for AI
- Write clear agent instructions
- Use structured content that AI can parse
- Include context and reasoning in instructions

### 4. Plan for Connections
- Consider how this type relates to others
- Build in connection points (wikilinks, tags)
- Think about cross-type relationships

## Advanced Note Type Features

### 1. Template Integration
Create note templates that:
- Pre-populate common structure
- Include placeholder content
- Provide formatting examples
- Guide content creation

### 2. Specialized Metadata
Design metadata schemas that:
- Support specific workflows
- Enable powerful filtering and search
- Track important properties
- Integrate with external systems

### 3. Cross-Type Workflows
Design types that work together:
- Project types that link to task types
- Research types that feed into writing types
- Learning types that connect to application types

## Managing Note Types Over Time

### Evolution Strategies
- **Merge types** that prove too similar
- **Split types** that become too broad
- **Deprecate types** that aren't used
- **Enhance types** based on usage patterns

### Regular Review
Monthly questions:
- Which types are most/least useful?
- What patterns emerge in my note creation?
- How could existing types be improved?
- What new types might be needed?

## Integration with AI Workflows

Your AI assistant becomes more helpful with well-designed note types because:
- **Context awareness** - Understands the type of content
- **Specialized assistance** - Follows type-specific instructions
- **Cross-type insights** - Can suggest connections between types
- **Workflow optimization** - Helps improve type designs over time

## Next Steps

Continue to **[[tutorial/06-advanced-features]]** to explore sophisticated Flint capabilities for power users.

**What you've accomplished**: ✅ Learned to design custom note types that optimize your workflow and enhance AI assistance for specific kinds of content!
`;

    // Tutorial 6: Advanced Features
    const tutorial6Path = path.join(this.rootPath, 'tutorial', '06-advanced-features.md');
    const tutorial6Content = `# Tutorial 6: Advanced Features

Explore sophisticated Flint capabilities for building comprehensive knowledge systems and optimizing your AI-assisted workflows.

## Welcome to Advanced Flint

By now you understand Flint's core concepts. This tutorial covers advanced techniques that transform Flint from a note-taking tool into a powerful knowledge management and thinking system.

## Advanced AI Conversation Patterns

### 1. Context Stacking
Build complex conversations by referencing multiple notes:

**Example prompt**: "Based on my notes in [[project-alpha]], [[team-dynamics]], and [[budget-constraints]], what's the best approach for the next sprint?"

The AI can synthesize information across your entire knowledge base to provide contextual advice.

### 2. Iterative Refinement
Use AI to progressively improve your thinking:

**Round 1**: "Help me outline my thoughts on this topic"
**Round 2**: "Now help me identify gaps in this analysis"
**Round 3**: "What are the strongest counterarguments to consider?"
**Round 4**: "How would I present this to different audiences?"

### 3. Cross-Domain Synthesis
Connect ideas from different fields:

"How do the principles in [[design-thinking]] apply to the problem described in [[engineering-challenge]]? What insights from [[psychology-research]] might be relevant?"

## Advanced Knowledge Organization

### 1. Multi-Layered Hierarchies
Create sophisticated organizational structures:

\`\`\`
Domain Level: [[Business Strategy]]
├── Theme Level: [[Market Analysis]]
│   ├── Topic Level: [[Customer Segmentation]]
│   │   ├── Specific Notes: [[Customer-Interview-01]]
│   │   └── Analysis Notes: [[Segmentation-Framework]]
│   └── Topic Level: [[Competitive Landscape]]
└── Theme Level: [[Strategic Planning]]
\`\`\`

### 2. Dynamic Collections
Use queries and smart linking to create evolving note collections:

**Example MOC with dynamic elements**:
\`\`\`markdown
# Active Projects Dashboard

## High Priority
- Notes tagged with #urgent and #project
- Recent updates in project note types

## Stalled Projects
- Projects with no updates in 30 days
- Notes with status:blocked

## Upcoming Deadlines
- Action items with due dates in next 14 days
\`\`\`

### 3. Conceptual Layers
Organize knowledge at different abstraction levels:

- **Principles** (high-level concepts)
- **Frameworks** (structured approaches)
- **Tactics** (specific techniques)
- **Examples** (concrete applications)
- **Experiments** (tests and learnings)

## Advanced Metadata Strategies

### 1. Progressive Enhancement
Start simple, add complexity over time:

**Phase 1**: Basic tags and categories
**Phase 2**: Status tracking and priorities
**Phase 3**: Relationships and dependencies
**Phase 4**: Automated workflows and triggers

### 2. Semantic Metadata
Use metadata that captures meaning, not just categories:

\`\`\`yaml
confidence: 0.8          # How certain am I about this?
evidence_strength: high  # How well-supported is this?
novelty: medium         # How new/surprising is this insight?
application: immediate  # When/how will I use this?
\`\`\`

### 3. Relationship Metadata
Capture the nature of connections:

\`\`\`yaml
relates_to:
  - note: "[[design-principles]]"
    relationship: "applies"
  - note: "[[user-research]]"
    relationship: "contradicts"
  - note: "[[project-goals]]"
    relationship: "supports"
\`\`\`

## Advanced Search and Discovery

### 1. Query-Based Note Discovery
Develop sophisticated search strategies:

**Temporal queries**: Notes created/modified in specific timeframes
**Content queries**: Notes containing specific patterns or structures
**Relationship queries**: Notes connected in particular ways
**Metadata queries**: Notes with specific property combinations

### 2. Pattern Recognition
Train yourself to notice:
- **Recurring themes** across different contexts
- **Contradictions** that need resolution
- **Gaps** where knowledge is missing
- **Opportunities** for synthesis or application

### 3. Serendipitous Discovery
Create conditions for unexpected insights:
- Follow random wikilink paths periodically
- Review notes from 6+ months ago
- Ask AI to find surprising connections
- Explore notes outside your usual domains

## AI-Assisted Knowledge Work

### 1. Research Acceleration
Use AI to enhance research workflows:

**Literature review**: "Summarize the key themes across these research notes: [[paper-1]], [[paper-2]], [[paper-3]]"

**Gap analysis**: "Based on my research notes, what important questions haven't been addressed?"

**Synthesis**: "Help me combine insights from [[theory-notes]] and [[case-study-notes]] into a coherent framework"

### 2. Creative Ideation
Leverage AI for creative work:

**Brainstorming**: "Generate 20 creative solutions to the problem described in [[challenge-definition]]"

**Perspective-taking**: "How would [[expert-name]] approach the situation in [[scenario-note]]?"

**Cross-pollination**: "What ideas from [[completely-different-domain]] could apply to [[current-project]]?"

### 3. Decision Support
Use AI for complex decision-making:

**Option analysis**: "Compare the pros and cons of each approach in [[decision-framework]]"

**Risk assessment**: "What are potential failure modes for the plan in [[strategy-note]]?"

**Stakeholder analysis**: "How would different stakeholders react to the proposal in [[project-plan]]?"

## Building Learning Systems

### 1. Progressive Skill Development
Create notes that support skill building:

**Skill maps**: Connect learning resources to practice opportunities
**Progress tracking**: Document what you've learned and applied
**Reflection systems**: Regular reviews of what's working
**Challenge escalation**: Gradually increase difficulty

### 2. Knowledge Validation
Build systems to test and refine your understanding:

**Explanation tests**: Can you explain concepts to others?
**Application challenges**: Can you apply knowledge in new contexts?
**Prediction games**: Can you predict outcomes based on your knowledge?
**Teaching opportunities**: Can you help others learn these concepts?

### 3. Continuous Improvement
Create feedback loops for better knowledge work:

**Regular reviews**: Weekly/monthly knowledge audits
**System optimization**: Refine note types and workflows
**Tool evaluation**: Assess what's working vs. what's not
**Habit formation**: Build sustainable knowledge practices

## Advanced Workflow Integration

### 1. External System Integration
Connect Flint to your broader toolkit:

**Calendar integration**: Link meeting notes to calendar events
**Task management**: Connect action items to external task systems
**Reference management**: Link to external citation tools
**Communication tools**: Connect notes to email or chat histories

### 2. Automation Opportunities
Identify repetitive tasks for automation:

**Template instantiation**: Quickly create structured notes
**Metadata population**: Auto-fill common fields
**Connection discovery**: Suggest relevant links
**Review scheduling**: Prompt for regular note updates

### 3. Collaborative Knowledge
Extend your personal system for team use:

**Shared vocabularies**: Consistent terminology across team members
**Knowledge handoffs**: Structured ways to transfer context
**Collective intelligence**: Team-wide pattern recognition
**Distributed expertise**: Connect individual knowledge domains

## Measuring Knowledge System Health

### Quantitative Indicators
- **Note creation rate**: Are you consistently adding value?
- **Connection density**: How well-linked is your knowledge?
- **Review frequency**: How often do you revisit existing notes?
- **Application rate**: How often do you act on insights?

### Qualitative Indicators
- **Insight generation**: Are you making novel connections?
- **Problem-solving speed**: Can you find relevant information quickly?
- **Decision confidence**: Does your knowledge support better decisions?
- **Learning acceleration**: Are you building knowledge more effectively?

## Troubleshooting Advanced Usage

### Common Advanced Challenges

**Information overload**: Too much content, not enough curation
- Solution: Focus on quality connections over quantity
- Regular pruning and consolidation

**Analysis paralysis**: Over-structuring prevents actual use
- Solution: Start simple, evolve based on actual needs
- Bias toward action over perfect organization

**Context loss**: Rich information becomes disconnected
- Solution: Better linking and regular review cycles
- More descriptive connection annotations

**System drift**: Processes become inconsistent over time
- Solution: Regular system reviews and refinements
- Clear documentation of your personal standards

## Your Advanced Flint Journey

### Next Steps for Mastery
1. **Experiment** with advanced features in low-stakes contexts
2. **Iterate** on your workflows based on actual usage
3. **Share** your discoveries with other Flint users
4. **Teach** others to reinforce your own understanding

### Building Your Signature System
Every advanced Flint user develops their own unique approach:
- **Personal methodologies** for knowledge work
- **Custom workflows** optimized for your thinking style
- **Specialized techniques** for your domain or interests
- **Continuous refinement** based on evolving needs

## Graduation from Tutorials

**Congratulations!** You've completed the Flint tutorial series. You now understand:

✅ Basic note creation and AI interaction
✅ Effective AI conversation patterns
✅ Smart note-taking techniques
✅ Knowledge connection building
✅ Custom note type creation
✅ Advanced features and workflows

### Your Ongoing Development
- Continue experimenting with new techniques
- Share discoveries with the Flint community
- Adapt the system to your evolving needs
- Contribute to the collective knowledge about effective AI-assisted thinking

## Final Challenge

Create a note that demonstrates your mastery by:
1. **Using multiple advanced techniques** from this tutorial
2. **Connecting to at least 5 other notes** in your vault
3. **Engaging the AI** in a sophisticated conversation about the content
4. **Including metadata** that supports future discovery
5. **Planning follow-up actions** based on your insights

**What you've accomplished**: ✅ Mastered advanced Flint capabilities and built a foundation for lifelong AI-assisted knowledge work!

Welcome to the future of thinking with AI. Your journey with Flint is just beginning.
`;

    // Create all tutorial files
    await fs.writeFile(tutorial1Path, tutorial1Content, 'utf-8');
    await fs.writeFile(tutorial2Path, tutorial2Content, 'utf-8');
    await fs.writeFile(tutorial3Path, tutorial3Content, 'utf-8');
    await fs.writeFile(tutorial4Path, tutorial4Content, 'utf-8');
    await fs.writeFile(tutorial5Path, tutorial5Content, 'utf-8');
    await fs.writeFile(tutorial6Path, tutorial6Content, 'utf-8');

    // Create example notes demonstrating best practices
    await this.createExampleNotes();

    // Create template notes for common scenarios
    await this.createTemplateNotes();
  }

  /**
   * Create example notes demonstrating best practices
   */
  async createExampleNotes(): Promise<void> {
    // Example 1: Meeting Notes
    const meetingExamplePath = path.join(
      this.rootPath,
      'examples',
      'meeting-notes-example.md'
    );
    const meetingExampleContent = `# Example: Effective Meeting Notes

This example demonstrates how to structure meeting notes for maximum value and AI assistance.

## Meeting Details
- **Meeting**: Product Planning Session Q2 2024
- **Date**: March 15, 2024
- **Attendees**: Sarah Chen (PM), Mike Rodriguez (Dev Lead), Lisa Wang (Design), Alex Thompson (Marketing)
- **Duration**: 90 minutes
- **Location**: Conference Room B / Zoom hybrid

## Context & Purpose
Quarterly planning meeting to define product roadmap for Q2 2024. This is our third quarterly planning session following the new agile framework adopted in Q1.

**Background**: Q1 showed 15% user growth but also revealed UX friction points in the onboarding flow. We need to balance new feature development with addressing technical debt.

## Agenda & Key Discussions

### 1. Q1 Retrospective (20 min)
**What went well:**
- Feature velocity increased 25% with new sprint structure
- Customer satisfaction scores improved from 3.2 to 4.1
- Team collaboration much better with hybrid work model

**Challenges:**
- Technical debt accumulated faster than expected
- Design-dev handoff still causing delays
- Customer support tickets increased 30% due to UX confusion

**Key insight**: "We're moving fast but creating friction for users" - Sarah

### 2. Q2 Priority Setting (40 min)
**Discussed options:**
1. Focus entirely on UX improvements and tech debt
2. Continue feature development with 20% tech debt allocation
3. Hybrid approach: Major UX overhaul + 2 new features

**Decision**: Option 3 - Hybrid approach
- **Rationale**: Competitive pressure requires new features, but UX issues are affecting retention
- **Risk mitigation**: Will use design sprint methodology for UX work

### 3. Resource Allocation (20 min)
**Team capacity for Q2:**
- Development: 80 story points per sprint (6 sprints)
- Design: 3 major projects max
- QA: Current capacity sufficient with automation improvements

**External dependencies:**
- Marketing needs 2 weeks lead time for feature announcements
- Customer success wants beta access 1 month before public release

### 4. Timeline & Milestones (10 min)
**Key dates:**
- April 1: Design sprint kickoff for UX overhaul
- April 15: Technical architecture review
- May 1: Feature 1 development begins
- May 15: UX overhaul user testing
- June 1: Feature 2 development begins
- June 30: Q2 feature freeze

## Decisions Made
1. **Adopt hybrid approach** for Q2: UX overhaul + 2 new features
2. **Allocate 40% of dev capacity** to UX improvements and technical debt
3. **Use design sprint methodology** for UX project (1 week intensive)
4. **Implement staged rollout** for major UX changes (10%/25%/100% user cohorts)
5. **Weekly cross-team standups** starting April 1st

## Action Items
- [ ] **Sarah**: Create detailed project briefs for 2 new features by March 22
- [ ] **Mike**: Assess technical debt priorities and create Sprint 1 backlog by March 20
- [ ] **Lisa**: Schedule design sprint sessions for UX overhaul by March 18
- [ ] **Alex**: Draft communication plan for UX changes by March 25
- [ ] **Sarah**: Set up weekly cross-team standups starting April 1
- [ ] **Mike**: Research design system tools for better dev handoff by March 30

## Parking Lot / Future Discussion
- Integration with new analytics platform (Q3 priority)
- Mobile app development timeline (needs separate discovery)
- Potential customer advisory board creation
- Internationalization requirements assessment

## Key Questions & Risks
**Open questions:**
- How will we measure success of UX improvements? (Need to define metrics)
- What if competitive feature launches before us? (Monitor and adapt)
- Can design team handle UX overhaul + 2 new features? (Weekly check-ins)

**Risk mitigation plans:**
- UX overhaul scope creep → Weekly scope reviews with PM
- Technical complexity unknowns → Architecture review by April 15
- Resource conflicts → Priority framework documented and shared

## Connections & Follow-ups
**Related notes:**
- [[Q1-retrospective-2024]] - Reference for lessons learned
- [[product-roadmap-2024]] - Update with Q2 decisions
- [[technical-debt-assessment]] - Mike's current analysis
- [[user-feedback-analysis]] - Lisa's UX research findings
- [[competitive-analysis-Q1]] - Context for feature priorities

**Next meetings:**
- Weekly cross-team standup starting April 1
- Mid-Q2 checkpoint scheduled for May 15
- Q2 retrospective planned for July 5

## Post-Meeting Reflection
**Meeting effectiveness**: 8/10
- Good energy and engagement from all participants
- Decisions were made efficiently
- Clear action items with owners and deadlines

**What could be improved:**
- Could have used more data on customer pain points
- Timeline feels aggressive - may need buffer time
- Should have invited customer success representative

**AI Assistant Notes**: This meeting note structure includes context, decisions, actions, and connections that enable effective follow-up and knowledge building. The clear organization makes it easy for AI to help with project planning, risk assessment, and progress tracking.

## How This Example Demonstrates Best Practices

### 1. Complete Context
- Meeting purpose and background
- All participants and roles
- Decision-making process documented

### 2. Actionable Outcomes
- Clear decisions with rationale
- Specific action items with owners and deadlines
- Identified risks and mitigation strategies

### 3. Future-Oriented
- Connections to related work
- Open questions for follow-up
- Reflection for continuous improvement

### 4. AI-Friendly Structure
- Clear headings and organization
- Complete thoughts with reasoning
- Explicit connections to other knowledge
- Questions that guide future work

Ask your AI assistant: "Based on this meeting note structure, how could I improve my own meeting documentation?"
`;

    // Example 2: Research Notes
    const researchExamplePath = path.join(
      this.rootPath,
      'examples',
      'research-notes-example.md'
    );
    const researchExampleContent = `# Example: Comprehensive Research Notes

This example shows how to capture and organize research findings for maximum value and AI assistance.

## Research Overview
**Topic**: Remote Team Collaboration Tools - Effectiveness Study
**Research Question**: How do different collaboration tools affect team productivity and satisfaction in remote work environments?
**Timeline**: February 15 - March 10, 2024
**Research Type**: Literature review + User interviews + Tool analysis

## Context & Motivation
**Why this research matters:**
Our team has struggled with collaboration since going fully remote in 2023. Current tools feel fragmented and team satisfaction scores have dropped 15%. Need data-driven approach to tool selection.

**Hypothesis**: Integrated tool suites perform better than best-of-breed point solutions for small remote teams (5-15 people).

**Success criteria:**
- Identify top 3 tool recommendations
- Understand key success factors for remote collaboration
- Create implementation framework for tool adoption

## Research Methodology

### Literature Review (Feb 15-22)
**Sources:**
- Academic papers on remote work effectiveness
- Industry reports from Gartner, McKinsey
- Case studies from similar companies
- Tool vendor research and user studies

**Search strategy**:
- Google Scholar: "remote team collaboration productivity"
- Harvard Business Review archive
- Consulting firm reports 2022-2024
- Tool comparison sites and user review platforms

### User Interviews (Feb 23 - Mar 3)
**Participants**: 12 remote team leads from similar companies
**Interview structure**: 45-minute semi-structured interviews
**Key questions:**
- What tools do you use and why?
- What are your biggest collaboration pain points?
- How do you measure team effectiveness?
- What tool changes have you made recently?

### Tool Analysis (Mar 4-10)
**Tools evaluated**: Slack+ecosystem, Microsoft Teams, Notion+integrations
**Evaluation criteria**: Feature set, ease of use, integration, cost, scalability

## Key Findings

### 1. Literature Review Insights

**Remote collaboration challenges** (most cited):
1. **Communication overhead** - 35% more time spent in meetings
2. **Context switching** - Average 23 tool switches per day
3. **Async coordination** - 40% of teams struggle with handoffs
4. **Social connection** - Decreased informal knowledge sharing

**Success factors for remote teams**:
- **Tool standardization** reduces cognitive load by 25%
- **Async-first communication** improves work-life balance
- **Shared documentation** critical for team alignment
- **Regular synchronous touchpoints** maintain team cohesion

**Most compelling research finding**:
> "Teams using integrated tool suites report 30% higher satisfaction and 15% better project completion rates compared to those using fragmented toolsets" - McKinsey Remote Work Study 2023

### 2. Interview Findings

**Patterns across interviews:**

**Pain points** (mentioned by 8+ participants):
- Tool fatigue from managing multiple platforms
- Information scattered across systems
- Difficult to onboard new team members
- Notifications overwhelming and hard to prioritize

**Most valued features**:
- Unified search across all content (11/12 mentioned)
- Threaded conversations that stay connected to work (10/12)
- Easy screen sharing and async video (9/12)
- Integration with existing workflows (8/12)

**Surprising insight**:
"The best tool isn't about features - it's about reducing the mental overhead of figuring out where to put things and where to find them" - Interview #7

**Tool switching patterns**:
- Most teams change primary tools every 18-24 months
- Switches usually triggered by team growth or major project changes
- 70% report some regret about tool choices after 6 months

### 3. Tool Analysis Results

**Evaluation matrix:**

| Tool | Features | Ease of Use | Integration | Cost | Total Score |
|------|----------|-------------|-------------|------|-------------|
| Slack Ecosystem | 9 | 8 | 7 | 6 | 30 |
| Microsoft Teams | 8 | 7 | 9 | 8 | 32 |
| Notion + Integrations | 7 | 6 | 6 | 9 | 28 |

**Detailed analysis:**

**Microsoft Teams** (highest score):
- Strengths: Excellent integration, good value, comprehensive feature set
- Weaknesses: Learning curve for non-Microsoft users, can feel "corporate"
- Best for: Teams already in Microsoft ecosystem, need strong compliance

**Slack Ecosystem** (close second):
- Strengths: Superior user experience, strong third-party ecosystem
- Weaknesses: Cost at scale, can become fragmented with many integrations
- Best for: Tech-savvy teams, need extensive customization

**Notion + Integrations** (specialized use case):
- Strengths: Excellent for documentation and knowledge management
- Weaknesses: Limited real-time collaboration, steep learning curve
- Best for: Content-heavy teams, strong documentation culture

## Synthesis & Insights

### Key Principle: Cognitive Load Management
The most important factor isn't feature richness - it's **reducing cognitive overhead**:
- Fewer decisions about where to put information
- Predictable patterns for finding things
- Minimal context switching between tools

### Framework: The "Collaboration Tool Success Triangle"
1. **Standardization** - Consistent patterns reduce mental load
2. **Integration** - Information flows between contexts seamlessly
3. **Flexibility** - Can adapt to different team styles and project needs

### Recommended Decision Framework
**For teams choosing collaboration tools:**

**Step 1: Assess current state**
- Map all tools currently in use
- Identify information scatter points
- Survey team satisfaction and pain points

**Step 2: Define requirements**
- Must-have vs. nice-to-have features
- Integration requirements with existing systems
- Budget and scalability constraints

**Step 3: Pilot approach**
- Test top 2-3 options for 30 days each
- Measure specific metrics (time to find info, meeting efficiency, team satisfaction)
- Get input from different user types (power users, occasional users, new hires)

## Recommendations

### For Our Team (Specific)
**Primary recommendation**: Microsoft Teams
- Best integration with our existing Office 365
- Strong feature set covers 90% of our needs
- Cost-effective at our scale (12 people)
- Good compliance features for client work

**Implementation approach**:
1. **Week 1-2**: Set up Teams structure and migrate key documents
2. **Week 3-4**: Pilot with one project team
3. **Week 5-6**: Full team adoption with training sessions
4. **Month 2**: Optimize workflows and assess satisfaction

### For General Use (Transferable)
**If starting fresh**: Slack ecosystem for tech teams, Teams for business teams
**If cost-sensitive**: Start with free tiers and upgrade based on adoption
**If document-heavy**: Consider Notion as primary with lightweight chat tool

## Follow-up Actions
- [ ] Present findings to team by March 15
- [ ] Get budget approval for Teams migration by March 20
- [ ] Set up pilot Teams environment by March 25
- [ ] Schedule team training sessions for April 1-5
- [ ] Create success metrics dashboard by April 10
- [ ] Plan 30-day and 90-day evaluation checkpoints

## Questions for Further Research
- How do collaboration patterns change as teams scale from 5 to 15 to 25 people?
- What's the optimal balance between synchronous and asynchronous communication?
- How do different personality types (introvert/extrovert) prefer different collaboration styles?
- What emerging tools or trends should we monitor for future evaluation?

## Connections & Related Work
**Related notes:**
- [[remote-work-best-practices]] - General remote work research
- [[team-productivity-metrics]] - How we measure team effectiveness
- [[tool-evaluation-framework]] - Reusable process for future tool decisions
- [[Q2-team-improvements]] - Links to quarterly planning

**Source materials:**
- [[mckinsey-remote-work-2023]] - Key industry research
- [[interview-transcripts-collaboration]] - Raw interview data
- [[tool-comparison-spreadsheet]] - Detailed evaluation matrix

**Future research areas:**
- [[ai-collaboration-tools]] - Emerging AI-powered features
- [[hybrid-work-patterns]] - In-person vs remote collaboration differences

## Reflection & Meta-Learning

### What worked well in this research:
- Mixed methodology gave comprehensive view
- User interviews provided insights missing from literature
- Hands-on tool testing revealed practical limitations

### What could be improved:
- Could have included more diverse company sizes in interviews
- Tool testing period was too short for complex features
- Should have involved actual team members in evaluation

### Research skills developed:
- Better interview questioning techniques
- More systematic approach to literature review
- Improved framework for tool evaluation

**AI Assistant Note**: This research structure enables effective knowledge building by capturing methodology, findings, synthesis, and actionable outcomes. The clear organization and explicit connections make it easy to build on this research and apply insights to future work.

## How This Example Demonstrates Best Practices

### 1. Complete Research Cycle
- Clear research question and methodology
- Systematic data collection and analysis
- Synthesis into actionable insights
- Specific next steps and implementation plan

### 2. Multiple Evidence Sources
- Literature review for academic foundation
- Interviews for practical insights
- Direct tool testing for hands-on experience
- Triangulation increases confidence in findings

### 3. Transferable Framework
- General principles that apply beyond specific context
- Reusable evaluation methodology
- Decision framework others can adapt

### 4. Explicit Learning Capture
- Reflection on research process itself
- Identification of skills developed
- Recognition of limitations and improvement areas

Ask your AI assistant: "How could I apply this research methodology structure to my own research projects?"
`;

    // Example 3: Project Planning
    const projectExamplePath = path.join(
      this.rootPath,
      'examples',
      'project-planning-example.md'
    );
    const projectExampleContent = `# Example: Comprehensive Project Planning

This example demonstrates effective project planning that balances structure with flexibility and integrates well with AI assistance.

## Project Overview
**Project**: Customer Onboarding Experience Redesign
**Timeline**: April 1 - July 31, 2024 (4 months)
**Team**: 6 people (PM, 2 developers, 1 designer, 1 researcher, 1 QA)
**Budget**: $120,000 (mostly team time + $15k external research)

## Context & Strategic Alignment

### Why This Project Matters
Current onboarding has 45% drop-off rate in first week - industry average is 25%. This directly impacts:
- **Revenue**: ~$200k ARR lost annually to poor onboarding
- **Team morale**: Support team overwhelmed with confused new users
- **Competitive position**: Rivals have much smoother onboarding experiences

### Success Criteria
**Primary objectives** (must achieve):
1. Reduce first-week drop-off to under 30%
2. Decrease support tickets from new users by 40%
3. Improve onboarding NPS from 6.2 to 8.0+

**Secondary objectives** (would be nice):
- Reduce time-to-first-value from 3 days to 1 day
- Increase feature adoption in first month by 25%
- Create reusable patterns for future product areas

### Constraints & Assumptions
**Technical constraints:**
- Must work with existing authentication system
- Cannot require major backend changes (small team)
- Must be mobile-responsive (60% of traffic)

**Business constraints:**
- Cannot disrupt current user acquisition during peak season (May-June)
- Must maintain current conversion rate or better
- Legal requires certain disclosure steps to remain

**Key assumptions:**
- Users want faster, simpler onboarding (validate early)
- Current drop-off is due to confusion, not lack of interest
- Team can maintain current product work during redesign

## Project Phases & Timeline

### Phase 1: Discovery & Research (April 1-30)
**Objectives**: Understand current problems and user needs
**Key activities:**
- Current experience audit and analytics analysis
- User interviews with recent sign-ups (both successful and dropped-off)
- Competitive analysis of onboarding best practices
- Technical architecture assessment

**Deliverables:**
- Problem definition document
- User journey map with pain points identified
- Technical feasibility assessment
- Design principles for new experience

**Success metrics:**
- 15+ user interviews completed
- Analytics funnel analysis complete
- Technical architecture decisions documented

### Phase 2: Design & Prototyping (May 1-31)
**Objectives**: Create and validate new onboarding design
**Key activities:**
- Concept development and wireframing
- Interactive prototype creation
- User testing with 20+ potential users
- Technical proof-of-concept for key interactions

**Deliverables:**
- High-fidelity interactive prototype
- User testing report with validation/iteration needs
- Technical implementation plan
- Content strategy and copywriting guidelines

**Success metrics:**
- Prototype tests show 40%+ improvement in task completion
- User satisfaction scores above 8/10 in testing
- Technical feasibility confirmed for all key features

### Phase 3: Development & Testing (June 1-July 15)
**Objectives**: Build and thoroughly test new experience
**Key activities:**
- Frontend and backend implementation
- Integration with existing systems
- Comprehensive QA testing across devices
- Performance and accessibility testing

**Deliverables:**
- Fully functional onboarding experience
- Comprehensive test coverage and documentation
- Performance benchmarks and optimization
- Deployment plan with rollback procedures

**Success metrics:**
- All acceptance criteria met and tested
- Performance within 10% of current system
- Accessibility compliance verified
- Team confident in deployment readiness

### Phase 4: Launch & Optimization (July 16-31)
**Objectives**: Deploy safely and measure initial results
**Key activities:**
- Staged rollout (10% → 50% → 100% of new users)
- Real-time monitoring and issue resolution
- Data collection and analysis
- Quick iteration based on initial results

**Deliverables:**
- Successful deployment to 100% of new users
- Initial results analysis and recommendations
- Documentation of lessons learned
- Plan for ongoing optimization

**Success metrics:**
- Smooth deployment with minimal issues
- Initial data showing positive trends
- Team ready for ongoing iteration and improvement

## Risk Management

### High-Probability Risks
**Risk**: User testing reveals fundamental UX problems
- **Impact**: Medium (timeline delay)
- **Mitigation**: Start user testing early, plan 2-week buffer in design phase
- **Owner**: Lisa (Design Lead)

**Risk**: Technical integration more complex than expected
- **Impact**: High (major timeline impact)
- **Mitigation**: Technical spike in Phase 1, regular architecture reviews
- **Owner**: Mike (Tech Lead)

**Risk**: Team capacity reduced by other urgent work
- **Impact**: Medium (timeline or scope impact)
- **Mitigation**: Clear team agreements, executive sponsorship, scope flexibility
- **Owner**: Sarah (PM)

### Low-Probability, High-Impact Risks
**Risk**: Major competitor launches similar feature during our development
- **Impact**: High (strategic relevance)
- **Mitigation**: Monitor competitive landscape, focus on unique value props
- **Response plan**: Assess differentiation and adjust scope if needed

**Risk**: Legal or compliance issues discovered late
- **Impact**: High (potential scope change)
- **Mitigation**: Include legal review in Phase 1, regular check-ins
- **Response plan**: Documented workarounds for common compliance patterns

## Team Structure & Communication

### Role Definitions
**Sarah (PM)**: Overall project success, stakeholder management, scope decisions
**Mike (Tech Lead)**: Technical architecture, backend implementation, performance
**Lisa (Designer)**: User experience design, prototyping, user testing coordination
**Emma (Researcher)**: User research, data analysis, testing methodology
**Alex & Jordan (Developers)**: Frontend implementation, integration, testing support
**Taylor (QA)**: Test planning, quality assurance, deployment verification

### Communication Rhythms
**Daily**: Async standup in Slack (blockers, progress, needs)
**Weekly**: 1-hour team sync (demos, decisions, planning)
**Bi-weekly**: Stakeholder update (progress, risks, decisions needed)
**Monthly**: Retrospective and process improvement

### Decision-Making Framework
**Day-to-day decisions**: Individual team members within their expertise
**Design decisions**: Lisa leads with team input and user data
**Technical decisions**: Mike leads with architectural review
**Scope decisions**: Sarah leads with stakeholder and team input
**Escalation path**: Department head → VP Product → Executive team

## Success Metrics & Measurement

### Leading Indicators (measure weekly)
- Prototype testing scores and user feedback
- Development velocity and quality metrics
- Team confidence and satisfaction scores
- Stakeholder engagement and support level

### Lagging Indicators (measure monthly)
- Onboarding drop-off rate (target: <30%)
- Support ticket volume from new users (target: -40%)
- Net Promoter Score for onboarding (target: 8.0+)
- Time-to-first-value (target: <24 hours)

### Learning Metrics (for future projects)
- Accuracy of initial estimates vs. actual effort
- Effectiveness of user research in predicting outcomes
- Quality of technical architecture decisions
- Team process and communication effectiveness

## Budget & Resource Allocation

### Team Time (estimated)
- **Sarah (PM)**: 40% allocation (60 hours/month) = $24,000
- **Mike (Tech Lead)**: 60% allocation (90 hours/month) = $36,000
- **Lisa (Designer)**: 80% allocation (120 hours/month) = $30,000
- **Emma (Researcher)**: 50% allocation (75 hours/month) = $18,000
- **Alex & Jordan (Devs)**: 50% each (150 hours/month total) = $30,000
- **Taylor (QA)**: 25% allocation (37 hours/month) = $9,000

**Total team cost**: $147,000 over 4 months

### External Costs
- User research incentives: $3,000
- Design tools and prototyping software: $2,000
- Testing and analytics tools: $1,500
- Contingency (10%): $8,000

**Total project budget**: $161,500 (within $120k target requires scope adjustment)

### Budget Optimization Options
1. Reduce external research scope (-$5k)
2. Use existing team tools where possible (-$2k)
3. Optimize team allocation in later phases (-$15k)
4. **Recommended approach**: Combination of all three = $139,500 total

## Integration with Broader Initiatives

### Related Projects
**Customer Success Platform** (Q3 2024): New onboarding should integrate with success tracking
**Mobile App Development** (Q4 2024): Onboarding patterns should be mobile-first
**Analytics Infrastructure** (Ongoing): Need proper event tracking for measurement

### Organizational Learning
**Design System Evolution**: New onboarding patterns contribute to company design system
**Research Methodology**: User research approach can be template for other teams
**Project Management**: Test new project management approaches for future use

## Contingency Planning

### Scope Reduction Options (if timeline pressures)
**Priority 1** (core experience):
- New user registration flow
- Essential product tour
- Basic progress tracking

**Priority 2** (enhanced experience):
- Advanced personalization
- Comprehensive help content
- Interactive tutorials

**Priority 3** (optimization):
- A/B testing framework
- Advanced analytics integration
- Automated user guidance

### Timeline Extension Options (if technical challenges)
**Option A**: Extend Phase 3 by 2 weeks, maintain July 31 launch
**Option B**: Soft launch in July, full feature set in August
**Option C**: Deliver core experience July 31, enhancements in Q3

## Success Definition & Project Closure

### How We'll Know We Succeeded
**Immediate success** (within 2 weeks of launch):
- New onboarding deployed without major issues
- User feedback trending positive
- Support ticket volume not increasing

**Short-term success** (within 3 months):
- Drop-off rate decreased by at least 15%
- Support tickets from new users decreased by 20%+
- User satisfaction scores improved

**Long-term success** (within 6 months):
- All primary success criteria met or exceeded
- Patterns and learnings applied to other product areas
- Team confident in future similar projects

### Project Closure Activities
- Results analysis and success criteria assessment
- Comprehensive retrospective with lessons learned
- Documentation handoff to ongoing maintenance team
- Celebration of team accomplishments and learning

## Connections & Knowledge Integration

**Related notes:**
- [[user-research-methodology]] - Research approaches for this project
- [[design-system-guidelines]] - How new patterns fit existing system
- [[technical-architecture-decisions]] - Backend integration considerations
- [[customer-success-metrics]] - How onboarding impacts broader success

**Learning repositories:**
- [[project-management-playbook]] - Update with lessons from this project
- [[user-testing-templates]] - Reusable research protocols
- [[launch-procedures]] - Deployment and rollout processes

**Future applications:**
- [[mobile-app-onboarding]] - Apply learnings to mobile context
- [[enterprise-onboarding]] - Different user segment considerations
- [[feature-adoption-optimization]] - Similar methodology for feature launches

## Reflection & Continuous Improvement

### What's New/Experimental in This Project
- First time using staged rollout approach
- New user research methodology with drop-off interviews
- Technical architecture pattern not used before
- Cross-functional team structure with embedded researcher

### Learning Objectives for Team
- **PM skills**: Practice balancing scope, timeline, and quality trade-offs
- **Design skills**: Develop expertise in onboarding experience patterns
- **Technical skills**: Learn new frontend frameworks and integration patterns
- **Research skills**: Master quantitative and qualitative research integration

### Success Factors to Monitor
- Team collaboration and communication effectiveness
- Stakeholder alignment and support throughout project
- User research accuracy in predicting real user behavior
- Technical architecture decisions and their long-term impact

**AI Assistant Note**: This project plan demonstrates comprehensive thinking that balances structure with flexibility. The clear phases, risk management, and success criteria enable effective AI assistance with project monitoring, risk assessment, and decision support throughout execution.

## How This Example Demonstrates Best Practices

### 1. Strategic Context
- Clear connection to business objectives
- Explicit success criteria and measurement plan
- Integration with broader organizational initiatives

### 2. Balanced Planning
- Structured phases with clear deliverables
- Risk identification and mitigation strategies
- Flexibility built in through contingency planning

### 3. Team-Centric Approach
- Clear roles and decision-making authority
- Communication rhythms that support collaboration
- Learning objectives that develop team capabilities

### 4. Continuous Learning Orientation
- Explicit learning metrics and reflection points
- Knowledge capture for future project improvement
- Integration with broader organizational knowledge

Ask your AI assistant: "How could I adapt this project planning structure for my own projects? What elements are most important for my context?"
`;

    // Create all example files
    await fs.writeFile(meetingExamplePath, meetingExampleContent, 'utf-8');
    await fs.writeFile(researchExamplePath, researchExampleContent, 'utf-8');
    await fs.writeFile(projectExamplePath, projectExampleContent, 'utf-8');
  }

  /**
   * Create template notes for common scenarios
   */
  async createTemplateNotes(): Promise<void> {
    // Template 1: Daily Journal
    const dailyTemplatePath = path.join(
      this.rootPath,
      'templates',
      'daily-journal-template.md'
    );
    const dailyTemplateContent = `# Daily Journal Template

Copy this template to create structured daily journal entries that work well with AI assistance.

## Date: [YYYY-MM-DD]

### Morning Intentions
**Today's main focus**: [One primary goal or objective]

**Key priorities** (top 3):
1. [Most important task or objective]
2. [Second priority]
3. [Third priority]

**Mindset/Energy level**: [How are you feeling? What's your energy like?]

### Work & Accomplishments
**Completed today**:
- [Task or accomplishment 1]
- [Task or accomplishment 2]
- [Task or accomplishment 3]

**Progress on ongoing projects**:
- **[[Project-Name-1]]**: [Brief update on status/progress]
- **[[Project-Name-2]]**: [Brief update on status/progress]

**Challenges encountered**:
- [Challenge 1 and how you addressed it]
- [Challenge 2 and how you addressed it]

### Learning & Growth
**New insights or learnings**:
- [Something you learned today - could be work, personal, or general]
- [Another insight or realization]

**Skills practiced or developed**:
- [Any skills you worked on improving]

**Interesting conversations or interactions**:
- [Notable discussions, meetings, or social interactions]

### Personal & Wellness
**Physical activity**: [Exercise, walks, movement]

**Nutrition highlights**: [Meals you enjoyed or nutritional choices]

**Social connections**: [Time spent with family, friends, colleagues]

**Relaxation/Fun activities**: [Hobbies, entertainment, downtime]

### Reflection & Gratitude
**What went well today**:
- [Something you're proud of or happy about]
- [Another positive from the day]

**What could have gone better**:
- [Something you'd do differently - without self-judgment]

**Grateful for**:
- [Three things you're thankful for today]
- [Can be big or small]
- [People, experiences, opportunities, simple pleasures]

### Tomorrow's Planning
**Top priorities for tomorrow**:
1. [Most important task]
2. [Second priority]
3. [Third priority]

**Prep needed for tomorrow**:
- [Any preparation, planning, or setup needed]

**Intentions for tomorrow**:
- [How do you want to approach tomorrow? What mindset or energy?]

### Connections & Links
**Related notes**: [[link-to-relevant-notes]]
**Projects mentioned**: [[project-notes]]
**People discussed**: [[person-or-meeting-notes]]

---

## How to Use This Template

### 1. Make It Your Own
- Remove sections that don't resonate
- Add sections that matter to you
- Adjust the level of detail to fit your style

### 2. AI Assistant Tips
- Ask for help identifying patterns across your daily entries
- Request insights about your productivity rhythms
- Get suggestions for improving work-life balance
- Have the AI help you track progress on goals

### 3. Consistency Tips
- Fill out at the same time each day (evening works well)
- Don't aim for perfection - brief entries are fine
- Focus on one or two sections if time is limited
- Review weekly to notice patterns and growth

### 4. Connection Building
- Link to project notes, meeting notes, and other relevant content
- Reference books you're reading, courses you're taking
- Connect insights to longer-term goals and learning

**AI Prompt to Try**: "Review my daily journal entries from this week. What patterns do you notice in my productivity, mood, or priorities? What insights can you share about my work-life balance?"
`;

    // Template 2: Meeting Notes
    const meetingTemplatePath = path.join(
      this.rootPath,
      'templates',
      'meeting-notes-template.md'
    );
    const meetingTemplateContent = `# Meeting Notes Template

Copy and customize this template for effective meeting documentation that enables great AI assistance.

## Meeting Information
**Meeting Title**: [Clear, descriptive title]
**Date**: [YYYY-MM-DD]
**Time**: [Start time - End time, including timezone if relevant]
**Meeting Type**: [e.g., Project planning, 1:1, All-hands, Client call, Brainstorming]
**Location**: [Physical location or video platform]

### Attendees
**Meeting Lead/Organizer**: [Name and role]
**Participants**:
- [Name] - [Role/Department] - [Relevant context if needed]
- [Name] - [Role/Department]
- [Name] - [Role/Department]

**Absent**: [Anyone who was supposed to attend but couldn't]

## Context & Purpose
**Meeting objective**: [What was this meeting trying to accomplish?]

**Background**: [Any relevant context that led to this meeting]

**Pre-meeting prep**: [Documents reviewed, decisions that needed to be made]

## Agenda & Discussion

### [Agenda Item 1 - Title]
**Time allocated**: [X minutes]
**Discussion summary**:
[Key points discussed, different perspectives shared, questions raised]

**Key insights**:
- [Important realizations or information that emerged]
- [Relevant quotes or specific statements if impactful]

### [Agenda Item 2 - Title]
**Time allocated**: [X minutes]
**Discussion summary**:
[Key points discussed, different perspectives shared, questions raised]

**Key insights**:
- [Important realizations or information that emerged]

### [Additional agenda items as needed]

## Decisions Made
1. **[Decision title/summary]**
   - **Rationale**: [Why this decision was made]
   - **Impact**: [Who/what this affects]
   - **Effective date**: [When this takes effect]

2. **[Decision title/summary]**
   - **Rationale**: [Why this decision was made]
   - **Impact**: [Who/what this affects]
   - **Effective date**: [When this takes effect]

## Action Items
- [ ] **[Action item description]** - **Owner**: [Name] - **Due**: [Date]
- [ ] **[Action item description]** - **Owner**: [Name] - **Due**: [Date]
- [ ] **[Action item description]** - **Owner**: [Name] - **Due**: [Date]

## Open Questions & Parking Lot
**Questions that need follow-up**:
- [Question 1 - who will investigate?]
- [Question 2 - who will investigate?]

**Topics for future discussion**:
- [Item that was mentioned but not fully discussed]
- [Related topic that came up but was deferred]

## Risks & Concerns
**Risks identified**:
- [Risk description] - **Mitigation**: [How we'll address this]
- [Risk description] - **Mitigation**: [How we'll address this]

**Concerns or disagreements**:
- [Any unresolved concerns or differing opinions]

## Next Steps & Follow-Up
**Immediate next steps** (next 1-3 days):
- [What needs to happen right away]

**Next meeting**: [Date, purpose, who should attend]

**Communication plan**: [How and when will progress be shared]

## Connections & Context
**Related projects**: [[project-name]]
**Previous meetings**: [[previous-meeting-date]]
**Relevant documents**: [[document-name]]
**Related people**: [[person-name]]

## Post-Meeting Reflection
**Meeting effectiveness**: [Rating 1-10 and brief explanation]

**What worked well**:
- [Aspects of the meeting that were productive]

**What could be improved**:
- [Suggestions for future meetings]

---

## Template Customization Guide

### For Different Meeting Types

**1:1 Meetings**:
- Add "Personal/Career topics" section
- Include "Feedback exchange" section
- Remove "Attendees" list (just note the other person)

**Project Meetings**:
- Add "Project status/milestones" section
- Include "Resource needs" section
- Add "Timeline updates" section

**Client Meetings**:
- Add "Client background/context" section
- Include "Billing/contract implications" section
- Add "Client satisfaction indicators" section

**Brainstorming Sessions**:
- Replace "Decisions Made" with "Ideas Generated"
- Add "Idea evaluation criteria" section
- Include "Ideas to explore further" section

### AI Assistant Integration

**Great prompts to try**:
- "Based on this meeting, what are the key risks I should monitor?"
- "What action items might I be missing from this discussion?"
- "How does this meeting relate to other recent meetings about [topic]?"
- "What questions should I be asking based on what was discussed?"
- "Help me identify any unclear action items that need more specificity"

### Quality Check Questions

Before finalizing your meeting notes, ask:
- Would someone who wasn't there understand what happened?
- Are action items specific enough to be actionable?
- Have I captured the "why" behind decisions, not just the "what"?
- Are there clear next steps and timelines?
- Have I linked this to relevant broader context?

**AI Prompt for Review**: "Review these meeting notes and help me identify any gaps or areas that could be clearer or more actionable."
`;

    // Template 3: Project Brief
    const projectTemplatePath = path.join(
      this.rootPath,
      'templates',
      'project-brief-template.md'
    );
    const projectTemplateContent = `# Project Brief Template

Use this template to create clear, comprehensive project briefs that align teams and enable effective AI assistance.

## Project Overview
**Project Name**: [Clear, memorable project name]
**Project Type**: [e.g., Feature development, Process improvement, Research initiative]
**Timeline**: [Start date] - [End date] ([X weeks/months])
**Status**: [Planning / In Progress / On Hold / Completed]

### One-Line Summary
[A single sentence that explains what this project accomplishes and why it matters]

## Problem Statement
**What problem are we solving?**
[Clear description of the current problem or opportunity]

**Who experiences this problem?**
[Target users, customers, or internal stakeholders affected]

**What's the impact of not solving this?**
[Cost of inaction - revenue, productivity, user experience, competitive position]

**Why now?**
[What makes this the right time to address this problem]

## Success Criteria
**Primary objectives** (must achieve):
1. [Measurable outcome 1]
2. [Measurable outcome 2]
3. [Measurable outcome 3]

**Secondary objectives** (would be nice):
- [Additional benefit 1]
- [Additional benefit 2]

**Success metrics**:
- [How we'll measure success - specific numbers/KPIs]
- [Timeline for measurement]

**Definition of done**:
[Clear criteria for when the project is complete]

## Scope & Approach

### In Scope
- [What's included in this project]
- [Specific features, activities, or deliverables]
- [User groups or use cases covered]

### Out of Scope
- [What's explicitly not included]
- [Future enhancements or related work]
- [Clarification of boundaries]

### Approach/Methodology
[High-level approach - agile, waterfall, design thinking, etc.]

## Context & Background

### Strategic Alignment
**How this supports company/team goals**:
- [Connection to OKRs, strategic initiatives, or team objectives]
- [Priority level and rationale]

**Related initiatives**:
- [[Related Project 1]] - [How they connect]
- [[Related Project 2]] - [How they connect]

### Prior Work
**What's been tried before**:
[Previous attempts to solve this problem and what we learned]

**Existing solutions**:
[Current workarounds or partial solutions in place]

## Team & Resources

### Team Structure
**Project Lead**: [Name] - [Role and responsibilities]
**Core Team**:
- [Name] - [Role] - [Specific responsibilities]
- [Name] - [Role] - [Specific responsibilities]
- [Name] - [Role] - [Specific responsibilities]

**Extended Team/Stakeholders**:
- [Name] - [Department] - [Involvement level]
- [Name] - [Department] - [Involvement level]

### Resource Requirements
**Time commitment**:
- [Team member]: [% allocation or hours per week]
- [Team member]: [% allocation or hours per week]

**Budget**:
- Personnel costs: [Estimate]
- External costs: [Tools, contractors, etc.]
- Total budget: [Amount]

**Dependencies**:
- [Other teams or projects we depend on]
- [External vendors or systems]
- [Key decisions that need to be made]

## Timeline & Milestones

### High-Level Timeline
**Phase 1: [Phase Name]** ([Dates])
- [Key activities and deliverables]

**Phase 2: [Phase Name]** ([Dates])
- [Key activities and deliverables]

**Phase 3: [Phase Name]** ([Dates])
- [Key activities and deliverables]

### Key Milestones
- **[Date]**: [Milestone name and criteria]
- **[Date]**: [Milestone name and criteria]
- **[Date]**: [Milestone name and criteria]

### Critical Path
[Most important sequence of activities that determine project timeline]

## Risks & Mitigation

### High Probability Risks
**[Risk description]**
- **Impact**: [High/Medium/Low]
- **Mitigation strategy**: [How we'll prevent or address this]
- **Owner**: [Who monitors this risk]

### Low Probability, High Impact Risks
**[Risk description]**
- **Impact**: [High/Medium/Low]
- **Contingency plan**: [What we'll do if this happens]
- **Early warning signs**: [How we'll detect this risk materializing]

### Assumptions
[Key assumptions the project depends on - things we believe to be true but aren't certain]

## Communication & Governance

### Communication Plan
**Team updates**: [Frequency and format - daily standups, weekly reports, etc.]
**Stakeholder updates**: [How and when stakeholders will be informed]
**Decision-making process**: [How decisions will be made and by whom]

### Review & Approval
**Milestone reviews**: [Who reviews progress at each milestone]
**Final approval**: [Who has authority to approve completion]
**Change management**: [How scope or timeline changes will be handled]

## Success Measurement

### Leading Indicators
[Early signals that the project is on track]
- [Metric 1]
- [Metric 2]

### Lagging Indicators
[Outcomes that confirm success]
- [Metric 1]
- [Metric 2]

### Review Schedule
- **Weekly**: [Quick progress check]
- **Milestone reviews**: [Comprehensive assessment]
- **Post-project review**: [Lessons learned and success analysis]

## Connections & Integration

### Related Notes
- [[Strategic Context]] - [How this fits broader strategy]
- [[User Research]] - [Relevant user insights]
- [[Technical Requirements]] - [Technical considerations]
- [[Market Analysis]] - [Competitive or market context]

### Knowledge Capture
- [[Project Learnings]] - [Where insights will be documented]
- [[Process Improvements]] - [How this informs future projects]
- [[Best Practices]] - [Reusable patterns or approaches]

---

## Template Adaptation Guide

### For Different Project Types

**Product Development**:
- Add "User stories/requirements" section
- Include "Technical architecture" section
- Add "Go-to-market considerations"

**Process Improvement**:
- Add "Current state analysis" section
- Include "Change management plan"
- Add "Training requirements"

**Research Projects**:
- Add "Research methodology" section
- Include "Data collection plan"
- Add "Analysis framework"

### AI Assistant Integration

**Helpful prompts for project planning**:
- "What risks am I not considering for this project?"
- "How could this project scope be simplified while maintaining impact?"
- "What questions should I be asking stakeholders about this project?"
- "Based on the timeline, what are the critical path dependencies I should monitor?"
- "How does this project relate to other initiatives in my notes?"

### Quality Checklist

**Before sharing your project brief**:
- [ ] Problem statement is clear and compelling
- [ ] Success criteria are specific and measurable
- [ ] Scope boundaries are well-defined
- [ ] Timeline is realistic given resources
- [ ] Risks have been thoughtfully considered
- [ ] Team roles and responsibilities are clear
- [ ] Communication plan is appropriate for stakeholders

**AI Review Prompt**: "Review this project brief and help me identify any gaps, unrealistic assumptions, or areas that need more clarity."
`;

    // Create all template files
    await fs.writeFile(dailyTemplatePath, dailyTemplateContent, 'utf-8');
    await fs.writeFile(meetingTemplatePath, meetingTemplateContent, 'utf-8');
    await fs.writeFile(projectTemplatePath, projectTemplateContent, 'utf-8');
  }
}
