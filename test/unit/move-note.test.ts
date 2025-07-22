/**
 * Unit tests for the move_note operation
 * Tests the core moveNote functionality in NoteManager
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import { Workspace } from '../../src/core/workspace.js';
import { NoteManager, type MoveNoteResult } from '../../src/core/notes.js';
import { NoteTypeManager } from '../../src/core/note-types.js';
import { HybridSearchManager } from '../../src/database/search-manager.js';

describe('move_note unit tests', () => {
  let tempDir: string;
  let workspace: Workspace;
  let noteManager: NoteManager;
  let searchManager: HybridSearchManager;

  before(async () => {
    // Create temporary directory for testing
    tempDir = await mkdtemp(join(tmpdir(), 'flint-note-move-test-'));

    // Initialize workspace and managers
    workspace = new Workspace(tempDir);
    await workspace.initialize();

    searchManager = new HybridSearchManager(tempDir);
    noteManager = new NoteManager(workspace, searchManager);

    // Create required note types for testing
    const noteTypeManager = new NoteTypeManager(workspace);
    await noteTypeManager.createNoteType(
      'completed',
      'Completed items',
      ['Track completed projects and tasks'],
      undefined
    );
  });

  after(async () => {
    // Clean up temporary directory
    await searchManager?.close();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should move a note from one type to another successfully', async () => {
    // Create a note in the 'projects' type
    const originalNote = await noteManager.createNote(
      'projects',
      'My Test Project',
      '# My Test Project\n\nThis is a project note that needs to be archived.',
      { priority: 'high', status: 'active' }
    );

    // Get the note to obtain content hash
    const noteBeforeMove = await noteManager.getNote(originalNote.id);
    assert.ok(noteBeforeMove, 'Note should exist before move');

    const originalContentHash = noteBeforeMove.content_hash;
    const originalContent = noteBeforeMove.content;
    const originalTitle = noteBeforeMove.title;

    // Move the note from 'projects' to 'completed'
    const moveResult: MoveNoteResult = await noteManager.moveNote(
      originalNote.id,
      'completed',
      originalContentHash
    );

    // Verify move result
    assert.strictEqual(moveResult.success, true);
    assert.strictEqual(moveResult.old_id, originalNote.id);
    assert.strictEqual(moveResult.new_id, 'completed/my-test-project');
    assert.strictEqual(moveResult.old_type, 'projects');
    assert.strictEqual(moveResult.new_type, 'completed');
    assert.strictEqual(moveResult.filename, 'my-test-project.md');
    assert.strictEqual(moveResult.title, originalTitle);
    assert.ok(moveResult.timestamp);

    // Verify original note no longer exists
    const originalExists = await noteManager.getNote(originalNote.id);
    assert.strictEqual(originalExists, null);

    // Verify note exists in new location
    const movedNote = await noteManager.getNote(moveResult.new_id);
    assert.ok(movedNote, 'Note should exist in new location');
    assert.strictEqual(movedNote.type, 'completed');
    assert.strictEqual(movedNote.title, originalTitle);
    assert.strictEqual(movedNote.content, originalContent);

    // Verify metadata was preserved except for type field
    assert.strictEqual(movedNote.metadata.priority, 'high');
    assert.strictEqual(movedNote.metadata.status, 'active');
    assert.strictEqual(movedNote.metadata.type, 'completed'); // Updated to new type
  });

  it('should require content_hash parameter', async () => {
    const uniqueTitle = `Test Note ${Date.now()}`;
    const note = await noteManager.createNote('general', uniqueTitle, 'Content');

    await assert.rejects(
      async () => {
        // @ts-expect-error - Testing missing content_hash
        await noteManager.moveNote(note.id, 'projects');
      },
      (error: Error) => {
        return (
          error.message.includes('content_hash is required') ||
          error.message.includes('content hash') ||
          error.message.includes('required')
        );
      }
    );
  });

  it('should validate content_hash for optimistic locking', async () => {
    const uniqueTitle = `Test Note ${Date.now()}`;
    const note = await noteManager.createNote('general', uniqueTitle, 'Content');

    await assert.rejects(
      async () => {
        await noteManager.moveNote(note.id, 'projects', 'invalid-hash');
      },
      (error: Error) => {
        return (
          error.message.includes('content hash') ||
          error.message.includes('mismatch') ||
          error.message.includes('modified')
        );
      }
    );
  });

  it('should fail if note does not exist', async () => {
    await assert.rejects(
      async () => {
        await noteManager.moveNote('general/non-existent.md', 'projects', 'any-hash');
      },
      (error: Error) => {
        return error.message.includes('not found');
      }
    );
  });

  it('should fail if target note type does not exist', async () => {
    const uniqueTitle = `Test Note ${Date.now()}`;
    const note = await noteManager.createNote('general', uniqueTitle, 'Content');
    const noteData = await noteManager.getNote(note.id);

    await assert.rejects(
      async () => {
        await noteManager.moveNote(note.id, 'nonexistent-type', noteData!.content_hash);
      },
      (error: Error) => {
        return (
          error.message.includes('does not exist') ||
          error.message.includes('Invalid note type name')
        );
      }
    );
  });

  it('should fail if note already in target type', async () => {
    const uniqueTitle = `Test Note ${Date.now()}`;
    const note = await noteManager.createNote('general', uniqueTitle, 'Content');
    const noteData = await noteManager.getNote(note.id);

    await assert.rejects(
      async () => {
        await noteManager.moveNote(note.id, 'general', noteData!.content_hash);
      },
      (error: Error) => {
        return error.message.includes("already in note type 'general'");
      }
    );
  });

  it('should fail if target filename conflicts', async () => {
    const baseTitle = `Test Note ${Date.now()}`;

    // Create a note in 'general'
    const note1 = await noteManager.createNote('general', baseTitle, 'Content 1');

    // Create a note in 'projects' with same title (same filename pattern)
    await noteManager.createNote('projects', baseTitle, 'Content 2');

    const noteData = await noteManager.getNote(note1.id);

    await assert.rejects(
      async () => {
        await noteManager.moveNote(note1.id, 'projects', noteData!.content_hash);
      },
      (error: Error) => {
        return (
          error.message.includes('already exists') || error.message.includes('overwrite')
        );
      }
    );
  });

  it('should preserve all metadata except type field', async () => {
    const originalMetadata = {
      priority: 'high',
      status: 'in-progress',
      tags: ['important', 'urgent'],
      deadline: '2024-12-31',
      author: 'test-user'
    };

    const note = await noteManager.createNote(
      'projects',
      'Complex Project',
      'Complex content',
      originalMetadata
    );

    const noteBeforeMove = await noteManager.getNote(note.id);
    const moveResult = await noteManager.moveNote(
      note.id,
      'completed',
      noteBeforeMove!.content_hash
    );

    const movedNote = await noteManager.getNote(moveResult.new_id);

    // Verify all original metadata is preserved
    assert.strictEqual(movedNote!.metadata.priority, 'high');
    assert.strictEqual(movedNote!.metadata.status, 'in-progress');
    assert.deepStrictEqual(movedNote!.metadata.tags, ['important', 'urgent']);
    assert.strictEqual(movedNote!.metadata.deadline, '2024-12-31');
    assert.strictEqual(movedNote!.metadata.author, 'test-user');

    // Verify type was updated
    assert.strictEqual(movedNote!.metadata.type, 'completed');
    assert.strictEqual(movedNote!.type, 'completed');
  });

  it('should update search index correctly', async () => {
    const uniqueTitle = `Search Test Note ${Date.now()}`;
    const note = await noteManager.createNote(
      'general',
      uniqueTitle,
      'Searchable content for testing'
    );

    const noteBeforeMove = await noteManager.getNote(note.id);

    // Verify note is found in search with original type
    const searchBefore = await noteManager.searchNotes({
      query: 'Searchable content',
      type_filter: 'general'
    });
    assert.ok(searchBefore.length >= 1);
    assert.ok(searchBefore.some(result => result.id === note.id));

    // Move the note
    const moveResult = await noteManager.moveNote(
      note.id,
      'projects',
      noteBeforeMove!.content_hash
    );

    // Verify note is no longer found under old type
    const searchOldType = await noteManager.searchNotes({
      query: 'Searchable content',
      type_filter: 'general'
    });
    assert.ok(!searchOldType.some(result => result.id === note.id));

    // Verify note is found under new type
    const searchNewType = await noteManager.searchNotes({
      query: 'Searchable content',
      type_filter: 'projects'
    });
    assert.ok(searchNewType.length >= 1);
    assert.ok(searchNewType.some(result => result.id === moveResult.new_id));
  });
});
