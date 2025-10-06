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
  snippet?: string;
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
  wikilinksUpdateCounter: number;
  noteUpdateCounter: number;
  lastUpdatedNoteId: string | null;
  noteRenameCounter: number;
  lastRenamedNoteOldId: string | null;
  lastRenamedNoteNewId: string | null;
}

function createNotesStore(): {
  readonly notes: NoteMetadata[];
  readonly noteTypes: NoteType[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly groupedNotes: Record<string, NoteMetadata[]>;
  readonly wikilinksUpdateCounter: number;
  readonly noteUpdateCounter: number;
  readonly lastUpdatedNoteId: string | null;
  readonly noteRenameCounter: number;
  readonly lastRenamedNoteOldId: string | null;
  readonly lastRenamedNoteNewId: string | null;
  refresh: () => Promise<void>;
  handleToolCall: (toolCall: { name: string }) => void;
  notifyWikilinksUpdated: () => void;
  notifyNoteUpdated: (noteId: string) => void;
  notifyNoteRenamed: (oldId: string, newId: string) => void;
} {
  const noteService = getChatService();

  const state = $state<NotesStoreState>({
    notes: [],
    noteTypes: [],
    loading: true,
    error: null,
    wikilinksUpdateCounter: 0,
    noteUpdateCounter: 0,
    lastUpdatedNoteId: null,
    noteRenameCounter: 0,
    lastRenamedNoteOldId: null,
    lastRenamedNoteNewId: null
  });

  // Derived store for grouped notes by type
  const groupedNotes = $derived.by(() => {
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

  // Function to generate a snippet from content
  function generateSnippet(content: string, maxLength: number = 150): string {
    // Remove frontmatter if present
    const contentWithoutFrontmatter = content.replace(/^---[\s\S]*?---\n?/, '');

    // Remove markdown headers and formatting
    const cleanContent = contentWithoutFrontmatter
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();

    if (cleanContent.length <= maxLength) {
      return cleanContent;
    }

    // Find a good breaking point near the max length
    const truncated = cleanContent.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    const breakPoint = lastSpace > maxLength * 0.8 ? lastSpace : maxLength;

    return cleanContent.substring(0, breakPoint) + '...';
  }

  // Load notes of a specific type from API
  async function loadNotesOfType(type: string, vaultId: string): Promise<NoteMetadata[]> {
    try {
      // Try to use the note service API first
      const result = await noteService.listNotesByType({ vaultId, type });
      if (result && Array.isArray(result)) {
        const notesWithSnippets: NoteMetadata[] = [];

        for (const note of result) {
          let snippet = '';
          try {
            // Get the full note content to generate snippet
            const fullNote = await noteService.getNote({ vaultId, identifier: note.id });
            if (fullNote && fullNote.content) {
              snippet = generateSnippet(fullNote.content);
            }
          } catch (err) {
            console.warn(`Failed to get content for note ${note.id}:`, err);
            // Continue without snippet if content fetch fails
          }

          const noteWithSnippet: NoteMetadata = {
            id: note.id,
            type: note.type || type,
            filename: note.title || `unknown-${result.indexOf(note)}`,
            title: note.title || '',
            created: note.created || new Date().toISOString(),
            modified: note.modified || new Date().toISOString(),
            size: note.size || 0,
            tags: note.tags || [],
            path: note.path || '',
            snippet
          };

          notesWithSnippets.push(noteWithSnippet);
        }

        return notesWithSnippets;
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

  function notifyWikilinksUpdated(): void {
    state.wikilinksUpdateCounter++;
  }

  function notifyNoteUpdated(noteId: string): void {
    state.noteUpdateCounter++;
    state.lastUpdatedNoteId = noteId;
  }

  function notifyNoteRenamed(oldId: string, newId: string): void {
    state.noteRenameCounter++;
    state.lastRenamedNoteOldId = oldId;
    state.lastRenamedNoteNewId = newId;
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
    get wikilinksUpdateCounter() {
      return state.wikilinksUpdateCounter;
    },
    get noteUpdateCounter() {
      return state.noteUpdateCounter;
    },
    get lastUpdatedNoteId() {
      return state.lastUpdatedNoteId;
    },
    get noteRenameCounter() {
      return state.noteRenameCounter;
    },
    get lastRenamedNoteOldId() {
      return state.lastRenamedNoteOldId;
    },
    get lastRenamedNoteNewId() {
      return state.lastRenamedNoteNewId;
    },
    refresh,
    handleToolCall,
    notifyWikilinksUpdated,
    notifyNoteUpdated,
    notifyNoteRenamed
  };
}

// Create and export a single instance
export const notesStore = createNotesStore();
