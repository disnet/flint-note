/**
 * Review Store
 *
 * Manages state for the spaced repetition review system.
 * Handles review queue, statistics, and review session state.
 */

import type {
  ReviewSessionState,
  ReviewResult,
  SessionReviewNote,
  AgentFeedback
} from '../types/review';

export interface ReviewStats {
  dueToday: number;
  dueThisWeek: number;
  totalEnabled: number;
}

export interface ReviewNote {
  id: string;
  title: string;
  content: string;
  reviewCount: number;
}

/**
 * Saved review session state for restoration
 */
export interface SavedReviewSession {
  sessionState: ReviewSessionState;
  notesToReview: SessionReviewNote[];
  currentNoteIndex: number;
  currentPrompt: string;
  userResponse: string;
  agentFeedback: AgentFeedback | null;
  sessionResults: ReviewResult[];
  sessionStartTime: string; // ISO datetime
}

class ReviewStore {
  // Review statistics
  stats = $state<ReviewStats>({
    dueToday: 0,
    dueThisWeek: 0,
    totalEnabled: 0
  });

  // Notes due for review today
  notesForReview = $state<ReviewNote[]>([]);

  // Currently selected note in review view
  currentReviewNote = $state<ReviewNote | null>(null);

  // Loading states
  isLoadingStats = $state(false);
  isLoadingNotes = $state(false);

  // Error state
  error = $state<string | null>(null);

  // Show all notes flag (for testing/debugging)
  showAllNotes = $state(false);

  // Saved review session (for resuming after navigation)
  savedSession = $state<SavedReviewSession | null>(null);

  /**
   * Load review statistics from the backend
   */
  async loadStats(): Promise<void> {
    this.isLoadingStats = true;
    this.error = null;

    try {
      const stats = await window.api?.getReviewStats();
      if (stats) {
        this.stats = stats;
      }
    } catch (err) {
      console.error('Failed to load review stats:', err);
      this.error =
        err instanceof Error ? err.message : 'Failed to load review statistics';
    } finally {
      this.isLoadingStats = false;
    }
  }

  /**
   * Load notes that are due for review today (or all if showAllNotes is true)
   */
  async loadNotesForReview(): Promise<void> {
    this.isLoadingNotes = true;
    this.error = null;

    try {
      // If showAllNotes is true, use a far future date to get all notes
      const date = this.showAllNotes
        ? '9999-12-31'
        : new Date().toISOString().split('T')[0];
      const notes = await window.api?.getNotesForReview(date);

      if (notes) {
        this.notesForReview = notes.map((note) => ({
          id: note.id,
          title: note.title,
          content: note.content || '',
          reviewCount: note.reviewItem.reviewCount
        }));
      }
    } catch (err) {
      console.error('Failed to load notes for review:', err);
      this.error = err instanceof Error ? err.message : 'Failed to load review notes';
    } finally {
      this.isLoadingNotes = false;
    }
  }

  /**
   * Enable review for a note
   */
  async enableReview(noteId: string): Promise<boolean> {
    try {
      const result = await window.api?.enableReview(noteId);
      if (result?.success) {
        // Reload stats after enabling
        await this.loadStats();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to enable review:', err);
      this.error = err instanceof Error ? err.message : 'Failed to enable review';
      return false;
    }
  }

  /**
   * Disable review for a note
   */
  async disableReview(noteId: string): Promise<boolean> {
    try {
      const result = await window.api?.disableReview(noteId);
      if (result?.success) {
        // Reload stats after disabling
        await this.loadStats();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to disable review:', err);
      this.error = err instanceof Error ? err.message : 'Failed to disable review';
      return false;
    }
  }

  /**
   * Check if review is enabled for a note
   */
  async isReviewEnabled(noteId: string): Promise<boolean> {
    try {
      const result = await window.api?.isReviewEnabled(noteId);
      return result?.enabled || false;
    } catch (err) {
      console.error('Failed to check review status:', err);
      return false;
    }
  }

  /**
   * Set the current review note (for review view)
   */
  setCurrentReviewNote(note: ReviewNote | null): void {
    this.currentReviewNote = note;
  }

  /**
   * Remove a note from the review queue after completion
   */
  removeFromQueue(noteId: string): void {
    this.notesForReview = this.notesForReview.filter((n) => n.id !== noteId);
  }

  /**
   * Toggle between showing all notes and today's notes
   */
  async toggleShowAll(): Promise<void> {
    this.showAllNotes = !this.showAllNotes;
    await this.loadNotesForReview();
  }

  /**
   * Save current review session state for later restoration
   */
  saveSession(session: SavedReviewSession): void {
    this.savedSession = session;
  }

  /**
   * Restore saved review session
   */
  restoreSession(): SavedReviewSession | null {
    return this.savedSession;
  }

  /**
   * Clear saved session
   */
  clearSavedSession(): void {
    this.savedSession = null;
  }

  /**
   * Check if there's a saved session that can be resumed
   */
  hasSavedSession(): boolean {
    return this.savedSession !== null;
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.stats = {
      dueToday: 0,
      dueThisWeek: 0,
      totalEnabled: 0
    };
    this.notesForReview = [];
    this.currentReviewNote = null;
    this.error = null;
    this.showAllNotes = false;
    this.savedSession = null;
  }
}

// Export singleton instance
export const reviewStore = new ReviewStore();
