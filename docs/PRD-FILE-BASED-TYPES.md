# PRD: File-Based Note Types

## Overview

This document describes the implementation of file-based note types, where type definitions are stored as regular note files with `flint_kind: 'type'` instead of in a database table. This makes types first-class citizens in the vault - they're linkable, searchable, and editable with a custom UI.

## Problem Statement

Previously, note type definitions were stored in the `note_type_descriptions` database table. This had several limitations:

1. **Not linkable**: Types couldn't be referenced via wikilinks from other notes
2. **Not searchable**: Type definitions didn't appear in search results
3. **Hidden from users**: Type configuration was buried in settings UI
4. **Database dependency**: Types required database access, complicating backup/sync
5. **Not portable**: Types didn't travel with the vault folder

## Solution

Store type definitions as markdown files in a dedicated `type/` folder at the vault root. Each type is a note with:

- `flint_kind: 'type'` to trigger the custom TypeNoteView
- `flint_type: 'type'` to indicate it lives in the type/ folder
- YAML body containing the type definition (purpose, instructions, schema, etc.)

## File Format

### Location

```
vault/
├── type/
│   ├── type.md          # Meta-type (self-referential bootstrap)
│   ├── note.md           # Default note type
│   ├── daily.md          # Daily notes type
│   └── [custom].md       # User-created types
├── note/
├── daily/
└── ...
```

### Structure

Type notes use YAML frontmatter for system fields and YAML body for the type definition:

```yaml
---
flint_id: n-abc12345
flint_title: meeting
flint_filename: meeting
flint_type: type
flint_kind: type
flint_created: 2024-01-15T10:00:00.000Z
flint_updated: 2024-01-15T10:00:00.000Z
---
name: meeting
icon: '📅'
purpose: Notes for recording meeting discussions, decisions, and action items
agent_instructions:
  - Extract action items and assign owners
  - Summarize key decisions made
  - Note any follow-up meetings scheduled
metadata_schema:
  fields:
    - name: attendees
      type: array
      description: List of meeting participants
    - name: date
      type: date
      description: Meeting date
      required: true
default_review_mode: false
editor_chips:
  - attendees
  - date
```

### TypeNoteDefinition Interface

```typescript
interface TypeNoteDefinition {
  name: string;
  icon?: string;
  purpose: string;
  agent_instructions?: string[];
  metadata_schema?: MetadataSchema;
  suggestions_config?: NoteTypeSuggestionConfig;
  default_review_mode?: boolean;
  editor_chips?: string[];
}
```

## Meta-Type

The `type/type.md` file is a self-referential "meta-type" that defines what a type note looks like. It's automatically created during migration and serves as the bootstrap for the type system.

## Implementation Details

### Server Changes

#### `src/server/core/system-fields.ts`

- Added `'type'` to `NoteKind` type and `NOTE_KINDS` array

#### `src/server/core/note-types.ts`

Major refactor to read/write type notes instead of database:

- `getTypeFolderPath()`: Returns path to `type/` folder
- `getTypeNotePath(name)`: Returns path to specific type note
- `typeNoteExists(name)`: Checks if type note file exists
- `parseTypeNoteContent(content)`: Parses YAML frontmatter and body
- `formatTypeNoteContent(name, definition, frontmatter?)`: Serializes type note
- `readTypeNote(name)`: Reads and parses a type note file
- `ensureTypeFolderExists()`: Creates type/ folder if needed
- `ensureMetaTypeExists()`: Creates meta-type if needed
- `createNoteType()`: Creates type note file in type/ folder
- `getNoteTypeDescription()`: Reads from type notes first, falls back to DB
- `listNoteTypes()`: Scans type/ folder for type notes
- `updateNoteType()`: Writes updates to type note file
- `updateNoteTypeDefaultReviewMode()`: Updates type note and DB
- `deleteNoteType()`: Deletes type note file

#### `src/server/core/notes.ts`

- Enforces `flint_kind: 'type'` for notes in `type/` folder
- Blocks rename operations for type notes
- Blocks move operations for type notes (in or out of type/ folder)

### Migration

#### `src/server/database/migration-manager.ts`

Added migration `v2.17.0` that:

1. Creates `type/` folder at vault root
2. Creates meta-type (`type/type.md`)
3. Converts each type from `note_type_descriptions` table to a type note file
4. Preserves all type properties (purpose, instructions, schema, icon, etc.)

The migration checks if the `note_type_descriptions` table exists before querying, ensuring backward compatibility with older databases.

### UI Changes

#### `src/renderer/src/lib/views/TypeNoteView.svelte`

New custom view for editing type definitions:

- Structured UI for editing purpose, icon, instructions
- Table-based editor for metadata schema fields
- Checkbox for default review mode
- Save button that serializes back to YAML

#### `src/renderer/src/lib/views/index.ts`

Registered TypeNoteView for 'type' kind with priority 1.

#### `src/renderer/src/lib/views/ViewRegistry.ts`

Added 'type' to NoteKind type.

#### `src/renderer/src/components/NoteTypeDropdown.svelte`

- Added `currentKind` prop
- Disabled dropdown for type notes (can't change type of a type definition)

#### `src/renderer/src/components/EditorHeader.svelte`

- Added `noteKind` and `disableTypeChange` props
- Passes through to NoteTypeDropdown

#### `src/renderer/src/components/ActionBar.svelte`

- Fixed search result selection to work with type notes
- Constructs minimal NoteMetadata from search result when note not in store

## Constraints

### Immutability

Type notes cannot be:

- **Renamed**: Changing the filename would break the type system
- **Moved**: Must stay in type/ folder
- **Type-changed**: Can't change flint_type or flint_kind

### Visibility

- Type notes appear in search results
- Type notes are indexed in the database like regular notes
- The 'type' type itself is excluded from `listNoteTypes()` (users can't create notes of type 'type')

### Backward Compatibility

- Database table `note_type_descriptions` is preserved during migration
- Both type notes and DB are updated on changes (dual-write)
- Fallback chain: type note → database → legacy \_description.md files

## User Experience

### Creating Types

Users create types through the dedicated "New Type" UI in the Note Types settings view. This creates a type note file with default instructions and empty schema.

### Editing Types

Opening a type note (from search, wikilink, or Note Types view) shows the TypeNoteView with:

- Icon picker
- Purpose textarea
- Agent instructions list (add/remove/reorder)
- Metadata schema table
- Default review mode checkbox
- Save button

### Linking to Types

Users can link to type definitions using standard wikilinks:

```markdown
See the [[type/meeting|meeting type]] for how we structure meeting notes.
```

### Searching Types

Type notes appear in search results. Searching for "meeting" will find both:

- Notes of type "meeting"
- The "meeting" type definition itself

## Database Schema

No new tables. The `note_type_descriptions` table remains for backward compatibility but type notes are the source of truth.

Type notes are indexed in the `notes` table with:

- `type = 'type'`
- `flint_kind = 'type'`

## Testing

Updated `tests/server/database/migration-manager.test.ts`:

- Updated version expectations to 2.17.0
- Migration tests verify type folder and meta-type creation

Review integration tests pass:

- `default_review_mode` properly stored and retrieved from type notes
- Type creation, update, and delete operations work correctly

## Future Considerations

1. **Type inheritance**: Types could reference parent types via wikilinks
2. **Type templates**: Auto-generate note content based on type schema
3. **Type validation**: Enforce schema constraints on note metadata
4. **Type versioning**: Track changes to type definitions over time
5. **Type export/import**: Share type definitions between vaults
