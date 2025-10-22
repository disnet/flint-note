/**
 * Tests for DatabaseMigrationManager
 *
 * These tests verify the migration system works correctly including:
 * - Fresh migrations from v1.1.0 to v2.0.1
 * - Partial migration recovery (when migration fails mid-way)
 * - Idempotency (running migration multiple times)
 * - Schema validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseMigrationManager } from '../../../src/server/database/migration-manager.js';
import type {
  DatabaseConnection,
  DatabaseManager
} from '../../../src/server/database/schema.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

/**
 * Create a minimal DatabaseManager-like object for testing
 * This bypasses the automatic schema initialization
 */
class TestDatabaseManager {
  private db: sqlite3.Database | null = null;
  private dbPath: string;
  private workspacePath: string;

  constructor(dbPath: string, workspacePath: string) {
    this.dbPath = dbPath;
    this.workspacePath = workspacePath;
  }

  async connect(): Promise<DatabaseConnection> {
    if (this.db) {
      return this.createConnection(this.db);
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(
        this.dbPath,
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        (err) => {
          if (err) {
            reject(new Error(`Failed to connect to database: ${err.message}`));
            return;
          }
          // Don't call initializeSchema - let tests create their own schema
          resolve(this.createConnection(this.db!));
        }
      );
    });
  }

  private createConnection(db: sqlite3.Database): DatabaseConnection {
    const close = promisify(db.close.bind(db));

    return {
      db,
      run: async (sql: string, params?: (string | number | boolean | null)[]) => {
        return new Promise<sqlite3.RunResult>((resolve, reject) => {
          if (params && params.length > 0) {
            db.run(sql, params, function (err) {
              if (err) reject(err);
              else resolve(this);
            });
          } else {
            db.run(sql, function (err) {
              if (err) reject(err);
              else resolve(this);
            });
          }
        });
      },
      get: async <T = unknown>(
        sql: string,
        params?: (string | number | boolean | null)[]
      ) => {
        return new Promise<T | undefined>((resolve, reject) => {
          if (params && params.length > 0) {
            db.get(sql, params, (err, row) => {
              if (err) reject(err);
              else resolve(row as T | undefined);
            });
          } else {
            db.get(sql, (err, row) => {
              if (err) reject(err);
              else resolve(row as T | undefined);
            });
          }
        });
      },
      all: async <T = unknown>(
        sql: string,
        params?: (string | number | boolean | null)[]
      ) => {
        return new Promise<T[]>((resolve, reject) => {
          if (params && params.length > 0) {
            db.all(sql, params, (err, rows) => {
              if (err) reject(err);
              else resolve(rows as T[]);
            });
          } else {
            db.all(sql, (err, rows) => {
              if (err) reject(err);
              else resolve(rows as T[]);
            });
          }
        });
      },
      close: async () => {
        await close();
        this.db = null;
      }
    };
  }

  async close() {
    if (this.db) {
      const connection = this.createConnection(this.db);
      await connection.close();
    }
  }

  // Stub methods required by DatabaseManager interface
  async rebuild() {
    // Minimal rebuild implementation for tests
    // Ensure all necessary tables exist for migration v1.1.0
    const db = await this.connect();

    // Create notes table if it doesn't exist
    const tableExists = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='notes'"
    );

    if (!tableExists || tableExists.count === 0) {
      // Create basic notes table for rebuild
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);
    }

    // Create link tables for v1.1.0 migration
    const linkTableExists = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='note_links'"
    );

    if (!linkTableExists || linkTableExists.count === 0) {
      await db.run(`
        CREATE TABLE note_links (
          id INTEGER PRIMARY KEY,
          source_note_id TEXT NOT NULL,
          target_note_id TEXT,
          target_title TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY(target_note_id) REFERENCES notes(id) ON DELETE SET NULL
        )
      `);
    }

    const externalLinksTableExists = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='external_links'"
    );

    if (!externalLinksTableExists || externalLinksTableExists.count === 0) {
      await db.run(`
        CREATE TABLE external_links (
          id INTEGER PRIMARY KEY,
          note_id TEXT NOT NULL,
          url TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);
    }
  }
}

describe('DatabaseMigrationManager', () => {
  let testDir: string;
  let workspacePath: string;
  let dbManager: TestDatabaseManager;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(
      os.tmpdir(),
      `flint-migration-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    );
    await fs.mkdir(testDir, { recursive: true });

    workspacePath = path.join(testDir, 'test-vault');
    await fs.mkdir(workspacePath, { recursive: true });

    // Create .flint-note directory
    await fs.mkdir(path.join(workspacePath, '.flint-note'), { recursive: true });

    // Create note type directory
    await fs.mkdir(path.join(workspacePath, 'note'), { recursive: true });

    // Initialize test database manager
    const dbPath = path.join(workspacePath, '.flint-note', 'search.db');
    dbManager = new TestDatabaseManager(dbPath, workspacePath);
  });

  afterEach(async () => {
    // Cleanup
    if (dbManager) {
      await dbManager.close();
    }
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper: Create a database with v1.1.0 schema (old identifier-based system)
   */
  async function createV1_1_0_Database(noteCount: number) {
    const db = await dbManager.connect();

    // Create v1.1.0 schema (before immutable IDs)
    await db.run(`
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        title TEXT,
        content TEXT,
        content_hash TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        size INTEGER,
        UNIQUE(type, filename)
      )
    `);

    await db.run(`
      CREATE TABLE note_links (
        id INTEGER PRIMARY KEY,
        source_note_id TEXT NOT NULL,
        target_note_id TEXT,
        target_title TEXT NOT NULL,
        link_text TEXT,
        line_number INTEGER,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY(target_note_id) REFERENCES notes(id) ON DELETE SET NULL
      )
    `);

    await db.run(`
      CREATE TABLE external_links (
        id INTEGER PRIMARY KEY,
        note_id TEXT NOT NULL,
        url TEXT NOT NULL,
        link_text TEXT,
        line_number INTEGER,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      )
    `);

    // Create test notes with old-style IDs (type/filename)
    const notes = [];
    for (let i = 0; i < noteCount; i++) {
      const filename = `test-note-${i}.md`;
      const oldStyleId = `note/${filename.replace('.md', '')}`;
      const title = `Test Note ${i}`;
      const content = `---
created: 2025-01-01T00:00:00.000Z
---

# ${title}

This is test note ${i}`;

      const filepath = path.join(workspacePath, 'note', filename);
      await fs.writeFile(filepath, content);

      const created = '2025-01-01T00:00:00.000Z';
      const updated = '2025-01-01T00:00:00.000Z';

      await db.run(
        `
        INSERT INTO notes (id, type, filename, path, title, content, content_hash, created, updated, size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          oldStyleId,
          'note',
          filename,
          filepath,
          title,
          content,
          'hash123',
          created,
          updated,
          100
        ]
      );

      notes.push({ id: oldStyleId, filename, title, content });
    }

    return notes;
  }

  /**
   * Helper: Verify all notes were migrated correctly
   */
  async function verifyMigration(originalNotes: any[]) {
    const db = await dbManager.connect();

    // Check new schema exists
    const hasNewSchema = await db.get<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('notes')
      WHERE name='id' AND pk=1
    `);
    expect(hasNewSchema?.count).toBe(1);

    // Check all notes were migrated
    const migratedNotes = await db.all<{ id: string; title: string; filename: string }>(
      'SELECT id, title, filename FROM notes'
    );
    expect(migratedNotes.length).toBe(originalNotes.length);

    // Verify each note has new immutable ID
    for (const note of migratedNotes) {
      expect(note.id).toMatch(/^n-[0-9a-f]{8}$/);
    }

    // Verify mapping table exists and has correct entries
    const mappings = await db.all<{ old_identifier: string; new_id: string }>(
      'SELECT old_identifier, new_id FROM note_id_migration'
    );
    expect(mappings.length).toBe(originalNotes.length);

    // Verify each old ID has a mapping
    for (const original of originalNotes) {
      const mapping = mappings.find((m) => m.old_identifier === original.id);
      expect(mapping).toBeDefined();
      expect(mapping?.new_id).toMatch(/^n-[0-9a-f]{8}$/);
    }

    // Verify frontmatter was updated with IDs
    for (const original of originalNotes) {
      const filepath = path.join(workspacePath, 'note', original.filename);
      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toContain('id: n-');
    }

    return { migratedNotes, mappings };
  }

  describe('Fresh migration from v1.1.0 to v2.2.0', () => {
    it('should successfully migrate a small vault (7 notes)', async () => {
      // Create v1.1.0 database with 7 notes
      const originalNotes = await createV1_1_0_Database(7);

      // Run migration
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '1.1.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      // Verify migration result
      expect(result.migrated).toBe(true);
      expect(result.fromVersion).toBe('1.1.0');
      expect(result.toVersion).toBe('2.4.0');
      expect(result.executedMigrations).toContain('2.0.0');
      expect(result.executedMigrations).toContain('2.0.1');
      expect(result.executedMigrations).toContain('2.1.0');
      expect(result.executedMigrations).toContain('2.2.0');
      expect(result.executedMigrations).toContain('2.3.0');
      expect(result.executedMigrations).toContain('2.4.0');

      // Verify database state
      await verifyMigration(originalNotes);
    });

    it('should successfully migrate an empty vault', async () => {
      // Create v1.1.0 database with no notes
      await createV1_1_0_Database(0);

      // Run migration
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '1.1.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      // Should succeed even with no notes
      expect(result.migrated).toBe(true);
      expect(result.executedMigrations).toContain('2.0.0');
      expect(result.executedMigrations).toContain('2.0.1');

      const db = await dbManager.connect();
      const count = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM notes'
      );
      expect(count?.count).toBe(0);
    });

    it('should successfully migrate a large vault (100 notes)', async () => {
      // Create v1.1.0 database with 100 notes
      const originalNotes = await createV1_1_0_Database(100);

      // Run migration
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '1.1.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      expect(result.migrated).toBe(true);

      // Verify all notes migrated
      const { migratedNotes } = await verifyMigration(originalNotes);
      expect(migratedNotes.length).toBe(100);
    });

    it('should preserve note links during migration', async () => {
      // Create v1.1.0 database
      const originalNotes = await createV1_1_0_Database(3);
      const db = await dbManager.connect();

      // Add some links between notes
      await db.run(
        `
        INSERT INTO note_links (source_note_id, target_note_id, target_title, link_text, line_number)
        VALUES (?, ?, ?, ?, ?)
      `,
        [
          originalNotes[0].id,
          originalNotes[1].id,
          originalNotes[1].title,
          'test-note-1',
          5
        ]
      );

      await db.run(
        `
        INSERT INTO note_links (source_note_id, target_note_id, target_title, link_text, line_number)
        VALUES (?, ?, ?, ?, ?)
      `,
        [
          originalNotes[1].id,
          originalNotes[2].id,
          originalNotes[2].title,
          'test-note-2',
          10
        ]
      );

      // Run migration
      await DatabaseMigrationManager.checkAndMigrate('1.1.0', dbManager, workspacePath);

      // Verify links were migrated with new IDs
      const migratedLinks = await db.all<{
        source_note_id: string;
        target_note_id: string;
        target_title: string;
      }>('SELECT source_note_id, target_note_id, target_title FROM note_links');

      expect(migratedLinks.length).toBe(2);

      // All IDs should be new immutable IDs
      for (const link of migratedLinks) {
        expect(link.source_note_id).toMatch(/^n-[0-9a-f]{8}$/);
        if (link.target_note_id) {
          expect(link.target_note_id).toMatch(/^n-[0-9a-f]{8}$/);
        }
      }
    });
  });

  describe('Partial migration recovery', () => {
    it('should recover from partial migration (empty notes table)', async () => {
      // Create v1.1.0 database
      const originalNotes = await createV1_1_0_Database(7);
      const db = await dbManager.connect();

      // Simulate partial migration: create backup and migration table, but drop notes
      await db.run('CREATE TABLE notes_backup AS SELECT * FROM notes');
      await db.run('DROP TABLE notes');

      // Create new empty notes table (simulating failed migration)
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      // Create migration mapping table (simulating partial migration)
      await db.run(`
        CREATE TABLE note_id_migration (
          old_identifier TEXT PRIMARY KEY,
          new_id TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          filename TEXT NOT NULL
        )
      `);

      // Add some mappings
      for (const note of originalNotes) {
        const newId = 'n-' + crypto.randomBytes(4).toString('hex');
        await db.run(
          'INSERT INTO note_id_migration (old_identifier, new_id, type, filename) VALUES (?, ?, ?, ?)',
          [note.id, newId, 'note', note.filename]
        );
      }

      // Verify we're in a partial state
      const noteCount = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM notes'
      );
      expect(noteCount?.count).toBe(0); // Notes table is empty

      const backupCount = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM notes_backup'
      );
      expect(backupCount?.count).toBe(7); // Backup has data

      // Run migration - should detect partial state and recover
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '1.1.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      expect(result.migrated).toBe(true);

      // Verify recovery - notes should now be populated
      const recoveredCount = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM notes'
      );
      expect(recoveredCount?.count).toBe(7);

      // Verify database state (but skip frontmatter check since this is a recovery scenario)
      const migratedNotes = await db.all<{ id: string; title: string; filename: string }>(
        'SELECT id, title, filename FROM notes'
      );
      expect(migratedNotes.length).toBe(originalNotes.length);

      // Verify each note has immutable ID from migration table
      for (const note of migratedNotes) {
        expect(note.id).toMatch(/^n-[0-9a-f]{8}$/);
      }

      // Note: In a partial migration recovery scenario where migration table was manually
      // created, frontmatter might not be updated. The important thing is that the
      // database is correctly populated with the migrated data.
    });

    it('should handle corrupted migration state (empty notes table)', async () => {
      // Create v1.1.0 database with files
      await createV1_1_0_Database(7);
      const db = await dbManager.connect();

      // Simulate data loss: drop notes table and recreate empty
      // (this simulates a corrupted database where notes table was lost)
      await db.run('DROP TABLE notes');
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      // Migration should succeed but migrate 0 notes (since database is empty)
      // This is expected behavior - if the database is corrupted and empty,
      // migration succeeds with 0 notes. User would need to rebuild index from files.
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '1.1.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      expect(result.migrated).toBe(true);

      // Verify empty database with new schema
      const noteCount = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM notes'
      );
      expect(noteCount?.count).toBe(0);

      // Migration table should exist but be empty
      const migrationCount = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM note_id_migration'
      );
      expect(migrationCount?.count).toBe(0);
    });
  });

  describe('Idempotency', () => {
    it('should skip migration if already completed', async () => {
      // Create and migrate
      const originalNotes = await createV1_1_0_Database(7);
      await DatabaseMigrationManager.checkAndMigrate('1.1.0', dbManager, workspacePath);

      // Get migrated state
      const { migratedNotes: firstRun } = await verifyMigration(originalNotes);

      // Run migration again (with current version)
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '2.4.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      // Should not migrate again
      expect(result.migrated).toBe(false);
      expect(result.executedMigrations.length).toBe(0);

      // Verify data unchanged
      const db = await dbManager.connect();
      const secondRun = await db.all<{ id: string; title: string }>(
        'SELECT id, title FROM notes ORDER BY title'
      );

      // IDs should be identical (not regenerated)
      expect(secondRun.length).toBe(firstRun.length);
      for (let i = 0; i < secondRun.length; i++) {
        expect(secondRun[i].id).toBe(firstRun[i].id);
      }
    });

    it('should handle migration from v1.0.0 through v1.1.0 to v2.2.0', async () => {
      // This tests running multiple migrations in sequence
      const db = await dbManager.connect();

      // Create v1.0.0 schema (no link tables)
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER
        )
      `);

      // Add a test note
      const filename = 'test.md';
      const filepath = path.join(workspacePath, 'note', filename);
      await fs.writeFile(filepath, '# Test\n\nContent');
      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, content_hash, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'note/test',
          'note',
          filename,
          filepath,
          'Test',
          '# Test',
          'hash',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          100
        ]
      );

      // Run migration from v1.0.0
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '1.0.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      // Should execute all five migrations
      expect(result.migrated).toBe(true);
      expect(result.executedMigrations).toContain('1.1.0');
      expect(result.executedMigrations).toContain('2.0.0');
      expect(result.executedMigrations).toContain('2.0.1');
      expect(result.executedMigrations).toContain('2.1.0');
      expect(result.executedMigrations).toContain('2.2.0');

      // Verify final state has immutable IDs
      const notes = await db.all<{ id: string }>('SELECT id FROM notes');
      expect(notes[0].id).toMatch(/^n-[0-9a-f]{8}$/);
    });
  });

  describe('Schema validation', () => {
    it('should validate v2.0.0 schema correctly', async () => {
      // Create v2.0.0 database
      await createV1_1_0_Database(5);
      await DatabaseMigrationManager.checkAndMigrate('1.1.0', dbManager, workspacePath);

      const db = await dbManager.connect();
      const isValid = await DatabaseMigrationManager.validateSchema(db, '2.0.0');
      expect(isValid).toBe(true);
    });

    it('should create ui_state table in v2.0.0 migration', async () => {
      // Create v1.1.0 database
      await createV1_1_0_Database(5);

      // Run migration
      await DatabaseMigrationManager.checkAndMigrate('1.1.0', dbManager, workspacePath);

      const db = await dbManager.connect();

      // Verify ui_state table exists
      const tableExists = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='ui_state'"
      );
      expect(tableExists?.count).toBe(1);

      // Verify ui_state table has correct schema
      const columns = await db.all<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>('SELECT name, type, "notnull", pk FROM pragma_table_info(\'ui_state\')');

      const expectedColumns = [
        { name: 'id', type: 'INTEGER', notnull: 0, pk: 1 },
        { name: 'vault_id', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'state_key', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'state_value', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'schema_version', type: 'TEXT', notnull: 1, pk: 0 },
        { name: 'updated_at', type: 'DATETIME', notnull: 0, pk: 0 }
      ];

      expect(columns.length).toBe(expectedColumns.length);
      for (const expected of expectedColumns) {
        const found = columns.find((c) => c.name === expected.name);
        expect(found).toBeDefined();
        expect(found?.type).toBe(expected.type);
        expect(found?.notnull).toBe(expected.notnull);
        expect(found?.pk).toBe(expected.pk);
      }

      // Verify indexes exist
      const indexes = await db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ui_state'"
      );

      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_ui_state_vault');
      expect(indexNames).toContain('idx_ui_state_key');
    });

    it('should detect invalid schema', async () => {
      // Create database with incomplete schema (missing tables)
      const db = await dbManager.connect();

      // Create only one table, missing link tables
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL
        )
      `);

      // Should detect missing required tables for v1.1.0
      const isValid = await DatabaseMigrationManager.validateSchema(db, '1.1.0');
      expect(isValid).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should preserve existing frontmatter when adding ID', async () => {
      const db = await dbManager.connect();

      // Create v1.1.0 schema
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      // Create note with complex frontmatter (like onboarding notes)
      const filename = 'tutorial-1.md';
      const oldStyleId = `note/${filename.replace('.md', '')}`;
      const noteContent = `---
title: "Tutorial 1: Your First Daily Note"
filename: "tutorial-1-your-first-daily-note"
type: note
created: "2025-10-08T04:10:37.503Z"
updated: "2025-10-08T04:10:37.502Z"
tags: ["tutorial", "onboarding"]
---

# Tutorial 1: Your First Daily Note

This is a tutorial note with complex frontmatter.`;

      const filepath = path.join(workspacePath, 'note', filename);
      await fs.writeFile(filepath, noteContent);

      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, content_hash, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          oldStyleId,
          'note',
          filename,
          filepath,
          'Tutorial 1',
          noteContent,
          'hash',
          '2025-10-08T04:10:37.503Z',
          '2025-10-08T04:10:37.502Z',
          100
        ]
      );

      // Run migration
      await DatabaseMigrationManager.checkAndMigrate('1.1.0', dbManager, workspacePath);

      // Verify migration succeeded
      const notes = await db.all<{ id: string; filename: string }>(
        'SELECT id, filename FROM notes'
      );
      expect(notes.length).toBe(1);
      expect(notes[0].id).toMatch(/^n-[0-9a-f]{8}$/);

      // Read migrated file and verify YAML is valid
      const migratedContent = await fs.readFile(filepath, 'utf-8');

      // Parse using the same parser the app uses
      const { parseNoteContent } = await import(
        '../../../src/server/utils/yaml-parser.js'
      );
      const parsed = parseNoteContent(migratedContent);

      // Verify metadata was preserved correctly
      expect(parsed.metadata.id).toMatch(/^n-[0-9a-f]{8}$/);
      expect(parsed.metadata.title).toBe('Tutorial 1: Your First Daily Note'); // NOT double-quoted!
      expect(parsed.metadata.filename).toBe('tutorial-1-your-first-daily-note');
      expect(parsed.metadata.type).toBe('note');
      expect(parsed.metadata.created).toBe('2025-10-08T04:10:37.503Z');
      expect(parsed.metadata.updated).toBe('2025-10-08T04:10:37.502Z');
      expect(parsed.metadata.tags).toEqual(['tutorial', 'onboarding']);

      // Verify body content is preserved
      expect(parsed.content).toContain('# Tutorial 1: Your First Daily Note');
      expect(parsed.content).toContain(
        'This is a tutorial note with complex frontmatter.'
      );
    });

    it('should handle frontmatter values with colons and special characters', async () => {
      const db = await dbManager.connect();

      // Create v1.1.0 schema
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      const filename = 'complex-yaml.md';
      const oldStyleId = `note/${filename.replace('.md', '')}`;
      const noteContent = `---
title: "Tutorial 1: Your First Daily Note"
subtitle: "Learn Flint: The Basics"
description: "Notes: Testing \\"Quotes\\" and 'Apostrophes'"
emoji: "🎉 Party!"
count: 42
flag: true
date: 2025-01-01T00:00:00.000Z
tags: ["array", "of", "strings"]
metadata:
  nested: "object"
  value: 123
---

# Content`;

      const filepath = path.join(workspacePath, 'note', filename);
      await fs.writeFile(filepath, noteContent);

      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, content_hash, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          oldStyleId,
          'note',
          filename,
          filepath,
          'Complex YAML',
          noteContent,
          'hash',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          100
        ]
      );

      // Run migration
      await DatabaseMigrationManager.checkAndMigrate('1.1.0', dbManager, workspacePath);

      // Read and parse migrated file
      const migratedContent = await fs.readFile(filepath, 'utf-8');
      const { parseNoteContent } = await import(
        '../../../src/server/utils/yaml-parser.js'
      );
      const parsed = parseNoteContent(migratedContent);

      // Verify all YAML types are preserved correctly
      expect(parsed.metadata.title).toBe('Tutorial 1: Your First Daily Note');
      expect(parsed.metadata.subtitle).toBe('Learn Flint: The Basics');
      expect(parsed.metadata.description).toBe(
        'Notes: Testing "Quotes" and \'Apostrophes\''
      );
      expect(parsed.metadata.emoji).toBe('🎉 Party!');
      expect(parsed.metadata.count).toBe(42);
      expect(parsed.metadata.flag).toBe(true);
      expect(parsed.metadata.tags).toEqual(['array', 'of', 'strings']);

      // Verify ID was added
      expect(parsed.metadata.id).toMatch(/^n-[0-9a-f]{8}$/);
    });

    it('should handle notes with special characters in filenames', async () => {
      const db = await dbManager.connect();

      // Create v1.1.0 schema
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      // Create note with special characters
      const filename = 'test-note-with-émojis-🎉.md';
      const oldStyleId = `note/${filename.replace('.md', '')}`;
      const filepath = path.join(workspacePath, 'note', filename);
      await fs.writeFile(filepath, '# Test\n\nContent with émojis 🎉');

      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, content_hash, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          oldStyleId,
          'note',
          filename,
          filepath,
          'Test',
          '# Test',
          'hash',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          100
        ]
      );

      // Run migration
      await DatabaseMigrationManager.checkAndMigrate('1.1.0', dbManager, workspacePath);

      // Verify migration succeeded
      const notes = await db.all<{ id: string; filename: string }>(
        'SELECT id, filename FROM notes'
      );
      expect(notes.length).toBe(1);
      expect(notes[0].id).toMatch(/^n-[0-9a-f]{8}$/);
      expect(notes[0].filename).toBe(filename);
    });

    it('should handle notes with missing frontmatter', async () => {
      const db = await dbManager.connect();

      // Create v1.1.0 schema
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      // Create note without frontmatter
      const filename = 'no-frontmatter.md';
      const oldStyleId = `note/${filename.replace('.md', '')}`;
      const filepath = path.join(workspacePath, 'note', filename);
      const content = '# Test Note\n\nThis note has no frontmatter';
      await fs.writeFile(filepath, content);

      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, content_hash, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          oldStyleId,
          'note',
          filename,
          filepath,
          'Test',
          content,
          'hash',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          100
        ]
      );

      // Run migration
      await DatabaseMigrationManager.checkAndMigrate('1.1.0', dbManager, workspacePath);

      // Verify frontmatter was added
      const updatedContent = await fs.readFile(filepath, 'utf-8');
      expect(updatedContent).toContain('---');
      expect(updatedContent).toContain('id: n-');
      expect(updatedContent).toContain('created:');
    });
  });

  describe('Windows vault loading scenarios (Path portability)', () => {
    /**
     * Test the exact scenario from docs/WINDOWS-VAULT-LOADING-ISSUE.md:
     * - Database created with paths from user "Admin"
     * - Same vault accessed by user "Tyler Disney"
     * - Migration should handle missing files gracefully
     */
    it('should handle cross-user vault scenario (Windows Admin → Tyler Disney)', async () => {
      const db = await dbManager.connect();

      // Create v1.1.0 schema
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      // Create notes with Admin user paths (Windows-style)
      const adminVaultPath = 'C:\\Users\\Admin\\Dropbox\\flintvault';
      const notes = [
        {
          filename: 'welcome-to-flint.md',
          title: 'Welcome to Flint',
          id: 'note/welcome-to-flint',
          path: `${adminVaultPath}\\note\\welcome-to-flint.md`
        },
        {
          filename: 'getting-started.md',
          title: 'Getting Started',
          id: 'note/getting-started',
          path: `${adminVaultPath}\\note\\getting-started.md`
        }
      ];

      // Add notes to database with old Admin paths
      for (const note of notes) {
        // Create actual files in the current test workspace
        const actualFilePath = path.join(workspacePath, 'note', note.filename);
        await fs.writeFile(actualFilePath, `# ${note.title}\n\nContent`);

        // But store OLD paths in database (simulating Admin user)
        await db.run(
          'INSERT INTO notes (id, type, filename, path, title, content, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            note.id,
            'note',
            note.filename,
            note.path, // This is the Admin path, which won't exist
            note.title,
            `# ${note.title}`,
            '2025-01-01T00:00:00.000Z',
            '2025-01-01T00:00:00.000Z',
            100
          ]
        );
      }

      // Run migration - this should succeed despite wrong paths
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '1.1.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      expect(result.migrated).toBe(true);

      // Verify migration completed (even though files couldn't be updated)
      const migratedNotes = await db.all<{ id: string; path: string }>(
        'SELECT id, path FROM notes'
      );
      expect(migratedNotes.length).toBe(2);

      // All notes should have new IDs
      for (const note of migratedNotes) {
        expect(note.id).toMatch(/^n-[0-9a-f]{8}$/);
      }

      // Paths should have been converted to relative during v2.1.0 migration
      for (const note of migratedNotes) {
        // Should be relative now, not absolute Windows paths
        expect(note.path).not.toContain('C:\\');
        expect(note.path).not.toContain('Admin');
        expect(note.path).toContain('note/');
      }
    });

    it('should convert absolute paths to relative paths during v2.1.0 migration', async () => {
      const db = await dbManager.connect();

      // Create v2.0.1 database (after immutable IDs but before relative paths)
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      await db.run(`
        CREATE TABLE note_id_migration (
          old_identifier TEXT PRIMARY KEY,
          new_id TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          filename TEXT NOT NULL
        )
      `);

      await db.run(`
        CREATE TABLE note_links (
          id INTEGER PRIMARY KEY,
          source_note_id TEXT NOT NULL,
          target_note_id TEXT,
          target_title TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY(target_note_id) REFERENCES notes(id) ON DELETE SET NULL
        )
      `);

      await db.run(`
        CREATE TABLE external_links (
          id INTEGER PRIMARY KEY,
          note_id TEXT NOT NULL,
          url TEXT NOT NULL,
          title TEXT,
          line_number INTEGER,
          link_type TEXT DEFAULT 'url' CHECK (link_type IN ('url', 'image', 'embed')),
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

      // Create notes with absolute paths
      const filename = 'test.md';
      const absolutePath = path.join(workspacePath, 'note', filename);
      await fs.writeFile(absolutePath, '# Test\n\nContent');

      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'n-12345678',
          'note',
          filename,
          absolutePath, // Absolute path
          'Test',
          '# Test',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          100
        ]
      );

      // Run v2.1.0 migration
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '2.0.1',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      expect(result.migrated).toBe(true);
      expect(result.executedMigrations).toContain('2.1.0');

      // Verify path was converted to relative
      const notes = await db.all<{ path: string }>('SELECT path FROM notes');
      expect(notes.length).toBe(1);
      expect(notes[0].path).toBe('note/test.md');
      expect(notes[0].path).not.toContain(workspacePath);
    });

    it('should handle vault moved between machines with different paths', async () => {
      const db = await dbManager.connect();

      // Create v1.1.0 schema with paths from a different machine
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      await db.run(`
        CREATE TABLE note_links (
          id INTEGER PRIMARY KEY,
          source_note_id TEXT NOT NULL,
          target_note_id TEXT,
          target_title TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY(target_note_id) REFERENCES notes(id) ON DELETE SET NULL
        )
      `);

      await db.run(`
        CREATE TABLE external_links (
          id INTEGER PRIMARY KEY,
          note_id TEXT NOT NULL,
          url TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

      // Simulate paths from old machine
      const oldMachinePath = '/Users/olduser/Documents/vault';
      const filename = 'important-note.md';
      const oldAbsolutePath = `${oldMachinePath}/note/${filename}`;

      // Create file in current workspace (new machine location)
      const actualPath = path.join(workspacePath, 'note', filename);
      await fs.writeFile(actualPath, '# Important\n\nData');

      // Store old machine path in database
      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'note/important-note',
          'note',
          filename,
          oldAbsolutePath,
          'Important',
          '# Important',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          100
        ]
      );

      // Run full migration
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '1.1.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      expect(result.migrated).toBe(true);

      // Verify note was migrated successfully
      const notes = await db.all<{ id: string; path: string }>(
        'SELECT id, path FROM notes'
      );
      expect(notes.length).toBe(1);
      expect(notes[0].id).toMatch(/^n-[0-9a-f]{8}$/);
      // Path should be relative after v2.1.0 migration
      expect(notes[0].path).toBe('note/important-note.md');
    });

    it('should handle migration with mix of existing and missing files', async () => {
      const db = await dbManager.connect();

      // Create v1.1.0 schema
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      await db.run(`
        CREATE TABLE note_links (
          id INTEGER PRIMARY KEY,
          source_note_id TEXT NOT NULL,
          target_note_id TEXT,
          target_title TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY(target_note_id) REFERENCES notes(id) ON DELETE SET NULL
        )
      `);

      await db.run(`
        CREATE TABLE external_links (
          id INTEGER PRIMARY KEY,
          note_id TEXT NOT NULL,
          url TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

      // Create two notes - one exists, one doesn't
      const existingFile = 'exists.md';
      const existingPath = path.join(workspacePath, 'note', existingFile);
      await fs.writeFile(existingPath, '# Exists\n\nThis file exists');

      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'note/exists',
          'note',
          existingFile,
          existingPath,
          'Exists',
          '# Exists',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          100
        ]
      );

      // Note with path that doesn't exist
      const missingPath = '/old/path/that/does/not/exist/note/missing.md';
      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'note/missing',
          'note',
          'missing.md',
          missingPath,
          'Missing',
          '# Missing',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          100
        ]
      );

      // Migration should succeed despite one missing file
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '1.1.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      expect(result.migrated).toBe(true);

      // Both notes should be in database with new IDs
      const notes = await db.all<{ id: string; filename: string }>(
        'SELECT id, filename FROM notes ORDER BY filename'
      );
      expect(notes.length).toBe(2);
      expect(notes[0].filename).toBe('exists.md');
      expect(notes[1].filename).toBe('missing.md');

      // Both should have new immutable IDs
      expect(notes[0].id).toMatch(/^n-[0-9a-f]{8}$/);
      expect(notes[1].id).toMatch(/^n-[0-9a-f]{8}$/);

      // Mapping table should have entries for both
      const mappings = await db.all<{ old_identifier: string }>(
        'SELECT old_identifier FROM note_id_migration'
      );
      expect(mappings.length).toBe(2);
    });

    it('should handle vault in Dropbox with different user paths', async () => {
      const db = await dbManager.connect();

      // Create v1.1.0 schema
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      await db.run(`
        CREATE TABLE note_links (
          id INTEGER PRIMARY KEY,
          source_note_id TEXT NOT NULL,
          target_note_id TEXT,
          target_title TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY(target_note_id) REFERENCES notes(id) ON DELETE SET NULL
        )
      `);

      await db.run(`
        CREATE TABLE external_links (
          id INTEGER PRIMARY KEY,
          note_id TEXT NOT NULL,
          url TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

      // Simulate database created by User1, now accessed by User2
      const user1Path = 'C:\\Users\\User1\\Dropbox\\MyVault';
      const filename = 'shared-note.md';

      // Create file in test workspace (User2's location)
      const actualPath = path.join(workspacePath, 'note', filename);
      await fs.writeFile(actualPath, '# Shared\n\nShared content');

      // Database has User1's path
      const dbPath = `${user1Path}\\note\\${filename}`;
      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'note/shared-note',
          'note',
          filename,
          dbPath,
          'Shared',
          '# Shared',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          100
        ]
      );

      // Run migration
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '1.1.0',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      expect(result.migrated).toBe(true);

      // Verify note migrated with relative path
      const notes = await db.all<{ id: string; path: string }>(
        'SELECT id, path FROM notes'
      );
      expect(notes.length).toBe(1);
      expect(notes[0].id).toMatch(/^n-[0-9a-f]{8}$/);
      expect(notes[0].path).toBe('note/shared-note.md');
      expect(notes[0].path).not.toContain('User1');
      expect(notes[0].path).not.toContain('Dropbox');
    });

    it('should skip already-relative paths during v2.1.0 migration', async () => {
      const db = await dbManager.connect();

      // Create v2.0.1 schema
      await db.run(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT,
          content TEXT,
          content_hash TEXT,
          created TEXT NOT NULL,
          updated TEXT NOT NULL,
          size INTEGER,
          UNIQUE(type, filename)
        )
      `);

      await db.run(`
        CREATE TABLE note_id_migration (
          old_identifier TEXT PRIMARY KEY,
          new_id TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          filename TEXT NOT NULL
        )
      `);

      await db.run(`
        CREATE TABLE note_links (
          id INTEGER PRIMARY KEY,
          source_note_id TEXT NOT NULL,
          target_note_id TEXT,
          target_title TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY(target_note_id) REFERENCES notes(id) ON DELETE SET NULL
        )
      `);

      await db.run(`
        CREATE TABLE external_links (
          id INTEGER PRIMARY KEY,
          note_id TEXT NOT NULL,
          url TEXT NOT NULL,
          title TEXT,
          line_number INTEGER,
          link_type TEXT DEFAULT 'url' CHECK (link_type IN ('url', 'image', 'embed')),
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

      // Add note that already has relative path
      const filename = 'test.md';
      const relativePath = 'note/test.md';
      const absolutePath = path.join(workspacePath, 'note', filename);
      await fs.writeFile(absolutePath, '# Test\n\nContent');

      await db.run(
        'INSERT INTO notes (id, type, filename, path, title, content, created, updated, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'n-12345678',
          'note',
          filename,
          relativePath, // Already relative
          'Test',
          '# Test',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z',
          100
        ]
      );

      // Run v2.1.0 migration
      const result = await DatabaseMigrationManager.checkAndMigrate(
        '2.0.1',
        dbManager as unknown as DatabaseManager,
        workspacePath
      );

      expect(result.migrated).toBe(true);

      // Path should remain unchanged
      const notes = await db.all<{ path: string }>('SELECT path FROM notes');
      expect(notes[0].path).toBe('note/test.md');
    });
  });
});
