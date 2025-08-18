import type { NoteMetadata } from '../services/noteStore.svelte';
import { getChatService } from '../services/chatService';

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
  private isInitialized = false;

  constructor() {
    this.initializeVault();
  }

  get activeNote(): NoteMetadata | null {
    return this.state.activeNote;
  }

  /**
   * Set the active note and persist it
   */
  setActiveNote(note: NoteMetadata | null): void {
    this.state.activeNote = note;
    this.saveToStorage();
  }

  /**
   * Clear the active note
   */
  clearActiveNote(): void {
    this.state.activeNote = null;
    this.saveToStorage();
  }

  /**
   * Start vault switch - clear active note for vault transition
   */
  startVaultSwitch(): void {
    this.state.activeNote = null;
    this.saveToStorage();
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

      this.loadFromStorage();
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
        this.clearActiveNote();
        return null;
      }
    } catch (error) {
      console.warn('Failed to verify stored active note:', error);
      // Clear the invalid note
      this.clearActiveNote();
      return null;
    }
  }

  private async initializeVault(): Promise<void> {
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.state.currentVaultId = vault?.id || 'default';
      this.loadFromStorage();
      this.isInitialized = true;
    } catch (error) {
      console.warn('Failed to initialize vault for active note:', error);
      this.state.currentVaultId = 'default';
      this.loadFromStorage();
      this.isInitialized = true;
    }
  }

  private getStorageKey(): string {
    const vaultId = this.state.currentVaultId || 'default';
    return `activeNote-${vaultId}`;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        const parsed = JSON.parse(stored);

        // Validate the stored note has required fields
        if (parsed && typeof parsed === 'object' && parsed.id && parsed.title) {
          this.state.activeNote = parsed;
        }
      }
    } catch (error) {
      console.warn('Failed to load active note from storage:', error);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      if (this.state.activeNote) {
        localStorage.setItem(this.getStorageKey(), JSON.stringify(this.state.activeNote));
      } else {
        localStorage.removeItem(this.getStorageKey());
      }
    } catch (error) {
      console.warn('Failed to save active note to storage:', error);
    }
  }
}

export const activeNoteStore = new ActiveNoteStore();
