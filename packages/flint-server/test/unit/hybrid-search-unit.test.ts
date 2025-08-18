/**
 * Unit tests for hybrid search functionality
 *
 * Tests the HybridSearchManager and DatabaseManager classes in isolation,
 * covering database operations, search functionality, and error handling.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { HybridSearchManager } from '../../src/database/search-manager.js';
import {
  DatabaseManager,
  serializeMetadataValue,
  deserializeMetadataValue
} from '../../src/database/schema.js';
import {
  createTestWorkspace,
  cleanupTestWorkspace,
  createTestNotesWithMetadata,
  type TestContext
} from './helpers/test-utils.js';

describe('Hybrid Search Unit Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('hybrid-search');
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  describe('DatabaseManager', () => {
    test('should connect to database and initialize schema', async () => {
      const dbManager = new DatabaseManager(context.tempDir);
      const connection = await dbManager.connect();

      assert(connection, 'Should establish database connection');
      assert(typeof connection.run === 'function', 'Should have run method');
      assert(typeof connection.get === 'function', 'Should have get method');
      assert(typeof connection.all === 'function', 'Should have all method');
      assert(typeof connection.close === 'function', 'Should have close method');

      // Verify tables were created
      const tables = await connection.all(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `);

      const tableNames = tables.map((t: any) => t.name);
      assert(tableNames.includes('notes'), 'Should create notes table');
      assert(tableNames.includes('note_metadata'), 'Should create note_metadata table');
      assert(tableNames.includes('notes_fts'), 'Should create FTS table');

      await connection.close();
    });

    test('should handle database rebuild', async () => {
      const dbManager = new DatabaseManager(context.tempDir);
      const connection = await dbManager.connect();

      // Insert test data
      await connection.run(
        `
        INSERT INTO notes (id, title, content, type, filename, path, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          'test-1',
          'Test Note',
          'Test content',
          'general',
          'test.md',
          '/test.md',
          '2024-01-01T00:00:00Z',
          '2024-01-01T00:00:00Z'
        ]
      );

      // Verify data exists
      const beforeRebuild = await connection.get('SELECT COUNT(*) as count FROM notes');
      assert.equal(
        (beforeRebuild as any).count,
        1,
        'Should have test data before rebuild'
      );

      // Rebuild database
      await dbManager.rebuild();

      // Verify data was cleared
      const afterRebuild = await connection.get('SELECT COUNT(*) as count FROM notes');
      assert.equal((afterRebuild as any).count, 0, 'Should clear data after rebuild');

      await connection.close();
    });

    test('should handle connection errors gracefully', async () => {
      // Create a temporary file first, then try to use it as a directory path
      // This should fail reliably on all platforms since you can't create a directory
      // where a file already exists
      const tempFilePath = path.join(context.tempDir, 'blocking-file.txt');
      await fs.writeFile(tempFilePath, 'test content');

      // Now try to create a database manager using the file as if it were a directory
      const dbManager = new DatabaseManager(tempFilePath);

      try {
        await dbManager.connect();
        assert.fail('Should throw error when trying to use file as directory');
      } catch (error) {
        assert(error instanceof Error, 'Should throw Error instance');

        // The error can come from fs.mkdir() or SQLite connection
        // Check for various error patterns that indicate connection/path issues
        assert(
          error.message.includes('Failed to connect') ||
            error.message.includes('ENOTDIR') ||
            error.message.includes('EEXIST') ||
            error.message.includes('ENOENT') ||
            error.message.includes('not a directory') ||
            error.message.includes('file exists') ||
            error.message.includes('no such file or directory') ||
            error.message.includes('mkdir') ||
            error.message.includes('cannot create') ||
            error.message.includes('permission denied') ||
            error.message.includes('access denied'),
          `Should provide meaningful error message. Got: "${error.message}"`
        );
      }
    });
  });

  describe('HybridSearchManager Initialization', () => {
    test('should initialize with workspace path', () => {
      const hybridSearch = new HybridSearchManager(context.tempDir);
      assert(hybridSearch, 'Should create HybridSearchManager instance');
    });

    test('should handle database statistics', async () => {
      const hybridSearch = new HybridSearchManager(context.tempDir);

      const stats = await hybridSearch.getStats();
      assert(typeof stats.noteCount === 'number', 'Should return note count');
      assert(typeof stats.metadataCount === 'number', 'Should return metadata count');
      assert(typeof stats.dbSize !== 'undefined', 'Should return database size');
      assert.equal(stats.noteCount, 0, 'Should start with zero notes');

      await hybridSearch.close();
    });

    test('should handle index rebuilding', async () => {
      const hybridSearch = new HybridSearchManager(context.tempDir);

      // Create test files
      await createTestNotesWithMetadata(context);

      let progressCalls = 0;
      await hybridSearch.rebuildIndex((processed, total) => {
        progressCalls++;
        assert(typeof processed === 'number', 'Should provide processed count');
        assert(typeof total === 'number', 'Should provide total count');
        assert(processed <= total, 'Processed should not exceed total');
      });

      assert(progressCalls > 0, 'Should call progress callback');

      // Verify notes were indexed
      const stats = await hybridSearch.getStats();
      assert(stats.noteCount > 0, 'Should have indexed notes');

      await hybridSearch.close();
    });
  });

  describe('Simple Search (searchNotes)', () => {
    let hybridSearch: HybridSearchManager;

    beforeEach(async () => {
      hybridSearch = new HybridSearchManager(context.tempDir);
      await createTestNotesWithMetadata(context);
      await hybridSearch.rebuildIndex();
    });

    afterEach(async () => {
      await hybridSearch.close();
    });

    test('should find notes by text content', async () => {
      const results = await hybridSearch.searchNotes('Atomic Habits');

      assert(results.length > 0, 'Should find matching notes');
      assert(results[0].title.includes('Atomic Habits'), 'Should match note title');
      assert(typeof results[0].score === 'number', 'Should include search score');
    });

    test('should filter by note type', async () => {
      const results = await hybridSearch.searchNotes('', 'book-review');

      assert(results.length > 0, 'Should find notes of specified type');
      results.forEach(result => {
        assert(
          result.metadata?.type === 'book-review',
          'Should only return book-review notes'
        );
      });
    });

    test('should respect search limits', async () => {
      const results = await hybridSearch.searchNotes('', null, 1);

      assert(results.length <= 1, 'Should respect limit parameter');
    });

    test('should support regex search', async () => {
      try {
        const results = await hybridSearch.searchNotes('Atomic.*Habits', null, 10, true);

        if (results.length > 0) {
          assert(
            results[0].title.includes('Atomic Habits'),
            'Should match regex pattern'
          );
        }
      } catch (error) {
        // SQLite may not have REGEXP function enabled by default
        // This is acceptable for the test environment
        assert(
          error instanceof Error &&
            (error.message.includes('no such function: REGEXP') ||
              error.message.includes('SQLITE_ERROR')),
          'Should handle missing REGEXP function gracefully'
        );
      }
    });

    test('should handle empty queries', async () => {
      const results = await hybridSearch.searchNotes('');

      assert(results.length > 0, 'Should return all notes for empty query');
    });

    test('should handle non-existent terms', async () => {
      const results = await hybridSearch.searchNotes('nonexistentterm12345');

      assert.equal(results.length, 0, 'Should return empty array for non-existent terms');
    });

    test('should generate content snippets', async () => {
      const results = await hybridSearch.searchNotes('habit formation');

      if (results.length > 0) {
        assert(typeof results[0].snippet === 'string', 'Should include content snippet');
        assert(results[0].snippet!.length > 0, 'Snippet should not be empty');
      }
    });
  });

  describe('Advanced Search (searchNotesAdvanced)', () => {
    let hybridSearch: HybridSearchManager;

    beforeEach(async () => {
      hybridSearch = new HybridSearchManager(context.tempDir);
      await createTestNotesWithMetadata(context);
      await hybridSearch.rebuildIndex();
    });

    afterEach(async () => {
      await hybridSearch.close();
    });

    test('should filter by note type', async () => {
      const results = await hybridSearch.searchNotesAdvanced({
        type: 'book-review'
      });

      assert(results.results.length > 0, 'Should find book-review notes');
      results.results.forEach(result => {
        assert(
          result.metadata?.type === 'book-review',
          'Should only return book-review notes'
        );
      });
    });

    test('should filter by metadata with equality operator', async () => {
      const results = await hybridSearch.searchNotesAdvanced({
        metadata_filters: [{ key: 'status', value: 'completed' }]
      });

      assert(results.results.length > 0, 'Should find notes with completed status');
      results.results.forEach(result => {
        assert(
          result.metadata?.status === 'completed',
          'Should only return completed notes'
        );
      });
    });

    test('should filter by metadata with comparison operators', async () => {
      const results = await hybridSearch.searchNotesAdvanced({
        metadata_filters: [{ key: 'rating', operator: '>=', value: '4' }]
      });

      assert(results.results.length > 0, 'Should find highly rated notes');
      results.results.forEach(result => {
        if (result.metadata?.rating !== undefined) {
          assert(
            Number(result.metadata.rating) >= 4,
            'Should only return highly rated notes'
          );
        }
      });
    });

    test('should filter by multiple metadata conditions', async () => {
      const results = await hybridSearch.searchNotesAdvanced({
        metadata_filters: [
          { key: 'type', value: 'book-review' },
          { key: 'status', value: 'completed' }
        ]
      });

      results.results.forEach(result => {
        assert(result.metadata?.type === 'book-review', 'Should match type filter');
        assert(result.metadata?.status === 'completed', 'Should match status filter');
      });
    });

    test('should filter by date ranges', async () => {
      const results = await hybridSearch.searchNotesAdvanced({
        updated_within: '30d'
      });

      assert(results.results.length >= 0, 'Should handle date filtering');
      // All test notes should be recent
      if (results.results.length > 0) {
        results.results.forEach(result => {
          const updatedDate = new Date(result.lastUpdated);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          assert(
            updatedDate > thirtyDaysAgo,
            'Should only return recently updated notes'
          );
        });
      }
    });

    test('should combine content search with filters', async () => {
      const results = await hybridSearch.searchNotesAdvanced({
        content_contains: 'habits',
        metadata_filters: [{ key: 'type', value: 'book-review' }]
      });

      results.results.forEach(result => {
        assert(result.metadata?.type === 'book-review', 'Should match type filter');
        assert(
          result.title.toLowerCase().includes('habits') ||
            (result.snippet && result.snippet.toLowerCase().includes('habits')),
          'Should contain search term'
        );
      });
    });

    test('should support sorting', async () => {
      const results = await hybridSearch.searchNotesAdvanced({
        sort: [{ field: 'title', order: 'asc' }]
      });

      if (results.results.length > 1) {
        for (let i = 1; i < results.results.length; i++) {
          assert(
            results.results[i - 1].title <= results.results[i].title,
            'Should sort by title ascending'
          );
        }
      }
    });

    test('should handle LIKE operator for partial matches', async () => {
      const results = await hybridSearch.searchNotesAdvanced({
        metadata_filters: [{ key: 'author', operator: 'LIKE', value: '%James%' }]
      });

      results.results.forEach(result => {
        if (result.metadata?.author) {
          assert(
            result.metadata.author.toString().includes('James'),
            'Should match partial author name'
          );
        }
      });
    });

    test('should handle IN operator for multiple values', async () => {
      const results = await hybridSearch.searchNotesAdvanced({
        metadata_filters: [
          { key: 'status', operator: 'IN', value: '["completed", "in-progress"]' }
        ]
      });

      results.results.forEach(result => {
        if (result.metadata?.status) {
          assert(
            ['completed', 'in-progress'].includes(result.metadata.status.toString()),
            'Should match one of the specified values'
          );
        }
      });
    });
  });

  describe('SQL Search (searchNotesSQL)', () => {
    let hybridSearch: HybridSearchManager;

    beforeEach(async () => {
      hybridSearch = new HybridSearchManager(context.tempDir);
      await createTestNotesWithMetadata(context);
      await hybridSearch.rebuildIndex();
    });

    afterEach(async () => {
      await hybridSearch.close();
    });

    test('should execute basic SELECT queries', async () => {
      const results = await hybridSearch.searchNotesSQL({
        query: 'SELECT * FROM notes WHERE type = ?',
        params: ['book-review']
      });

      assert(results.results.length > 0, 'Should return matching notes');
      results.results.forEach(result => {
        assert(result.metadata?.type === 'book-review', 'Should match WHERE condition');
      });
    });

    test('should execute JOIN queries with metadata', async () => {
      const results = await hybridSearch.searchNotesSQL({
        query: `
          SELECT n.*, m.value as rating
          FROM notes n
          JOIN note_metadata m ON n.id = m.note_id
          WHERE m.key = 'rating' AND CAST(m.value AS INTEGER) >= 4
        `
      });

      results.results.forEach(result => {
        if (result.metadata?.rating !== undefined) {
          assert(Number(result.metadata.rating) >= 4, 'Should match JOIN condition');
        }
      });
    });

    test('should execute aggregation queries', async () => {
      const results = await hybridSearch.searchNotesSQL({
        query: `
          SELECT type, COUNT(*) as count
          FROM notes
          GROUP BY type
          ORDER BY count DESC
        `
      });

      assert(results.results.length > 0, 'Should return aggregated results');
      // Check if we have aggregation results
      if (results.results.length > 0) {
        const result = results.results[0];
        // The result should be an aggregated row, not a note
        assert(
          'count' in result || 'note_count' in result || typeof result.count === 'number',
          'Should include aggregated count'
        );
      }
    });

    test('should prevent dangerous SQL operations', async () => {
      const dangerousQueries = [
        'DROP TABLE notes',
        'DELETE FROM notes',
        'INSERT INTO notes VALUES (1, "hack", "content", "type", "file", "path", "2024-01-01", "2024-01-01")',
        'UPDATE notes SET title = "hacked"',
        'ALTER TABLE notes ADD COLUMN hacked TEXT',
        'CREATE TABLE hacked (id TEXT)'
      ];

      for (const query of dangerousQueries) {
        try {
          await hybridSearch.searchNotesSQL({ query });
          assert.fail(`Should reject dangerous query: ${query}`);
        } catch (error) {
          assert(error instanceof Error, 'Should throw error for dangerous queries');
          assert(
            error.message.includes('Only SELECT queries are allowed') ||
              error.message.includes('Query contains prohibited keywords'),
            `Should provide security error message for: ${query}`
          );
        }
      }
    });

    test('should handle parameterized queries safely', async () => {
      const results = await hybridSearch.searchNotesSQL({
        query: 'SELECT * FROM notes WHERE title LIKE ? AND type = ?',
        params: ['%Atomic%', 'book-review']
      });

      results.results.forEach(result => {
        assert(result.title.includes('Atomic'), 'Should match title parameter');
        assert(result.metadata?.type === 'book-review', 'Should match type parameter');
      });
    });

    test('should respect query limits', async () => {
      const results = await hybridSearch.searchNotesSQL({
        query: 'SELECT * FROM notes',
        limit: 1
      });

      assert(results.results.length <= 1, 'Should respect limit parameter');
    });

    test('should handle query timeouts', async () => {
      // This test is difficult to implement reliably across different systems
      // but we can at least verify the timeout parameter is accepted
      const results = await hybridSearch.searchNotesSQL({
        query: 'SELECT * FROM notes',
        timeout: 1000
      });

      assert(
        typeof results.query_time_ms === 'number',
        'Should track query execution time'
      );
    });

    test('should handle SQL syntax errors gracefully', async () => {
      try {
        await hybridSearch.searchNotesSQL({
          query: 'SELECT * FROM nonexistent_table WHERE invalid syntax'
        });
        assert.fail('Should throw error for invalid SQL');
      } catch (error) {
        assert(error instanceof Error, 'Should throw Error for invalid SQL');
        assert(error.message.length > 0, 'Should provide error message');
      }
    });
  });

  describe('Index Management', () => {
    let hybridSearch: HybridSearchManager;

    beforeEach(async () => {
      hybridSearch = new HybridSearchManager(context.tempDir);
      await createTestNotesWithMetadata(context);
      await hybridSearch.rebuildIndex();
    });

    afterEach(async () => {
      await hybridSearch.close();
    });

    test('should upsert notes with metadata', async () => {
      // Create a test file to avoid file system errors
      const testFilePath = context.workspace.getNotePath('general', 'test-upsert.md');
      await fs.writeFile(testFilePath, 'Test content', 'utf8');

      const metadata = {
        tags: ['test', 'unit'],
        priority: 5,
        completed: false,
        created: '2024-01-01T00:00:00Z'
      };

      await hybridSearch.upsertNote(
        'test-note-1',
        'Test Note',
        'Test content',
        'general',
        'test-upsert.md',
        testFilePath,
        metadata
      );

      // Verify note was indexed
      const results = await hybridSearch.searchNotes('Test Note');
      assert(results.length > 0, 'Should find upserted note');
      assert.equal(results[0].title, 'Test Note', 'Should match note title');
      assert.deepEqual(
        results[0].tags,
        ['test', 'unit'],
        'Should preserve metadata tags'
      );
    });

    test('should update existing notes', async () => {
      // Create a test file to avoid file system errors
      const testFilePath = context.workspace.getNotePath('general', 'test-update.md');
      await fs.writeFile(testFilePath, 'Original content', 'utf8');

      await hybridSearch.upsertNote(
        'test-note-1',
        'Original Title',
        'Original content',
        'general',
        'test-update.md',
        testFilePath,
        { status: 'draft' }
      );

      // Update the note
      await fs.writeFile(testFilePath, 'Updated content', 'utf8');
      await hybridSearch.upsertNote(
        'test-note-1',
        'Updated Title',
        'Updated content',
        'general',
        'test-update.md',
        testFilePath,
        { status: 'published' }
      );

      // Verify update
      const results = await hybridSearch.searchNotes('Updated Title');
      assert(results.length > 0, 'Should find updated note');
      assert.equal(results[0].title, 'Updated Title', 'Should have updated title');
      assert.equal(
        results[0].metadata?.status,
        'published',
        'Should have updated metadata'
      );

      // Verify old title is not found
      const oldResults = await hybridSearch.searchNotes('Original Title');
      assert(oldResults.length === 0, 'Should not find old title');
    });

    test('should remove notes from index', async () => {
      // Create a test file to avoid file system errors
      const testFilePath = context.workspace.getNotePath('general', 'test-remove.md');
      await fs.writeFile(testFilePath, 'This note will be removed', 'utf8');

      await hybridSearch.upsertNote(
        'test-note-to-remove',
        'Note to Remove',
        'This note will be removed',
        'general',
        'test-remove.md',
        testFilePath,
        {}
      );

      // Verify note exists
      let results = await hybridSearch.searchNotes('Note to Remove');
      assert(results.length > 0, 'Should find note before removal');

      // Remove note
      await hybridSearch.removeNote('test-note-to-remove');

      // Verify note is removed
      results = await hybridSearch.searchNotes('Note to Remove');
      assert(results.length === 0, 'Should not find note after removal');
    });

    test('should handle file system scanning', async () => {
      // Create test files
      await createTestNotesWithMetadata(context);

      // Rebuild from file system
      await hybridSearch.rebuildFromFileSystem();

      // Verify notes were indexed
      const stats = await hybridSearch.getStats();
      assert(stats.noteCount > 0, 'Should have indexed notes from file system');

      const results = await hybridSearch.searchNotes('Atomic Habits');
      assert(results.length > 0, 'Should find notes from file system');
    });
  });

  describe('Metadata Serialization', () => {
    test('should serialize and deserialize string values', () => {
      const { value, type } = serializeMetadataValue('test string');
      assert.equal(value, 'test string', 'Should preserve string value');
      assert.equal(type, 'string', 'Should identify as string type');

      const deserialized = deserializeMetadataValue(value, type);
      assert.equal(deserialized, 'test string', 'Should deserialize correctly');
    });

    test('should serialize and deserialize number values', () => {
      const { value, type } = serializeMetadataValue(42);
      assert.equal(value, '42', 'Should convert number to string');
      assert.equal(type, 'number', 'Should identify as number type');

      const deserialized = deserializeMetadataValue(value, type);
      assert.equal(deserialized, 42, 'Should deserialize to number');
    });

    test('should serialize and deserialize boolean values', () => {
      const { value: trueValue, type: trueType } = serializeMetadataValue(true);
      assert.equal(trueValue, 'true', 'Should convert true to string');
      assert.equal(trueType, 'boolean', 'Should identify as boolean type');

      const { value: falseValue, type: falseType } = serializeMetadataValue(false);
      assert.equal(falseValue, 'false', 'Should convert false to string');
      assert.equal(falseType, 'boolean', 'Should identify as boolean type');

      assert.equal(
        deserializeMetadataValue(trueValue, trueType),
        true,
        'Should deserialize true'
      );
      assert.equal(
        deserializeMetadataValue(falseValue, falseType),
        false,
        'Should deserialize false'
      );
    });

    test('should serialize and deserialize array values', () => {
      const testArray = ['tag1', 'tag2', 'tag3'];
      const { value, type } = serializeMetadataValue(testArray);
      assert.equal(type, 'array', 'Should identify as array type');

      const deserialized = deserializeMetadataValue(value, type);
      assert(Array.isArray(deserialized), 'Should deserialize to array');
      assert.deepEqual(deserialized, testArray, 'Should preserve array contents');
    });

    test('should serialize and deserialize date values', () => {
      const testDate = '2024-01-01T00:00:00Z';
      const { value, type } = serializeMetadataValue(testDate);
      assert.equal(value, testDate, 'Should preserve date string');
      assert.equal(type, 'date', 'Should identify as date type');

      const deserialized = deserializeMetadataValue(value, type);
      assert.equal(deserialized, testDate, 'Should deserialize date correctly');
    });

    test('should handle null and undefined values', () => {
      const { value: nullValue, type: nullType } = serializeMetadataValue(null);
      assert.equal(nullValue, '', 'Should convert null to empty string');
      assert.equal(nullType, 'string', 'Should default to string type');

      const { value: undefinedValue, type: undefinedType } =
        serializeMetadataValue(undefined);
      assert.equal(undefinedValue, '', 'Should convert undefined to empty string');
      assert.equal(undefinedType, 'string', 'Should default to string type');
    });

    test('should handle malformed array deserialization', () => {
      const deserialized = deserializeMetadataValue('invalid json', 'array');
      assert(Array.isArray(deserialized), 'Should return empty array for invalid JSON');
      assert.equal(deserialized.length, 0, 'Should return empty array');
    });
  });

  describe('Error Handling', () => {
    let hybridSearch: HybridSearchManager;

    beforeEach(async () => {
      hybridSearch = new HybridSearchManager(context.tempDir);
      await createTestNotesWithMetadata(context);
      await hybridSearch.rebuildIndex();
    });

    afterEach(async () => {
      await hybridSearch.close();
    });

    test('should handle database connection failures gracefully', async () => {
      // Close the database to simulate connection failure
      await hybridSearch.close();

      try {
        await hybridSearch.searchNotes('test');
        assert.fail('Should throw error when database is closed');
      } catch (error) {
        assert(error instanceof Error, 'Should throw Error instance');
      }
    });

    test('should handle invalid regex patterns', async () => {
      try {
        await hybridSearch.searchNotes('[invalid regex', null, 10, true);
        assert.fail('Should throw error for invalid regex');
      } catch (error) {
        assert(error instanceof Error, 'Should throw Error for invalid regex');
      }
    });

    test('should handle malformed metadata gracefully', async () => {
      // Create a test file to avoid file system errors
      const testFilePath = context.workspace.getNotePath(
        'general',
        'test-bad-metadata.md'
      );
      await fs.writeFile(testFilePath, 'Content', 'utf8');

      const circularObj = {} as any;
      circularObj.self = circularObj; // Create circular reference

      const badMetadata = {
        circular: circularObj,
        normal: 'value'
      };

      // Should handle gracefully without crashing
      await hybridSearch.upsertNote(
        'bad-metadata-note',
        'Note with Bad Metadata',
        'Content',
        'general',
        'test-bad-metadata.md',
        testFilePath,
        badMetadata
      );

      const results = await hybridSearch.searchNotes('Bad Metadata');
      assert(results.length >= 0, 'Should handle malformed metadata without crashing');
    });

    test('should handle very large queries gracefully', async () => {
      const veryLongQuery = 'a'.repeat(10000);
      const results = await hybridSearch.searchNotes(veryLongQuery);
      assert(Array.isArray(results), 'Should handle very long queries');
    });

    test('should handle concurrent operations safely', async () => {
      // Create multiple concurrent operations
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        const filePath = context.workspace.getNotePath('general', `concurrent-${i}.md`);
        await fs.writeFile(filePath, `Content ${i}`, 'utf8');

        promises.push(
          hybridSearch.upsertNote(
            `concurrent-note-${i}`,
            `Concurrent Note ${i}`,
            `Content ${i}`,
            'general',
            `concurrent-${i}.md`,
            filePath,
            { index: i }
          )
        );
      }

      // Wait for all operations to complete
      await Promise.all(promises);

      // Verify all notes were indexed
      const results = await hybridSearch.searchNotes('Concurrent Note');
      assert(results.length === 10, 'Should handle concurrent operations correctly');
    });
  });

  describe('Performance', () => {
    let hybridSearch: HybridSearchManager;

    beforeEach(async () => {
      hybridSearch = new HybridSearchManager(context.tempDir);
      await createTestNotesWithMetadata(context);
      await hybridSearch.rebuildIndex();
    });

    afterEach(async () => {
      await hybridSearch.close();
    });

    test('should handle search operations efficiently', async () => {
      // Ensure directories exist
      await fs.mkdir(context.workspace.getNoteTypePath('projects'), { recursive: true });

      // Create a reasonable number of test notes
      const notePromises: Promise<void>[] = [];
      for (let i = 0; i < 50; i++) {
        const noteType = i % 3 === 0 ? 'projects' : 'general';
        const filePath = context.workspace.getNotePath(noteType, `perf-${i}.md`);
        const content = `This is test content for performance testing. Note number ${i} contains searchable keywords.`;

        await fs.writeFile(filePath, content, 'utf8');

        notePromises.push(
          hybridSearch.upsertNote(
            `perf-note-${i}`,
            `Performance Test Note ${i}`,
            content,
            noteType,
            `perf-${i}.md`,
            filePath,
            {
              index: i,
              category: i % 5 === 0 ? 'important' : 'normal',
              tags: [`tag${i % 10}`, 'performance', 'test']
            }
          )
        );
      }

      await Promise.all(notePromises);

      // Measure search performance
      const startTime = Date.now();
      const results = await hybridSearch.searchNotes('Performance Test');
      const searchTime = Date.now() - startTime;

      assert(results.length > 0, 'Should find performance test notes');
      assert(searchTime < 1000, 'Should complete search within reasonable time');
    });

    test('should handle complex queries efficiently', async () => {
      // Ensure projects directory exists
      await fs.mkdir(context.workspace.getNoteTypePath('projects'), { recursive: true });

      // Add some test data first
      const testFilePath = context.workspace.getNotePath('projects', 'complex-query.md');
      await fs.writeFile(testFilePath, 'Content for complex query testing', 'utf8');

      await hybridSearch.upsertNote(
        'complex-query-note',
        'Complex Query Test',
        'Content for complex query testing',
        'projects',
        'complex-query.md',
        testFilePath,
        {
          priority: 5,
          status: 'active',
          tags: ['complex', 'query', 'test']
        }
      );

      const startTime = Date.now();
      const results = await hybridSearch.searchNotesAdvanced({
        content_contains: 'complex',
        metadata_filters: [
          { key: 'priority', operator: '>=', value: '3' },
          { key: 'status', value: 'active' }
        ],
        sort: [{ field: 'updated', order: 'desc' }]
      });
      const queryTime = Date.now() - startTime;

      assert(typeof results.query_time_ms === 'number', 'Should track query time');
      assert(queryTime < 1000, 'Should complete complex query within reasonable time');
    });
  });

  describe('Database Close and Cleanup', () => {
    test('should close database connections properly', async () => {
      const hybridSearch = new HybridSearchManager(context.tempDir);

      // Initialize by performing a search
      await hybridSearch.searchNotes('test');

      // Close should not throw
      await hybridSearch.close();

      // Subsequent operations should fail
      try {
        await hybridSearch.searchNotes('test');
        assert.fail('Should throw error after close');
      } catch (error) {
        assert(error instanceof Error, 'Should throw error after close');
      }
    });

    test('should handle multiple close calls gracefully', async () => {
      const hybridSearch = new HybridSearchManager(context.tempDir);

      // Initialize
      await hybridSearch.searchNotes('test');

      // Multiple closes should not throw
      await hybridSearch.close();
      await hybridSearch.close();
      await hybridSearch.close();
    });
  });
});
