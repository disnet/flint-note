# Immutable Note Identity System

## Overview

Flint uses a two-concept model for note identity that separates **immutable identity** from **mutable addressability**. This design eliminates the complexity of tracking note renames throughout the application.

## Core Concepts

### 1. Immutable Note ID

- **Format**: `n-xxxxxxxx` (8-character hexadecimal hash)
- **Storage**: Stored in note frontmatter as the authoritative source
- **Lifecycle**: Generated once at creation, never changes
- **Purpose**: Stable identity for internal references

```markdown
---
id: n-3f8a9b2c
created: 2025-01-15T10:30:00.000Z
---

# My Note Title

Content here...
```

### 2. Mutable Title & Filename

- **Title**: User-visible name, can change freely
- **Filename**: Auto-derived from title (e.g., "My Note" → `my-note.md`)
- **Wikilinks**: Use filename format `[[type/filename]]`

## Key Benefits

### Eliminates Rename Complexity

When a note is renamed:

- ✅ **ID stays stable** - All internal references remain valid
- ✅ **No store updates needed** - Pinned notes, sidebar, tabs all keep working
- ✅ **No rename tracking** - No need for `noteRenameCounter` or `updateNoteId()` methods
- ✅ **Simpler reactivity** - Components watch for content updates, not identity changes

### Example: Renaming a Note

**Before rename:**

```typescript
{
  id: "n-3f8a9b2c",           // Never changes
  title: "My Daily Note",
  filename: "my-daily-note.md",
  type: "daily"
}
```

**After rename:**

```typescript
{
  id: "n-3f8a9b2c",           // Same ID!
  title: "My Updated Note",    // Title changed
  filename: "my-updated-note.md", // Filename changed
  type: "daily"
}
```

**What updates:**

- File renamed on disk
- Wikilink text updated in other notes: `[[daily/old-title]]` → `[[daily/new-title]]`
- Database `link_text` updated

**What doesn't update:**

- Store references (still use `n-3f8a9b2c`)
- Navigation history
- Cursor positions
- Database foreign keys

## Architecture

### Frontmatter as Source of Truth

The note file's `id` field in frontmatter is authoritative:

```typescript
// On note creation
const id = generateNoteId(); // 'n-' + random hex
await writeNoteWithFrontmatter(filepath, { id, created });

// On index rebuild
const { frontmatter } = parseFrontmatter(content);
const id = frontmatter.id; // Read from file, not regenerated
```

### ID Generation

```typescript
function generateNoteId(): string {
  return 'n-' + crypto.randomBytes(4).toString('hex');
}

// Examples:
// n-3f8a9b2c
// n-7e2d1a5f
// n-9c4b6e8a
```

Collision probability: ~1 in 4 billion (acceptable for personal note vaults)

### Database Schema

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,           -- Immutable ID from frontmatter
  type TEXT NOT NULL,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created TEXT NOT NULL,
  modified TEXT NOT NULL,
  UNIQUE(type, filename)
);

CREATE TABLE note_links (
  source_id TEXT NOT NULL,       -- Immutable IDs
  target_id TEXT NOT NULL,
  link_text TEXT NOT NULL,       -- Mutable wikilink text
  FOREIGN KEY(source_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY(target_id) REFERENCES notes(id) ON DELETE CASCADE
);
```

## API Design

### Rename Operation

```typescript
// Request
renameNote(id: string, newTitle: string)

// Response
{
  id: string,              // Same ID (unchanged)
  filename_changed: boolean,
  wikilinks_updated: number
}
```

### Note Lookup

```typescript
// By immutable ID (primary)
getNoteByIdentifier(id: string): Promise<Note | null>

// By filename (for wikilink resolution)
findNoteByTypeAndFilename(type: string, filename: string): Promise<Note | null>
```

## Migration Strategy

### Version 2.0.0 Migration

Existing vaults are automatically migrated using the `DatabaseMigrationManager`:

1. **Generate immutable IDs** for all existing notes
2. **Write IDs to frontmatter** (source of truth)
3. **Update database schema** with new primary keys
4. **Migrate link tables** to use immutable IDs
5. **Create mapping table** for UI state migration

### UI State Migration

LocalStorage and in-memory stores are migrated on first launch:

1. Fetch ID mapping from server
2. Update pinned notes, sidebar, temporary tabs
3. Migrate cursor positions, scroll positions
4. Mark migration complete

## Compatibility

### Tool Compatibility

- ✅ **Obsidian**: Wikilinks use `[[type/filename]]` format
- ✅ **Git-friendly**: Meaningful filenames, not UUIDs
- ✅ **Human-readable**: Files browseable in filesystem
- ✅ **Portable**: ID travels with file in frontmatter

### Wikilink Resolution

User types: `[[type/some-note]]`

Resolution:

1. Look up by `type/filename` in database
2. Find target note's immutable ID
3. Store link: `(source_id: "n-abc123", target_id: "n-xyz789", link_text: "type/some-note")`

When target renamed:

- Internal IDs stay stable
- `link_text` updates to new filename
- Markdown content updates for readability

## Code Simplification

### Deleted Code

The immutable ID system allowed complete removal of:

- `sidebarNotesStore.updateNoteId()` (~8 lines)
- `pinnedStore.updateNoteId()` (~6 lines)
- `temporaryTabsStore.updateNoteId()` (~14 lines)
- `notesStore.notifyNoteRenamed()` (~4 lines)
- Rename tracking state: `noteRenameCounter`, `lastRenamedNoteOldId`, `lastRenamedNoteNewId`
- Rename watching `$effect()` blocks in components

**Total**: ~150 lines of complexity eliminated

### Simplified Patterns

**Before (complex):**

```typescript
// Watch for rename events
$effect(() => {
  if (oldId === note?.id && newId) {
    note = { ...note, id: newId, title: updatedNote.title };
  }
});
```

**After (simple):**

```typescript
// Just watch for content updates - ID never changes
$effect(() => {
  if (notesStore.lastUpdatedNoteId === note.id) {
    await loadNote(note);
  }
});
```

## Edge Cases

### Missing IDs (Legacy Notes)

```typescript
// During index rebuild or import
if (!frontmatter.id) {
  const id = generateNoteId();
  await updateFileFrontmatter(filepath, { id });
}
```

### Filename Conflicts

Handled by existing `generateUniqueFilename()`:

- "my-note.md" exists → generates "my-note-2.md"
- ID collision is separate concern (extremely rare with 8-char hex)

### Index Rebuilds

- Read ID from frontmatter (authoritative)
- Use for database primary key
- Database is just an index, not source of truth

## Summary

The immutable note identity system provides:

1. **Stability** - References never break when notes are renamed
2. **Simplicity** - No rename tracking infrastructure needed
3. **Compatibility** - Works with Obsidian and other tools
4. **Portability** - ID stored in file, survives database rebuilds
5. **Developer experience** - Fewer bugs, clearer mental model

The two-concept model (immutable ID + mutable title/filename) solves the fundamental problem of conflating identity with addressability, resulting in a more robust and maintainable system.
