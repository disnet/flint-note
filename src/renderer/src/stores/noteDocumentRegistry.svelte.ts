import { getChatService } from '../services/chatService';
import { AutoSave } from './autoSave.svelte';
import { messageBus } from '../services/messageBus.svelte';

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
  activeEditors = $state<Set<string>>(new Set());

  // Single autosave instance for this document
  private autoSave: AutoSave;

  // Track if document is currently being loaded from database
  isLoading = $state(false);

  // Track save errors
  error = $state<string | null>(null);

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
   * Save the document to the database
   */
  private async save(): Promise<void> {
    try {
      this.error = null;
      const noteService = getChatService();
      await noteService.updateNote({
        identifier: this.noteId,
        content: this.content
      });
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
   */
  registerEditor(editorId: string): void {
    this.activeEditors.add(editorId);
  }

  /**
   * Unregister an editor component from this document
   */
  unregisterEditor(editorId: string): void {
    this.activeEditors.delete(editorId);
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
  }

  /**
   * Get whether autosave is currently saving
   */
  get isSaving(): boolean {
    return this.autoSave.isSaving;
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
    // Listen for note.updated events and reload affected documents
    messageBus.subscribe('note.updated', async (event) => {
      const doc = this.documents.get(event.noteId);
      if (doc) {
        // Only reload if the document is open
        await doc.reload();
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
