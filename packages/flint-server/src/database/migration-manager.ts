/**
 * Database Migration Manager
 *
 * Handles database schema migrations including version tracking,
 * migration execution, and automatic rebuilds when necessary.
 */

import type { DatabaseConnection } from './schema.js';
import type { DatabaseManager } from './schema.js';
import { LinkExtractor } from '../core/link-extractor.js';

export interface DatabaseMigration {
  version: string;
  description: string;
  requiresFullRebuild: boolean;
  requiresLinkMigration: boolean;
  migrationFunction?: (db: DatabaseConnection) => Promise<void>;
}

export interface MigrationResult {
  migrated: boolean;
  rebuiltDatabase: boolean;
  migratedLinks: boolean;
  fromVersion: string;
  toVersion: string;
  executedMigrations: string[];
}

export class DatabaseMigrationManager {
  private static readonly CURRENT_SCHEMA_VERSION = '1.1.0';

  private static readonly MIGRATIONS: DatabaseMigration[] = [
    {
      version: '1.1.0',
      description: 'Add link extraction tables (note_links, external_links)',
      requiresFullRebuild: true,
      requiresLinkMigration: true
    }
  ];

  /**
   * Check if database migration is needed and execute if required
   */
  static async checkAndMigrate(
    currentSchemaVersion: string | undefined,
    dbManager: DatabaseManager,
    workspacePath: string
  ): Promise<MigrationResult> {
    const fromVersion = currentSchemaVersion || '1.0.0';
    const toVersion = this.CURRENT_SCHEMA_VERSION;

    const result: MigrationResult = {
      migrated: false,
      rebuiltDatabase: false,
      migratedLinks: false,
      fromVersion,
      toVersion,
      executedMigrations: []
    };

    // No migration needed if versions match
    if (fromVersion === toVersion) {
      return result;
    }

    // Find pending migrations
    const pendingMigrations = this.MIGRATIONS.filter(migration =>
      this.isVersionNewer(migration.version, fromVersion)
    );

    if (pendingMigrations.length === 0) {
      return result;
    }

    console.log(`Database migration required: ${fromVersion} -> ${toVersion}`);
    console.log(`Executing ${pendingMigrations.length} migration(s)...`);

    let db: DatabaseConnection;

    try {
      db = await dbManager.connect();
      // Execute migrations in order
      for (const migration of pendingMigrations) {
        console.log(`Executing migration: ${migration.description}`);

        if (migration.requiresFullRebuild) {
          console.log('Performing full database rebuild...');
          await dbManager.rebuild();
          result.rebuiltDatabase = true;
        }

        // Execute custom migration function if provided
        if (migration.migrationFunction) {
          await migration.migrationFunction(db);
        }

        // Handle link migration
        if (migration.requiresLinkMigration) {
          console.log('Migrating existing notes to extract links...');
          const linksMigrated = await this.migrateLinkExtraction(db, workspacePath);
          result.migratedLinks = linksMigrated;
        }

        result.executedMigrations.push(migration.version);
      }

      result.migrated = true;
      console.log('Database migration completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Database migration failed:', errorMessage);
      throw new Error(`Database migration failed: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Get the current schema version that should be used for new installations
   */
  static getCurrentSchemaVersion(): string {
    return this.CURRENT_SCHEMA_VERSION;
  }

  /**
   * Check if a version string represents a newer version than another
   */
  private static isVersionNewer(version: string, compareVersion: string): boolean {
    const versionParts = version.split('.').map(Number);
    const compareVersionParts = compareVersion.split('.').map(Number);

    // Pad arrays to same length
    const maxLength = Math.max(versionParts.length, compareVersionParts.length);
    while (versionParts.length < maxLength) versionParts.push(0);
    while (compareVersionParts.length < maxLength) compareVersionParts.push(0);

    for (let i = 0; i < maxLength; i++) {
      if (versionParts[i] > compareVersionParts[i]) {
        return true;
      }
      if (versionParts[i] < compareVersionParts[i]) {
        return false;
      }
    }

    return false; // Versions are equal
  }

  /**
   * Migrate existing notes to extract and store links
   */
  private static async migrateLinkExtraction(
    db: DatabaseConnection,
    _workspacePath: string
  ): Promise<boolean> {
    try {
      // Get all existing notes from database
      const notes = await db.all<{ id: string; content: string }>(
        'SELECT id, content FROM notes WHERE content IS NOT NULL'
      );

      if (notes.length === 0) {
        console.log('No notes found for link migration');
        return false;
      }

      console.log(`Extracting links from ${notes.length} existing notes...`);

      let processedCount = 0;
      let errorCount = 0;

      // Process notes in batches to avoid overwhelming the database
      const batchSize = 50;
      for (let i = 0; i < notes.length; i += batchSize) {
        const batch = notes.slice(i, i + batchSize);

        // Start transaction for batch
        await db.run('BEGIN TRANSACTION');

        try {
          for (const note of batch) {
            try {
              // Clear any existing links for this note first
              await LinkExtractor.clearLinksForNote(note.id, db);

              // Extract and store new links
              const extractionResult = LinkExtractor.extractLinks(note.content);
              await LinkExtractor.storeLinks(note.id, extractionResult, db);

              processedCount++;
            } catch (error) {
              errorCount++;
              console.warn(
                `Failed to extract links for note ${note.id}:`,
                error instanceof Error ? error.message : 'Unknown error'
              );
            }
          }

          await db.run('COMMIT');

          // Log progress for large migrations
          if (notes.length > 100) {
            const progress = Math.round(((i + batch.length) / notes.length) * 100);
            console.log(
              `Link migration progress: ${progress}% (${processedCount}/${notes.length})`
            );
          }
        } catch (error) {
          await db.run('ROLLBACK');
          throw error;
        }
      }

      console.log(
        `Link migration completed: ${processedCount} notes processed, ${errorCount} errors`
      );

      return processedCount > 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Link migration failed:', errorMessage);
      throw new Error(`Link migration failed: ${errorMessage}`);
    }
  }

  /**
   * Validate that the database schema matches the expected version
   */
  static async validateSchema(
    db: DatabaseConnection,
    expectedVersion: string
  ): Promise<boolean> {
    try {
      // Check if required tables exist for the schema version
      if (expectedVersion === '1.1.0') {
        // Validate link tables exist
        const linkTableExists = await db.get<{ count: number }>(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='note_links'"
        );

        const externalLinkTableExists = await db.get<{ count: number }>(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='external_links'"
        );

        return (
          (linkTableExists?.count || 0) > 0 && (externalLinkTableExists?.count || 0) > 0
        );
      }

      // For version 1.0.0 or unknown versions, just check basic tables
      const notesTableExists = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='notes'"
      );

      return (notesTableExists?.count || 0) > 0;
    } catch (error) {
      console.warn('Schema validation failed:', error);
      return false;
    }
  }

  /**
   * Get information about available migrations
   */
  static getMigrationInfo(): {
    currentVersion: string;
    availableMigrations: DatabaseMigration[];
  } {
    return {
      currentVersion: this.CURRENT_SCHEMA_VERSION,
      availableMigrations: [...this.MIGRATIONS]
    };
  }

  /**
   * Force a specific migration to run (for testing or manual intervention)
   */
  static async runSpecificMigration(
    migrationVersion: string,
    dbManager: DatabaseManager,
    workspacePath: string
  ): Promise<void> {
    const migration = this.MIGRATIONS.find(m => m.version === migrationVersion);
    if (!migration) {
      throw new Error(`Migration not found for version: ${migrationVersion}`);
    }

    console.log(`Running specific migration: ${migration.description}`);

    const db = await dbManager.connect();

    if (migration.requiresFullRebuild) {
      await dbManager.rebuild();
    }

    if (migration.migrationFunction) {
      await migration.migrationFunction(db);
    }

    if (migration.requiresLinkMigration) {
      await this.migrateLinkExtraction(db, workspacePath);
    }

    console.log(`Migration ${migrationVersion} completed`);
  }
}
