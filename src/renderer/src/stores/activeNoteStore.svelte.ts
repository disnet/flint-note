import type { NoteMetadata } from '../services/noteStore.svelte';
import { getChatService } from '../services/chatService';
import { messageBus } from '../services/messageBus.svelte';

type SystemViewType = 'inbox' | 'daily' | 'notes' | 'settings' | 'workflows' | 'review';

interface ActiveViewState {
  currentVaultId: string | null;
  activeNote: NoteMetadata | null;
  activeSystemView: SystemViewType | null;
}

type RestoredView =
  | { type: 'note'; note: NoteMetadata }
  | { type: 'system-view'; viewType: SystemViewType }
  | null;

const defaultState: ActiveViewState = {
  currentVaultId: null,
  activeNote: null,
  activeSystemView: null
};

class ActiveNoteStore {
  private state = $state<ActiveViewState>(defaultState);
  private isLoading = $state(true);
  private isInitialized = $state(false);
  private initializationPromise: Promise<void> | null = null;
  private previousNoteId: string | null = null;

  constructor() {
    this.initializationPromise = this.initializeVault();

    // Listen for note rename events and update activeNote if it matches
    messageBus.subscribe('note.renamed', (event) => {
      if (this.state.activeNote && this.state.activeNote.id === event.oldId) {
        this.state.activeNote = {
          ...this.state.activeNote,
          id: event.newId,
          title: event.title,
          filename: event.filename
        };
        // Update previousNoteId to match the renamed ID
        if (this.previousNoteId === event.oldId) {
          this.previousNoteId = event.newId;
        }
      }
    });
  }

  get activeNote(): NoteMetadata | null {
    return this.state.activeNote;
  }

  get activeSystemView(): SystemViewType | null {
    return this.state.activeSystemView;
  }

  get loading(): boolean {
    return this.isLoading;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Set the active note and persist it
   */
  async setActiveNote(note: NoteMetadata | null): Promise<void> {
    await this.ensureInitialized();

    // Notify file watcher about note lifecycle changes
    const oldNoteId = this.previousNoteId;
    const newNoteId = note?.id || null;

    // Phase 3: Removed noteOpened/noteClosed tracking - not needed with FileWriteQueue
    if (oldNoteId && oldNoteId !== newNoteId) {
      console.log(`[ActiveNoteStore] Closing note: ${oldNoteId}`);
    }

    if (newNoteId && newNoteId !== oldNoteId) {
      console.log(`[ActiveNoteStore] Opening note: ${newNoteId}`);
    }

    this.previousNoteId = newNoteId;
    this.state.activeNote = note;
    // Clear system view when setting a note
    this.state.activeSystemView = null;
    await this.saveToStorage();
  }

  /**
   * Clear the active note
   */
  async clearActiveNote(): Promise<void> {
    await this.ensureInitialized();

    // Phase 3: Removed noteClosed tracking - not needed with FileWriteQueue
    if (this.previousNoteId) {
      this.previousNoteId = null;
    }

    this.state.activeNote = null;
    await this.saveToStorage();
  }

  /**
   * Set the active system view and persist it
   */
  async setActiveSystemView(view: SystemViewType | null): Promise<void> {
    await this.ensureInitialized();

    // Clear active note when setting system view
    // Phase 3: Removed noteClosed tracking - not needed with FileWriteQueue
    if (view !== null && this.previousNoteId) {
      this.previousNoteId = null;
    }

    this.state.activeNote = null;
    this.state.activeSystemView = view;
    await this.saveToStorage();
  }

  /**
   * Clear the active system view
   */
  async clearActiveSystemView(): Promise<void> {
    await this.ensureInitialized();
    this.state.activeSystemView = null;
    await this.saveToStorage();
  }

  /**
   * Start vault switch - clear active view for vault transition
   */
  async startVaultSwitch(): Promise<void> {
    await this.ensureInitialized();
    this.state.activeNote = null;
    this.state.activeSystemView = null;
    await this.saveToStorage();
  }

  /**
   * End vault switch and refresh for new vault
   */
  async endVaultSwitch(): Promise<void> {
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.state.currentVaultId = vault?.id || 'default';

      // Clear active view when switching vaults
      this.state.activeNote = null;
      this.state.activeSystemView = null;

      await this.loadFromStorage();
    } catch (error) {
      console.warn('Failed to switch vault for active view:', error);
      this.state.currentVaultId = 'default';
    }
  }

  /**
   * Restore the last active view (note or system view) on app startup
   * Returns the restored view or null if none found/valid
   */
  async restoreActiveView(): Promise<RestoredView> {
    // Wait for any pending initialization to complete
    await this.ensureInitialized();

    // Check if there's a system view to restore
    if (this.state.activeSystemView) {
      return { type: 'system-view', viewType: this.state.activeSystemView };
    }

    // Otherwise, try to restore a note
    const stored = this.state.activeNote;
    if (!stored?.id) {
      return null;
    }

    try {
      // Verify the note still exists by fetching it
      const service = getChatService();
      const noteExists = await service.getNote({ identifier: stored.id });

      if (noteExists) {
        // Note still exists
        // Phase 3: Removed noteOpened tracking - not needed with FileWriteQueue
        this.previousNoteId = stored.id;
        // Return the stored metadata
        return { type: 'note', note: stored };
      } else {
        // Note doesn't exist anymore, clear it
        await this.clearActiveNote();
        return null;
      }
    } catch (error) {
      console.warn('Failed to verify stored active note:', error);
      // Clear the invalid note
      await this.clearActiveNote();
      return null;
    }
  }

  /**
   * Restore the last active note on app startup (legacy method for backward compatibility)
   * Returns the restored note or null if none found/valid
   * @deprecated Use restoreActiveView() instead
   */
  async restoreActiveNote(): Promise<NoteMetadata | null> {
    const restored = await this.restoreActiveView();
    if (restored?.type === 'note') {
      return restored.note;
    }
    return null;
  }

  private async initializeVault(): Promise<void> {
    this.isLoading = true;
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.state.currentVaultId = vault?.id || 'default';
      await this.loadFromStorage();
    } catch (error) {
      console.warn('Failed to initialize vault for active note:', error);
      this.state.currentVaultId = 'default';
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  private async loadFromStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const vaultId = this.state.currentVaultId || 'default';
      const stored = await window.api?.loadUIState({
        vaultId,
        stateKey: 'active_view'
      });

      if (stored && typeof stored === 'object') {
        // Load system view if present
        if ('systemView' in stored && stored.systemView) {
          const systemView = stored.systemView as SystemViewType;
          this.state.activeSystemView = systemView;
          this.state.activeNote = null;
          return;
        }

        // Otherwise, load note if present
        if ('noteId' in stored) {
          const activeNoteId = stored.noteId as string | null;

          if (activeNoteId) {
            // Try to get the note directly from the API instead of loading all notes
            try {
              const service = getChatService();
              const note = await service.getNote({ identifier: activeNoteId });

              if (note) {
                // Build NoteMetadata from the note
                this.state.activeNote = {
                  id: note.id,
                  type: note.type || 'note',
                  flint_kind: (note.kind as string) || undefined,
                  filename: note.filename || `${activeNoteId}.md`,
                  title: note.title || '',
                  created: note.created || new Date().toISOString(),
                  modified: note.modified || new Date().toISOString(),
                  size: note.size || 0,
                  path: note.path || ''
                };
                this.state.activeSystemView = null;
              } else {
                // Note doesn't exist anymore - clear it
                this.state.activeNote = null;
                this.state.activeSystemView = null;
                await this.saveToStorage();
              }
            } catch (error) {
              console.warn('Failed to load active note:', error);
              this.state.activeNote = null;
              this.state.activeSystemView = null;
              await this.saveToStorage();
            }
          } else {
            this.state.activeNote = null;
            this.state.activeSystemView = null;
          }
        }
      } else {
        this.state.activeNote = null;
        this.state.activeSystemView = null;
      }
    } catch (error) {
      console.warn('Failed to load active view from storage:', error);
      this.state.activeNote = null;
      this.state.activeSystemView = null;
    }
  }

  private async saveToStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const vaultId = this.state.currentVaultId || 'default';
      const stateValue = $state.snapshot({
        noteId: this.state.activeNote?.id || null,
        systemView: this.state.activeSystemView || null
      });
      await window.api?.saveUIState({
        vaultId,
        stateKey: 'active_view',
        stateValue
      });
    } catch (error) {
      console.warn('Failed to save active view to storage:', error);
      throw error; // Re-throw to let calling code handle
    }
  }
}

export const activeNoteStore = new ActiveNoteStore();
export type { SystemViewType, RestoredView };
