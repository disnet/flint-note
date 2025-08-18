/**
 * Tests for FlintNoteApi - Direct programmatic access
 *
 * Tests basic functionality of the direct API without MCP protocol overhead.
 * Covers initialization, note operations, and error handling patterns.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { FlintNoteApi } from '../../src/api/flint-note-api.js';
import { createTempDirName } from './helpers/test-utils.ts';

describe('FlintNoteApi', () => {
  let api: FlintNoteApi;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = createTempDirName('api-test');
    await fs.mkdir(tempDir, { recursive: true });

    api = new FlintNoteApi({
      workspacePath: tempDir,
      throwOnError: true
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup test directory:', error);
    }
  });

  describe('Initialization', () => {
    test('should require initialization before use', async () => {
      const uninitializedApi = new FlintNoteApi({ workspacePath: tempDir });

      await assert.rejects(
        async () => await uninitializedApi.getNote('test'),
        /FlintNoteApi must be initialized before use/
      );
    });

    test('should initialize successfully', async () => {
      await assert.doesNotReject(async () => {
        await api.initialize();
      });
    });

    test('should allow multiple initialization calls', async () => {
      await api.initialize();
      await assert.doesNotReject(async () => {
        await api.initialize(); // Should not throw
      });
    });
  });

  describe('Note Operations', () => {
    beforeEach(async () => {
      await api.initialize();
    });

    test('should create and retrieve a simple note', async () => {
      const noteContent = '# Test Note\n\nThis is a test note.';

      // Create note - returns pure NoteInfo
      const createResult = await api.createNote({
        type: 'general',
        title: 'test-note',
        content: noteContent
      });
      assert.ok(createResult);
      assert.ok(createResult.id);
      assert.ok(createResult.type);
      assert.ok(createResult.title);
      assert.ok(createResult.filename);
      assert.ok(createResult.path);
      assert.ok(createResult.created);

      // Retrieve note - returns pure Note object
      const note = await api.getNote('general/test-note.md');
      assert.ok(note);
      assert.ok(note.content);
      assert.ok(note.content.includes('Test Note'));
    });

    test('should create notes with batch API', async () => {
      const result = await api.createNotes({
        notes: [
          {
            type: 'general',
            title: 'detailed-note',
            content: '# Detailed Note\n\nWith metadata and structure.',
            metadata: {
              priority: 'high',
              tags: ['test', 'api']
            }
          }
        ]
      });

      // result is NoteInfo[] for batch creation
      assert.ok(result);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
      assert.ok(result[0].id);
      assert.ok(result[0].type);
      assert.ok(result[0].title);

      const note = await api.getNote('general/detailed-note.md');
      assert.ok(note);
      assert.ok(note.content.includes('Detailed Note'));
    });

    test('should get note by identifier', async () => {
      // Create initial note
      await api.createNote({
        type: 'general',
        title: 'info-test',
        content: 'Test content for info'
      });

      // Get note directly
      const note = await api.getNote('general/info-test.md');
      assert.ok(note);
      assert.ok(note.content);
      assert.ok(note.content.includes('Test content for info'));
    });

    test('should handle non-existent note gracefully', async () => {
      const note = await api.getNote('general/non-existent-note.md');
      // getNote returns null for non-existent notes
      assert.equal(note, null);
    });
  });

  describe('List Operations', () => {
    beforeEach(async () => {
      await api.initialize();
    });

    test('should list notes', async () => {
      // Create some test notes first
      await api.createNote({
        type: 'general',
        title: 'list-test-1',
        content: 'First note'
      });
      await api.createNote({
        type: 'general',
        title: 'list-test-2',
        content: 'Second note'
      });

      // List notes by type - returns NoteListItem[]
      const notes = await api.listNotes({ typeName: 'general' });
      assert.ok(notes);
      assert.ok(Array.isArray(notes));
    });

    test('should list notes with limit', async () => {
      // Create some test notes first
      await api.createNote({
        type: 'general',
        title: 'limit-test-1',
        content: 'First note'
      });
      await api.createNote({
        type: 'general',
        title: 'limit-test-2',
        content: 'Second note'
      });

      // List with limit
      const notes = await api.listNotes({ typeName: 'general', limit: 1 });
      assert.ok(notes);
      assert.ok(Array.isArray(notes));
    });
  });

  describe('Update Operations', () => {
    beforeEach(async () => {
      await api.initialize();
    });

    test('should update note content', async () => {
      // Create initial note
      const createResult = await api.createNote({
        type: 'general',
        title: 'update-test',
        content: 'Original content'
      });
      assert.ok(createResult);

      // Get note to get content hash
      const note = await api.getNote('general/update-test.md');
      assert.ok(note);
      assert.ok(note.content_hash);

      // Update note - returns UpdateResult
      const updateResult = await api.updateNote({
        identifier: 'general/update-test.md',
        content: 'Updated content',
        contentHash: note.content_hash
      });
      assert.ok(updateResult);
      assert.ok(updateResult.id);
      assert.ok(updateResult.updated);
      assert.ok(updateResult.timestamp);

      // Verify update
      const updatedNote = await api.getNote('general/update-test.md');
      assert.ok(updatedNote);
      assert.ok(updatedNote.content.includes('Updated content'));
    });

    test('should update note with metadata', async () => {
      // Create initial note
      const createResult = await api.createNote({
        type: 'general',
        title: 'metadata-update-test',
        content: 'Original content'
      });
      assert.ok(createResult);

      // Get note to get content hash
      const note = await api.getNote('general/metadata-update-test.md');
      assert.ok(note);
      assert.ok(note.content_hash);

      // Update note with metadata - returns UpdateResult
      const updateResult = await api.updateNote({
        identifier: 'general/metadata-update-test.md',
        content: 'Updated content with metadata',
        contentHash: note.content_hash,
        metadata: { priority: 'high', tags: ['updated', 'test'] }
      });
      assert.ok(updateResult);
      assert.ok(updateResult.id);
      assert.ok(updateResult.updated);
      assert.ok(updateResult.timestamp);

      // Verify update
      const updatedNote = await api.getNote('general/metadata-update-test.md');
      assert.ok(updatedNote);
      assert.ok(updatedNote.content.includes('Updated content with metadata'));
      assert.ok(updatedNote.metadata.priority === 'high');
      assert.ok(Array.isArray(updatedNote.metadata.tags));
      assert.ok(updatedNote.metadata.tags.includes('updated'));
      assert.ok(updatedNote.metadata.tags.includes('test'));
    });

    test('should update multiple notes with batch API', async () => {
      // Create initial notes
      const createResult1 = await api.createNote({
        type: 'general',
        title: 'batch-update-test-1',
        content: 'Original content 1'
      });
      const createResult2 = await api.createNote({
        type: 'general',
        title: 'batch-update-test-2',
        content: 'Original content 2'
      });
      assert.ok(createResult1);
      assert.ok(createResult2);

      // Get notes to get content hashes
      const note1 = await api.getNote('general/batch-update-test-1.md');
      const note2 = await api.getNote('general/batch-update-test-2.md');
      assert.ok(note1);
      assert.ok(note2);
      assert.ok(note1.content_hash);
      assert.ok(note2.content_hash);

      // Update multiple notes - returns BatchUpdateResult
      const batchResult = await api.updateNotes({
        notes: [
          {
            identifier: 'general/batch-update-test-1.md',
            content: 'Updated batch content 1',
            contentHash: note1.content_hash,
            metadata: { status: 'updated', priority: 'high' }
          },
          {
            identifier: 'general/batch-update-test-2.md',
            content: 'Updated batch content 2',
            contentHash: note2.content_hash,
            metadata: { status: 'updated', priority: 'medium' }
          }
        ]
      });

      assert.ok(batchResult);
      assert.equal(batchResult.total, 2);
      assert.equal(batchResult.successful, 2);
      assert.equal(batchResult.failed, 0);
      assert.ok(Array.isArray(batchResult.results));
      assert.equal(batchResult.results.length, 2);

      // Verify both updates succeeded
      assert.ok(batchResult.results[0].success);
      assert.ok(batchResult.results[1].success);
      assert.ok(batchResult.results[0].result?.updated);
      assert.ok(batchResult.results[1].result?.updated);

      // Verify updates
      const updatedNote1 = await api.getNote('general/batch-update-test-1.md');
      const updatedNote2 = await api.getNote('general/batch-update-test-2.md');
      assert.ok(updatedNote1);
      assert.ok(updatedNote2);
      assert.ok(updatedNote1.content.includes('Updated batch content 1'));
      assert.ok(updatedNote2.content.includes('Updated batch content 2'));
      assert.ok(updatedNote1.metadata.status === 'updated');
      assert.ok(updatedNote2.metadata.status === 'updated');
      assert.ok(updatedNote1.metadata.priority === 'high');
      assert.ok(updatedNote2.metadata.priority === 'medium');
    });
  });

  describe('Delete Operations', () => {
    beforeEach(async () => {
      await api.initialize();
    });

    test('should delete note', async () => {
      // Create note to delete
      await api.createNote({
        type: 'general',
        title: 'delete-test',
        content: 'Content to be deleted'
      });

      // Delete note - returns DeleteNoteResult
      const deleteResult = await api.deleteNote({ identifier: 'general/delete-test.md' });
      assert.ok(deleteResult);
      assert.ok(deleteResult.id);
      assert.ok(deleteResult.deleted);
      assert.ok(deleteResult.timestamp);

      // Verify deletion
      const deletedNote = await api.getNote('general/delete-test.md');
      assert.equal(deletedNote, null);
    });
  });

  describe('Convenience Methods', () => {
    beforeEach(async () => {
      await api.initialize();
    });

    test('should create simple note with convenience method', async () => {
      const result = await api.createNote({
        type: 'general',
        title: 'convenience-test',
        content: 'Content created via convenience method'
      });

      // Returns pure NoteInfo
      assert.ok(result);
      assert.ok(result.id);
      assert.ok(result.type);
      assert.ok(result.title);
      assert.ok(result.filename);
      assert.ok(result.path);
      assert.ok(result.created);

      const note = await api.getNote('general/convenience-test.md');
      assert.ok(note);
      assert.ok(note.content.includes('convenience method'));
    });

    test('should create multiple notes with convenience method', async () => {
      await api.createNote({
        type: 'general',
        title: 'convenience-1',
        content: 'First note'
      });
      await api.createNote({
        type: 'general',
        title: 'convenience-2',
        content: 'Second note'
      });

      const note1 = await api.getNote('general/convenience-1.md');
      const note2 = await api.getNote('general/convenience-2.md');

      assert.ok(note1);
      assert.ok(note2);
      assert.ok(note1.content);
      assert.ok(note2.content);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await api.initialize();
    });

    test('should handle invalid note type gracefully', async () => {
      // Most implementations will create the note type if it doesn't exist
      // or handle it gracefully, so we test that it doesn't crash
      await assert.doesNotReject(async () => {
        await api.createNote({
          type: 'nonexistent-type',
          title: 'test',
          content: 'content'
        });
      });
    });

    test('should provide basic API structure', async () => {
      // Just verify the API has the expected methods
      assert.ok(typeof api.createNote === 'function');
      assert.ok(typeof api.getNote === 'function');
      assert.ok(typeof api.updateNote === 'function');
      assert.ok(typeof api.deleteNote === 'function');
      assert.ok(typeof api.listNotes === 'function');
    });
  });
});
