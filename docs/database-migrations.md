# Database Migration System

This document explains the database migration system in flint-note, which handles schema upgrades and ensures existing vaults are properly migrated when new database features are added.

## Overview

The database migration system consists of:

1. **Database Schema Versioning**: Each vault configuration includes a database schema version
2. **Migration Manager**: Handles detection and execution of necessary migrations
3. **Automatic Migration**: Migrations run automatically during workspace initialization
4. **Link Migration**: Specifically handles migrating existing notes to extract and store links

## How It Works

### Configuration Schema Version

Each vault's configuration file (`.flint-note/config.yml`) includes a database section:

```yaml
database:
  schema_version: '1.1.0'
  last_migration: '2024-01-15T10:30:00.000Z'
```

- `schema_version`: The current database schema version for this vault
- `last_migration`: Timestamp of the last migration execution

### Migration Detection

During workspace initialization, the system:

1. Checks the current database schema version in the config
2. Compares it against the expected schema version (`1.1.0`)
3. If versions don't match, triggers migration process
4. Updates the config with the new schema version after successful migration

### Migration Process

When a migration is needed:

1. **Database Rebuild**: For schema changes that require it, the entire database is rebuilt
2. **Link Extraction**: For the 1.1.0 migration, all existing notes are processed to extract and store links
3. **Config Update**: The vault configuration is updated with the new schema version

## Migration Types

### Version 1.1.0: Link Extraction Tables

This migration adds support for link extraction and storage:

- **Requires**: Full database rebuild
- **Adds**: `note_links` and `external_links` tables
- **Migrates**: Existing notes to extract wikilinks and external URLs
- **Automatic**: Runs `migrate_links` functionality for all existing notes

## Code Architecture

### DatabaseMigrationManager

Located in `src/database/migration-manager.ts`, this class handles:

- Version comparison logic
- Migration execution
- Link extraction for existing notes
- Error handling and rollback

### Integration Points

1. **Workspace Initialization**: `src/core/workspace.ts`
   - Calls migration manager during startup
   - Updates configuration after migration

2. **Server Initialization**: `src/server.ts`
   - Passes database manager to workspace for migrations

3. **Configuration Management**: `src/utils/config.ts`
   - Handles database section in vault configuration
   - Validates schema version requirements

## Adding New Migrations

To add a new migration:

1. **Update Current Version**: Modify `CURRENT_SCHEMA_VERSION` in `DatabaseMigrationManager`

2. **Add Migration Definition**:
   ```typescript
   {
     version: '1.2.0',
     description: 'Add new feature tables',
     requiresFullRebuild: false,
     requiresLinkMigration: false,
     migrationFunction: async (db: DatabaseConnection) => {
       // Custom migration logic
     }
   }
   ```

3. **Update Config Default**: Ensure `getDefaultConfig()` uses the new version

4. **Add Tests**: Create tests for the new migration logic

## Error Handling

The migration system includes robust error handling:

- **Transaction Safety**: Migrations use database transactions
- **Rollback Support**: Failed migrations are rolled back
- **Graceful Degradation**: Migration failures don't prevent basic operation
- **Detailed Logging**: All migration steps are logged for debugging

## Testing

Migration tests are located in `test/unit/database-migration.test.ts` and cover:

- Version detection logic
- Migration execution
- Error handling
- Config upgrade integration

Config upgrade tests in `test/unit/config-upgrade.test.ts` ensure:

- Old configs are properly upgraded
- Database sections are added correctly
- Version detection works properly

## Manual Migration

For debugging or special cases, migrations can be triggered manually:

```typescript
import { DatabaseMigrationManager } from './src/database/migration-manager.js';

// Force specific migration
await DatabaseMigrationManager.runSpecificMigration(
  '1.1.0',
  databaseManager,
  workspacePath
);
```

## Performance Considerations

- **Batch Processing**: Link migration processes notes in batches of 50
- **Progress Reporting**: Large migrations show progress updates
- **Optimized Queries**: Uses efficient SQL queries for bulk operations
- **Index Optimization**: Database is analyzed and optimized after rebuilds

## Migration History

### 1.0.0 → 1.1.0
- Added `note_links` table for wikilink storage
- Added `external_links` table for URL storage
- Implemented automatic link extraction for existing notes
- Full database rebuild required due to schema changes

## Future Considerations

The migration system is designed to handle future schema changes efficiently:

- **Incremental Migrations**: Support for non-rebuild migrations
- **Data Preservation**: Careful handling of user data during upgrades
- **Backward Compatibility**: Graceful handling of version mismatches
- **Extensibility**: Easy addition of new migration types