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
import { SYSTEM_FIELDS, DEFAULT_NOTE_KIND, type NoteKind } from './system-fields.js';

interface ParsedNote {
  metadata: NoteMetadata;
  content: string;
}

export interface NoteInfo {
  id: string;
  type: string;
  kind: NoteKind;
  title: string;
  filename: string;
  path: string;
  created: string;
}

export interface Note {
  [key: string]: unknown;
  id: string;
  type: string;
  kind: NoteKind;
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
  path: string;
  archived?: boolean;
  flint_kind?: string;
}

export interface ArchiveNoteResult {
  id: string;
  archived: boolean;
  timestamp: string;
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

  // Track expected content hashes for robust internal change detection
  // Maps file path to set of content hashes we're expecting to see
  private expectedContent: Map<string, Set<string>> = new Map();

  // Default delay before flushing write (1000ms per approved decisions)
  private readonly defaultDelay: number;

  // Retry configuration (3 attempts with exponential backoff)
  private readonly maxRetries = 3;
  private readonly retryDelays = [100, 500, 1000]; // milliseconds

  // Fallback timeout to clean up expected content hashes
  // Primary cleanup happens immediately via markContentConsumed() when file watcher processes the change
  // This timeout is a safety net for edge cases (file watcher stopped, chokidar miss, etc.)
  // 2 seconds provides buffer for chokidar's awaitWriteFinish (200ms) + debounce (100ms) + processing delays
  private readonly expectedContentTTL: number;

  constructor(defaultDelay: number = 1000, expectedContentTTL: number = 2000) {
    this.defaultDelay = defaultDelay;
    this.expectedContentTTL = expectedContentTTL;
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
    // CRITICAL: Normalize path for consistent Map key across all lookups
    // File watcher uses path.resolve(), so we must too
    const normalizedPath = path.resolve(filePath);

    // Clear existing timeout for this file (if rapid edits, only last one writes)
    const existing = this.pendingWrites.get(normalizedPath);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    // Schedule new write with delay
    const timeout = setTimeout(async () => {
      await this.flushWrite(normalizedPath);
    }, delay);

    this.pendingWrites.set(normalizedPath, {
      filePath: normalizedPath,
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
    // CRITICAL: Normalize path for consistent Map key lookup
    const normalizedPath = path.resolve(filePath);
    const pending = this.pendingWrites.get(normalizedPath);
    if (!pending) {
      return; // Nothing pending for this file
    }

    // Clear the timeout
    clearTimeout(pending.timeout);

    // Compute hash and track as expected BEFORE writing
    // This ensures file watcher will find it when chokidar detects the change
    const contentHash = generateContentHash(pending.content);
    if (!this.expectedContent.has(normalizedPath)) {
      this.expectedContent.set(normalizedPath, new Set());
    }
    this.expectedContent.get(normalizedPath)!.add(contentHash);

    try {
      // Perform the actual write
      await fs.writeFile(normalizedPath, pending.content, 'utf-8');

      // Success - remove from pending
      this.pendingWrites.delete(normalizedPath);

      // Schedule fallback cleanup of expected content hash
      // Primary cleanup happens immediately when file watcher detects internal change
      // This timeout is a safety net for edge cases (file watcher stopped, etc.)
      setTimeout(() => {
        const hashes = this.expectedContent.get(normalizedPath);
        if (hashes) {
          hashes.delete(contentHash);
          if (hashes.size === 0) {
            this.expectedContent.delete(normalizedPath);
          }
        }
      }, this.expectedContentTTL);
    } catch (error) {
      // Write failed - attempt retry if within limit
      if (pending.retryCount < this.maxRetries) {
        const retryDelay = this.retryDelays[pending.retryCount];
        pending.retryCount++;

        console.warn(
          `[FileWriteQueue] Write failed for ${normalizedPath}, retry ${pending.retryCount}/${this.maxRetries} in ${retryDelay}ms`,
          error
        );

        // Schedule retry with exponential backoff
        pending.timeout = setTimeout(async () => {
          await this.flushWrite(normalizedPath);
        }, retryDelay);

        this.pendingWrites.set(normalizedPath, pending);
      } else {
        // Max retries exceeded - log error and remove from queue
        console.error(
          `[FileWriteQueue] Write failed for ${normalizedPath} after ${this.maxRetries} retries`,
          error
        );

        this.pendingWrites.delete(normalizedPath);

        // Clean up expected content hash since write never succeeded
        const hashes = this.expectedContent.get(normalizedPath);
        if (hashes) {
          hashes.delete(contentHash);
          if (hashes.size === 0) {
            this.expectedContent.delete(normalizedPath);
          }
        }

        // TODO: In Phase 1, we'll add error tracking to database
        // For now, just log the error
        // Future: publishFileWriteError(filePath, error)
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
    await Promise.all(paths.map((path) => this.flushWrite(path)));
  }

  /**
   * Cancel all pending operations for a specific file path
   * Used when a file is being moved/renamed to prevent orphaned state
   *
   * @param filePath Path to cancel operations for
   */
  async cancelPendingOperations(filePath: string): Promise<void> {
    const normalizedPath = path.resolve(filePath);

    // Flush any pending write immediately
    if (this.pendingWrites.has(normalizedPath)) {
      await this.flushWrite(normalizedPath);
    }

    // Clear any expected content hashes for this path
    if (this.expectedContent.has(normalizedPath)) {
      this.expectedContent.delete(normalizedPath);
    }
  }

  /**
   * Check if a file has a pending write
   *
   * @param filePath Path to check
   * @returns True if write is queued
   */
  hasPendingWrite(filePath: string): boolean {
    const normalizedPath = path.resolve(filePath);
    return this.pendingWrites.has(normalizedPath);
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
   * Check if a content hash is expected for a file
   * Used by file watcher to determine if a change is internal
   *
   * @param filePath Path to the file
   * @param contentHash Hash of the file content
   * @returns True if this content hash matches what we expect to write
   */
  isContentExpected(filePath: string, contentHash: string): boolean {
    // CRITICAL: Normalize path for consistent Map key lookup
    // Must match normalization in queueWrite()
    const normalizedPath = path.resolve(filePath);

    const expectedHashes = this.expectedContent.get(normalizedPath);
    return expectedHashes ? expectedHashes.has(contentHash) : false;
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
  #fileWriteQueue: FileWriteQueue;

  constructor(workspace: Workspace, hybridSearchManager?: HybridSearchManager) {
    this.#workspace = workspace;

    // Pass database manager to NoteTypeManager if available
    const dbManager = hybridSearchManager?.getDatabaseManager();
    this.#noteTypeManager = new NoteTypeManager(workspace, dbManager);

    this.#hybridSearchManager = hybridSearchManager;

    // Initialize file write queue (Phase 2: DB-first architecture)
    // Using 1000ms delay for actual write batching and I/O reduction
    // This achieves 50%+ file I/O reduction during rapid editing
    // In test environment, use 0ms delay for synchronous behavior
    const queueDelay = process.env.NODE_ENV === 'test' || process.env.VITEST ? 0 : 1000;
    this.#fileWriteQueue = new FileWriteQueue(queueDelay);

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
   * Phase 2: Queue with 1000ms delay for actual write batching
   * This achieves 50%+ file I/O reduction during rapid editing
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
   *
   * @param typeName - The note type for organization (e.g., 'note', 'reference')
   * @param title - The note title
   * @param content - The note content body
   * @param metadata - Optional custom metadata fields
   * @param enforceRequiredFields - Whether to enforce required metadata fields
   * @param kind - The content rendering type ('markdown' or 'epub')
   */
  async createNote(
    typeName: string,
    title: string,
    content: string,
    metadata: Record<string, unknown> = {},
    enforceRequiredFields: boolean = true,
    kind: NoteKind = DEFAULT_NOTE_KIND
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
        noteId,
        kind
      );

      // Phase 2: DB-first architecture - Update database before queuing file write
      // Note: updateSearchIndex may return rewritten content with title-based links converted to ID-based
      const finalNoteContent = await this.updateSearchIndex(notePath, noteContent);

      // Queue file write (batched with 1000ms delay)
      await this.#writeFileWithTracking(notePath, finalNoteContent);

      // Sync hierarchy if subnotes are specified in metadata
      if (metadata.subnotes && Array.isArray(metadata.subnotes)) {
        await this.#syncSubnotesToHierarchy(noteId, metadata.subnotes as string[]);
      }

      // Rewrite broken links in other notes that were linking to this title
      // This converts [[title]] to [[n-id]] in notes that had broken links
      await this.rewriteBrokenLinksAfterNoteCreation(noteId, trimmedTitle);

      return {
        id: noteId,
        type: typeName,
        kind,
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
   *
   * Writes both new flint_* prefixed fields and legacy fields for backward compatibility.
   *
   * @param title - Note title
   * @param content - Note body content
   * @param typeName - Note type for organization
   * @param metadata - Custom metadata fields
   * @param noteId - Optional note ID (generated if not provided)
   * @param kind - Content rendering type (defaults to markdown)
   */
  async formatNoteContent(
    title: string,
    content: string,
    typeName: string,
    metadata: Record<string, unknown> = {},
    noteId?: string,
    kind: NoteKind = DEFAULT_NOTE_KIND
  ): Promise<string> {
    const timestamp = new Date().toISOString();
    const filename = this.generateFilename(title);
    const baseFilename = path.basename(filename, '.md');
    const id = noteId || this.generateNoteId();

    let formattedContent = '---\n';

    // Write new flint_* prefixed system fields first
    formattedContent += `flint_id: ${id}\n`;
    if (title && title.trim().length > 0) {
      formattedContent += `flint_title: "${title}"\n`;
    }
    formattedContent += `flint_filename: "${baseFilename}"\n`;
    formattedContent += `flint_type: ${typeName}\n`;
    formattedContent += `flint_kind: ${kind}\n`;
    formattedContent += `flint_created: ${timestamp}\n`;
    formattedContent += `flint_updated: ${timestamp}\n`;

    // Mapping from legacy to flint_* field names for output
    const LEGACY_TO_FLINT_OUTPUT: Record<string, string> = {
      archived: 'flint_archived'
    };

    // Path system fields that should be written during creation
    // These are "write-once" fields: set at creation, immutable afterward
    // These are true system fields; others can be updated via API
    const PATH_WRITE_ONCE_FIELDS = new Set([
      'flint_epubPath',
      'flint_pdfPath',
      'flint_webpagePath',
      'flint_webpageOriginalPath'
    ]);

    // Add custom metadata fields
    for (const [key, value] of Object.entries(metadata)) {
      // Skip system fields (both old and new prefixed versions)
      // But allow path write-once fields to be set during creation
      if (SYSTEM_FIELDS.has(key) && !PATH_WRITE_ONCE_FIELDS.has(key)) {
        continue;
      }

      // Skip legacy fields if their flint_* equivalent exists in metadata
      const flintEquivalent = LEGACY_TO_FLINT_OUTPUT[key];
      if (
        flintEquivalent &&
        metadata[flintEquivalent as keyof typeof metadata] !== undefined
      ) {
        continue;
      }

      // Convert legacy field names to flint_* equivalents when writing
      const outputKey = flintEquivalent || key;

      if (Array.isArray(value)) {
        const escapedArray = value.map((v) => {
          if (typeof v === 'string') {
            const escapedValue = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            return `"${escapedValue}"`;
          }
          return v;
        });
        formattedContent += `${outputKey}: [${escapedArray.join(', ')}]\n`;
      } else if (typeof value === 'string') {
        // Escape quotes and backslashes in string values
        const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        formattedContent += `${outputKey}: "${escapedValue}"\n`;
      } else {
        formattedContent += `${outputKey}: ${value}\n`;
      }
    }

    formattedContent += '---\n\n';

    formattedContent += content;

    return formattedContent;
  }

  /**
   * Get a specific note by identifier (Phase 2.5: DB-first reads)
   * Reads from database for immediate consistency, falls back to file system if needed
   */
  async getNote(identifier: string): Promise<Note> {
    try {
      let noteId: string;

      // Check if identifier is an immutable ID (format: n-xxxxxxxx)
      if (identifier.startsWith('n-')) {
        noteId = identifier;
      } else {
        // Old-style identifier (type/filename) - look up ID from database
        const parsed = await this.parseNoteIdentifier(identifier);
        const typeName = parsed.typeName;
        const filename = parsed.filename;

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

      // Phase 2.5: Read from database first for immediate read-after-write consistency
      if (this.#hybridSearchManager) {
        try {
          const dbNote = await this.#hybridSearchManager.getNoteById(noteId);

          if (dbNote) {
            // Successfully read from database - return immediately
            // Generate content hash for optimistic locking
            const contentHash = generateContentHash(dbNote.content);

            // Determine kind from database column first, then metadata, then default
            const metadata = dbNote.metadata as NoteMetadata;

            // Normalize metadata: populate legacy fields from flint_* fields for backward compatibility
            const FLINT_TO_LEGACY: Record<string, string> = {
              flint_id: 'id',
              flint_type: 'type',
              flint_title: 'title',
              flint_filename: 'filename',
              flint_created: 'created',
              flint_updated: 'updated',
              flint_archived: 'archived'
            };
            for (const [flintField, legacyField] of Object.entries(FLINT_TO_LEGACY)) {
              if (
                metadata[flintField as keyof NoteMetadata] !== undefined &&
                metadata[legacyField as keyof NoteMetadata] === undefined
              ) {
                (metadata as Record<string, unknown>)[legacyField] =
                  metadata[flintField as keyof NoteMetadata];
              }
            }

            const noteKind: NoteKind =
              (dbNote.flint_kind as NoteKind) ||
              (metadata.flint_kind as NoteKind) ||
              DEFAULT_NOTE_KIND;

            return {
              id: dbNote.id,
              type: dbNote.type,
              kind: noteKind,
              filename: dbNote.filename,
              path: dbNote.path,
              title: dbNote.title || '',
              content: dbNote.content,
              content_hash: contentHash,
              metadata,
              created: dbNote.created,
              modified: dbNote.updated,
              updated: dbNote.updated,
              size: dbNote.size
            };
          }
        } catch (error) {
          // Log but don't fail - fall through to file system fallback
          console.warn(
            `Failed to read note from database, falling back to file system:`,
            error
          );
        }
      }

      // Fallback to file system if:
      // 1. Database not available
      // 2. Note not found in database (migration/sync case)
      // 3. Database read failed
      const parsed = await this.parseNoteIdentifier(identifier);
      const typeName = parsed.typeName;
      const filename = parsed.filename;
      const notePath = parsed.notePath;

      // Check if note exists
      try {
        await fs.access(notePath);
      } catch {
        throw new Error(`Note not found: ${identifier}`);
      }

      // Read note content from file
      const content = await fs.readFile(notePath, 'utf-8');
      const stats = await fs.stat(notePath);

      // Parse frontmatter and content
      const parsedContent = this.parseNoteContent(content);

      // Generate content hash for optimistic locking
      const contentHash = generateContentHash(parsedContent.content);

      // Determine kind from metadata, defaulting to markdown
      const noteKind: NoteKind =
        (parsedContent.metadata.flint_kind as NoteKind) || DEFAULT_NOTE_KIND;

      return {
        id: noteId,
        type: typeName,
        kind: noteKind,
        filename,
        path: notePath,
        title:
          (parsedContent.metadata.flint_title as string) ||
          (parsedContent.metadata.title as string) ||
          '',
        content: parsedContent.content,
        content_hash: contentHash,
        metadata: parsedContent.metadata,
        created: parsedContent.metadata.created || stats.birthtime.toISOString(),
        modified: parsedContent.metadata.updated || stats.mtime.toISOString(),
        updated: parsedContent.metadata.updated || stats.mtime.toISOString(),
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
   * Get a note by file path (Phase 2.5: DB-first reads)
   * Reads from database for immediate consistency, falls back to file system if needed
   */
  async getNoteByPath(filePath: string): Promise<Note | null> {
    try {
      // Validate path is in workspace
      if (!this.#workspace.isPathInWorkspace(filePath)) {
        throw new Error('Path is outside workspace');
      }

      // Phase 2.5: Read from database first for immediate read-after-write consistency
      if (this.#hybridSearchManager) {
        try {
          const dbNote = await this.#hybridSearchManager.getNoteByPath(filePath);

          if (dbNote) {
            // Successfully read from database - return immediately
            // Generate content hash for optimistic locking
            const contentHash = generateContentHash(dbNote.content);

            // Determine kind from metadata, defaulting to markdown
            const metadata = dbNote.metadata as NoteMetadata;
            const noteKind: NoteKind =
              (metadata.flint_kind as NoteKind) || DEFAULT_NOTE_KIND;

            return {
              id: dbNote.id,
              type: dbNote.type,
              kind: noteKind,
              filename: dbNote.filename,
              path: dbNote.path,
              title: dbNote.title || '',
              content: dbNote.content,
              content_hash: contentHash,
              metadata,
              created: dbNote.created,
              modified: dbNote.updated,
              updated: dbNote.updated,
              size: dbNote.size
            };
          }
        } catch (error) {
          // Log but don't fail - fall through to file system fallback
          console.warn(
            `Failed to read note from database, falling back to file system:`,
            error
          );
        }
      }

      // Fallback to file system if:
      // 1. Database not available
      // 2. Note not found in database (migration/sync case)
      // 3. Database read failed

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

      // Read note content from file
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);

      // Parse frontmatter and content
      const parsed = this.parseNoteContent(content);

      // Generate content hash for optimistic locking
      const contentHash = generateContentHash(parsed.content);

      // Determine kind from metadata, defaulting to markdown
      const noteKind: NoteKind =
        (parsed.metadata.flint_kind as NoteKind) || DEFAULT_NOTE_KIND;

      return {
        id: identifier,
        type: typeName,
        kind: noteKind,
        filename,
        path: filePath,
        title:
          (parsed.metadata.flint_title as string) ||
          (parsed.metadata.title as string) ||
          '',
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
   * Update an existing note (Phase 2.5: DB-first reads for validation)
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

      // Phase 2.5: Get current note from database for validation (faster + current data)
      const currentNote = await this.getNote(identifier);
      if (!currentNote) {
        throw new Error(`Note '${identifier}' does not exist`);
      }

      // Validate content hash to prevent conflicts (using DB content, not file)
      validateContentHash(currentNote.content, contentHash);

      const { notePath } = await this.parseNoteIdentifier(identifier);

      // Update the content while preserving metadata (flint_* prefixed fields only)
      const updateTime = new Date().toISOString();
      const updatedMetadata = {
        ...currentNote.metadata,
        flint_updated: updateTime
      };

      const updatedContent = this.formatUpdatedNoteContent(updatedMetadata, newContent);

      // Phase 2: DB-first architecture - Update database before queuing file write
      // This ensures DB is always source of truth and eliminates race conditions
      // Note: updateSearchIndex may return rewritten content with title-based links converted to ID-based
      const finalContent = await this.updateSearchIndex(notePath, updatedContent);

      // Queue file write (batched with 1000ms delay)
      await this.#writeFileWithTracking(notePath, finalContent);

      return {
        id: identifier,
        updated: true,
        timestamp: updateTime
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
    // Legacy fields that should be skipped if their flint_* equivalent exists
    // This prevents writing both legacy and flint_* fields to the frontmatter
    const LEGACY_TO_FLINT: Record<string, string> = {
      id: 'flint_id',
      type: 'flint_type',
      title: 'flint_title',
      filename: 'flint_filename',
      created: 'flint_created',
      updated: 'flint_updated',
      archived: 'flint_archived'
    };

    let formattedContent = '---\n';

    for (const [key, value] of Object.entries(metadata)) {
      // Skip undefined values (used to explicitly remove properties from frontmatter)
      if (value === undefined) {
        continue;
      }

      // Skip legacy fields if their flint_* equivalent exists in metadata
      const flintEquivalent = LEGACY_TO_FLINT[key];
      if (flintEquivalent && metadata[flintEquivalent] !== undefined) {
        continue;
      }

      // Determine the output key - convert legacy field names to flint_* equivalents
      const outputKey = flintEquivalent || key;

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
          formattedContent += `${outputKey}: [${escapedArray.join(', ')}]\n`;
        } else {
          formattedContent += `${outputKey}: []\n`;
        }
      } else if (typeof value === 'string') {
        // Always quote strings to handle special characters properly
        // Escape quotes and backslashes in string values
        const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        formattedContent += `${outputKey}: "${escapedValue}"\n`;
      } else {
        formattedContent += `${outputKey}: ${value}\n`;
      }
    }

    formattedContent += '---\n\n';
    formattedContent += newContent;

    return formattedContent;
  }

  /**
   * Update a note with custom metadata, avoiding duplicate frontmatter (Phase 2.5: DB-first reads)
   */
  async updateNoteWithMetadata(
    identifier: string,
    content: string,
    metadata: NoteMetadata,
    contentHash: string,
    bypassProtection: boolean = false
  ): Promise<UpdateResult> {
    try {
      // Phase 2.5: Get current note from database for validation (faster + current data)
      const currentNote = await this.getNote(identifier);
      if (!currentNote) {
        throw new Error(`Note '${identifier}' does not exist`);
      }

      const { notePath } = await this.parseNoteIdentifier(identifier);

      // Only validate content hash if content is actually changing
      // This allows metadata-only updates without requiring hash checks
      if (content !== currentNote.content) {
        if (!contentHash) {
          throw new MissingContentHashError('note content update');
        }
        // Validate content hash to prevent conflicts (using DB content, not file)
        validateContentHash(currentNote.content, contentHash);
      }

      // Check for protected fields unless bypassing protection
      if (!bypassProtection) {
        this.#validateNoProtectedFields(metadata);
      }

      // Merge metadata with existing metadata (flint_* prefixed fields only)
      // Handle undefined values explicitly to allow removing fields
      const updateTime = new Date().toISOString();
      const updatedMetadata = {
        ...currentNote.metadata,
        flint_updated: updateTime
      };

      // Mapping from legacy to flint_* field names
      const LEGACY_TO_FLINT: Record<string, string> = {
        id: 'flint_id',
        type: 'flint_type',
        title: 'flint_title',
        filename: 'flint_filename',
        created: 'flint_created',
        updated: 'flint_updated',
        archived: 'flint_archived'
      };

      // Apply new metadata, explicitly deleting undefined values
      // Also sync legacy fields to their flint_* equivalents
      for (const [key, value] of Object.entries(metadata)) {
        if (value === undefined) {
          delete updatedMetadata[key];
          // Also delete the flint_* equivalent if a legacy field is deleted
          const flintKey = LEGACY_TO_FLINT[key];
          if (flintKey) {
            delete updatedMetadata[flintKey];
          }
        } else {
          updatedMetadata[key] = value;
          // If a legacy field is updated, also update its flint_* equivalent
          const flintKey = LEGACY_TO_FLINT[key];
          if (flintKey) {
            updatedMetadata[flintKey] = value;
          }
        }
      }

      // Format content with metadata
      const formattedContent = this.formatUpdatedNoteContent(updatedMetadata, content);

      // Phase 2: DB-first architecture - Update database before queuing file write
      // Note: updateSearchIndex may return rewritten content with title-based links converted to ID-based
      const finalContent = await this.updateSearchIndex(notePath, formattedContent);

      // Queue file write (batched with 1000ms delay)
      await this.#writeFileWithTracking(notePath, finalContent);

      // Sync hierarchy if subnotes have changed
      if (metadata.subnotes !== undefined) {
        const subnotes = Array.isArray(metadata.subnotes) ? metadata.subnotes : [];
        await this.#syncSubnotesToHierarchy(identifier, subnotes);
      }

      return {
        id: identifier,
        updated: true,
        timestamp: updateTime
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
   * Find incoming links to a note (Phase 2.5: DB-first reads)
   * Queries database link table for fast lookups
   */
  async findIncomingLinks(identifier: string): Promise<string[]> {
    try {
      // Phase 2.5: Query database link table (much faster than reading files)
      if (this.#hybridSearchManager) {
        try {
          // Get the note ID for identifier lookup
          let noteId = identifier;
          if (!identifier.startsWith('n-')) {
            // Old-style identifier - look up ID
            const note = await this.getNote(identifier);
            if (note) {
              noteId = note.id;
            }
          }

          const db = await this.#hybridSearchManager.getDatabaseConnection();

          // Query note_links table for links targeting this note
          const links = await db.all<{
            source_note_id: string;
            type: string;
            filename: string;
          }>(
            `SELECT DISTINCT nl.source_note_id, n.type, n.filename
             FROM note_links nl
             JOIN notes n ON nl.source_note_id = n.id
             WHERE nl.target_note_id = ? OR nl.target_title = ?`,
            [noteId, identifier]
          );

          return links.map((link) => `${link.type}/${link.filename}`);
        } catch (error) {
          console.warn(
            `Failed to query incoming links from database, falling back to file scan:`,
            error
          );
        }
      }

      // Fallback to file system scan if database not available
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

        // Check tags filter - tags are now a user-managed custom field in metadata
        if (criteria.tags && criteria.tags.length > 0 && matches) {
          try {
            const noteContent = await fs.readFile(note.path, 'utf-8');
            const parsed = parseFrontmatter(noteContent);
            // Tags are now a user-managed custom field, access via index signature
            const metadataTags = (parsed.metadata as Record<string, unknown>)?.tags;
            const noteTags = Array.isArray(metadataTags)
              ? metadataTags.map((t) => String(t))
              : [];
            const hasAllTags = criteria.tags.every((tag) => noteTags.includes(tag));
            if (!hasAllTags) {
              matches = false;
            }
          } catch {
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
   * List notes in a specific type (Phase 2.5: DB-first reads)
   * Queries database for immediate consistency, falls back to file system if needed
   */
  async listNotes(
    typeName?: string,
    limit?: number,
    includeArchived?: boolean
  ): Promise<NoteListItem[]> {
    try {
      // Phase 2.5: Query database first for immediate read-after-write consistency
      if (this.#hybridSearchManager) {
        try {
          const dbNotes = await this.#hybridSearchManager.listNotes({
            type: typeName,
            limit,
            includeArchived
          });

          // Successfully read from database - return immediately
          return dbNotes;
        } catch (error) {
          // Log but don't fail - fall through to file system fallback
          console.warn(
            `Failed to list notes from database, falling back to file system:`,
            error
          );
        }
      }

      // Fallback to file system if database not available or failed
      // This provides backward compatibility and migration support
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

            // Generate a temporary ID if missing (shouldn't happen with indexed notes)
            const noteId =
              typeof parsed.metadata.id === 'string'
                ? parsed.metadata.id
                : `${noteType.name}/${filename}`;

            notes.push({
              id: noteId,
              type: noteType.name,
              filename,
              title:
                (parsed.metadata.flint_title as string) ||
                (parsed.metadata.title as string) ||
                '',
              created: stats.birthtime.toISOString(),
              modified: stats.mtime.toISOString(),
              size: stats.size,
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
   * Returns the potentially rewritten content (with title-based links converted to ID-based)
   */
  async updateSearchIndex(notePath: string, content: string): Promise<string> {
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

        // Convert title-based links to ID-based links and get rewritten content
        const rewrittenContent = await this.convertTitleLinksToIdLinks(
          noteId,
          parsed.content
        );

        // If content was rewritten, reconstruct the full content with frontmatter
        let finalContent = content;
        if (rewrittenContent !== parsed.content) {
          finalContent = this.formatUpdatedNoteContent(parsed.metadata, rewrittenContent);
        }

        await this.#hybridSearchManager.upsertNote(
          noteId,
          (parsed.metadata.flint_title as string) || (parsed.metadata.title as string),
          rewrittenContent,
          noteType,
          filename,
          notePath,
          parsed.metadata
        );

        // Extract and store links in the database (using rewritten content)
        await this.extractAndStoreLinks(noteId, rewrittenContent);

        return finalContent;
      }
    } catch (error) {
      // Don't fail note operations if search index update fails
      console.error(
        'Failed to update search index:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
    return content;
  }

  /**
   * Convert title-based wikilinks to ID-based wikilinks
   */
  private async convertTitleLinksToIdLinks(
    _noteId: string,
    content: string
  ): Promise<string> {
    try {
      if (this.#hybridSearchManager) {
        const db = await this.#hybridSearchManager.getDatabaseConnection();
        return await LinkExtractor.convertTitleLinksToIdLinks(content, db);
      }
    } catch (error) {
      // Don't fail note operations if link conversion fails
      console.error(
        'Failed to convert title-based links:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
    return content;
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
   * Rewrite broken links in source notes after a new note is created
   * This converts [[title]] to [[n-id]] in notes that were linking to a non-existent note
   */
  private async rewriteBrokenLinksAfterNoteCreation(
    newNoteId: string,
    newNoteTitle: string
  ): Promise<{ notesUpdated: number; linksUpdated: number }> {
    if (!this.#hybridSearchManager) {
      return { notesUpdated: 0, linksUpdated: 0 };
    }

    try {
      const db = await this.#hybridSearchManager.getDatabaseConnection();

      // Find source notes that have broken links matching this title
      const sourceNoteIds = await LinkExtractor.getNotesWithBrokenLinkToTitle(
        newNoteTitle,
        db
      );

      if (sourceNoteIds.length === 0) {
        return { notesUpdated: 0, linksUpdated: 0 };
      }

      // Update broken links in the database
      const linksUpdated = await LinkExtractor.updateBrokenLinks(
        newNoteId,
        newNoteTitle,
        db
      );

      let notesUpdated = 0;

      // Rewrite each source note's content
      for (const sourceNoteId of sourceNoteIds) {
        try {
          // Get the source note from database
          const sourceNote = await this.#hybridSearchManager.getNoteById(sourceNoteId);
          if (!sourceNote) {
            continue;
          }

          // Read the current file content to get full frontmatter
          const currentContent = await fs.readFile(sourceNote.path, 'utf-8');
          const parsed = parseNoteContent(currentContent);

          // Convert title-based links to ID-based (now the new note exists)
          const rewrittenContent = await LinkExtractor.convertTitleLinksToIdLinks(
            parsed.content,
            db
          );

          // If content changed, update the file and database
          if (rewrittenContent !== parsed.content) {
            const finalContent = this.formatUpdatedNoteContent(
              parsed.metadata,
              rewrittenContent
            );

            // Update database
            await this.#hybridSearchManager.upsertNote(
              sourceNoteId,
              sourceNote.title,
              rewrittenContent,
              sourceNote.type,
              sourceNote.filename,
              sourceNote.path,
              parsed.metadata
            );

            // Update links in database
            const extractionResult = LinkExtractor.extractLinks(rewrittenContent);
            await LinkExtractor.storeLinks(sourceNoteId, extractionResult, db);

            // Write updated file
            await this.#writeFileWithTracking(sourceNote.path, finalContent);

            notesUpdated++;
          }
        } catch (error) {
          console.warn(
            `Failed to rewrite links in note ${sourceNoteId}:`,
            error instanceof Error ? error.message : 'Unknown error'
          );
          // Continue with other notes
        }
      }

      return { notesUpdated, linksUpdated };
    } catch (error) {
      console.error(
        'Failed to rewrite broken links after note creation:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return { notesUpdated: 0, linksUpdated: 0 };
    }
  }

  /**
   * Remove note from search index (Phase 2.5: Required for DB-first reads)
   */
  async removeFromSearchIndex(notePath: string): Promise<void> {
    try {
      // Remove from hybrid search index if available
      if (this.#hybridSearchManager) {
        // Phase 2.5: Try to read from database first for ID lookup
        const dbNote = await this.#hybridSearchManager.getNoteByPath(notePath);

        let noteId: string;
        if (dbNote) {
          // Found in database - use that ID
          noteId = dbNote.id;
        } else {
          // Fallback: read from file if not in database yet
          try {
            const content = await fs.readFile(notePath, 'utf-8');
            const parsed = parseNoteContent(content);
            noteId =
              typeof parsed.metadata.id === 'string'
                ? parsed.metadata.id
                : this.generateNoteId();
          } catch {
            // Can't read file either - skip removal
            console.warn(`Could not determine note ID for removal: ${notePath}`);
            return;
          }
        }

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
    // Allow empty titles - they will use 'untitled.md' as filename
    if (newTitle === undefined || newTitle === null) {
      throw new Error('New title parameter is required (can be empty string)');
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

      // Update the metadata with new title and filename (flint_* prefixed fields only)
      const timestamp = new Date().toISOString();
      const updatedMetadata = {
        ...currentNote.metadata,
        flint_title: trimmedTitle,
        flint_filename: finalBaseFilename,
        flint_updated: timestamp
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
        // CRITICAL: Cancel any pending writes/expected content for the old path
        // before moving the file to prevent orphaned state in FileWriteQueue
        await this.#fileWriteQueue.cancelPendingOperations(currentPath);

        await fs.rename(currentPath, finalNotePath);
        wasFileRenamed = true;
      }

      // Phase 2: DB-first architecture - Update database before queuing file write
      // Note: updateSearchIndex may return rewritten content with title-based links converted to ID-based
      const finalContent = await this.updateSearchIndex(finalNotePath, updatedContent);

      // Queue file write (batched with 1000ms delay)
      await this.#writeFileWithTracking(finalNotePath, finalContent);

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

    // CRITICAL: Cancel any pending writes/expected content for the old path
    // before moving the file to prevent orphaned state in FileWriteQueue
    await this.#fileWriteQueue.cancelPendingOperations(currentPath);

    // Update the metadata with new type and timestamp (both flint_* and legacy versions)
    const updateTime = new Date().toISOString();
    const updatedMetadata = {
      ...currentNote.metadata,
      flint_type: newType,
      type: newType,
      flint_updated: updateTime,
      updated: updateTime
    };

    // Format the content with updated metadata
    const updatedContent = this.formatUpdatedNoteContent(
      updatedMetadata,
      currentNote.content
    );

    // Move the file to the new location
    await fs.rename(currentPath, targetPath);

    // Phase 2: DB-first architecture - Update database before queuing file write
    // Note: updateSearchIndex may return rewritten content with title-based links converted to ID-based
    const finalContent = await this.updateSearchIndex(targetPath, updatedContent);

    // Queue file write (batched with 1000ms delay)
    await this.#writeFileWithTracking(targetPath, finalContent);

    // Note ID remains unchanged - it's immutable and stored in frontmatter
    const noteId = currentNote.id;

    let linksUpdated = 0;
    let notesWithUpdatedLinks = 0;

    // Update links if search manager is available
    if (this.#hybridSearchManager) {
      // Note: With ID-based wikilinks, we no longer need to update links
      // when notes are moved to a different type. The ID remains constant.
      linksUpdated = 0;
      notesWithUpdatedLinks = 0;
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

  /**
   * Archive a note by setting the archived flag in frontmatter and database
   */
  async archiveNote(identifier: string): Promise<ArchiveNoteResult> {
    try {
      // Read current note first - this uses database-first with file system fallback
      // and properly handles both immutable IDs (n-xxx) and old-style identifiers
      const note = await this.getNote(identifier);
      const notePath = note.path;

      // Update metadata to add flint_archived: true
      const timestamp = new Date().toISOString();
      const updatedMetadata: NoteMetadata = {
        ...note.metadata,
        flint_archived: true,
        flint_updated: timestamp
      };

      // Format updated content with archived flag
      const updatedContent = this.formatUpdatedNoteContent(updatedMetadata, note.content);

      // Update database first (database-first architecture)
      if (this.#hybridSearchManager) {
        const db = await this.#hybridSearchManager.getDatabaseConnection();
        await db.run('UPDATE notes SET archived = 1, updated = ? WHERE id = ?', [
          timestamp,
          note.id
        ]);
      }

      // Queue file write (batched with 1000ms delay)
      await this.#writeFileWithTracking(notePath, updatedContent);

      return {
        id: note.id,
        archived: true,
        timestamp
      };
    } catch (error) {
      throw new Error(
        `Failed to archive note: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Unarchive a note by removing the archived flag from frontmatter and database
   */
  async unarchiveNote(identifier: string): Promise<ArchiveNoteResult> {
    try {
      // Read current note first - this uses database-first with file system fallback
      // and properly handles both immutable IDs (n-xxx) and old-style identifiers
      const note = await this.getNote(identifier);
      const notePath = note.path;

      // Update metadata to remove flint_archived flag (set to undefined to remove from frontmatter)
      const timestamp = new Date().toISOString();
      const updatedMetadata: NoteMetadata = {
        ...note.metadata,
        flint_archived: undefined,
        flint_updated: timestamp
      };

      // Format updated content without archived flag
      const updatedContent = this.formatUpdatedNoteContent(updatedMetadata, note.content);

      // Update database first (database-first architecture)
      if (this.#hybridSearchManager) {
        const db = await this.#hybridSearchManager.getDatabaseConnection();
        await db.run('UPDATE notes SET archived = 0, updated = ? WHERE id = ?', [
          timestamp,
          note.id
        ]);
      }

      // Queue file write (batched with 1000ms delay)
      await this.#writeFileWithTracking(notePath, updatedContent);

      return {
        id: note.id,
        archived: false,
        timestamp
      };
    } catch (error) {
      throw new Error(
        `Failed to unarchive note: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
