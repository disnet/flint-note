import { getChatService } from './chatService';
import type { PinnedNoteInfo } from './types';
import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';

interface PinnedNotesState {
  notes: PinnedNoteInfo[];
  isLoading: boolean;
  isInitialized: boolean;
}

const defaultState: PinnedNotesState = {
  notes: [],
  isLoading: true,
  isInitialized: false
};

class PinnedNotesStore {
  private state = $state<PinnedNotesState>(defaultState);
  private currentVaultId: string | null = null;

  constructor() {
    // Start initialization but don't await in constructor
    this.initializeVault();
  }

  get notes(): PinnedNoteInfo[] {
    // Only return notes if initialized
    if (!this.state.isInitialized) return [];
    return [...this.state.notes].sort((a, b) => a.order - b.order);
  }

  get loading(): boolean {
    return this.state.isLoading;
  }

  get initialized(): boolean {
    return this.state.isInitialized;
  }

  private async loadFromStorage(vaultId?: string): Promise<PinnedNoteInfo[]> {
    try {
      const vault = vaultId || this.currentVaultId || 'default';
      const stored = await window.api.loadUIState({
        vaultId: vault,
        stateKey: 'pinned_notes'
      });

      if (
        stored &&
        typeof stored === 'object' &&
        'notes' in stored &&
        Array.isArray(stored.notes)
      ) {
        return stored.notes as PinnedNoteInfo[];
      }
      return [];
    } catch (error) {
      console.warn('Failed to load pinned notes from storage:', error);
      return []; // Return empty array on error
    }
  }

  private async saveToStorage(vaultId?: string): Promise<void> {
    try {
      const vault = vaultId || this.currentVaultId || 'default';
      // Serialize the notes - only persist id, pinnedAt, and order
      const serializedNotes = this.state.notes.map((note) => ({
        id: note.id,
        pinnedAt: note.pinnedAt,
        order: note.order
      }));
      await window.api.saveUIState({
        vaultId: vault,
        stateKey: 'pinned_notes',
        stateValue: $state.snapshot({ notes: serializedNotes })
      });
    } catch (error) {
      console.warn('Failed to save pinned notes to storage:', error);
      throw error; // Let calling code handle the error
    }
  }

  private async initializeVault(): Promise<void> {
    this.state.isLoading = true;
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.currentVaultId = vault?.id || 'default';
      const notes = await this.loadFromStorage(); // Now properly async
      this.state.notes = notes;
    } catch (error) {
      console.warn('Failed to initialize vault for pinned notes:', error);
      this.currentVaultId = 'default';
      const notes = await this.loadFromStorage(); // Now properly async
      this.state.notes = notes;
    } finally {
      this.state.isLoading = false;
      this.state.isInitialized = true;
    }
  }

  isPinned(noteId: string): boolean {
    return this.state.notes.some((note) => note.id === noteId);
  }

  async pinNote(id: string): Promise<void> {
    if (this.state.notes.some((note) => note.id === id)) {
      return; // Already pinned
    }

    const pinnedNote: PinnedNoteInfo = {
      id,
      pinnedAt: new Date().toISOString(),
      order: this.state.notes.length
    };

    this.state.notes = [...this.state.notes, pinnedNote];
    await this.saveToStorage();

    // Remove from temporary tabs when pinned
    await temporaryTabsStore.removeTabsByNoteIds([id]);
  }

  async unpinNote(noteId: string): Promise<void> {
    this.state.notes = this.state.notes.filter((note) => note.id !== noteId);
    // Reassign order values to maintain sequence
    this.state.notes.forEach((note, index) => {
      note.order = index;
    });
    await this.saveToStorage();

    // Add to temporary tabs when unpinned
    await temporaryTabsStore.addTab(noteId, 'navigation');
  }

  async togglePin(id: string): Promise<boolean> {
    if (this.isPinned(id)) {
      await this.unpinNote(id);
      return false;
    } else {
      await this.pinNote(id);
      return true;
    }
  }

  async reorderNotes(sourceIndex: number, targetIndex: number): Promise<void> {
    const notes = [...this.state.notes].sort((a, b) => a.order - b.order);
    const movedNote = notes[sourceIndex];
    const [removed] = notes.splice(sourceIndex, 1);
    notes.splice(targetIndex, 0, removed);

    // Reassign order values
    notes.forEach((note, index) => {
      note.order = index;
    });

    this.state.notes = notes;
    await this.saveToStorage(); // Now async

    // Trigger animation after DOM update
    if (movedNote && typeof window !== 'undefined') {
      import('../utils/dragDrop.svelte.js')
        .then(({ animateReorder }) => {
          setTimeout(() => {
            animateReorder('.pinned-list', sourceIndex, targetIndex, movedNote.id);
          }, 10);
        })
        .catch(() => {
          // Silently fail if animation utilities aren't available
        });
    }
  }

  async addNoteAtPosition(note: PinnedNoteInfo, targetIndex?: number): Promise<void> {
    const notes = [...this.state.notes].sort((a, b) => a.order - b.order);
    const position = targetIndex ?? notes.length;

    notes.splice(position, 0, note);

    // Reassign order values
    notes.forEach((n, index) => {
      n.order = index;
    });

    this.state.notes = notes;
    await this.saveToStorage(); // Now async

    // Trigger animation for newly added note
    if (typeof window !== 'undefined') {
      import('../utils/dragDrop.svelte.js')
        .then(({ animateItemAdd }) => {
          animateItemAdd(note.id, '.pinned-list');
        })
        .catch(() => {
          // Silently fail if animation utilities aren't available
        });
    }
  }

  async clear(): Promise<void> {
    this.state.notes = [];
    await this.saveToStorage(); // Now async
  }

  async updateNoteId(oldId: string, newId: string): Promise<void> {
    const pinnedNote = this.state.notes.find((note) => note.id === oldId);
    if (pinnedNote) {
      pinnedNote.id = newId;
      await this.saveToStorage();
    }
  }

  async refreshForVault(vaultId?: string): Promise<void> {
    this.state.isLoading = true;
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
      const notes = await this.loadFromStorage(); // Now properly async
      this.state.notes = notes;
    } catch (error) {
      console.warn('Failed to refresh vault for pinned notes:', error);
    } finally {
      this.state.isLoading = false;
    }
  }

  /**
   * Pin the welcome note for new vaults
   * Called after vault creation to provide immediate guidance
   */
  async pinWelcomeNote(welcomeNoteId?: string | null): Promise<void> {
    if (welcomeNoteId) {
      await this.pinNote(welcomeNoteId);
    } else {
      // Fallback: try to find the welcome note by title
      const { notesStore } = await import('./noteStore.svelte');
      // Note: The note cache should already be populated via message bus events
      const welcomeNote = notesStore.notes.find(
        (note) => note.title === 'Welcome to Flint'
      );
      if (welcomeNote) {
        await this.pinNote(welcomeNote.id);
      }
    }
  }

  /**
   * Pin tutorial notes for new vaults
   * Called after vault creation to provide structured learning path
   */
  async pinTutorialNotes(): Promise<void> {
    const tutorialIds = [
      'note/tutorial-1-your-first-daily-note',
      'note/tutorial-2-connecting-ideas-with-wikilinks',
      'note/tutorial-3-your-ai-assistant-in-action',
      'note/tutorial-4-understanding-note-types'
    ];

    for (const id of tutorialIds) {
      await this.pinNote(id);
    }
  }
}

export const pinnedNotesStore = new PinnedNotesStore();
