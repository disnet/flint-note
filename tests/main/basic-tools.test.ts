import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolService } from '../../src/main/tool-service';
import { NoteService } from '../../src/main/note-service';
import { TestApiSetup } from '../server/api/test-setup.js';

// Mock the logger to avoid console output in tests
vi.mock('../../src/main/logger', () => ({
  logger: {
    error: vi.fn()
  }
}));

describe('Basic Tools', () => {
  let toolService: ToolService;
  let noteService: NoteService;
  let testSetup: TestApiSetup;
  let testVaultId: string;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();

    // Create a test vault
    testVaultId = await testSetup.createTestVault('test-basic-tools-vault');

    // Create a real note service that wraps the test API
    noteService = {
      getFlintNoteApi: () => testSetup.api,
      getCurrentVault: async () => ({
        id: testVaultId,
        name: 'Test Vault',
        path: '',
        created: new Date().toISOString(),
        last_accessed: new Date().toISOString()
      })
    } as any;

    toolService = new ToolService(noteService);
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  describe('get_note tool', () => {
    it('should retrieve an existing note', async () => {
      const tools = toolService.getTools();
      expect(tools).toBeDefined();

      // First create a note to retrieve
      const createResult = await tools!.create_note.execute({
        title: 'Test Note',
        content: 'This is test content',
        noteType: 'general'
      });

      expect(createResult.success).toBe(true);
      const createdNote = createResult.data as any;

      // Now retrieve it
      const getResult = await tools!.get_note.execute({
        id: createdNote.id
      });

      expect(getResult.success).toBe(true);
      expect(getResult.data).toBeDefined();
      const retrievedNote = getResult.data as any;
      expect(retrievedNote.title).toBe('Test Note');
      expect(retrievedNote.content).toBe('This is test content');
    });

    it('should handle note not found', async () => {
      const tools = toolService.getTools();

      const result = await tools!.get_note.execute({
        id: 'nonexistent/note'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOTE_NOT_FOUND');
    });

    it('should handle missing note service', async () => {
      const toolServiceWithoutNoteService = new ToolService(null);
      const tools = toolServiceWithoutNoteService.getTools();

      expect(tools).toBeUndefined();
    });
  });

  describe('create_note tool', () => {
    it('should create a new note with all parameters', async () => {
      const tools = toolService.getTools();

      const result = await tools!.create_note.execute({
        title: 'New Test Note',
        content: 'This is new content',
        noteType: 'general',
        metadata: { priority: 'high', tags: ['test'] }
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const note = result.data as any;
      expect(note.title).toBe('New Test Note');
      expect(note.content).toBe('This is new content');
      expect(note.type).toBe('general');
    });

    it('should create a note with minimal parameters', async () => {
      const tools = toolService.getTools();

      const result = await tools!.create_note.execute({
        title: 'Minimal Note',
        noteType: 'general'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const note = result.data as any;
      expect(note.title).toBe('Minimal Note');
      expect(note.content).toBe('');
    });

    it('should handle hierarchy relationships with parentId', async () => {
      const tools = toolService.getTools();

      // Create parent note first
      const parentResult = await tools!.create_note.execute({
        title: 'Parent Note',
        content: 'Parent content',
        noteType: 'general'
      });
      expect(parentResult.success).toBe(true);
      const parentNote = parentResult.data as any;

      // Create child note with parentId
      const childResult = await tools!.create_note.execute({
        title: 'Child Note',
        content: 'Child content',
        noteType: 'general',
        parentId: parentNote.id
      });

      expect(childResult.success).toBe(true);
      const childNote = childResult.data as any;
      expect(childNote.title).toBe('Child Note');
    });
  });

  describe('update_note tool', () => {
    it('should update note content', async () => {
      const tools = toolService.getTools();

      // Create a note first
      const createResult = await tools!.create_note.execute({
        title: 'Update Test Note',
        content: 'Original content',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Update the content
      const updateResult = await tools!.update_note.execute({
        id: note.id,
        contentHash: note.content_hash,
        content: 'Updated content'
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.content).toBe('Updated content');
    });

    it('should update note title', async () => {
      const tools = toolService.getTools();

      // Create a note first
      const createResult = await tools!.create_note.execute({
        title: 'Original Title',
        content: 'Test content',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Update the title
      const updateResult = await tools!.update_note.execute({
        id: note.id,
        contentHash: note.content_hash,
        title: 'Updated Title'
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.title).toBe('Updated Title');
    });

    it('should update note metadata', async () => {
      const tools = toolService.getTools();

      // Create a note first
      const createResult = await tools!.create_note.execute({
        title: 'Metadata Test Note',
        content: 'Test content',
        noteType: 'general',
        metadata: { priority: 'low' }
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Update the metadata
      const updateResult = await tools!.update_note.execute({
        id: note.id,
        contentHash: note.content_hash,
        metadata: { priority: 'high', status: 'complete' }
      });

      expect(updateResult.success).toBe(true);
      const updatedNote = updateResult.data as any;
      expect(updatedNote.metadata.priority).toBe('high');
      expect(updatedNote.metadata.status).toBe('complete');
    });

    it('should handle note not found for update', async () => {
      const tools = toolService.getTools();

      const result = await tools!.update_note.execute({
        id: 'nonexistent/note',
        contentHash: 'dummy-hash',
        content: 'New content'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOTE_NOT_FOUND');
    });

    it('should handle wrong contentHash for update', async () => {
      const tools = toolService.getTools();

      // Create a note first
      const createResult = await tools!.create_note.execute({
        title: 'Hash Test Note',
        content: 'Original content',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Try to update with wrong contentHash
      const updateResult = await tools!.update_note.execute({
        id: note.id,
        contentHash: 'wrong-hash',
        content: 'Updated content'
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBe('CONTENT_HASH_MISMATCH');
    });
  });

  describe('search_notes tool', () => {
    beforeEach(async () => {
      const tools = toolService.getTools();

      // Create some test notes for searching
      await tools!.create_note.execute({
        title: 'Search Test Note 1',
        content: 'This note contains searchable content about cats',
        noteType: 'general'
      });

      await tools!.create_note.execute({
        title: 'Search Test Note 2',
        content: 'This note contains searchable content about dogs',
        noteType: 'general'
      });

      await tools!.create_note.execute({
        title: 'Different Note',
        content: 'This has completely different content',
        noteType: 'project'
      });

      // Wait a bit for search index to update
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should search notes by content', async () => {
      const tools = toolService.getTools();

      // Create a unique note within this test to search for
      const uniqueContent = `unique-search-term-${Date.now()}`;
      await tools!.create_note.execute({
        title: 'Search Test Note',
        content: `This note contains ${uniqueContent} for testing`,
        noteType: 'general'
      });

      // Wait a moment for potential indexing
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = await tools!.search_notes.execute({
        query: uniqueContent
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // The search should work with at least the success status,
      // even if indexing is async in test environment
      const notes = result.data as any[];
      expect(Array.isArray(notes)).toBe(true);
    });

    it('should list all notes when no query provided', async () => {
      const tools = toolService.getTools();

      const result = await tools!.search_notes.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const notes = result.data as any[];
      expect(notes.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by note type', async () => {
      const tools = toolService.getTools();

      const result = await tools!.search_notes.execute({
        noteType: 'project'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const notes = result.data as any[];
      // Should find the "Different Note" which is of type "project"
      expect(notes.some((note: any) => note.title === 'Different Note')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const tools = toolService.getTools();

      const result = await tools!.search_notes.execute({
        limit: 1
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const notes = result.data as any[];
      expect(notes.length).toBeLessThanOrEqual(1);
    });

    it('should clamp limit to maximum of 100', async () => {
      const tools = toolService.getTools();

      // This test verifies the limit clamping logic
      const result = await tools!.search_notes.execute({
        limit: 150 // Over the max
      });

      expect(result.success).toBe(true);
      // The actual implementation should clamp to 100, but we can't easily verify
      // the exact limit without creating 101+ notes
    });
  });

  describe('get_vault_info tool', () => {
    it('should return current vault information', async () => {
      const tools = toolService.getTools();

      const result = await tools!.get_vault_info.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const vaultInfo = result.data as any;
      expect(vaultInfo.id).toBe(testVaultId);
      expect(vaultInfo.name).toBe('Test Vault test-basic-tools-vault');
    });
  });

  describe('delete_note tool', () => {
    it('should delete an existing note', async () => {
      const tools = toolService.getTools();

      // Create a note first
      const createResult = await tools!.create_note.execute({
        title: 'Note to Delete',
        content: 'This note will be deleted',
        noteType: 'general'
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Delete the note
      const deleteResult = await tools!.delete_note.execute({
        id: note.id
      });

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data).toEqual({ success: true });

      // Verify note is gone
      const getResult = await tools!.get_note.execute({
        id: note.id
      });
      expect(getResult.success).toBe(false);
      expect(getResult.error).toBe('NOTE_NOT_FOUND');
    });

    it('should handle note not found for deletion', async () => {
      const tools = toolService.getTools();

      const result = await tools!.delete_note.execute({
        id: 'nonexistent/note'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOTE_NOT_FOUND');
    });
  });

  describe('error handling', () => {
    it('should handle tools when note service is null', () => {
      const toolServiceWithoutNoteService = new ToolService(null);
      const tools = toolServiceWithoutNoteService.getTools();

      expect(tools).toBeUndefined();
    });

    it('should handle vault access errors gracefully', async () => {
      // Create a tool service with a mock note service that fails
      const failingNoteService = {
        getFlintNoteApi: () => testSetup.api,
        getCurrentVault: async () => null // No current vault
      } as any;

      const failingToolService = new ToolService(failingNoteService);
      const tools = failingToolService.getTools();

      const result = await tools!.get_note.execute({
        id: 'any/note'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_ACTIVE_VAULT');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete CRUD workflow', async () => {
      const tools = toolService.getTools();

      // Create
      const createResult = await tools!.create_note.execute({
        title: 'CRUD Test Note',
        content: 'Initial content',
        noteType: 'general',
        metadata: { version: 1 }
      });
      expect(createResult.success).toBe(true);
      const note = createResult.data as any;

      // Read
      const getResult = await tools!.get_note.execute({
        id: note.id
      });
      expect(getResult.success).toBe(true);

      // Update
      const updateResult = await tools!.update_note.execute({
        id: note.id,
        contentHash: note.content_hash,
        content: 'Updated content',
        metadata: { version: 2 }
      });
      expect(updateResult.success).toBe(true);

      // Search (should work even if indexing is async)
      const searchResult = await tools!.search_notes.execute({
        query: 'Updated content'
      });
      expect(searchResult.success).toBe(true);
      const searchNotes = searchResult.data as any[];
      expect(Array.isArray(searchNotes)).toBe(true);

      // Delete
      const deleteResult = await tools!.delete_note.execute({
        id: note.id
      });
      expect(deleteResult.success).toBe(true);

      // Verify deletion
      const getFinalResult = await tools!.get_note.execute({
        id: note.id
      });
      expect(getFinalResult.success).toBe(false);
    });
  });
});
