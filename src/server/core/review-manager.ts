/**
 * Review Manager
 *
 * Handles review scheduling and management for spaced repetition system.
 * Manages the review_items table and synchronizes with note frontmatter.
 */

import crypto from 'crypto';
import type { DatabaseConnection, ReviewItemRow, NoteRow } from '../database/schema.js';
import {
  getNextReviewDate,
  appendToReviewHistory,
  parseReviewHistory,
  type ReviewHistoryEntry
} from './review-scheduler.js';

/**
 * Generate a review item ID in the format rev-xxxxxxxx
 */
export function generateReviewId(): string {
  return 'rev-' + crypto.randomBytes(4).toString('hex');
}

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
  dueToday: number;
  dueThisWeek: number;
  totalEnabled: number;
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
   * Enable review for a note
   * Creates review_items entry in database
   * Note: Frontmatter must be updated separately by caller
   */
  async enableReview(noteId: string): Promise<ReviewItem> {
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
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextReview = tomorrow.toISOString().split('T')[0];

    await this.db.run(
      `INSERT INTO review_items
       (id, note_id, vault_id, enabled, last_reviewed, next_review, review_count, review_history, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reviewId, noteId, this.vaultId, 1, null, nextReview, 0, null, now, now]
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
   * Get all notes with review enabled (for practice mode)
   */
  async getAllReviewableNotes(): Promise<ReviewNote[]> {
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
      // Review item fields with aliases
      review_id: string;
      note_id: string;
      vault_id: string;
      enabled: number;
      last_reviewed: string | null;
      next_review: string;
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
        ri.id as review_id,
        ri.note_id,
        ri.vault_id,
        ri.enabled,
        ri.last_reviewed,
        ri.next_review,
        ri.review_count,
        ri.review_history,
        ri.created_at as review_created_at,
        ri.updated_at as review_updated_at
       FROM notes n
       INNER JOIN review_items ri ON n.id = ri.note_id
       WHERE ri.vault_id = ?
         AND ri.enabled = 1
       ORDER BY RANDOM()`,
      [this.vaultId]
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
        file_mtime: row.file_mtime
      };

      // Extract review item fields
      const reviewItem: ReviewItem = {
        id: row.review_id,
        noteId: row.note_id,
        vaultId: row.vault_id,
        enabled: row.enabled === 1,
        lastReviewed: row.last_reviewed,
        nextReview: row.next_review,
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
   * Get notes due for review on a specific date
   */
  async getNotesForReview(date: string): Promise<ReviewNote[]> {
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
      // Review item fields with aliases
      review_id: string;
      note_id: string;
      vault_id: string;
      enabled: number;
      last_reviewed: string | null;
      next_review: string;
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
        ri.id as review_id,
        ri.note_id,
        ri.vault_id,
        ri.enabled,
        ri.last_reviewed,
        ri.next_review,
        ri.review_count,
        ri.review_history,
        ri.created_at as review_created_at,
        ri.updated_at as review_updated_at
       FROM notes n
       INNER JOIN review_items ri ON n.id = ri.note_id
       WHERE ri.vault_id = ?
         AND ri.enabled = 1
         AND ri.next_review <= ?
       ORDER BY ri.next_review ASC`,
      [this.vaultId, date]
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
        file_mtime: row.file_mtime
      };

      // Extract review item fields
      const reviewItem: ReviewItem = {
        id: row.review_id,
        noteId: row.note_id,
        vaultId: row.vault_id,
        enabled: row.enabled === 1,
        lastReviewed: row.last_reviewed,
        nextReview: row.next_review,
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
   * Complete a review session
   * Updates schedule and stores review history
   */
  async completeReview(
    noteId: string,
    passed: boolean,
    userResponse?: string,
    prompt?: string,
    feedback?: string
  ): Promise<{ nextReviewDate: string; reviewCount: number }> {
    // Get current review item
    const reviewItem = await this.db.get<ReviewItemRow>(
      'SELECT * FROM review_items WHERE note_id = ?',
      [noteId]
    );

    if (!reviewItem) {
      throw new Error(`Review item not found for note ${noteId}`);
    }

    // Calculate next review date
    const nextReviewDate = getNextReviewDate(passed);

    // Update review history
    const updatedHistory = appendToReviewHistory(
      reviewItem.review_history,
      passed,
      userResponse,
      prompt,
      feedback
    );

    // Update review item
    const now = new Date().toISOString();
    const newReviewCount = reviewItem.review_count + 1;

    await this.db.run(
      `UPDATE review_items
       SET last_reviewed = ?,
           next_review = ?,
           review_count = ?,
           review_history = ?,
           updated_at = ?
       WHERE note_id = ?`,
      [now, nextReviewDate, newReviewCount, updatedHistory, now, noteId]
    );

    return {
      nextReviewDate,
      reviewCount: newReviewCount
    };
  }

  /**
   * Get review statistics for the vault
   */
  async getReviewStats(): Promise<ReviewStats> {
    const today = new Date().toISOString().split('T')[0];

    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekDate = weekFromNow.toISOString().split('T')[0];

    // Due today
    const dueToday = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM review_items
       WHERE vault_id = ? AND enabled = 1 AND next_review <= ?`,
      [this.vaultId, today]
    );

    // Due this week
    const dueThisWeek = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM review_items
       WHERE vault_id = ? AND enabled = 1 AND next_review <= ?`,
      [this.vaultId, weekDate]
    );

    // Total enabled
    const totalEnabled = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM review_items
       WHERE vault_id = ? AND enabled = 1`,
      [this.vaultId]
    );

    return {
      dueToday: dueToday?.count || 0,
      dueThisWeek: dueThisWeek?.count || 0,
      totalEnabled: totalEnabled?.count || 0
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
   * Returns all review items for the vault, ordered by last_reviewed DESC (most recent first)
   */
  async getAllReviewHistory(): Promise<ReviewItem[]> {
    const rows = await this.db.all<ReviewItemRow>(
      `SELECT * FROM review_items
       WHERE vault_id = ? AND enabled = 1
       ORDER BY last_reviewed DESC NULLS LAST`,
      [this.vaultId]
    );

    return rows.map(reviewRowToModel);
  }
}
