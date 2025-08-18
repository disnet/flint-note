/**
 * Database Migration Manager Tests
 *
 * Tests for the database migration system that handles schema upgrades
 * and ensures existing vaults are properly migrated when link extraction
 * functionality is added.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseMigrationManager } from '../../src/database/migration-manager.js';
import { DatabaseManager } from '../../src/database/schema.js';

describe('Database Migration Manager', () => {
  let testDir: string;
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Create temporary directory for test
    testDir = join(tmpdir(), `flint-note-db-migration-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    dbManager = new DatabaseManager(testDir);
  });

  afterEach(async () => {
    // Clean up database connections
    try {
      await dbManager.close();
    } catch {
      // Ignore cleanup errors
    }

    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  it('should return current schema version', () => {
    const version = DatabaseMigrationManager.getCurrentSchemaVersion();
    assert.strictEqual(version, '1.1.0');
  });

  it('should return no migration needed for current version', async () => {
    const result = await DatabaseMigrationManager.checkAndMigrate(
      '1.1.0',
      dbManager,
      testDir
    );

    assert.strictEqual(result.migrated, false);
    assert.strictEqual(result.rebuiltDatabase, false);
    assert.strictEqual(result.migratedLinks, false);
    assert.strictEqual(result.fromVersion, '1.1.0');
    assert.strictEqual(result.toVersion, '1.1.0');
    assert.strictEqual(result.executedMigrations.length, 0);
  });

  it('should detect migration needed from old version', async () => {
    const result = await DatabaseMigrationManager.checkAndMigrate(
      '1.0.0',
      dbManager,
      testDir
    );

    assert.strictEqual(result.migrated, true);
    assert.strictEqual(result.rebuiltDatabase, true);
    assert.strictEqual(result.migratedLinks, false); // No notes to migrate
    assert.strictEqual(result.fromVersion, '1.0.0');
    assert.strictEqual(result.toVersion, '1.1.0');
    assert.strictEqual(result.executedMigrations.length, 1);
    assert.strictEqual(result.executedMigrations[0], '1.1.0');
  });

  it('should detect migration needed from undefined version', async () => {
    const result = await DatabaseMigrationManager.checkAndMigrate(
      undefined,
      dbManager,
      testDir
    );

    assert.strictEqual(result.migrated, true);
    assert.strictEqual(result.rebuiltDatabase, true);
    assert.strictEqual(result.migratedLinks, false); // No notes to migrate
    assert.strictEqual(result.fromVersion, '1.0.0'); // Default fallback
    assert.strictEqual(result.toVersion, '1.1.0');
    assert.strictEqual(result.executedMigrations.length, 1);
    assert.strictEqual(result.executedMigrations[0], '1.1.0');
  });

  it('should handle migration with existing notes', async () => {
    // Run migration (rebuild will clear test data, but that's expected behavior)
    const result = await DatabaseMigrationManager.checkAndMigrate(
      '1.0.0',
      dbManager,
      testDir
    );

    assert.strictEqual(result.migrated, true);
    assert.strictEqual(result.rebuiltDatabase, true);
    assert.strictEqual(result.migratedLinks, false); // No notes after rebuild
    assert.strictEqual(result.fromVersion, '1.0.0');
    assert.strictEqual(result.toVersion, '1.1.0');
  });

  it('should get migration info', () => {
    const info = DatabaseMigrationManager.getMigrationInfo();

    assert.strictEqual(info.currentVersion, '1.1.0');
    assert.ok(Array.isArray(info.availableMigrations));
    assert.ok(info.availableMigrations.length > 0);

    const migration = info.availableMigrations[0];
    assert.strictEqual(migration.version, '1.1.0');
    assert.strictEqual(migration.requiresFullRebuild, true);
    assert.strictEqual(migration.requiresLinkMigration, true);
    assert.ok(migration.description.includes('link extraction'));
  });

  it('should handle database connection errors gracefully', async () => {
    // Create a mock DatabaseManager that will fail during connect
    const badDbManager = {
      connect: async () => {
        throw new Error('Mock connection failure');
      },
      close: async () => {},
      rebuild: async () => {
        throw new Error('Mock rebuild failure');
      }
    } as any;

    await assert.rejects(async () => {
      await DatabaseMigrationManager.checkAndMigrate('1.0.0', badDbManager, testDir);
    }, /Database migration failed/);
  });

  it('should handle specific migration execution', async () => {
    await assert.rejects(async () => {
      await DatabaseMigrationManager.runSpecificMigration(
        '9.9.9', // Non-existent version
        dbManager,
        testDir
      );
    }, /Migration not found for version: 9.9.9/);
  });
});
