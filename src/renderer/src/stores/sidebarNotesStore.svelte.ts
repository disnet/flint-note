import { notesStore } from '../services/noteStore.svelte';

export interface SidebarNote {
  noteId: string;
  title: string;
  content: string;
  isExpanded: boolean;
}

interface SidebarNotesState {
  notes: SidebarNote[];
}

const defaultState: SidebarNotesState = {
  notes: []
};

class SidebarNotesStore {
  private state = $state<SidebarNotesState>(defaultState);
  private isLoading = $state(true);
  private isInitialized = $state(false);
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initialize();
  }

  get notes(): SidebarNote[] {
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
   * Initialize the store by loading data from file system
   */
  private async initialize(): Promise<void> {
    this.isLoading = true;
    try {
      const storedState = (await window.api?.loadAppSettings()) as
        | { sidebarNotes?: SidebarNotesState }
        | undefined;

      if (storedState?.sidebarNotes) {
        this.state = { ...defaultState, ...storedState.sidebarNotes };
      }
    } catch (error) {
      console.warn('Failed to load sidebar notes from storage:', error);
      // Keep default state on error
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  /**
   * Save current state to file system
   */
  private async saveToStorage(): Promise<void> {
    await this.ensureInitialized();

    try {
      // Snapshot the state to make it serializable for IPC
      const stateSnapshot = $state.snapshot(this.state);

      // Load existing settings and update the sidebar notes portion
      const currentSettings =
        ((await window.api?.loadAppSettings()) as Record<string, unknown>) || {};
      const updatedSettings = {
        ...currentSettings,
        sidebarNotes: stateSnapshot
      };
      await window.api?.saveAppSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to save sidebar notes to storage:', error);
    }
  }

  /**
   * Check if a note is in the sidebar
   */
  isInSidebar(noteId: string): boolean {
    return this.state.notes.some((note) => note.noteId === noteId);
  }

  /**
   * Add a note to the sidebar
   */
  async addNote(noteId: string, title: string, content: string): Promise<void> {
    await this.ensureInitialized();

    // Don't add if already exists
    if (this.isInSidebar(noteId)) {
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
   * Remove a note from the sidebar
   */
  async removeNote(noteId: string): Promise<void> {
    await this.ensureInitialized();

    this.state.notes = this.state.notes.filter((note) => note.noteId !== noteId);

    await this.saveToStorage();
  }

  /**
   * Update a note's title and/or content
   * Both title and content changes sync back to the actual note in the database
   * @param syncToDatabase - If true, sync changes to database and notify other components (default: true)
   */
  async updateNote(
    noteId: string,
    updates: Partial<Pick<SidebarNote, 'title' | 'content'>>,
    syncToDatabase: boolean = true
  ): Promise<void> {
    await this.ensureInitialized();

    const note = this.state.notes.find((n) => n.noteId === noteId);
    if (note) {
      const oldTitle = note.title;

      // Update the sidebar note copy
      if (updates.title !== undefined) {
        note.title = updates.title;
      }
      if (updates.content !== undefined) {
        note.content = updates.content;
      }

      await this.saveToStorage();

      // Only sync to database if requested (prevents infinite loops)
      if (!syncToDatabase) {
        return;
      }

      // Sync title changes back to the actual note (rename)
      if (updates.title !== undefined && updates.title !== oldTitle) {
        try {
          const result = await window.api?.renameNote({
            identifier: noteId,
            newIdentifier: updates.title
          });

          // If rename was successful and returned a new ID, update our noteId
          if (result?.new_id && result.new_id !== noteId) {
            note.noteId = result.new_id;
            await this.saveToStorage();

            // Notify other components (like NoteEditor) about the update
            notesStore.notifyNoteUpdated(result.new_id);
          } else {
            // Title changed but noteId stayed the same
            notesStore.notifyNoteUpdated(noteId);
          }
        } catch (error) {
          console.error('Failed to rename note in database:', error);
          // Revert title change on error
          note.title = oldTitle;
          await this.saveToStorage();
        }
      }

      // Sync content changes back to the actual note
      if (updates.content !== undefined) {
        try {
          await window.api?.updateNote({
            identifier: note.noteId, // Use potentially updated noteId
            content: updates.content
          });

          // Notify other components (like NoteEditor) about the update
          notesStore.notifyNoteUpdated(note.noteId);
        } catch (error) {
          console.error('Failed to update note content in database:', error);
          // Note: We don't revert the sidebar note update on error
          // This preserves the user's changes in the sidebar
        }
      }
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
   * Update a note's ID when it gets renamed
   * This is needed when external components (like NoteEditor) rename a note
   */
  async updateNoteId(oldId: string, newId: string): Promise<void> {
    await this.ensureInitialized();

    const note = this.state.notes.find((n) => n.noteId === oldId);
    if (note) {
      note.noteId = newId;
      await this.saveToStorage();
    }
  }
}

export const sidebarNotesStore = new SidebarNotesStore();
