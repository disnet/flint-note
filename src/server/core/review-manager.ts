/**
 * Review Manager
 *
 * Handles review scheduling and management for session-based spaced engagement system.
 * Manages the review_items, review_state, and review_config tables.
 */

import crypto from 'crypto';
import type {
  DatabaseConnection,
  ReviewItemRow,
  ReviewStateRow,
  ReviewConfigRow,
  NoteRow
} from '../database/schema.js';
import {
  calculateNextSession,
  getNextReviewDate,
  appendToReviewHistory,
  parseReviewHistory,
  DEFAULT_SCHEDULING_CONFIG,
  type ReviewHistoryEntry,
  type ReviewRating,
  type SchedulingConfig
} from './review-scheduler.js';

/**
 * Generate a review item ID in the format rev-xxxxxxxx
 */
export function generateReviewId(): string {
  return 'rev-' + crypto.randomBytes(4).toString('hex');
}

/**
 * Review item status
 */
export type ReviewStatus = 'active' | 'retired';

/**
 * Review item domain model
 */
export interface ReviewItem {
  id: string;
  noteId: string;
  vaultId: string;
  enabled: boolean;
  lastReviewed: string | null;
  nextReview: string;
  nextSessionNumber: number;
  currentInterval: number;
  status: ReviewStatus;
  reviewCount: number;
  reviewHistory: ReviewHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Note with review metadata (for review queue)
 */
export interface ReviewNote extends NoteRow {
  reviewItem: ReviewItem;
}

/**
 * Review statistics
 */
export interface ReviewStats {
  dueThisSession: number;
  totalEnabled: number;
  retired: number;
  currentSessionNumber: number;
}

/**
 * Convert database row to domain model
 */
function reviewRowToModel(row: ReviewItemRow): ReviewItem {
  return {
    id: row.id,
    noteId: row.note_id,
    vaultId: row.vault_id,
    enabled: row.enabled === 1,
    lastReviewed: row.last_reviewed,
    nextReview: row.next_review,
    nextSessionNumber: row.next_session_number,
    currentInterval: row.current_interval,
    status: (row.status as ReviewStatus) || 'active',
    reviewCount: row.review_count,
    reviewHistory: parseReviewHistory(row.review_history),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Review Manager Class
 */
export class ReviewManager {
  constructor(
    private db: DatabaseConnection,
    private vaultId: string
  ) {}

  /**
   * Get current session number
   */
  async getCurrentSessionNumber(): Promise<number> {
    const state = await this.db.get<ReviewStateRow>(
      'SELECT * FROM review_state WHERE id = 1'
    );

    if (!state) {
      // Initialize state if it doesn't exist
      await this.db.run(
        'INSERT INTO review_state (id, current_session_number) VALUES (1, 1)'
      );
      return 1;
    }

    return state.current_session_number;
  }

  /**
   * Get the next 1am after a given date (in local timezone)
   * This is when the next session becomes available
   */
  private getNext1AM(fromDate: Date): Date {
    const next1AM = new Date(fromDate);
    next1AM.setHours(1, 0, 0, 0);

    // If the calculated 1am is not after fromDate, move to next day
    if (next1AM <= fromDate) {
      next1AM.setDate(next1AM.getDate() + 1);
    }

    return next1AM;
  }

  /**
   * Check if a new session is available based on daily 1am reset
   */
  async isNewSessionAvailable(): Promise<boolean> {
    const state = await this.db.get<ReviewStateRow>(
      'SELECT * FROM review_state WHERE id = 1'
    );

    if (!state || !state.last_session_completed_at) {
      return true; // No previous session, so available
    }

    const lastCompleted = new Date(state.last_session_completed_at);
    const nextReset = this.getNext1AM(lastCompleted);
    const now = new Date();

    return now >= nextReset;
  }

  /**
   * Get when the next session will be available (next 1am after last completion)
   * Returns null if a session is currently available
   */
  async getNextSessionAvailableAt(): Promise<Date | null> {
    const state = await this.db.get<ReviewStateRow>(
      'SELECT * FROM review_state WHERE id = 1'
    );

    if (!state || !state.last_session_completed_at) {
      return null; // Available now
    }

    const lastCompleted = new Date(state.last_session_completed_at);
    const nextReset = this.getNext1AM(lastCompleted);
    const now = new Date();

    // If we're past the next reset, session is available now
    if (now >= nextReset) {
      return null;
    }

    return nextReset;
  }

  /**
   * Increment session number (called when a session is completed)
   * Only allows incrementing once per day (at 1am local time reset)
   */
  async incrementSessionNumber(): Promise<number> {
    const canIncrement = await this.isNewSessionAvailable();

    if (!canIncrement) {
      const nextAvailable = await this.getNextSessionAvailableAt();
      throw new Error(
        `Next session not available until ${nextAvailable?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
      );
    }

    const currentSession = await this.getCurrentSessionNumber();
    const newSession = currentSession + 1;
    const now = new Date().toISOString();

    await this.db.run(
      `UPDATE review_state
       SET current_session_number = ?,
           last_session_completed_at = ?,
           updated_at = ?
       WHERE id = 1`,
      [newSession, now, now]
    );

    return newSession;
  }

  /**
   * Get review configuration
   */
  async getReviewConfig(): Promise<SchedulingConfig> {
    const config = await this.db.get<ReviewConfigRow>(
      'SELECT * FROM review_config WHERE id = 1'
    );

    if (!config) {
      // Initialize config with defaults if it doesn't exist
      await this.db.run(
        `INSERT INTO review_config (id, session_size, sessions_per_week, max_interval_sessions, min_interval_days)
         VALUES (1, ?, ?, ?, ?)`,
        [
          DEFAULT_SCHEDULING_CONFIG.sessionSize,
          DEFAULT_SCHEDULING_CONFIG.sessionsPerWeek,
          DEFAULT_SCHEDULING_CONFIG.maxIntervalSessions,
          DEFAULT_SCHEDULING_CONFIG.minIntervalDays
        ]
      );
      return DEFAULT_SCHEDULING_CONFIG;
    }

    return {
      sessionSize: config.session_size,
      sessionsPerWeek: config.sessions_per_week,
      maxIntervalSessions: config.max_interval_sessions,
      minIntervalDays: config.min_interval_days
    };
  }

  /**
   * Update review configuration
   */
  async updateReviewConfig(config: Partial<SchedulingConfig>): Promise<SchedulingConfig> {
    const current = await this.getReviewConfig();
    const updated = { ...current, ...config };
    const now = new Date().toISOString();

    await this.db.run(
      `UPDATE review_config
       SET session_size = ?,
           sessions_per_week = ?,
           max_interval_sessions = ?,
           min_interval_days = ?,
           updated_at = ?
       WHERE id = 1`,
      [
        updated.sessionSize,
        updated.sessionsPerWeek,
        updated.maxIntervalSessions,
        updated.minIntervalDays,
        now
      ]
    );

    return updated;
  }

  /**
   * Enable review for a note
   * Creates review_items entry in database
   * Note: Frontmatter must be updated separately by caller
   */
  async enableReview(
    noteId: string,
    options?: {
      nextReview?: string;
      reviewCount?: number;
      reviewHistory?: string | null;
    }
  ): Promise<ReviewItem> {
    // Check if review already enabled
    const existing = await this.db.get<ReviewItemRow>(
      'SELECT * FROM review_items WHERE note_id = ?',
      [noteId]
    );

    if (existing) {
      // Already enabled, return existing
      return reviewRowToModel(existing);
    }

    // Create new review item
    const reviewId = generateReviewId();
    const now = new Date().toISOString();
    const currentSession = await this.getCurrentSessionNumber();

    // Use provided values or defaults
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextReview = options?.nextReview || tomorrow.toISOString().split('T')[0];
    const reviewCount = options?.reviewCount ?? 0;
    const reviewHistory = options?.reviewHistory ?? null;

    // New notes are due in current session (immediately available) with interval of 1
    const nextSessionNumber = currentSession;
    const currentInterval = 1;

    await this.db.run(
      `INSERT INTO review_items
       (id, note_id, vault_id, enabled, last_reviewed, next_review, review_count, review_history,
        next_session_number, current_interval, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reviewId,
        noteId,
        this.vaultId,
        1,
        null,
        nextReview,
        reviewCount,
        reviewHistory,
        nextSessionNumber,
        currentInterval,
        'active',
        now,
        now
      ]
    );

    const created = await this.db.get<ReviewItemRow>(
      'SELECT * FROM review_items WHERE id = ?',
      [reviewId]
    );

    if (!created) {
      throw new Error('Failed to create review item');
    }

    return reviewRowToModel(created);
  }

  /**
   * Disable review for a note
   * Removes review_items entry from database
   * Note: Frontmatter must be updated separately by caller
   */
  async disableReview(noteId: string): Promise<void> {
    // Delete from review_items
    await this.db.run('DELETE FROM review_items WHERE note_id = ?', [noteId]);
  }

  /**
   * Retire a note (rating 4 - fully processed)
   */
  async retireNote(noteId: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db.run(
      `UPDATE review_items
       SET status = 'retired',
           updated_at = ?
       WHERE note_id = ?`,
      [now, noteId]
    );
  }

  /**
   * Reactivate a retired note
   */
  async reactivateNote(noteId: string): Promise<ReviewItem | null> {
    const currentSession = await this.getCurrentSessionNumber();
    const now = new Date().toISOString();

    // Reactivate with next session and reset interval
    await this.db.run(
      `UPDATE review_items
       SET status = 'active',
           next_session_number = ?,
           current_interval = 1,
           updated_at = ?
       WHERE note_id = ?`,
      [currentSession + 1, now, noteId]
    );

    return this.getReviewItem(noteId);
  }

  /**
   * Get notes due for review in current session
   */
  async getNotesForReview(): Promise<ReviewNote[]> {
    const currentSession = await this.getCurrentSessionNumber();
    const config = await this.getReviewConfig();

    // Calculate minimum date for minIntervalDays filter
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - config.minIntervalDays);
    const minDateStr = minDate.toISOString();

    // Define the shape of the joined query result
    interface JoinedRow {
      // Note fields
      id: string;
      title: string;
      content: string | null;
      type: string;
      filename: string;
      path: string;
      created: string;
      updated: string;
      size: number | null;
      content_hash: string | null;
      file_mtime: number | null;
      archived: number;
      // Review item fields with aliases
      review_id: string;
      note_id: string;
      vault_id: string;
      enabled: number;
      last_reviewed: string | null;
      next_review: string;
      next_session_number: number;
      current_interval: number;
      status: string;
      review_count: number;
      review_history: string | null;
      review_created_at: string;
      review_updated_at: string;
    }

    const rows = await this.db.all<JoinedRow>(
      `SELECT
        n.id,
        n.title,
        n.content,
        n.type,
        n.filename,
        n.path,
        n.created,
        n.updated,
        n.size,
        n.content_hash,
        n.file_mtime,
        n.archived,
        ri.id as review_id,
        ri.note_id,
        ri.vault_id,
        ri.enabled,
        ri.last_reviewed,
        ri.next_review,
        ri.next_session_number,
        ri.current_interval,
        ri.status,
        ri.review_count,
        ri.review_history,
        ri.created_at as review_created_at,
        ri.updated_at as review_updated_at
       FROM notes n
       INNER JOIN review_items ri ON n.id = ri.note_id
       WHERE ri.vault_id = ?
         AND ri.enabled = 1
         AND ri.status = 'active'
         AND ri.next_session_number <= ?
         AND (ri.last_reviewed IS NULL OR ri.last_reviewed < ?)
         AND (n.archived = 0 OR n.archived IS NULL)
       ORDER BY (? - ri.next_session_number) DESC
       LIMIT ?`,
      [this.vaultId, currentSession, minDateStr, currentSession, config.sessionSize]
    );

    return rows.map((row) => {
      // Extract note fields
      const note: NoteRow = {
        id: row.id,
        title: row.title,
        content: row.content,
        type: row.type,
        filename: row.filename,
        path: row.path,
        created: row.created,
        updated: row.updated,
        size: row.size,
        content_hash: row.content_hash,
        file_mtime: row.file_mtime,
        archived: row.archived || 0
      };

      // Extract review item fields
      const reviewItem: ReviewItem = {
        id: row.review_id,
        noteId: row.note_id,
        vaultId: row.vault_id,
        enabled: row.enabled === 1,
        lastReviewed: row.last_reviewed,
        nextReview: row.next_review,
        nextSessionNumber: row.next_session_number,
        currentInterval: row.current_interval,
        status: (row.status as ReviewStatus) || 'active',
        reviewCount: row.review_count,
        reviewHistory: parseReviewHistory(row.review_history),
        createdAt: row.review_created_at,
        updatedAt: row.review_updated_at
      };

      return {
        ...note,
        reviewItem
      };
    });
  }

  /**
   * Complete a review with rating
   * Updates schedule and stores review history
   */
  async completeReview(
    noteId: string,
    rating: ReviewRating,
    userResponse?: string,
    prompt?: string,
    feedback?: string
  ): Promise<{
    nextSessionNumber: number;
    nextReviewDate: string;
    reviewCount: number;
    retired: boolean;
  }> {
    // Get current review item
    const reviewItem = await this.db.get<ReviewItemRow>(
      'SELECT * FROM review_items WHERE note_id = ?',
      [noteId]
    );

    if (!reviewItem) {
      throw new Error(`Review item not found for note ${noteId}`);
    }

    const currentSession = await this.getCurrentSessionNumber();
    const config = await this.getReviewConfig();

    // Calculate next session
    const result = calculateNextSession(
      currentSession,
      reviewItem.current_interval,
      rating,
      config
    );

    // Update review history
    const updatedHistory = appendToReviewHistory(
      reviewItem.review_history,
      currentSession,
      rating,
      userResponse,
      prompt,
      feedback
    );

    const now = new Date().toISOString();
    const newReviewCount = reviewItem.review_count + 1;

    if (result === 'retired') {
      // Rating 4 - retire the note
      const nextReviewDate = '9999-12-31';

      await this.db.run(
        `UPDATE review_items
         SET last_reviewed = ?,
             next_review = ?,
             next_session_number = ?,
             status = 'retired',
             review_count = ?,
             review_history = ?,
             updated_at = ?
         WHERE note_id = ?`,
        [now, nextReviewDate, 999999, newReviewCount, updatedHistory, now, noteId]
      );

      return {
        nextSessionNumber: -1,
        nextReviewDate,
        reviewCount: newReviewCount,
        retired: true
      };
    }

    // Calculate next review date for backward compatibility
    const nextReviewDate = getNextReviewDate(
      rating,
      reviewItem.current_interval,
      currentSession,
      config
    );

    // Update review item with new session-based scheduling
    await this.db.run(
      `UPDATE review_items
       SET last_reviewed = ?,
           next_review = ?,
           next_session_number = ?,
           current_interval = ?,
           review_count = ?,
           review_history = ?,
           updated_at = ?
       WHERE note_id = ?`,
      [
        now,
        nextReviewDate,
        result.nextSession,
        result.interval,
        newReviewCount,
        updatedHistory,
        now,
        noteId
      ]
    );

    return {
      nextSessionNumber: result.nextSession,
      nextReviewDate,
      reviewCount: newReviewCount,
      retired: false
    };
  }

  /**
   * Get review statistics for the vault
   */
  async getReviewStats(): Promise<ReviewStats> {
    const currentSession = await this.getCurrentSessionNumber();
    const config = await this.getReviewConfig();

    // Calculate minimum date for minIntervalDays filter (same as getNotesForReview)
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - config.minIntervalDays);
    const minDateStr = minDate.toISOString();

    // Due this session (excluding archived notes and recently reviewed notes)
    const dueThisSessionCount = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM review_items ri
       INNER JOIN notes n ON ri.note_id = n.id
       WHERE ri.vault_id = ?
         AND ri.enabled = 1
         AND ri.status = 'active'
         AND ri.next_session_number <= ?
         AND (ri.last_reviewed IS NULL OR ri.last_reviewed < ?)
         AND (n.archived = 0 OR n.archived IS NULL)`,
      [this.vaultId, currentSession, minDateStr]
    );

    // Cap due count by session size to show actual notes that will be reviewed
    const dueThisSession = Math.min(dueThisSessionCount?.count || 0, config.sessionSize);

    // Total enabled active (excluding archived notes)
    const totalEnabled = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM review_items ri
       INNER JOIN notes n ON ri.note_id = n.id
       WHERE ri.vault_id = ?
         AND ri.enabled = 1
         AND ri.status = 'active'
         AND (n.archived = 0 OR n.archived IS NULL)`,
      [this.vaultId]
    );

    // Retired notes (excluding archived notes)
    const retired = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM review_items ri
       INNER JOIN notes n ON ri.note_id = n.id
       WHERE ri.vault_id = ?
         AND ri.enabled = 1
         AND ri.status = 'retired'
         AND (n.archived = 0 OR n.archived IS NULL)`,
      [this.vaultId]
    );

    return {
      dueThisSession,
      totalEnabled: totalEnabled?.count || 0,
      retired: retired?.count || 0,
      currentSessionNumber: currentSession
    };
  }

  /**
   * Get review item for a note
   */
  async getReviewItem(noteId: string): Promise<ReviewItem | null> {
    const row = await this.db.get<ReviewItemRow>(
      'SELECT * FROM review_items WHERE note_id = ?',
      [noteId]
    );

    return row ? reviewRowToModel(row) : null;
  }

  /**
   * Check if review is enabled for a note
   */
  async isReviewEnabled(noteId: string): Promise<boolean> {
    const row = await this.db.get<{ enabled: number }>(
      'SELECT enabled FROM review_items WHERE note_id = ?',
      [noteId]
    );

    return row ? row.enabled === 1 : false;
  }

  /**
   * Get all review items with their history
   * Returns all active review items for the vault (excluding archived notes)
   */
  async getAllReviewHistory(): Promise<ReviewItem[]> {
    const rows = await this.db.all<ReviewItemRow>(
      `SELECT ri.* FROM review_items ri
       INNER JOIN notes n ON ri.note_id = n.id
       WHERE ri.vault_id = ? AND ri.enabled = 1 AND ri.status = 'active'
       AND (n.archived = 0 OR n.archived IS NULL)
       ORDER BY ri.last_reviewed DESC NULLS LAST`,
      [this.vaultId]
    );

    return rows.map(reviewRowToModel);
  }

  /**
   * Get all retired review items
   */
  async getRetiredItems(): Promise<ReviewItem[]> {
    const rows = await this.db.all<ReviewItemRow>(
      `SELECT ri.* FROM review_items ri
       INNER JOIN notes n ON ri.note_id = n.id
       WHERE ri.vault_id = ? AND ri.enabled = 1 AND ri.status = 'retired'
       AND (n.archived = 0 OR n.archived IS NULL)
       ORDER BY ri.updated_at DESC`,
      [this.vaultId]
    );

    return rows.map(reviewRowToModel);
  }
}
