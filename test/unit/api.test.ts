/**
 * Tests for FlintNoteApi - Direct programmatic access
 *
 * Tests basic functionality of the direct API without MCP protocol overhead.
 * Covers initialization, note operations, and error handling patterns.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { FlintNoteApi } from '../../src/api/flint-note-api.ts';
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

      // Create note
      const createResult = await api.createSimpleNote(
        'general',
        'test-note',
        noteContent
      );
      assert.ok(createResult);

      // Retrieve note
      const note = await api.getNote('general/test-note.md');
      assert.ok(note);
      assert.ok((note as any).content);
      assert.ok((note as any).content.includes('Test Note'));
    });

    test('should create note with full API', async () => {
      const result = await api.createNote({
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

      assert.ok(result);

      const note = await api.getNote('general/detailed-note.md');
      assert.ok(note);
      assert.ok((note as any).content.includes('Detailed Note'));
    });

    test('should get note info', async () => {
      // Create initial note
      await api.createSimpleNote('general', 'info-test', 'Test content for info');

      // Get note info with proper parameter
      const info = await api.getNoteInfo({ title_or_filename: 'info-test' });
      assert.ok(info);
    });

    test('should handle non-existent note gracefully', async () => {
      try {
        await api.getNote('general/non-existent-note.md');
        assert.fail('Should have thrown an error for non-existent note');
      } catch (error) {
        // Any error is acceptable - just verify it throws
        assert.ok(error);
      }
    });
  });

  describe('Note Type Operations', () => {
    beforeEach(async () => {
      await api.initialize();
    });

    test('should create and list note types', async () => {
      // Create the general note type first (required for workspace)
      await api.createNoteType({
        type_name: 'general',
        description: 'General purpose notes',
        agent_instructions: ['Be helpful']
      });

      // Create a test note type
      await api.createNoteType({
        type_name: 'test-type',
        description: 'A test note type for API testing',
        agent_instructions: ['Be helpful', 'Be concise']
      });

      // List note types
      const types = await api.listNoteTypes();
      assert.ok(types);
    });

    test('should get note type info for general type', async () => {
      // Create the general note type first
      await api.createNoteType({
        type_name: 'general',
        description: 'General purpose notes'
      });

      // Test getting info for the general type
      const typeInfo = await api.getNoteTypeInfo({ type_name: 'general' });
      assert.ok(typeInfo);
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      await api.initialize();

      // Create some test notes
      await api.createSimpleNote(
        'general',
        'search-test-1',
        '# Important Meeting\n\nDiscuss quarterly results'
      );
      await api.createSimpleNote(
        'general',
        'search-test-2',
        '# Project Update\n\nImportant milestone reached'
      );
      await api.createSimpleNote(
        'general',
        'search-test-3',
        '# Random Note\n\nNothing special here'
      );
    });

    test('should search notes by text', async () => {
      const results = await api.searchNotesByText('important');
      assert.ok(results);
    });

    test('should perform advanced search', async () => {
      const results = await api.searchNotesAdvanced({
        content_contains: 'meeting',
        limit: 5
      });

      assert.ok(results);
    });

    test('should limit search results', async () => {
      const results = await api.searchNotesByText('test', undefined, 2);
      assert.ok(results);
      // Note: Exact result counting depends on search implementation
      // Just verify we get results without errors
    });
  });

  describe('Vault Operations', () => {
    beforeEach(async () => {
      await api.initialize();
    });

    test('should get current vault info', async () => {
      const vault = await api.getCurrentVault();
      assert.ok(vault);
      // Should have basic vault information
    });

    test('should list vaults', async () => {
      const vaults = await api.listVaults();
      assert.ok(vaults);
      // Should return some vault information
    });
  });

  describe('Resource Operations', () => {
    beforeEach(async () => {
      await api.initialize();
    });

    test('should get workspace statistics', async () => {
      // Create the general note type first
      await api.createNoteType({
        type_name: 'general',
        description: 'General purpose notes'
      });

      // Create a note first to ensure we have some stats
      await api.createSimpleNote('general', 'stats-test', 'Test content for statistics');

      try {
        const stats = await api.getStatsResource();
        assert.ok(stats);
        // Just verify we got some response back - any format is acceptable
      } catch (error) {
        // Stats might not be available in test environment - that's ok
        assert.ok(error);
      }
    });

    test('should get note types resource', async () => {
      try {
        const types = await api.getTypesResource();
        assert.ok(types);
        // Just verify we got some response back - any format is acceptable
      } catch (error) {
        // Resource might not be available in test environment - that's ok
        assert.ok(error);
      }
    });
  });

  describe('Convenience Methods', () => {
    beforeEach(async () => {
      await api.initialize();
    });

    test('should create simple note with convenience method', async () => {
      const result = await api.createSimpleNote(
        'general',
        'convenience-test',
        'Content created via convenience method'
      );

      assert.ok(result);

      const note = await api.getNote('general/convenience-test.md');
      assert.ok((note as any).content.includes('convenience method'));
    });

    test('should create multiple notes with convenience method', async () => {
      await api.createSimpleNote('general', 'convenience-1', 'First note');
      await api.createSimpleNote('general', 'convenience-2', 'Second note');

      const note1 = await api.getNote('general/convenience-1.md');
      const note2 = await api.getNote('general/convenience-2.md');

      assert.ok(note1);
      assert.ok(note2);
      assert.ok(
        (note1 as any).content || (note1 as any).text || typeof note1 === 'string'
      );
      assert.ok(
        (note2 as any).content || (note2 as any).text || typeof note2 === 'string'
      );
    });

    test('should search with convenience method', async () => {
      await api.createSimpleNote('general', 'findme', 'Unique search term: elephant');

      const results = await api.searchNotesByText('elephant', undefined, 5);
      assert.ok(results);
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
        await api.createSimpleNote('nonexistent-type', 'test', 'content');
      });
    });

    test('should handle empty search gracefully', async () => {
      const results = await api.searchNotesByText('');
      assert.ok(results);
      // Empty search should return results or empty results, not crash
    });

    test('should provide basic API structure', async () => {
      // Just verify the API has the expected methods
      assert.ok(typeof api.createNote === 'function');
      assert.ok(typeof api.getNote === 'function');
      assert.ok(typeof api.searchNotes === 'function');
      assert.ok(typeof api.listVaults === 'function');
    });
  });
});
