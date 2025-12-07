/**
 * Review Integration Tests
 *
 * End-to-end tests for the session-based review system through the API layer.
 * These tests involve database operations that can be timing-sensitive under load.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from './test-setup.js';
import type { FlintNoteApi } from '../../../src/server/api/flint-note-api.js';

// Retry flaky tests up to 2 times
describe('Review System Integration', { retry: 2 }, () => {
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
      expect(reviewItem.nextSessionNumber).toBe(1);
      expect(reviewItem.currentInterval).toBe(1);
      expect(reviewItem.status).toBe('active');
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
      expect(reviewItem!.nextSessionNumber).toBeDefined();
      expect(reviewItem!.currentInterval).toBeDefined();
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
    let currentNoteId: string;

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

      const currentNote = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'current-session',
        content: '# Current Session\nContent'
      });
      currentNoteId = currentNote.id;
      await api.enableReview({ noteId: currentNote.id, vaultId });

      // Set up session-based scheduling via SQL
      const vaultContext = await (api as any).getVaultContext(vaultId);
      const db = await vaultContext.hybridSearchManager.getDatabaseConnection();

      // Set current session to 5
      await db.run(
        `INSERT OR REPLACE INTO review_state (id, current_session_number, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [1, 5, new Date().toISOString(), new Date().toISOString()]
      );

      // Set past note to session 3 (due)
      await db.run('UPDATE review_items SET next_session_number = ? WHERE note_id = ?', [
        3,
        pastNote.id
      ]);
      // Set current note to session 5 (due)
      await db.run('UPDATE review_items SET next_session_number = ? WHERE note_id = ?', [
        5,
        currentNote.id
      ]);
    });

    it('should return notes due for current session', async () => {
      const notes = await api.getNotesForReview({ vaultId });

      expect(notes.length).toBe(2);
      expect(notes.every((n) => n.reviewItem)).toBe(true);
    });

    it('should include note content and metadata', async () => {
      const notes = await api.getNotesForReview({ vaultId });

      expect(notes.length).toBeGreaterThan(0);
      const note = notes[0];

      expect(note.id).toBeDefined();
      expect(note.title).toBeDefined();
      expect(note.content).toBeDefined();
      expect(note.reviewItem).toBeDefined();
      expect(note.reviewItem.reviewCount).toBeDefined();
      expect(note.reviewItem.nextSessionNumber).toBeDefined();
      expect(note.reviewItem.currentInterval).toBeDefined();
    });

    it('should not return notes scheduled for future sessions', async () => {
      // Create a future note
      const futureNote = await api.createNote({
        vaultId,
        type: 'note',
        identifier: 'future-note',
        content: '# Future\nContent'
      });
      await api.enableReview({ noteId: futureNote.id, vaultId });

      const vaultContext = await (api as any).getVaultContext(vaultId);
      const db = await vaultContext.hybridSearchManager.getDatabaseConnection();

      // Set to session 10 (future)
      await db.run('UPDATE review_items SET next_session_number = ? WHERE note_id = ?', [
        10,
        futureNote.id
      ]);

      const notes = await api.getNotesForReview({ vaultId });

      expect(notes.map((n) => n.id)).not.toContain(futureNote.id);
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

    it('should schedule closer with rating 1 (Need more time)', async () => {
      const result = await api.completeReview({
        noteId,
        vaultId,
        rating: 1
      });

      expect(result.nextSessionNumber).toBeDefined();
      expect(result.reviewCount).toBe(1);
      expect(result.retired).toBe(false);
    });

    it('should schedule further with rating 2 (Productive)', async () => {
      const result = await api.completeReview({
        noteId,
        vaultId,
        rating: 2
      });

      expect(result.nextSessionNumber).toBeDefined();
      expect(result.reviewCount).toBe(1);
      expect(result.retired).toBe(false);
    });

    it('should schedule much further with rating 3 (Already familiar)', async () => {
      const result = await api.completeReview({
        noteId,
        vaultId,
        rating: 3
      });

      expect(result.nextSessionNumber).toBeDefined();
      expect(result.reviewCount).toBe(1);
      expect(result.retired).toBe(false);
    });

    it('should retire note with rating 4 (Fully processed)', async () => {
      const result = await api.completeReview({
        noteId,
        vaultId,
        rating: 4
      });

      expect(result.retired).toBe(true);
      expect(result.reviewCount).toBe(1);

      // Verify status is updated
      const reviewItem = await api.getReviewItem({ noteId, vaultId });
      expect(reviewItem?.status).toBe('retired');
    });

    it('should increment review count', async () => {
      await api.completeReview({ noteId, vaultId, rating: 2 });
      const result = await api.completeReview({ noteId, vaultId, rating: 2 });

      expect(result.reviewCount).toBe(2);
    });

    it('should store user response if provided', async () => {
      await api.completeReview({
        noteId,
        vaultId,
        rating: 2,
        userResponse: 'My reflection on this note'
      });

      const reviewItem = await api.getReviewItem({ noteId, vaultId });
      expect(reviewItem!.reviewHistory.length).toBe(1);
      expect(reviewItem!.reviewHistory[0].response).toBe('My reflection on this note');
    });

    it('should store review history with rating', async () => {
      await api.completeReview({ noteId, vaultId, rating: 2 });
      await api.completeReview({ noteId, vaultId, rating: 1 });

      const reviewItem = await api.getReviewItem({ noteId, vaultId });
      expect(reviewItem!.reviewHistory.length).toBe(2);
      expect(reviewItem!.reviewHistory[0].rating).toBe(2);
      expect(reviewItem!.reviewHistory[1].rating).toBe(1);
    });

    it('should throw error for non-existent note', async () => {
      await expect(
        api.completeReview({
          noteId: 'nonexistent',
          vaultId,
          rating: 2
        })
      ).rejects.toThrow();
    });
  });

  describe('review statistics', () => {
    beforeEach(async () => {
      // Create notes with different schedules
      const notes = [
        { id: 'past', session: 3, status: 'active' },
        { id: 'current', session: 5, status: 'active' },
        { id: 'future', session: 10, status: 'active' },
        { id: 'retired', session: 1, status: 'retired' }
      ];

      // Get database connection from vault context
      const vaultContext = await (api as any).getVaultContext(vaultId);
      const db = await vaultContext.hybridSearchManager.getDatabaseConnection();

      // Set current session to 5
      await db.run(
        `INSERT OR REPLACE INTO review_state (id, current_session_number, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [1, 5, new Date().toISOString(), new Date().toISOString()]
      );

      for (const noteData of notes) {
        const note = await api.createNote({
          vaultId,
          type: 'note',
          identifier: noteData.id,
          content: `# ${noteData.id}\nContent`
        });

        await api.enableReview({ noteId: note.id, vaultId });

        await db.run(
          'UPDATE review_items SET next_session_number = ?, status = ? WHERE note_id = ?',
          [noteData.session, noteData.status, note.id]
        );
      }
    });

    it('should return correct statistics', async () => {
      const stats = await api.getReviewStats({ vaultId });

      expect(stats.dueThisSession).toBe(2); // past + current
      expect(stats.totalEnabled).toBe(3); // active items only
      expect(stats.retired).toBe(1);
      expect(stats.currentSessionNumber).toBe(5);
    });

    it('should return zero counts when no reviews enabled', async () => {
      // Create new setup with empty vault
      const emptySetup = new TestApiSetup();
      await emptySetup.setup();
      const emptyVaultId = await emptySetup.createTestVault('empty-vault');

      const stats = await emptySetup.api.getReviewStats({
        vaultId: emptyVaultId
      });

      expect(stats.dueThisSession).toBe(0);
      expect(stats.totalEnabled).toBe(0);
      expect(stats.retired).toBe(0);
      expect(stats.currentSessionNumber).toBe(1);

      await emptySetup.cleanup();
    });
  });

  describe('session management', () => {
    it('should get current session number', async () => {
      const result = await api.getCurrentSession({ vaultId });
      expect(result.sessionNumber).toBe(1); // Default
    });

    it('should increment session number', async () => {
      const result = await api.incrementSession({ vaultId });
      expect(result.sessionNumber).toBe(2);

      // Verify it persisted
      const current = await api.getCurrentSession({ vaultId });
      expect(current.sessionNumber).toBe(2);
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

  describe('default review mode for note types', () => {
    it('should automatically enable review for notes when note type has default_review_mode enabled', async () => {
      // Create a note type with default_review_mode enabled
      await api.createNoteType({
        vault_id: vaultId,
        type_name: 'task',
        description: 'Task notes with automatic review'
      });

      // Enable default review mode for this note type
      await api.updateNoteTypeDefaultReviewMode(vaultId, 'task', true);

      // Create a note of this type
      const note = await api.createNote({
        vaultId,
        type: 'task',
        identifier: 'test-task',
        content: '# Test Task\n\nThis should automatically have review enabled.'
      });

      // Verify review was automatically enabled
      const reviewEnabled = await api.isReviewEnabled({ noteId: note.id, vaultId });
      expect(reviewEnabled).toBe(true);

      // Verify review item exists
      const reviewItem = await api.getReviewItem({ noteId: note.id, vaultId });
      expect(reviewItem).toBeDefined();
      expect(reviewItem?.noteId).toBe(note.id);
    });

    it('should not enable review for notes when note type has default_review_mode disabled', async () => {
      // Create a note type with default_review_mode disabled (default state)
      await api.createNoteType({
        vault_id: vaultId,
        type_name: 'article',
        description: 'Article notes without automatic review'
      });

      // Explicitly set default_review_mode to false (should be default anyway)
      await api.updateNoteTypeDefaultReviewMode(vaultId, 'article', false);

      // Create a note of this type
      const note = await api.createNote({
        vaultId,
        type: 'article',
        identifier: 'test-article',
        content: '# Test Article\n\nThis should not have review enabled.'
      });

      // Verify review was not automatically enabled
      const reviewEnabled = await api.isReviewEnabled({ noteId: note.id, vaultId });
      expect(reviewEnabled).toBe(false);

      // Verify no review item exists
      const reviewItem = await api.getReviewItem({ noteId: note.id, vaultId });
      expect(reviewItem).toBeNull();
    });

    it('should toggle default_review_mode and affect newly created notes', async () => {
      // Create a note type
      await api.createNoteType({
        vault_id: vaultId,
        type_name: 'journal',
        description: 'Journal entries'
      });

      // Create a note without default review mode
      const note1 = await api.createNote({
        vaultId,
        type: 'journal',
        identifier: 'journal-1',
        content: '# Entry 1'
      });

      // Verify review is not enabled
      expect(await api.isReviewEnabled({ noteId: note1.id, vaultId })).toBe(false);

      // Enable default review mode
      await api.updateNoteTypeDefaultReviewMode(vaultId, 'journal', true);

      // Create a new note - should have review enabled
      const note2 = await api.createNote({
        vaultId,
        type: 'journal',
        identifier: 'journal-2',
        content: '# Entry 2'
      });

      // Verify review is enabled for the new note
      expect(await api.isReviewEnabled({ noteId: note2.id, vaultId })).toBe(true);

      // Verify the first note is still not in review (setting doesn't affect existing notes)
      expect(await api.isReviewEnabled({ noteId: note1.id, vaultId })).toBe(false);
    });

    it('should return default_review_mode in getNoteTypeInfo', async () => {
      // Create a note type
      await api.createNoteType({
        vault_id: vaultId,
        type_name: 'meeting',
        description: 'Meeting notes'
      });

      // Get initial state
      let typeInfo = await api.getNoteTypeInfo({
        vault_id: vaultId,
        type_name: 'meeting'
      });
      expect(typeInfo.default_review_mode).toBe(false);

      // Enable default review mode
      await api.updateNoteTypeDefaultReviewMode(vaultId, 'meeting', true);

      // Verify it's reflected in the type info
      typeInfo = await api.getNoteTypeInfo({ vault_id: vaultId, type_name: 'meeting' });
      expect(typeInfo.default_review_mode).toBe(true);

      // Disable it again
      await api.updateNoteTypeDefaultReviewMode(vaultId, 'meeting', false);

      // Verify it's updated
      typeInfo = await api.getNoteTypeInfo({ vault_id: vaultId, type_name: 'meeting' });
      expect(typeInfo.default_review_mode).toBe(false);
    });

    it('should enable review when moving note to type with default_review_mode enabled', async () => {
      // Create two note types: source without review, target with review
      await api.createNoteType({
        vault_id: vaultId,
        type_name: 'draft',
        description: 'Draft notes without review'
      });

      await api.createNoteType({
        vault_id: vaultId,
        type_name: 'published',
        description: 'Published notes with review'
      });

      // Enable default review mode for published type only
      await api.updateNoteTypeDefaultReviewMode(vaultId, 'published', true);

      // Create a note in draft type
      const note = await api.createNote({
        vaultId,
        type: 'draft',
        identifier: 'test-draft',
        content: '# Test Draft\n\nThis is a draft note.'
      });

      // Verify review is not enabled initially
      expect(await api.isReviewEnabled({ noteId: note.id, vaultId })).toBe(false);

      // Get content hash for the note
      const noteDetails = await api.getNote(vaultId, note.id);

      // Move note to published type
      await api.moveNote({
        noteId: note.id,
        newType: 'published',
        vault_id: vaultId,
        contentHash: noteDetails.content_hash
      });

      // Verify review is now enabled
      expect(await api.isReviewEnabled({ noteId: note.id, vaultId })).toBe(true);

      // Verify review item exists
      const reviewItem = await api.getReviewItem({ noteId: note.id, vaultId });
      expect(reviewItem).toBeDefined();
      expect(reviewItem?.noteId).toBe(note.id);
    });

    it('should not enable review when moving note to type without default_review_mode', async () => {
      // Create two note types: both without default review mode
      await api.createNoteType({
        vault_id: vaultId,
        type_name: 'inbox',
        description: 'Inbox notes'
      });

      await api.createNoteType({
        vault_id: vaultId,
        type_name: 'archive',
        description: 'Archived notes'
      });

      // Create a note in inbox type
      const note = await api.createNote({
        vaultId,
        type: 'inbox',
        identifier: 'test-inbox',
        content: '# Test Inbox\n\nThis is an inbox note.'
      });

      // Get content hash
      const noteDetails = await api.getNote(vaultId, note.id);

      // Move note to archive type
      await api.moveNote({
        noteId: note.id,
        newType: 'archive',
        vault_id: vaultId,
        contentHash: noteDetails.content_hash
      });

      // Verify review is still not enabled
      expect(await api.isReviewEnabled({ noteId: note.id, vaultId })).toBe(false);
    });

    it('should keep existing review enabled when moving between types', async () => {
      // Create two note types
      await api.createNoteType({
        vault_id: vaultId,
        type_name: 'typeA',
        description: 'Type A'
      });

      await api.createNoteType({
        vault_id: vaultId,
        type_name: 'typeB',
        description: 'Type B'
      });

      // Create a note and manually enable review
      const note = await api.createNote({
        vaultId,
        type: 'typeA',
        identifier: 'test-note-review',
        content: '# Test Note\n\nThis note has review enabled.'
      });

      await api.enableReview({ noteId: note.id, vaultId });

      // Verify review is enabled
      expect(await api.isReviewEnabled({ noteId: note.id, vaultId })).toBe(true);

      // Get content hash
      const noteDetails = await api.getNote(vaultId, note.id);

      // Move note to another type
      await api.moveNote({
        noteId: note.id,
        newType: 'typeB',
        vault_id: vaultId,
        contentHash: noteDetails.content_hash
      });

      // Verify review is still enabled
      expect(await api.isReviewEnabled({ noteId: note.id, vaultId })).toBe(true);
    });
  });
});
