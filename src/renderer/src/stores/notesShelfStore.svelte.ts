import { getChatService } from '../services/chatService';
import { messageBus } from '../services/messageBus.svelte';

export interface ShelfNote {
  noteId: string;
  title: string;
  content: string;
  isExpanded: boolean;
}

interface NotesShelfState {
  notes: ShelfNote[];
}

const defaultState: NotesShelfState = {
  notes: []
};

class NotesShelfStore {
  private state = $state<NotesShelfState>(defaultState);
  private isLoading = $state(true);
  private isInitialized = $state(false);
  private initializationPromise: Promise<void> | null = null;
  private currentVaultId: string | null = null;

  constructor() {
    this.initializationPromise = this.initialize();

    // Subscribe to vault.switched events to reload notes shelf for the new vault
    messageBus.subscribe('vault.switched', async (event) => {
      await this.refreshForVault(event.vaultId);
    });
  }

  get notes(): ShelfNote[] {
    return this.state.notes;
  }

  get loading(): boolean {
    return this.isLoading;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Ensure initialization is complete before operations
   */
  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Initialize the store by loading data from the current vault
   */
  private async initialize(): Promise<void> {
    this.isLoading = true;
    try {
      // Get the current vault ID
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.currentVaultId = vault?.id || 'default';

      // Load notes shelf for this vault
      const notes = await this.loadFromStorage();
      this.state.notes = notes;
    } catch (error) {
      console.warn('Failed to initialize notes shelf:', error);
      this.currentVaultId = 'default';
      const notes = await this.loadFromStorage();
      this.state.notes = notes;
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  /**
   * Load notes shelf from storage for the current vault
   */
  private async loadFromStorage(vaultId?: string): Promise<ShelfNote[]> {
    try {
      const vault = vaultId || this.currentVaultId || 'default';
      const stored = await window.api.loadUIState({
        vaultId: vault,
        stateKey: 'sidebar_notes'
      });

      if (
        stored &&
        typeof stored === 'object' &&
        'notes' in stored &&
        Array.isArray(stored.notes)
      ) {
        return stored.notes as ShelfNote[];
      }
      return [];
    } catch (error) {
      console.warn('Failed to load notes shelf from storage:', error);
      return [];
    }
  }

  /**
   * Save current state to storage for the current vault
   */
  private async saveToStorage(vaultId?: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const vault = vaultId || this.currentVaultId || 'default';
      // Snapshot the state to make it serializable for IPC
      const stateSnapshot = $state.snapshot(this.state);

      await window.api?.saveUIState({
        vaultId: vault,
        stateKey: 'sidebar_notes',
        stateValue: stateSnapshot
      });
    } catch (error) {
      console.error('Failed to save notes shelf to storage:', error);
    }
  }

  /**
   * Check if a note is on the shelf
   */
  isOnShelf(noteId: string): boolean {
    return this.state.notes.some((note) => note.noteId === noteId);
  }

  /**
   * Add a note to the shelf
   */
  async addNote(noteId: string, title: string, content: string): Promise<void> {
    await this.ensureInitialized();

    // Don't add if already exists
    if (this.isOnShelf(noteId)) {
      return;
    }

    this.state.notes.push({
      noteId,
      title,
      content,
      isExpanded: false
    });

    await this.saveToStorage();
  }

  /**
   * Remove a note from the shelf
   */
  async removeNote(noteId: string): Promise<void> {
    await this.ensureInitialized();

    this.state.notes = this.state.notes.filter((note) => note.noteId !== noteId);

    await this.saveToStorage();
  }

  /**
   * Update a note's title and/or content in the notes shelf store
   * Note: With the shared document model, this is primarily for maintaining
   * the shelf's internal state. Content sync happens through NoteDocument.
   */
  async updateNote(
    noteId: string,
    updates: Partial<Pick<ShelfNote, 'title' | 'content'>>
  ): Promise<void> {
    await this.ensureInitialized();

    const note = this.state.notes.find((n) => n.noteId === noteId);
    if (note) {
      // Update the shelf note copy (used for display state)
      if (updates.title !== undefined) {
        note.title = updates.title;
      }
      if (updates.content !== undefined) {
        note.content = updates.content;
      }

      await this.saveToStorage();
    }
  }

  /**
   * Toggle the expanded state of a note
   */
  async toggleExpanded(noteId: string): Promise<void> {
    await this.ensureInitialized();

    const note = this.state.notes.find((n) => n.noteId === noteId);
    if (note) {
      note.isExpanded = !note.isExpanded;
      await this.saveToStorage();
    }
  }

  /**
   * Refresh notes shelf for a new vault
   * Called when the vault is switched
   */
  async refreshForVault(vaultId?: string): Promise<void> {
    this.isLoading = true;
    try {
      if (vaultId) {
        this.currentVaultId = vaultId;
      } else {
        try {
          const service = getChatService();
          const vault = await service.getCurrentVault();
          this.currentVaultId = vault?.id || 'default';
        } catch (error) {
          console.warn('Failed to get current vault:', error);
        }
      }
      const notes = await this.loadFromStorage();
      this.state.notes = notes;
    } catch (error) {
      console.warn('Failed to refresh vault for notes shelf:', error);
    } finally {
      this.isLoading = false;
    }
  }
}

export const notesShelfStore = new NotesShelfStore();
