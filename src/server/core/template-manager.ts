/**
 * Template Manager
 *
 * Manages vault templates including loading template definitions,
 * applying templates to new vaults, and listing available templates.
 */

import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
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
  private foundTemplatesDir: string | null = null;

  constructor(templatesDir?: string) {
    if (templatesDir) {
      this.templatesDir = templatesDir;
    } else {
      // Try to find templates directory
      // In development/tests: src/server/templates
      // In production: built output location
      const possiblePaths = [
        path.join(__dirname, '../../templates'), // Production build
        path.join(__dirname, '../templates'), // Alternative build structure
        path.join(process.cwd(), 'src/server/templates') // Development/tests
      ];

      // Use the first path that exists
      this.templatesDir = possiblePaths[0]; // Default to production path
      // Note: We don't check if the directory exists here to avoid async constructor
      // The methods will handle missing directories gracefully
    }
  }

  /**
   * Find the templates directory by trying multiple possible locations
   * Memoizes the result for subsequent calls
   */
  private async findTemplatesDir(): Promise<string | null> {
    // Return memoized result if already found
    if (this.foundTemplatesDir) {
      return this.foundTemplatesDir;
    }

    const possiblePaths = [
      this.templatesDir, // Explicitly provided or default
      path.join(__dirname, '../../templates'), // Production build
      path.join(__dirname, '../templates'), // Alternative build structure
      path.join(process.cwd(), 'src/server/templates') // Development/tests
    ];

    for (const testPath of possiblePaths) {
      try {
        await fs.access(testPath);
        // Memoize the found directory
        this.foundTemplatesDir = testPath;
        this.templatesDir = testPath;
        return testPath;
      } catch {
        // Continue to next path
      }
    }

    return null;
  }

  /**
   * List all available templates
   */
  async listTemplates(): Promise<TemplateMetadata[]> {
    const templatesDir = await this.findTemplatesDir();

    if (!templatesDir) {
      console.error('Failed to locate templates directory');
      return [];
    }

    // Update the templates directory to the found one
    this.templatesDir = templatesDir;

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
          console.warn(`Failed to load template metadata for ${dir.name}:`, error);
          // Continue with other templates
        }
      }

      return templates;
    } catch (error) {
      console.error('Failed to list templates:', error);
      return [];
    }
  }

  /**
   * Load metadata for a specific template
   */
  async loadTemplateMetadata(templateId: string): Promise<TemplateMetadata> {
    // Ensure we have the correct templates directory
    const templatesDir = await this.findTemplatesDir();
    if (templatesDir) {
      this.templatesDir = templatesDir;
    }

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
    // Ensure we have the correct templates directory
    const templatesDir = await this.findTemplatesDir();
    if (templatesDir) {
      this.templatesDir = templatesDir;
    }

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
          console.warn(`Failed to load note type from ${file}:`, err);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // note-types directory is optional
      console.log('No note-types directory found in template');
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
      const files = await fs.readdir(notesDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));

      for (const file of mdFiles) {
        try {
          const content = await fs.readFile(path.join(notesDir, file), 'utf-8');

          // Extract title from first heading or use filename
          const title = this.extractTitle(content, file);

          // Determine note type (default to 'note')
          const type = 'note';

          notes.push({
            filename: file,
            title,
            content,
            type
          });
        } catch (err) {
          console.warn(`Failed to load note from ${file}:`, err);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // notes directory is optional
      console.log('No notes directory found in template');
    }

    return notes;
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
  }> {
    const template = await this.loadTemplate(templateId);
    const errors: string[] = [];
    let noteTypesCreated = 0;
    let notesCreated = 0;

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
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Create starter notes
    for (const note of template.notes) {
      try {
        await noteManager.createNote(
          note.type,
          note.title,
          note.content,
          {},
          false // Don't enforce required fields for template notes
        );

        notesCreated++;
      } catch (error) {
        const errorMsg = `Failed to create note ${note.title}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return {
      noteTypesCreated,
      notesCreated,
      errors
    };
  }
}
