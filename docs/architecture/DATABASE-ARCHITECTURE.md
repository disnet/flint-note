# Database Architecture

## Overview

Flint uses SQLite as its embedded database for storing notes, metadata, relationships, and UI state. The database is stored at `.flint-note/search.db` within each workspace and uses Write-Ahead Logging (WAL) mode for improved performance and concurrency.

## Database Configuration

### Performance Optimizations

The database is configured with several performance optimizations:

- **WAL Mode**: Write-Ahead Logging for better concurrency and crash recovery
- **Synchronous Mode**: Set to NORMAL for balanced safety and performance
- **Cache Size**: 10,000 pages for improved query performance
- **Temp Store**: Memory-based temporary storage
- **Foreign Keys**: Enabled for referential integrity

### Connection Management

The `DatabaseManager` class provides two types of connections:

- **Read-Write Connection**: Primary connection for all write operations
- **Read-Only Connection**: Separate connection for concurrent read operations without blocking writes

Both connections share the same underlying database file and benefit from WAL mode's concurrency features.

## Tables

### Core Tables

#### `notes`

Primary table for storing note documents.

| Column       | Type     | Description                                   |
| ------------ | -------- | --------------------------------------------- |
| id           | TEXT     | Primary key, unique identifier for the note   |
| title        | TEXT     | Note title extracted from filename or content |
| content      | TEXT     | Full markdown content of the note             |
| type         | TEXT     | Note type (e.g., 'note', 'daily', 'template') |
| filename     | TEXT     | Original filename                             |
| path         | TEXT     | Relative path from workspace root             |
| created      | DATETIME | Creation timestamp                            |
| updated      | DATETIME | Last modification timestamp                   |
| size         | INTEGER  | File size in bytes                            |
| content_hash | TEXT     | Hash of content for change detection          |

**Indexes:**

- `idx_notes_type` - For filtering by note type
- `idx_notes_updated` - For sorting by modification date
- `idx_notes_created` - For sorting by creation date
- `idx_notes_type_created` - Compound index for daily view queries
- `idx_notes_type_updated` - Compound index for type-filtered recent notes

#### `note_metadata`

Stores structured metadata from note frontmatter (YAML).

| Column     | Type | Description                                               |
| ---------- | ---- | --------------------------------------------------------- |
| note_id    | TEXT | Foreign key to notes(id)                                  |
| key        | TEXT | Metadata field name                                       |
| value      | TEXT | Serialized value                                          |
| value_type | TEXT | Type hint: 'string', 'number', 'date', 'boolean', 'array' |

**Foreign Keys:**

- ON DELETE CASCADE: Metadata is deleted when note is deleted

**Indexes:**

- `idx_metadata_key` - For querying specific metadata fields
- `idx_metadata_key_value` - For filtering by metadata values
- `idx_metadata_note_id` - For retrieving all metadata for a note

**Type Serialization:**
Metadata values are serialized/deserialized using helper functions:

- Arrays: JSON stringified
- Booleans: "true"/"false" strings
- Numbers: String representation
- Dates: ISO string or date-like format
- Strings: Direct storage

### Full-Text Search

#### `notes_fts`

Virtual FTS5 table for full-text search capabilities.

| Column  | Type      | Description                |
| ------- | --------- | -------------------------- |
| id      | UNINDEXED | Note ID (not searchable)   |
| title   | TEXT      | Searchable title           |
| content | TEXT      | Searchable content         |
| type    | UNINDEXED | Note type (not searchable) |

**Configuration:**

- Uses `content=notes` to avoid duplicating data
- Uses `content_rowid=rowid` to link to notes table
- Automatically synced via triggers

**Triggers:**

- `notes_fts_insert` - Adds entry when note is inserted
- `notes_fts_delete` - Removes entry when note is deleted
- `notes_fts_update` - Updates entry when note is modified

### Link Tables

#### `note_links`

Tracks internal wikilinks between notes.

| Column         | Type     | Description                                         |
| -------------- | -------- | --------------------------------------------------- |
| id             | INTEGER  | Primary key                                         |
| source_note_id | TEXT     | Note containing the link                            |
| target_note_id | TEXT     | Note being linked to (null if target doesn't exist) |
| target_title   | TEXT     | Title/text of the target link                       |
| link_text      | TEXT     | Custom link text if different from title            |
| line_number    | INTEGER  | Line number where link appears                      |
| created        | DATETIME | Timestamp when link was created                     |

**Foreign Keys:**

- `source_note_id` → notes(id) ON DELETE CASCADE
- `target_note_id` → notes(id) ON DELETE SET NULL

**Indexes:**

- `idx_note_links_source` - For finding all outgoing links from a note
- `idx_note_links_target` - For finding all incoming links to a note
- `idx_note_links_target_title` - For finding broken links by title

**Use Cases:**

- Backlinks: Find all notes linking to current note
- Graph visualization: Build note relationship graphs
- Broken links: Track links where `target_note_id IS NULL`

#### `external_links`

Tracks external URLs, images, and embeds.

| Column      | Type     | Description                     |
| ----------- | -------- | ------------------------------- |
| id          | INTEGER  | Primary key                     |
| note_id     | TEXT     | Note containing the link        |
| url         | TEXT     | External URL                    |
| title       | TEXT     | Link title or alt text          |
| line_number | INTEGER  | Line number where link appears  |
| link_type   | TEXT     | 'url', 'image', or 'embed'      |
| created     | DATETIME | Timestamp when link was created |

**Foreign Keys:**

- `note_id` → notes(id) ON DELETE CASCADE

**Indexes:**

- `idx_external_links_note` - For finding all external links in a note
- `idx_external_links_url` - For finding notes referencing a specific URL

### Hierarchical Relationships

#### `note_hierarchies`

Stores parent-child relationships between notes.

| Column    | Type     | Description                             |
| --------- | -------- | --------------------------------------- |
| id        | INTEGER  | Primary key                             |
| parent_id | TEXT     | Parent note ID                          |
| child_id  | TEXT     | Child note ID                           |
| position  | INTEGER  | Sort order within parent (default 0)    |
| created   | DATETIME | Timestamp when relationship was created |
| updated   | DATETIME | Last modification timestamp             |

**Foreign Keys:**

- `parent_id` → notes(id) ON DELETE CASCADE
- `child_id` → notes(id) ON DELETE CASCADE

**Constraints:**

- UNIQUE(parent_id, child_id) - Prevents duplicate relationships

**Indexes:**

- `idx_note_hierarchies_parent` - For finding all children of a note
- `idx_note_hierarchies_child` - For finding parents of a note
- `idx_note_hierarchies_position` - For ordered retrieval of children

**Use Cases:**

- Note outlines and nested structures
- MOC (Map of Content) relationships
- Ordered collections

### Workflow Tables

#### `processed_notes`

Tracks notes that have been processed (inbox workflow).

| Column       | Type     | Description                       |
| ------------ | -------- | --------------------------------- |
| id           | INTEGER  | Primary key                       |
| note_id      | TEXT     | Note that was processed (UNIQUE)  |
| processed_at | DATETIME | Timestamp when note was processed |

**Foreign Keys:**

- `note_id` → notes(id) ON DELETE CASCADE

**Indexes:**

- `idx_processed_notes_note_id` - For quick lookup of processing status

**Use Cases:**

- Inbox filtering: Show only unprocessed notes
- Workflow tracking: Mark notes as reviewed/processed

### UI State Management

#### `ui_state`

Stores vault-specific UI state and preferences.

| Column         | Type     | Description                                             |
| -------------- | -------- | ------------------------------------------------------- |
| id             | INTEGER  | Primary key (auto-increment)                            |
| vault_id       | TEXT     | Identifier for the vault/workspace                      |
| state_key      | TEXT     | State identifier (e.g., 'sidebar_width', 'active_view') |
| state_value    | TEXT     | JSON-serialized state value                             |
| schema_version | TEXT     | Version for state migration (default '2.0.0')           |
| updated_at     | DATETIME | Last update timestamp                                   |

**Constraints:**

- UNIQUE(vault_id, state_key) - One value per key per vault

**Indexes:**

- `idx_ui_state_vault` - For retrieving all state for a vault
- `idx_ui_state_key` - For efficient lookup by vault and key

**Use Cases:**

- Persist UI preferences across sessions
- Store view states, panel sizes, filters
- Enable per-vault customization

### Commands

#### `slash_commands`

Stores global slash commands for quick actions.

| Column      | Type     | Description                           |
| ----------- | -------- | ------------------------------------- |
| id          | TEXT     | Primary key                           |
| name        | TEXT     | Command name (UNIQUE)                 |
| instruction | TEXT     | Command instruction/template          |
| parameters  | TEXT     | JSON-serialized parameter definitions |
| created_at  | DATETIME | Creation timestamp                    |
| updated_at  | DATETIME | Last modification timestamp           |

**Constraints:**

- UNIQUE(name) - Prevents duplicate command names

**Indexes:**

- `idx_slash_commands_name` - For quick command lookup

**Use Cases:**

- Custom note templates
- Quick actions and shortcuts
- User-defined workflows

## Database Operations

### Initialization

The `initializeSchema()` method:

1. Enables foreign keys and performance pragmas
2. Creates all tables if they don't exist
3. Creates all indexes
4. Sets up FTS triggers
5. Uses retry logic with exponential backoff for SQLITE_BUSY errors

### Rebuild

The `rebuild()` method provides a clean slate:

1. Begins transaction for atomicity
2. Deletes all data from tables in dependency order
3. Runs VACUUM to reclaim space
4. Runs ANALYZE to update query planner statistics

### Error Handling

- **SQLITE_BUSY**: Retry with exponential backoff (max 3 attempts, up to 1s delay)
- **Transaction Safety**: Uses BEGIN/COMMIT/ROLLBACK for data consistency
- **Connection Pooling**: Reuses connections to avoid overhead

## Best Practices

### Query Performance

1. Use appropriate indexes for common query patterns
2. Leverage FTS5 for full-text search instead of LIKE queries
3. Use read-only connections for long-running read operations
4. Batch writes in transactions for bulk operations

### Data Integrity

1. Foreign keys ensure referential integrity
2. CASCADE deletes maintain consistency
3. Triggers keep FTS table synchronized
4. Content hashing detects changes

### Concurrency

1. WAL mode allows concurrent readers and one writer
2. Separate read-only connection for queries
3. Transaction isolation for bulk operations
4. Retry logic handles contention

## Future Considerations

- **Migration System**: Version tracking in ui_state table suggests planned migrations
- **Optimization**: Regular VACUUM and ANALYZE for maintenance
- **Backup Strategy**: Consider point-in-time backups using WAL checkpoints
- **Scaling**: Current design suitable for thousands of notes; monitor performance at scale
