import { getChatService } from './chatService';
import type { PinnedNoteInfo } from './types';

interface PinnedNotesState {
  notes: PinnedNoteInfo[];
}

const defaultState: PinnedNotesState = {
  notes: []
};

const PINNED_NOTES_KEY_PREFIX = 'flint-pinned-notes';

class PinnedNotesStore {
  private state = $state<PinnedNotesState>(defaultState);
  private currentVaultId: string | null = null;

  constructor() {
    this.initializeVault();
  }

  get notes(): PinnedNoteInfo[] {
    return [...this.state.notes].sort((a, b) => a.order - b.order);
  }

  private getStorageKey(vaultId?: string): string {
    const vault = vaultId || this.currentVaultId || 'default';
    return `${PINNED_NOTES_KEY_PREFIX}-${vault}`;
  }

  private loadFromStorage(vaultId?: string): PinnedNoteInfo[] {
    try {
      const stored = localStorage.getItem(this.getStorageKey(vaultId));
      if (stored) {
        const notes = JSON.parse(stored);
        return this.migrateNotesWithoutOrder(notes);
      }
    } catch (error) {
      console.warn('Failed to load pinned notes from storage:', error);
    }
    return [];
  }

  private saveToStorage(vaultId?: string): void {
    try {
      localStorage.setItem(this.getStorageKey(vaultId), JSON.stringify(this.state.notes));
    } catch (error) {
      console.warn('Failed to save pinned notes to storage:', error);
    }
  }

  private migrateNotesWithoutOrder(notes: PinnedNoteInfo[]): PinnedNoteInfo[] {
    return notes.map((note, index) => ({
      ...note,
      order: note.order ?? index
    }));
  }

  private async initializeVault(): Promise<void> {
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.currentVaultId = vault?.id || 'default';
      const notes = this.loadFromStorage();
      this.state.notes = notes;
    } catch (error) {
      console.warn('Failed to initialize vault for pinned notes:', error);
      this.currentVaultId = 'default';
      const notes = this.loadFromStorage();
      this.state.notes = notes;
    }
  }

  isPinned(noteId: string): boolean {
    return this.state.notes.some((note) => note.id === noteId);
  }

  pinNote(id: string, title: string, filename: string): void {
    if (this.state.notes.some((note) => note.id === id)) {
      return; // Already pinned
    }

    const pinnedNote: PinnedNoteInfo = {
      id,
      title,
      filename,
      pinnedAt: new Date().toISOString(),
      order: this.state.notes.length
    };

    this.state.notes = [...this.state.notes, pinnedNote];
    this.saveToStorage();
  }

  unpinNote(noteId: string): void {
    this.state.notes = this.state.notes.filter((note) => note.id !== noteId);
    // Reassign order values to maintain sequence
    this.state.notes.forEach((note, index) => {
      note.order = index;
    });
    this.saveToStorage();
  }

  togglePin(id: string, title: string, filename: string): boolean {
    if (this.isPinned(id)) {
      this.unpinNote(id);
      return false;
    } else {
      this.pinNote(id, title, filename);
      return true;
    }
  }

  reorderNotes(sourceIndex: number, targetIndex: number): void {
    const notes = [...this.state.notes].sort((a, b) => a.order - b.order);
    const [removed] = notes.splice(sourceIndex, 1);
    notes.splice(targetIndex, 0, removed);

    // Reassign order values
    notes.forEach((note, index) => {
      note.order = index;
    });

    this.state.notes = notes;
    this.saveToStorage();
  }

  addNoteAtPosition(note: PinnedNoteInfo, targetIndex?: number): void {
    const notes = [...this.state.notes].sort((a, b) => a.order - b.order);
    const position = targetIndex ?? notes.length;

    notes.splice(position, 0, note);

    // Reassign order values
    notes.forEach((n, index) => {
      n.order = index;
    });

    this.state.notes = notes;
    this.saveToStorage();
  }

  clear(): void {
    this.state.notes = [];
    this.saveToStorage();
  }

  async refreshForVault(vaultId?: string): Promise<void> {
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
    const notes = this.loadFromStorage();
    this.state.notes = notes;
  }
}

export const pinnedNotesStore = new PinnedNotesStore();
