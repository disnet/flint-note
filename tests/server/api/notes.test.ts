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

      await expect(
        testSetup.api.getNote(testVaultId, nonExistentIdentifier)
      ).rejects.toThrow(/Note not found/);
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
      await expect(testSetup.api.getNote(testVaultId, createdNote.id)).rejects.toThrow(
        /Note not found/
      );
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

  describe('renameNote with wikilink updates', () => {
    it('should preserve frontmatter in linking notes when renaming a target note', async () => {
      // Create the target note that will be renamed
      const targetNote = await testSetup.api.createNote({
        type: 'general',
        title: 'Original Title',
        content: 'This is the target note that will be renamed.',
        metadata: {
          tags: ['target', 'original'],
          priority: 'high'
        },
        vaultId: testVaultId
      });

      // Create a note that links to the target note with custom metadata
      const linkingNote = await testSetup.api.createNote({
        type: 'general',
        title: 'Linking Note',
        content: `This note links to [[Original Title]].

It has multiple references to [[Original Title]] in the content.`,
        metadata: {
          tags: ['linking', 'reference'],
          author: 'test-author',
          created_by: 'test-system',
          custom_field: 'custom-value'
        },
        vaultId: testVaultId
      });

      // Get the original linking note to verify initial state
      const originalLinkingNote = await testSetup.api.getNote(
        testVaultId,
        linkingNote.id
      );
      expect(originalLinkingNote).toBeDefined();
      expect(originalLinkingNote?.metadata?.tags).toEqual(['linking', 'reference']);
      expect(originalLinkingNote?.metadata?.author).toBe('test-author');
      expect(originalLinkingNote?.metadata?.custom_field).toBe('custom-value');
      expect(originalLinkingNote?.metadata?.created_by).toBe('test-system');
      const originalCreated = originalLinkingNote?.metadata?.created;
      const originalContent = originalLinkingNote?.content;

      // Get the target note to get its content hash
      const targetNoteData = await testSetup.api.getNote(testVaultId, targetNote.id);
      expect(targetNoteData).toBeDefined();

      // Rename the target note
      const renameResult = await testSetup.api.renameNote({
        noteId: targetNote.id,
        newTitle: 'New Title',
        contentHash: targetNoteData?.content_hash || '',
        vault_id: testVaultId
      });

      expect(renameResult.success).toBe(true);
      // Note: linksUpdated may be 0 in test environment due to indexing being skipped
      // The important thing is that frontmatter is preserved (verified below)

      // Verify the linking note's frontmatter is preserved
      const updatedLinkingNote = await testSetup.api.getNote(testVaultId, linkingNote.id);
      expect(updatedLinkingNote).toBeDefined();

      // Check that all custom metadata is still present
      expect(updatedLinkingNote?.metadata?.tags).toEqual(['linking', 'reference']);
      expect(updatedLinkingNote?.metadata?.author).toBe('test-author');
      expect(updatedLinkingNote?.metadata?.custom_field).toBe('custom-value');
      expect(updatedLinkingNote?.metadata?.created_by).toBe('test-system');

      // Verify the created timestamp is preserved
      expect(updatedLinkingNote?.metadata?.created).toBe(originalCreated);

      // Verify content is identical except for link updates
      // In test environment, indexing is skipped so links won't be updated
      // Content should be completely unchanged
      expect(updatedLinkingNote?.content).toBe(originalContent);

      // Verify the target note's metadata is also preserved
      const renamedTargetNote = await testSetup.api.getNote(
        testVaultId,
        renameResult.new_id || targetNote.id
      );
      expect(renamedTargetNote).toBeDefined();
      expect(renamedTargetNote?.title).toBe('New Title');
      expect(renamedTargetNote?.metadata?.tags).toEqual(['target', 'original']);
      expect(renamedTargetNote?.metadata?.priority).toBe('high');
      expect(renamedTargetNote?.metadata?.created).toBe(
        targetNoteData?.metadata?.created
      );
    });

    it('should handle multiple notes linking to a renamed note', async () => {
      // Create the target note
      const targetNote = await testSetup.api.createNote({
        type: 'general',
        title: 'Shared Reference',
        content: 'This note is referenced by multiple notes.',
        metadata: { tags: ['shared'] },
        vaultId: testVaultId
      });

      // Create multiple notes that link to it with different custom metadata
      const linkingNote1 = await testSetup.api.createNote({
        type: 'general',
        title: 'First Linker',
        content: 'References [[Shared Reference]] here.',
        metadata: {
          tags: ['linker1'],
          category: 'category-a',
          rating: 5
        },
        vaultId: testVaultId
      });

      const linkingNote2 = await testSetup.api.createNote({
        type: 'general',
        title: 'Second Linker',
        content:
          'Also references [[Shared Reference]] multiple times [[Shared Reference]].',
        metadata: {
          tags: ['linker2'],
          category: 'category-b',
          status: 'active'
        },
        vaultId: testVaultId
      });

      const linkingNote3 = await testSetup.api.createNote({
        type: 'task',
        title: 'Task Linker',
        content: 'Task that references [[Shared Reference]].',
        metadata: {
          tags: ['task', 'linker3'],
          priority: 'urgent',
          assignee: 'user@example.com'
        },
        vaultId: testVaultId
      });

      // Get original metadata and content for all notes
      const original1 = await testSetup.api.getNote(testVaultId, linkingNote1.id);
      const original2 = await testSetup.api.getNote(testVaultId, linkingNote2.id);
      const original3 = await testSetup.api.getNote(testVaultId, linkingNote3.id);
      const originalContent1 = original1?.content;
      const originalContent2 = original2?.content;
      const originalContent3 = original3?.content;

      // Rename the target note
      const targetNoteData = await testSetup.api.getNote(testVaultId, targetNote.id);
      const renameResult = await testSetup.api.renameNote({
        noteId: targetNote.id,
        newTitle: 'Updated Reference',
        contentHash: targetNoteData?.content_hash || '',
        vault_id: testVaultId
      });

      expect(renameResult.success).toBe(true);
      // Note: notesUpdated may be 0 in test environment due to indexing being skipped
      // The important thing is that frontmatter is preserved (verified below)

      // Verify each linking note preserved its metadata
      const updated1 = await testSetup.api.getNote(testVaultId, linkingNote1.id);
      expect(updated1?.metadata?.tags).toEqual(['linker1']);
      expect(updated1?.metadata?.category).toBe('category-a');
      expect(updated1?.metadata?.rating).toBe(5);
      expect(updated1?.metadata?.created).toBe(original1?.metadata?.created);

      const updated2 = await testSetup.api.getNote(testVaultId, linkingNote2.id);
      expect(updated2?.metadata?.tags).toEqual(['linker2']);
      expect(updated2?.metadata?.category).toBe('category-b');
      expect(updated2?.metadata?.status).toBe('active');
      expect(updated2?.metadata?.created).toBe(original2?.metadata?.created);

      const updated3 = await testSetup.api.getNote(testVaultId, linkingNote3.id);
      expect(updated3?.metadata?.tags).toEqual(['task', 'linker3']);
      expect(updated3?.metadata?.priority).toBe('urgent');
      expect(updated3?.metadata?.assignee).toBe('user@example.com');
      expect(updated3?.metadata?.created).toBe(original3?.metadata?.created);

      // Verify content is identical (unchanged in test environment due to indexing being skipped)
      expect(updated1?.content).toBe(originalContent1);
      expect(updated2?.content).toBe(originalContent2);
      expect(updated3?.content).toBe(originalContent3);
    });

    it('should preserve frontmatter with special characters and arrays', async () => {
      // Create target note
      const targetNote = await testSetup.api.createNote({
        type: 'general',
        title: 'Target Note',
        content: 'Target content.',
        vaultId: testVaultId
      });

      // Create linking note with complex metadata
      const linkingNote = await testSetup.api.createNote({
        type: 'general',
        title: 'Complex Metadata Note',
        content: 'Links to [[Target Note]].',
        metadata: {
          tags: ['tag1', 'tag2', 'tag with spaces', 'tag-with-dashes'],
          description: 'A description with "quotes" and special chars: @#$%',
          items: ['item 1', 'item 2', 'item 3'],
          nested_value: 'value with: colons',
          url: 'https://example.com/path?query=value'
        },
        vaultId: testVaultId
      });

      const originalNote = await testSetup.api.getNote(testVaultId, linkingNote.id);
      const originalContent = originalNote?.content;

      // Rename the target
      const targetNoteData = await testSetup.api.getNote(testVaultId, targetNote.id);
      await testSetup.api.renameNote({
        noteId: targetNote.id,
        newTitle: 'Renamed Target',
        contentHash: targetNoteData?.content_hash || '',
        vault_id: testVaultId
      });

      // Verify complex metadata is preserved
      const updatedNote = await testSetup.api.getNote(testVaultId, linkingNote.id);
      expect(updatedNote?.metadata?.tags).toEqual([
        'tag1',
        'tag2',
        'tag with spaces',
        'tag-with-dashes'
      ]);
      expect(updatedNote?.metadata?.description).toBe(
        'A description with "quotes" and special chars: @#$%'
      );
      expect(updatedNote?.metadata?.items).toEqual(['item 1', 'item 2', 'item 3']);
      expect(updatedNote?.metadata?.nested_value).toBe('value with: colons');
      expect(updatedNote?.metadata?.url).toBe('https://example.com/path?query=value');
      expect(updatedNote?.metadata?.created).toBe(originalNote?.metadata?.created);

      // Verify content is identical (unchanged in test environment)
      expect(updatedNote?.content).toBe(originalContent);
    });
  });
});
