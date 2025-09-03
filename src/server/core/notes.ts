/**
 * Note Manager
 *
 * Handles CRUD operations for individual notes, including creation,
 * reading, updating, deletion, and metadata management.
 */

import path from 'path';
import fs from 'fs/promises';
import { Workspace } from './workspace.js';
import { NoteTypeManager } from './note-types.js';

import { HybridSearchManager } from '../database/search-manager.js';
import { MetadataValidator } from './metadata-schema.js';
import type { ValidationResult } from './metadata-schema.js';
import { parseFrontmatter, parseNoteContent } from '../utils/yaml-parser.js';
import {
  generateContentHash,
  validateContentHash,
  MissingContentHashError
} from '../utils/content-hash.js';
import type {
  NoteLink,
  NoteMetadata,
  FlintNoteError,
  DeletionValidation,
  BackupInfo,
  WikiLink
} from '../types/index.js';
import { WikilinkParser } from './wikilink-parser.js';
import { LinkExtractor } from './link-extractor.js';
import { HierarchyManager } from './hierarchy.js';
import { generateNoteIdFromIdentifier } from '../utils/note-linking.js';

interface ParsedNote {
  metadata: NoteMetadata;
  content: string;
}

export interface NoteInfo {
  id: string;
  type: string;
  title: string;
  filename: string;
  path: string;
  created: string;
}

export interface Note {
  [key: string]: unknown;
  id: string;
  type: string;
  filename: string;
  path: string;
  title: string;
  content: string;
  content_hash: string;
  metadata: NoteMetadata;
  created: string;
  modified: string;
  updated: string;
  size: number;
}

export interface UpdateResult {
  id: string;
  updated: boolean;
  timestamp: string;
}

export interface DeleteNoteResult {
  id: string;
  deleted: boolean;
  timestamp: string;
  backup_path?: string;
  warnings?: string[];
}

export interface MoveNoteResult {
  success: boolean;
  old_id: string;
  new_id: string;
  old_type: string;
  new_type: string;
  filename: string;
  title: string;
  timestamp: string;
  links_updated?: number;
  notes_with_updated_links?: number;
}

export interface NoteListItem {
  id: string;
  type: string;
  filename: string;
  title: string;
  created: string;
  modified: string;
  size: number;
  tags: string[];
  path: string;
}

interface ParsedIdentifier {
  typeName: string;
  filename: string;
  notePath: string;
}

export class NoteManager {
  #workspace: Workspace;
  #noteTypeManager: NoteTypeManager;
  #hierarchyManager?: HierarchyManager;

  #hybridSearchManager?: HybridSearchManager;

  constructor(workspace: Workspace, hybridSearchManager?: HybridSearchManager) {
    this.#workspace = workspace;
    this.#noteTypeManager = new NoteTypeManager(workspace);

    this.#hybridSearchManager = hybridSearchManager;

    // Initialize hierarchy manager if we have a database connection
    if (hybridSearchManager) {
      this.#initializeHierarchyManager(hybridSearchManager);
    }
  }

  /**
   * Initialize hierarchy manager asynchronously
   */
  async #initializeHierarchyManager(
    hybridSearchManager: HybridSearchManager
  ): Promise<void> {
    const db = await hybridSearchManager.getDatabaseConnection();
    this.#hierarchyManager = new HierarchyManager(db);
  }

  /**
   * Sync subnotes from frontmatter to hierarchy database
   */
  async #syncSubnotesToHierarchy(
    noteIdentifier: string,
    subnotes: string[]
  ): Promise<void> {
    if (!this.#hierarchyManager || !this.#hybridSearchManager) return;

    // Get database connection if hierarchy manager isn't initialized
    if (!this.#hierarchyManager) {
      await this.#initializeHierarchyManager(this.#hybridSearchManager);
      if (!this.#hierarchyManager) return;
    }

    const noteId = generateNoteIdFromIdentifier(noteIdentifier);

    // Get current children from database
    const currentChildren = await this.#hierarchyManager.getChildren(noteId);
    const currentChildIds = currentChildren.map((child) => child.child_id);

    // Convert subnote identifiers to IDs
    const desiredChildIds = subnotes.map((identifier) =>
      generateNoteIdFromIdentifier(identifier)
    );

    // Find children to add
    const toAdd = desiredChildIds.filter((childId) => !currentChildIds.includes(childId));

    // Find children to remove
    const toRemove = currentChildIds.filter(
      (childId) => !desiredChildIds.includes(childId)
    );

    // Remove children no longer in frontmatter
    for (const childId of toRemove) {
      await this.#hierarchyManager.removeSubnote(noteId, childId);
    }

    // Add new children from frontmatter
    for (let i = 0; i < toAdd.length; i++) {
      const childId = toAdd[i];
      const position = desiredChildIds.indexOf(childId);
      await this.#hierarchyManager.addSubnote(noteId, childId, position);
    }

    // Reorder existing children to match frontmatter order
    if (desiredChildIds.length > 0) {
      await this.#hierarchyManager.reorderSubnotes(noteId, desiredChildIds);
    }
  }

  /**
   * Sync subnotes from hierarchy database to frontmatter
   * Currently unused but kept for future frontmatter synchronization features
   */
  // async #syncHierarchyToSubnotes(noteIdentifier: string): Promise<string[]> {
  //   if (!this.#hierarchyManager || !this.#hybridSearchManager) return [];

  //   // Get database connection if hierarchy manager isn't initialized
  //   if (!this.#hierarchyManager) {
  //     await this.#initializeHierarchyManager(this.#hybridSearchManager);
  //     if (!this.#hierarchyManager) return [];
  //   }

  //   const noteId = generateNoteIdFromIdentifier(noteIdentifier);
  //   const children = await this.#hierarchyManager.getChildren(noteId);

  //   // Convert child IDs back to identifiers
  //   const subnotes: string[] = [];
  //   const db = await this.#hybridSearchManager.getDatabaseConnection();

  //   for (const child of children) {
  //     const note = await db.get<{ title: string; type: string }>(
  //       'SELECT title, type FROM notes WHERE id = ?',
  //       [child.child_id]
  //     );
  //     if (note) {
  //       subnotes.push(`${note.type}/${note.title}`);
  //     }
  //   }

  //   return subnotes;
  // }

  /**
   * Clean up hierarchy relationships when a note is deleted
   */
  async #cleanupHierarchyOnDelete(noteIdentifier: string): Promise<void> {
    if (!this.#hierarchyManager || !this.#hybridSearchManager) return;

    // Get database connection if hierarchy manager isn't initialized
    if (!this.#hierarchyManager) {
      await this.#initializeHierarchyManager(this.#hybridSearchManager);
      if (!this.#hierarchyManager) return;
    }

    const noteId = generateNoteIdFromIdentifier(noteIdentifier);

    try {
      // Remove all parent-child relationships where this note is the parent
      const children = await this.#hierarchyManager.getChildren(noteId);
      for (const child of children) {
        await this.#hierarchyManager.removeSubnote(noteId, child.child_id);
      }

      // Remove all parent-child relationships where this note is the child
      const parents = await this.#hierarchyManager.getParents(noteId);
      for (const parent of parents) {
        await this.#hierarchyManager.removeSubnote(parent.parent_id, noteId);
      }
    } catch (error) {
      // Don't fail deletion if hierarchy cleanup fails, but log it
      console.warn(
        `Failed to clean up hierarchy for deleted note ${noteIdentifier}:`,
        error
      );
    }
  }

  /**
   * Create a new note of the specified type
   */
  async createNote(
    typeName: string,
    title: string,
    content: string,
    metadata: Record<string, unknown> = {},
    enforceRequiredFields: boolean = true
  ): Promise<NoteInfo> {
    try {
      // Validate inputs
      if (!title || title.trim().length === 0) {
        throw new Error('Note title is required and cannot be empty');
      }

      // Trim the title for consistent handling
      const trimmedTitle = title.trim();

      // Validate and ensure note type exists
      if (!this.#workspace.isValidNoteTypeName(typeName)) {
        throw new Error(`Invalid note type name: ${typeName}`);
      }

      const typePath = await this.#workspace.ensureNoteType(typeName);

      // Generate filename from title and ensure uniqueness
      const baseFilename = this.generateFilename(trimmedTitle);
      const filename = await this.generateUniqueFilename(typePath, baseFilename);
      const notePath = path.join(typePath, filename);

      // Prepare metadata with title for validation
      const metadataWithTitle = {
        title: trimmedTitle,
        ...metadata
      };

      // Validate metadata against schema
      const validationResult = await this.validateMetadata(
        typeName,
        metadataWithTitle,
        enforceRequiredFields
      );
      if (!validationResult.valid) {
        throw new Error(
          `Metadata validation failed: ${validationResult.errors.map((e) => e.message).join(', ')}`
        );
      }

      // Prepare note content with metadata
      const noteContent = await this.formatNoteContent(
        trimmedTitle,
        content,
        typeName,
        metadata
      );

      // Write the note file
      await fs.writeFile(notePath, noteContent, 'utf-8');

      // Update search index
      await this.updateSearchIndex(notePath, noteContent);

      // Sync hierarchy if subnotes are specified in metadata
      const noteId = this.generateNoteId(typeName, filename);
      if (metadata.subnotes && Array.isArray(metadata.subnotes)) {
        await this.#syncSubnotesToHierarchy(noteId, metadata.subnotes as string[]);
      }

      return {
        id: noteId,
        type: typeName,
        title: trimmedTitle,
        filename,
        path: notePath,
        created: new Date().toISOString()
      };
    } catch (error) {
      if (error instanceof Error) {
        // Preserve custom error properties if they exist
        const flintError = error as FlintNoteError;
        if (flintError.code === 'NOTE_ALREADY_EXISTS') {
          // Re-throw the original error for duplicate notes to preserve error details
          throw error;
        }
        // For other errors, wrap with context
        throw new Error(`Failed to create note '${title}': ${error.message}`);
      }
      throw new Error(`Failed to create note '${title}': Unknown error`);
    }
  }

  /**
   * Generate a filesystem-safe filename from a title
   */
  generateFilename(title: string): string {
    // Remove or replace problematic characters
    let filename = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    // Ensure filename isn't empty
    if (!filename) {
      filename = 'untitled';
    }

    // Ensure it doesn't exceed filesystem limits (considering full path length)
    if (filename.length > 100) {
      filename = filename.substring(0, 100);
    }

    return `${filename}.md`;
  }

  /**
   * Generate a unique filename, handling conflicts by appending numbers
   */
  async generateUniqueFilename(typePath: string, baseFilename: string): Promise<string> {
    let filename = baseFilename;
    let counter = 1;

    // First, check if the base filename is available
    const basePath = path.join(typePath, filename);
    try {
      await fs.access(basePath);
      // File exists, need to generate a unique name
    } catch (error) {
      // File doesn't exist, base filename is available
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return filename;
      } else {
        throw error; // Re-throw if it's not a "file not found" error
      }
    }

    // Generate unique filename by appending numbers
    const baseName = baseFilename.replace(/\.md$/, ''); // Remove .md extension
    do {
      filename = `${baseName}-${counter}.md`;
      const filePath = path.join(typePath, filename);
      try {
        await fs.access(filePath);
        // File exists, try next number
        counter++;
      } catch (error) {
        // File doesn't exist, filename is available
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return filename;
        } else {
          throw error; // Re-throw if it's not a "file not found" error
        }
      }
    } while (counter < 1000); // Safety limit to prevent infinite loops

    throw new Error(`Could not generate unique filename after ${counter} attempts`);
  }

  /**
   * Generate a unique note ID
   */
  generateNoteId(typeName: string, filename: string): string {
    // Remove .md extension from filename for the ID
    const baseFilename = filename.replace(/\.md$/, '');
    return `${typeName}/${baseFilename}`;
  }

  /**
   * Format note content with metadata frontmatter
   */
  async formatNoteContent(
    title: string,
    content: string,
    typeName: string,
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const filename = this.generateFilename(title);
    const baseFilename = path.basename(filename, '.md');

    let formattedContent = '---\n';
    formattedContent += `title: "${title}"\n`;
    formattedContent += `filename: "${baseFilename}"\n`;
    formattedContent += `type: ${typeName}\n`;
    formattedContent += `created: ${timestamp}\n`;
    formattedContent += `updated: ${timestamp}\n`;

    // Add custom metadata fields
    for (const [key, value] of Object.entries(metadata)) {
      if (
        key !== 'title' &&
        key !== 'filename' &&
        key !== 'type' &&
        key !== 'created' &&
        key !== 'updated'
      ) {
        if (Array.isArray(value)) {
          const escapedArray = value.map((v) => {
            if (typeof v === 'string') {
              const escapedValue = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
              return `"${escapedValue}"`;
            }
            return v;
          });
          formattedContent += `${key}: [${escapedArray.join(', ')}]\n`;
        } else if (typeof value === 'string') {
          // Escape quotes and backslashes in string values
          const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          formattedContent += `${key}: "${escapedValue}"\n`;
        } else {
          formattedContent += `${key}: ${value}\n`;
        }
      }
    }

    // Add default tags if not specified
    if (!metadata.tags) {
      formattedContent += 'tags: []\n';
    }

    formattedContent += '---\n\n';

    formattedContent += content;

    return formattedContent;
  }

  /**
   * Get a specific note by identifier
   */
  async getNote(identifier: string): Promise<Note | null> {
    try {
      const { typeName, filename, notePath } = this.parseNoteIdentifier(identifier);

      // Check if note exists
      try {
        await fs.access(notePath);
      } catch {
        return null;
      }

      // Read note content
      const content = await fs.readFile(notePath, 'utf-8');
      const stats = await fs.stat(notePath);

      // Parse frontmatter and content
      const parsed = this.parseNoteContent(content);

      // Generate content hash for optimistic locking
      const contentHash = generateContentHash(parsed.content);

      return {
        id: identifier,
        type: typeName,
        filename,
        path: notePath,
        title: parsed.metadata.title || this.extractTitleFromFilename(filename),
        content: parsed.content,
        content_hash: contentHash,
        metadata: parsed.metadata,
        created: parsed.metadata.created || stats.birthtime.toISOString(),
        modified: parsed.metadata.updated || stats.mtime.toISOString(),
        updated: parsed.metadata.updated || stats.mtime.toISOString(),
        size: stats.size
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get note '${identifier}': ${errorMessage}`);
    }
  }

  /**
   * Get multiple notes by their identifiers
   */
  async getNotes(
    identifiers: string[]
  ): Promise<Array<{ success: boolean; note?: Note; error?: string }>> {
    const results = await Promise.allSettled(
      identifiers.map(async (identifier) => {
        try {
          const note = await this.getNote(identifier);
          if (!note) {
            throw new Error(`Note not found: ${identifier}`);
          }
          return { success: true, note };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return { success: false, error: errorMessage };
        }
      })
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: `Failed to retrieve note ${identifiers[index]}: ${result.reason}`
        };
      }
    });
  }

  /**
   * Get a note by file path
   */
  async getNoteByPath(filePath: string): Promise<Note | null> {
    try {
      // Validate path is in workspace
      if (!this.#workspace.isPathInWorkspace(filePath)) {
        throw new Error('Path is outside workspace');
      }

      // Check if note exists
      try {
        await fs.access(filePath);
      } catch {
        return null;
      }

      // Extract type and filename from path
      const relativePath = path.relative(this.#workspace.rootPath, filePath);
      const pathParts = relativePath.split(path.sep);
      const typeName = pathParts[0];
      const filename = pathParts.slice(1).join(path.sep);
      const identifier = `${typeName}/${filename}`;

      // Read note content
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);

      // Parse frontmatter and content
      const parsed = this.parseNoteContent(content);

      // Generate content hash for optimistic locking
      const contentHash = generateContentHash(parsed.content);

      return {
        id: identifier,
        type: typeName,
        filename,
        path: filePath,
        title: parsed.metadata.title || this.extractTitleFromFilename(filename),
        content: parsed.content,
        content_hash: contentHash,
        metadata: parsed.metadata,
        created: parsed.metadata.created || stats.birthtime.toISOString(),
        modified: parsed.metadata.updated || stats.mtime.toISOString(),
        updated: parsed.metadata.updated || stats.mtime.toISOString(),
        size: stats.size
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get note at path '${filePath}': ${errorMessage}`);
    }
  }

  /**
   * Parse note identifier to extract type, filename, and path
   */
  parseNoteIdentifier(identifier: string): ParsedIdentifier {
    let typeName: string;
    let filename: string;

    if (identifier.includes('/')) {
      // Format: "type/filename"
      const parts = identifier.split('/');
      typeName = parts[0];
      filename = parts.slice(1).join('/');
    } else {
      // Just filename, assume default type
      const config = this.#workspace.getConfig();
      typeName = config?.default_note_type || 'general';
      filename = identifier;
    }

    // Ensure filename has .md extension (backward compatibility: accept IDs with or without .md)
    if (!filename.endsWith('.md')) {
      filename += '.md';
    }

    const notePath = this.#workspace.getNotePath(typeName, filename);

    return { typeName, filename, notePath };
  }

  /**
   * Parse note content to separate frontmatter and body
   */
  parseNoteContent(content: string): ParsedNote {
    return parseNoteContent(content, true);
  }

  /**
   * Parse YAML frontmatter
   */
  parseFrontmatter(frontmatter: string): NoteMetadata {
    return parseFrontmatter(frontmatter, true);
  }

  /**
   * Extract title from filename
   */
  extractTitleFromFilename(filename: string): string {
    return filename
      .replace(/\.md$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  /**
   * Update an existing note
   */
  async updateNote(
    identifier: string,
    newContent: string,
    contentHash: string
  ): Promise<UpdateResult> {
    try {
      if (!contentHash) {
        throw new MissingContentHashError('note update');
      }

      const { notePath } = this.parseNoteIdentifier(identifier);

      // Check if note exists
      try {
        await fs.access(notePath);
      } catch {
        throw new Error(`Note '${identifier}' does not exist`);
      }

      // Read current content to preserve metadata
      const currentContent = await fs.readFile(notePath, 'utf-8');
      const parsed = this.parseNoteContent(currentContent);

      // Validate content hash to prevent conflicts
      validateContentHash(parsed.content, contentHash);

      // Update the content while preserving metadata
      const updatedMetadata = {
        ...parsed.metadata,
        updated: new Date().toISOString()
      };

      const updatedContent = this.formatUpdatedNoteContent(updatedMetadata, newContent);

      // Write updated content
      await fs.writeFile(notePath, updatedContent, 'utf-8');

      // Update search index
      await this.updateSearchIndex(notePath, updatedContent);

      return {
        id: identifier,
        updated: true,
        timestamp: updatedMetadata.updated
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update note '${identifier}': ${errorMessage}`);
    }
  }

  /**
   * Format updated note content with preserved metadata
   */
  formatUpdatedNoteContent(metadata: NoteMetadata, newContent: string): string {
    let formattedContent = '---\n';

    for (const [key, value] of Object.entries(metadata)) {
      if (key === 'links' && value && typeof value === 'object') {
        // Special handling for new bidirectional links structure
        const links = value as { outbound?: NoteLink[]; inbound?: NoteLink[] };
        if (
          (links.outbound && links.outbound.length > 0) ||
          (links.inbound && links.inbound.length > 0)
        ) {
          formattedContent += 'links:\n';

          if (links.outbound && links.outbound.length > 0) {
            formattedContent += '  outbound:\n';
            links.outbound.forEach((link: NoteLink) => {
              formattedContent += `    - target: "${link.target}"\n`;
              formattedContent += `      relationship: "${link.relationship}"\n`;
              formattedContent += `      created: "${link.created}"\n`;
              if (link.context) {
                formattedContent += `      context: "${link.context}"\n`;
              }
              if (link.display) {
                formattedContent += `      display: "${link.display}"\n`;
              }
              if (link.type) {
                formattedContent += `      type: "${link.type}"\n`;
              }
            });
          }

          if (links.inbound && links.inbound.length > 0) {
            formattedContent += '  inbound:\n';
            links.inbound.forEach((link: NoteLink) => {
              formattedContent += `    - target: "${link.target}"\n`;
              formattedContent += `      relationship: "${link.relationship}"\n`;
              formattedContent += `      created: "${link.created}"\n`;
              if (link.context) {
                formattedContent += `      context: "${link.context}"\n`;
              }
              if (link.display) {
                formattedContent += `      display: "${link.display}"\n`;
              }
              if (link.type) {
                formattedContent += `      type: "${link.type}"\n`;
              }
            });
          }
        }
      } else if (Array.isArray(value)) {
        // Handle other arrays (like tags)
        if (value.length > 0) {
          const escapedArray = value.map((v) => {
            if (typeof v === 'string') {
              const escapedValue = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
              return `"${escapedValue}"`;
            }
            return `"${v}"`;
          });
          formattedContent += `${key}: [${escapedArray.join(', ')}]\n`;
        } else {
          formattedContent += `${key}: []\n`;
        }
      } else if (typeof value === 'string') {
        // Always quote strings to handle special characters properly
        // Escape quotes and backslashes in string values
        const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        formattedContent += `${key}: "${escapedValue}"\n`;
      } else {
        formattedContent += `${key}: ${value}\n`;
      }
    }

    formattedContent += '---\n\n';
    formattedContent += newContent;

    return formattedContent;
  }

  /**
   * Update a note with custom metadata, avoiding duplicate frontmatter
   */
  async updateNoteWithMetadata(
    identifier: string,
    content: string,
    metadata: NoteMetadata,
    contentHash: string,
    bypassProtection: boolean = false
  ): Promise<UpdateResult> {
    try {
      if (!contentHash) {
        throw new MissingContentHashError('note metadata update');
      }

      const { notePath } = this.parseNoteIdentifier(identifier);

      // Check if note exists
      try {
        await fs.access(notePath);
      } catch {
        throw new Error(`Note '${identifier}' does not exist`);
      }

      // Read current content to preserve existing metadata
      const currentContent = await fs.readFile(notePath, 'utf-8');
      const parsed = this.parseNoteContent(currentContent);

      // Validate content hash to prevent conflicts
      validateContentHash(parsed.content, contentHash);

      // Check for protected fields unless bypassing protection
      if (!bypassProtection) {
        this.#validateNoProtectedFields(metadata);
      }

      // Merge metadata with existing metadata
      const updatedMetadata = {
        ...parsed.metadata,
        ...metadata,
        updated: new Date().toISOString()
      };

      // Format content with metadata
      const formattedContent = this.formatUpdatedNoteContent(updatedMetadata, content);

      // Write updated content
      await fs.writeFile(notePath, formattedContent, 'utf-8');

      // Update search index
      await this.updateSearchIndex(notePath, formattedContent);

      // Sync hierarchy if subnotes have changed
      if (metadata.subnotes !== undefined) {
        const subnotes = Array.isArray(metadata.subnotes) ? metadata.subnotes : [];
        await this.#syncSubnotesToHierarchy(identifier, subnotes);
      }

      return {
        id: identifier,
        updated: true,
        timestamp: updatedMetadata.updated
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update note '${identifier}': ${errorMessage}`);
    }
  }

  /**
   * Delete a note
   */
  async deleteNote(
    identifier: string,
    confirm: boolean = false
  ): Promise<DeleteNoteResult> {
    try {
      const config = this.#workspace.getConfig();

      // Validate deletion
      const validation = await this.validateNoteDeletion(identifier);
      if (!validation.can_delete) {
        throw new Error(`Cannot delete note: ${validation.errors.join(', ')}`);
      }

      // Check confirmation requirement
      if (config?.deletion?.require_confirmation && !confirm) {
        throw new Error(`Deletion requires confirmation. Set confirm=true to proceed.`);
      }

      const { notePath } = this.parseNoteIdentifier(identifier);

      let backupPath: string | undefined;

      // Create backup if enabled
      if (config?.deletion?.create_backups) {
        const backup = await this.createNoteBackup(notePath);
        backupPath = backup.path;
      }

      // Remove from search index first
      await this.removeFromSearchIndex(notePath);

      // Clean up hierarchy relationships
      await this.#cleanupHierarchyOnDelete(identifier);

      // Delete the file
      await fs.unlink(notePath);

      return {
        id: identifier,
        deleted: true,
        timestamp: new Date().toISOString(),
        backup_path: backupPath,
        warnings: validation.warnings
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete note '${identifier}': ${errorMessage}`);
    }
  }

  /**
   * Validate if a note can be deleted
   */
  async validateNoteDeletion(identifier: string): Promise<DeletionValidation> {
    const validation: DeletionValidation = {
      can_delete: true,
      warnings: [],
      errors: []
    };

    try {
      const { notePath } = this.parseNoteIdentifier(identifier);

      // Check if note exists
      try {
        await fs.access(notePath);
      } catch {
        validation.can_delete = false;
        validation.errors.push(`Note '${identifier}' does not exist`);
        return validation;
      }

      // Check for incoming links from other notes
      const incomingLinks = await this.findIncomingLinks(identifier);
      if (incomingLinks.length > 0) {
        validation.warnings.push(
          `Note has ${incomingLinks.length} incoming links that will become orphaned`
        );
        validation.incoming_links = incomingLinks;
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
   * Find incoming links to a note
   */
  async findIncomingLinks(identifier: string): Promise<string[]> {
    try {
      const incomingLinks: string[] = [];
      const notes = await this.listNotes();

      for (const note of notes) {
        try {
          const noteContent = await fs.readFile(note.path, 'utf-8');
          const { wikilinks } = WikilinkParser.parseWikilinks(noteContent);

          const hasLinkToTarget = wikilinks.some((link: WikiLink) => {
            const linkIdentifier = `${link.type || note.type}/${link.filename || link.target}`;
            return linkIdentifier === identifier || link.target === identifier;
          });

          if (hasLinkToTarget) {
            incomingLinks.push(`${note.type}/${note.filename}`);
          }
        } catch {
          // Skip notes that can't be read
          continue;
        }
      }

      return incomingLinks;
    } catch {
      return [];
    }
  }

  /**
   * Create a backup of a note before deletion
   */
  async createNoteBackup(notePath: string): Promise<BackupInfo> {
    try {
      const config = this.#workspace.getConfig();
      const backupDir = path.resolve(
        this.#workspace.rootPath,
        config?.deletion?.backup_path || '.flint-note/backups'
      );

      // Ensure backup directory exists
      await fs.mkdir(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = path.basename(notePath);
      const backupFilename = `${timestamp}_${filename}`;
      const backupPath = path.join(backupDir, backupFilename);

      // Copy the note file
      await fs.copyFile(notePath, backupPath);

      // Get file stats for size
      const stats = await fs.stat(backupPath);

      return {
        path: backupPath,
        timestamp: new Date().toISOString(),
        notes: [notePath],
        size: stats.size
      };
    } catch (error) {
      throw new Error(
        `Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find notes matching deletion criteria
   */
  async findNotesMatchingCriteria(criteria: {
    type?: string;
    tags?: string[];
    pattern?: string;
  }): Promise<string[]> {
    try {
      const notes = await this.listNotes();
      const matching: string[] = [];

      for (const note of notes) {
        let matches = true;

        // Check type filter
        if (criteria.type && note.type !== criteria.type) {
          matches = false;
        }

        // Check tags filter
        if (criteria.tags && criteria.tags.length > 0) {
          const noteTags = note.tags || [];
          const hasAllTags = criteria.tags.every((tag) => noteTags.includes(tag));
          if (!hasAllTags) {
            matches = false;
          }
        }

        // Check pattern filter
        if (criteria.pattern && matches) {
          try {
            const noteContent = await fs.readFile(note.path, 'utf-8');
            const regex = new RegExp(criteria.pattern, 'i');
            if (!regex.test(noteContent) && !regex.test(note.title)) {
              matches = false;
            }
          } catch {
            matches = false;
          }
        }

        if (matches) {
          matching.push(`${note.type}/${note.filename}`);
        }
      }

      return matching;
    } catch (error) {
      throw new Error(
        `Failed to find matching notes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * List notes in a specific type
   */
  async listNotes(typeName?: string, limit?: number): Promise<NoteListItem[]> {
    try {
      const notes: NoteListItem[] = [];
      let noteTypes: Array<{ name: string; path: string }> = [];

      if (typeName) {
        // List notes from specific type
        const typePath = this.#workspace.getNoteTypePath(typeName);
        try {
          await fs.access(typePath);
          noteTypes = [{ name: typeName, path: typePath }];
        } catch {
          throw new Error(`Note type '${typeName}' does not exist`);
        }
      } else {
        // List notes from all types
        const workspaceRoot = this.#workspace.rootPath;
        const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });

        for (const entry of entries) {
          if (
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules'
          ) {
            noteTypes.push({
              name: entry.name,
              path: path.join(workspaceRoot, entry.name)
            });
          }
        }
      }

      // Collect notes from each type
      for (const noteType of noteTypes) {
        try {
          const typeEntries = await fs.readdir(noteType.path);
          const noteFiles = typeEntries.filter(
            (file) =>
              file.endsWith('.md') && !file.startsWith('.') && file !== '_description.md'
          );

          for (const filename of noteFiles) {
            const notePath = path.join(noteType.path, filename);
            const stats = await fs.stat(notePath);

            // Read just the frontmatter for efficiency
            const content = await fs.readFile(notePath, 'utf-8');
            const parsed = this.parseNoteContent(content);

            notes.push({
              id: this.generateNoteId(noteType.name, filename),
              type: noteType.name,
              filename,
              title: parsed.metadata.title || this.extractTitleFromFilename(filename),
              created: stats.birthtime.toISOString(),
              modified: stats.mtime.toISOString(),
              size: stats.size,
              tags: parsed.metadata.tags || [],
              path: notePath
            });
          }
        } catch {
          // Continue with other types if one fails
          continue;
        }
      }

      // Sort by modification date (newest first)
      notes.sort(
        (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
      );

      // Apply limit if specified
      if (limit && limit > 0) {
        return notes.slice(0, limit);
      }

      return notes;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to list notes: ${errorMessage}`);
    }
  }

  /**
   * Update search index for a note
   */
  async updateSearchIndex(notePath: string, content: string): Promise<void> {
    try {
      // Update hybrid search index if available
      if (this.#hybridSearchManager) {
        const parsed = parseNoteContent(content);
        const filename = path.basename(notePath);
        const noteId = this.generateNoteId(parsed.metadata.type || 'default', filename);

        await this.#hybridSearchManager.upsertNote(
          noteId,
          parsed.metadata.title || filename.replace('.md', ''),
          parsed.content,
          parsed.metadata.type || 'default',
          filename,
          notePath,
          parsed.metadata
        );

        // Extract and store links in the database
        await this.extractAndStoreLinks(noteId, parsed.content);
      }
    } catch (error) {
      // Don't fail note operations if search index update fails
      console.error(
        'Failed to update search index:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Extract and store links for a note
   */
  private async extractAndStoreLinks(noteId: string, content: string): Promise<void> {
    try {
      if (this.#hybridSearchManager) {
        const db = await this.#hybridSearchManager.getDatabaseConnection();
        const extractionResult = LinkExtractor.extractLinks(content);
        await LinkExtractor.storeLinks(noteId, extractionResult, db);
      }
    } catch (error) {
      // Don't fail note operations if link extraction fails
      console.error(
        'Failed to extract and store links:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Remove note from search index
   */
  async removeFromSearchIndex(notePath: string): Promise<void> {
    try {
      // Remove from hybrid search index if available
      if (this.#hybridSearchManager) {
        const filename = path.basename(notePath);
        const content = await fs.readFile(notePath, 'utf-8');
        const parsed = parseNoteContent(content);
        const noteId = this.generateNoteId(parsed.metadata.type || 'default', filename);

        // Clear links for this note
        const db = await this.#hybridSearchManager.getDatabaseConnection();
        await LinkExtractor.clearLinksForNote(noteId, db);

        await this.#hybridSearchManager.removeNote(noteId);
      }
    } catch (error) {
      // Don't fail note operations if search index update fails
      console.error(
        'Failed to remove from search index:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Search notes using the hybrid search manager
   */
  async searchNotes(options: {
    query?: string;
    type_filter?: string;
    limit?: number;
  }): Promise<import('../database/search-manager.js').SearchResult[]> {
    if (!this.#hybridSearchManager) {
      throw new Error(
        'Search functionality not available - hybrid search manager not initialized'
      );
    }

    return await this.#hybridSearchManager.searchNotes(
      options.query,
      options.type_filter || null,
      options.limit || 50
    );
  }

  /**
   * Validate metadata against note type schema
   */
  async validateMetadata(
    typeName: string,
    metadata: Record<string, unknown>,
    enforceRequiredFields: boolean = true
  ): Promise<ValidationResult> {
    try {
      const schema = await this.#noteTypeManager.getMetadataSchema(typeName);
      return MetadataValidator.validate(metadata, schema, enforceRequiredFields);
    } catch (error) {
      // If schema retrieval fails, allow the operation but log warning
      console.warn(
        `Failed to get metadata schema for type '${typeName}':`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return { valid: true, errors: [], warnings: [] };
    }
  }

  /**
   * Validate that metadata does not contain protected fields
   *
   * This method prevents modification of critical note identification fields
   * through regular metadata updates. Protected fields include:
   * - 'title': The display name of the note (use rename_note tool instead)
   * - 'filename': The file system name (use rename_note tool instead)
   *
   * This protection ensures that:
   * 1. Note renaming goes through the proper rename_note tool which handles wikilink updates and filename synchronization
   * 2. File system consistency is maintained
   * 3. Note IDs and references remain stable
   * 4. Users receive clear guidance on the correct tool to use
   *
   * @param metadata - The metadata object to validate
   * @throws Error with descriptive message directing users to rename_note tool if protected fields are present
   */
  #validateNoProtectedFields(metadata: NoteMetadata): void {
    const protectedFields = new Set(['type', 'title', 'filename', 'created', 'updated']);
    const foundProtectedFields: string[] = [];

    for (const [key, value] of Object.entries(metadata)) {
      if (protectedFields.has(key) && value !== undefined && value !== null) {
        foundProtectedFields.push(key);
      }
    }

    if (foundProtectedFields.length > 0) {
      const fieldList = foundProtectedFields.join(', ');
      const typeMessage = foundProtectedFields.includes('type')
        ? `Use the 'move_note' tool to safely move notes between note types with proper file relocation and link updates. `
        : '';
      const titleMessage = foundProtectedFields.some((field) =>
        ['title', 'filename'].includes(field)
      )
        ? `Use the 'rename_note' tool to safely update note titles with automatic filename synchronization and link preservation. `
        : '';
      const timestampMessage = foundProtectedFields.some((field) =>
        ['created', 'updated'].includes(field)
      )
        ? `The 'created' and 'updated' fields are handled automatically and cannot be modified manually.`
        : '';

      throw new Error(
        `Cannot modify protected field(s): ${fieldList}. ` +
          typeMessage +
          titleMessage +
          timestampMessage
      );
    }
  }

  /**
   * Rename a note with full title/filename synchronization and wikilink updates
   */
  async renameNoteWithFile(
    identifier: string,
    newTitle: string,
    contentHash: string
  ): Promise<{
    success: boolean;
    notesUpdated?: number;
    linksUpdated?: number;
    new_id?: string;
  }> {
    // Input validation
    if (!identifier) {
      throw new Error('Note identifier is required');
    }
    if (!newTitle?.trim()) {
      throw new Error('New title is required');
    }
    if (!contentHash) {
      throw new Error('Content hash is required for optimistic locking');
    }

    const trimmedTitle = newTitle.trim();
    let originalPath: string | null = null;
    let finalPath: string | null = null;
    let wasFileRenamed = false;
    let wasRemovedFromIndex = false;

    try {
      // Get the current note
      const currentNote = await this.getNote(identifier);
      if (!currentNote) {
        throw new Error(`Note '${identifier}' not found`);
      }

      // Generate new filename from title
      const newFilenameWithExt = this.generateFilename(trimmedTitle);

      // Validate that the generated filename isn't empty
      if (!newFilenameWithExt) {
        throw new Error(`Cannot generate valid filename from title: "${trimmedTitle}"`);
      }

      // Extract base filename without extension for metadata
      const baseFilename = path.basename(newFilenameWithExt, '.md');

      // Get the note type path
      const typePath = this.#workspace.getNoteTypePath(currentNote.type);
      const newNotePath = path.join(typePath, newFilenameWithExt);
      // Use the same path that was used to read the note (from currentNote.path)
      const currentPath = currentNote.path;

      originalPath = currentPath;

      // Handle filename conflicts by generating unique name
      let finalBaseFilename = baseFilename;
      let finalFilenameWithExt = newFilenameWithExt;
      let finalNotePath = newNotePath;
      let counter = 1;

      // Only check for conflicts if we're actually changing the filename
      if (finalNotePath !== currentPath) {
        while (true) {
          try {
            await fs.access(finalNotePath);
            // File exists, try with counter
            finalBaseFilename = `${baseFilename}-${counter}`;
            finalFilenameWithExt = `${finalBaseFilename}.md`;
            finalNotePath = path.join(typePath, finalFilenameWithExt);
            counter++;

            // Prevent infinite loops with a reasonable limit
            if (counter > 1000) {
              throw new Error(
                `Cannot generate unique filename for title: "${trimmedTitle}"`
              );
            }
          } catch {
            // File doesn't exist, we can use this name
            break;
          }
        }
      }

      finalPath = finalNotePath;

      // Generate old and new IDs
      const oldId = this.generateNoteId(currentNote.type, currentNote.filename);
      const newId = this.generateNoteId(currentNote.type, finalBaseFilename);

      // Update the metadata with new title and filename
      const updatedMetadata = {
        ...currentNote.metadata,
        title: trimmedTitle,
        filename: finalBaseFilename,
        updated: new Date().toISOString()
      };

      // Create the updated content
      const updatedContent = await this.formatNoteContent(
        trimmedTitle,
        currentNote.content,
        currentNote.type,
        updatedMetadata
      );

      // Validate content hash for optimistic locking
      const currentContent = await fs.readFile(currentPath, 'utf-8');
      const currentParsed = this.parseNoteContent(currentContent);
      const currentContentHash = generateContentHash(currentParsed.content);

      if (currentContentHash !== contentHash) {
        throw new Error(
          'Content has been modified by another process. Please refresh and try again.'
        );
      }

      // Remove from search index first (with old path)
      await this.removeFromSearchIndex(currentPath);
      wasRemovedFromIndex = true;

      // Rename the physical file if path is changing
      if (finalNotePath !== currentPath) {
        await fs.rename(currentPath, finalNotePath);
        wasFileRenamed = true;
      }

      // Write updated content to the file
      await fs.writeFile(finalNotePath, updatedContent, 'utf-8');

      // Update search index with new path and content
      await this.updateSearchIndex(finalNotePath, updatedContent);

      let brokenLinksUpdated = 0;
      const wikilinksResult = { notesUpdated: 0, linksUpdated: 0 };

      // Update wikilinks if search manager is available
      if (this.#hybridSearchManager) {
        const db = await this.#hybridSearchManager.getDatabaseConnection();

        // Update broken links that might now be resolved due to the new title
        try {
          brokenLinksUpdated = await LinkExtractor.updateBrokenLinks(
            newId,
            trimmedTitle,
            db
          );
        } catch (error) {
          console.warn('Failed to update broken links:', error);
          // Continue with operation - broken link updates are not critical
        }

        // Update wikilinks for identifier changes (if filename changed)
        if (oldId !== newId) {
          try {
            const moveResult = await LinkExtractor.updateWikilinksForMovedNote(
              oldId,
              newId,
              trimmedTitle,
              db
            );
            wikilinksResult.notesUpdated += moveResult.notesUpdated;
            wikilinksResult.linksUpdated += moveResult.linksUpdated;
          } catch (error) {
            console.warn('Failed to update wikilinks for moved note:', error);
            // Continue with operation - wikilink updates are not critical for core functionality
          }
        }

        // Always update wikilinks for title changes
        try {
          const renameResult = await LinkExtractor.updateWikilinksForRenamedNote(
            oldId,
            currentNote.title,
            trimmedTitle,
            newId,
            db
          );
          wikilinksResult.notesUpdated += renameResult.notesUpdated;
          wikilinksResult.linksUpdated += renameResult.linksUpdated;
        } catch (error) {
          console.warn('Failed to update wikilinks for renamed note:', error);
          // Continue with operation - wikilink updates are not critical for core functionality
        }
      }

      return {
        success: true,
        notesUpdated: wikilinksResult.notesUpdated,
        linksUpdated: wikilinksResult.linksUpdated + brokenLinksUpdated,
        new_id: newId
      };
    } catch (error) {
      // Rollback operations in reverse order
      try {
        // If we renamed the file, try to rename it back
        if (wasFileRenamed && originalPath && finalPath) {
          try {
            await fs.rename(finalPath, originalPath);
          } catch (rollbackError) {
            console.error('Failed to rollback file rename:', rollbackError);
          }
        }

        // If we removed from search index, try to re-add it
        if (wasRemovedFromIndex && originalPath) {
          try {
            const originalContent = await fs.readFile(originalPath, 'utf-8');
            await this.updateSearchIndex(originalPath, originalContent);
          } catch (rollbackError) {
            console.error('Failed to rollback search index removal:', rollbackError);
          }
        }
      } catch (rollbackError) {
        console.error('Error during rollback operations:', rollbackError);
      }

      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Move a note from one note type to another
   */
  async moveNote(
    identifier: string,
    newType: string,
    contentHash: string
  ): Promise<MoveNoteResult> {
    try {
      if (!contentHash) {
        throw new MissingContentHashError('note move operation');
      }

      // Validate the new note type name format
      if (!this.#workspace.isValidNoteTypeName(newType)) {
        throw new Error(`Invalid note type name: ${newType}`);
      }

      // Get the current note
      const currentNote = await this.getNote(identifier);
      if (!currentNote) {
        throw new Error(`Note '${identifier}' not found`);
      }

      // Validate content hash to prevent conflicts
      validateContentHash(currentNote.content, contentHash);

      const {
        typeName: oldType,
        filename,
        notePath: currentPath
      } = this.parseNoteIdentifier(identifier);

      // Don't move if already in target type
      if (oldType === newType) {
        throw new Error(`Note is already in note type '${newType}'`);
      }

      // Check if target note type exists - don't create it automatically
      const targetTypePath = this.#workspace.getNoteTypePath(newType);
      try {
        await fs.access(targetTypePath);
      } catch {
        throw new Error(
          `Note type '${newType}' does not exist. Create the note type first before moving notes to it.`
        );
      }
      const targetPath = path.join(targetTypePath, filename);

      // Check for conflicts in target directory
      try {
        await fs.access(targetPath);
        // If we reach here, the file exists - throw conflict error
        throw new Error(
          `A note with filename '${filename}' already exists in note type '${newType}'. ` +
            'Move operation would overwrite existing note.'
        );
      } catch (error) {
        // If it's a filesystem error (ENOENT), we can proceed
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          // File doesn't exist, we can proceed
        } else {
          // Re-throw any other error (including our conflict error)
          throw error;
        }
      }

      // Remove from search index at old location
      await this.removeFromSearchIndex(currentPath);

      // Update the metadata with new type and timestamp
      const updatedMetadata = {
        ...currentNote.metadata,
        type: newType,
        updated: new Date().toISOString()
      };

      // Format the content with updated metadata
      const updatedContent = this.formatUpdatedNoteContent(
        updatedMetadata,
        currentNote.content
      );

      // Move the file to the new location
      await fs.rename(currentPath, targetPath);

      // Write the updated content with new type
      await fs.writeFile(targetPath, updatedContent, 'utf-8');

      // Update search index at new location
      await this.updateSearchIndex(targetPath, updatedContent);

      // Generate new identifier
      const newId = this.generateNoteId(newType, filename);

      let linksUpdated = 0;
      let notesWithUpdatedLinks = 0;

      // Update links if search manager is available
      if (this.#hybridSearchManager) {
        const db = await this.#hybridSearchManager.getDatabaseConnection();

        // Update all links that reference the old identifier
        const result = await LinkExtractor.updateWikilinksForMovedNote(
          identifier,
          newId,
          currentNote.title,
          db
        );

        linksUpdated = result.linksUpdated;
        notesWithUpdatedLinks = result.notesUpdated;
      }

      const timestamp = new Date().toISOString();

      return {
        success: true,
        old_id: identifier,
        new_id: newId,
        old_type: oldType,
        new_type: newType,
        filename,
        title: currentNote.title,
        timestamp,
        links_updated: linksUpdated,
        notes_with_updated_links: notesWithUpdatedLinks
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to move note '${identifier}' to type '${newType}': ${errorMessage}`
      );
    }
  }
}
