/**
 * Review Integration Tests
 *
 * End-to-end tests for the review system through the API layer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from './test-setup.js';
import type { FlintNoteApi } from '../../../src/server/api/flint-note-api.js';

describe('Review System Integration', () => {
  let setup: TestApiSetup;
  let api: FlintNoteApi;
  let vaultId: string;

  beforeEach(async () => {
    setup = new TestApiSetup();
    await setup.setup();
    api = setup.api;
    vaultId = await setup.createTestVault('review-test-vault');
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('enabling and disabling review', () => {
    it('should enable review for a note', async () => {
      // Create a note
      const note = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'test-review',
        content: '# Test Review\n\nContent for review testing.'
      });

      // Enable review
      const reviewItem = await api.enableReview({ noteId: note.id, vaultId });

      expect(reviewItem).toBeDefined();
      expect(reviewItem.noteId).toBe(note.id);
      expect(reviewItem.enabled).toBe(true);
      expect(reviewItem.reviewCount).toBe(0);
    });

    it('should disable review for a note', async () => {
      // Create and enable review
      const note = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'test-disable',
        content: '# Test\nContent'
      });

      await api.enableReview({ noteId: note.id, vaultId });

      // Disable review
      await api.disableReview({ noteId: note.id, vaultId });

      // Verify it's disabled
      const status = await api.isReviewEnabled({ noteId: note.id, vaultId });
      expect(status).toBe(false);
    });

    it('should handle enabling review multiple times', async () => {
      const note = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'test-multiple',
        content: '# Test\nContent'
      });

      const first = await api.enableReview({ noteId: note.id, vaultId });
      const second = await api.enableReview({ noteId: note.id, vaultId });

      expect(first.id).toBe(second.id);
    });
  });

  describe('checking review status', () => {
    it('should return true when review is enabled', async () => {
      const note = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'test-status',
        content: '# Test\nContent'
      });

      await api.enableReview({ noteId: note.id, vaultId });

      const isEnabled = await api.isReviewEnabled({ noteId: note.id, vaultId });
      expect(isEnabled).toBe(true);
    });

    it('should return false when review is not enabled', async () => {
      const note = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'test-no-review',
        content: '# Test\nContent'
      });

      const isEnabled = await api.isReviewEnabled({ noteId: note.id, vaultId });
      expect(isEnabled).toBe(false);
    });

    it('should return false for non-existent note', async () => {
      const isEnabled = await api.isReviewEnabled({
        noteId: 'nonexistent',
        vaultId
      });
      expect(isEnabled).toBe(false);
    });
  });

  describe('getting review item details', () => {
    it('should return review item for enabled note', async () => {
      const note = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'test-details',
        content: '# Test\nContent'
      });

      await api.enableReview({ noteId: note.id, vaultId });

      const reviewItem = await api.getReviewItem({ noteId: note.id, vaultId });

      expect(reviewItem).toBeDefined();
      expect(reviewItem!.noteId).toBe(note.id);
      expect(reviewItem!.vaultId).toBe(vaultId);
      expect(reviewItem!.reviewCount).toBe(0);
      expect(reviewItem!.nextReview).toBeDefined();
    });

    it('should return null for note without review', async () => {
      const note = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'test-no-item',
        content: '# Test\nContent'
      });

      const reviewItem = await api.getReviewItem({ noteId: note.id, vaultId });
      expect(reviewItem).toBeNull();
    });
  });

  describe('getting notes for review', () => {
    let pastNoteId: string;
    let todayNoteId: string;

    beforeEach(async () => {
      // Create notes with different review schedules
      const pastNote = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'past-due',
        content: '# Past Due\nContent'
      });
      pastNoteId = pastNote.id;
      await api.enableReview({ noteId: pastNote.id, vaultId });

      const todayNote = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'due-today',
        content: '# Due Today\nContent'
      });
      todayNoteId = todayNote.id;
      await api.enableReview({ noteId: todayNote.id, vaultId });

      // Complete reviews to set them to past dates, then update manually via SQL
      // We need to access the internal database connection
      const vaultContext = await (api as any).getVaultContext(vaultId);
      const db = await vaultContext.hybridSearchManager.getDatabaseConnection();
      await db.run('UPDATE review_items SET next_review = ? WHERE note_id = ?', [
        '2024-01-01',
        pastNote.id
      ]);
      await db.run('UPDATE review_items SET next_review = ? WHERE note_id = ?', [
        new Date().toISOString().split('T')[0],
        todayNote.id
      ]);
    });

    it('should return notes due for review', async () => {
      const today = new Date().toISOString().split('T')[0];
      const notes = await api.getNotesForReview({ date: today, vaultId });

      expect(notes.length).toBe(2);
      expect(notes.every((n) => n.reviewItem)).toBe(true);
    });

    it('should include note content and metadata', async () => {
      const today = new Date().toISOString().split('T')[0];
      const notes = await api.getNotesForReview({ date: today, vaultId });

      expect(notes.length).toBeGreaterThan(0);
      const note = notes[0];

      expect(note.id).toBeDefined();
      expect(note.title).toBeDefined();
      expect(note.content).toBeDefined();
      expect(note.reviewItem).toBeDefined();
      expect(note.reviewItem.reviewCount).toBeDefined();
    });

    it('should return empty array when no notes are due', async () => {
      const pastDate = '2020-01-01';
      const notes = await api.getNotesForReview({ date: pastDate, vaultId });

      expect(notes).toEqual([]);
    });
  });

  describe('completing reviews', () => {
    let noteId: string;

    beforeEach(async () => {
      const note = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'test-complete',
        content: '# Test Complete\nContent'
      });
      noteId = note.id;

      await api.enableReview({ noteId, vaultId });
    });

    it('should update schedule when review passes', async () => {
      const result = await api.completeReview({
        noteId,
        vaultId,
        passed: true
      });

      expect(result.nextReviewDate).toBeDefined();
      expect(result.reviewCount).toBe(1);

      // Verify next review is 7 days out
      const expected = new Date();
      expected.setDate(expected.getDate() + 7);
      const expectedDate = expected.toISOString().split('T')[0];
      expect(result.nextReviewDate).toBe(expectedDate);
    });

    it('should update schedule when review fails', async () => {
      const result = await api.completeReview({
        noteId,
        vaultId,
        passed: false
      });

      expect(result.nextReviewDate).toBeDefined();
      expect(result.reviewCount).toBe(1);

      // Verify next review is 1 day out
      const expected = new Date();
      expected.setDate(expected.getDate() + 1);
      const expectedDate = expected.toISOString().split('T')[0];
      expect(result.nextReviewDate).toBe(expectedDate);
    });

    it('should increment review count', async () => {
      await api.completeReview({ noteId, vaultId, passed: true });
      const result = await api.completeReview({ noteId, vaultId, passed: true });

      expect(result.reviewCount).toBe(2);
    });

    it('should store user response if provided', async () => {
      await api.completeReview({
        noteId,
        vaultId,
        passed: true,
        userResponse: 'My reflection on this note'
      });

      const reviewItem = await api.getReviewItem({ noteId, vaultId });
      expect(reviewItem!.reviewHistory.length).toBe(1);
      expect(reviewItem!.reviewHistory[0].response).toBe('My reflection on this note');
    });

    it('should throw error for non-existent note', async () => {
      await expect(
        api.completeReview({
          noteId: 'nonexistent',
          vaultId,
          passed: true
        })
      ).rejects.toThrow();
    });
  });

  describe('review statistics', () => {
    beforeEach(async () => {
      // Create notes with different schedules
      const notes = [
        { id: 'past', date: '2024-01-01' },
        { id: 'today', date: new Date().toISOString().split('T')[0] },
        {
          id: 'week',
          date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        },
        {
          id: 'future',
          date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]
        }
      ];

      // Get database connection from vault context
      const vaultContext = await (api as any).getVaultContext(vaultId);
      const db = await vaultContext.hybridSearchManager.getDatabaseConnection();

      for (const noteData of notes) {
        const note = await api.createNote({
          vaultId,
          type: 'note',
          identifier: noteData.id,
          content: `# ${noteData.id}\nContent`
        });

        await api.enableReview({ noteId: note.id, vaultId });

        await db.run('UPDATE review_items SET next_review = ? WHERE note_id = ?', [
          noteData.date,
          note.id
        ]);
      }
    });

    it('should return correct statistics', async () => {
      const stats = await api.getReviewStats({ vaultId });

      expect(stats.dueToday).toBe(2); // past + today
      expect(stats.dueThisWeek).toBe(3); // past + today + week
      expect(stats.totalEnabled).toBe(4);
    });

    it('should return zero counts when no reviews enabled', async () => {
      // Create new setup with empty vault
      const emptySetup = new TestApiSetup();
      await emptySetup.setup();
      const emptyVaultId = await emptySetup.createTestVault('empty-vault');

      const stats = await emptySetup.api.getReviewStats({
        vaultId: emptyVaultId
      });

      expect(stats.dueToday).toBe(0);
      expect(stats.dueThisWeek).toBe(0);
      expect(stats.totalEnabled).toBe(0);

      await emptySetup.cleanup();
    });
  });

  describe('note deletion cascade', () => {
    it('should remove review item when note is deleted', async () => {
      const note = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'test-delete',
        content: '# Test Delete\nContent'
      });

      await api.enableReview({ noteId: note.id, vaultId });

      // Verify review exists
      let reviewItem = await api.getReviewItem({ noteId: note.id, vaultId });
      expect(reviewItem).not.toBeNull();

      // Delete the note
      await api.deleteNote({ identifier: note.id, vaultId });

      // Review item should be gone
      reviewItem = await api.getReviewItem({ noteId: note.id, vaultId });
      expect(reviewItem).toBeNull();
    });
  });

  describe('vault isolation', () => {
    it('should validate vault ID exists', async () => {
      // Create note in first vault
      const note = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'vault-test',
        content: '# Test\nContent'
      });

      await api.enableReview({ noteId: note.id, vaultId });

      // Try to access from non-existent vault ID - should throw
      await expect(
        api.getReviewItem({
          noteId: note.id,
          vaultId: 'nonexistent-vault'
        })
      ).rejects.toThrow('does not exist');
    });

    it('should isolate review stats between vaults', async () => {
      // Create a second vault
      const secondVaultId = await setup.createTestVault('second-vault');

      // Create and enable review in first vault
      const note1 = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'vault1-note',
        content: '# Vault 1\nContent'
      });

      await api.enableReview({ noteId: note1.id, vaultId });

      // Get stats for first vault - should have 1
      const stats1 = await api.getReviewStats({ vaultId });
      expect(stats1.totalEnabled).toBe(1);

      // Get stats for second vault - should have 0
      const stats2 = await api.getReviewStats({ vaultId: secondVaultId });
      expect(stats2.totalEnabled).toBe(0);
    });
  });
});
