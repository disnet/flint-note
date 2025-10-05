export interface InboxNote {
  id: string;
  title: string;
  type: string;
  created: string;
}

interface InboxStoreState {
  notes: InboxNote[];
  isLoading: boolean;
  error: string | null;
}

const defaultState: InboxStoreState = {
  notes: [],
  isLoading: false,
  error: null
};

class InboxStore {
  private state = $state<InboxStoreState>(defaultState);

  get notes(): InboxNote[] {
    return this.state.notes;
  }

  get isLoading(): boolean {
    return this.state.isLoading;
  }

  get error(): string | null {
    return this.state.error;
  }

  /**
   * Load unprocessed notes from the last N days
   */
  async loadInboxNotes(vaultId: string, daysBack: number = 7): Promise<void> {
    this.state.isLoading = true;
    this.state.error = null;

    try {
      const notes = await window.api?.getRecentUnprocessedNotes({
        vaultId,
        daysBack
      });

      if (notes) {
        this.state.notes = notes;
      } else {
        this.state.notes = [];
      }
    } catch (error) {
      console.error('Failed to load inbox notes:', error);
      this.state.error =
        error instanceof Error ? error.message : 'Failed to load inbox notes';
      this.state.notes = [];
    } finally {
      this.state.isLoading = false;
    }
  }

  /**
   * Mark a note as processed and remove it from the inbox
   */
  async markAsProcessed(noteId: string, vaultId: string): Promise<boolean> {
    try {
      const result = await window.api?.markNoteAsProcessed({
        noteId,
        vaultId
      });

      if (result?.success) {
        // Remove the note from the local state
        this.state.notes = this.state.notes.filter((note) => note.id !== noteId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to mark note as processed:', error);
      return false;
    }
  }

  /**
   * Refresh the inbox notes
   */
  async refresh(vaultId: string): Promise<void> {
    await this.loadInboxNotes(vaultId);
  }

  /**
   * Clear all notes (useful when switching vaults)
   */
  clear(): void {
    this.state = { ...defaultState };
  }
}

export const inboxStore = new InboxStore();
