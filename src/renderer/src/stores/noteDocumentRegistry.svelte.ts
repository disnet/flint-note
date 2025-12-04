import { getChatService } from '../services/chatService';
import { AutoSave } from './autoSave.svelte';
import { messageBus } from '../services/messageBus.svelte';
import { logger } from '../utils/logger';

/**
 * Represents a single note document that can be shared across multiple editor components.
 * Uses Svelte 5 runes for reactivity - all components viewing/editing the same note
 * will automatically sync through this shared state.
 */
export class NoteDocument {
  noteId = $state('');
  content = $state('');
  title = $state('');

  // Track which editor components are currently viewing/editing this document
  // Format: 'main' | 'sidebar-0' | 'sidebar-1' etc.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- initialization, Set will be mutated in place
  activeEditors = $state<Set<string>>(new Set());

  // Phase 6: Track the primary editor ID (the first editor to register)
  // Used to identify which editor made the change for smart reload logic
  private primaryEditorId: string | null = null;

  // Single autosave instance for this document
  private autoSave: AutoSave;

  // Track if document is currently being loaded from database
  isLoading = $state(false);

  // Track save errors
  error = $state<string | null>(null);

  // Track if we're expecting a reload (e.g., after metadata update via UI)
  // This suppresses the "modified externally" toast
  private expectingReload = $state(false);
  private expectingReloadTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(noteId: string, title: string = '', content: string = '') {
    this.noteId = noteId;
    this.title = title;
    this.content = content;

    // Create autosave instance that saves to database
    this.autoSave = new AutoSave(async () => {
      await this.save();
    });
  }

  /**
   * Update the content and mark as changed for autosave
   */
  updateContent(newContent: string): void {
    if (this.content !== newContent) {
      this.content = newContent;
      this.autoSave.markChanged();
    }
  }

  /**
   * Update the title
   * Title changes are saved immediately (not debounced)
   */
  async updateTitle(
    newTitle: string
  ): Promise<{ success: boolean; newId?: string; linksUpdated?: number }> {
    if (this.title === newTitle) {
      return { success: true };
    }

    const oldTitle = this.title;
    const oldId = this.noteId;

    try {
      this.error = null;
      const noteService = getChatService();

      const result = await noteService.renameNote({
        identifier: this.noteId,
        newIdentifier: newTitle
      });

      if (result.success) {
        this.title = newTitle;

        // If the note ID changed, update it
        if (result.new_id && result.new_id !== oldId) {
          this.noteId = result.new_id;
        }

        // Get the updated note to get the new filename
        const updatedNote = await noteService.getNote({
          identifier: result.new_id || oldId
        });
        if (updatedNote) {
          // Publish rename event so the note cache and wikilinks update
          messageBus.publish({
            type: 'note.renamed',
            oldId,
            newId: result.new_id || oldId,
            title: newTitle,
            filename: updatedNote.filename || ''
          });
        }

        return {
          success: true,
          newId: result.new_id || oldId,
          linksUpdated: result.linksUpdated
        };
      } else {
        throw new Error('Rename operation failed');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to rename note';
      console.error('Error renaming note:', err);
      // Revert title on error
      this.title = oldTitle;
      return { success: false };
    }
  }

  /**
   * Compute SHA-256 hash of content for file watcher verification
   */
  private async computeContentHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * Save the document to the database
   * Phase 6: Publishes note.updated event with source: 'user' for agent-editor sync
   */
  private async save(): Promise<void> {
    try {
      this.error = null;
      const noteService = getChatService();

      // Phase 3: Removed expectWrite tracking - FileWriteQueue handles all internal writes
      // Compute content hash for optimistic locking
      const contentHash = await this.computeContentHash(this.content);
      logger.debug(
        `[AutoSave] Saving note ${this.noteId}, hash: ${contentHash.substring(0, 8)}...`
      );

      const result = await noteService.updateNote({
        identifier: this.noteId,
        content: this.content,
        silent: true // Don't trigger UI refresh on auto-save
      });
      logger.debug(`[AutoSave] Note ${this.noteId} saved successfully`);

      // Phase 6: Publish note.updated event with source: 'user' for multi-editor sync
      // This allows other editors viewing the same note to reload
      if (result) {
        messageBus.publish({
          type: 'note.updated',
          noteId: this.noteId,
          updates: {
            // eslint-disable-next-line svelte/prefer-svelte-reactivity -- creating timestamp string, not reactive state
            modified: new Date().toISOString()
          },
          source: 'user',
          editorId: this.primaryEditorId || undefined
        });
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to save note';
      console.error('Error saving note:', err);
      throw err;
    }
  }

  /**
   * Force immediate save (bypasses autosave debounce)
   */
  async saveImmediately(): Promise<void> {
    await this.save();
    this.autoSave.clearChanges();
  }

  /**
   * Mark the document as expecting a reload from an API-triggered change.
   * This suppresses the "modified externally" toast for a short period.
   * Used when updating metadata via chips or other UI that bypasses autosave.
   */
  markExpectingReload(): void {
    // Clear any existing timeout
    if (this.expectingReloadTimeout) {
      clearTimeout(this.expectingReloadTimeout);
    }

    this.expectingReload = true;

    // Auto-clear after 3 seconds (should be enough for file write to complete)
    this.expectingReloadTimeout = setTimeout(() => {
      this.expectingReload = false;
      this.expectingReloadTimeout = null;
    }, 3000);
  }

  /**
   * Check if document is expecting a reload (suppresses external change toast)
   */
  get isExpectingReload(): boolean {
    return this.expectingReload;
  }

  /**
   * Clear the expecting reload flag (called after successful reload)
   */
  clearExpectingReload(): void {
    this.expectingReload = false;
    if (this.expectingReloadTimeout) {
      clearTimeout(this.expectingReloadTimeout);
      this.expectingReloadTimeout = null;
    }
  }

  /**
   * Reload the document from the database
   * Useful after external changes (e.g., from AI agents)
   */
  async reload(): Promise<void> {
    this.isLoading = true;
    try {
      this.error = null;
      const noteService = getChatService();
      const note = await noteService.getNote({ identifier: this.noteId });

      if (note) {
        this.content = note.content || '';
        this.title = note.title || '';
        this.autoSave.clearChanges();
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to reload note';
      console.error('Error reloading note:', err);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Register an editor component as viewing/editing this document
   * Phase 6: Track the first editor as the primary editor for source identification
   */
  registerEditor(editorId: string): void {
    this.activeEditors.add(editorId);
    // Set primary editor if this is the first editor
    if (this.primaryEditorId === null) {
      this.primaryEditorId = editorId;
    }
  }

  /**
   * Unregister an editor component from this document
   * Phase 6: Clear primary editor if it's being unregistered
   */
  unregisterEditor(editorId: string): void {
    this.activeEditors.delete(editorId);
    // If the primary editor is closing, reset it
    if (this.primaryEditorId === editorId) {
      // Set to the first remaining editor, or null if none
      this.primaryEditorId =
        this.activeEditors.size > 0 ? Array.from(this.activeEditors)[0] : null;
    }
  }

  /**
   * Check if this document is currently open in multiple editors
   */
  get isOpenInMultipleEditors(): boolean {
    return this.activeEditors.size > 1;
  }

  /**
   * Get a list of other editors that have this document open
   */
  getOtherEditors(currentEditorId: string): string[] {
    return Array.from(this.activeEditors).filter((id) => id !== currentEditorId);
  }

  /**
   * Cleanup when document is no longer needed
   */
  destroy(): void {
    this.autoSave.destroy();
    if (this.expectingReloadTimeout) {
      clearTimeout(this.expectingReloadTimeout);
      this.expectingReloadTimeout = null;
    }
  }

  /**
   * Get whether autosave is currently saving
   */
  get isSaving(): boolean {
    return this.autoSave.isSaving;
  }

  /**
   * Get whether the document has unsaved changes (dirty state)
   * Used for smart external edit handling
   */
  get isDirty(): boolean {
    return this.autoSave.hasChanges || this.autoSave.isSaving;
  }
}

/**
 * Registry that manages the lifecycle of note documents.
 * Ensures only one NoteDocument instance exists per note ID,
 * and handles loading/cleanup.
 */
class NoteDocumentRegistryClass {
  // Map of noteId -> NoteDocument
  private documents = $state(new Map<string, NoteDocument>());

  constructor() {
    // Phase 6: Listen for note.updated events with smart reload logic
    // This enables agent-editor sync and multi-editor sync
    messageBus.subscribe('note.updated', async (event) => {
      const doc = this.documents.get(event.noteId);
      if (!doc) return;

      // Smart reload logic:
      // 1. If source is 'user' and editorId matches this document's primary editor, skip (self-update)
      // 2. If source is 'agent', reload (agent updates should always sync)
      // 3. If source is 'user' with different editorId, reload (other editor updated)
      // 4. But always respect dirty state - don't reload if user has unsaved changes

      // Phase 6 fix: Prevent processing during shutdown
      // If no editors are viewing this document, skip reload (document is being cleaned up)
      if (doc.activeEditors.size === 0) {
        return;
      }

      const isSelfUpdate =
        event.source === 'user' && event.editorId === doc['primaryEditorId'];

      if (isSelfUpdate) {
        // This editor made the change - don't reload to avoid cursor position loss
        return;
      }

      // Check if document has unsaved changes
      const isDirty = doc.isDirty;

      if (isDirty) {
        // Document has unsaved changes - emit conflict event
        messageBus.publish({
          type: 'file.external-edit-conflict',
          noteId: event.noteId,
          path: '' // Path not available in note.updated events
        });
      } else {
        // Document is clean - auto-reload
        try {
          await doc.reload();

          // Show toast notification
          messageBus.publish({
            type: 'toast.show',
            message:
              event.source === 'agent'
                ? 'Note reloaded (updated by agent)'
                : 'Note reloaded (updated in another editor)',
            duration: 3000,
            variant: 'info'
          });
        } catch (error) {
          // Silently fail during shutdown or if document is no longer valid
          console.warn('[Registry] Failed to reload document:', error);
        }
      }
    });

    // Listen for external file changes and handle based on dirty state
    // Phase 5: Auto-reload clean documents, show conflict for dirty documents
    messageBus.subscribe('file.external-change', async (event) => {
      if (!event.noteId) return;
      const doc = this.documents.get(event.noteId);
      if (!doc) return;

      // Check if document has unsaved changes
      const isDirty = doc.isDirty;

      // Check if we're expecting this reload (e.g., from metadata update via UI)
      const isExpectedReload = doc.isExpectingReload;

      if (isDirty) {
        // Document has unsaved changes - emit conflict event for user to resolve
        messageBus.publish({
          type: 'file.external-edit-conflict',
          noteId: event.noteId,
          path: event.path
        });
      } else {
        // Document is clean - auto-reload
        await doc.reload();

        // Clear expecting reload flag after successful reload
        if (isExpectedReload) {
          doc.clearExpectingReload();
        }

        // Only show toast if this was a truly external change (not from our UI)
        if (!isExpectedReload) {
          messageBus.publish({
            type: 'toast.show',
            message: 'Note reloaded (modified externally)',
            duration: 3000,
            variant: 'info'
          });
        }
      }
    });
  }

  /**
   * Open a note document for a specific editor.
   * If the document is already open, returns the existing instance.
   * Otherwise, loads it from the database.
   */
  async open(noteId: string, editorId: string): Promise<NoteDocument> {
    // If document already exists, just register this editor
    if (this.documents.has(noteId)) {
      const doc = this.documents.get(noteId)!;
      doc.registerEditor(editorId);
      return doc;
    }

    // Create new document and load from database
    const doc = new NoteDocument(noteId);
    doc.registerEditor(editorId);
    this.documents.set(noteId, doc);

    // Load content from database
    try {
      const noteService = getChatService();
      if (await noteService.isReady()) {
        const note = await noteService.getNote({ identifier: noteId });
        if (note) {
          doc.content = note.content || '';
          doc.title = note.title || '';
        }
      }
    } catch (err) {
      console.error('Error loading note document:', err);
      doc.error = err instanceof Error ? err.message : 'Failed to load note';
    }

    return doc;
  }

  /**
   * Close a note document for a specific editor.
   * If this was the last editor, cleans up the document.
   */
  close(noteId: string, editorId: string): void {
    const doc = this.documents.get(noteId);
    if (!doc) return;

    doc.unregisterEditor(editorId);

    // If no editors are using this document anymore, clean it up
    if (doc.activeEditors.size === 0) {
      doc.destroy();
      this.documents.delete(noteId);
    }
  }

  /**
   * Get a document if it exists (without opening it)
   */
  get(noteId: string): NoteDocument | undefined {
    return this.documents.get(noteId);
  }

  /**
   * Check if a document is currently open
   */
  isOpen(noteId: string): boolean {
    return this.documents.has(noteId);
  }

  /**
   * Get all currently open documents
   */
  getAllDocuments(): NoteDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Handle note ID changes (e.g., after rename)
   * This updates the registry's internal mapping
   */
  updateNoteId(oldId: string, newId: string): void {
    const doc = this.documents.get(oldId);
    if (doc) {
      // Update the document's noteId
      doc.noteId = newId;

      // Update registry mapping
      this.documents.delete(oldId);
      this.documents.set(newId, doc);
    }
  }

  /**
   * Force reload a document from the database
   * Useful when external changes happen (e.g., AI edits)
   */
  async reload(noteId: string): Promise<void> {
    const doc = this.documents.get(noteId);
    if (doc) {
      await doc.reload();
    }
  }

  /**
   * Force reload all open documents
   */
  async reloadAll(): Promise<void> {
    const promises = Array.from(this.documents.values()).map((doc) => doc.reload());
    await Promise.all(promises);
  }
}

// Export singleton instance
export const noteDocumentRegistry = new NoteDocumentRegistryClass();
