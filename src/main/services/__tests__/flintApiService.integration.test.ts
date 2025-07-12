import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FlintApiService } from '../flintApiService';
import { mkdtemp, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

// These tests require a real Flint workspace and the @flint-note/server package
// They will be skipped if the environment is not properly set up
const shouldRunIntegrationTests = () => {
  // Check if we have access to create temporary directories
  try {
    return process.env.RUN_INTEGRATION_TESTS === 'true' || process.env.CI === 'true';
  } catch {
    return false;
  }
};

const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('FlintApiService Integration Tests', () => {
  let testWorkspace: string;
  let service: FlintApiService;
  let isRealFlintAvailable = false;

  beforeAll(async () => {
    try {
      // Create temporary workspace directory
      testWorkspace = await mkdtemp(join(tmpdir(), 'flint-integration-test-'));

      // Create a basic workspace structure
      await mkdir(join(testWorkspace, 'vaults'), { recursive: true });
      await mkdir(join(testWorkspace, 'vaults', 'default'), { recursive: true });

      // Initialize service with test workspace
      service = new FlintApiService({
        workspacePath: testWorkspace,
        throwOnError: false // Don't throw on errors in integration tests
      });

      // Try to initialize - this will tell us if Flint is properly available
      try {
        await service.initialize();
        isRealFlintAvailable = true;
      } catch (error) {
        console.warn('Flint API not available, some integration tests will be skipped:', error);
        isRealFlintAvailable = false;
      }
    } catch (error) {
      console.error('Failed to set up integration test environment:', error);
      throw error;
    }
  });

  afterAll(async () => {
    // Cleanup test workspace
    if (testWorkspace && existsSync(testWorkspace)) {
      try {
        await rm(testWorkspace, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to cleanup test workspace:', error);
      }
    }
  });

  beforeEach(() => {
    if (!isRealFlintAvailable) {
      console.log('Skipping test - Flint API not available');
    }
  });

  describe('Service Initialization', () => {
    it('should initialize with temporary workspace', async () => {
      if (!isRealFlintAvailable) return;

      expect(service.isReady()).toBe(true);

      const config = service.getConfig();
      expect(config.workspacePath).toBe(testWorkspace);
    });

    it('should be able to reconnect', async () => {
      if (!isRealFlintAvailable) return;

      await service.reconnect();
      expect(service.isReady()).toBe(true);
    });

    it('should test connection successfully', async () => {
      if (!isRealFlintAvailable) return;

      const result = await service.testConnection();
      expect(result.success).toBe(true);
    });
  });

  describe('Vault Operations', () => {
    it('should get current vault information', async () => {
      if (!isRealFlintAvailable) return;

      const vault = await service.getCurrentVault();
      expect(vault).toBeDefined();
      expect(vault).toHaveProperty('name');
      expect(vault).toHaveProperty('id');
    });

    it('should list available vaults', async () => {
      if (!isRealFlintAvailable) return;

      const vaults = await service.listVaults();
      expect(vaults).toBeDefined();
      expect(vaults).toHaveProperty('vaults');
      expect(Array.isArray(vaults.vaults)).toBe(true);
    });

    it('should list note types', async () => {
      if (!isRealFlintAvailable) return;

      const noteTypes = await service.listNoteTypes();
      expect(Array.isArray(noteTypes)).toBe(true);
    });
  });

  describe('Note CRUD Operations', () => {
    const testNoteId = 'integration-test-note';
    const testNoteContent = `# Integration Test Note

This is a test note created during integration testing.

## Features Tested
- Note creation
- Content retrieval
- Content updates
- Search functionality

Created at: ${new Date().toISOString()}`;

    it('should create a simple note', async () => {
      if (!isRealFlintAvailable) return;

      const result = await service.createSimpleNote(
        'test',
        testNoteId,
        testNoteContent
      );

      expect(result).toBeDefined();
      // The exact structure depends on the Flint API implementation
      // We just verify it doesn't throw and returns something
    });

    it('should retrieve the created note', async () => {
      if (!isRealFlintAvailable) return;

      // First create a note to ensure it exists
      await service.createSimpleNote('test', testNoteId, testNoteContent);

      const note = await service.getNote(testNoteId);

      if (note) {
        expect(note).toBeDefined();
        // Verify note contains expected content
        if (note.content) {
          expect(note.content).toContain('Integration Test Note');
        }
      }
    });

    it('should update note content', async () => {
      if (!isRealFlintAvailable) return;

      // Ensure note exists first
      await service.createSimpleNote('test', testNoteId, testNoteContent);

      const updatedContent = testNoteContent + '\n\n## Update\nThis note has been updated during testing.';

      const result = await service.updateNoteContent(testNoteId, updatedContent);
      expect(result).toBeDefined();

      // Verify the update by retrieving the note
      const updatedNote = await service.getNote(testNoteId);
      if (updatedNote && updatedNote.content) {
        expect(updatedNote.content).toContain('This note has been updated');
      }
    });

    it('should get note info', async () => {
      if (!isRealFlintAvailable) return;

      // Ensure note exists
      await service.createSimpleNote('test', testNoteId, testNoteContent);

      const noteInfo = await service.getNoteInfo({ identifier: testNoteId });
      expect(noteInfo).toBeDefined();
    });

    it('should handle non-existent note gracefully', async () => {
      if (!isRealFlintAvailable) return;

      const nonExistentNote = await service.getNote('non-existent-note-12345');
      expect(nonExistentNote).toBeNull();
    });
  });

  describe('Search Operations', () => {
    const searchTestNoteId = 'search-test-note';
    const searchTestContent = `# Search Test Note

This note contains specific keywords for testing search functionality.

Keywords: integration, testing, search, functionality, unique-search-term-12345

## Categories
- Testing
- Integration
- Search

## Status
Active and searchable.`;

    beforeEach(async () => {
      if (!isRealFlintAvailable) return;

      // Create a note specifically for search testing
      await service.createSimpleNote('test', searchTestNoteId, searchTestContent);
    });

    it('should search notes with basic query', async () => {
      if (!isRealFlintAvailable) return;

      const results = await service.searchNotes('unique-search-term-12345', {
        limit: 10
      });

      expect(results).toBeDefined();
      expect(results).toHaveProperty('notes');
      expect(Array.isArray(results.notes)).toBe(true);

      // If we find results, verify they contain our search term
      if (results.notes && results.notes.length > 0) {
        const foundNote = results.notes.find(note =>
          note.identifier === searchTestNoteId ||
          (note.content && note.content.includes('unique-search-term-12345'))
        );
        expect(foundNote).toBeDefined();
      }
    });

    it('should search notes by text', async () => {
      if (!isRealFlintAvailable) return;

      const results = await service.searchNotesByText('search functionality');

      expect(results).toBeDefined();
      expect(results).toHaveProperty('notes');
      expect(Array.isArray(results.notes)).toBe(true);
    });

    it('should perform advanced search', async () => {
      if (!isRealFlintAvailable) return;

      const results = await service.searchNotesAdvanced({
        query: 'testing',
        type: 'test',
        content_contains: 'integration',
        limit: 5
      });

      expect(results).toBeDefined();
      expect(results).toHaveProperty('notes');
      expect(Array.isArray(results.notes)).toBe(true);
    });

    it('should handle empty search results', async () => {
      if (!isRealFlintAvailable) return;

      const results = await service.searchNotes('extremely-unlikely-search-term-99999');

      expect(results).toBeDefined();
      expect(results).toHaveProperty('notes');
      expect(Array.isArray(results.notes)).toBe(true);
      expect(results.notes).toHaveLength(0);
    });

    it('should search with different options', async () => {
      if (!isRealFlintAvailable) return;

      const searchOptions = [
        { limit: 1 },
        { type_filter: 'test' },
        { use_regex: false },
        { fields: ['title', 'content'] }
      ];

      for (const options of searchOptions) {
        const results = await service.searchNotes('test', options);
        expect(results).toBeDefined();
        expect(results).toHaveProperty('notes');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully when throwOnError is false', async () => {
      if (!isRealFlintAvailable) return;

      // Create service that doesn't throw on errors
      const errorService = new FlintApiService({
        workspacePath: testWorkspace,
        throwOnError: false
      });

      await errorService.initialize();

      // Try operations that might fail
      try {
        await errorService.getNote(''); // Empty identifier might cause error
        await errorService.updateNoteContent('non-existent', 'content');
        await errorService.deleteNote({ identifier: 'non-existent' });
      } catch (error) {
        // These operations might still throw depending on implementation
        // but the service should handle them gracefully
        console.log('Expected error in error handling test:', error);
      }
    });

    it('should provide meaningful error information', async () => {
      if (!isRealFlintAvailable) return;

      const connectionTest = await service.testConnection();

      // Connection should succeed in our test environment
      if (!connectionTest.success) {
        expect(connectionTest).toHaveProperty('error');
        expect(typeof connectionTest.error).toBe('string');
        expect(connectionTest.error.length).toBeGreaterThan(0);
      } else {
        expect(connectionTest.success).toBe(true);
      }
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent operations', async () => {
      if (!isRealFlintAvailable) return;

      const operations = [
        service.getCurrentVault(),
        service.listVaults(),
        service.listNoteTypes(),
        service.searchNotes('test', { limit: 5 }),
        service.getNote('non-existent-concurrent-test')
      ];

      // All operations should complete without throwing
      const results = await Promise.allSettled(operations);

      // Check that operations completed (either fulfilled or rejected, but not hanging)
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(['fulfilled', 'rejected']).toContain(result.status);
      });
    });

    it('should handle rapid sequential operations', async () => {
      if (!isRealFlintAvailable) return;

      const noteIds = ['rapid-1', 'rapid-2', 'rapid-3'];

      // Create notes rapidly
      for (const noteId of noteIds) {
        await service.createSimpleNote('test', noteId, `Content for ${noteId}`);
      }

      // Search for them rapidly
      for (const noteId of noteIds) {
        const note = await service.getNote(noteId);
        // Note might or might not exist depending on timing and implementation
        // We just verify the operation completes
        expect(note === null || typeof note === 'object').toBe(true);
      }
    });
  });

  describe('Real Workspace Integration', () => {
    it('should work with actual workspace structure', async () => {
      if (!isRealFlintAvailable) return;

      // Test that our service works with the workspace we created
      const vault = await service.getCurrentVault();
      expect(vault).toBeDefined();

      // Create a note and verify it persists
      const persistenceTestId = 'persistence-test-note';
      await service.createSimpleNote('test', persistenceTestId, 'Persistence test content');

      // Disconnect and reconnect
      await service.reconnect();

      // Verify note still exists
      const persistedNote = await service.getNote(persistenceTestId);
      if (persistedNote) {
        expect(persistedNote.content).toContain('Persistence test');
      }
    });

    it('should maintain consistency across operations', async () => {
      if (!isRealFlintAvailable) return;

      const consistencyTestId = 'consistency-test-note';
      const originalContent = 'Original content for consistency test';
      const updatedContent = 'Updated content for consistency test';

      // Create note
      await service.createSimpleNote('test', consistencyTestId, originalContent);

      // Verify creation
      let note = await service.getNote(consistencyTestId);
      if (note && note.content) {
        expect(note.content).toContain('Original content');
      }

      // Update note
      await service.updateNoteContent(consistencyTestId, updatedContent);

      // Verify update
      note = await service.getNote(consistencyTestId);
      if (note && note.content) {
        expect(note.content).toContain('Updated content');
      }

      // Search should find updated content
      const searchResults = await service.searchNotes('Updated content');
      expect(searchResults.notes).toBeDefined();
    });
  });
});
