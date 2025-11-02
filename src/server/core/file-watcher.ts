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
import type { HybridSearchManager } from '../database/search-manager.js';
import type { NoteManager } from './notes.js';

// Phase 4: Removed FileOperation interface - no longer tracking individual operations
// FileWriteQueue's ongoingWrites flag is now the single source of truth

/**
 * Tracks recently deleted files to detect renames
 */
interface RecentDeletion {
  noteId: string;
  deletedAt: number;
  oldPath: string;
  contentHash: string;
}

// Phase 3: Removed ExpectedWrite interface - no longer needed with FileWriteQueue

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
  // Phase 4: Removed internalOperations Map - FileWriteQueue's ongoingWrites is sufficient
  private ongoingWrites = new Set<string>(); // Track writes in progress (set BEFORE write)
  private writeCleanupTimeouts = new Map<string, NodeJS.Timeout>(); // Track cleanup timeouts per path
  private recentDeletions = new Map<string, RecentDeletion>();
  private eventHandlers: FileWatcherEventHandler[] = [];

  // Phase 3: Removed openNotes and expectedWrites tracking - FileWriteQueue handles all internal writes

  private readonly DEBOUNCE_MS: number;
  private readonly RENAME_DETECTION_WINDOW_MS = 1000;
  // Phase 4: Removed OPERATION_CLEANUP_MS - no longer tracking individual operations
  private readonly WRITE_FLAG_CLEANUP_MS = 1000; // Keep write flag for 1000ms after completion to account for awaitWriteFinish (200ms) + debounce (100ms) + FS latency

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
      ignored: (filepath: string) => {
        // Ignore .flint-note config directories (anywhere in path)
        if (filepath.includes('/.flint-note/') || filepath.endsWith('/.flint-note')) {
          return true;
        }
        // Ignore note type description files (internal metadata)
        if (filepath.endsWith('/_description.md')) {
          return true;
        }
        // Ignore .git directories
        if (filepath.includes('/.git/')) {
          return true;
        }
        // Ignore node_modules
        if (filepath.includes('/node_modules/')) {
          return true;
        }
        // Ignore OS metadata files
        if (filepath.endsWith('/.DS_Store') || filepath.endsWith('/desktop.ini')) {
          return true;
        }
        // Ignore backup and temp files
        if (
          filepath.endsWith('~') ||
          filepath.endsWith('.swp') ||
          filepath.endsWith('.tmp')
        ) {
          return true;
        }
        return false;
      },
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
        console.log(
          '[FileWatcher] ✅ Chokidar watcher is ready and watching for changes'
        );
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

    // Phase 3: Removed expected write cleanup - no longer tracking
    // Phase 4: Removed internalOperations cleanup - no longer used

    this.ongoingWrites.clear();
    this.recentDeletions.clear();
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

  // Phase 3: Removed markNoteOpened, markNoteClosed, expectWrite, and isNoteOpenInEditor
  // FileWriteQueue now handles all internal writes, making these tracking methods unnecessary

  // Phase 4: Removed trackOperation() method - FileWriteQueue's ongoingWrites is sufficient
  // No need to separately track delete/rename operations
  // Phase 5: Removed computeContentHash() - no longer needed after conflict detection simplification

  /**
   * Determine if a file change is internal (initiated by Flint) or external
   * Phase 4: Simplified to only check ongoingWrites flag
   */
  private async isInternalChange(
    filePath: string
  ): Promise<{ isInternal: boolean; isConflict: boolean }> {
    // Normalize the path the same way we do in markWriteStarting/markWriteComplete
    const absolutePath = path.resolve(this.vaultPath, filePath);

    // Phase 4: FileWriteQueue's ongoingWrites flag is the single source of truth
    // If the flag is set, this is an internal write - ignore it
    // If not set, this is an external change - sync to database
    if (this.ongoingWrites.has(absolutePath)) {
      return { isInternal: true, isConflict: false };
    }

    // All other changes are external
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
        const changeCheck = await this.isInternalChange(filePath);
        if (changeCheck.isInternal) {
          return;
        }

        const noteId = this.extractNoteId(content);

        if (noteId) {
          const recentDeletion = this.recentDeletions.get(noteId);
          if (recentDeletion) {
            // This is a rename!
            this.recentDeletions.delete(noteId);

            // Phase 6 fix: Sync to database FIRST, then emit event
            await this.handleFileRename();

            this.emit({
              type: 'external-rename',
              oldPath: recentDeletion.oldPath,
              newPath: filePath,
              noteId
            });
            return;
          }
        }

        // Not a rename, process as new file
        // Phase 6 fix: Sync to database FIRST, then emit event
        await this.handleFileAdd();

        this.emit({ type: 'external-add', path: filePath });
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

        // Check if this is an internal change
        const changeCheck = await this.isInternalChange(filePath);
        if (changeCheck.isInternal) {
          // Internal change - ignore (file watcher should not process)
          return;
        }

        const noteId = this.extractNoteId(content);

        // Phase 6 fix: Sync to database FIRST, then emit event
        // This ensures the database has the latest content when editors reload
        await this.handleFileChange();

        this.emit({
          type: 'external-change',
          path: filePath,
          noteId: noteId || undefined
        });
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
        // Phase 4: Removed internal delete tracking - all deletes treated as external
        // If NoteManager calls deleteNote(), it will handle DB cleanup directly

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

        // Phase 6 fix: Sync to database FIRST, then emit event
        await this.handleFileDelete();

        this.emit({
          type: 'external-delete',
          path: filePath,
          noteId: noteId || undefined
        });
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
