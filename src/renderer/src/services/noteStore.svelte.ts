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

function createNotesStore(): {
  readonly notes: NoteMetadata[];
  readonly noteTypes: NoteType[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly groupedNotes: () => Record<string, NoteMetadata[]>;
  refresh: () => Promise<void>;
  handleToolCall: (toolCall: { name: string }) => void;
} {
  const noteService = getChatService();

  const state = $state<NotesStoreState>({
    notes: [],
    noteTypes: [],
    loading: true,
    error: null
  });

  // Derived store for grouped notes by type
  const groupedNotes = $derived(() => {
    const grouped: Record<string, NoteMetadata[]> = {};

    for (const note of state.notes) {
      if (!grouped[note.type]) {
        grouped[note.type] = [];
      }
      grouped[note.type].push(note);
    }

    return grouped;
  });

  // Load available note types from API
  async function loadNoteTypes(): Promise<void> {
    state.loading = true;
    state.error = null;

    try {
      const result = await noteService.listNoteTypes();
      const noteTypes = result.map((typeItem) => ({
        name: typeItem.name,
        count: typeItem.noteCount
      }));
      state.noteTypes = noteTypes;
      state.loading = false;
      return;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load note types';
      state.error = errorMessage;
      state.noteTypes = [];
      state.loading = false;
      console.error('Error loading note types:', err);
    }
  }

  // Load notes of a specific type from API
  async function loadNotesOfType(type: string): Promise<NoteMetadata[]> {
    try {
      // Try to use the note service API first
      const result = await noteService.listNotesByType({ type });
      if (result && Array.isArray(result)) {
        const notes: NoteMetadata[] = result.map((note, index) => ({
          id: note.id,
          type: note.type || type,
          filename: note.title || `unknown-${index}`,
          title: note.title || `Untitled Note ${index + 1}`,
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
      state.error = errorMessage;
      console.error('Error loading notes for type', type, ':', err);
      return [];
    }
  }

  // Function to load all notes
  async function loadAllNotes(): Promise<void> {
    try {
      await loadNoteTypes();
      const loadedNotes: NoteMetadata[] = [];

      // Load notes for each type
      for (const noteType of state.noteTypes) {
        const notesOfType = await loadNotesOfType(noteType.name);
        loadedNotes.push(...notesOfType);
      }

      // Sort notes by modification date (newest first)
      const sortedNotes = loadedNotes.sort(
        (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
      );

      // Update the state with the loaded notes
      state.notes = sortedNotes;
      state.loading = false;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load all notes';
      state.error = errorMessage;
      state.loading = false;
      console.error('Error loading all notes:', err);
    }
  }

  // Public refresh function that can be called to reload notes
  async function refresh(): Promise<void> {
    console.log('Notes store: refresh() called - starting refresh...');
    state.loading = true;
    state.error = null;
    await loadAllNotes();
    console.log('Notes store: refresh() completed');
  }

  // Handle tool calls and refresh on any tool call
  function handleToolCall(_toolCall: { name: string }): void {
    // Use a small delay to ensure the backend operation is complete
    setTimeout(() => {
      refresh();
    }, 100);
  }

  // Initial load
  loadAllNotes();

  return {
    get notes() {
      return state.notes;
    },
    get noteTypes() {
      return state.noteTypes;
    },
    get loading() {
      return state.loading;
    },
    get error() {
      return state.error;
    },
    get groupedNotes() {
      return groupedNotes;
    },
    refresh,
    handleToolCall
  };
}

// Create and export a single instance
export const notesStore = createNotesStore();
