import type { NoteMetadata } from '../services/noteStore.svelte';
import { getChatService } from '../services/chatService';
import { messageBus } from '../services/messageBus.svelte';

interface ActiveNoteState {
  currentVaultId: string | null;
  activeNote: NoteMetadata | null;
}

const defaultState: ActiveNoteState = {
  currentVaultId: null,
  activeNote: null
};

class ActiveNoteStore {
  private state = $state<ActiveNoteState>(defaultState);
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

    if (oldNoteId && oldNoteId !== newNoteId) {
      // Previous note is being closed
      console.log(`[ActiveNoteStore] Closing note: ${oldNoteId}`);
      await window.api?.noteClosed({ noteId: oldNoteId });
    }

    if (newNoteId && newNoteId !== oldNoteId) {
      // New note is being opened
      console.log(`[ActiveNoteStore] Opening note: ${newNoteId}`);
      await window.api?.noteOpened({ noteId: newNoteId });
    }

    this.previousNoteId = newNoteId;
    this.state.activeNote = note;
    await this.saveToStorage();
  }

  /**
   * Clear the active note
   */
  async clearActiveNote(): Promise<void> {
    await this.ensureInitialized();

    // Notify file watcher that note is being closed
    if (this.previousNoteId) {
      await window.api?.noteClosed({ noteId: this.previousNoteId });
      this.previousNoteId = null;
    }

    this.state.activeNote = null;
    await this.saveToStorage();
  }

  /**
   * Start vault switch - clear active note for vault transition
   */
  async startVaultSwitch(): Promise<void> {
    await this.ensureInitialized();
    this.state.activeNote = null;
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

      // Clear active note when switching vaults
      this.state.activeNote = null;

      await this.loadFromStorage();
    } catch (error) {
      console.warn('Failed to switch vault for active note:', error);
      this.state.currentVaultId = 'default';
    }
  }

  /**
   * Restore the last active note on app startup
   * Returns the restored note or null if none found/valid
   */
  async restoreActiveNote(): Promise<NoteMetadata | null> {
    if (!this.isInitialized) {
      await this.initializeVault();
    }

    const stored = this.state.activeNote;
    if (!stored?.id) {
      return null;
    }

    try {
      // Verify the note still exists by fetching it
      const service = getChatService();
      const noteExists = await service.getNote({ identifier: stored.id });

      if (noteExists) {
        // Note still exists, notify file watcher that it's open
        await window.api?.noteOpened({ noteId: stored.id });
        this.previousNoteId = stored.id;
        // Return the stored metadata
        return stored;
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
        stateKey: 'active_note'
      });

      if (stored && typeof stored === 'object' && 'noteId' in stored) {
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
                filename: note.filename || `${activeNoteId}.md`,
                title: note.title || '',
                created: note.created || new Date().toISOString(),
                modified: note.modified || new Date().toISOString(),
                size: note.size || 0,
                tags: Array.isArray(note.tags) ? note.tags : [],
                path: note.path || ''
              };
            } else {
              // Note doesn't exist anymore - clear it
              console.warn(
                'Active note ID found but note no longer exists:',
                activeNoteId
              );
              this.state.activeNote = null;
              await this.saveToStorage();
            }
          } catch (error) {
            console.warn('Failed to load active note:', error);
            this.state.activeNote = null;
            await this.saveToStorage();
          }
        } else {
          this.state.activeNote = null;
        }
      } else {
        this.state.activeNote = null;
      }
    } catch (error) {
      console.warn('Failed to load active note from storage:', error);
      this.state.activeNote = null;
    }
  }

  private async saveToStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const vaultId = this.state.currentVaultId || 'default';
      await window.api?.saveUIState({
        vaultId,
        stateKey: 'active_note',
        stateValue: $state.snapshot({ noteId: this.state.activeNote?.id || null })
      });
    } catch (error) {
      console.warn('Failed to save active note to storage:', error);
      throw error; // Re-throw to let calling code handle
    }
  }
}

export const activeNoteStore = new ActiveNoteStore();
