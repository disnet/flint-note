/**
 * Note Manager
 *
 * Handles CRUD operations for individual notes, including creation,
 * reading, updating, deletion, and metadata management.
 */

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { Workspace } from './workspace.js';
import { NoteTypeManager } from './note-types.js';

import { HybridSearchManager } from '../database/search-manager.js';
import { MetadataValidator } from './metadata-schema.js';
import type { ValidationResult } from './metadata-schema.js';
import { parseFrontmatter, parseNoteContent } from '../utils/yaml-parser.js';
import {
  generateContentHash,
  validateContentHash,
  ContentHashMismatchError,
  MissingContentHashError,
  NoteTypeNotFoundError
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
import { SYSTEM_FIELDS } from './system-fields.js';

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
  old_path: string;
  new_path: string;
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

/**
 * Pending write entry for FileWriteQueue
 */
interface PendingWrite {
  filePath: string;
  content: string;
  timeout: NodeJS.Timeout;
  retryCount: number;
}

/**
 * FileWriteQueue - Manages asynchronous, batched file writes
 *
 * Part of the database-first architecture. This queue debounces file writes
 * to reduce disk I/O while keeping the database as the immediate source of truth.
 *
 * Key features:
 * - Debounces rapid writes to the same file (default 1000ms)
 * - Batches multiple edits into single write operation
 * - Retries failed writes with exponential backoff (3 attempts)
 * - Coordinates with file watcher to prevent false external edit detection
 * - Flushes pending writes on app shutdown
 *
 * @see docs/PRD-DATABASE-SOURCE-OF-TRUTH.md
 * @see docs/architecture/FILE-WRITE-QUEUE.md (to be created)
 */
export class FileWriteQueue {
  // Map of filePath -> PendingWrite
  private pendingWrites: Map<string, PendingWrite> = new Map();

  // Default delay before flushing write (1000ms per approved decisions)
  private readonly defaultDelay: number;

  // File watcher reference for marking writes
  private fileWatcher?: import('./file-watcher.js').VaultFileWatcher;

  // Retry configuration (3 attempts with exponential backoff)
  private readonly maxRetries = 3;
  private readonly retryDelays = [100, 500, 1000]; // milliseconds

  constructor(
    fileWatcher?: import('./file-watcher.js').VaultFileWatcher,
    defaultDelay: number = 1000
  ) {
    this.fileWatcher = fileWatcher;
    this.defaultDelay = defaultDelay;
  }

  /**
   * Queue a file write, replacing any pending write for the same file
   *
   * @param filePath Absolute path to the file
   * @param content Content to write
   * @param delay Optional custom delay (defaults to 1000ms)
   */
  async queueWrite(
    filePath: string,
    content: string,
    delay: number = this.defaultDelay
  ): Promise<void> {
    // Clear existing timeout for this file
    const existing = this.pendingWrites.get(filePath);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    // Schedule new write
    const timeout = setTimeout(async () => {
      await this.flushWrite(filePath);
    }, delay);

    this.pendingWrites.set(filePath, {
      filePath,
      content,
      timeout,
      retryCount: 0
    });
  }

  /**
   * Immediately flush a specific file's pending write
   *
   * @param filePath Path to the file to flush
   */
  async flushWrite(filePath: string): Promise<void> {
    const pending = this.pendingWrites.get(filePath);
    if (!pending) {
      return; // Nothing pending for this file
    }

    // Clear the timeout
    clearTimeout(pending.timeout);

    try {
      // Mark write starting (prevents external edit detection)
      if (this.fileWatcher) {
        this.fileWatcher.markWriteStarting(filePath);
      }

      // Perform the actual write
      await fs.writeFile(filePath, pending.content, 'utf-8');

      // Success - remove from pending
      this.pendingWrites.delete(filePath);

    } catch (error) {
      // Write failed - attempt retry if within limit
      if (pending.retryCount < this.maxRetries) {
        const retryDelay = this.retryDelays[pending.retryCount];
        pending.retryCount++;

        console.warn(
          `[FileWriteQueue] Write failed for ${filePath}, retry ${pending.retryCount}/${this.maxRetries} in ${retryDelay}ms`,
          error
        );

        // Schedule retry with exponential backoff
        pending.timeout = setTimeout(async () => {
          await this.flushWrite(filePath);
        }, retryDelay);

        this.pendingWrites.set(filePath, pending);

      } else {
        // Max retries exceeded - log error and remove from queue
        console.error(
          `[FileWriteQueue] Write failed for ${filePath} after ${this.maxRetries} retries`,
          error
        );

        this.pendingWrites.delete(filePath);

        // TODO: In Phase 1, we'll add error tracking to database
        // For now, just log the error
        // Future: publishFileWriteError(filePath, error)
      }
    } finally {
      // Always mark write complete (even on error)
      if (this.fileWatcher) {
        this.fileWatcher.markWriteComplete(filePath);
      }
    }
  }

  /**
   * Flush all pending writes immediately
   * Called on app shutdown to ensure no data loss
   */
  async flushAll(): Promise<void> {
    const paths = Array.from(this.pendingWrites.keys());

    // Flush all writes in parallel
    await Promise.all(paths.map(path => this.flushWrite(path)));
  }

  /**
   * Check if a file has a pending write
   *
   * @param filePath Path to check
   * @returns True if write is queued
   */
  hasPendingWrite(filePath: string): boolean {
    return this.pendingWrites.has(filePath);
  }

  /**
   * Get the number of pending writes
   * Useful for monitoring and debugging
   *
   * @returns Count of files waiting to be written
   */
  getPendingCount(): number {
    return this.pendingWrites.size;
  }

  /**
   * Cleanup - clear all pending timeouts
   * Should be called when shutting down
   */
  destroy(): void {
    // Clear all timeouts
    for (const pending of this.pendingWrites.values()) {
      clearTimeout(pending.timeout);
    }
    this.pendingWrites.clear();
  }
}

export class NoteManager {
  #workspace: Workspace;
  #noteTypeManager: NoteTypeManager;
  #hierarchyManager?: HierarchyManager;

  #hybridSearchManager?: HybridSearchManager;
  #fileWatcher?: import('./file-watcher.js').VaultFileWatcher;
  #fileWriteQueue: FileWriteQueue;

  constructor(
    workspace: Workspace,
    hybridSearchManager?: HybridSearchManager,
    fileWatcher?: import('./file-watcher.js').VaultFileWatcher
  ) {
    this.#workspace = workspace;

    // Pass database manager to NoteTypeManager if available
    const dbManager = hybridSearchManager?.getDatabaseManager();
    this.#noteTypeManager = new NoteTypeManager(workspace, dbManager);

    this.#hybridSearchManager = hybridSearchManager;
    this.#fileWatcher = fileWatcher;

    // Initialize file write queue (Phase 1: DB-first architecture)
    // Phase 1: Start with 0ms delay (no behavior change)
    // Phase 2: Change to 1000ms delay (actual batching)
    this.#fileWriteQueue = new FileWriteQueue(fileWatcher, 0);

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
   * Get the file write queue instance
   * Used for flushing on shutdown or note switch
   *
   * @returns The FileWriteQueue instance
   */
  getFileWriteQueue(): FileWriteQueue {
    return this.#fileWriteQueue;
  }

  /**
   * Flush all pending file writes immediately
   * Called on app shutdown or vault switch
   */
  async flushPendingWrites(): Promise<void> {
    await this.#fileWriteQueue.flushAll();
  }

  /**
   * Cleanup resources and flush pending writes
   * Called when shutting down the NoteManager
   */
  async destroy(): Promise<void> {
    // Flush all pending writes
    await this.#fileWriteQueue.flushAll();
    // Clean up the queue
    this.#fileWriteQueue.destroy();
  }

  /**
   * Write a file with file watcher tracking to prevent it from being treated as an external change.
   * This method queues the write through FileWriteQueue for batching and retry logic.
   *
   * Phase 1: Queue with 0ms delay (effectively synchronous, no behavior change)
   * Phase 2: Queue with 1000ms delay (actual batching)
   */
  async #writeFileWithTracking(filePath: string, content: string): Promise<void> {
    // Queue the write (FileWriteQueue handles file watcher coordination)
    await this.#fileWriteQueue.queueWrite(filePath, content);
  }

  /**
   * Sync subnotes from frontmatter to hierarchy database
   */
  async #syncSubnotesToHierarchy(noteId: string, subnotes: string[]): Promise<void> {
    if (!this.#hierarchyManager || !this.#hybridSearchManager) return;

    // Get database connection if hierarchy manager isn't initialized
    if (!this.#hierarchyManager) {
      await this.#initializeHierarchyManager(this.#hybridSearchManager);
      if (!this.#hierarchyManager) return;
    }

    // Get current children from database
    const currentChildren = await this.#hierarchyManager.getChildren(noteId);
    const currentChildIds = currentChildren.map((child) => child.child_id);

    // Desired child IDs from subnotes
    const desiredChildIds = subnotes;

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
   */
  async #syncHierarchyToSubnotes(noteId: string): Promise<void> {
    if (!this.#hierarchyManager || !this.#hybridSearchManager) {
      return;
    }

    // Get database connection if hierarchy manager isn't initialized
    if (!this.#hierarchyManager) {
      await this.#initializeHierarchyManager(this.#hybridSearchManager);
      if (!this.#hierarchyManager) return;
    }

    const children = await this.#hierarchyManager.getChildren(noteId);

    // Convert child IDs back to identifiers
    const subnotes: string[] = [];
    const db = await this.#hybridSearchManager.getDatabaseConnection();

    for (const child of children) {
      const note = await db.get<{ title: string; type: string }>(
        'SELECT title, type FROM notes WHERE id = ?',
        [child.child_id]
      );
      if (note) {
        subnotes.push(`${note.type}/${note.title}`);
      }
    }

    // Update the note's frontmatter with the current subnotes
    try {
      const currentNote = await this.getNote(noteId);
      if (!currentNote) {
        console.warn(`Note not found when syncing hierarchy: ${noteId}`);
        return;
      }

      const updatedMetadata = { ...currentNote.metadata };

      if (subnotes.length > 0) {
        updatedMetadata.subnotes = subnotes;
      } else {
        // Remove subnotes property if there are no children
        delete updatedMetadata.subnotes;
      }

      await this.updateNoteWithMetadata(
        noteId,
        currentNote.content,
        updatedMetadata,
        currentNote.content_hash
      );
    } catch (error) {
      // If we can't update the note, just log the error and continue
      console.warn(`Failed to sync hierarchy to frontmatter for ${noteId}:`, error);
    }
  }

  /**
   * Clean up hierarchy relationships when a note is deleted
   */
  async #cleanupHierarchyOnDelete(noteId: string): Promise<void> {
    if (!this.#hierarchyManager || !this.#hybridSearchManager) return;

    // Get database connection if hierarchy manager isn't initialized
    if (!this.#hierarchyManager) {
      await this.#initializeHierarchyManager(this.#hybridSearchManager);
      if (!this.#hierarchyManager) return;
    }

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
      console.warn(`Failed to clean up hierarchy for deleted note ${noteId}:`, error);
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
      // Trim the title for consistent handling (allow empty titles)
      const trimmedTitle = title ? title.trim() : '';

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

      // Generate immutable note ID first
      const noteId = this.generateNoteId();

      // Prepare note content with metadata
      const noteContent = await this.formatNoteContent(
        trimmedTitle,
        content,
        typeName,
        metadata,
        noteId
      );

      // Write the note file
      await this.#writeFileWithTracking(notePath, noteContent);

      // Update search index
      await this.updateSearchIndex(notePath, noteContent);

      // Sync hierarchy if subnotes are specified in metadata
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
    // Handle empty titles
    if (!title || title.trim().length === 0) {
      return 'untitled.md';
    }

    // Remove or replace problematic characters
    let filename = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    // Ensure filename isn't empty after cleaning
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
   * Generate an immutable note ID
   * This ID is stored in the note's frontmatter and never changes
   */
  generateNoteId(): string {
    return 'n-' + crypto.randomBytes(4).toString('hex');
  }

  /**
   * Format note content with metadata frontmatter
   */
  async formatNoteContent(
    title: string,
    content: string,
    typeName: string,
    metadata: Record<string, unknown> = {},
    noteId?: string
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const filename = this.generateFilename(title);
    const baseFilename = path.basename(filename, '.md');
    const id = noteId || this.generateNoteId();

    let formattedContent = '---\n';
    formattedContent += `id: ${id}\n`;
    // Only add title if it's not empty
    if (title && title.trim().length > 0) {
      formattedContent += `title: "${title}"\n`;
    }
    formattedContent += `filename: "${baseFilename}"\n`;
    formattedContent += `type: ${typeName}\n`;
    formattedContent += `created: ${timestamp}\n`;
    formattedContent += `updated: ${timestamp}\n`;

    // Add custom metadata fields
    for (const [key, value] of Object.entries(metadata)) {
      if (
        key !== 'id' &&
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
  async getNote(identifier: string): Promise<Note> {
    try {
      let typeName: string;
      let filename: string;
      let notePath: string;
      let noteId: string;

      // Check if identifier is an immutable ID (format: n-xxxxxxxx)
      if (identifier.startsWith('n-')) {
        // Look up note in database to get type and filename
        if (!this.#hybridSearchManager) {
          throw new Error('Database not initialized');
        }
        const db = await this.#hybridSearchManager.getDatabaseConnection();
        const dbNote = await db.get<{ id: string; type: string; filename: string }>(
          'SELECT id, type, filename FROM notes WHERE id = ?',
          [identifier]
        );

        if (!dbNote) {
          throw new Error(`Note not found: ${identifier}`);
        }

        noteId = dbNote.id;
        typeName = dbNote.type;
        filename = dbNote.filename;
        notePath = path.join(this.#workspace.rootPath, typeName, filename);
      } else {
        // Old-style identifier (type/filename)
        const parsed = await this.parseNoteIdentifier(identifier);
        typeName = parsed.typeName;
        filename = parsed.filename;
        notePath = parsed.notePath;

        // For old-style identifiers, look up the actual ID from database
        if (this.#hybridSearchManager) {
          const db = await this.#hybridSearchManager.getDatabaseConnection();
          const dbNote = await db.get<{ id: string }>(
            'SELECT id FROM notes WHERE type = ? AND filename = ?',
            [typeName, filename]
          );
          noteId = dbNote?.id || identifier; // Fallback to identifier if not found in DB
        } else {
          noteId = identifier; // Fallback when no database
        }
      }

      // Check if note exists
      try {
        await fs.access(notePath);
      } catch {
        throw new Error(`Note not found: ${identifier}`);
      }

      // Read note content
      const content = await fs.readFile(notePath, 'utf-8');
      const stats = await fs.stat(notePath);

      // Parse frontmatter and content
      const parsed = this.parseNoteContent(content);

      // Generate content hash for optimistic locking
      const contentHash = generateContentHash(parsed.content);

      return {
        id: noteId,
        type: typeName,
        filename,
        path: notePath,
        title: parsed.metadata.title || '',
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
        title: parsed.metadata.title || '',
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
   * Supports both immutable IDs (n-xxxxxxxx) and old-style identifiers (type/filename)
   */
  async parseNoteIdentifier(identifier: string): Promise<ParsedIdentifier> {
    let typeName: string;
    let filename: string;

    // Check if identifier is an immutable ID (format: n-xxxxxxxx)
    if (identifier.startsWith('n-')) {
      // Look up note in database to get type and filename
      if (!this.#hybridSearchManager) {
        throw new Error('Database not initialized');
      }
      const db = await this.#hybridSearchManager.getDatabaseConnection();
      const dbNote = await db.get<{ type: string; filename: string }>(
        'SELECT type, filename FROM notes WHERE id = ?',
        [identifier]
      );

      if (!dbNote) {
        throw new Error(`Note not found: ${identifier}`);
      }

      typeName = dbNote.type;
      filename = dbNote.filename;
    } else if (identifier.includes('/')) {
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

      const { notePath } = await this.parseNoteIdentifier(identifier);

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
      await this.#writeFileWithTracking(notePath, updatedContent);

      // Update search index
      await this.updateSearchIndex(notePath, updatedContent);

      return {
        id: identifier,
        updated: true,
        timestamp: updatedMetadata.updated
      };
    } catch (error) {
      if (
        error instanceof ContentHashMismatchError ||
        error instanceof MissingContentHashError
      ) {
        throw error; // Re-throw content hash errors as-is
      }
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
      // Skip undefined values (used to explicitly remove properties from frontmatter)
      if (value === undefined) {
        continue;
      }

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
      const { notePath } = await this.parseNoteIdentifier(identifier);

      // Check if note exists
      try {
        await fs.access(notePath);
      } catch {
        throw new Error(`Note '${identifier}' does not exist`);
      }

      // Read current content to preserve existing metadata
      const currentContent = await fs.readFile(notePath, 'utf-8');
      const parsed = this.parseNoteContent(currentContent);

      // Only validate content hash if content is actually changing
      // This allows metadata-only updates without requiring hash checks
      if (content !== parsed.content) {
        if (!contentHash) {
          throw new MissingContentHashError('note content update');
        }
        // Validate content hash to prevent conflicts
        validateContentHash(parsed.content, contentHash);
      }

      // Check for protected fields unless bypassing protection
      if (!bypassProtection) {
        this.#validateNoProtectedFields(metadata);
      }

      // Merge metadata with existing metadata
      // Handle undefined values explicitly to allow removing fields
      const updatedMetadata = {
        ...parsed.metadata,
        updated: new Date().toISOString()
      };

      // Apply new metadata, explicitly deleting undefined values
      for (const [key, value] of Object.entries(metadata)) {
        if (value === undefined) {
          delete updatedMetadata[key];
        } else {
          updatedMetadata[key] = value;
        }
      }

      // Format content with metadata
      const formattedContent = this.formatUpdatedNoteContent(updatedMetadata, content);

      // Write updated content
      await this.#writeFileWithTracking(notePath, formattedContent);

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
      if (
        error instanceof ContentHashMismatchError ||
        error instanceof MissingContentHashError
      ) {
        throw error; // Re-throw content hash errors as-is
      }
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

      const { notePath } = await this.parseNoteIdentifier(identifier);

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
      const { notePath } = await this.parseNoteIdentifier(identifier);

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

            // Get ID from frontmatter (for migrated notes) or look up from database
            let noteId: string;
            if (typeof parsed.metadata.id === 'string') {
              noteId = parsed.metadata.id;
            } else {
              // Try to look up ID from database if frontmatter is missing it
              if (this.#hybridSearchManager) {
                try {
                  const db = await this.#hybridSearchManager.getDatabaseConnection();
                  const dbNote = await db.get<{ id: string }>(
                    'SELECT id FROM notes WHERE type = ? AND filename = ?',
                    [noteType.name, filename]
                  );
                  if (dbNote) {
                    noteId = dbNote.id;
                    // Frontmatter is missing ID but database has it - write it back to frontmatter
                    console.log(
                      `Fixing missing ID in frontmatter for note ${noteType.name}/${filename} (ID: ${noteId})`
                    );
                    try {
                      const updatedMetadata = {
                        ...parsed.metadata,
                        id: noteId
                      };
                      const updatedContent = this.formatUpdatedNoteContent(
                        updatedMetadata,
                        parsed.content
                      );
                      await this.#writeFileWithTracking(notePath, updatedContent);
                    } catch (writeError) {
                      console.error(
                        `Failed to write ID to frontmatter for ${noteType.name}/${filename}:`,
                        writeError
                      );
                      // Continue anyway - we have the ID from the database
                    }
                  } else {
                    // Not in database yet, skip this note (it will be indexed later)
                    console.warn(
                      `Note ${noteType.name}/${filename} has no ID in frontmatter and is not in database - skipping`
                    );
                    continue;
                  }
                } catch (error) {
                  console.warn(
                    `Failed to look up ID for note ${noteType.name}/${filename}:`,
                    error
                  );
                  continue;
                }
              } else {
                // No database available, skip this note
                console.warn(
                  `Note ${noteType.name}/${filename} has no ID in frontmatter and no database available - skipping`
                );
                continue;
              }
            }

            notes.push({
              id: noteId,
              type: noteType.name,
              filename,
              title: parsed.metadata.title || '',
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
        // Get ID from frontmatter (for migrated notes) or generate if missing (legacy notes)
        const noteId =
          typeof parsed.metadata.id === 'string'
            ? parsed.metadata.id
            : this.generateNoteId();

        // Determine type from frontmatter or fallback to parent directory name
        const parentDir = path.basename(path.dirname(notePath));
        const noteType =
          (typeof parsed.metadata.type === 'string' ? parsed.metadata.type : null) ||
          parentDir;

        await this.#hybridSearchManager.upsertNote(
          noteId,
          parsed.metadata.title || filename.replace('.md', ''),
          parsed.content,
          noteType,
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
    // Skip link extraction during tests
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return;
    }

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
    // Skip search index removal during tests
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return;
    }

    try {
      // Remove from hybrid search index if available
      if (this.#hybridSearchManager) {
        const content = await fs.readFile(notePath, 'utf-8');
        const parsed = parseNoteContent(content);
        // Get ID from frontmatter (for migrated notes) or generate if missing (legacy notes)
        const noteId =
          typeof parsed.metadata.id === 'string'
            ? parsed.metadata.id
            : this.generateNoteId();

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

    const response = await this.#hybridSearchManager.searchNotes(
      options.query,
      options.type_filter || null,
      options.limit || 50
    );
    return response.results;
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
   * Validate that metadata does not contain system fields
   *
   * This method prevents modification of system-managed fields through regular
   * metadata updates. System fields include all automatically-managed fields
   * defined in SYSTEM_FIELDS.
   *
   * This protection ensures that:
   * 1. Note renaming goes through the proper rename_note tool which handles wikilink updates and filename synchronization
   * 2. Note type changes go through the move_note tool with proper file relocation
   * 3. File system consistency is maintained
   * 4. Note IDs and references remain stable
   * 5. Users receive clear guidance on the correct tool to use
   *
   * @param metadata - The metadata object to validate
   * @throws Error with descriptive message directing users to appropriate tools if system fields are present
   */
  #validateNoProtectedFields(metadata: NoteMetadata): void {
    const foundSystemFields: string[] = [];

    for (const [key, value] of Object.entries(metadata)) {
      if (SYSTEM_FIELDS.has(key) && value !== undefined && value !== null) {
        foundSystemFields.push(key);
      }
    }

    if (foundSystemFields.length > 0) {
      const fieldList = foundSystemFields.join(', ');
      const typeMessage = foundSystemFields.includes('type')
        ? `Use the 'move_note' tool to safely move notes between note types with proper file relocation and link updates. `
        : '';
      const titleMessage = foundSystemFields.some((field) =>
        ['title', 'filename'].includes(field)
      )
        ? `Use the 'rename_note' tool to safely update note titles with automatic filename synchronization and link preservation. `
        : '';
      const timestampMessage = foundSystemFields.some((field) =>
        ['created', 'updated'].includes(field)
      )
        ? `The 'created' and 'updated' fields are handled automatically and cannot be modified manually. `
        : '';
      const otherMessage = foundSystemFields.some((field) =>
        ['id', 'path', 'content', 'content_hash', 'size'].includes(field)
      )
        ? `System fields like 'id', 'path', 'content', 'content_hash', and 'size' are managed automatically by the system.`
        : '';

      throw new Error(
        `Cannot modify system field(s): ${fieldList}. ` +
          typeMessage +
          titleMessage +
          timestampMessage +
          otherMessage
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

      // Note ID remains unchanged - it's immutable and stored in frontmatter
      const noteId = currentNote.id;

      // Track old filename for wikilink updates
      const oldFilename = currentNote.filename.replace(/\.md$/, '');
      const newFilename = finalBaseFilename;

      // Update the metadata with new title and filename
      const updatedMetadata = {
        ...currentNote.metadata,
        title: trimmedTitle,
        filename: finalBaseFilename,
        updated: new Date().toISOString()
      };

      // Create the updated content
      const updatedContent = this.formatUpdatedNoteContent(
        updatedMetadata,
        currentNote.content
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
      await this.#writeFileWithTracking(finalNotePath, updatedContent);

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
            noteId,
            trimmedTitle,
            db
          );
        } catch (error) {
          console.warn('Failed to update broken links:', error);
          // Continue with operation - broken link updates are not critical
        }

        // Update wikilinks for filename changes (if filename changed)
        // Note: ID stays the same, but we need to update the wikilink text in markdown
        if (oldFilename !== newFilename) {
          try {
            const moveResult = await LinkExtractor.updateWikilinksForMovedNote(
              noteId,
              noteId,
              trimmedTitle,
              db,
              this.#workspace.rootPath
            );
            wikilinksResult.notesUpdated += moveResult.notesUpdated;
            wikilinksResult.linksUpdated += moveResult.linksUpdated;
          } catch (error) {
            console.warn('Failed to update wikilinks for renamed note:', error);
            // Continue with operation - wikilink updates are not critical for core functionality
          }
        }

        // Always update wikilinks for title changes
        try {
          const renameResult = await LinkExtractor.updateWikilinksForRenamedNote(
            noteId,
            currentNote.title,
            trimmedTitle,
            noteId,
            db,
            this.#workspace.rootPath
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
        new_id: noteId
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
    } = await this.parseNoteIdentifier(identifier);

    // Check if target note type exists - don't create it automatically
    const targetTypePath = this.#workspace.getNoteTypePath(newType);
    try {
      await fs.access(targetTypePath);
    } catch {
      throw new NoteTypeNotFoundError(newType);
    }
    const targetPath = path.join(targetTypePath, filename);

    // If moving to same type, return success without doing anything
    if (oldType === newType) {
      const noteId = currentNote.id;
      const timestamp = new Date().toISOString();
      return {
        success: true,
        old_id: noteId,
        new_id: noteId,
        old_type: oldType,
        new_type: newType,
        old_path: currentPath,
        new_path: currentPath,
        filename,
        title: currentNote.title,
        timestamp,
        links_updated: 0,
        notes_with_updated_links: 0
      };
    }

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
    await this.#writeFileWithTracking(targetPath, updatedContent);

    // Update search index at new location
    await this.updateSearchIndex(targetPath, updatedContent);

    // Note ID remains unchanged - it's immutable and stored in frontmatter
    const noteId = currentNote.id;

    let linksUpdated = 0;
    let notesWithUpdatedLinks = 0;

    // Update links if search manager is available
    if (this.#hybridSearchManager) {
      const db = await this.#hybridSearchManager.getDatabaseConnection();

      // Update all links that reference the old path
      // Note: ID stays the same, but wikilink text needs to update to new type/filename
      const result = await LinkExtractor.updateWikilinksForMovedNote(
        noteId,
        noteId,
        currentNote.title,
        db,
        this.#workspace.rootPath
      );

      linksUpdated = result.linksUpdated;
      notesWithUpdatedLinks = result.notesUpdated;
    }

    const timestamp = new Date().toISOString();

    return {
      success: true,
      old_id: noteId,
      new_id: noteId,
      old_type: oldType,
      new_type: newType,
      old_path: currentPath,
      new_path: targetPath,
      filename,
      title: currentNote.title,
      timestamp,
      links_updated: linksUpdated,
      notes_with_updated_links: notesWithUpdatedLinks
    };
  }

  /**
   * Public method to sync hierarchy changes back to note frontmatter
   */
  async syncHierarchyToFrontmatter(noteId: string): Promise<void> {
    await this.#syncHierarchyToSubnotes(noteId);
  }
}
