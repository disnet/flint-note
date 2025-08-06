import { writable, get } from 'svelte/store';
import type { PinnedNoteInfo } from './types';
import { getChatService } from './chatService';

const PINNED_NOTES_KEY_PREFIX = 'flint-pinned-notes';

function createPinnedNotesStore(): {
  subscribe: (run: (value: PinnedNoteInfo[]) => void) => () => void;
  isPinned: (noteId: string) => boolean;
  pinNote: (id: string, title: string, filename: string) => void;
  unpinNote: (noteId: string) => void;
  togglePin: (id: string, title: string, filename: string) => boolean;
  clear: () => void;
  refreshForVault: (vaultId?: string) => Promise<void>;
} {
  const { subscribe, set, update } = writable<PinnedNoteInfo[]>([]);
  let currentVaultId: string | null = null;

  function getStorageKey(vaultId?: string): string {
    const vault = vaultId || currentVaultId || 'default';
    return `${PINNED_NOTES_KEY_PREFIX}-${vault}`;
  }

  function loadFromStorage(vaultId?: string): PinnedNoteInfo[] {
    try {
      const stored = localStorage.getItem(getStorageKey(vaultId));
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load pinned notes from storage:', error);
    }
    return [];
  }

  function saveToStorage(notes: PinnedNoteInfo[], vaultId?: string): void {
    try {
      localStorage.setItem(getStorageKey(vaultId), JSON.stringify(notes));
    } catch (error) {
      console.warn('Failed to save pinned notes to storage:', error);
    }
  }

  // Initialize current vault and load data
  async function initializeVault(): Promise<void> {
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      currentVaultId = vault?.id || 'default';
      const notes = loadFromStorage();
      set(notes);
    } catch (error) {
      console.warn('Failed to initialize vault for pinned notes:', error);
      currentVaultId = 'default';
      const notes = loadFromStorage();
      set(notes);
    }
  }

  // Initialize on creation
  initializeVault();

  // Create a derived store for the isPinned function
  const store = { subscribe };

  return {
    subscribe,
    isPinned: (noteId: string): boolean => {
      const currentNotes = get(store);
      return currentNotes.some((note) => note.id === noteId);
    },
    pinNote: (id: string, title: string, filename: string): void => {
      update((notes) => {
        if (notes.some((note) => note.id === id)) {
          return notes; // Already pinned
        }
        const pinnedNote: PinnedNoteInfo = {
          id,
          title,
          filename,
          pinnedAt: new Date().toISOString()
        };
        const updatedNotes = [...notes, pinnedNote];
        saveToStorage(updatedNotes);
        return updatedNotes;
      });
    },
    unpinNote: (noteId: string): void => {
      update((notes) => {
        const updatedNotes = notes.filter((note) => note.id !== noteId);
        saveToStorage(updatedNotes);
        return updatedNotes;
      });
    },
    togglePin: (id: string, title: string, filename: string): boolean => {
      const currentNotes = get(store);

      if (currentNotes.some((note) => note.id === id)) {
        update((notes) => {
          const updatedNotes = notes.filter((note) => note.id !== id);
          saveToStorage(updatedNotes);
          return updatedNotes;
        });
        return false;
      } else {
        update((notes) => {
          const pinnedNote: PinnedNoteInfo = {
            id,
            title,
            filename,
            pinnedAt: new Date().toISOString()
          };
          const updatedNotes = [...notes, pinnedNote];
          saveToStorage(updatedNotes);
          return updatedNotes;
        });
        return true;
      }
    },
    clear: (): void => {
      set([]);
      saveToStorage([]);
    },
    refreshForVault: async (vaultId?: string): Promise<void> => {
      if (vaultId) {
        currentVaultId = vaultId;
      } else {
        try {
          const service = getChatService();
          const vault = await service.getCurrentVault();
          currentVaultId = vault?.id || 'default';
        } catch (error) {
          console.warn('Failed to get current vault:', error);
        }
      }
      const notes = loadFromStorage();
      set(notes);
    }
  };
}

export const pinnedNotesStore = createPinnedNotesStore();
