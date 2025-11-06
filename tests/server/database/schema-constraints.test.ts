/**
 * Tests for database schema constraints
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestApiSetup } from '../api/test-setup.js';

describe('Database Schema Constraints', () => {
  let testSetup: TestApiSetup;
  let testVaultId: string;

  beforeEach(async () => {
    testSetup = new TestApiSetup();
    await testSetup.setup();
    testVaultId = await testSetup.createTestVault('schema-constraints-test');
  });

  afterEach(async () => {
    await testSetup.cleanup();
  });

  // Helper to get database connection
  async function getDb() {
    const { hybridSearchManager } = await (testSetup.api as any).getVaultContext(
      testVaultId
    );
    return await hybridSearchManager.getDatabaseConnection();
  }

  describe('UNIQUE constraint on (type, filename)', () => {
    it('should enforce UNIQUE constraint on (type, filename)', async () => {
      const db = await getDb();

      // Insert a note
      await db.run(
        `INSERT INTO notes (id, type, filename, path, title, content, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'n-12345678',
          'general',
          'test.md',
          '',
          'Test',
          'Content',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Attempt to insert another note with same (type, filename) but different ID
      // This should fail with UNIQUE constraint violation
      await expect(
        db.run(
          `INSERT INTO notes (id, type, filename, path, title, content, created, updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'n-87654321',
            'general',
            'test.md',
            '',
            'Test 2',
            'Content 2',
            '2024-01-02',
            '2024-01-02'
          ]
        )
      ).rejects.toThrow(/UNIQUE constraint failed/);
    });

    it('should allow same filename in different types', async () => {
      const db = await getDb();

      // Insert a note with type 'general'
      await db.run(
        `INSERT INTO notes (id, type, filename, path, title, content, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'n-12345678',
          'general',
          'test.md',
          '',
          'Test',
          'Content',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Insert another note with same filename but different type - should succeed
      await expect(
        db.run(
          `INSERT INTO notes (id, type, filename, path, title, content, created, updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'n-87654321',
            'meeting',
            'test.md',
            '',
            'Test 2',
            'Content 2',
            '2024-01-02',
            '2024-01-02'
          ]
        )
      ).resolves.toBeDefined();

      // Verify both notes exist
      const notes = await db.all('SELECT id, type, filename FROM notes ORDER BY type');
      expect(notes).toHaveLength(2);
      expect(notes[0]).toMatchObject({
        id: 'n-12345678',
        type: 'general',
        filename: 'test.md'
      });
      expect(notes[1]).toMatchObject({
        id: 'n-87654321',
        type: 'meeting',
        filename: 'test.md'
      });
    });

    it('should allow different filenames in same type', async () => {
      const db = await getDb();

      // Insert first note
      await db.run(
        `INSERT INTO notes (id, type, filename, path, title, content, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'n-12345678',
          'general',
          'test1.md',
          '',
          'Test 1',
          'Content 1',
          '2024-01-01',
          '2024-01-01'
        ]
      );

      // Insert second note with same type but different filename - should succeed
      await expect(
        db.run(
          `INSERT INTO notes (id, type, filename, path, title, content, created, updated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'n-87654321',
            'general',
            'test2.md',
            '',
            'Test 2',
            'Content 2',
            '2024-01-02',
            '2024-01-02'
          ]
        )
      ).resolves.toBeDefined();

      // Verify both notes exist
      const notes = await db.all(
        'SELECT id, type, filename FROM notes ORDER BY filename'
      );
      expect(notes).toHaveLength(2);
      expect(notes[0]).toMatchObject({
        id: 'n-12345678',
        type: 'general',
        filename: 'test1.md'
      });
      expect(notes[1]).toMatchObject({
        id: 'n-87654321',
        type: 'general',
        filename: 'test2.md'
      });
    });

    it('should verify constraint exists in schema', async () => {
      const db = await getDb();

      // Query SQLite schema to verify the UNIQUE constraint exists
      const tableInfo = await db.all(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'`
      );

      expect(tableInfo).toHaveLength(1);
      const createTableSql = tableInfo[0].sql;

      // Verify the UNIQUE constraint is in the schema
      expect(createTableSql).toMatch(/UNIQUE\s*\(\s*type\s*,\s*filename\s*\)/i);
    });
  });
});
