/**
 * Note Operations Unit Tests
 *
 * Tests for both single and batch note creation and update functionality
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createTestWorkspace,
  cleanupTestWorkspace,
  createTestNoteTypes,
  type TestContext
} from './helpers/test-utils.ts';
import type {
  BatchCreateNoteInput,
  BatchUpdateNoteInput,
  BatchCreateResult,
  BatchUpdateResult
} from '../../src/types/index.js';

describe('Note Operations (Single and Batch)', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('note-ops');
    await createTestNoteTypes(context);
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  describe('Single Note Creation', () => {
    test('should create a single note', async () => {
      const noteInfo = await context.noteManager.createNote(
        'general',
        'Single Test Note',
        'Content for single test note'
      );

      assert(noteInfo);
      assert.strictEqual(noteInfo.title, 'Single Test Note');
      assert.strictEqual(noteInfo.type, 'general');
      assert(noteInfo.id);
      assert(noteInfo.created);
    });

    test('should create a single note with metadata', async () => {
      const noteInfo = await context.noteManager.createNote(
        'book-reviews',
        'Single Book Review',
        'Great book review content',
        {
          author: 'Test Author',
          rating: 5,
          status: 'completed'
        }
      );

      assert(noteInfo);
      assert.strictEqual(noteInfo.title, 'Single Book Review');

      // Verify the note was created with metadata
      const retrievedNote = await context.noteManager.getNote(noteInfo.id);
      assert(retrievedNote, 'Retrieved note should not be null');
      assert.strictEqual(retrievedNote.metadata?.author, 'Test Author');
      assert.strictEqual(retrievedNote.metadata?.rating, 5);
    });
  });

  describe('Batch Note Creation', () => {
    test('should create multiple notes successfully', async () => {
      const notes: BatchCreateNoteInput[] = [
        {
          type: 'general',
          title: 'Batch Note 1',
          content: 'Content for batch note 1'
        },
        {
          type: 'general',
          title: 'Batch Note 2',
          content: 'Content for batch note 2'
        },
        {
          type: 'projects',
          title: 'Project Alpha',
          content: 'Project planning notes'
        }
      ];

      const result: BatchCreateResult = await context.noteManager.batchCreateNotes(notes);

      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.successful, 3);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(result.results.length, 3);

      // Check each result
      for (let i = 0; i < result.results.length; i++) {
        const itemResult = result.results[i];
        assert.strictEqual(itemResult.success, true);
        assert.strictEqual(itemResult.input, notes[i]);
        assert(itemResult.result);
        assert.strictEqual(itemResult.result.title, notes[i].title);
        assert.strictEqual(itemResult.result.type, notes[i].type);
        assert(!itemResult.error);
      }
    });

    test('should create notes with metadata', async () => {
      const notes: BatchCreateNoteInput[] = [
        {
          type: 'book-reviews',
          title: 'The Pragmatic Programmer',
          content: 'Excellent book on software development practices',
          metadata: {
            author: 'Andy Hunt',
            rating: 5,
            status: 'completed',
            genre: 'programming'
          }
        },
        {
          type: 'book-reviews',
          title: 'Clean Code',
          content: 'Guide to writing maintainable code',
          metadata: {
            author: 'Robert Martin',
            rating: 4,
            status: 'completed',
            genre: 'programming'
          }
        }
      ];

      const result: BatchCreateResult = await context.noteManager.batchCreateNotes(notes);

      assert.strictEqual(result.successful, 2);
      assert.strictEqual(result.failed, 0);

      // Verify notes were created with metadata
      for (const itemResult of result.results) {
        assert.strictEqual(itemResult.success, true);
        assert(itemResult.result);

        // Read the actual note to verify metadata
        const note = await context.noteManager.getNote(itemResult.result.id);
        assert(note, 'Note should not be null');
        assert(note.metadata);
        assert.strictEqual(note.metadata.author, itemResult.input.metadata?.author);
        assert.strictEqual(note.metadata.rating, itemResult.input.metadata?.rating);
      }
    });

    test('should handle partial failures gracefully', async () => {
      const notes: BatchCreateNoteInput[] = [
        {
          type: 'general',
          title: 'Valid Note',
          content: 'This should succeed'
        },
        {
          type: 'invalid/type',
          title: 'Invalid Note',
          content: 'This should fail due to invalid type'
        },
        {
          type: 'general',
          title: '', // Empty title should fail
          content: 'This should fail due to empty title'
        },
        {
          type: 'general',
          title: 'Another Valid Note',
          content: 'This should succeed'
        }
      ];

      const result: BatchCreateResult = await context.noteManager.batchCreateNotes(notes);

      assert.strictEqual(result.total, 4);
      assert.strictEqual(result.successful, 2);
      assert.strictEqual(result.failed, 2);

      // Check successful notes
      const successfulResults = result.results.filter(r => r.success);
      assert.strictEqual(successfulResults.length, 2);
      assert.strictEqual(successfulResults[0].input.title, 'Valid Note');
      assert.strictEqual(successfulResults[1].input.title, 'Another Valid Note');

      // Check failed notes
      const failedResults = result.results.filter(r => !r.success);
      assert.strictEqual(failedResults.length, 2);
      assert(failedResults[0].error);
      assert(failedResults[1].error);
      assert(failedResults[0].error!.includes('Invalid note type name'));
      assert(failedResults[1].error!.includes('Note title is required'));
    });

    test('should handle empty batch', async () => {
      const result: BatchCreateResult = await context.noteManager.batchCreateNotes([]);

      assert.strictEqual(result.total, 0);
      assert.strictEqual(result.successful, 0);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(result.results.length, 0);
    });

    test('should handle filename conflicts', async () => {
      // Create a note first
      await context.noteManager.createNote(
        'general',
        'Duplicate Title',
        'Original content'
      );

      const notes: BatchCreateNoteInput[] = [
        {
          type: 'general',
          title: 'Duplicate Title',
          content: 'This should fail due to duplicate filename'
        },
        {
          type: 'general',
          title: 'Unique Title',
          content: 'This should succeed'
        }
      ];

      const result: BatchCreateResult = await context.noteManager.batchCreateNotes(notes);

      assert.strictEqual(result.total, 2);
      assert.strictEqual(result.successful, 1);
      assert.strictEqual(result.failed, 1);

      const failedResult = result.results.find(r => !r.success);
      assert(failedResult);
      assert(failedResult.error);
      assert(failedResult.error.includes('already exists'));
    });
  });

  describe('Single Note Updates', () => {
    test('should update a single note', async () => {
      // Create a note first
      const noteInfo = await context.noteManager.createNote(
        'general',
        'Update Test',
        'Original content'
      );

      // Get the current note to obtain content hash
      const currentNote = await context.noteManager.getNote(noteInfo.id);
      assert(currentNote, 'Current note should not be null');
      assert(currentNote.content_hash, 'Current note should have content hash');

      // Update it
      const result = await context.noteManager.updateNote(
        noteInfo.id,
        'Updated content',
        currentNote.content_hash
      );

      assert.strictEqual(result.updated, true);
      assert(result.timestamp);

      // Verify the update
      const updatedNote = await context.noteManager.getNote(noteInfo.id);
      assert(updatedNote, 'Updated note should not be null');
      assert(updatedNote.content.includes('Updated content'));
    });

    test('should update note with metadata', async () => {
      // Create a note with initial metadata
      const noteInfo = await context.noteManager.createNote(
        'book-reviews',
        'Metadata Update Test',
        'Original content',
        {
          author: 'Original Author',
          rating: 3,
          status: 'reading'
        }
      );

      // Get the current note to obtain content hash
      const currentNote = await context.noteManager.getNote(noteInfo.id);
      assert(currentNote, 'Current note should not be null');
      assert(currentNote.content_hash, 'Current note should have content hash');

      // Update with new metadata
      const result = await context.noteManager.updateNoteWithMetadata(
        noteInfo.id,
        'Updated content',
        {
          author: 'Updated Author',
          rating: 5,
          status: 'completed',
          notes: 'Added some notes'
        },
        currentNote.content_hash
      );

      assert.strictEqual(result.updated, true);

      // Verify the update
      const updatedNote = await context.noteManager.getNote(noteInfo.id);
      assert(updatedNote, 'Updated note should not be null');
      assert(updatedNote.content.includes('Updated content'));
      assert.strictEqual(updatedNote.metadata?.author, 'Updated Author');
      assert.strictEqual(updatedNote.metadata?.rating, 5);
      assert.strictEqual(updatedNote.metadata?.status, 'completed');
    });
  });

  describe('Batch Note Updates', () => {
    test('should update multiple notes successfully', async () => {
      // Create test notes first
      const note1 = await context.noteManager.createNote(
        'general',
        'Update Test 1',
        'Original content 1'
      );
      const note2 = await context.noteManager.createNote(
        'general',
        'Update Test 2',
        'Original content 2'
      );
      const note3 = await context.noteManager.createNote(
        'projects',
        'Update Test 3',
        'Original content 3'
      );

      // Get current notes to obtain content hashes
      const currentNote1 = await context.noteManager.getNote(note1.id);
      const currentNote2 = await context.noteManager.getNote(note2.id);
      const currentNote3 = await context.noteManager.getNote(note3.id);

      assert(currentNote1?.content_hash, 'Note 1 should have content hash');
      assert(currentNote2?.content_hash, 'Note 2 should have content hash');
      assert(currentNote3?.content_hash, 'Note 3 should have content hash');

      const updates: BatchUpdateNoteInput[] = [
        {
          identifier: note1.id,
          content: 'Updated content 1',
          content_hash: currentNote1.content_hash
        },
        {
          identifier: note2.id,
          content: 'Updated content 2',
          content_hash: currentNote2.content_hash
        },
        {
          identifier: note3.id,
          content: 'Updated content 3',
          content_hash: currentNote3.content_hash
        }
      ];

      const result: BatchUpdateResult =
        await context.noteManager.batchUpdateNotes(updates);

      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.successful, 3);
      assert.strictEqual(result.failed, 0);

      // Verify updates
      for (let i = 0; i < result.results.length; i++) {
        const itemResult = result.results[i];
        assert.strictEqual(itemResult.success, true);
        assert(itemResult.result);
        assert.strictEqual(itemResult.result.updated, true);
        assert(!itemResult.error);

        // Verify actual content was updated
        const updatedNote = await context.noteManager.getNote(updates[i].identifier);
        assert(updatedNote, 'Updated note should not be null');
        assert(updatedNote.content.includes(`Updated content ${i + 1}`));
      }
    });

    test('should update notes with metadata only', async () => {
      // Create a test note with initial metadata
      const note = await context.noteManager.createNote(
        'book-reviews',
        'Test Book',
        'Original review content',
        {
          author: 'Original Author',
          rating: 3,
          status: 'reading'
        }
      );

      // Get current note to obtain content hash
      const currentNote = await context.noteManager.getNote(note.id);
      assert(currentNote?.content_hash, 'Note should have content hash');

      const updates: BatchUpdateNoteInput[] = [
        {
          identifier: note.id,
          metadata: {
            author: 'Updated Author',
            rating: 5,
            status: 'completed',
            genre: 'fiction'
          },
          content_hash: currentNote.content_hash
        }
      ];

      const result: BatchUpdateResult =
        await context.noteManager.batchUpdateNotes(updates);

      assert.strictEqual(result.successful, 1);
      assert.strictEqual(result.failed, 0);

      // Verify metadata was updated while content remained the same
      const updatedNote = await context.noteManager.getNote(note.id);
      assert(updatedNote, 'Updated note should not be null');
      assert(updatedNote.content.includes('Original review content'));
      assert.strictEqual(updatedNote.metadata?.author, 'Updated Author');
      assert.strictEqual(updatedNote.metadata?.rating, 5);
      assert.strictEqual(updatedNote.metadata?.status, 'completed');
      assert.strictEqual(updatedNote.metadata?.genre, 'fiction');
    });

    test('should update notes with both content and metadata', async () => {
      const note = await context.noteManager.createNote(
        'book-reviews',
        'Mixed Update Test',
        'Original content',
        {
          author: 'Original Author',
          rating: 3,
          status: 'reading'
        }
      );

      // Get current note to obtain content hash
      const currentNote = await context.noteManager.getNote(note.id);
      assert(currentNote?.content_hash, 'Note should have content hash');

      const updates: BatchUpdateNoteInput[] = [
        {
          identifier: note.id,
          content: 'Updated content with both changes',
          metadata: {
            author: 'Updated Author',
            rating: 5,
            status: 'completed'
          },
          content_hash: currentNote.content_hash
        }
      ];

      const result: BatchUpdateResult =
        await context.noteManager.batchUpdateNotes(updates);

      assert.strictEqual(result.successful, 1);

      // Verify both content and metadata were updated
      const updatedNote = await context.noteManager.getNote(note.id);
      assert(updatedNote, 'Updated note should not be null');
      assert(updatedNote.content.includes('Updated content with both changes'));
      assert.strictEqual(updatedNote.metadata?.author, 'Updated Author');
      assert.strictEqual(updatedNote.metadata?.rating, 5);
      assert.strictEqual(updatedNote.metadata?.status, 'completed');
    });

    test('should handle partial failures in updates', async () => {
      // Create one valid note
      const validNote = await context.noteManager.createNote(
        'general',
        'Valid Update Target',
        'Content to update'
      );

      // Get current note to obtain content hash
      const currentNote = await context.noteManager.getNote(validNote.id);
      assert(currentNote?.content_hash, 'Valid note should have content hash');

      const updates: BatchUpdateNoteInput[] = [
        {
          identifier: validNote.id,
          content: 'Successfully updated content',
          content_hash: currentNote.content_hash
        },
        {
          identifier: 'nonexistent/note.md',
          content: 'This should fail - note does not exist',
          content_hash: 'dummy-hash'
        },
        {
          identifier: 'general/another-nonexistent.md',
          content: 'This should also fail',
          content_hash: 'dummy-hash'
        }
      ];

      const result: BatchUpdateResult =
        await context.noteManager.batchUpdateNotes(updates);

      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.successful, 1);
      assert.strictEqual(result.failed, 2);

      // Check successful update
      const successfulResult = result.results.find(r => r.success);
      assert(successfulResult);
      assert.strictEqual(successfulResult.input.identifier, validNote.id);

      // Check failed updates
      const failedResults = result.results.filter(r => !r.success);
      assert.strictEqual(failedResults.length, 2);
      for (const failedResult of failedResults) {
        assert(failedResult.error);
        assert(failedResult.error.includes('does not exist'));
      }
    });

    test('should reject updates with no content or metadata', async () => {
      const note = await context.noteManager.createNote(
        'general',
        'Empty Update Test',
        'Original content'
      );

      // Get current note to obtain content hash
      const currentNote = await context.noteManager.getNote(note.id);
      assert(currentNote?.content_hash, 'Note should have content hash');

      const updates: BatchUpdateNoteInput[] = [
        {
          identifier: note.id,
          content_hash: currentNote.content_hash
          // No content or metadata - should fail
        }
      ];

      const result: BatchUpdateResult =
        await context.noteManager.batchUpdateNotes(updates);

      assert.strictEqual(result.successful, 0);
      assert.strictEqual(result.failed, 1);

      const failedResult = result.results[0];
      assert(!failedResult.success);
      assert(failedResult.error);
      assert(failedResult.error.includes('Either content or metadata must be provided'));
    });

    test('should handle empty batch updates', async () => {
      const result: BatchUpdateResult = await context.noteManager.batchUpdateNotes([]);

      assert.strictEqual(result.total, 0);
      assert.strictEqual(result.successful, 0);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(result.results.length, 0);
    });
  });

  describe('Mixed Batch Operations', () => {
    test('should handle large batches efficiently', async () => {
      const largeCreateBatch: BatchCreateNoteInput[] = [];
      for (let i = 1; i <= 50; i++) {
        largeCreateBatch.push({
          type: 'general',
          title: `Bulk Note ${i}`,
          content: `Content for note ${i}`,
          metadata: {
            sequence: i,
            batch: 'large-test'
          }
        });
      }

      const createResult: BatchCreateResult =
        await context.noteManager.batchCreateNotes(largeCreateBatch);

      assert.strictEqual(createResult.total, 50);
      assert.strictEqual(createResult.successful, 50);
      assert.strictEqual(createResult.failed, 0);

      // Now update half of them - first get their content hashes
      const updateBatch: BatchUpdateNoteInput[] = [];
      for (let i = 0; i < 25; i++) {
        const noteId = createResult.results[i].result!.id;
        const currentNote = await context.noteManager.getNote(noteId);
        assert(currentNote?.content_hash, `Note ${noteId} should have content hash`);

        updateBatch.push({
          identifier: noteId,
          content: `Updated content for note ${i + 1}`,
          metadata: {
            sequence: i + 1,
            batch: 'large-test',
            processed: true
          },
          content_hash: currentNote.content_hash
        });
      }

      const updateResult: BatchUpdateResult =
        await context.noteManager.batchUpdateNotes(updateBatch);

      assert.strictEqual(updateResult.total, 25);
      assert.strictEqual(updateResult.successful, 25);
      assert.strictEqual(updateResult.failed, 0);
    });

    test('should maintain transaction-like behavior for individual operations', async () => {
      // Even if some operations fail, successful ones should complete
      const mixedBatch: BatchCreateNoteInput[] = [
        {
          type: 'general',
          title: 'Transaction Test 1',
          content: 'This should succeed'
        },
        {
          type: 'invalid/type',
          title: 'Transaction Test 2',
          content: 'This should fail'
        },
        {
          type: 'general',
          title: 'Transaction Test 3',
          content: 'This should also succeed'
        }
      ];

      const result: BatchCreateResult =
        await context.noteManager.batchCreateNotes(mixedBatch);

      assert.strictEqual(result.successful, 2);
      assert.strictEqual(result.failed, 1);

      // Verify the successful notes actually exist
      const successfulResults = result.results.filter(r => r.success);
      for (const successResult of successfulResults) {
        const note = await context.noteManager.getNote(successResult.result!.id);
        assert(note);
        assert(note.title.includes('Transaction Test'));
      }
    });
  });
});
