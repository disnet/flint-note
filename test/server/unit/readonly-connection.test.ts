import assert from 'assert';
import { describe, test, beforeEach, afterEach } from 'node:test';
import path from 'path';
import fs from 'fs/promises';
import { HybridSearchManager } from '../../src/database/search-manager.js';
import { DatabaseManager } from '../../src/database/schema.js';

describe('Read-Only Connection Tests', () => {
  const testWorkspacePath = path.join(
    process.cwd(),
    'test',
    'fixtures',
    'readonly-test-workspace'
  );
  let searchManager: HybridSearchManager;
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Clean up any existing test workspace
    try {
      await fs.rm(testWorkspacePath, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }

    // Create test workspace
    await fs.mkdir(testWorkspacePath, { recursive: true });

    // Initialize managers
    searchManager = new HybridSearchManager(testWorkspacePath);
    dbManager = new DatabaseManager(testWorkspacePath);

    // Create a test note first using regular connection
    const testFilePath = path.join(testWorkspacePath, 'test-note.md');
    await fs.writeFile(testFilePath, 'This is test content for search', 'utf8');

    await searchManager.upsertNote(
      'test-note-1',
      'Test Note',
      'This is test content for search',
      'general',
      'test-note.md',
      testFilePath,
      {
        title: 'Test Note',
        type: 'general',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        filename: 'test-note.md',
        tags: ['test']
      }
    );
  });

  afterEach(async () => {
    await searchManager.close();
    await dbManager.close();

    // Clean up test workspace
    try {
      await fs.rm(testWorkspacePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('search methods should use read-only connection', async () => {
    // Test basic search
    const searchResults = await searchManager.searchNotes('test');
    assert.ok(searchResults.length > 0, 'Should find test notes');
    assert.strictEqual(searchResults[0].title, 'Test Note', 'Should return correct note');

    // Test advanced search
    const advancedResults = await searchManager.searchNotesAdvanced({
      content_contains: 'test',
      limit: 10
    });
    assert.ok(advancedResults.results.length > 0, 'Advanced search should find results');
    assert.strictEqual(
      advancedResults.results[0].title,
      'Test Note',
      'Should return correct note'
    );

    // Test SQL search
    const sqlResults = await searchManager.searchNotesSQL({
      query: 'SELECT * FROM notes WHERE title LIKE ?',
      params: ['%Test%']
    });
    assert.ok(sqlResults.results.length > 0, 'SQL search should find results');
    assert.strictEqual(
      sqlResults.results[0].title,
      'Test Note',
      'Should return correct note'
    );
  });

  test('read-only connection should prevent write operations', async () => {
    // Get a read-only connection directly
    const readOnlyConnection = await dbManager.connectReadOnly();

    // Attempt to insert data should fail
    await assert.rejects(
      async () => {
        await readOnlyConnection.run(
          `INSERT INTO notes (id, title, content, type, path, filename, created, updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'test-write',
            'Write Test',
            'Content',
            'general',
            '/test',
            'test.md',
            new Date().toISOString(),
            new Date().toISOString()
          ]
        );
      },
      /readonly/i,
      'Read-only connection should prevent INSERT operations'
    );

    // Attempt to update data should fail
    await assert.rejects(
      async () => {
        await readOnlyConnection.run('UPDATE notes SET title = ? WHERE id = ?', [
          'Updated Title',
          'test-note-1'
        ]);
      },
      /readonly/i,
      'Read-only connection should prevent UPDATE operations'
    );

    // Attempt to delete data should fail
    await assert.rejects(
      async () => {
        await readOnlyConnection.run('DELETE FROM notes WHERE id = ?', ['test-note-1']);
      },
      /readonly/i,
      'Read-only connection should prevent DELETE operations'
    );

    // But SELECT operations should work fine
    const selectResult = await readOnlyConnection.all(
      'SELECT * FROM notes WHERE id = ?',
      ['test-note-1']
    );
    assert.ok(
      selectResult.length > 0,
      'Read-only connection should allow SELECT operations'
    );

    await readOnlyConnection.close();
  });

  test('read-only and read-write connections should coexist', async () => {
    // Get both types of connections
    const readWriteConnection = await dbManager.connect();
    const readOnlyConnection = await dbManager.connectReadOnly();

    // Read-write should be able to insert
    await readWriteConnection.run(
      `INSERT INTO notes (id, title, content, type, path, filename, created, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'test-coexist',
        'Coexist Test',
        'Content',
        'general',
        '/test',
        'coexist.md',
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );

    // Read-only should be able to see the new data
    const readOnlyResult = await readOnlyConnection.all(
      'SELECT * FROM notes WHERE id = ?',
      ['test-coexist']
    );
    assert.strictEqual(
      readOnlyResult.length,
      1,
      'Read-only connection should see data inserted by read-write connection'
    );

    // But read-only should still not be able to write
    await assert.rejects(
      async () => {
        await readOnlyConnection.run('DELETE FROM notes WHERE id = ?', ['test-coexist']);
      },
      /readonly/i,
      'Read-only connection should still prevent write operations'
    );

    await readWriteConnection.close();
    await readOnlyConnection.close();
  });

  test('connection lifecycle management', async () => {
    // Test that connections are properly managed
    const initialSearchResults = await searchManager.searchNotes('test');
    assert.ok(initialSearchResults.length > 0, 'Initial search should work');

    // Close and ensure cleanup
    await searchManager.close();

    // Create new instance and verify it works
    const newSearchManager = new HybridSearchManager(testWorkspacePath);
    const newSearchResults = await newSearchManager.searchNotes('test');
    assert.ok(
      newSearchResults.length > 0,
      'New search manager should work after previous one was closed'
    );

    await newSearchManager.close();
  });
});
