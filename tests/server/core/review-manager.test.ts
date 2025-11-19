/**
 * Review Manager Tests
 *
 * Tests for the session-based spaced engagement review system
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

    // Create review_items table with new session-based columns
    await db.run(`
      CREATE TABLE IF NOT EXISTS review_items (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL UNIQUE,
        vault_id TEXT NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        last_reviewed TEXT,
        next_review TEXT NOT NULL,
        next_session_number INTEGER NOT NULL DEFAULT 1,
        current_interval INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        review_count INTEGER DEFAULT 0,
        review_history TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      )
    `);

    // Create review_state table
    await db.run(`
      CREATE TABLE IF NOT EXISTS review_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        current_session_number INTEGER NOT NULL DEFAULT 1,
        last_session_completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create review_config table
    await db.run(`
      CREATE TABLE IF NOT EXISTS review_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        session_size INTEGER NOT NULL DEFAULT 5,
        sessions_per_week INTEGER NOT NULL DEFAULT 7,
        max_interval_sessions INTEGER NOT NULL DEFAULT 15,
        min_interval_days INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await db.run(
      'CREATE INDEX IF NOT EXISTS idx_review_next_session ON review_items(next_session_number, enabled)'
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
      expect(reviewItem.nextSessionNumber).toBe(1);
      expect(reviewItem.currentInterval).toBe(1);
      expect(reviewItem.status).toBe('active');
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

      // Initialize session state
      await db.run(
        `INSERT INTO review_state (id, current_session_number, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [1, 5, new Date().toISOString(), new Date().toISOString()]
      );

      // Create test notes with different session numbers
      const notes = [
        { id: 'n-past-001', title: 'Past Due', nextSession: 3 }, // Due (session 3 <= 5)
        { id: 'n-today-001', title: 'Due Now', nextSession: 5 }, // Due (session 5 <= 5)
        { id: 'n-future-001', title: 'Future Review', nextSession: 10 } // Not due
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
          `INSERT INTO review_items (id, note_id, vault_id, enabled, next_review, next_session_number, current_interval, status, review_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `rev-${note.id}`,
            note.id,
            vaultId,
            1,
            '2025-01-01',
            note.nextSession,
            1,
            'active',
            0,
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
      }
    });

    it('should return notes due for current session', async () => {
      const notes = await reviewManager.getNotesForReview();

      expect(notes.length).toBe(2);
      expect(notes.map((n) => n.id)).toContain('n-past-001');
      expect(notes.map((n) => n.id)).toContain('n-today-001');
      expect(notes.map((n) => n.id)).not.toContain('n-future-001');
    });

    it('should include review metadata with each note', async () => {
      const notes = await reviewManager.getNotesForReview();

      expect(notes.length).toBeGreaterThan(0);
      const note = notes[0];

      expect(note.reviewItem).toBeDefined();
      expect(note.reviewItem.noteId).toBe(note.id);
      expect(note.reviewItem.reviewCount).toBeDefined();
      expect(note.reviewItem.nextSessionNumber).toBeDefined();
      expect(note.reviewItem.currentInterval).toBeDefined();
    });

    it('should only return enabled and active review items', async () => {
      const db = await dbManager.connect();

      // Disable one of the review items
      await db.run('UPDATE review_items SET enabled = 0 WHERE note_id = ?', [
        'n-past-001'
      ]);

      const notes = await reviewManager.getNotesForReview();

      expect(notes.map((n) => n.id)).not.toContain('n-past-001');
    });

    it('should not return retired items', async () => {
      const db = await dbManager.connect();

      // Retire one of the review items
      await db.run("UPDATE review_items SET status = 'retired' WHERE note_id = ?", [
        'n-today-001'
      ]);

      const notes = await reviewManager.getNotesForReview();

      expect(notes.map((n) => n.id)).not.toContain('n-today-001');
    });
  });

  describe('completeReview', () => {
    beforeEach(async () => {
      const db = await dbManager.connect();
      const noteId = 'n-review-001';

      // Initialize session state
      await db.run(
        `INSERT INTO review_state (id, current_session_number, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [1, 5, new Date().toISOString(), new Date().toISOString()]
      );

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

    it('should schedule closer with rating 1 (Need more time)', async () => {
      const noteId = 'n-review-001';
      const result = await reviewManager.completeReview(noteId, 1);

      // Initial interval is 1, rating 1 multiplier is 0.5, min is 1
      // Next session = current(5) + interval(1) = 6
      expect(result.nextSessionNumber).toBe(6);
      expect(result.reviewCount).toBe(1);
      expect(result.retired).toBe(false);
    });

    it('should schedule further with rating 2 (Productive)', async () => {
      const noteId = 'n-review-001';
      const result = await reviewManager.completeReview(noteId, 2);

      // Initial interval is 1, rating 2 multiplier is 1.5 -> 2
      // Next session = current(5) + interval(2) = 7
      expect(result.nextSessionNumber).toBe(7);
      expect(result.reviewCount).toBe(1);
      expect(result.retired).toBe(false);
    });

    it('should schedule much further with rating 3 (Already familiar)', async () => {
      const noteId = 'n-review-001';
      const result = await reviewManager.completeReview(noteId, 3);

      // Initial interval is 1, rating 3 multiplier is 2.5 -> 3
      // Next session = current(5) + interval(3) = 8
      expect(result.nextSessionNumber).toBe(8);
      expect(result.reviewCount).toBe(1);
      expect(result.retired).toBe(false);
    });

    it('should retire note with rating 4 (Fully processed)', async () => {
      const noteId = 'n-review-001';
      const result = await reviewManager.completeReview(noteId, 4);

      expect(result.retired).toBe(true);
      expect(result.reviewCount).toBe(1);

      // Verify status is updated in database
      const reviewItem = await reviewManager.getReviewItem(noteId);
      expect(reviewItem?.status).toBe('retired');
    });

    it('should increment review count', async () => {
      const noteId = 'n-review-001';

      await reviewManager.completeReview(noteId, 2);
      const result = await reviewManager.completeReview(noteId, 2);

      expect(result.reviewCount).toBe(2);
    });

    it('should update last_reviewed timestamp', async () => {
      const noteId = 'n-review-001';
      const beforeTime = new Date().toISOString();

      await reviewManager.completeReview(noteId, 2);

      const reviewItem = await reviewManager.getReviewItem(noteId);
      expect(reviewItem).not.toBeNull();
      expect(reviewItem!.lastReviewed).toBeDefined();
      expect(reviewItem!.lastReviewed! >= beforeTime).toBe(true);
    });

    it('should store review history with ratings', async () => {
      const noteId = 'n-review-001';

      await reviewManager.completeReview(noteId, 2, 'First review response');
      await reviewManager.completeReview(noteId, 1, 'Second review response');

      const reviewItem = await reviewManager.getReviewItem(noteId);
      expect(reviewItem).not.toBeNull();
      expect(reviewItem!.reviewHistory.length).toBe(2);
      expect(reviewItem!.reviewHistory[0].rating).toBe(2);
      expect(reviewItem!.reviewHistory[1].rating).toBe(1);
    });

    it('should throw error if note not found', async () => {
      await expect(reviewManager.completeReview('nonexistent', 2)).rejects.toThrow(
        'Review item not found'
      );
    });
  });

  describe('getReviewStats', () => {
    beforeEach(async () => {
      const db = await dbManager.connect();

      // Initialize session state at session 5
      await db.run(
        `INSERT INTO review_state (id, current_session_number, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [1, 5, new Date().toISOString(), new Date().toISOString()]
      );

      // Create test notes with different schedules
      const notes = [
        { id: 'n-stat-001', nextSession: 3, status: 'active' }, // Due (past)
        { id: 'n-stat-002', nextSession: 5, status: 'active' }, // Due (current)
        { id: 'n-stat-003', nextSession: 8, status: 'active' }, // Not due
        { id: 'n-stat-004', nextSession: 1, status: 'retired' } // Retired
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
          `INSERT INTO review_items (id, note_id, vault_id, enabled, next_review, next_session_number, current_interval, status, review_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `rev-${note.id}`,
            note.id,
            vaultId,
            1,
            '2025-01-01',
            note.nextSession,
            1,
            note.status,
            0,
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
      }
    });

    it('should return correct counts for due this session', async () => {
      const stats = await reviewManager.getReviewStats();

      expect(stats.dueThisSession).toBe(2); // Past + Current session
    });

    it('should return correct total enabled count', async () => {
      const stats = await reviewManager.getReviewStats();

      expect(stats.totalEnabled).toBe(3); // Active items only
    });

    it('should return correct retired count', async () => {
      const stats = await reviewManager.getReviewStats();

      expect(stats.retired).toBe(1);
    });

    it('should return current session number', async () => {
      const stats = await reviewManager.getReviewStats();

      expect(stats.currentSessionNumber).toBe(5);
    });

    it('should exclude disabled review items', async () => {
      const db = await dbManager.connect();

      await db.run('UPDATE review_items SET enabled = 0 WHERE note_id = ?', [
        'n-stat-001'
      ]);

      const stats = await reviewManager.getReviewStats();

      expect(stats.dueThisSession).toBe(1); // Only current session note
      expect(stats.totalEnabled).toBe(2);
    });
  });

  describe('session management', () => {
    it('should get current session number', async () => {
      const db = await dbManager.connect();

      await db.run(
        `INSERT INTO review_state (id, current_session_number, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [1, 10, new Date().toISOString(), new Date().toISOString()]
      );

      const session = await reviewManager.getCurrentSessionNumber();
      expect(session).toBe(10);
    });

    it('should initialize session number to 1 if not exists', async () => {
      const session = await reviewManager.getCurrentSessionNumber();
      expect(session).toBe(1);
    });

    it('should increment session number', async () => {
      const db = await dbManager.connect();

      await db.run(
        `INSERT INTO review_state (id, current_session_number, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [1, 5, new Date().toISOString(), new Date().toISOString()]
      );

      const newSession = await reviewManager.incrementSessionNumber();
      expect(newSession).toBe(6);

      // Verify persisted
      const session = await reviewManager.getCurrentSessionNumber();
      expect(session).toBe(6);
    });
  });

  describe('retired notes management', () => {
    it('should reactivate a retired note', async () => {
      const db = await dbManager.connect();
      const noteId = 'n-retired-001';

      // Initialize session state
      await db.run(
        `INSERT INTO review_state (id, current_session_number, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [1, 5, new Date().toISOString(), new Date().toISOString()]
      );

      await db.run(
        'INSERT INTO notes (id, title, content, type, filename, path, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          noteId,
          'Retired Note',
          'Content',
          'note',
          'retired.md',
          'note/retired.md',
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );

      // Create retired review item
      await db.run(
        `INSERT INTO review_items (id, note_id, vault_id, enabled, next_review, next_session_number, current_interval, status, review_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `rev-${noteId}`,
          noteId,
          vaultId,
          1,
          '9999-12-31',
          999,
          1,
          'retired',
          5,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );

      const reactivated = await reviewManager.reactivateNote(noteId);

      expect(reactivated.status).toBe('active');
      expect(reactivated.nextSessionNumber).toBe(6); // Current session + 1
      expect(reactivated.currentInterval).toBe(1);
    });

    it('should get all retired items', async () => {
      const db = await dbManager.connect();

      // Create test notes
      const notes = [
        { id: 'n-ret-001', status: 'retired' },
        { id: 'n-ret-002', status: 'retired' },
        { id: 'n-act-001', status: 'active' }
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
          `INSERT INTO review_items (id, note_id, vault_id, enabled, next_review, next_session_number, current_interval, status, review_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `rev-${note.id}`,
            note.id,
            vaultId,
            1,
            '2025-01-01',
            1,
            1,
            note.status,
            0,
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
      }

      const retired = await reviewManager.getRetiredItems();

      expect(retired.length).toBe(2);
      expect(retired.map((r) => r.noteId)).toContain('n-ret-001');
      expect(retired.map((r) => r.noteId)).toContain('n-ret-002');
      expect(retired.map((r) => r.noteId)).not.toContain('n-act-001');
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
