/**
 * Tests for FlintNoteApi note operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from './test-setup.js';

describe('FlintNoteApi - Note Operations', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();

    // Create a test vault for note operations
    testVaultId = await testSetup.createTestVault('test-notes-vault');
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('createNote', () => {
    it('should create a simple note with basic content', async () => {
      const noteOptions = {
        type: 'general',
        title: 'Test Note',
        content: 'This is a test note content.',
        vaultId: testVaultId
      };

      const createdNote = await testSetup.api.createNote(noteOptions);

      expect(createdNote).toBeDefined();
      expect(createdNote.title).toBe(noteOptions.title);
      expect(createdNote.type).toBe(noteOptions.type);
      expect(createdNote.id).toBeDefined();
      expect(createdNote.filename).toBe('test-note.md');
      expect(createdNote.created).toBeDefined();
    });

    it('should create a note with metadata', async () => {
      const noteOptions = {
        type: 'general',
        title: 'Note with Metadata',
        content: 'This note has metadata.',
        metadata: {
          tags: ['test', 'metadata'],
          priority: 'high',
          author: 'test-user'
        },
        vaultId: testVaultId
      };

      const createdNote = await testSetup.api.createNote(noteOptions);

      expect(createdNote).toBeDefined();
      expect(createdNote.title).toBe(noteOptions.title);
      expect(createdNote.type).toBe(noteOptions.type);
      expect(createdNote.id).toBeDefined();
      expect(createdNote.filename).toBe('note-with-metadata.md');

      // To verify metadata, we need to get the full note
      const fullNote = await testSetup.api.getNote(testVaultId, createdNote.id);
      expect(fullNote?.content).toBe(noteOptions.content);
      expect(fullNote?.metadata?.tags).toEqual(['test', 'metadata']);
      expect(fullNote?.metadata?.priority).toBe('high');
      expect(fullNote?.metadata?.author).toBe('test-user');
    });

    it('should handle special characters in note title', async () => {
      const noteOptions = {
        type: 'general',
        title: 'Special Characters: @#$%^&*()_+-=[]{}|;:,.<>?',
        content: 'Testing special characters in title.',
        vaultId: testVaultId
      };

      const createdNote = await testSetup.api.createNote(noteOptions);

      expect(createdNote).toBeDefined();
      expect(createdNote.title).toBe(noteOptions.title);
    });
  });

  describe('getNote', () => {
    it('should retrieve a created note by identifier', async () => {
      // First create a note
      const noteOptions = {
        type: 'general',
        title: 'Retrievable Note',
        content: 'This note should be retrievable.',
        vaultId: testVaultId
      };

      const createdNote = await testSetup.api.createNote(noteOptions);

      // Use the ID from the created note
      const retrievedNote = await testSetup.api.getNote(testVaultId, createdNote.id);

      expect(retrievedNote).toBeDefined();
      expect(retrievedNote?.id).toBe(createdNote.id);
      expect(retrievedNote?.title).toBe(noteOptions.title);
      expect(retrievedNote?.content).toBe(noteOptions.content);
      expect(retrievedNote?.type).toBe(noteOptions.type);
    });

    it('should return null for non-existent note', async () => {
      const nonExistentIdentifier = 'general/NonExistentNote';

      const retrievedNote = await testSetup.api.getNote(
        testVaultId,
        nonExistentIdentifier
      );

      expect(retrievedNote).toBeNull();
    });
  });

  describe('updateNote', () => {
    it('should update note content', async () => {
      // Create a note first
      const noteOptions = {
        type: 'general',
        title: 'Updatable Note',
        content: 'Original content',
        vaultId: testVaultId
      };

      const createdNote = await testSetup.api.createNote(noteOptions);

      // Get the full note to get the content hash
      const fullNote = await testSetup.api.getNote(testVaultId, createdNote.id);
      expect(fullNote).toBeDefined();

      // Update the note
      const updateOptions = {
        identifier: createdNote.id,
        content: 'Updated content',
        contentHash: fullNote!.content_hash,
        vaultId: testVaultId
      };

      const updateResult = await testSetup.api.updateNote(updateOptions);

      expect(updateResult).toBeDefined();
      expect(updateResult.updated).toBe(true);

      // Verify the update by retrieving the note
      const updatedNote = await testSetup.api.getNote(testVaultId, createdNote.id);
      expect(updatedNote?.content).toBe('Updated content');
    });

    it('should update note content and metadata', async () => {
      // Create a note with metadata
      const noteOptions = {
        type: 'general',
        title: 'Note for Metadata Update',
        content: 'Original content',
        metadata: {
          tags: ['original'],
          priority: 'low'
        },
        vaultId: testVaultId
      };

      const createdNote = await testSetup.api.createNote(noteOptions);

      // Get the full note to get the content hash
      const fullNote = await testSetup.api.getNote(testVaultId, createdNote.id);
      expect(fullNote).toBeDefined();

      // Update both content and metadata
      const updateOptions = {
        identifier: createdNote.id,
        content: 'Updated content with metadata',
        contentHash: fullNote!.content_hash,
        metadata: {
          tags: ['updated', 'test'],
          priority: 'high',
          status: 'in-progress'
        },
        vaultId: testVaultId
      };

      const updateResult = await testSetup.api.updateNote(updateOptions);

      expect(updateResult.updated).toBe(true);

      // Verify the update
      const updatedNote = await testSetup.api.getNote(testVaultId, createdNote.id);
      expect(updatedNote?.content).toBe('Updated content with metadata');
      expect(updatedNote?.metadata?.tags).toEqual(['updated', 'test']);
      expect(updatedNote?.metadata?.priority).toBe('high');
      expect(updatedNote?.metadata?.status).toBe('in-progress');
    });
  });

  describe('deleteNote', () => {
    it('should delete an existing note', async () => {
      // Create a note first
      const noteOptions = {
        type: 'general',
        title: 'Note to Delete',
        content: 'This note will be deleted.',
        vaultId: testVaultId
      };

      const createdNote = await testSetup.api.createNote(noteOptions);

      // Verify the note exists
      const noteBeforeDelete = await testSetup.api.getNote(testVaultId, createdNote.id);
      expect(noteBeforeDelete).toBeDefined();

      // Delete the note
      const deleteResult = await testSetup.api.deleteNote({
        identifier: createdNote.id,
        confirm: true,
        vaultId: testVaultId
      });

      expect(deleteResult).toBeDefined();
      expect(deleteResult.deleted).toBe(true);

      // Verify the note is gone
      const noteAfterDelete = await testSetup.api.getNote(testVaultId, createdNote.id);
      expect(noteAfterDelete).toBeNull();
    });

    it('should handle deletion of non-existent note', async () => {
      const nonExistentIdentifier = 'general/non-existent-note';

      await expect(
        testSetup.api.deleteNote({
          identifier: nonExistentIdentifier,
          confirm: true,
          vaultId: testVaultId
        })
      ).rejects.toThrow(/does not exist/);
    });
  });

  describe('listNotes', () => {
    it('should list notes in a vault', async () => {
      // Create several notes
      const noteConfigs = [
        { type: 'general', title: 'First Note', content: 'First content' },
        { type: 'general', title: 'Second Note', content: 'Second content' },
        { type: 'task', title: 'A Task Note', content: 'Task content' }
      ];

      for (const config of noteConfigs) {
        await testSetup.api.createNote({
          ...config,
          vaultId: testVaultId
        });
      }

      // List all notes
      const allNotes = await testSetup.api.listNotes({
        vaultId: testVaultId
      });

      expect(allNotes).toBeDefined();
      expect(allNotes.length).toBeGreaterThanOrEqual(3);

      // Check that our created notes are in the list
      const notesByTitle = allNotes.reduce(
        (map, note) => {
          map[note.title] = note;
          return map;
        },
        {} as Record<string, import('../../../src/server/core/notes.js').NoteListItem>
      );

      expect(notesByTitle['First Note']).toBeDefined();
      expect(notesByTitle['Second Note']).toBeDefined();
      expect(notesByTitle['A Task Note']).toBeDefined();
    });

    it('should filter notes by type', async () => {
      // Create notes of different types
      await testSetup.api.createNote({
        type: 'general',
        title: 'General Note',
        content: 'General content',
        vaultId: testVaultId
      });

      await testSetup.api.createNote({
        type: 'task',
        title: 'Task Note',
        content: 'Task content',
        vaultId: testVaultId
      });

      // List only general notes
      const generalNotes = await testSetup.api.listNotes({
        typeName: 'general',
        vaultId: testVaultId
      });

      expect(generalNotes).toBeDefined();
      expect(generalNotes.every((note) => note.type === 'general')).toBe(true);

      // List only task notes
      const taskNotes = await testSetup.api.listNotes({
        typeName: 'task',
        vaultId: testVaultId
      });

      expect(taskNotes).toBeDefined();
      expect(taskNotes.every((note) => note.type === 'task')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      // Create multiple notes
      for (let i = 1; i <= 5; i++) {
        await testSetup.api.createNote({
          type: 'general',
          title: `Note ${i}`,
          content: `Content ${i}`,
          vaultId: testVaultId
        });
      }

      // List with a limit
      const limitedNotes = await testSetup.api.listNotes({
        limit: 3,
        vaultId: testVaultId
      });

      expect(limitedNotes).toBeDefined();
      expect(limitedNotes.length).toBeLessThanOrEqual(3);
    });
  });
});
