# Wikilink Display System

## Overview

Flint uses ID-based wikilinks in the format `[[n-xxxxxxxx|Display Text]]` to create stable, rename-safe links between notes. The note ID remains constant while titles can change freely. Display text is rendered dynamically at the UI level based on the current state of the target note.

This document explains how wikilink display text works in Flint's pure UI-based rendering approach.

## Core Concepts

### ID-Based Wikilinks

Flint uses immutable note IDs as the primary linking mechanism:

```markdown
[[n-abc123|My Note Title]]
```

- **Note ID**: `n-abc123` - Immutable, never changes
- **Display Text**: `My Note Title` - Can be customized by users or auto-generated

### Pure UI-Based Display Rendering

Wikilink display text is **determined at render time** in the UI, not stored or updated in the database. This approach:

1. **Simplifies the system**: No background file rewrites, no complex flag tracking
2. **Always shows current state**: Display is never stale
3. **Preserves custom text**: User customizations are respected
4. **No race conditions**: No async updates that can fail silently

## How Display Text is Determined

### In the Markdown Files

Markdown files store wikilinks in two formats:

1. **With explicit display text**: `[[n-abc123|Custom Text]]`
2. **Without display text**: `[[n-abc123]]` (just the ID)

The markdown files are **never automatically rewritten** when target note titles change.

### At Render Time (UI)

When rendering a wikilink in the editor, the system:

1. Looks up the target note by ID in the notes store
2. Determines what to display:
   - **If display text matches current title** → Show current title (auto-update)
   - **If display text differs from current title** → Show display text (custom)
   - **If no display text provided** (ID only) → Show current title (auto-update)
   - **If target note doesn't exist** → Show whatever is in the markdown

**Code location**: `src/renderer/src/lib/wikilinks.svelte.ts:516-527` (WikilinkWidget.toDOM)

```typescript
// Simplified logic
if (this.identifier === this.title) {
  // No display text provided (ID-only) -> show current title
  displayText = note.title;
} else if (this.title === note.title) {
  // Display text matches current title -> show current title (auto-update)
  displayText = note.title;
} else {
  // Display text differs from current title -> preserve custom text
  displayText = this.title;
}
```

## Examples

### Auto-Updating Links

**Markdown**: `[[n-abc123|Task Management]]`
**Target note title**: "Task Management"
**Rendered**: "Task Management" (shows current title)

**After renaming target to** "Project Tracking":
**Markdown** (unchanged): `[[n-abc123|Task Management]]`
**Rendered**: "Project Tracking" (shows new title automatically)

### Custom Display Text

**Markdown**: `[[n-abc123|my custom link text]]`
**Target note title**: "Task Management"
**Rendered**: "my custom link text" (custom text preserved)

**After renaming target to** "Project Tracking":
**Markdown** (unchanged): `[[n-abc123|my custom link text]]`
**Rendered**: "my custom link text" (custom text still preserved)

### ID-Only Links

**Markdown**: `[[n-abc123]]`
**Target note title**: "Task Management"
**Rendered**: "Task Management" (current title)

**After renaming target to** "Project Tracking":
**Markdown** (unchanged): `[[n-abc123]]`
**Rendered**: "Project Tracking" (new title)

## Database Schema

```sql
CREATE TABLE note_links (
  id INTEGER PRIMARY KEY,
  source_note_id TEXT NOT NULL,
  target_note_id TEXT,
  target_title TEXT NOT NULL,
  link_text TEXT,
  line_number INTEGER,
  created DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_note_id) REFERENCES notes(id) ON DELETE SET NULL
);
```

**Key fields**:

- `source_note_id`: The note containing the link
- `target_note_id`: The note being linked to (can be null for broken links)
- `target_title`: The target title at time of extraction (for title-based links)
- `link_text`: The display text from the markdown (null if no display text)

**Note**: No `is_auto_display` flag - display logic is handled entirely in the UI layer.

## Architecture Decisions

### Why Pure UI-Based Display?

**Decision**: Determine display text at render time instead of updating markdown files

**Rationale**:

- **Simplicity**: Eliminates complex background file rewriting system
- **Reliability**: No async operations that can fail or create race conditions
- **Performance**: Rename operations are instant (no file rewrites)
- **Correctness**: Display is always current, never stale
- **User Experience**: Custom display text is automatically preserved

**Trade-offs**:

- Markdown files may show outdated display text when opened externally
- Small discrepancy between file content and rendered view

### Why Not Track `is_auto_display` in Database?

**Decision**: Don't store a flag to track whether display text should auto-update

**Alternative**: Store `is_auto_display` flag and use it to control updates

**Rationale**:

- **Simpler code**: No complex flag preservation logic during re-extraction
- **Fewer edge cases**: No need to handle flag state across renames and edits
- **Same user experience**: UI can determine auto vs custom by comparing values
- **Better maintainability**: Less code to maintain and debug

**Trade-off**: Slightly more logic in UI rendering (but simpler overall)

## Migration from Previous System

Previous versions (≤ v2.7.0) used an `is_auto_display` column and background file rewriting. The migration to v2.8.0:

1. **Removes `is_auto_display` column** from `note_links` table
2. **Preserves all existing link data** (source, target, link_text)
3. **Updates UI rendering** to use pure UI-based display logic
4. **Removes background update code** that rewrote files on renames

Users will experience:

- **Faster renames**: No waiting for background updates
- **More reliable**: No silent failures in background processes
- **Same visual result**: Links still show current titles or custom text appropriately

## Related Documentation

- [Immutable Note Identity](./IMMUTABLE-NOTE-IDENTITY.md) - Background on ID-based linking
- [Core Concepts](./CORE-CONCEPTS.md) - Overview of Flint's architecture
- [Database Architecture](./DATABASE-ARCHITECTURE.md) - Database schema details
