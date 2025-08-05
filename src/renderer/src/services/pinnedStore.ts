import { writable, get } from 'svelte/store';
import type { PinnedNoteInfo } from './types';

const PINNED_NOTES_KEY = 'flint-pinned-notes';

function createPinnedNotesStore(): {
  subscribe: (run: (value: PinnedNoteInfo[]) => void) => () => void;
  isPinned: (noteId: string) => boolean;
  pinNote: (id: string, title: string, filename: string) => void;
  unpinNote: (noteId: string) => void;
  togglePin: (id: string, title: string, filename: string) => boolean;
  clear: () => void;
} {
  const { subscribe, set, update } = writable<PinnedNoteInfo[]>([]);

  function loadFromStorage(): PinnedNoteInfo[] {
    try {
      const stored = localStorage.getItem(PINNED_NOTES_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load pinned notes from storage:', error);
    }
    return [];
  }

  function saveToStorage(notes: PinnedNoteInfo[]): void {
    try {
      localStorage.setItem(PINNED_NOTES_KEY, JSON.stringify(notes));
    } catch (error) {
      console.warn('Failed to save pinned notes to storage:', error);
    }
  }

  // Initialize with stored data
  const initialNotes = loadFromStorage();
  console.log('pinnedNotesStore: Initializing with notes:', initialNotes);
  set(initialNotes);

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
      console.log('pinnedNotesStore: togglePin called with:', { id, title, filename });
      console.log('pinnedNotesStore: current notes:', currentNotes);

      if (currentNotes.some((note) => note.id === id)) {
        console.log('pinnedNotesStore: Unpinning note');
        update((notes) => {
          const updatedNotes = notes.filter((note) => note.id !== id);
          console.log('pinnedNotesStore: After unpin:', updatedNotes);
          saveToStorage(updatedNotes);
          return updatedNotes;
        });
        return false;
      } else {
        console.log('pinnedNotesStore: Pinning note');
        update((notes) => {
          const pinnedNote: PinnedNoteInfo = {
            id,
            title,
            filename,
            pinnedAt: new Date().toISOString()
          };
          const updatedNotes = [...notes, pinnedNote];
          console.log('pinnedNotesStore: After pin:', updatedNotes);
          saveToStorage(updatedNotes);
          return updatedNotes;
        });
        return true;
      }
    },
    clear: (): void => {
      set([]);
      saveToStorage([]);
    }
  };
}

export const pinnedNotesStore = createPinnedNotesStore();
