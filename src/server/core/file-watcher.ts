/**
 * Vault File Watcher
 *
 * Monitors the vault directory for external changes to markdown files
 * and triggers appropriate sync operations while avoiding self-triggered events.
 */

import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import type { HybridSearchManager } from '../database/search-manager.js';
import type { NoteManager } from './notes.js';

/**
 * Tracks file operations initiated by Flint to distinguish them from external changes
 */
interface FileOperation {
  type: 'write' | 'rename' | 'delete';
  startedAt: number;
}

/**
 * Tracks recently deleted files to detect renames
 */
interface RecentDeletion {
  noteId: string;
  deletedAt: number;
  oldPath: string;
  contentHash: string;
}

/**
 * Tracks expected writes from the editor to distinguish auto-saves from external edits
 */
interface ExpectedWrite {
  noteId: string;
  contentHash: string;
  timestamp: number;
  cleanupTimeout: NodeJS.Timeout;
}

/**
 * Configuration for the file watcher
 */
export interface FileWatcherConfig {
  vaultPath: string;
  ignored?: string[];
  debounceMs?: number;
}

/**
 * Event types published by the file watcher
 */
export type FileWatcherEvent =
  | { type: 'external-change'; path: string; noteId?: string }
  | { type: 'external-add'; path: string }
  | { type: 'external-delete'; path: string; noteId?: string }
  | { type: 'external-rename'; oldPath: string; newPath: string; noteId: string }
  | { type: 'external-edit-conflict'; path: string; noteId: string }
  | { type: 'sync-started'; fileCount: number }
  | { type: 'sync-completed'; added: number; updated: number; deleted: number };

export type FileWatcherEventHandler = (event: FileWatcherEvent) => void;

/**
 * VaultFileWatcher monitors a vault directory for external changes
 * and coordinates with the search manager to keep the database in sync.
 */
export class VaultFileWatcher {
  private watcher: FSWatcher | null = null;
  private pendingChanges = new Map<string, NodeJS.Timeout>();
  private internalOperations = new Map<string, FileOperation>();
  private ongoingWrites = new Set<string>(); // Track writes in progress (set BEFORE write)
  private writeCleanupTimeouts = new Map<string, NodeJS.Timeout>(); // Track cleanup timeouts per path
  private recentDeletions = new Map<string, RecentDeletion>();
  private eventHandlers: FileWatcherEventHandler[] = [];

  // Editor-aware tracking
  private openNotes = new Set<string>(); // Notes currently open in editor
  private expectedWrites = new Map<string, ExpectedWrite[]>(); // Expected writes from editor saves (array to handle rapid typing)

  private readonly DEBOUNCE_MS: number;
  private readonly RENAME_DETECTION_WINDOW_MS = 1000;
  private readonly OPERATION_CLEANUP_MS = 5000;
  private readonly WRITE_FLAG_CLEANUP_MS = 1000; // Keep write flag for 1000ms after completion to account for awaitWriteFinish (200ms) + debounce (100ms) + FS latency
  private readonly EXPECTED_WRITE_TIMEOUT_MS = 2000; // Expected writes should complete within 2s

  constructor(
    private vaultPath: string,
    private searchManager: HybridSearchManager,
    private noteManager: NoteManager | null,
    config?: Partial<FileWatcherConfig>
  ) {
    this.DEBOUNCE_MS = config?.debounceMs ?? 100;
  }

  /**
   * Set the note manager (used to resolve circular dependency during initialization)
   */
  setNoteManager(noteManager: NoteManager): void {
    this.noteManager = noteManager;
  }

  /**
   * Register an event handler to be notified of file watcher events
   */
  on(handler: FileWatcherEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index !== -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit an event to all registered handlers
   */
  private emit(event: FileWatcherEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in file watcher event handler:', error);
      }
    }
  }

  /**
   * Start watching the vault directory for changes
   */
  async start(): Promise<void> {
    if (this.watcher) {
      console.warn('File watcher already started');
      return;
    }

    console.log(`[FileWatcher] 🚀 Starting file watcher for vault: ${this.vaultPath}`);

    this.watcher = chokidar.watch(this.vaultPath, {
      ignored: [
        '**/.flint-note/**', // Flint's internal directory
        '**/_description.md', // Note type description files (internal metadata)
        '**/.git/**', // Git directory
        '**/node_modules/**', // Node modules
        '**/.DS_Store', // macOS metadata
        '**/desktop.ini', // Windows metadata
        '**/*~', // Backup files
        '**/*.swp', // Vim swap files
        '**/*.tmp' // Temporary files
      ],
      ignoreInitial: true, // Don't fire events for existing files
      persistent: true, // Keep process running
      awaitWriteFinish: {
        // Wait for write operations to complete
        stabilityThreshold: 200, // Wait 200ms of no changes
        pollInterval: 100 // Check every 100ms
      }
    });

    // Handle file events
    this.watcher
      .on('add', (filePath) => this.onFileAdded(filePath))
      .on('change', (filePath) => this.onFileChanged(filePath))
      .on('unlink', (filePath) => this.onFileDeleted(filePath))
      .on('error', (error: unknown) => this.onError(error))
      .on('ready', () => {
        console.log('[FileWatcher] ✅ Chokidar watcher is ready and watching for changes');
      });
  }

  /**
   * Stop watching the vault directory
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    await this.watcher.close();
    this.watcher = null;

    // Clear all pending changes
    for (const timeout of this.pendingChanges.values()) {
      clearTimeout(timeout);
    }
    this.pendingChanges.clear();

    // Clear all write cleanup timeouts
    for (const timeout of this.writeCleanupTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.writeCleanupTimeouts.clear();

    // Clear expected write cleanup timeouts
    for (const writes of this.expectedWrites.values()) {
      for (const write of writes) {
        clearTimeout(write.cleanupTimeout);
      }
    }

    this.internalOperations.clear();
    this.ongoingWrites.clear();
    this.recentDeletions.clear();
    this.openNotes.clear();
    this.expectedWrites.clear();
  }

  /**
   * Mark the start of a write operation initiated by Flint.
   * Call this BEFORE writing to prevent the file watcher from treating it as an external change.
   * This flag-based approach eliminates timing races.
   */
  markWriteStarting(filePath: string): void {
    const absolutePath = path.resolve(this.vaultPath, filePath);
    this.ongoingWrites.add(absolutePath);
  }

  /**
   * Mark the completion of a write operation initiated by Flint.
   * Call this AFTER the write completes (use try/finally for reliability).
   * The flag remains set for a brief period to catch delayed file watcher events.
   */
  markWriteComplete(filePath: string): void {
    const absolutePath = path.resolve(this.vaultPath, filePath);

    // Cancel any existing cleanup timeout for this path
    const existingTimeout = this.writeCleanupTimeouts.get(absolutePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Keep the flag set for a brief period to catch any delayed file watcher events
    const timeout = setTimeout(() => {
      this.ongoingWrites.delete(absolutePath);
      this.writeCleanupTimeouts.delete(absolutePath);
    }, this.WRITE_FLAG_CLEANUP_MS);

    this.writeCleanupTimeouts.set(absolutePath, timeout);
  }

  /**
   * Track a file operation initiated by Flint (delete/rename operations)
   * Call this BEFORE the operation to mark it as internal
   */
  trackOperation(filePath: string, type: 'write' | 'rename' | 'delete'): void {
    const absolutePath = path.resolve(this.vaultPath, filePath);
    this.internalOperations.set(absolutePath, {
      type,
      startedAt: Date.now()
    });

    // Clean up after timeout
    setTimeout(() => {
      this.internalOperations.delete(absolutePath);
    }, this.OPERATION_CLEANUP_MS);
  }

  /**
   * Mark a note as open in the editor.
   * While open, changes will be verified against expected writes to detect conflicts.
   */
  markNoteOpened(noteId: string): void {
    this.openNotes.add(noteId);
    console.log(`[FileWatcher] Note opened in editor: ${noteId}`);
    console.log(`[FileWatcher] Open notes now: ${Array.from(this.openNotes).join(', ')}`);
  }

  /**
   * Mark a note as closed in the editor.
   * After closing, changes will be treated as normal external edits.
   */
  markNoteClosed(noteId: string): void {
    this.openNotes.delete(noteId);
    // Clean up any pending expected writes for this note
    const expectedWrites = this.expectedWrites.get(noteId);
    if (expectedWrites) {
      // Clear all cleanup timeouts
      for (const write of expectedWrites) {
        clearTimeout(write.cleanupTimeout);
      }
      this.expectedWrites.delete(noteId);
    }
    console.log(`[FileWatcher] Note closed in editor: ${noteId}`);
  }

  /**
   * Register an expected write from the editor.
   * This allows distinguishing editor auto-saves from external edits to open notes.
   * Call this BEFORE the editor saves the note.
   */
  expectWrite(noteId: string, contentHash: string): void {
    // Get or create array of expected writes for this note
    let expectedWrites = this.expectedWrites.get(noteId);
    if (!expectedWrites) {
      expectedWrites = [];
      this.expectedWrites.set(noteId, expectedWrites);
    }

    // Create cleanup timeout that removes this specific write
    const timeout = setTimeout(() => {
      const writes = this.expectedWrites.get(noteId);
      if (writes) {
        const index = writes.findIndex((w) => w.contentHash === contentHash);
        if (index !== -1) {
          writes.splice(index, 1);
          console.log(
            `[FileWatcher] Expected write timeout for note ${noteId}, hash: ${contentHash.substring(0, 8)}...`
          );
          // Clean up empty arrays
          if (writes.length === 0) {
            this.expectedWrites.delete(noteId);
          }
        }
      }
    }, this.EXPECTED_WRITE_TIMEOUT_MS);

    // Add this expected write to the array
    expectedWrites.push({
      noteId,
      contentHash,
      timestamp: Date.now(),
      cleanupTimeout: timeout
    });

    console.log(
      `[FileWatcher] Expecting write for note ${noteId}, hash: ${contentHash.substring(0, 8)}... (${expectedWrites.length} pending)`
    );
  }

  /**
   * Check if a note is currently open in the editor
   */
  private isNoteOpenInEditor(noteId: string): boolean {
    return this.openNotes.has(noteId);
  }

  /**
   * Compute SHA256 hash of content for comparison
   */
  private computeContentHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Check if a file change is from an internal Flint operation or handle conflicts
   * Returns true if the change should be ignored (internal or conflict handled)
   */
  private async isInternalChange(
    filePath: string,
    content?: string
  ): Promise<{ isInternal: boolean; isConflict: boolean }> {
    // Normalize the path the same way we do in markWriteStarting/markWriteComplete
    // to ensure we're checking the same key that was added to the Set
    const absolutePath = path.resolve(this.vaultPath, filePath);

    // FIRST: Check if this file is currently being written by Flint
    // This is the most reliable check as the flag is set BEFORE the write
    if (this.ongoingWrites.has(absolutePath)) {
      return { isInternal: true, isConflict: false };
    }

    // SECOND: Check for tracked operations (write/delete/rename)
    const op = this.internalOperations.get(absolutePath);
    if (op) {
      // Check if operation is still within the cleanup window
      if (Date.now() - op.startedAt < this.OPERATION_CLEANUP_MS) {
        return { isInternal: true, isConflict: false };
      }
    }

    // THIRD: Editor-aware change detection - check expected writes
    const noteId = await this.getNoteIdFromPath(filePath);
    console.log(`[FileWatcher] Checking change for file: ${filePath}`);
    console.log(`[FileWatcher]   Note ID: ${noteId || 'NOT FOUND'}`);
    console.log(`[FileWatcher]   Open notes: ${Array.from(this.openNotes).join(', ') || 'NONE'}`);

    if (noteId) {
      const expectedWrites = this.expectedWrites.get(noteId);
      console.log(`[FileWatcher]   Expected writes for ${noteId}: ${expectedWrites?.length || 0}`);
      console.log(`[FileWatcher]   Is note open? ${this.isNoteOpenInEditor(noteId)}`);

      if (expectedWrites && expectedWrites.length > 0) {
        // We have expected writes for this note - verify content hash
        const fileContent = content || (await fs.readFile(filePath, 'utf-8'));
        const actualHash = this.computeContentHash(fileContent);

        console.log(`[FileWatcher] Change detected for note ${noteId}`);
        console.log(`  Actual hash: ${actualHash.substring(0, 8)}...`);
        console.log(`  Checking against ${expectedWrites.length} expected writes`);

        // Check if this hash matches ANY expected write
        const matchIndex = expectedWrites.findIndex((w) => w.contentHash === actualHash);

        if (matchIndex !== -1) {
          // This is one of the writes we expected - clean up and ignore
          const matchedWrite = expectedWrites[matchIndex];
          console.log(
            `[FileWatcher] ✓ Ignoring expected write for note ${noteId}, hash: ${actualHash.substring(0, 8)}...`
          );

          // Clear timeout and remove this specific expected write
          clearTimeout(matchedWrite.cleanupTimeout);
          expectedWrites.splice(matchIndex, 1);

          // Clean up empty arrays
          if (expectedWrites.length === 0) {
            this.expectedWrites.delete(noteId);
          }

          return { isInternal: true, isConflict: false };
        } else {
          // Content doesn't match any expected write!
          // This is an external edit that happened while we had pending writes
          console.warn(
            `[FileWatcher] Hash mismatch - expected one of ${expectedWrites.length} hashes, got ${actualHash.substring(0, 8)}...`
          );

          if (this.isNoteOpenInEditor(noteId)) {
            // Conflict: external edit to open note with unexpected content
            console.warn(
              `[FileWatcher] External edit conflict detected for open note: ${noteId}`
            );
            this.emit({
              type: 'external-edit-conflict',
              noteId,
              path: filePath
            });
            return { isInternal: true, isConflict: true }; // Don't auto-sync, emit conflict
          }

          // Note is not open, treat as external change
          return { isInternal: false, isConflict: false };
        }
      }

      // No expected write, but note is open - unexpected change to open note
      if (this.isNoteOpenInEditor(noteId)) {
        console.warn(`[FileWatcher] ⚠️ CONFLICT: Unexpected external edit to open note: ${noteId}`);
        this.emit({
          type: 'external-edit-conflict',
          noteId,
          path: filePath
        });
        return { isInternal: true, isConflict: true }; // Don't auto-sync, emit conflict
      } else {
        console.log(`[FileWatcher] Note ${noteId} not open, treating as external change`);
      }
    }

    console.log(`[FileWatcher] No noteId found or no special handling, treating as external change`);
    return { isInternal: false, isConflict: false };
  }

  /**
   * Debounce a change event for a specific path
   */
  private debounceChange(filePath: string, handler: () => void): void {
    // Clear existing timeout for this path
    const existing = this.pendingChanges.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      handler();
      this.pendingChanges.delete(filePath);
    }, this.DEBOUNCE_MS);

    this.pendingChanges.set(filePath, timeout);
  }

  /**
   * Check if a file is an internal metadata file that should be ignored
   */
  private isMetadataFile(filePath: string): boolean {
    // Ignore note type description files
    if (filePath.endsWith('_description.md')) {
      return true;
    }
    // Ignore files in .flint-note directory
    if (filePath.includes('/.flint-note/')) {
      return true;
    }
    return false;
  }

  /**
   * Handle file added event
   */
  private async onFileAdded(filePath: string): Promise<void> {
    // Only handle markdown files
    if (!filePath.endsWith('.md')) {
      return;
    }

    // Ignore internal metadata files
    if (this.isMetadataFile(filePath)) {
      return;
    }

    this.debounceChange(filePath, async () => {
      try {
        // Check if this is a renamed file by reading the note ID
        const content = await fs.readFile(filePath, 'utf-8');

        // Check if this is an internal change
        const changeCheck = await this.isInternalChange(filePath, content);
        if (changeCheck.isInternal) {
          return;
        }

        const noteId = this.extractNoteId(content);

        if (noteId) {
          const recentDeletion = this.recentDeletions.get(noteId);
          if (recentDeletion) {
            // This is a rename!
            this.recentDeletions.delete(noteId);
            this.emit({
              type: 'external-rename',
              oldPath: recentDeletion.oldPath,
              newPath: filePath,
              noteId
            });
            await this.handleFileRename();
            return;
          }
        }

        // Not a rename, process as new file
        this.emit({ type: 'external-add', path: filePath });
        await this.handleFileAdd();
      } catch (error) {
        console.error(`[FileWatcher] Error processing file addition: ${filePath}`, error);
      }
    });
  }

  /**
   * Handle file changed event
   */
  private async onFileChanged(filePath: string): Promise<void> {
    console.log(`[FileWatcher] 🔔 chokidar 'change' event fired for: ${filePath}`);

    // Only handle markdown files
    if (!filePath.endsWith('.md')) {
      console.log(`[FileWatcher] Ignoring non-markdown file: ${filePath}`);
      return;
    }

    // Ignore internal metadata files
    if (this.isMetadataFile(filePath)) {
      console.log(`[FileWatcher] Ignoring metadata file: ${filePath}`);
      return;
    }

    console.log(`[FileWatcher] Debouncing change for: ${filePath}`);
    this.debounceChange(filePath, async () => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');

        // Check if this is an internal change (including conflict detection)
        const changeCheck = await this.isInternalChange(filePath, content);
        if (changeCheck.isInternal) {
          // If it's a conflict, the event was already emitted in isInternalChange
          return;
        }

        const noteId = this.extractNoteId(content);

        this.emit({
          type: 'external-change',
          path: filePath,
          noteId: noteId || undefined
        });
        await this.handleFileChange();
      } catch (error) {
        console.error(`[FileWatcher] Error processing file change: ${filePath}`, error);
      }
    });
  }

  /**
   * Handle file deleted event
   */
  private async onFileDeleted(filePath: string): Promise<void> {
    // Only handle markdown files
    if (!filePath.endsWith('.md')) {
      return;
    }

    // Ignore internal metadata files
    if (this.isMetadataFile(filePath)) {
      return;
    }

    this.debounceChange(filePath, async () => {
      try {
        // Check if this is an internal operation
        const absolutePath = path.resolve(filePath);
        const op = this.internalOperations.get(absolutePath);
        if (op && op.type === 'delete') {
          this.internalOperations.delete(absolutePath);
          return;
        }

        // Try to get the note ID from the database before processing deletion
        const noteId = await this.getNoteIdFromPath(filePath);

        if (noteId) {
          // Store this as a recent deletion in case it's a rename
          try {
            // Try to get content hash from database
            const db = await this.searchManager.getDatabaseConnection();
            const note = await db.get<{ content_hash: string }>(
              'SELECT content_hash FROM notes WHERE id = ?',
              [noteId]
            );

            if (note) {
              this.recentDeletions.set(noteId, {
                noteId,
                deletedAt: Date.now(),
                oldPath: filePath,
                contentHash: note.content_hash
              });

              // Clean up after detection window
              setTimeout(() => {
                this.recentDeletions.delete(noteId);
              }, this.RENAME_DETECTION_WINDOW_MS);
            }
          } catch (error) {
            console.error('[FileWatcher] Error storing recent deletion:', error);
          }
        }

        this.emit({
          type: 'external-delete',
          path: filePath,
          noteId: noteId || undefined
        });
        await this.handleFileDelete();
      } catch (error) {
        console.error(`[FileWatcher] Error processing file deletion: ${filePath}`, error);
      }
    });
  }

  /**
   * Handle watcher errors
   */
  private onError(error: unknown): void {
    console.error('[FileWatcher] Watcher error:', error);
  }

  /**
   * Extract note ID from file content
   */
  private extractNoteId(content: string): string | null {
    if (!this.noteManager) {
      return null;
    }
    try {
      const parsed = this.noteManager.parseNoteContent(content);
      return (parsed.metadata.id as string) || null;
    } catch {
      return null;
    }
  }

  /**
   * Get note ID from file path via database
   */
  private async getNoteIdFromPath(filePath: string): Promise<string | null> {
    try {
      const db = await this.searchManager.getDatabaseConnection();

      // Convert absolute path to relative path (relative to vault root)
      // The database stores paths relative to the vault root
      const absolutePath = path.resolve(filePath);
      const relativePath = path.relative(this.vaultPath, absolutePath);

      console.log(`[FileWatcher] Looking up note by path:`);
      console.log(`[FileWatcher]   Input path: ${filePath}`);
      console.log(`[FileWatcher]   Absolute path: ${absolutePath}`);
      console.log(`[FileWatcher]   Relative path: ${relativePath}`);

      const note = await db.get<{ id: string }>('SELECT id FROM notes WHERE path = ?', [
        relativePath
      ]);

      console.log(`[FileWatcher]   Found note: ${note ? note.id : 'NULL'}`);

      return note?.id || null;
    } catch (error) {
      console.error('[FileWatcher] Error getting note ID from path:', error);
      return null;
    }
  }

  /**
   * Handle a new file being added
   */
  private async handleFileAdd(): Promise<void> {
    // Trigger a sync to process the new file
    await this.searchManager.syncFileSystemChanges();
  }

  /**
   * Handle a file being changed
   */
  private async handleFileChange(): Promise<void> {
    // Trigger a sync to process the changed file
    await this.searchManager.syncFileSystemChanges();
  }

  /**
   * Handle a file being deleted
   */
  private async handleFileDelete(): Promise<void> {
    // Trigger a sync to process the deletion
    await this.searchManager.syncFileSystemChanges();
  }

  /**
   * Handle a file being renamed
   */
  private async handleFileRename(): Promise<void> {
    // Trigger a sync to process the rename
    await this.searchManager.syncFileSystemChanges();
  }
}
