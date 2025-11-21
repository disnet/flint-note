/**
 * Review Store
 *
 * Manages state for the session-based spaced engagement review system.
 * Handles review queue, statistics, configuration, and review session state.
 */

import type {
  ReviewSessionState,
  ReviewResult,
  SessionReviewNote,
  AgentFeedback,
  ReviewItem,
  ReviewStats,
  SchedulingConfig,
  ReviewRating
} from '../types/review';

export interface ReviewNote {
  id: string;
  title: string;
  content: string;
  reviewCount: number;
  nextSessionNumber: number;
  currentInterval: number;
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
    dueThisSession: 0,
    totalEnabled: 0,
    retired: 0,
    currentSessionNumber: 0
  });

  // Session availability
  isSessionAvailable = $state(true);
  nextSessionAvailableAt = $state<Date | null>(null);

  // Review configuration
  config = $state<SchedulingConfig>({
    sessionSize: 5,
    sessionsPerWeek: 7,
    maxIntervalSessions: 15,
    minIntervalDays: 1
  });

  // Notes due for review in current session
  notesForReview = $state<ReviewNote[]>([]);

  // Currently selected note in review view
  currentReviewNote = $state<ReviewNote | null>(null);

  // Loading states
  isLoadingStats = $state(false);
  isLoadingNotes = $state(false);
  isLoadingConfig = $state(false);

  // Error state
  error = $state<string | null>(null);

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
      // Also load session availability
      await this.loadSessionAvailability();
    } catch (err) {
      console.error('Failed to load review stats:', err);
      this.error =
        err instanceof Error ? err.message : 'Failed to load review statistics';
    } finally {
      this.isLoadingStats = false;
    }
  }

  /**
   * Load session availability information
   */
  async loadSessionAvailability(): Promise<void> {
    try {
      const availabilityResult = await window.api?.isNewSessionAvailable();
      if (availabilityResult) {
        this.isSessionAvailable = availabilityResult.available;
      }

      const nextAvailableResult = await window.api?.getNextSessionAvailableAt();
      if (nextAvailableResult) {
        this.nextSessionAvailableAt = nextAvailableResult.nextAvailableAt
          ? new Date(nextAvailableResult.nextAvailableAt)
          : null;
      }
    } catch (err) {
      console.error('Failed to load session availability:', err);
    }
  }

  /**
   * Load review configuration
   */
  async loadConfig(): Promise<void> {
    this.isLoadingConfig = true;
    this.error = null;

    try {
      const config = await window.api?.getReviewConfig();
      if (config) {
        this.config = config;
      }
    } catch (err) {
      console.error('Failed to load review config:', err);
      this.error =
        err instanceof Error ? err.message : 'Failed to load review configuration';
    } finally {
      this.isLoadingConfig = false;
    }
  }

  /**
   * Update review configuration
   */
  async updateConfig(config: Partial<SchedulingConfig>): Promise<boolean> {
    try {
      const updated = await window.api?.updateReviewConfig(config);
      if (updated) {
        this.config = updated;
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update review config:', err);
      this.error =
        err instanceof Error ? err.message : 'Failed to update review configuration';
      return false;
    }
  }

  /**
   * Load notes that are due for review in current session
   */
  async loadNotesForReview(): Promise<void> {
    this.isLoadingNotes = true;
    this.error = null;

    try {
      const notes = await window.api?.getNotesForReview();

      if (notes) {
        this.notesForReview = notes.map((note) => ({
          id: note.id,
          title: note.title,
          content: note.content || '',
          reviewCount: note.reviewItem.reviewCount,
          nextSessionNumber: note.reviewItem.nextSessionNumber,
          currentInterval: note.reviewItem.currentInterval
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
   * Get current session number
   */
  async getCurrentSession(): Promise<number> {
    try {
      const result = await window.api?.getCurrentSession();
      return result?.sessionNumber || 0;
    } catch (err) {
      console.error('Failed to get current session:', err);
      return 0;
    }
  }

  /**
   * Increment session number (complete a session)
   */
  async incrementSession(): Promise<number> {
    try {
      const result = await window.api?.incrementSession();
      if (result?.sessionNumber !== undefined) {
        // Update stats with new session number
        this.stats = { ...this.stats, currentSessionNumber: result.sessionNumber };
        // Reload session availability after incrementing
        await this.loadSessionAvailability();
        return result.sessionNumber;
      }
      return this.stats.currentSessionNumber;
    } catch (err) {
      console.error('Failed to increment session:', err);
      this.error = err instanceof Error ? err.message : 'Failed to complete session';
      return this.stats.currentSessionNumber;
    }
  }

  /**
   * Complete a review with rating
   */
  async completeReview(
    noteId: string,
    rating: ReviewRating,
    userResponse?: string,
    prompt?: string
  ): Promise<{
    nextSessionNumber: number;
    nextReviewDate: string;
    reviewCount: number;
    retired: boolean;
  } | null> {
    try {
      const result = await window.api?.completeReview({
        noteId,
        rating,
        userResponse,
        prompt
      });
      if (result) {
        // Reload stats after completing review
        await this.loadStats();
        return result;
      }
      return null;
    } catch (err) {
      console.error('Failed to complete review:', err);
      this.error = err instanceof Error ? err.message : 'Failed to complete review';
      return null;
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
   * Reactivate a retired note
   */
  async reactivateNote(noteId: string): Promise<boolean> {
    try {
      const result = await window.api?.reactivateNote(noteId);
      if (result?.success) {
        // Reload stats after reactivating
        await this.loadStats();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to reactivate note:', err);
      this.error = err instanceof Error ? err.message : 'Failed to reactivate note';
      return false;
    }
  }

  /**
   * Get all retired items
   */
  async getRetiredItems(): Promise<ReviewItem[]> {
    try {
      const items = await window.api?.getRetiredItems();
      return items || [];
    } catch (err) {
      console.error('Failed to get retired items:', err);
      this.error = err instanceof Error ? err.message : 'Failed to get retired items';
      return [];
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
   * Get review item (metadata and history) for a specific note
   */
  async getReviewItem(noteId: string): Promise<ReviewItem | null> {
    try {
      const reviewItem = await window.api?.getReviewItem(noteId);
      return reviewItem || null;
    } catch (err) {
      console.error('Failed to get review item:', err);
      this.error = err instanceof Error ? err.message : 'Failed to get review item';
      return null;
    }
  }

  /**
   * Get all review history for the current vault
   */
  async getAllReviewHistory(): Promise<ReviewItem[]> {
    try {
      const history = await window.api?.getAllReviewHistory();
      return history || [];
    } catch (err) {
      console.error('Failed to get review history:', err);
      this.error = err instanceof Error ? err.message : 'Failed to get review history';
      return [];
    }
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.stats = {
      dueThisSession: 0,
      totalEnabled: 0,
      retired: 0,
      currentSessionNumber: 0
    };
    this.config = {
      sessionSize: 5,
      sessionsPerWeek: 7,
      maxIntervalSessions: 15,
      minIntervalDays: 1
    };
    this.notesForReview = [];
    this.currentReviewNote = null;
    this.error = null;
    this.savedSession = null;
    this.isSessionAvailable = true;
    this.nextSessionAvailableAt = null;
  }
}

// Export singleton instance
export const reviewStore = new ReviewStore();
