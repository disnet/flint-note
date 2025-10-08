import type { NoteMetadata } from '../services/noteStore.svelte';
import { getChatService } from '../services/chatService';
import { notesStore } from '../services/noteStore.svelte';

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

  constructor() {
    this.initializationPromise = this.initializeVault();
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
    this.state.activeNote = note;
    await this.saveToStorage();
  }

  /**
   * Clear the active note
   */
  async clearActiveNote(): Promise<void> {
    await this.ensureInitialized();
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
        // Note still exists, return the stored metadata
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
          // We have a note ID, now we need to find the full metadata in the notes store
          // First ensure notes store is loaded
          if (notesStore.loading || notesStore.notes.length === 0) {
            await notesStore.refresh();
          }

          // Find the note in the notes store
          const noteMetadata = notesStore.notes.find((note) => note.id === activeNoteId);

          if (noteMetadata) {
            this.state.activeNote = noteMetadata;
          } else {
            // Note ID exists in storage but note doesn't exist anymore - clear it
            console.warn('Active note ID found but note no longer exists:', activeNoteId);
            this.state.activeNote = null;
            // Clear the invalid ID from storage
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
