import { getChatService } from './chatService';
import { noteCache } from './noteCache.svelte';
import { messageBus } from './messageBus.svelte';
import { logger } from '../utils/logger';

export type NoteMetadata = {
  id: string;
  type: string;
  filename: string;
  title: string;
  created: string;
  modified: string;
  size: number;
  path: string;
  archived?: boolean;
  flint_kind?: string;
};

export type NoteType = {
  name: string;
  count: number;
  purpose: string;
  icon?: string;
  /** True for system types like 'type' that users cannot create notes of */
  isSystemType?: boolean;
  /** The ID of the type note file (for file-based types) */
  noteId?: string;
};

interface NotesStoreState {
  noteTypes: NoteType[];
  loading: boolean;
  error: string | null;
  initializationPromise: Promise<void> | null;
}

function createNotesStore(): {
  readonly notes: NoteMetadata[];
  readonly allNotes: NoteMetadata[];
  readonly noteTypes: NoteType[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly groupedNotes: Record<string, NoteMetadata[]>;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const noteService = getChatService();

  const state = $state<NotesStoreState>({
    noteTypes: [],
    loading: true,
    error: null,
    initializationPromise: null
  });

  // Derived: all notes including archived (for wikilink resolution)
  const allNotes = $derived.by(() => {
    const notes = noteCache.getAllNotes();
    logger.debug(
      '[noteStore] $derived re-running, got',
      notes.length,
      'notes from cache'
    );
    return notes;
  });

  // Derived: active notes (excluding archived, for display in lists)
  const notes = $derived.by(() => {
    return allNotes.filter((note) => !note.archived);
  });

  // Derived: grouped notes by type (only active notes)
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
        count: typeItem.noteCount,
        purpose: typeItem.purpose || '',
        icon: typeItem.icon,
        isSystemType: typeItem.isSystemType,
        noteId: typeItem.noteId
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
  // Note: includeArchived is always true to support wikilink resolution to archived notes
  async function loadNotesOfType(type: string, vaultId: string): Promise<NoteMetadata[]> {
    try {
      const result = await noteService.listNotesByType({
        vaultId,
        type,
        includeArchived: true
      });
      if (result && Array.isArray(result)) {
        return result.map((note) => ({
          id: note.id,
          type: note.type || type,
          filename: note.filename || `unknown-${result.indexOf(note)}.md`,
          title: note.title || '',
          created: note.created || new Date().toISOString(),
          modified: note.modified || new Date().toISOString(),
          size: note.size || 0,
          path: note.path || '',
          archived: note.archived || false,
          flint_kind: note.flint_kind
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
    // If already initializing, return the existing promise
    if (state.initializationPromise) {
      logger.debug(
        '[noteStore] Initialization already in progress, awaiting existing promise'
      );
      return state.initializationPromise;
    }
    return doInitialize();
  }

  // Force refresh - clears any existing promise and re-initializes
  async function refresh(): Promise<void> {
    logger.debug('[noteStore] Force refresh requested');
    // Wait for any in-progress initialization to complete, then re-initialize
    if (state.initializationPromise) {
      await state.initializationPromise;
    }
    return doInitialize();
  }

  async function doInitialize(): Promise<void> {
    // Create and store the initialization promise
    state.initializationPromise = (async () => {
      try {
        state.loading = true;
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

        // Load notes for each type (including 'type' which is marked as isSystemType)
        for (const noteType of state.noteTypes) {
          const notesOfType = await loadNotesOfType(noteType.name, currentVault.id);
          loadedNotes.push(...notesOfType);
        }

        // Sort notes by modification date (newest first)
        const sortedNotes = loadedNotes.sort(
          (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
        );

        // Publish bulk refresh event to populate cache
        logger.debug(
          `[noteStore] Publishing bulk refresh with ${sortedNotes.length} notes`
        );
        messageBus.publish({
          type: 'notes.bulkRefresh',
          notes: sortedNotes
        });

        state.loading = false;
        logger.debug('[noteStore] Initialization complete');
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load all notes';
        state.error = errorMessage;
        state.loading = false;
        console.error('Error loading all notes:', err);
      } finally {
        // Clear the promise once initialization is complete
        state.initializationPromise = null;
      }
    })();

    return state.initializationPromise;
  }

  // NOTE: vault.switched listener removed to prevent duplicate initialization
  // VaultSwitcher now explicitly calls notesStore.initialize() in the correct sequence
  // This prevents race conditions between event-driven and explicit initialization paths

  // Defer initial load to next tick to ensure all modules are initialized
  // This prevents race conditions where events are published before subscribers are ready
  setTimeout(() => {
    initialize();
  }, 0);

  return {
    get notes() {
      return notes;
    },
    get allNotes() {
      return allNotes;
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
    initialize,
    refresh
  };
}

// Create and export a single instance
export const notesStore = createNotesStore();
