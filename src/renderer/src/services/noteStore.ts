import { writable, derived, get } from 'svelte/store';
import { getChatService } from './chatService';

export type NoteMetadata = {
  id: string;
  type: string;
  filename: string;
  title: string;
  created: string;
  modified: string;
  size: number;
  tags: string[];
  path: string;
};

export type NoteType = {
  name: string;
  count: number;
};

interface NotesStoreState {
  notes: NoteMetadata[];
  noteTypes: NoteType[];
  loading: boolean;
  error: string | null;
}

async function createNotesStore(): Promise<{
  subscribe: typeof store.subscribe;
  groupedNotes: typeof groupedNotes;
}> {
  const noteService = getChatService();
  const store = writable<NotesStoreState>({
    notes: [],
    noteTypes: [],
    loading: true,
    error: null
  });
  const { subscribe, update } = store;

  // Derived store for grouped notes by type
  const groupedNotes = derived(store, ($state) => {
    const grouped: Record<string, NoteMetadata[]> = {};

    for (const note of $state.notes) {
      if (!grouped[note.type]) {
        grouped[note.type] = [];
      }
      grouped[note.type].push(note);
    }

    return grouped;
  });

  // Load available note types from API
  async function loadNoteTypes(): Promise<void> {
    update((state) => ({ ...state, loading: true, error: null }));

    try {
      const result = await noteService.listNoteTypes();
      const noteTypes = result.map((typeItem) => ({
        name: typeItem.name,
        count: typeItem.noteCount
      }));
      update((state) => ({ ...state, noteTypes, loading: false }));
      return;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load note types';
      update((state) => ({
        ...state,
        error: errorMessage,
        noteTypes: [],
        loading: false
      }));
      console.error('Error loading note types:', err);
    }
  }

  // Load notes of a specific type from API
  async function loadNotesOfType(type: string): Promise<NoteMetadata[]> {
    try {
      // Try to use the note service API first
      const result = await noteService.listNotesByType(type);
      if (result && Array.isArray(result)) {
        const notes: NoteMetadata[] = result.map((note, index) => ({
          // @ts-ignore: TODO: Implement proper ID generation
          id: note.wikilink_format,
          type: note.type || type,
          filename: note.filename || `unknown-${index}`,
          title: note.title || note.filename || `Untitled Note ${index + 1}`,
          created: note.created || new Date().toISOString(),
          modified: note.modified || new Date().toISOString(),
          size: note.size || 0,
          tags: note.tags || [],
          path: note.path || ''
        }));
        return notes;
      } else {
        throw new Error(`Invalid response from listNotesByType API for type: ${type}`);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : `Failed to load notes for type: ${type}`;
      update((state) => ({ ...state, error: errorMessage }));
      console.error('Error loading notes for type', type, ':', err);
      return [];
    }
  }

  try {
    await loadNoteTypes();
    const loadedNotes: NoteMetadata[] = [];

    // Get current note types from store
    const currentState = get(store);

    // Load notes for each type
    for (const noteType of currentState.noteTypes) {
      const notesOfType = await loadNotesOfType(noteType.name);
      loadedNotes.push(...notesOfType);
    }

    // Sort notes by modification date (newest first)
    const sortedNotes = loadedNotes.sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );

    // Update the store with the loaded notes
    update((state) => ({ ...state, notes: sortedNotes, loading: false }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to load all notes';
    update((state) => ({ ...state, error: errorMessage, loading: false }));
    console.error('Error loading all notes:', err);
  }

  return {
    subscribe,
    groupedNotes
  };
}

// Create and export a single instance
export const notesStore = await createNotesStore();
