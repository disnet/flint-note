/**
 * Get Notes Tests
 *
 * Comprehensive tests for the get_notes functionality including
 * batch retrieval, error handling, performance, and edge cases.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';

import {
  createTestWorkspace,
  cleanupTestWorkspace,
  createTestNotes,
  createTestNotesWithMetadata,
  createTestNoteTypes,
  TEST_CONSTANTS,
  type TestContext
} from './helpers/test-utils.ts';

describe('Get Notes', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('get-notes-test');
    await createTestNoteTypes(context);
    await createTestNotes(context);
    await createTestNotesWithMetadata(context);
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  describe('Basic Batch Retrieval', () => {
    test('should retrieve multiple notes successfully', async () => {
      // Create multiple notes
      const note1 = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'First Note',
        'Content of first note'
      );
      const note2 = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Second Note',
        'Content of second note'
      );
      const note3 = await context.noteManager.createNote(
        'project',
        'Project Note',
        'Content of project note'
      );

      // Retrieve all notes
      const results = await context.noteManager.getNotes([note1.id, note2.id, note3.id]);

      assert.strictEqual(
        results.length,
        3,
        'Should return results for all requested notes'
      );

      // Check all are successful
      results.forEach((result, index) => {
        assert.strictEqual(result.success, true, `Result ${index} should be successful`);
        assert.ok(result.note, `Result ${index} should have a note`);
        assert.ok(result.note!.content_hash, `Result ${index} should have content hash`);
      });

      // Check specific note properties
      const firstResult = results.find(r => r.note?.id === note1.id);
      assert.ok(firstResult, 'Should find first note in results');
      assert.strictEqual(firstResult.note!.title, 'First Note');
      assert.strictEqual(firstResult.note!.content, 'Content of first note');

      const projectResult = results.find(r => r.note?.id === note3.id);
      assert.ok(projectResult, 'Should find project note in results');
      assert.strictEqual(projectResult.note!.type, 'project');
    });

    test('should handle empty identifiers array', async () => {
      const results = await context.noteManager.getNotes([]);
      assert.strictEqual(results.length, 0, 'Should return empty array for empty input');
    });

    test('should handle single note retrieval', async () => {
      const note = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Single Note',
        'Content of single note'
      );

      const results = await context.noteManager.getNotes([note.id]);

      assert.strictEqual(results.length, 1, 'Should return one result');
      assert.strictEqual(results[0].success, true, 'Should be successful');
      assert.strictEqual(results[0].note!.id, note.id, 'Should have correct note ID');
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent notes gracefully', async () => {
      const note = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Existing Note',
        'Content of existing note'
      );

      const results = await context.noteManager.getNotes([
        note.id,
        'non-existent/note.md',
        'another/missing.md'
      ]);

      assert.strictEqual(
        results.length,
        3,
        'Should return results for all requested notes'
      );

      // First should be successful
      assert.strictEqual(results[0].success, true, 'First result should be successful');
      assert.ok(results[0].note, 'First result should have a note');

      // Others should fail
      assert.strictEqual(results[1].success, false, 'Second result should fail');
      assert.ok(results[1].error, 'Second result should have error message');
      assert.ok(
        results[1].error!.includes('Note not found'),
        'Should have appropriate error message'
      );

      assert.strictEqual(results[2].success, false, 'Third result should fail');
      assert.ok(results[2].error, 'Third result should have error message');
    });

    test('should handle partial failures without affecting successes', async () => {
      const note1 = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Valid Note 1',
        'Content 1'
      );
      const note2 = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Valid Note 2',
        'Content 2'
      );

      const results = await context.noteManager.getNotes([
        note1.id,
        'invalid/note.md',
        note2.id,
        'another/invalid.md'
      ]);

      assert.strictEqual(results.length, 4, 'Should return results for all requests');

      // Check successes
      assert.strictEqual(results[0].success, true, 'First should succeed');
      assert.strictEqual(results[2].success, true, 'Third should succeed');

      // Check failures
      assert.strictEqual(results[1].success, false, 'Second should fail');
      assert.strictEqual(results[3].success, false, 'Fourth should fail');
    });

    test('should handle invalid identifiers', async () => {
      const results = await context.noteManager.getNotes([
        '',
        'invalid-format',
        '../../../etc/passwd',
        'valid/note.md'
      ]);

      assert.strictEqual(results.length, 4, 'Should return results for all requests');

      // All should fail for various reasons
      results.forEach((result, index) => {
        assert.strictEqual(result.success, false, `Result ${index} should fail`);
        assert.ok(result.error, `Result ${index} should have error message`);
      });
    });
  });

  describe('Content and Metadata Handling', () => {
    test('should preserve all metadata in batch retrieval', async () => {
      // Create note with rich metadata
      const noteContent = `---
title: "Rich Metadata Note"
tags: ["test", "metadata"]
priority: high
custom_field: "custom_value"
---

# Rich Metadata Note

This note has extensive metadata.`;

      const noteId = `${TEST_CONSTANTS.NOTE_TYPES.DEFAULT}/rich-metadata.md`;
      await fs.writeFile(
        context.workspace.getNotePath(
          TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
          'rich-metadata.md'
        ),
        noteContent
      );

      const results = await context.noteManager.getNotes([noteId]);

      assert.strictEqual(results.length, 1, 'Should return one result');
      assert.strictEqual(results[0].success, true, 'Should be successful');

      const note = results[0].note!;
      assert.strictEqual(note.title, 'Rich Metadata Note');
      assert.deepStrictEqual(note.metadata.tags, ['test', 'metadata']);
      assert.strictEqual(note.metadata.priority, 'high');
      assert.strictEqual(note.metadata.custom_field, 'custom_value');
    });

    test('should include content hash for optimistic locking', async () => {
      const note = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Hash Test Note',
        'Content for hash testing'
      );

      const results = await context.noteManager.getNotes([note.id]);

      assert.strictEqual(results[0].success, true, 'Should be successful');
      assert.ok(results[0].note!.content_hash, 'Should have content hash');
      assert.ok(
        results[0].note!.content_hash.startsWith('sha256:'),
        'Should be SHA256 hash'
      );
    });

    test('should handle notes from different types', async () => {
      const dailyNote = await context.noteManager.createNote(
        'daily',
        'Daily Entry',
        'Daily content'
      );
      const projectNote = await context.noteManager.createNote(
        'project',
        'Project Plan',
        'Project content'
      );
      const generalNote = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'General Note',
        'General content'
      );

      const results = await context.noteManager.getNotes([
        dailyNote.id,
        projectNote.id,
        generalNote.id
      ]);

      assert.strictEqual(results.length, 3, 'Should return all notes');

      results.forEach(result => {
        assert.strictEqual(result.success, true, 'All should be successful');
      });

      // Check types are preserved
      const types = results.map(r => r.note!.type);
      assert.ok(types.includes('daily'), 'Should include daily note');
      assert.ok(types.includes('project'), 'Should include project note');
      assert.ok(
        types.includes(TEST_CONSTANTS.NOTE_TYPES.DEFAULT),
        'Should include general note'
      );
    });
  });

  describe('Performance and Concurrency', () => {
    test('should handle large batch retrieval efficiently', async () => {
      // Create 50 notes
      const noteIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const note = await context.noteManager.createNote(
          TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
          `Batch Note ${i}`,
          `Content for note ${i}`
        );
        noteIds.push(note.id);
      }

      const startTime = Date.now();
      const results = await context.noteManager.getNotes(noteIds);
      const endTime = Date.now();

      assert.strictEqual(results.length, 50, 'Should return all 50 notes');

      // All should be successful
      results.forEach((result, index) => {
        assert.strictEqual(result.success, true, `Note ${index} should be successful`);
      });

      // Performance check - should complete in reasonable time
      const duration = endTime - startTime;
      assert.ok(
        duration < 5000,
        `Should complete in under 5 seconds (took ${duration}ms)`
      );
    });

    test('should handle concurrent batch retrievals', async () => {
      // Create test notes
      const noteIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const note = await context.noteManager.createNote(
          TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
          `Concurrent Note ${i}`,
          `Content ${i}`
        );
        noteIds.push(note.id);
      }

      // Run multiple concurrent batch retrievals
      const promises = Array.from({ length: 5 }, (_, i) =>
        context.noteManager.getNotes(noteIds.slice(i * 2, (i + 1) * 2))
      );

      const allResults = await Promise.all(promises);

      // Verify all concurrent operations succeeded
      allResults.forEach((results, batchIndex) => {
        results.forEach((result, noteIndex) => {
          assert.strictEqual(
            result.success,
            true,
            `Batch ${batchIndex}, note ${noteIndex} should be successful`
          );
        });
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle duplicate identifiers', async () => {
      const note = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Duplicate Test',
        'Content'
      );

      const results = await context.noteManager.getNotes([note.id, note.id, note.id]);

      assert.strictEqual(results.length, 3, 'Should return result for each request');

      results.forEach((result, index) => {
        assert.strictEqual(result.success, true, `Result ${index} should be successful`);
        assert.strictEqual(
          result.note!.id,
          note.id,
          `Result ${index} should have correct ID`
        );
      });
    });

    test('should handle very long identifier lists', async () => {
      // Create a few valid notes
      const validNotes = await Promise.all([
        context.noteManager.createNote(
          TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
          'Valid 1',
          'Content 1'
        ),
        context.noteManager.createNote(
          TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
          'Valid 2',
          'Content 2'
        )
      ]);

      // Create a long list with mostly invalid identifiers
      const longList = [
        ...validNotes.map(n => n.id),
        ...Array.from({ length: 100 }, (_, i) => `invalid/note-${i}.md`)
      ];

      const results = await context.noteManager.getNotes(longList);

      assert.strictEqual(results.length, 102, 'Should return result for each identifier');

      // First two should succeed
      assert.strictEqual(results[0].success, true, 'First should succeed');
      assert.strictEqual(results[1].success, true, 'Second should succeed');

      // Rest should fail
      for (let i = 2; i < results.length; i++) {
        assert.strictEqual(results[i].success, false, `Result ${i} should fail`);
      }
    });

    test('should handle notes with special characters', async () => {
      const specialNote = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Special Characters: éñ中文🚀',
        'Content with special chars: éñ中文🚀\n\nAnd unicode: 🎉'
      );

      const results = await context.noteManager.getNotes([specialNote.id]);

      assert.strictEqual(results.length, 1, 'Should return one result');
      assert.strictEqual(results[0].success, true, 'Should be successful');
      assert.strictEqual(results[0].note!.title, 'Special Characters: éñ中文🚀');
      assert.ok(
        results[0].note!.content.includes('🎉'),
        'Should preserve unicode in content'
      );
    });
  });

  describe('Integration with File System', () => {
    test('should handle files modified outside the system', async () => {
      const note = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'External Mod Test',
        'Original content'
      );

      // Modify file directly
      const notePath = context.noteManager.parseNoteIdentifier(note.id).notePath;
      await fs.writeFile(notePath, 'Modified content outside system');

      const results = await context.noteManager.getNotes([note.id]);

      assert.strictEqual(results.length, 1, 'Should return one result');
      assert.strictEqual(results[0].success, true, 'Should be successful');
      assert.strictEqual(results[0].note!.content, 'Modified content outside system');
    });

    test('should handle files deleted outside the system', async () => {
      const note = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Deletion Test',
        'Content'
      );

      // Delete file directly
      const notePath = context.noteManager.parseNoteIdentifier(note.id).notePath;
      await fs.unlink(notePath);

      const results = await context.noteManager.getNotes([note.id]);

      assert.strictEqual(results.length, 1, 'Should return one result');
      assert.strictEqual(results[0].success, false, 'Should fail for deleted file');
      assert.ok(results[0].error, 'Should have error message');
    });
  });

  describe('Content Hash Consistency', () => {
    test('should generate consistent content hashes across batch retrievals', async () => {
      const note = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Hash Consistency Test',
        'Content for consistency testing'
      );

      // Get the note multiple times
      const results1 = await context.noteManager.getNotes([note.id]);
      const results2 = await context.noteManager.getNotes([note.id]);
      const singleResult = await context.noteManager.getNote(note.id);

      assert.strictEqual(results1[0].success, true, 'First batch should succeed');
      assert.strictEqual(results2[0].success, true, 'Second batch should succeed');
      assert.ok(singleResult, 'Single retrieval should succeed');

      // All content hashes should be identical
      const hash1 = results1[0].note!.content_hash;
      const hash2 = results2[0].note!.content_hash;
      const hash3 = singleResult.content_hash;

      assert.strictEqual(hash1, hash2, 'Batch hashes should be identical');
      assert.strictEqual(hash1, hash3, 'Batch and single hashes should be identical');
    });
  });
});
