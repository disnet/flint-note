/**
 * Note Type Manager
 *
 * Handles operations related to note types, including creation, management,
 * and metadata operations for different categories of notes.
 */

import path from 'path';
import fs from 'fs/promises';
import { Workspace } from './workspace.js';
import { MetadataSchemaParser, MetadataValidator } from './metadata-schema.js';
import type { MetadataSchema } from './metadata-schema.js';
import type {
  DeletionAction,
  NoteTypeDeleteResult,
  DeletionValidation,
  BackupInfo
} from '../types/index.js';
import {
  generateContentHash,
  createNoteTypeHashableContent
} from '../utils/content-hash.js';

interface NoteTypeInfo {
  name: string;
  path: string;
  created: string;
}

interface ParsedNoteTypeDescription {
  purpose: string;
  agentInstructions: string[];
  metadataSchema: string[];
  parsedMetadataSchema: MetadataSchema;
}

interface NoteTypeDescription {
  name: string;
  path: string;
  description: string;
  parsed: ParsedNoteTypeDescription;
  metadataSchema: MetadataSchema;
  content_hash: string;
}

interface NoteTypeListItem {
  name: string;
  path: string;
  purpose: string;
  agentInstructions: string[];
  hasDescription: boolean;
  noteCount: number;
  lastModified: string;
}

interface NoteTypeUpdateRequest {
  description?: string;
}

export class NoteTypeManager {
  private workspace: Workspace;

  constructor(workspace: Workspace) {
    this.workspace = workspace;
  }

  /**
   * Validate that metadata schema doesn't contain protected fields
   * @param metadataSchema - The metadata schema to validate
   * @throws Error if protected fields are found
   */
  #validateNoProtectedFieldsInSchema(metadataSchema: MetadataSchema | null): void {
    if (!metadataSchema || !metadataSchema.fields) return;

    const protectedFields = new Set(['title', 'filename', 'created', 'updated']);
    const foundProtectedFields: string[] = [];

    for (const field of metadataSchema.fields) {
      if (protectedFields.has(field.name)) {
        foundProtectedFields.push(field.name);
      }
    }

    if (foundProtectedFields.length > 0) {
      const fieldList = foundProtectedFields.join(', ');
      throw new Error(
        `Cannot define protected field(s) in metadata schema: ${fieldList}. ` +
          `These fields are automatically managed by the system and cannot be redefined.`
      );
    }
  }

  /**
   * Create a new note type with description
   */
  async createNoteType(
    name: string,
    description: string,
    agentInstructions: string[] | null = null,
    metadataSchema: MetadataSchema | null = null
  ): Promise<NoteTypeInfo> {
    try {
      // Validate note type name
      if (!this.workspace.isValidNoteTypeName(name)) {
        throw new Error(`Invalid note type name: ${name}`);
      }

      // Validate metadata schema doesn't contain protected fields
      this.#validateNoProtectedFieldsInSchema(metadataSchema);

      // Ensure the note type directory exists
      const typePath = await this.workspace.ensureNoteType(name);

      // Create the description file in the note type directory
      const descriptionPath = path.join(typePath, '_description.md');
      const descriptionContent = this.formatNoteTypeDescription(
        name,
        description,
        agentInstructions,
        metadataSchema
      );
      await fs.writeFile(descriptionPath, descriptionContent, 'utf-8');

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
        instruction => instruction && instruction.trim().length > 0
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
   */
  async getNoteTypeDescription(typeName: string): Promise<NoteTypeDescription> {
    try {
      const typePath = this.workspace.getNoteTypePath(typeName);
      const descriptionPath = path.join(typePath, '_description.md');

      // Check if note type exists
      try {
        await fs.access(typePath);
      } catch {
        throw new Error(`Note type '${typeName}' does not exist`);
      }

      // Read description file
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
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.trim().substring(1).trim());
        break;
      case 'metadataSchema':
        sections.metadataSchema = content.filter(line => line.trim().length > 0);
        break;
    }
  }

  /**
   * List all available note types
   */
  async listNoteTypes(): Promise<NoteTypeListItem[]> {
    try {
      const workspaceRoot = this.workspace.rootPath;
      const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });

      const noteTypes: NoteTypeListItem[] = [];

      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
        ) {
          const typePath = path.join(workspaceRoot, entry.name);
          const descriptionPath = path.join(typePath, '_description.md');

          // Check if this is a valid note type (has notes or description)
          const typeEntries = await fs.readdir(typePath);
          const hasNotes = typeEntries.some(
            file => file.endsWith('.md') && !file.startsWith('.') && !file.startsWith('_')
          );

          // Check if description exists in note type directory
          let hasDescription = false;
          try {
            await fs.access(descriptionPath);
            hasDescription = true;
          } catch {
            hasDescription = false;
          }

          if (hasNotes || hasDescription) {
            // Get basic info about the note type
            let purpose = '';
            let noteCount = 0;

            let agentInstructions: string[] = [];

            try {
              if (hasDescription) {
                const description = await fs.readFile(descriptionPath, 'utf-8');
                const parsed = this.parseNoteTypeDescription(description);
                purpose = parsed.purpose;
                agentInstructions = parsed.agentInstructions;
              }

              noteCount = typeEntries.filter(
                file =>
                  file.endsWith('.md') && !file.startsWith('_') && !file.startsWith('.')
              ).length;
            } catch {
              // Ignore errors for individual entries
            }

            noteTypes.push({
              name: entry.name,
              path: typePath,
              purpose: purpose || `Notes of type '${entry.name}'`,
              agentInstructions,
              hasDescription,
              noteCount,
              lastModified: (await fs.stat(typePath)).mtime.toISOString()
            });
          }
        }
      }

      // Sort by name
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
      const _noteType = await this.getNoteTypeDescription(typeName);

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
        await fs.writeFile(descriptionPath, newDescription, 'utf-8');
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

      // Check if note type exists
      try {
        await fs.access(typePath);
      } catch {
        validation.can_delete = false;
        validation.errors.push(`Note type '${typeName}' does not exist`);
        return validation;
      }

      // Get notes in this type
      const notes = await this.getNotesInType(typeName);
      validation.note_count = notes.length;
      validation.affected_notes = notes.map(note => note.filename);

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
      const entries = await fs.readdir(typePath);
      const notes = entries
        .filter(
          file => file.endsWith('.md') && !file.startsWith('.') && !file.startsWith('_')
        )
        .map(filename => ({
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
        notes: notes.map(n => n.filename),
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
        await fs.writeFile(newPath, updatedContent, 'utf-8');
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

      // Write updated description
      const descriptionPath = path.join(
        this.workspace.getNoteTypePath(typeName),
        '_description.md'
      );
      await fs.writeFile(descriptionPath, newDescription, 'utf-8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to update metadata schema for note type '${typeName}': ${errorMessage}`
      );
    }
  }

  /**
   * Update an existing note type
   */
  async updateNoteType(
    typeName: string,
    updates: {
      description?: string;
      instructions?: string[];
      metadata_schema?: MetadataSchema;
    }
  ): Promise<NoteTypeDescription> {
    try {
      const noteType = await this.getNoteTypeDescription(typeName);

      const newDescription = updates.description ?? noteType.parsed.purpose;
      const newInstructions = updates.instructions ?? noteType.parsed.agentInstructions;
      const newSchema = updates.metadata_schema ?? noteType.metadataSchema;

      const validation = MetadataValidator.validateSchema(newSchema);
      if (validation.errors.length > 0) {
        throw new Error(`Invalid metadata schema: ${validation.errors.join(', ')}`);
      }

      this.#validateNoProtectedFieldsInSchema(newSchema);

      const newContent = this.formatNoteTypeDescription(
        typeName,
        newDescription,
        newInstructions,
        newSchema
      );

      const descriptionPath = path.join(
        this.workspace.getNoteTypePath(typeName),
        '_description.md'
      );
      await fs.writeFile(descriptionPath, newContent, 'utf-8');

      return await this.getNoteTypeDescription(typeName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update note type '${typeName}': ${errorMessage}`);
    }
  }
}
