/**
 * Database Migration Manager
 *
 * Handles database schema migrations including version tracking,
 * migration execution, and automatic rebuilds when necessary.
 */

import type { DatabaseConnection } from './schema.js';
import type { DatabaseManager } from './schema.js';
import { LinkExtractor } from '../core/link-extractor.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { toRelativePath, toAbsolutePath } from '../utils/path-utils.js';

export interface DatabaseMigration {
  version: string;
  description: string;
  requiresFullRebuild: boolean;
  requiresLinkMigration: boolean;
  migrationFunction?: (
    db: DatabaseConnection,
    dbManager: DatabaseManager,
    workspacePath: string
  ) => Promise<void>;
}

export interface MigrationResult {
  migrated: boolean;
  rebuiltDatabase: boolean;
  migratedLinks: boolean;
  fromVersion: string;
  toVersion: string;
  executedMigrations: string[];
}

/**
 * Generate an immutable note ID
 */
function generateImmutableId(): string {
  return 'n-' + crypto.randomBytes(4).toString('hex');
}

/**
 * Add or update frontmatter fields in note content
 * Uses js-yaml for robust YAML parsing and serialization
 */
function addOrUpdateFrontmatter(
  content: string,
  fields: { id: string; created: string }
): string {
  // Match frontmatter - consistent with yaml-parser.ts
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  let body = content;
  let existingFrontmatter: Record<string, unknown> = {};

  if (match) {
    // Extract existing frontmatter and body
    const frontmatterText = match[1];
    body = match[2];

    try {
      // Parse existing frontmatter using js-yaml (same as yaml-parser.ts)
      const parsed = yaml.load(frontmatterText);
      if (parsed && typeof parsed === 'object') {
        existingFrontmatter = parsed as Record<string, unknown>;
      }
    } catch (error) {
      console.warn('Failed to parse existing frontmatter during migration:', error);
      // Continue with empty frontmatter if parsing fails
    }
  }

  // Merge fields - new fields take precedence
  const mergedFrontmatter = {
    ...existingFrontmatter,
    id: fields.id,
    created: fields.created
  };

  // Serialize back to YAML using js-yaml for correct formatting
  const newFrontmatter = yaml.dump(mergedFrontmatter, {
    lineWidth: -1, // Don't wrap lines
    noRefs: true, // Don't use YAML references
    sortKeys: false // Keep original order
  });

  // Build new content
  const newContent = `---\n${newFrontmatter}---\n${body}`;

  return newContent;
}

/**
 * Migration function to convert notes to use immutable IDs
 */
async function migrateToImmutableIds(
  db: DatabaseConnection
  // dbManager and workspacePath are not currently used but required by interface signature
): Promise<void> {
  console.log('Starting immutable ID migration...');

  // 1. Check if already migrated (idempotency)
  const hasNewSchema = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM pragma_table_info('notes')
    WHERE name='id' AND pk=1
  `);

  if (hasNewSchema && hasNewSchema.count > 0) {
    // Check if note_id_migration table exists to determine if we're truly migrated
    const hasMigrationTable = await db.get<{ count: number }>(`
      SELECT COUNT(*) as count FROM sqlite_master
      WHERE type='table' AND name='note_id_migration'
    `);

    if (hasMigrationTable && hasMigrationTable.count > 0) {
      // Also verify notes table has data - if empty, migration may have failed
      const notesCount = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM notes'
      );
      const migrationCount = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM note_id_migration'
      );

      if ((notesCount?.count || 0) > 0 && (migrationCount?.count || 0) > 0) {
        console.log('Database already migrated to immutable IDs, skipping');
        return;
      } else {
        console.log(
          `Detected partial migration (notes: ${notesCount?.count || 0}, mappings: ${migrationCount?.count || 0}), will retry...`
        );
        // Continue with migration to fix partial state
      }
    }
  }

  // 2. Create ID mapping table (old identifier → new immutable ID)
  await db.run(`
    CREATE TABLE IF NOT EXISTS note_id_migration (
      old_identifier TEXT PRIMARY KEY,
      new_id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      filename TEXT NOT NULL
    )
  `);

  // 3. Get all existing notes and generate immutable IDs
  const existingNotes = await db.all<{
    id: string;
    type: string;
    filename: string;
    created: string;
    path: string;
  }>(`
    SELECT id, type, filename, created, path FROM notes
  `);

  console.log(`Generating immutable IDs for ${existingNotes.length} notes...`);

  const idMapping: Map<string, string> = new Map();

  let skippedCount = 0;

  for (const note of existingNotes) {
    const oldIdentifier = note.id;
    const newId = generateImmutableId();
    idMapping.set(oldIdentifier, newId);

    // Write ID to frontmatter - this is the source of truth
    const filepath = note.path;
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const updatedContent = addOrUpdateFrontmatter(content, {
        id: newId,
        created: note.created
      });
      await fs.writeFile(filepath, updatedContent);

      await db.run(
        `
        INSERT INTO note_id_migration (old_identifier, new_id, type, filename)
        VALUES (?, ?, ?, ?)
      `,
        [oldIdentifier, newId, note.type, note.filename]
      );
    } catch (error) {
      // Skip files that don't exist (e.g., paths changed due to user migration)
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        console.warn(
          `Skipping note ${oldIdentifier} (file not found at ${filepath}) - will be reindexed from disk later`
        );
        skippedCount++;
        // Still add to mapping table so we can migrate database relationships
        await db.run(
          `
          INSERT INTO note_id_migration (old_identifier, new_id, type, filename)
          VALUES (?, ?, ?, ?)
        `,
          [oldIdentifier, newId, note.type, note.filename]
        );
        continue;
      }
      // For other errors (permissions, disk full, etc.), fail the migration
      console.error(`Failed to update frontmatter for note ${oldIdentifier}:`, error);
      throw error;
    }
  }

  if (skippedCount > 0) {
    console.log(
      `Skipped ${skippedCount} notes with missing files - these will be reindexed from disk`
    );
  }

  // 4. Backup existing tables (unless they already exist from a previous failed migration)
  const backupExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='notes_backup'
  `);

  if (!backupExists || backupExists.count === 0) {
    // No existing backup, create one
    // Debug: Check old schema before backup
    const oldSchemaColumns = await db.all<{ name: string }>(
      "SELECT name FROM pragma_table_info('notes')"
    );
    console.log(
      'Old notes table columns:',
      oldSchemaColumns.map((c) => c.name).join(', ')
    );

    await db.run('CREATE TABLE notes_backup AS SELECT * FROM notes');

    // Debug: Verify backup was created
    const backupCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM notes_backup'
    );
    console.log(`Created backup with ${backupCount?.count || 0} notes`);
  } else {
    // Backup already exists from previous failed migration, reuse it
    const backupCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM notes_backup'
    );
    console.log(
      `Reusing existing backup with ${backupCount?.count || 0} notes from previous migration attempt`
    );
  }

  // Check and backup other tables
  const noteLinksBackupExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='note_links_backup'
  `);
  if (!noteLinksBackupExists || noteLinksBackupExists.count === 0) {
    await db.run('DROP TABLE IF EXISTS note_links_backup');
  }

  const externalLinksBackupExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='external_links_backup'
  `);
  if (!externalLinksBackupExists || externalLinksBackupExists.count === 0) {
    await db.run('DROP TABLE IF EXISTS external_links_backup');
  }

  const metadataBackupExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='note_metadata_backup'
  `);
  if (!metadataBackupExists || metadataBackupExists.count === 0) {
    await db.run('DROP TABLE IF EXISTS note_metadata_backup');
  }

  // Check if note_links table exists before backing it up
  const noteLinksExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='note_links'
  `);
  if (noteLinksExists && noteLinksExists.count > 0) {
    await db.run('CREATE TABLE note_links_backup AS SELECT * FROM note_links');
  }

  // Check if external_links table exists before backing it up
  const externalLinksExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='external_links'
  `);
  if (externalLinksExists && externalLinksExists.count > 0) {
    await db.run('CREATE TABLE external_links_backup AS SELECT * FROM external_links');
  }

  // Check if note_metadata table exists before backing it up
  const metadataExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='note_metadata'
  `);
  if (metadataExists && metadataExists.count > 0) {
    await db.run('CREATE TABLE note_metadata_backup AS SELECT * FROM note_metadata');
  }

  // 5. Drop and recreate notes table with new schema
  await db.run('DROP TABLE IF EXISTS notes');
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

  // 6. Migrate notes data using ID mapping
  await db.run(`
    INSERT INTO notes (id, type, filename, path, title, content, content_hash, created, updated, size)
    SELECT
      m.new_id,
      b.type,
      b.filename,
      b.path,
      b.title,
      b.content,
      b.content_hash,
      b.created,
      b.updated,
      b.size
    FROM notes_backup b
    JOIN note_id_migration m ON b.id = m.old_identifier
  `);

  // Verify migration succeeded
  const migratedCount = await db.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM notes'
  );
  console.log(`Migrated ${migratedCount?.count || 0} notes to new schema`);

  if ((migratedCount?.count || 0) === 0 && existingNotes.length > 0) {
    console.error('ERROR: No notes were migrated! Checking mapping table...');
    const mappingCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM note_id_migration'
    );
    console.error(`Mapping table has ${mappingCount?.count || 0} entries`);

    // Debug: Show sample from each table
    const backupSample = await db.get<{ id: string }>(
      'SELECT id FROM notes_backup LIMIT 1'
    );
    const mappingSample = await db.get<{ old_identifier: string }>(
      'SELECT old_identifier FROM note_id_migration LIMIT 1'
    );
    console.error(`Sample backup ID: ${backupSample?.id}`);
    console.error(`Sample mapping old_identifier: ${mappingSample?.old_identifier}`);
    throw new Error('Migration failed: No notes were migrated to new schema');
  }

  // 7. Recreate note_links table with new foreign keys (if it exists)
  if (noteLinksExists && noteLinksExists.count > 0) {
    await db.run('DROP TABLE IF EXISTS note_links');
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

    // 8. Migrate note_links using ID mapping
    // Check if link_text column exists in the backup table
    const linkTextExists = await db.get<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('note_links_backup')
      WHERE name='link_text'
    `);

    if (linkTextExists && linkTextExists.count > 0) {
      // New schema with link_text
      await db.run(`
        INSERT INTO note_links (id, source_note_id, target_note_id, target_title, link_text, line_number, created)
        SELECT
          l.id,
          ms.new_id,
          mt.new_id,
          l.target_title,
          l.link_text,
          l.line_number,
          l.created
        FROM note_links_backup l
        LEFT JOIN note_id_migration ms ON l.source_note_id = ms.old_identifier
        LEFT JOIN note_id_migration mt ON l.target_note_id = mt.old_identifier
        WHERE ms.new_id IS NOT NULL
      `);
    } else {
      // Old schema without link_text - use target_title as link_text
      await db.run(`
        INSERT INTO note_links (id, source_note_id, target_note_id, target_title, link_text, line_number, created)
        SELECT
          l.id,
          ms.new_id,
          mt.new_id,
          l.target_title,
          l.target_title,
          l.line_number,
          l.created
        FROM note_links_backup l
        LEFT JOIN note_id_migration ms ON l.source_note_id = ms.old_identifier
        LEFT JOIN note_id_migration mt ON l.target_note_id = mt.old_identifier
        WHERE ms.new_id IS NOT NULL
      `);
    }
  }

  // 9. Recreate external_links table (if it exists)
  if (externalLinksExists && externalLinksExists.count > 0) {
    await db.run('DROP TABLE IF EXISTS external_links');
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

    // 10. Migrate external_links using ID mapping
    // Check if link_text or title column exists in the backup table
    const extLinkTextExists = await db.get<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('external_links_backup')
      WHERE name='link_text'
    `);

    const extTitleExists = await db.get<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('external_links_backup')
      WHERE name='title'
    `);

    if (extTitleExists && extTitleExists.count > 0) {
      // Newer schema with title (map to title)
      await db.run(`
        INSERT INTO external_links (id, note_id, url, title, line_number, created, link_type)
        SELECT
          l.id,
          m.new_id,
          l.url,
          l.title,
          l.line_number,
          l.created,
          COALESCE(l.link_type, 'url')
        FROM external_links_backup l
        LEFT JOIN note_id_migration m ON l.note_id = m.old_identifier
        WHERE m.new_id IS NOT NULL
      `);
    } else if (extLinkTextExists && extLinkTextExists.count > 0) {
      // Old schema with link_text (map to title)
      await db.run(`
        INSERT INTO external_links (id, note_id, url, title, line_number, created, link_type)
        SELECT
          l.id,
          m.new_id,
          l.url,
          l.link_text,
          l.line_number,
          l.created,
          'url'
        FROM external_links_backup l
        LEFT JOIN note_id_migration m ON l.note_id = m.old_identifier
        WHERE m.new_id IS NOT NULL
      `);
    } else {
      // Oldest schema without link_text or title
      await db.run(`
        INSERT INTO external_links (id, note_id, url, line_number, created, link_type)
        SELECT
          l.id,
          m.new_id,
          l.url,
          l.line_number,
          l.created,
          'url'
        FROM external_links_backup l
        LEFT JOIN note_id_migration m ON l.note_id = m.old_identifier
        WHERE m.new_id IS NOT NULL
      `);
    }
  }

  // 11. Recreate note_metadata table (if it exists)
  if (metadataExists && metadataExists.count > 0) {
    await db.run('DROP TABLE IF EXISTS note_metadata');
    await db.run(`
      CREATE TABLE note_metadata (
        note_id TEXT,
        key TEXT,
        value TEXT,
        value_type TEXT CHECK (value_type IN ('string', 'number', 'date', 'boolean', 'array')),
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      )
    `);

    // 12. Migrate note_metadata using ID mapping
    await db.run(`
      INSERT INTO note_metadata (note_id, key, value, value_type)
      SELECT
        m.new_id,
        md.key,
        md.value,
        md.value_type
      FROM note_metadata_backup md
      LEFT JOIN note_id_migration m ON md.note_id = m.old_identifier
      WHERE m.new_id IS NOT NULL
    `);
  }

  // 13. Recreate FTS table
  await db.run('DROP TABLE IF EXISTS notes_fts');
  await db.run(`
    CREATE VIRTUAL TABLE notes_fts USING fts5(
      id UNINDEXED,
      title,
      content,
      type UNINDEXED,
      content=notes,
      content_rowid=rowid
    )
  `);

  // Rebuild FTS index
  await db.run(`INSERT INTO notes_fts(notes_fts) VALUES('rebuild')`);

  console.log(`Migration completed: ${existingNotes.length} notes migrated`);

  // Keep note_id_migration table for UI migration
  // Keep backup tables for one release cycle (can drop later)
}

/**
 * Initialize a fresh database with the current schema (v2.0.0)
 */
async function initializeFreshDatabase(db: DatabaseConnection): Promise<void> {
  // Check if notes table already exists
  const tableExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='notes'
  `);

  if (tableExists && tableExists.count > 0) {
    // Table already exists, skip initialization
    return;
  }

  console.log('Initializing fresh database with v2.0.0 schema...');

  // Create notes table with v2.0.0 schema (immutable IDs)
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

  // Create note_links table
  await db.run(`
    CREATE TABLE note_links (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      link_text TEXT NOT NULL,
      FOREIGN KEY(source_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY(target_id) REFERENCES notes(id) ON DELETE CASCADE
    )
  `);

  // Create external_links table
  await db.run(`
    CREATE TABLE external_links (
      note_id TEXT NOT NULL,
      url TEXT NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    )
  `);

  // Create note_metadata table
  await db.run(`
    CREATE TABLE note_metadata (
      note_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    )
  `);

  console.log('Fresh database initialized successfully');
}

/**
 * Migration function to add immutable IDs and UI state table
 * Combined migration for version 2.0.0
 */
async function migrateToV2(
  db: DatabaseConnection
  // dbManager and workspacePath are not currently used but required by interface signature
): Promise<void> {
  // First migrate to immutable IDs
  await migrateToImmutableIds(db);

  // Then add UI state table
  console.log('Adding UI state table...');

  await db.run(`
    CREATE TABLE IF NOT EXISTS ui_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vault_id TEXT NOT NULL,
      state_key TEXT NOT NULL,
      state_value TEXT NOT NULL,
      schema_version TEXT NOT NULL DEFAULT '2.0.0',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vault_id, state_key)
    )
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_ui_state_vault
    ON ui_state(vault_id)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_ui_state_key
    ON ui_state(vault_id, state_key)
  `);

  console.log('UI state table added successfully');

  // Clear any existing UI state since note IDs have changed
  // This prevents stores from trying to load notes with old IDs
  console.log('Clearing old UI state (note IDs have changed)...');
  await db.run('DELETE FROM ui_state');
  console.log('Old UI state cleared - UI will start fresh');

  // IMPORTANT: We can't clear localStorage from here (main process),
  // but we've already disabled the legacy IPC handlers that would load old data.
  // The stores will call loadUIState, get empty results, and start fresh.
}

/**
 * Migration function to update external_links table schema
 * Renames link_text to title and adds link_type column
 */
async function migrateToV2_0_1(db: DatabaseConnection): Promise<void> {
  console.log('Starting external_links schema update...');

  // Check if external_links table exists
  const externalLinksExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='external_links'
  `);

  if (!externalLinksExists || externalLinksExists.count === 0) {
    console.log('external_links table does not exist, skipping migration');
    return;
  }

  // Check if the table already has the new schema (title and link_type columns)
  const titleColumnExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM pragma_table_info('external_links')
    WHERE name='title'
  `);

  const linkTypeColumnExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM pragma_table_info('external_links')
    WHERE name='link_type'
  `);

  if (
    titleColumnExists &&
    titleColumnExists.count > 0 &&
    linkTypeColumnExists &&
    linkTypeColumnExists.count > 0
  ) {
    console.log('external_links table already has new schema, skipping migration');
    return;
  }

  // Backup existing external_links data
  await db.run('DROP TABLE IF EXISTS external_links_old');
  await db.run('CREATE TABLE external_links_old AS SELECT * FROM external_links');

  // Drop the old table
  await db.run('DROP TABLE external_links');

  // Create new external_links table with updated schema
  await db.run(`
    CREATE TABLE external_links (
      id INTEGER PRIMARY KEY,
      note_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      line_number INTEGER,
      link_type TEXT DEFAULT 'url' CHECK (link_type IN ('url', 'image', 'embed')),
      created DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    )
  `);

  // Create index for better performance
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_external_links_note ON external_links(note_id)'
  );
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_external_links_url ON external_links(url)'
  );

  // Check if the old table had link_text column
  const oldLinkTextExists = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM pragma_table_info('external_links_old')
    WHERE name='link_text'
  `);

  if (oldLinkTextExists && oldLinkTextExists.count > 0) {
    // Migrate data from old table, mapping link_text to title
    await db.run(`
      INSERT INTO external_links (id, note_id, url, title, line_number, created, link_type)
      SELECT
        id,
        note_id,
        url,
        link_text,
        line_number,
        created,
        'url'
      FROM external_links_old
    `);
  } else {
    // Old table didn't have link_text, just migrate basic fields
    await db.run(`
      INSERT INTO external_links (id, note_id, url, line_number, created, link_type)
      SELECT
        id,
        note_id,
        url,
        line_number,
        created,
        'url'
      FROM external_links_old
    `);
  }

  // Keep backup table for now
  console.log('external_links table schema updated successfully');
}

/**
 * Migration function to migrate note type descriptions from files to database
 * Reads _description.md files and stores them in note_type_descriptions table
 */
async function migrateToV2_2_0(
  db: DatabaseConnection,
  _dbManager: DatabaseManager,
  workspacePath: string
): Promise<void> {
  console.log('Starting note type descriptions migration to database...');

  const path = await import('path');

  // Import NoteTypeManager and Workspace for parsing descriptions
  const { NoteTypeManager } = await import('../core/note-types.js');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { Workspace } = await import('../core/workspace.js');
  // Create minimal workspace object for parsing - only rootPath is needed
  const noteTypeManager = new NoteTypeManager({
    rootPath: workspacePath
  } as unknown as typeof Workspace.prototype);

  // Get all directories in workspace (potential note types)
  const entries = await fs.readdir(workspacePath, { withFileTypes: true });
  const noteTypeDirectories = entries.filter(
    (entry) =>
      entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules'
  );

  console.log(`Found ${noteTypeDirectories.length} potential note type directories`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const dir of noteTypeDirectories) {
    const typeName = dir.name;
    const typePath = path.join(workspacePath, typeName);

    // Check for description in current location
    const currentDescPath = path.join(typePath, '_description.md');
    // Check for description in legacy location
    const legacyDescPath = path.join(
      workspacePath,
      '.flint-note',
      `${typeName}_description.md`
    );

    let descriptionContent: string | null = null;
    let descriptionPath: string | null = null;

    // Try current location first
    try {
      descriptionContent = await fs.readFile(currentDescPath, 'utf-8');
      descriptionPath = currentDescPath;
    } catch {
      // Try legacy location
      try {
        descriptionContent = await fs.readFile(legacyDescPath, 'utf-8');
        descriptionPath = legacyDescPath;
      } catch {
        // No description file found, skip this type
        skippedCount++;
        continue;
      }
    }

    if (!descriptionContent) {
      skippedCount++;
      continue;
    }

    try {
      // Parse the description
      const parsed = noteTypeManager.parseNoteTypeDescription(descriptionContent);

      // Generate ID and content hash
      const typeId = `type-${crypto.randomBytes(4).toString('hex')}`;
      const { generateContentHash, createNoteTypeHashableContent } = await import(
        '../utils/content-hash.js'
      );
      const hashableContent = createNoteTypeHashableContent({
        description: descriptionContent,
        agent_instructions: parsed.agentInstructions.join('\n'),
        metadata_schema: parsed.parsedMetadataSchema
      });
      const contentHash = generateContentHash(hashableContent);

      // Insert into database
      await db.run(
        `INSERT OR IGNORE INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          typeId,
          workspacePath, // Use workspace path as vault_id
          typeName,
          parsed.purpose,
          JSON.stringify(parsed.agentInstructions),
          JSON.stringify(parsed.parsedMetadataSchema),
          contentHash
        ]
      );

      migratedCount++;
      console.log(`Migrated note type '${typeName}' from ${descriptionPath}`);
    } catch (error) {
      console.warn(
        `Failed to migrate note type '${typeName}':`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      skippedCount++;
    }
  }

  console.log(
    `Note type descriptions migration completed: ${migratedCount} migrated, ${skippedCount} skipped`
  );
}

/**
 * Migration function to convert absolute paths to relative paths
 * This fixes portability issues when vaults are moved between users or machines
 */
async function migrateToV2_1_0(
  db: DatabaseConnection,
  _dbManager: DatabaseManager,
  workspacePath: string
): Promise<void> {
  console.log('Starting path migration to relative paths...');

  // Get all notes with their current paths
  const notes = await db.all<{
    id: string;
    path: string;
    type: string;
    filename: string;
  }>('SELECT id, path, type, filename FROM notes');

  if (notes.length === 0) {
    console.log('No notes found for path migration');
    return;
  }

  console.log(`Converting ${notes.length} note paths from absolute to relative...`);

  let convertedCount = 0;
  let remappedCount = 0;
  let skippedCount = 0;

  // Process in a transaction for atomicity
  await db.run('BEGIN TRANSACTION');

  try {
    for (const note of notes) {
      const oldPath = note.path;

      // Check if path is already relative
      if (!oldPath.includes(':\\') && !oldPath.startsWith('/')) {
        // Already relative, skip
        continue;
      }

      // Try direct conversion first
      let newRelativePath = toRelativePath(oldPath, workspacePath);
      let newAbsolutePath = toAbsolutePath(newRelativePath, workspacePath);

      // Check if the file exists at the expected location
      try {
        await fs.access(newAbsolutePath);
        // File exists, use this path
        convertedCount++;
      } catch {
        // File doesn't exist at expected location - try to remap
        console.warn(
          `File not found at expected location for note ${note.id}: ${newAbsolutePath}`
        );

        // Attempt to remap using type/filename
        const expectedPath = `${note.type}/${note.filename}`;
        newRelativePath = expectedPath;
        newAbsolutePath = toAbsolutePath(expectedPath, workspacePath);

        try {
          await fs.access(newAbsolutePath);
          console.log(
            `Successfully remapped path for note ${note.id} to ${newRelativePath}`
          );
          remappedCount++;
        } catch {
          // Can't find file anywhere - keep old absolute path and log warning
          console.warn(
            `Could not locate file for note ${note.id} (${note.type}/${note.filename}) - keeping absolute path`
          );
          skippedCount++;
          continue;
        }
      }

      // Update the database with the new relative path
      await db.run('UPDATE notes SET path = ? WHERE id = ?', [newRelativePath, note.id]);
    }

    await db.run('COMMIT');

    console.log(
      `Path migration completed: ${convertedCount} converted, ${remappedCount} remapped, ${skippedCount} skipped`
    );
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Path migration failed:', error);
    throw error;
  }
}

export class DatabaseMigrationManager {
  private static readonly CURRENT_SCHEMA_VERSION = '2.2.0';

  private static readonly MIGRATIONS: DatabaseMigration[] = [
    {
      version: '1.1.0',
      description: 'Add link extraction tables (note_links, external_links)',
      requiresFullRebuild: true,
      requiresLinkMigration: true
    },
    {
      version: '2.0.0',
      description:
        'Add immutable note IDs, UI state table, and migrate to two-concept model',
      requiresFullRebuild: false,
      requiresLinkMigration: false,
      migrationFunction: migrateToV2
    },
    {
      version: '2.0.1',
      description:
        'Update external_links table schema (rename link_text to title, add link_type)',
      requiresFullRebuild: false,
      requiresLinkMigration: false,
      migrationFunction: migrateToV2_0_1
    },
    {
      version: '2.1.0',
      description: 'Convert absolute paths to relative paths for vault portability',
      requiresFullRebuild: false,
      requiresLinkMigration: false,
      migrationFunction: migrateToV2_1_0
    },
    {
      version: '2.2.0',
      description: 'Migrate note type descriptions from files to database',
      requiresFullRebuild: false,
      requiresLinkMigration: false,
      migrationFunction: migrateToV2_2_0
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

    // No migration needed if versions match, but ensure database is initialized
    if (fromVersion === toVersion) {
      const db = await dbManager.connect();
      await initializeFreshDatabase(db);
      return result;
    }

    // Find pending migrations
    const pendingMigrations = this.MIGRATIONS.filter((migration) =>
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
          await migration.migrationFunction(db, dbManager, workspacePath);
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    const migration = this.MIGRATIONS.find((m) => m.version === migrationVersion);
    if (!migration) {
      throw new Error(`Migration not found for version: ${migrationVersion}`);
    }

    console.log(`Running specific migration: ${migration.description}`);

    const db = await dbManager.connect();

    if (migration.requiresFullRebuild) {
      await dbManager.rebuild();
    }

    if (migration.migrationFunction) {
      await migration.migrationFunction(db, dbManager, workspacePath);
    }

    if (migration.requiresLinkMigration) {
      await this.migrateLinkExtraction(db, workspacePath);
    }

    console.log(`Migration ${migrationVersion} completed`);
  }
}
