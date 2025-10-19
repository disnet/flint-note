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
import type { Stats } from 'fs';
import type { HybridSearchManager } from '../database/search-manager.js';
import type { NoteManager } from './notes.js';
import { generateContentHash } from '../utils/content-hash.js';

/**
 * Tracks file operations initiated by Flint to distinguish them from external changes
 */
interface FileOperation {
  type: 'write' | 'rename' | 'delete';
  startedAt: number;
  expectedMtime?: number;
  contentHash?: string;
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
  private recentDeletions = new Map<string, RecentDeletion>();
  private eventHandlers: FileWatcherEventHandler[] = [];

  private readonly DEBOUNCE_MS: number;
  private readonly RENAME_DETECTION_WINDOW_MS = 1000;
  private readonly OPERATION_CLEANUP_MS = 5000;

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

    console.log(`Starting file watcher for vault: ${this.vaultPath}`);

    this.watcher = chokidar.watch(this.vaultPath, {
      ignored: [
        '**/.flint-note/**', // Flint's internal directory
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
      .on('error', (error: unknown) => this.onError(error));

    console.log('File watcher started successfully');
  }

  /**
   * Stop watching the vault directory
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    console.log('Stopping file watcher...');

    await this.watcher.close();
    this.watcher = null;

    // Clear all pending changes
    for (const timeout of this.pendingChanges.values()) {
      clearTimeout(timeout);
    }
    this.pendingChanges.clear();
    this.internalOperations.clear();
    this.recentDeletions.clear();

    console.log('File watcher stopped');
  }

  /**
   * Track a file operation initiated by Flint
   * Call this BEFORE the operation to mark it as internal
   */
  trackOperation(filePath: string, type: 'write' | 'rename' | 'delete'): void {
    const absolutePath = path.resolve(this.vaultPath, filePath);
    this.internalOperations.set(absolutePath, {
      type,
      startedAt: Date.now()
    });
  }

  /**
   * Complete tracking of a file operation initiated by Flint
   * Call this AFTER the operation with the resulting file stats
   */
  async completeOperation(
    filePath: string,
    stats?: Stats,
    contentHash?: string
  ): Promise<void> {
    const absolutePath = path.resolve(this.vaultPath, filePath);
    const op = this.internalOperations.get(absolutePath);

    if (op) {
      if (stats) {
        op.expectedMtime = stats.mtimeMs;
      }
      if (contentHash) {
        op.contentHash = contentHash;
      }

      // Clean up after timeout
      setTimeout(() => {
        this.internalOperations.delete(absolutePath);
      }, this.OPERATION_CLEANUP_MS);
    }
  }

  /**
   * Check if a file change is from an internal Flint operation
   */
  private async isInternalChange(filePath: string, stats: Stats): Promise<boolean> {
    const absolutePath = path.resolve(filePath);
    const op = this.internalOperations.get(absolutePath);

    if (!op) {
      return false;
    }

    // Check if modification time matches what we expect
    if (op.expectedMtime && Math.abs(stats.mtimeMs - op.expectedMtime) < 1000) {
      this.internalOperations.delete(absolutePath);
      return true;
    }

    // Check if operation just started (within 2 seconds)
    if (Date.now() - op.startedAt < 2000) {
      return true;
    }

    // If we have a content hash, verify it matches
    if (op.contentHash) {
      try {
        const content = await fs.readFile(absolutePath, 'utf-8');
        const currentHash = generateContentHash(content);
        if (currentHash === op.contentHash) {
          this.internalOperations.delete(absolutePath);
          return true;
        }
      } catch {
        // If we can't read the file, assume it's external
        return false;
      }
    }

    return false;
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
   * Handle file added event
   */
  private async onFileAdded(filePath: string): Promise<void> {
    // Only handle markdown files
    if (!filePath.endsWith('.md')) {
      return;
    }

    this.debounceChange(filePath, async () => {
      try {
        const stats = await fs.stat(filePath);

        // Check if this is an internal change
        if (await this.isInternalChange(filePath, stats)) {
          console.log(`[FileWatcher] Ignoring internal add: ${filePath}`);
          return;
        }

        console.log(`[FileWatcher] External add detected: ${filePath}`);

        // Check if this is a renamed file by reading the note ID
        const content = await fs.readFile(filePath, 'utf-8');
        const noteId = this.extractNoteId(content);

        if (noteId) {
          const recentDeletion = this.recentDeletions.get(noteId);
          if (recentDeletion) {
            // This is a rename!
            console.log(
              `[FileWatcher] Rename detected: ${recentDeletion.oldPath} → ${filePath}`
            );
            this.recentDeletions.delete(noteId);
            this.emit({
              type: 'external-rename',
              oldPath: recentDeletion.oldPath,
              newPath: filePath,
              noteId
            });
            await this.handleFileRename(noteId, recentDeletion.oldPath, filePath);
            return;
          }
        }

        // Not a rename, process as new file
        this.emit({ type: 'external-add', path: filePath });
        await this.handleFileAdd(filePath);
      } catch (error) {
        console.error(`[FileWatcher] Error processing file addition: ${filePath}`, error);
      }
    });
  }

  /**
   * Handle file changed event
   */
  private async onFileChanged(filePath: string): Promise<void> {
    // Only handle markdown files
    if (!filePath.endsWith('.md')) {
      return;
    }

    this.debounceChange(filePath, async () => {
      try {
        const stats = await fs.stat(filePath);

        // Check if this is an internal change
        if (await this.isInternalChange(filePath, stats)) {
          console.log(`[FileWatcher] Ignoring internal change: ${filePath}`);
          return;
        }

        console.log(`[FileWatcher] External change detected: ${filePath}`);

        const content = await fs.readFile(filePath, 'utf-8');
        const noteId = this.extractNoteId(content);

        this.emit({ type: 'external-change', path: filePath, noteId: noteId || undefined });
        await this.handleFileChange(filePath);
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

    this.debounceChange(filePath, async () => {
      try {
        // Check if this is an internal operation
        const absolutePath = path.resolve(filePath);
        const op = this.internalOperations.get(absolutePath);
        if (op && op.type === 'delete') {
          console.log(`[FileWatcher] Ignoring internal delete: ${filePath}`);
          this.internalOperations.delete(absolutePath);
          return;
        }

        console.log(`[FileWatcher] External delete detected: ${filePath}`);

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

        this.emit({ type: 'external-delete', path: filePath, noteId: noteId || undefined });
        await this.handleFileDelete(filePath);
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
      const absolutePath = path.resolve(filePath);
      const note = await db.get<{ id: string }>('SELECT id FROM notes WHERE path = ?', [
        absolutePath
      ]);

      return note?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Handle a new file being added
   */
  private async handleFileAdd(_filePath: string): Promise<void> {
    // Trigger a sync to process the new file
    const result = await this.searchManager.syncFileSystemChanges();
    console.log(
      `[FileWatcher] Sync completed after add: ${result.added} added, ${result.updated} updated, ${result.deleted} deleted`
    );
  }

  /**
   * Handle a file being changed
   */
  private async handleFileChange(_filePath: string): Promise<void> {
    // Trigger a sync to process the changed file
    const result = await this.searchManager.syncFileSystemChanges();
    console.log(
      `[FileWatcher] Sync completed after change: ${result.added} added, ${result.updated} updated, ${result.deleted} deleted`
    );
  }

  /**
   * Handle a file being deleted
   */
  private async handleFileDelete(_filePath: string): Promise<void> {
    // Trigger a sync to process the deletion
    const result = await this.searchManager.syncFileSystemChanges();
    console.log(
      `[FileWatcher] Sync completed after delete: ${result.added} added, ${result.updated} updated, ${result.deleted} deleted`
    );
  }

  /**
   * Handle a file being renamed
   */
  private async handleFileRename(
    _noteId: string,
    _oldPath: string,
    _newPath: string
  ): Promise<void> {
    // Trigger a sync to process the rename
    const result = await this.searchManager.syncFileSystemChanges();
    console.log(
      `[FileWatcher] Sync completed after rename: ${result.added} added, ${result.updated} updated, ${result.deleted} deleted`
    );
  }
}
