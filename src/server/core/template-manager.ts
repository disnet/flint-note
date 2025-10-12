/**
 * Template Manager
 *
 * Manages vault templates including loading template definitions,
 * applying templates to new vaults, and listing available templates.
 */

import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { app } from 'electron';
import { logger } from '../../main/logger.js';
import type { NoteManager } from './notes.js';
import type { NoteTypeManager } from './note-types.js';
import type { MetadataFieldDefinition, MetadataSchema } from './metadata-schema.js';

/**
 * Template metadata
 */
export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  icon?: string;
  author?: string;
  version?: string;
  initialNote?: string; // Filename of note to open initially (e.g., "welcome.md")
}

/**
 * Note type definition in template
 */
export interface TemplateNoteType {
  name: string;
  purpose: string;
  agent_instructions: string[];
  metadata_schema?: {
    fields: MetadataFieldDefinition[];
  };
}

/**
 * Starter note in template
 */
export interface TemplateNote {
  filename: string; // e.g., "welcome.md"
  title: string; // Extracted from filename or frontmatter
  content: string;
  type: string; // Note type to create in (default: "note")
}

/**
 * Complete template definition
 */
export interface Template {
  metadata: TemplateMetadata;
  noteTypes: TemplateNoteType[];
  notes: TemplateNote[];
}

export class TemplateManager {
  private templatesDir: string;

  constructor(templatesDir?: string) {
    if (templatesDir) {
      // Explicit path provided (useful for testing)
      this.templatesDir = templatesDir;
    } else {
      // Check if we're in a test environment or if app is available
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

      if (isTestEnv) {
        // In test environment, try to find templates relative to this file
        // This file is in src/server/core, templates are in src/server/templates
        const currentDir = path.dirname(new URL(import.meta.url).pathname);
        this.templatesDir = path.join(currentDir, '../templates');
      } else if (!app || !app.isPackaged) {
        // Development: templates are in src/server/templates
        if (app && app.getAppPath) {
          this.templatesDir = path.join(app.getAppPath(), 'src/server/templates');
        } else {
          // Fallback: try relative to this file
          const currentDir = path.dirname(new URL(import.meta.url).pathname);
          this.templatesDir = path.join(currentDir, '../templates');
        }
      } else {
        // Production: templates are in extraResources, outside the asar
        // process.resourcesPath = /path/to/App.app/Contents/Resources
        this.templatesDir = path.join(process.resourcesPath, 'templates');
      }
    }
  }

  /**
   * List all available templates
   */
  async listTemplates(): Promise<TemplateMetadata[]> {
    try {
      const entries = await fs.readdir(this.templatesDir, {
        withFileTypes: true
      });
      const templateDirs = entries.filter(
        (entry) => entry.isDirectory() && !entry.name.startsWith('.')
      );

      const templates: TemplateMetadata[] = [];

      for (const dir of templateDirs) {
        try {
          const metadata = await this.loadTemplateMetadata(dir.name);
          templates.push(metadata);
        } catch (error) {
          logger.warn(`Failed to load template metadata for ${dir.name}:`, error);
          // Continue with other templates
        }
      }

      return templates;
    } catch (error) {
      logger.error('Failed to list templates:', error);
      return [];
    }
  }

  /**
   * Load metadata for a specific template
   */
  async loadTemplateMetadata(templateId: string): Promise<TemplateMetadata> {
    const templateDir = path.join(this.templatesDir, templateId);
    const metadataPath = path.join(templateDir, 'template.yml');

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata = yaml.load(content) as TemplateMetadata;

      // Ensure id matches directory name
      metadata.id = templateId;

      return metadata;
    } catch (error) {
      throw new Error(
        `Failed to load template metadata for ${templateId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Load complete template definition
   */
  async loadTemplate(templateId: string): Promise<Template> {
    const templateDir = path.join(this.templatesDir, templateId);

    // Load metadata
    const metadata = await this.loadTemplateMetadata(templateId);

    // Load note types
    const noteTypes = await this.loadNoteTypes(templateDir);

    // Load starter notes
    const notes = await this.loadNotes(templateDir);

    return {
      metadata,
      noteTypes,
      notes
    };
  }

  /**
   * Load note type definitions from template
   */
  private async loadNoteTypes(templateDir: string): Promise<TemplateNoteType[]> {
    const noteTypesDir = path.join(templateDir, 'note-types');
    const noteTypes: TemplateNoteType[] = [];

    try {
      const files = await fs.readdir(noteTypesDir);
      const ymlFiles = files.filter((f) => f.endsWith('.yml'));

      for (const file of ymlFiles) {
        try {
          const content = await fs.readFile(path.join(noteTypesDir, file), 'utf-8');
          const noteType = yaml.load(content) as TemplateNoteType;

          // Validate required fields
          if (!noteType.name || !noteType.purpose) {
            console.warn(
              `Skipping invalid note type definition in ${file}: missing name or purpose`
            );
            continue;
          }

          noteTypes.push(noteType);
        } catch (err) {
          logger.warn(`Failed to load note type from ${file}:`, err);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // note-types directory is optional - this is expected, no need to log
    }

    return noteTypes;
  }

  /**
   * Load starter notes from template
   */
  private async loadNotes(templateDir: string): Promise<TemplateNote[]> {
    const notesDir = path.join(templateDir, 'notes');
    const notes: TemplateNote[] = [];

    try {
      // Recursively read all markdown files from notes directory
      const allNotes = await this.loadNotesRecursive(notesDir, notesDir);
      notes.push(...allNotes);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // notes directory is optional - this is expected, no need to log
    }

    return notes;
  }

  /**
   * Recursively load notes from a directory
   */
  private async loadNotesRecursive(
    dir: string,
    baseDir: string
  ): Promise<TemplateNote[]> {
    const notes: TemplateNote[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Recursively load notes from subdirectories
          const subNotes = await this.loadNotesRecursive(fullPath, baseDir);
          notes.push(...subNotes);
        } else if (entry.name.endsWith('.md')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');

            // Extract title from first heading or use filename
            const title = this.extractTitle(content, entry.name);

            // Get relative path from notes directory for filename
            const relativePath = path.relative(baseDir, fullPath);

            // Extract note type from directory structure, frontmatter, or tags
            const type = this.extractNoteType(content, relativePath);

            notes.push({
              filename: relativePath,
              title,
              content,
              type
            });
          } catch (err) {
            logger.warn(`Failed to load note from ${entry.name}:`, err);
          }
        }
      }
    } catch (err) {
      logger.warn(`Failed to read directory ${dir}:`, err);
    }

    return notes;
  }

  /**
   * Extract note type from directory structure
   * Template notes must be organized in type-specific directories
   */
  private extractNoteType(_content: string, relativePath: string): string {
    // Extract note type from directory structure
    // e.g., "permanent/my-note.md" -> "permanent"
    const pathParts = relativePath.split(path.sep);
    if (pathParts.length > 1) {
      // The first directory name is the note type
      const dirName = pathParts[0];
      // Only use it if it's not a generic folder name
      if (dirName && dirName !== 'notes' && dirName !== 'examples') {
        return dirName;
      }
    }

    // Default to 'note' if not in a type-specific directory
    return 'note';
  }

  /**
   * Extract title from markdown content or filename
   */
  private extractTitle(content: string, filename: string): string {
    // Try to extract from first # heading
    const match = content.match(/^#\s+(.+)$/m);
    if (match) {
      return match[1].trim();
    }

    // Fall back to filename without extension
    return filename.replace(/\.md$/, '').replace(/-/g, ' ');
  }

  /**
   * Apply template to a vault
   */
  async applyTemplate(
    templateId: string,
    noteManager: NoteManager,
    noteTypeManager: NoteTypeManager
  ): Promise<{
    noteTypesCreated: number;
    notesCreated: number;
    errors: string[];
    initialNoteId?: string;
  }> {
    const template = await this.loadTemplate(templateId);
    const errors: string[] = [];
    let noteTypesCreated = 0;
    let notesCreated = 0;
    let initialNoteId: string | undefined;

    // Create note types
    for (const noteTypedef of template.noteTypes) {
      try {
        const metadataSchema: MetadataSchema = noteTypedef.metadata_schema || {
          fields: []
        };

        await noteTypeManager.createNoteType(
          noteTypedef.name,
          noteTypedef.purpose,
          noteTypedef.agent_instructions,
          metadataSchema
        );

        noteTypesCreated++;
      } catch (error) {
        const errorMsg = `Failed to create note type ${noteTypedef.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Create starter notes
    for (const note of template.notes) {
      try {
        const createdNote = await noteManager.createNote(
          note.type,
          note.title,
          note.content,
          {},
          false // Don't enforce required fields for template notes
        );

        notesCreated++;

        // Track the initial note if this matches the template's initialNote
        if (template.metadata.initialNote === note.filename) {
          initialNoteId = createdNote.id;
        }
      } catch (error) {
        const errorMsg = `Failed to create note ${note.title}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return {
      noteTypesCreated,
      notesCreated,
      errors,
      initialNoteId
    };
  }
}
