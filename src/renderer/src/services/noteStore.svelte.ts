import { getChatService } from './chatService';
import { noteCache } from './noteCache.svelte';
import { messageBus } from './messageBus.svelte';

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
  noteTypes: NoteType[];
  loading: boolean;
  error: string | null;
}

function createNotesStore(): {
  readonly notes: NoteMetadata[];
  readonly noteTypes: NoteType[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly groupedNotes: Record<string, NoteMetadata[]>;
  initialize: () => Promise<void>;
} {
  const noteService = getChatService();

  const state = $state<NotesStoreState>({
    noteTypes: [],
    loading: true,
    error: null
  });

  // Derived: notes come from cache, not local state
  const notes = $derived.by(() => {
    const allNotes = noteCache.getAllNotes();
    console.log(
      '[noteStore] $derived re-running, got',
      allNotes.length,
      'notes from cache'
    );
    return allNotes;
  });

  // Derived: grouped notes by type
  const groupedNotes = $derived.by(() => {
    const grouped: Record<string, NoteMetadata[]> = {};

    for (const note of notes) {
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

  // Load notes of a specific type from API (without fetching full content)
  async function loadNotesOfType(type: string, vaultId: string): Promise<NoteMetadata[]> {
    try {
      const result = await noteService.listNotesByType({ vaultId, type });
      if (result && Array.isArray(result)) {
        return result.map((note) => ({
          id: note.id,
          type: note.type || type,
          filename: note.filename || `unknown-${result.indexOf(note)}.md`,
          title: note.title || '',
          created: note.created || new Date().toISOString(),
          modified: note.modified || new Date().toISOString(),
          size: note.size || 0,
          tags: note.tags || [],
          path: note.path || ''
        }));
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

  // Initialize: load all notes into cache
  async function initialize(): Promise<void> {
    try {
      // Get the current vault first
      const currentVault = await noteService.getCurrentVault();
      if (!currentVault) {
        console.warn('No current vault available for loading notes');
        state.loading = false;
        state.error = 'No vault selected';
        return;
      }

      await loadNoteTypes();
      const loadedNotes: NoteMetadata[] = [];

      // Load notes for each type
      for (const noteType of state.noteTypes) {
        const notesOfType = await loadNotesOfType(noteType.name, currentVault.id);
        loadedNotes.push(...notesOfType);
      }

      // Sort notes by modification date (newest first)
      const sortedNotes = loadedNotes.sort(
        (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
      );

      // Publish bulk refresh event to populate cache
      console.log(`[noteStore] Publishing bulk refresh with ${sortedNotes.length} notes`);
      messageBus.publish({
        type: 'notes.bulkRefresh',
        notes: sortedNotes
      });

      state.loading = false;
      console.log('[noteStore] Initialization complete');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load all notes';
      state.error = errorMessage;
      state.loading = false;
      console.error('Error loading all notes:', err);
    }
  }

  // Subscribe to vault switch events to reinitialize
  messageBus.subscribe('vault.switched', () => {
    initialize();
  });

  // Defer initial load to next tick to ensure all modules are initialized
  // This prevents race conditions where events are published before subscribers are ready
  setTimeout(() => {
    initialize();
  }, 0);

  return {
    get notes() {
      return notes;
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
    initialize
  };
}

// Create and export a single instance
export const notesStore = createNotesStore();
