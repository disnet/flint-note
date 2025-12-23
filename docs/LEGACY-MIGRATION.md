# Legacy Vault Migration

This document describes how legacy SQLite-based vaults are migrated to the new Automerge system.

## Overview

The migration system converts vaults from the original SQLite-based storage (`.flint-note/search.db`) to the new Automerge CRDT-based system. The migration is designed to be:

- **Reversible**: The original SQLite database is never modified
- **Repeatable**: Can be run multiple times; already-migrated notes are skipped
- **Safe**: New files are stored in a separate directory to avoid conflicts

## What Gets Migrated

### Note Types

All custom note type definitions are migrated, including:

| Legacy Field          | Automerge Field        | Notes                             |
| --------------------- | ---------------------- | --------------------------------- |
| `type_name`           | `name`                 | Display name                      |
| `purpose`             | `purpose`              | Type description                  |
| `icon`                | `icon`                 | Emoji icon                        |
| `metadata_schema`     | `properties`           | Converted to PropertyDefinition[] |
| `agent_instructions`  | `agentInstructions`    | AI agent instructions             |
| `editor_chips`        | `editorChips`          | Editor toolbar chips              |
| `default_review_mode` | `defaultReviewEnabled` | Spaced repetition default         |

**Special handling:**

- The default "Note" type maps to `type-default`
- All other types get new `type-xxxxxxxx` IDs
- A mapping is maintained to convert note references

### Notes

All notes are migrated with their content and metadata:

| Legacy Field      | Automerge Field | Notes                                      |
| ----------------- | --------------- | ------------------------------------------ |
| `id`              | `id`            | **Preserved exactly** (e.g., `n-a1b2c3d4`) |
| `title`           | `title`         | Note title                                 |
| `content`         | `content`       | Markdown content                           |
| `type`            | `type`          | Mapped to new type ID                      |
| `created`         | `created`       | ISO timestamp                              |
| `updated`         | `updated`       | ISO timestamp                              |
| `archived`        | `archived`      | Boolean conversion                         |
| `note_metadata.*` | `props.*`       | All metadata merged into props             |

**Note kinds:**

- `markdown` notes: Migrated as normal notes
- `epub` notes: Type set to `type-epub`, EPUB file data included for OPFS storage
- `pdf` notes: Type set to `type-pdf`, PDF file data included for OPFS storage
- `webpage` notes: Type set to `type-webpage`, HTML content stored for offline access
- `deck` notes: Type set to `type-deck`, YAML configuration preserved in content

### Decks (Filtered Note Views)

Deck notes are special notes that contain YAML configuration for filtered/sorted views of notes:

1. The `flint_kind = 'deck'` field identifies deck notes in the legacy system
2. The type is set to `type-deck` in Automerge
3. The YAML configuration is wrapped in a ` ```flint-deck ` code block (Automerge format)
4. The deck widget automatically parses and renders the YAML configuration

**Content transformation:**

The legacy system stores raw YAML directly in the content field. During migration, this is wrapped in a code block to match the Automerge format:

Legacy format (raw YAML):

```yaml
views:
  - name: Default
    filters:
      - field: flint_type
        value: 'Task'
```

Automerge format (wrapped in code block):

````markdown
```flint-deck
views:
  - name: Default
    filters:
      - field: flint_type
        value: "Task"
```
````

### EPUB Files

EPUB files are fully migrated:

1. The EPUB file path is read from the `flint_epubPath` metadata field (not the `path` column, which points to the markdown file)
2. The EPUB file is read from the legacy filesystem location
3. File data is passed to the renderer via IPC
4. Renderer validates the data is a valid ZIP/EPUB (starts with `PK` magic bytes)
5. Renderer stores the file in OPFS (browser storage) with content-addressed hash
6. Note props include: `epubHash`, `epubTitle`, `epubAuthor`
7. Reading position (`currentCfi`, `progress`) is preserved if available

### Workspaces

Workspaces are extracted from the `ui_state` table:

| Legacy (JSON)   | Automerge Field | Notes                         |
| --------------- | --------------- | ----------------------------- |
| `name`          | `name`          | Workspace name                |
| `icon`          | `icon`          | Emoji icon                    |
| `pinnedNoteIds` | `pinnedItemIds` | Converted to SidebarItemRef[] |
| -               | `recentItemIds` | Initialized empty             |

### Review Items (Spaced Repetition)

Review data is merged into note props:

| Legacy Field       | Note Prop            | Notes         |
| ------------------ | -------------------- | ------------- |
| `enabled`          | `reviewEnabled`      | Boolean       |
| `next_review`      | `reviewNextReview`   | ISO timestamp |
| `review_count`     | `reviewCount`        | Number        |
| `current_interval` | `reviewInterval`     | Days          |
| `last_reviewed`    | `reviewLastReviewed` | ISO timestamp |
| `status`           | `reviewStatus`       | String        |

### Agent Routines (Workflows)

Legacy workflows are migrated to agent routines:

| Legacy (workflows table) | Automerge Field | Notes                                       |
| ------------------------ | --------------- | ------------------------------------------- |
| `id`                     | `id`            | **Preserved exactly** (e.g., `w-a1b2c3d4`)  |
| `name`                   | `name`          | Routine name (1-20 chars)                   |
| `purpose`                | `purpose`       | One-sentence description                    |
| `description`            | `description`   | Markdown instructions                       |
| `status`                 | `status`        | Preserved: active/paused/completed/archived |
| `type`                   | `type`          | 'workflow' → 'routine', 'backlog' preserved |
| `recurring_spec`         | `recurringSpec` | JSON parsed to object                       |
| `due_date`               | `dueDate`       | ISO datetime                                |
| `last_completed`         | `lastCompleted` | ISO datetime                                |
| `created_at`             | `created`       | ISO timestamp                               |
| `updated_at`             | `updated`       | ISO timestamp                               |

**Supplementary Materials** are embedded in each routine:

| Legacy (workflow_supplementary_materials) | Automerge Field | Notes                    |
| ----------------------------------------- | --------------- | ------------------------ |
| `id`                                      | `id`            | Preserved                |
| `material_type`                           | `materialType`  | text/code/note_reference |
| `content`                                 | `content`       | For text/code types      |
| `note_id`                                 | `noteId`        | For note_reference type  |
| `metadata`                                | `metadata`      | JSON parsed              |
| `position`                                | `position`      | Display order            |
| `created_at`                              | `createdAt`     | ISO timestamp            |

**Completion History** is embedded (limited to 20 most recent):

| Legacy (workflow_completion_history) | Automerge Field  | Notes           |
| ------------------------------------ | ---------------- | --------------- |
| `id`                                 | `id`             | Preserved       |
| `completed_at`                       | `completedAt`    | ISO datetime    |
| `conversation_id`                    | `conversationId` | Optional link   |
| `notes`                              | `notes`          | Execution notes |
| `output_note_id`                     | `outputNoteId`   | Result note ID  |
| `metadata`                           | `metadata`       | JSON parsed     |

**Note:** Completion history is limited to 20 entries per routine during migration to keep document size reasonable.

## Migration Process

### Phase 1: Detection

The migration service scans for legacy vaults by looking for `.flint-note/search.db` files in:

- `~/Documents`
- `~/Documents/Flint`
- `~/Flint`
- Home directory

### Phase 2: Safe Directory Selection

Before migrating, a safe sync directory name is determined:

1. Check if `notes/` exists - if not, use it
2. Check if `notes/` has `.automerge` marker - if so, reuse it
3. Try alternatives: `notes-migration`, `flint-notes`, `migrated-notes`
4. Fall back to `notes-{timestamp}`

This prevents conflicts with existing note type directories that might be named "notes".

### Phase 3: Data Extraction

All data is read from SQLite in read-only mode:

```
note_type_descriptions            → Note type definitions
notes                             → Note content and metadata
note_metadata                     → Property values (grouped by note_id)
ui_state                          → Workspace configurations
review_items                      → Spaced repetition data
workflows                         → Agent routines
workflow_supplementary_materials  → Routine materials
workflow_completion_history       → Completion records
```

### Phase 4: Transformation

Data is converted to Automerge format:

1. **Type ID mapping** is built: `{ "Project": "type-a1b2c3d4", "Note": "type-default" }`
2. **Note types** are transformed with schema conversion
3. **Notes** are transformed with type ID mapping applied
4. **Metadata** is merged into note `props`
5. **Workspaces** are parsed from JSON and converted
6. **Review items** are merged into corresponding notes
7. **Agent routines** are transformed with embedded materials and completion history

### Phase 5: Document Creation

The transformed data is returned to the renderer, which:

1. Creates a new Automerge document
2. Populates note types, notes, workspaces, and settings
3. Stores EPUB files in OPFS
4. Creates a vault entry in localStorage
5. Enables file sync to the safe directory

## File Locations

### Before Migration

```
vault-path/
├── .flint-note/
│   └── search.db          ← SQLite database (READ ONLY)
├── Project/
│   └── my-project.md      ← Existing note files
└── Reading/
    └── book.epub          ← EPUB files
```

### After Migration

```
vault-path/
├── .flint-note/
│   └── search.db          ← Unchanged (still readable by old app)
├── notes/                 ← New Automerge sync directory
│   ├── .automerge         ← Marker file
│   ├── Project/
│   │   └── my-project.md  ← Synced from Automerge
│   └── Reading/
│       └── book.epub      ← Synced from Automerge
├── Project/               ← Original files (untouched)
└── Reading/
    └── book.epub          ← Original EPUB (untouched)
```

## Data Transformation Details

### Property Type Mapping

Legacy metadata types are converted to Automerge property types:

| Legacy `value_type` | Automerge `PropertyType` |
| ------------------- | ------------------------ |
| `string`            | `text`                   |
| `number`            | `number`                 |
| `date`              | `date`                   |
| `boolean`           | `checkbox`               |
| `array`             | `array`                  |
| `notelink`          | `relation`               |
| `notelinks`         | `relation`               |
| `multiSelect`       | `array`                  |

### Metadata Value Parsing

Metadata values are parsed according to their type:

- **string**: Used as-is
- **number**: Parsed with `parseFloat()`
- **date**: Kept as ISO string
- **boolean**: Compared to `"true"`
- **array/notelinks**: Parsed as JSON array
- **notelink**: Parsed as JSON

## Error Handling

### Non-Fatal Errors

These are logged but don't stop migration:

- Individual note parsing failures
- Malformed metadata values
- Missing EPUB files
- Invalid JSON in workspace data

### Fatal Errors

These stop the migration:

- SQLite database unreadable or corrupted
- Cannot determine vault ID
- Automerge document creation fails

### Recovery

Since the original SQLite is never modified:

1. Fix the issue causing the error
2. Run migration again
3. Already-migrated notes are skipped
4. Only new/fixed notes are added

## IPC Interface

The migration uses these IPC channels:

```typescript
// Detection
legacyMigration.detectLegacyVaults();
legacyMigration.detectLegacyVaultAtPath(path);

// Migration data
legacyMigration.getMigrationDocumentData(vaultPath);

// Progress updates
legacyMigration.onMigrationProgress(callback);
legacyMigration.removeMigrationListeners();

// File browser
legacyMigration.browseForVault();
```

## Triggering Migration

Migration can be triggered in two ways:

1. **First-time detection**: When the app starts with no Automerge vaults, it scans for legacy vaults and offers to migrate
2. **Settings UI**: A button in the settings panel allows manual import of legacy vaults

## Statistics

After migration, statistics are reported:

- Number of note types migrated
- Number of notes migrated
- Number of EPUB files migrated
- Number of PDF files migrated
- Number of webpage files migrated
- Number of decks migrated
- Number of workspaces migrated
- Number of review items migrated
- Number of agent routines migrated
- Number of items skipped (already existed)
- List of non-fatal errors encountered
