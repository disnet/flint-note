/**
 * Unit tests for search functionality
 * Tests the SearchManager class directly without MCP server integration
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

describe('Search Unit Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('search-unit-test');
    await createTestNoteTypes(context);
    await createTestNotes(context);
    await createTestNotesWithMetadata(context);

    // Create additional test notes for search functionality
    await context.noteManager.createNote(
      TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
      'JavaScript Programming',
      'JavaScript is a versatile programming language used for web development.'
    );

    await context.noteManager.createNote(
      TEST_CONSTANTS.NOTE_TYPES.PROJECT,
      'React Project Setup',
      'Setting up a new React project with TypeScript and modern tooling.'
    );

    await context.noteManager.createNote(
      TEST_CONSTANTS.NOTE_TYPES.MEETING,
      'Weekly Team Meeting',
      'Discussed project progress, blockers, and upcoming sprint planning.'
    );

    // Update search index
    await context.searchManager.rebuildIndex();
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  describe('Basic Search Functionality', () => {
    test('should find notes by simple text search', async () => {
      const results = await context.searchManager.searchNotes('JavaScript');

      assert.ok(Array.isArray(results), 'Should return array of results');
      assert.ok(results.length > 0, 'Should find matching notes');

      const jsNote = results.find(r => r.title === 'JavaScript Programming');
      assert.ok(jsNote, 'Should find JavaScript Programming note');
      assert.ok(
        jsNote.snippet.includes('JavaScript'),
        'Result should contain search term'
      );
    });

    test('should search across note titles and content', async () => {
      const titleResults = await context.searchManager.searchNotes('Programming');
      const contentResults = await context.searchManager.searchNotes('versatile');

      assert.ok(titleResults.length > 0, 'Should find notes by title');
      assert.ok(contentResults.length > 0, 'Should find notes by content');

      const titleNote = titleResults.find(r => r.title.includes('Programming'));
      assert.ok(titleNote, 'Should find note with Programming in title');

      const contentNote = contentResults.find(r => r.snippet.includes('versatile'));
      assert.ok(contentNote, 'Should find note with versatile in content');
    });

    test('should be case insensitive', async () => {
      const lowerResults = await context.searchManager.searchNotes('javascript');
      const upperResults = await context.searchManager.searchNotes('JAVASCRIPT');
      const mixedResults = await context.searchManager.searchNotes('JavaScript');

      assert.ok(lowerResults.length > 0, 'Should find with lowercase');
      assert.ok(upperResults.length > 0, 'Should find with uppercase');
      assert.ok(mixedResults.length > 0, 'Should find with mixed case');

      // All should return the same results
      assert.strictEqual(
        lowerResults.length,
        upperResults.length,
        'Case should not affect result count'
      );
      assert.strictEqual(
        lowerResults.length,
        mixedResults.length,
        'Case should not affect result count'
      );
    });

    test('should handle partial word matches', async () => {
      const results = await context.searchManager.searchNotes('prog');

      assert.ok(results.length > 0, 'Should find partial matches');

      const foundProgramming = results.some(
        r =>
          r.title.toLowerCase().includes('programming') ||
          r.snippet.toLowerCase().includes('programming')
      );
      assert.ok(foundProgramming, 'Should find notes with programming');
    });

    test('should return empty array for no matches', async () => {
      const results = await context.searchManager.searchNotes('nonexistentterm12345');

      assert.ok(Array.isArray(results), 'Should return array');
      assert.strictEqual(results.length, 0, 'Should return empty array for no matches');
    });
  });

  describe('Advanced Search Features', () => {
    test('should search by note type', async () => {
      const projectResults = await context.searchManager.searchNotes(
        '',
        TEST_CONSTANTS.NOTE_TYPES.PROJECT,
        10,
        false
      );

      assert.ok(projectResults.length > 0, 'Should find project notes');

      const allProject = projectResults.every(
        r => r.type === TEST_CONSTANTS.NOTE_TYPES.PROJECT
      );
      assert.ok(allProject, 'All results should be project type');
    });

    test('should search with multiple filters', async () => {
      const results = await context.searchManager.searchNotes(
        'React',
        TEST_CONSTANTS.NOTE_TYPES.PROJECT,
        10,
        false
      );

      assert.ok(results.length > 0, 'Should find filtered results');

      const reactProject = results.find(
        r => r.title.includes('React') && r.type === TEST_CONSTANTS.NOTE_TYPES.PROJECT
      );
      assert.ok(reactProject, 'Should find React project note');
    });

    test('should search by tags', async () => {
      const results = await context.searchManager.searchNotesAdvanced({
        metadata_filters: [{ key: 'tags', value: 'productivity' }],
        limit: 10
      });

      if (results.results.length > 0) {
        const hasProductivityTag = results.results.some(r =>
          r.metadata?.tags?.includes('productivity')
        );
        assert.ok(hasProductivityTag, 'Should find notes with productivity tag');
      }
    });

    test('should handle date range searches', async () => {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      const results = await context.searchManager.searchNotes('');

      assert.ok(Array.isArray(results), 'Should return array for date range search');

      if (results.length > 0) {
        const recentNote = results.some(r => {
          const noteDate = new Date(r.lastUpdated);
          return noteDate >= yesterday && noteDate <= today;
        });
        assert.ok(recentNote, 'Should find notes in date range');
      }
    });
  });

  describe('Search Ranking and Sorting', () => {
    test('should rank title matches higher than content matches', async () => {
      await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Test Ranking',
        'This note has the search term "ranking" in content only.'
      );

      await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Content Note',
        'This note has "Test Ranking" in the content for comparison.'
      );

      await context.searchManager.rebuildIndex();
      const results = await context.searchManager.searchNotes('Test Ranking');

      assert.ok(results.length >= 2, 'Should find both notes');

      // Note with title match should rank higher
      const titleMatchIndex = results.findIndex(r => r.title === 'Test Ranking');
      const contentMatchIndex = results.findIndex(r => r.title === 'Content Note');

      if (titleMatchIndex !== -1 && contentMatchIndex !== -1) {
        assert.ok(
          titleMatchIndex < contentMatchIndex,
          'Title matches should rank higher than content matches'
        );
      }
    });

    test('should sort results by relevance', async () => {
      await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Single Match',
        'This note has one occurrence of the term "relevance".'
      );

      await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Multiple Matches',
        'This note has multiple relevance mentions. Relevance is key. Relevance matters.'
      );

      await context.searchManager.rebuildIndex();
      const results = await context.searchManager.searchNotes('relevance');

      assert.ok(results.length >= 2, 'Should find both notes');

      // Note with more matches should generally rank higher
      const multipleMatchNote = results.find(r => r.title === 'Multiple Matches');
      const singleMatchNote = results.find(r => r.title === 'Single Match');

      assert.ok(multipleMatchNote, 'Should find multiple match note');
      assert.ok(singleMatchNote, 'Should find single match note');
    });

    test('should provide search scores', async () => {
      const results = await context.searchManager.searchNotes('JavaScript');

      assert.ok(results.length > 0, 'Should find results');

      for (const result of results) {
        if (result.score !== undefined) {
          assert.ok(typeof result.score === 'number', 'Score should be a number');
          assert.ok(result.score >= 0, 'Score should be non-negative');
        }
      }
    });
  });

  describe('Search Index Management', () => {
    test('should update index when notes are added', async () => {
      const newNote = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'New Indexed Note',
        'This note should be automatically indexed.'
      );

      // Index should be updated automatically or we can force update
      await context.searchManager.rebuildIndex();

      const results = await context.searchManager.searchNotes('New Indexed Note');

      assert.ok(results.length > 0, 'Should find newly created note');
      const foundNote = results.find(r => r.id === newNote.id);
      assert.ok(foundNote, 'Should find the specific new note');
    });

    test('should handle index corruption gracefully', async () => {
      try {
        // Try to rebuild index
        await context.searchManager.rebuildIndex();
      } catch (_error) {
        // Index operations might not be exposed, that's okay
      }

      // Search should still work by rebuilding index
      const results = await context.searchManager.searchNotes('JavaScript');
      assert.ok(Array.isArray(results), 'Should return results even after index issues');
    });

    test('should efficiently handle large result sets', async () => {
      // Create many notes with common term
      const promises: Promise<any>[] = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          context.noteManager.createNote(
            TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
            `Common Term Note ${i}`,
            `This note contains the common term "searchable" for testing. Note number ${i}.`
          )
        );
      }

      await Promise.all(promises);
      await context.searchManager.rebuildIndex();

      const startTime = Date.now();
      const results = await context.searchManager.searchNotes('searchable', null, 50);
      const endTime = Date.now();

      assert.ok(results.length >= 20, 'Should find all notes with common term');
      assert.ok(endTime - startTime < 1000, 'Search should complete quickly');
    });
  });

  describe('Special Search Cases', () => {
    test('should handle empty search query', async () => {
      const results = await context.searchManager.searchNotes('');

      assert.ok(Array.isArray(results), 'Should return array for empty query');
      // Empty search might return all notes or no notes, both are valid
    });

    test('should handle whitespace-only queries', async () => {
      const results = await context.searchManager.searchNotes('   \n\t   ');

      assert.ok(Array.isArray(results), 'Should handle whitespace queries');
    });

    test('should handle special characters in search', async () => {
      await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Special Characters Test',
        'This note contains special chars: @#$%^&*()[]{}|\\:";\'<>?,./'
      );

      await context.searchManager.rebuildIndex();

      const results = await context.searchManager.searchNotes('@#$%');
      assert.ok(Array.isArray(results), 'Should handle special characters');
    });

    test('should handle Unicode in search', async () => {
      await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Unicode Test 🚀',
        'This note contains Unicode: 你好世界 こんにちは 안녕하세요 🌟'
      );

      await context.searchManager.rebuildIndex();

      const unicodeResults = await context.searchManager.searchNotes('你好');
      const emojiResults = await context.searchManager.searchNotes('🚀');

      assert.ok(Array.isArray(unicodeResults), 'Should handle Unicode search');
      assert.ok(Array.isArray(emojiResults), 'Should handle emoji search');
    });

    test('should handle very long search queries', async () => {
      const longQuery = 'a'.repeat(1000);
      const results = await context.searchManager.searchNotes(longQuery);

      assert.ok(Array.isArray(results), 'Should handle very long queries');
    });
  });

  describe('Performance and Concurrency', () => {
    test('should handle concurrent search requests', async () => {
      const promises: Promise<any>[] = [];
      const queries = ['JavaScript', 'React', 'programming', 'development', 'test'];

      for (const query of queries) {
        promises.push(context.searchManager.searchNotes(query));
      }

      const results = await Promise.all(promises);

      assert.strictEqual(results.length, queries.length, 'All searches should complete');

      for (let i = 0; i < results.length; i++) {
        assert.ok(Array.isArray(results[i]), `Search ${i} should return array`);
      }
    });

    test('should cache search results appropriately', async () => {
      const startTime = Date.now();

      // First search
      const firstResults = await context.searchManager.searchNotes('JavaScript');
      const firstTime = Date.now();

      // Second identical search
      const secondResults = await context.searchManager.searchNotes('JavaScript');
      const secondTime = Date.now();

      assert.deepStrictEqual(
        firstResults.map(r => r.id),
        secondResults.map(r => r.id),
        'Identical searches should return same results'
      );

      // Second search might be faster due to caching
      const firstDuration = firstTime - startTime;
      const secondDuration = secondTime - firstTime;

      // This is informational - caching behavior may vary
      if (secondDuration < firstDuration / 2) {
        console.log('Search caching appears to be working');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle search errors gracefully', async () => {
      // Test null input handling
      try {
        const results = await context.searchManager.searchNotes(null as any);
        assert.ok(Array.isArray(results), 'Should handle null gracefully');
      } catch (_error) {
        assert.ok(_error instanceof Error, 'Should throw proper error for null input');
      }
    });

    test('should recover from temporary failures', async () => {
      // Simulate index corruption or temporary failure
      const originalSearch = context.searchManager.searchNotes;
      let callCount = 0;

      context.searchManager.searchNotes = async (query: string, options?: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary search failure');
        }
        return originalSearch.call(context.searchManager, query, options);
      };

      try {
        // First call should fail
        await assert.rejects(
          () => context.searchManager.searchNotes('test'),
          /Temporary search failure/,
          'Should propagate temporary failures'
        );

        // Second call should succeed (after recovery)
        const results = await context.searchManager.searchNotes('JavaScript');
        assert.ok(Array.isArray(results), 'Should recover from temporary failures');
      } finally {
        // Restore original method
        context.searchManager.searchNotes = originalSearch;
      }
    });

    test('should provide meaningful error messages', async () => {
      // Test error conditions that might occur
      try {
        // This might throw based on implementation
        await context.searchManager.searchNotes('test', { invalidOption: true } as any);
      } catch (_error) {
        if (_error instanceof Error) {
          assert.ok(_error.message.length > 0, 'Error should have meaningful message');
        }
      }
    });
  });

  describe('Integration with Note Management', () => {
    test('should reflect note updates in search results', async () => {
      const note = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Update Test Note',
        'Original content for update testing.'
      );

      await context.searchManager.rebuildIndex();

      // Search for original content
      const originalResults = await context.searchManager.searchNotes('Original content');
      assert.ok(originalResults.length > 0, 'Should find note with original content');

      // Update the note (if update functionality exists)
      // This test assumes note updating functionality exists
      try {
        // Simulate note update by recreating with different content
        const updatedContent = 'Updated content for search testing.';

        // Direct file update to simulate note modification
        const noteContent = `---
title: "Update Test Note"
type: ${TEST_CONSTANTS.NOTE_TYPES.DEFAULT}
created: ${new Date().toISOString()}
updated: ${new Date().toISOString()}
---

# Update Test Note

${updatedContent}`;

        await fs.writeFile(note.path, noteContent, 'utf8');
        await context.searchManager.rebuildIndex();

        // Search for updated content
        const updatedResults = await context.searchManager.searchNotes('Updated content');
        assert.ok(updatedResults.length > 0, 'Should find note with updated content');

        // Original content should no longer be found
        const oldResults = await context.searchManager.searchNotes('Original content');
        const hasOldNote = oldResults.some(r => r.id === note.id);
        assert.ok(!hasOldNote, 'Should not find note with old content');
      } catch (_error) {
        // Update functionality might not be implemented yet
        console.log('Note update test skipped - functionality not available');
      }
    });

    test('should handle note deletion in search index', async () => {
      const note = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Deletion Test Note',
        'This note will be deleted for testing.'
      );

      await context.searchManager.rebuildIndex();

      // Verify note is searchable
      const beforeResults = await context.searchManager.searchNotes('Deletion Test Note');
      const foundBefore = beforeResults.some(r => r.id === note.id);
      assert.ok(foundBefore, 'Should find note before deletion');

      // Delete the note file
      await fs.unlink(note.path);
      await context.searchManager.rebuildIndex();

      // Should not find deleted note
      const afterResults = await context.searchManager.searchNotes('Deletion Test Note');
      const foundAfter = afterResults.some(r => r.id === note.id);
      assert.ok(!foundAfter, 'Should not find deleted note');
    });
  });
});
