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
  showProcessed: boolean;
  unprocessedCount: number;
}

const defaultState: InboxStoreState = {
  notes: [],
  isLoading: false,
  error: null,
  showProcessed: false,
  unprocessedCount: 0
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

  get count(): number {
    return this.state.unprocessedCount;
  }

  get showProcessed(): boolean {
    return this.state.showProcessed;
  }

  set showProcessed(value: boolean) {
    this.state.showProcessed = value;
  }

  /**
   * Load notes based on current view mode (processed or unprocessed)
   */
  async loadInboxNotes(vaultId: string, daysBack: number = 7): Promise<void> {
    this.state.isLoading = true;
    this.state.error = null;

    try {
      const notes = this.state.showProcessed
        ? await window.api?.getRecentProcessedNotes({ vaultId, daysBack })
        : await window.api?.getRecentUnprocessedNotes({ vaultId, daysBack });

      if (notes) {
        this.state.notes = notes;
      } else {
        this.state.notes = [];
      }

      // Always update unprocessed count for the badge
      await this.updateUnprocessedCount(vaultId, daysBack);
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
   * Update the unprocessed count (for badge display)
   */
  async updateUnprocessedCount(vaultId: string, daysBack: number = 7): Promise<void> {
    try {
      const unprocessedNotes = await window.api?.getRecentUnprocessedNotes({
        vaultId,
        daysBack
      });
      this.state.unprocessedCount = unprocessedNotes?.length || 0;
    } catch (error) {
      console.error('Failed to update unprocessed count:', error);
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
        // Update unprocessed count
        await this.updateUnprocessedCount(vaultId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to mark note as processed:', error);
      return false;
    }
  }

  /**
   * Unmark a note as processed and remove it from the processed list
   */
  async unmarkAsProcessed(noteId: string, vaultId: string): Promise<boolean> {
    try {
      const result = await window.api?.unmarkNoteAsProcessed({
        noteId,
        vaultId
      });

      if (result?.success) {
        // Remove the note from the local state
        this.state.notes = this.state.notes.filter((note) => note.id !== noteId);
        // Update unprocessed count
        await this.updateUnprocessedCount(vaultId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to unmark note as processed:', error);
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
