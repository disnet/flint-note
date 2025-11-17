/**
 * Review Manager Tests
 *
 * Tests for the spaced repetition review system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReviewManager } from '../../../src/server/core/review-manager.js';
import { DatabaseManager } from '../../../src/server/database/schema.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('ReviewManager', () => {
  let testDir: string;
  let dbManager: DatabaseManager;
  let reviewManager: ReviewManager;
  const vaultId = 'test-vault';

  beforeEach(async () => {
    // Create temporary directory for test database
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'review-test-'));
    const dbPath = path.join(testDir, 'test.db');

    // Initialize database
    dbManager = new DatabaseManager(dbPath);
    const db = await dbManager.connect();

    // Create notes table (required for foreign key)
    await db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        type TEXT NOT NULL,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        size INTEGER,
        content_hash TEXT,
        file_mtime INTEGER,
        archived INTEGER DEFAULT 0
      )
    `);

    // Create review_items table
    await db.run(`
      CREATE TABLE IF NOT EXISTS review_items (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL UNIQUE,
        vault_id TEXT NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        last_reviewed TEXT,
        next_review TEXT NOT NULL,
        review_count INTEGER DEFAULT 0,
        review_history TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      )
    `);

    await db.run(
      'CREATE INDEX IF NOT EXISTS idx_review_next_review ON review_items(next_review, enabled)'
    );
    await db.run('CREATE INDEX IF NOT EXISTS idx_review_vault ON review_items(vault_id)');

    reviewManager = new ReviewManager(db, vaultId);
  });

  afterEach(async () => {
    if (dbManager) {
      await dbManager.close();
    }
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('enableReview', () => {
    it('should create a new review item for a note', async () => {
      const db = await dbManager.connect();
      const noteId = 'n-test-001';

      // Create a test note
      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Test Note',
          '# Test\nContent',
          'note',
          'test.md',
          'note/test.md',
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );

      const reviewItem = await reviewManager.enableReview(noteId);

      expect(reviewItem).toBeDefined();
      expect(reviewItem.noteId).toBe(noteId);
      expect(reviewItem.vaultId).toBe(vaultId);
      expect(reviewItem.enabled).toBe(true);
      expect(reviewItem.reviewCount).toBe(0);
      expect(reviewItem.lastReviewed).toBeNull();
      expect(reviewItem.nextReview).toBeDefined();

      // Verify next review is tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const expectedDate = tomorrow.toISOString().split('T')[0];
      expect(reviewItem.nextReview).toBe(expectedDate);
    });

    it('should return existing review item if already enabled', async () => {
      const db = await dbManager.connect();
      const noteId = 'n-test-002';

      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Test Note',
          'Content',
          'note',
          'test.md',
          'note/test.md',
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );

      const first = await reviewManager.enableReview(noteId);
      const second = await reviewManager.enableReview(noteId);

      expect(first.id).toBe(second.id);
      expect(second.reviewCount).toBe(0);
    });

    it('should generate unique review IDs', async () => {
      const db = await dbManager.connect();

      // Create multiple notes
      for (let i = 0; i < 5; i++) {
        const noteId = `n-test-${String(i).padStart(3, '0')}`;
        await db.run(
          'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            noteId,
            `Test Note ${i}`,
            'Content',
            'note',
            `test-${i}.md`,
            `note/test-${i}.md`,
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
      }

      const reviewIds = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const noteId = `n-test-${String(i).padStart(3, '0')}`;
        const reviewItem = await reviewManager.enableReview(noteId);
        reviewIds.add(reviewItem.id);
      }

      expect(reviewIds.size).toBe(5);
    });
  });

  describe('disableReview', () => {
    it('should remove review item from database', async () => {
      const db = await dbManager.connect();
      const noteId = 'n-test-003';

      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Test Note',
          'Content',
          'note',
          'test.md',
          'note/test.md',
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );

      await reviewManager.enableReview(noteId);
      await reviewManager.disableReview(noteId);

      const reviewItem = await reviewManager.getReviewItem(noteId);
      expect(reviewItem).toBeNull();
    });

    it('should be idempotent (not error if already disabled)', async () => {
      const noteId = 'n-test-004';

      await expect(reviewManager.disableReview(noteId)).resolves.not.toThrow();
    });
  });

  describe('getNotesForReview', () => {
    beforeEach(async () => {
      const db = await dbManager.connect();

      // Create test notes
      const notes = [
        { id: 'n-past-001', title: 'Past Due', nextReview: '2024-01-01' },
        {
          id: 'n-today-001',
          title: 'Due Today',
          nextReview: new Date().toISOString().split('T')[0]
        },
        {
          id: 'n-future-001',
          title: 'Future Review',
          nextReview: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]
        }
      ];

      for (const note of notes) {
        await db.run(
          'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            note.id,
            note.title,
            'Content',
            'note',
            `${note.id}.md`,
            `note/${note.id}.md`,
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );

        await db.run(
          `INSERT INTO review_items (id, note_id, vault_id, enabled, next_review, review_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `rev-${note.id}`,
            note.id,
            vaultId,
            1,
            note.nextReview,
            0,
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
      }
    });

    it('should return notes due on or before the specified date', async () => {
      const today = new Date().toISOString().split('T')[0];
      const notes = await reviewManager.getNotesForReview(today);

      expect(notes.length).toBe(2);
      expect(notes.map((n) => n.id)).toContain('n-past-001');
      expect(notes.map((n) => n.id)).toContain('n-today-001');
      expect(notes.map((n) => n.id)).not.toContain('n-future-001');
    });

    it('should include review metadata with each note', async () => {
      const today = new Date().toISOString().split('T')[0];
      const notes = await reviewManager.getNotesForReview(today);

      expect(notes.length).toBeGreaterThan(0);
      const note = notes[0];

      expect(note.reviewItem).toBeDefined();
      expect(note.reviewItem.noteId).toBe(note.id);
      expect(note.reviewItem.reviewCount).toBeDefined();
      expect(note.reviewItem.nextReview).toBeDefined();
    });

    it('should return empty array if no notes are due', async () => {
      const pastDate = '2020-01-01';
      const notes = await reviewManager.getNotesForReview(pastDate);

      expect(notes).toEqual([]);
    });

    it('should only return enabled review items', async () => {
      const db = await dbManager.connect();

      // Disable one of the review items
      await db.run('UPDATE review_items SET enabled = 0 WHERE note_id = ?', [
        'n-past-001'
      ]);

      const today = new Date().toISOString().split('T')[0];
      const notes = await reviewManager.getNotesForReview(today);

      expect(notes.map((n) => n.id)).not.toContain('n-past-001');
    });
  });

  describe('completeReview', () => {
    beforeEach(async () => {
      const db = await dbManager.connect();
      const noteId = 'n-review-001';

      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Test Note',
          'Content',
          'note',
          'test.md',
          'note/test.md',
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );

      await reviewManager.enableReview(noteId);
    });

    it('should schedule next review 7 days out when passed', async () => {
      const noteId = 'n-review-001';
      const result = await reviewManager.completeReview(noteId, true);

      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 7);
      const expected = expectedDate.toISOString().split('T')[0];

      expect(result.nextReviewDate).toBe(expected);
      expect(result.reviewCount).toBe(1);
    });

    it('should schedule next review 1 day out when failed', async () => {
      const noteId = 'n-review-001';
      const result = await reviewManager.completeReview(noteId, false);

      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 1);
      const expected = expectedDate.toISOString().split('T')[0];

      expect(result.nextReviewDate).toBe(expected);
      expect(result.reviewCount).toBe(1);
    });

    it('should increment review count', async () => {
      const noteId = 'n-review-001';

      await reviewManager.completeReview(noteId, true);
      const result = await reviewManager.completeReview(noteId, true);

      expect(result.reviewCount).toBe(2);
    });

    it('should update last_reviewed timestamp', async () => {
      const noteId = 'n-review-001';
      const beforeTime = new Date().toISOString();

      await reviewManager.completeReview(noteId, true);

      const reviewItem = await reviewManager.getReviewItem(noteId);
      expect(reviewItem).not.toBeNull();
      expect(reviewItem!.lastReviewed).toBeDefined();
      expect(reviewItem!.lastReviewed! >= beforeTime).toBe(true);
    });

    it('should store review history', async () => {
      const noteId = 'n-review-001';

      await reviewManager.completeReview(noteId, true, 'First review response');
      await reviewManager.completeReview(noteId, false, 'Second review response');

      const reviewItem = await reviewManager.getReviewItem(noteId);
      expect(reviewItem).not.toBeNull();
      expect(reviewItem!.reviewHistory.length).toBe(2);
      expect(reviewItem!.reviewHistory[0].passed).toBe(true);
      expect(reviewItem!.reviewHistory[1].passed).toBe(false);
    });

    it('should throw error if note not found', async () => {
      await expect(reviewManager.completeReview('nonexistent', true)).rejects.toThrow(
        'Review item not found'
      );
    });
  });

  describe('getReviewStats', () => {
    beforeEach(async () => {
      const db = await dbManager.connect();

      // Create test notes with different schedules
      const notes = [
        { id: 'n-stat-001', nextReview: '2024-01-01' }, // Past
        { id: 'n-stat-002', nextReview: new Date().toISOString().split('T')[0] }, // Today
        {
          id: 'n-stat-003',
          nextReview: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]
        }, // 3 days
        {
          id: 'n-stat-004',
          nextReview: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]
        } // 10 days
      ];

      for (const note of notes) {
        await db.run(
          'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            note.id,
            `Note ${note.id}`,
            'Content',
            'note',
            `${note.id}.md`,
            `note/${note.id}.md`,
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );

        await db.run(
          `INSERT INTO review_items (id, note_id, vault_id, enabled, next_review, review_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `rev-${note.id}`,
            note.id,
            vaultId,
            1,
            note.nextReview,
            0,
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
      }
    });

    it('should return correct counts for due today', async () => {
      const stats = await reviewManager.getReviewStats();

      expect(stats.dueToday).toBe(2); // Past + Today
    });

    it('should return correct counts for due this week', async () => {
      const stats = await reviewManager.getReviewStats();

      expect(stats.dueThisWeek).toBe(3); // Past + Today + 3 days
    });

    it('should return correct total enabled count', async () => {
      const stats = await reviewManager.getReviewStats();

      expect(stats.totalEnabled).toBe(4);
    });

    it('should exclude disabled review items', async () => {
      const db = await dbManager.connect();

      await db.run('UPDATE review_items SET enabled = 0 WHERE note_id = ?', [
        'n-stat-001'
      ]);

      const stats = await reviewManager.getReviewStats();

      expect(stats.dueToday).toBe(1); // Only today
      expect(stats.totalEnabled).toBe(3);
    });
  });

  describe('isReviewEnabled', () => {
    it('should return true for enabled review', async () => {
      const db = await dbManager.connect();
      const noteId = 'n-check-001';

      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Test Note',
          'Content',
          'note',
          'test.md',
          'note/test.md',
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );

      await reviewManager.enableReview(noteId);

      const isEnabled = await reviewManager.isReviewEnabled(noteId);
      expect(isEnabled).toBe(true);
    });

    it('should return false for non-existent review', async () => {
      const isEnabled = await reviewManager.isReviewEnabled('nonexistent');
      expect(isEnabled).toBe(false);
    });
  });

  describe('foreign key constraints', () => {
    it('should cascade delete review item when note is deleted', async () => {
      const db = await dbManager.connect();
      const noteId = 'n-cascade-001';

      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Test Note',
          'Content',
          'note',
          'test.md',
          'note/test.md',
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );

      await reviewManager.enableReview(noteId);

      // Verify review item exists
      let reviewItem = await reviewManager.getReviewItem(noteId);
      expect(reviewItem).not.toBeNull();

      // Delete the note
      await db.run('DELETE FROM notes WHERE id = ?', [noteId]);

      // Review item should be automatically deleted
      reviewItem = await reviewManager.getReviewItem(noteId);
      expect(reviewItem).toBeNull();
    });
  });
});
