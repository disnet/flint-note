/**
 * Note Type Manager
 *
 * Handles operations related to note types, including creation, management,
 * and metadata operations for different categories of notes.
 */

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import yaml from 'js-yaml';
import { Workspace } from './workspace.js';
import { MetadataSchemaParser, MetadataValidator } from './metadata-schema.js';
import type { MetadataSchema } from './metadata-schema.js';
import { SYSTEM_FIELDS } from './system-fields.js';
import type {
  DeletionAction,
  NoteTypeDeleteResult,
  DeletionValidation,
  BackupInfo,
  NoteTypeSuggestionConfig
} from '../types/index.js';
import {
  generateContentHash,
  createNoteTypeHashableContent
} from '../utils/content-hash.js';
import type { DatabaseManager, NoteTypeDescriptionRow } from '../database/schema.js';

/**
 * Type note definition stored as YAML in note body
 */
export interface TypeNoteDefinition {
  name: string;
  icon?: string;
  purpose: string;
  agent_instructions?: string[];
  metadata_schema?: MetadataSchema;
  suggestions_config?: NoteTypeSuggestionConfig;
  default_review_mode?: boolean;
  editor_chips?: string[];
}

export interface NoteTypeInfo {
  name: string;
  path: string;
  created: string;
}

export interface ParsedNoteTypeDescription {
  purpose: string;
  agentInstructions: string[];
  metadataSchema: string[];
  parsedMetadataSchema: MetadataSchema;
}

export interface NoteTypeDescription {
  name: string;
  path: string;
  description: string;
  parsed: ParsedNoteTypeDescription;
  metadataSchema: MetadataSchema;
  content_hash: string;
  icon?: string;
  suggestions_config?: import('../types/index.js').NoteTypeSuggestionConfig;
  default_review_mode?: boolean;
  editor_chips?: string[];
}

export interface NoteTypeListItem {
  name: string;
  path: string;
  purpose: string;
  agentInstructions: string[];
  hasDescription: boolean;
  noteCount: number;
  lastModified: string;
  icon?: string;
  /** True for system types like 'type' that users cannot create notes of */
  isSystemType?: boolean;
  /** The ID of the type note file (for file-based types) */
  noteId?: string;
  /** True if the type note is archived */
  archived?: boolean;
}

export interface NoteTypeUpdateRequest {
  description?: string;
}

export class NoteTypeManager {
  private workspace: Workspace;
  private dbManager: DatabaseManager | null = null;

  constructor(workspace: Workspace, dbManager?: DatabaseManager) {
    this.workspace = workspace;
    this.dbManager = dbManager || null;
  }

  /**
   * Write a file for note type descriptions
   * Note: Description files are written infrequently (only when creating/updating note types)
   */
  async #writeFileWithTracking(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Validate that metadata schema doesn't contain system fields
   * @param metadataSchema - The metadata schema to validate
   * @throws Error if system fields are found
   */
  #validateNoProtectedFieldsInSchema(metadataSchema: MetadataSchema | null): void {
    if (!metadataSchema || !metadataSchema.fields) return;

    const foundSystemFields: string[] = [];

    for (const field of metadataSchema.fields) {
      if (SYSTEM_FIELDS.has(field.name)) {
        foundSystemFields.push(field.name);
      }
    }

    if (foundSystemFields.length > 0) {
      const fieldList = foundSystemFields.join(', ');
      throw new Error(
        `Cannot define system field(s) in metadata schema: ${fieldList}. ` +
          `These fields are automatically managed by the system and cannot be redefined.`
      );
    }
  }

  /**
   * Get path to the type/ folder where type notes are stored
   */
  getTypeFolderPath(): string {
    return path.join(this.workspace.rootPath, 'type');
  }

  /**
   * Get path to a specific type note
   */
  getTypeNotePath(typeName: string): string {
    return path.join(this.getTypeFolderPath(), `${typeName}.md`);
  }

  /**
   * Check if a type note exists
   */
  async typeNoteExists(typeName: string): Promise<boolean> {
    try {
      await fs.access(this.getTypeNotePath(typeName));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse type note content to extract definition from YAML body
   */
  parseTypeNoteContent(content: string): {
    frontmatter: Record<string, unknown>;
    definition: TypeNoteDefinition | null;
  } {
    // Match frontmatter
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    let frontmatter: Record<string, unknown> = {};
    let body = content;

    if (match) {
      try {
        const parsed = yaml.load(match[1]);
        if (parsed && typeof parsed === 'object') {
          frontmatter = parsed as Record<string, unknown>;
        }
      } catch (error) {
        console.warn('Failed to parse type note frontmatter:', error);
      }
      body = match[2].trim();
    }

    // Parse YAML body as type definition
    let definition: TypeNoteDefinition | null = null;
    if (body) {
      try {
        const parsed = yaml.load(body);
        if (parsed && typeof parsed === 'object') {
          definition = parsed as TypeNoteDefinition;
        }
      } catch (error) {
        console.warn('Failed to parse type note body as YAML:', error);
      }
    }

    return { frontmatter, definition };
  }

  /**
   * Format type note content with frontmatter and YAML body
   */
  formatTypeNoteContent(
    typeName: string,
    definition: TypeNoteDefinition,
    noteId?: string,
    existingFrontmatter?: Record<string, unknown>
  ): string {
    const timestamp = new Date().toISOString();
    const id = noteId || 'n-' + crypto.randomBytes(4).toString('hex');

    // Build frontmatter
    const frontmatter: Record<string, unknown> = {
      flint_id: existingFrontmatter?.flint_id || id,
      flint_title: typeName,
      flint_filename: typeName,
      flint_type: 'type',
      flint_kind: 'type',
      flint_created: existingFrontmatter?.flint_created || timestamp,
      flint_updated: timestamp
    };

    // Serialize frontmatter
    const frontmatterYaml = yaml.dump(frontmatter, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });

    // Serialize definition body
    // Use lineWidth: -1 to prevent wrapping, as wrapped lines with colons
    // (e.g., "[link text](URL)") get incorrectly interpreted as YAML mappings
    const definitionYaml = yaml.dump(definition, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });

    return `---\n${frontmatterYaml}---\n${definitionYaml}`;
  }

  /**
   * Read and parse a type note from the type/ folder
   * Returns null if the type note doesn't exist
   */
  async readTypeNote(typeName: string): Promise<{
    definition: TypeNoteDefinition;
    frontmatter: Record<string, unknown>;
    path: string;
  } | null> {
    const typeNotePath = this.getTypeNotePath(typeName);

    try {
      const content = await fs.readFile(typeNotePath, 'utf-8');
      const { frontmatter, definition } = this.parseTypeNoteContent(content);

      if (!definition) {
        console.warn(`Type note ${typeName} has no valid definition`);
        return null;
      }

      return {
        definition,
        frontmatter,
        path: typeNotePath
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Ensure the type/ folder exists
   */
  async ensureTypeFolderExists(): Promise<void> {
    const typeFolderPath = this.getTypeFolderPath();
    try {
      await fs.access(typeFolderPath);
    } catch {
      await fs.mkdir(typeFolderPath, { recursive: true });
    }
  }

  /**
   * Create the meta-type (type/type.md) if it doesn't exist
   * This is the self-referential type that defines what types look like
   */
  async ensureMetaTypeExists(): Promise<void> {
    const metaTypePath = this.getTypeNotePath('type');

    try {
      await fs.access(metaTypePath);
      return; // Already exists
    } catch {
      // Create the meta-type
    }

    await this.ensureTypeFolderExists();

    const metaTypeDefinition: TypeNoteDefinition = {
      name: 'type',
      icon: '📋',
      purpose:
        'Defines the structure and behavior of note types in this vault. This is a system type that describes other types.',
      agent_instructions: [
        'Help users define clear, actionable type descriptions',
        'Suggest appropriate metadata fields for the use case',
        'Ensure type names follow naming conventions (lowercase, hyphens, no spaces)'
      ],
      metadata_schema: {
        fields: [
          {
            name: 'icon',
            type: 'string',
            description: 'Emoji icon for the type',
            required: false
          }
        ]
      },
      default_review_mode: false
    };

    const content = this.formatTypeNoteContent('type', metaTypeDefinition);
    await this.#writeFileWithTracking(metaTypePath, content);
  }

  /**
   * Create a new note type with description
   * Creates a type note file in the type/ folder with YAML body definition
   */
  async createNoteType(
    name: string,
    description: string,
    agentInstructions: string[] | null = null,
    metadataSchema: MetadataSchema | null = null,
    icon: string | null = null
  ): Promise<NoteTypeInfo> {
    try {
      // Validate note type name
      if (!this.workspace.isValidNoteTypeName(name)) {
        throw new Error(`Invalid note type name: ${name}`);
      }

      // Validate metadata schema doesn't contain protected fields
      this.#validateNoProtectedFieldsInSchema(metadataSchema);

      // Validate metadata schema structure (strict for new note types)
      if (metadataSchema) {
        const validation = MetadataValidator.validateSchema(metadataSchema);
        if (validation.errors.length > 0) {
          throw new Error(`Invalid metadata schema: ${validation.errors.join(', ')}`);
        }
      }

      // Ensure the type/ folder and meta-type exist
      await this.ensureMetaTypeExists();

      // Ensure the note type directory exists (for notes of this type)
      const typePath = await this.workspace.ensureNoteType(name);

      // Check if type note already exists
      if (await this.typeNoteExists(name)) {
        throw new Error(`Note type '${name}' already exists`);
      }

      // Prepare instructions and schema
      const instructions = agentInstructions || [
        'Ask clarifying questions to understand the context and purpose of this note',
        'Suggest relevant tags and connections to existing notes in the knowledge base',
        'Help organize content with clear headings and logical structure',
        'Identify and extract actionable items, deadlines, or follow-up tasks',
        'Recommend when this note might benefit from linking to other note types',
        'Offer to enhance content with additional context, examples, or details',
        'Suggest follow-up questions or areas that could be expanded upon',
        'Help maintain consistency with similar notes of this type'
      ];

      const schema = metadataSchema || { fields: [] };

      // Create type note definition
      const definition: TypeNoteDefinition = {
        name,
        purpose: description,
        agent_instructions: instructions,
        metadata_schema: schema,
        default_review_mode: false
      };

      if (icon) {
        definition.icon = icon;
      }

      // Create the type note file
      const content = this.formatTypeNoteContent(name, definition);
      const typeNotePath = this.getTypeNotePath(name);
      await this.#writeFileWithTracking(typeNotePath, content);

      // Also store in database for backward compatibility during transition
      if (this.dbManager) {
        const db = await this.dbManager.connect();

        // Generate unique ID for DB record
        const id = 'nt-' + crypto.randomBytes(4).toString('hex');
        const vaultId = this.workspace.rootPath;

        // Calculate content hash
        const descriptionContent = this.formatNoteTypeDescription(
          name,
          description,
          instructions,
          schema
        );
        const hashableContent = createNoteTypeHashableContent({
          description: descriptionContent,
          agent_instructions: instructions.join('\n'),
          metadata_schema: schema
        });
        const contentHash = generateContentHash(hashableContent);

        // Insert into database (ignore if already exists)
        await db.run(
          `INSERT OR IGNORE INTO note_type_descriptions
           (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash, icon)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            vaultId,
            name,
            description,
            JSON.stringify(instructions),
            JSON.stringify(schema),
            contentHash,
            icon
          ]
        );
      }

      return {
        name,
        path: typePath,
        created: new Date().toISOString()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create note type '${name}': ${errorMessage}`);
    }
  }

  /**
   * Format note type description in the standard format
   */
  formatNoteTypeDescription(
    name: string,
    description: string,
    agentInstructions: string[] | null = null,
    metadataSchema: MetadataSchema | null = null
  ): string {
    const formattedName = name.charAt(0).toUpperCase() + name.slice(1);

    let content = `# ${formattedName}\n\n`;
    content += `## Purpose\n${description}\n\n`;
    content += '## Agent Instructions\n';

    if (agentInstructions && agentInstructions.length > 0) {
      // Use custom agent instructions, filtering out empty strings
      const validInstructions = agentInstructions.filter(
        (instruction) => instruction && instruction.trim().length > 0
      );

      if (validInstructions.length > 0) {
        for (const instruction of validInstructions) {
          content += `- ${instruction}\n`;
        }
      } else {
        // All instructions were empty, use defaults
        content +=
          '- Ask clarifying questions to understand the context and purpose of this note\n';
        content +=
          '- Suggest relevant tags and connections to existing notes in the knowledge base\n';
        content += '- Help organize content with clear headings and logical structure\n';
        content +=
          '- Identify and extract actionable items, deadlines, or follow-up tasks\n';
        content +=
          '- Recommend when this note might benefit from linking to other note types\n';
        content +=
          '- Offer to enhance content with additional context, examples, or details\n';
        content += '- Suggest follow-up questions or areas that could be expanded upon\n';
        content += '- Help maintain consistency with similar notes of this type\n';
      }
    } else {
      // Use default agent instructions
      content +=
        '- Ask clarifying questions to understand the context and purpose of this note\n';
      content +=
        '- Suggest relevant tags and connections to existing notes in the knowledge base\n';
      content += '- Help organize content with clear headings and logical structure\n';
      content +=
        '- Identify and extract actionable items, deadlines, or follow-up tasks\n';
      content +=
        '- Recommend when this note might benefit from linking to other note types\n';
      content +=
        '- Offer to enhance content with additional context, examples, or details\n';
      content += '- Suggest follow-up questions or areas that could be expanded upon\n';
      content += '- Help maintain consistency with similar notes of this type\n';
    }
    content += '\n';

    if (metadataSchema && metadataSchema.fields.length > 0) {
      content += MetadataSchemaParser.generateSchemaSection(metadataSchema);
    } else {
      content += '## Metadata Schema\n';
      content += 'Expected frontmatter or metadata fields for this note type:\n';
      content += `- type: ${name}\n`;
      content += '- created: Creation timestamp\n';
      content += '- updated: Last modification timestamp\n';
      content += '- tags: Relevant tags for categorization\n';
    }

    return content;
  }

  /**
   * Get note type description and metadata
   * Reads from type note first, then falls back to DB, then legacy files
   */
  async getNoteTypeDescription(typeName: string): Promise<NoteTypeDescription> {
    try {
      const typePath = this.workspace.getNoteTypePath(typeName);

      // Check if note type directory exists (for notes of this type)
      try {
        await fs.access(typePath);
      } catch {
        // Type directory doesn't exist - check if it's a type note without a directory yet
        const typeNote = await this.readTypeNote(typeName);
        if (!typeNote) {
          throw new Error(`Note type '${typeName}' does not exist`);
        }
      }

      // 1. First try to read from type note file (type/{typeName}.md)
      const typeNote = await this.readTypeNote(typeName);
      if (typeNote) {
        const { definition } = typeNote;

        // Build parsed description from type note definition
        const instructions = definition.agent_instructions || [];
        const schema = definition.metadata_schema || { fields: [] };

        const description = this.formatNoteTypeDescription(
          typeName,
          definition.purpose,
          instructions,
          schema
        );

        const parsed = this.parseNoteTypeDescription(description);

        // Generate content hash for optimistic locking
        const hashableContent = createNoteTypeHashableContent({
          description,
          agent_instructions: instructions.join('\n'),
          metadata_schema: schema
        });
        const contentHash = generateContentHash(hashableContent);

        return {
          name: typeName,
          path: typePath,
          description,
          parsed,
          metadataSchema: schema,
          content_hash: contentHash,
          icon: definition.icon,
          suggestions_config: definition.suggestions_config,
          default_review_mode: definition.default_review_mode,
          editor_chips: definition.editor_chips
        };
      }

      // 2. Fall back to database
      if (this.dbManager) {
        const db = await this.dbManager.connect();
        const vaultId = this.workspace.rootPath;

        const row = await db.get<NoteTypeDescriptionRow>(
          'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
          [vaultId, typeName]
        );

        if (row) {
          // Found in database, reconstruct description
          const instructions = JSON.parse(row.agent_instructions || '[]') as string[];
          const schema = JSON.parse(
            row.metadata_schema || '{"fields":[]}'
          ) as MetadataSchema;

          const description = this.formatNoteTypeDescription(
            typeName,
            row.purpose || '',
            instructions,
            schema
          );

          const parsed = this.parseNoteTypeDescription(description);

          // Parse suggestions_config if present
          let suggestionsConfig;
          if (row.suggestions_config) {
            try {
              suggestionsConfig = JSON.parse(row.suggestions_config);
            } catch (error) {
              console.warn('Failed to parse suggestions_config:', error);
            }
          }

          // Parse editor_chips if present
          let editorChips: string[] | undefined;
          if (row.editor_chips) {
            try {
              editorChips = JSON.parse(row.editor_chips);
            } catch (error) {
              console.warn('Failed to parse editor_chips:', error);
            }
          }

          return {
            name: typeName,
            path: typePath,
            description,
            parsed,
            metadataSchema: schema,
            content_hash: row.content_hash || '',
            icon: row.icon || undefined,
            suggestions_config: suggestionsConfig,
            default_review_mode: row.default_review_mode === 1,
            editor_chips: editorChips
          };
        }
      }

      // 3. Fallback to legacy _description.md file reading
      const descriptionPath = path.join(typePath, '_description.md');
      let description = '';
      try {
        description = await fs.readFile(descriptionPath, 'utf-8');
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          description = this.workspace.getDefaultNoteTypeDescription(typeName);
        } else {
          throw error;
        }
      }

      const parsed = this.parseNoteTypeDescription(description);
      const metadataSchema = parsed.parsedMetadataSchema;

      // Generate content hash for optimistic locking
      const hashableContent = createNoteTypeHashableContent({
        description,
        agent_instructions: parsed.agentInstructions.join('\n'),
        metadata_schema: metadataSchema
      });
      const contentHash = generateContentHash(hashableContent);

      return {
        name: typeName,
        path: typePath,
        description,
        parsed,
        metadataSchema,
        content_hash: contentHash
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to get note type description for '${typeName}': ${errorMessage}`
      );
    }
  }

  /**
   * Parse note type description to extract structured information
   */
  parseNoteTypeDescription(content: string): ParsedNoteTypeDescription {
    const sections: ParsedNoteTypeDescription = {
      purpose: '',
      agentInstructions: [],
      metadataSchema: [],
      parsedMetadataSchema: MetadataSchemaParser.parseFromDescription(content)
    };

    const lines = content.split('\n');
    let currentSection: string | null = null;
    let sectionContent: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('## Purpose')) {
        if (currentSection) {
          this.addSectionContent(sections, currentSection, sectionContent);
        }
        currentSection = 'purpose';
        sectionContent = [];
      } else if (trimmed.startsWith('## Agent Instructions')) {
        if (currentSection) {
          this.addSectionContent(sections, currentSection, sectionContent);
        }
        currentSection = 'agentInstructions';
        sectionContent = [];
      } else if (trimmed.startsWith('## Metadata Schema')) {
        if (currentSection) {
          this.addSectionContent(sections, currentSection, sectionContent);
        }
        currentSection = 'metadataSchema';
        sectionContent = [];
      } else if (currentSection) {
        sectionContent.push(line);
      }
    }

    // Add final section
    if (currentSection) {
      this.addSectionContent(sections, currentSection, sectionContent);
    }

    return sections;
  }

  /**
   * Helper to add section content to parsed sections
   */
  addSectionContent(
    sections: ParsedNoteTypeDescription,
    sectionName: string,
    content: string[]
  ): void {
    const text = content.join('\n').trim();

    switch (sectionName) {
      case 'purpose':
        sections.purpose = text;
        break;
      case 'agentInstructions':
        sections.agentInstructions = content
          .filter((line) => line.trim().startsWith('-'))
          .map((line) => line.trim().substring(1).trim());
        break;
      case 'metadataSchema':
        sections.metadataSchema = content.filter((line) => line.trim().length > 0);
        break;
    }
  }

  /**
   * List all available note types
   * Reads from type notes first, then falls back to DB, then legacy files
   */
  async listNoteTypes(): Promise<NoteTypeListItem[]> {
    try {
      const workspaceRoot = this.workspace.rootPath;
      const noteTypeMap = new Map<string, NoteTypeListItem>();
      // Track all type notes found (including archived) so we don't add them from DB fallback
      const typeNotesFound = new Set<string>();

      // 1. First scan the type/ folder for type notes
      const typeFolderPath = this.getTypeFolderPath();
      try {
        const typeNoteEntries = await fs.readdir(typeFolderPath);
        for (const entry of typeNoteEntries) {
          if (entry.endsWith('.md') && !entry.startsWith('.')) {
            const typeName = entry.replace(/\.md$/, '');
            // Mark 'type' as a system type (users can't create notes of this type)
            const isSystemType = typeName === 'type';

            const typeNote = await this.readTypeNote(typeName);
            if (typeNote) {
              // Track that this type note exists (regardless of archived status)
              typeNotesFound.add(typeName);

              // Check archived status from frontmatter and database
              // Handle both boolean true and string 'true' for robustness
              const archivedValue = typeNote.frontmatter.flint_archived as unknown;
              let isArchived = archivedValue === true || archivedValue === 'true';

              // Also check database for archived status (handles batched file writes)
              const noteId = typeNote.frontmatter.flint_id as string | undefined;
              if (!isArchived && noteId && this.dbManager) {
                const db = await this.dbManager.connect();
                const noteRow = await db.get<{ archived: number }>(
                  'SELECT archived FROM notes WHERE id = ?',
                  [noteId]
                );
                if (noteRow?.archived === 1) {
                  isArchived = true;
                }
              }

              // Skip archived type notes
              if (isArchived) {
                continue;
              }

              const typePath = this.workspace.getNoteTypePath(typeName);
              let noteCount = 0;
              try {
                const typeEntries = await fs.readdir(typePath);
                noteCount = typeEntries.filter(
                  (file) =>
                    file.endsWith('.md') && !file.startsWith('.') && !file.startsWith('_')
                ).length;
              } catch {
                // Directory might not exist yet
              }

              noteTypeMap.set(typeName, {
                name: typeName,
                path: typePath,
                purpose: typeNote.definition.purpose || `Notes of type '${typeName}'`,
                agentInstructions: typeNote.definition.agent_instructions || [],
                hasDescription: true,
                noteCount,
                lastModified:
                  (typeNote.frontmatter.flint_updated as string) ||
                  new Date().toISOString(),
                icon: typeNote.definition.icon,
                isSystemType,
                noteId: typeNote.frontmatter.flint_id as string | undefined,
                archived: isArchived
              });
            }
          }
        }
      } catch {
        // type/ folder might not exist yet
      }

      // 2. Fall back to database for types not found as type notes
      if (this.dbManager) {
        const db = await this.dbManager.connect();
        const vaultId = this.workspace.rootPath;

        const rows = await db.all<NoteTypeDescriptionRow>(
          'SELECT * FROM note_type_descriptions WHERE vault_id = ?',
          [vaultId]
        );

        for (const row of rows) {
          // Skip if already found as type note (including archived ones)
          if (typeNotesFound.has(row.type_name)) continue;

          const instructions = JSON.parse(row.agent_instructions || '[]') as string[];

          noteTypeMap.set(row.type_name, {
            name: row.type_name,
            path: path.join(workspaceRoot, row.type_name),
            purpose: row.purpose || `Notes of type '${row.type_name}'`,
            agentInstructions: instructions,
            hasDescription: true,
            noteCount: 0, // Will be filled below
            lastModified: row.updated_at || row.created_at,
            icon: row.icon || undefined
          });
        }
      }

      // 3. Scan filesystem for note types and note counts
      const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules' &&
          entry.name !== 'type' // Skip the type/ folder itself
        ) {
          const typePath = path.join(workspaceRoot, entry.name);

          // Check if this is a valid note type (has notes)
          const typeEntries = await fs.readdir(typePath);
          const noteCount = typeEntries.filter(
            (file) =>
              file.endsWith('.md') && !file.startsWith('.') && !file.startsWith('_')
          ).length;

          const hasNotes = noteCount > 0;

          // Check if already in map
          let existing = noteTypeMap.get(entry.name);

          if (existing) {
            // Update note count from filesystem
            existing.noteCount = noteCount;
          } else if (hasNotes) {
            // Not in type notes or database - check for legacy _description.md
            const descriptionPath = path.join(typePath, '_description.md');
            let purpose = '';
            let agentInstructions: string[] = [];
            let hasDescriptionFile = false;

            try {
              const description = await fs.readFile(descriptionPath, 'utf-8');
              const parsed = this.parseNoteTypeDescription(description);
              purpose = parsed.purpose;
              agentInstructions = parsed.agentInstructions;
              hasDescriptionFile = true;
            } catch {
              // No description file
            }

            existing = {
              name: entry.name,
              path: typePath,
              purpose: purpose || `Notes of type '${entry.name}'`,
              agentInstructions,
              hasDescription: hasDescriptionFile,
              noteCount,
              lastModified: (await fs.stat(typePath)).mtime.toISOString()
            };

            noteTypeMap.set(entry.name, existing);
          }
        }
      }

      // Convert map to array and sort by name
      const noteTypes = Array.from(noteTypeMap.values());
      noteTypes.sort((a, b) => a.name.localeCompare(b.name));

      return noteTypes;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to list note types: ${errorMessage}`);
    }
  }

  /**
   * Update an existing note type description (legacy method)
   */
  async updateNoteTypeLegacy(
    typeName: string,
    updates: NoteTypeUpdateRequest
  ): Promise<NoteTypeDescription> {
    try {
      // Validate note type exists (throws if not found)
      await this.getNoteTypeDescription(typeName);

      // Update description if provided
      if (updates.description) {
        const descriptionPath = path.join(
          this.workspace.getNoteTypePath(typeName),
          '_description.md'
        );
        const newDescription = this.formatNoteTypeDescription(
          typeName,
          updates.description
        );
        await this.#writeFileWithTracking(descriptionPath, newDescription);
      }

      return await this.getNoteTypeDescription(typeName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update note type '${typeName}': ${errorMessage}`);
    }
  }

  /**
   * Delete a note type with advanced options
   */
  async deleteNoteType(
    typeName: string,
    action: DeletionAction = 'error',
    targetType?: string,
    confirm: boolean = false
  ): Promise<NoteTypeDeleteResult> {
    try {
      const config = this.workspace.getConfig();

      // Check if note type deletion is allowed
      if (!config?.deletion?.allow_note_type_deletion) {
        throw new Error('Note type deletion is disabled in configuration');
      }

      // Validate deletion
      const validation = await this.validateNoteTypeDeletion(
        typeName,
        action,
        targetType
      );
      if (!validation.can_delete) {
        throw new Error(`Cannot delete note type: ${validation.errors.join(', ')}`);
      }

      // Check confirmation requirement
      if (config?.deletion?.require_confirmation && !confirm) {
        throw new Error(
          `Note type deletion requires confirmation. Set confirm=true to proceed.`
        );
      }

      const typePath = this.workspace.getNoteTypePath(typeName);
      const notes = await this.getNotesInType(typeName);
      let backupPath: string | undefined;

      // Create backup if enabled
      if (config?.deletion?.create_backups && notes.length > 0) {
        const backup = await this.createNoteTypeBackup(typeName, notes);
        backupPath = backup.path;
      }

      // Execute the deletion action
      let migrationTarget: string | undefined;
      switch (action) {
        case 'error':
          if (notes.length > 0) {
            throw new Error(
              `Cannot delete note type '${typeName}': contains ${notes.length} notes`
            );
          }
          break;

        case 'migrate':
          if (!targetType) {
            throw new Error('Migration target type is required for migrate action');
          }
          migrationTarget = targetType;
          await this.migrateNotesToType(notes, targetType);
          break;

        case 'delete':
          // Check bulk delete limit
          if (notes.length > (config?.deletion?.max_bulk_delete || 10)) {
            throw new Error(
              `Cannot delete ${notes.length} notes: exceeds bulk delete limit of ${config?.deletion?.max_bulk_delete || 10}`
            );
          }
          await this.deleteNotesInType(notes);
          break;
      }

      // Remove the directory and all its contents
      await fs.rm(typePath, { recursive: true, force: true });

      // Remove the type note file if it exists
      const typeNotePath = this.getTypeNotePath(typeName);
      try {
        await fs.unlink(typeNotePath);
      } catch {
        // Type note might not exist
      }

      // Remove from database if available
      if (this.dbManager) {
        const db = await this.dbManager.connect();
        const vaultId = this.workspace.rootPath;

        await db.run(
          'DELETE FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
          [vaultId, typeName]
        );
      }

      return {
        name: typeName,
        deleted: true,
        timestamp: new Date().toISOString(),
        action,
        notes_affected: notes.length,
        backup_path: backupPath,
        migration_target: migrationTarget
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete note type '${typeName}': ${errorMessage}`);
    }
  }

  /**
   * Validate if a note type can be deleted
   */
  async validateNoteTypeDeletion(
    typeName: string,
    action: DeletionAction,
    targetType?: string
  ): Promise<DeletionValidation> {
    const validation: DeletionValidation = {
      can_delete: true,
      warnings: [],
      errors: []
    };

    try {
      const typePath = this.workspace.getNoteTypePath(typeName);

      // Check if note type exists (either in database or filesystem)
      let existsInDb = false;
      let existsInFilesystem = false;

      // Check database
      if (this.dbManager) {
        const db = await this.dbManager.connect();
        const vaultId = this.workspace.rootPath;
        const row = await db.get(
          'SELECT 1 FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
          [vaultId, typeName]
        );
        existsInDb = !!row;
      }

      // Check filesystem
      try {
        await fs.access(typePath);
        existsInFilesystem = true;
      } catch {
        existsInFilesystem = false;
      }

      if (!existsInDb && !existsInFilesystem) {
        validation.can_delete = false;
        validation.errors.push(`Note type '${typeName}' does not exist`);
        return validation;
      }

      // Get notes in this type
      const notes = await this.getNotesInType(typeName);
      validation.note_count = notes.length;
      validation.affected_notes = notes.map((note) => note.filename);

      // Validate based on action
      switch (action) {
        case 'error':
          if (notes.length > 0) {
            validation.can_delete = false;
            validation.errors.push(`Note type contains ${notes.length} notes`);
          }
          break;

        case 'migrate':
          if (!targetType) {
            validation.can_delete = false;
            validation.errors.push('Migration target type is required');
          } else {
            // Check if target type exists
            try {
              await this.getNoteTypeDescription(targetType);
            } catch {
              validation.can_delete = false;
              validation.errors.push(`Target type '${targetType}' does not exist`);
            }
          }
          break;

        case 'delete':
          if (notes.length > 0) {
            validation.warnings.push(`Will permanently delete ${notes.length} notes`);
          }
          break;
      }

      return validation;
    } catch (error) {
      validation.can_delete = false;
      validation.errors.push(
        `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return validation;
    }
  }

  /**
   * Get all notes in a specific note type
   */
  async getNotesInType(
    typeName: string
  ): Promise<Array<{ filename: string; path: string }>> {
    try {
      const typePath = this.workspace.getNoteTypePath(typeName);

      // Check if directory exists
      try {
        await fs.access(typePath);
      } catch {
        // Directory doesn't exist, return empty array
        return [];
      }

      const entries = await fs.readdir(typePath);
      const notes = entries
        .filter(
          (file) => file.endsWith('.md') && !file.startsWith('.') && !file.startsWith('_')
        )
        .map((filename) => ({
          filename,
          path: path.join(typePath, filename)
        }));

      return notes;
    } catch (error) {
      throw new Error(
        `Failed to get notes in type '${typeName}': ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a backup of all notes in a note type
   */
  async createNoteTypeBackup(
    typeName: string,
    notes: Array<{ filename: string; path: string }>
  ): Promise<BackupInfo> {
    try {
      const config = this.workspace.getConfig();
      const backupDir = path.resolve(
        this.workspace.rootPath,
        config?.deletion?.backup_path || '.flint-note/backups'
      );

      // Ensure backup directory exists
      await fs.mkdir(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const typeBackupDir = path.join(backupDir, `${timestamp}_${typeName}`);
      await fs.mkdir(typeBackupDir, { recursive: true });

      let totalSize = 0;
      const backedUpFiles: string[] = [];

      for (const note of notes) {
        const backupPath = path.join(typeBackupDir, note.filename);
        await fs.copyFile(note.path, backupPath);

        const stats = await fs.stat(backupPath);
        totalSize += stats.size;
        backedUpFiles.push(note.path);
      }

      // Create a manifest file
      const manifest = {
        type: typeName,
        timestamp: new Date().toISOString(),
        notes: notes.map((n) => n.filename),
        total_size: totalSize
      };

      await fs.writeFile(
        path.join(typeBackupDir, '_manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8'
      );

      return {
        path: typeBackupDir,
        timestamp: new Date().toISOString(),
        notes: backedUpFiles,
        size: totalSize
      };
    } catch (error) {
      throw new Error(
        `Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Migrate notes from one type to another
   */
  async migrateNotesToType(
    notes: Array<{ filename: string; path: string }>,
    targetType: string
  ): Promise<void> {
    try {
      const targetTypePath = this.workspace.getNoteTypePath(targetType);

      // Ensure target type directory exists
      await fs.mkdir(targetTypePath, { recursive: true });

      for (const note of notes) {
        // Read the note content
        const content = await fs.readFile(note.path, 'utf-8');

        // Update the type in frontmatter
        const updatedContent = this.updateNoteTypeInContent(content, targetType);

        // Write to new location
        const newPath = path.join(targetTypePath, note.filename);
        await this.#writeFileWithTracking(newPath, updatedContent);
      }
    } catch (error) {
      throw new Error(
        `Failed to migrate notes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete all notes in a note type
   */
  async deleteNotesInType(
    notes: Array<{ filename: string; path: string }>
  ): Promise<void> {
    try {
      for (const note of notes) {
        await fs.unlink(note.path);
      }
    } catch (error) {
      throw new Error(
        `Failed to delete notes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update the type field in a note's frontmatter
   */
  updateNoteTypeInContent(content: string, newType: string): string {
    // Simple implementation - in practice, this would use the YAML parser
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (match) {
      const frontmatter = match[1];
      const updatedFrontmatter = frontmatter.replace(/^type:\s*.*$/m, `type: ${newType}`);
      return content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);
    } else {
      // Add frontmatter if it doesn't exist
      return `---\ntype: ${newType}\n---\n\n${content}`;
    }
  }

  /**
   * Get metadata schema for a note type
   */
  async getMetadataSchema(typeName: string): Promise<MetadataSchema> {
    try {
      const _noteType = await this.getNoteTypeDescription(typeName);
      return _noteType.metadataSchema;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to get metadata schema for note type '${typeName}': ${errorMessage}`
      );
    }
  }

  /**
   * Update metadata schema for a note type
   */
  async updateMetadataSchema(typeName: string, schema: MetadataSchema): Promise<void> {
    try {
      const _noteType = await this.getNoteTypeDescription(typeName);
      this.#validateNoProtectedFieldsInSchema(schema);

      // Generate new description with updated schema
      const newDescription = this.formatNoteTypeDescription(
        typeName,
        _noteType.parsed.purpose,
        _noteType.parsed.agentInstructions,
        schema
      );

      // Update in database if available
      if (this.dbManager) {
        const db = await this.dbManager.connect();
        const vaultId = this.workspace.rootPath;

        // Calculate new content hash
        const hashableContent = createNoteTypeHashableContent({
          description: newDescription,
          agent_instructions: _noteType.parsed.agentInstructions.join('\n'),
          metadata_schema: schema
        });
        const contentHash = generateContentHash(hashableContent);

        await db.run(
          `UPDATE note_type_descriptions
           SET metadata_schema = ?, content_hash = ?, updated_at = CURRENT_TIMESTAMP
           WHERE vault_id = ? AND type_name = ?`,
          [JSON.stringify(schema), contentHash, vaultId, typeName]
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to update metadata schema for note type '${typeName}': ${errorMessage}`
      );
    }
  }

  /**
   * Update an existing note type
   * Updates type note file first, then falls back to DB for backward compatibility
   */
  async updateNoteType(
    typeName: string,
    updates: {
      description?: string;
      instructions?: string[];
      metadata_schema?: MetadataSchema;
      icon?: string;
    }
  ): Promise<NoteTypeDescription> {
    try {
      const noteType = await this.getNoteTypeDescription(typeName);

      const newDescription = updates.description ?? noteType.parsed.purpose;
      const newInstructions = updates.instructions ?? noteType.parsed.agentInstructions;
      const newSchema = updates.metadata_schema ?? noteType.metadataSchema;
      const newIcon = updates.icon ?? noteType.icon;

      // Only validate schema if it's explicitly provided (not reusing existing)
      if (updates.metadata_schema) {
        const validation = MetadataValidator.validateSchema(newSchema);
        if (validation.errors.length > 0) {
          throw new Error(`Invalid metadata schema: ${validation.errors.join(', ')}`);
        }

        this.#validateNoProtectedFieldsInSchema(newSchema);
      }

      // 1. Try to update type note first
      const existingTypeNote = await this.readTypeNote(typeName);
      if (existingTypeNote) {
        // Update the type note file
        const definition: TypeNoteDefinition = {
          name: typeName,
          purpose: newDescription,
          agent_instructions: newInstructions,
          metadata_schema: newSchema
        };

        if (newIcon) {
          definition.icon = newIcon;
        }

        // Preserve other fields from existing definition
        if (existingTypeNote.definition.suggestions_config) {
          definition.suggestions_config = existingTypeNote.definition.suggestions_config;
        }
        if (existingTypeNote.definition.default_review_mode !== undefined) {
          definition.default_review_mode =
            existingTypeNote.definition.default_review_mode;
        }
        if (existingTypeNote.definition.editor_chips) {
          definition.editor_chips = existingTypeNote.definition.editor_chips;
        }

        const content = this.formatTypeNoteContent(
          typeName,
          definition,
          undefined,
          existingTypeNote.frontmatter
        );
        await this.#writeFileWithTracking(this.getTypeNotePath(typeName), content);
      }

      const newContent = this.formatNoteTypeDescription(
        typeName,
        newDescription,
        newInstructions,
        newSchema
      );

      // 2. Also update in database for backward compatibility
      if (this.dbManager) {
        const db = await this.dbManager.connect();
        const vaultId = this.workspace.rootPath;

        // Calculate new content hash
        const hashableContent = createNoteTypeHashableContent({
          description: newContent,
          agent_instructions: newInstructions.join('\n'),
          metadata_schema: newSchema
        });
        const contentHash = generateContentHash(hashableContent);

        // Update with optimistic locking
        if (updates.icon !== undefined) {
          await db.run(
            `UPDATE note_type_descriptions
             SET purpose = ?, agent_instructions = ?, metadata_schema = ?,
                 content_hash = ?, icon = ?, updated_at = CURRENT_TIMESTAMP
             WHERE vault_id = ? AND type_name = ?`,
            [
              newDescription,
              JSON.stringify(newInstructions),
              JSON.stringify(newSchema),
              contentHash,
              updates.icon,
              vaultId,
              typeName
            ]
          );
        } else {
          await db.run(
            `UPDATE note_type_descriptions
             SET purpose = ?, agent_instructions = ?, metadata_schema = ?,
                 content_hash = ?, updated_at = CURRENT_TIMESTAMP
             WHERE vault_id = ? AND type_name = ?`,
            [
              newDescription,
              JSON.stringify(newInstructions),
              JSON.stringify(newSchema),
              contentHash,
              vaultId,
              typeName
            ]
          );
        }
      }

      return await this.getNoteTypeDescription(typeName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update note type '${typeName}': ${errorMessage}`);
    }
  }

  /**
   * Update the default review mode setting for a note type
   */
  async updateNoteTypeDefaultReviewMode(
    typeName: string,
    defaultReviewMode: boolean
  ): Promise<void> {
    try {
      // 1. Update type note file
      const typeNote = await this.readTypeNote(typeName);
      if (typeNote) {
        const { frontmatter, definition } = typeNote;
        const updatedDefinition: TypeNoteDefinition = {
          ...definition,
          default_review_mode: defaultReviewMode
        };
        const content = this.formatTypeNoteContent(
          typeName,
          updatedDefinition,
          undefined,
          frontmatter
        );
        const typeNotePath = this.getTypeNotePath(typeName);
        await this.#writeFileWithTracking(typeNotePath, content);
      }

      // 2. Also update database for backward compatibility
      if (this.dbManager) {
        const db = await this.dbManager.connect();
        const vaultId = this.workspace.rootPath;

        await db.run(
          `UPDATE note_type_descriptions
           SET default_review_mode = ?, updated_at = CURRENT_TIMESTAMP
           WHERE vault_id = ? AND type_name = ?`,
          [defaultReviewMode ? 1 : 0, vaultId, typeName]
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to update default review mode for note type '${typeName}': ${errorMessage}`
      );
    }
  }
}
