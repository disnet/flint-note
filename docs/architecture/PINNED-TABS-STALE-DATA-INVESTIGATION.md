# Pinned and Temporary Tabs Stale Data Investigation

## Issue Description

When loading the Flint UI application with certain vaults, pinned and temporary notes would initially display with their correct titles, but after a moment (typically after `notesStore.refresh()` completed), some notes would switch to showing "Untitled" in greyed-out placeholder text. This behavior was inconsistent - not all pinned/temporary notes were affected, only a subset.

## Timeline of Discovery

### Initial Hypothesis: Database Sync Issue

Initially suspected that the database might be out of sync with the file system, causing notes to have empty titles in the database while having titles in their frontmatter.

**Finding:** This was incorrect. The `listNotes` method in `src/server/core/notes.ts` reads **directly from markdown files** on disk, parsing frontmatter on the fly. There is no database caching of note titles.

```typescript
// src/server/core/notes.ts:1205
title: parsed.metadata.title || '';
```

### Second Hypothesis: YAML Parsing Issues

Suspected that the YAML parser might be mishandling certain title formats (quoted strings, special characters, etc.).

**Finding:** The YAML parser (`src/server/utils/yaml-parser.ts`) uses `js-yaml` and simply passes through whatever it parses. No issues found with title parsing.

### Third Hypothesis: Empty Title Fields in Frontmatter

Suspected that affected notes might actually be missing the `title` field in their frontmatter.

**Finding from user:** Notes that were showing "Untitled" actually **did have** the title field present in their frontmatter. This ruled out missing frontmatter as the cause.

### Root Cause: Cached Metadata in Stores

The actual issue was discovered by tracing the data flow:

1. **Pinned/Temporary stores persist cached metadata**
   - `PinnedNoteInfo` included: `id`, `title`, `filename`, `pinnedAt`, `order`
   - `TemporaryTab` included: `id`, `noteId`, `title`, `openedAt`, `lastAccessed`, `source`, `order`
   - These were saved to disk storage and loaded on app startup

2. **Initial display uses cached data**
   - On app load, stores would load from disk with cached titles
   - UI would display these cached titles immediately
   - Notes appeared with correct titles ✓

3. **Race condition after notesStore refresh**
   - `notesStore.refresh()` would load notes from disk via `listNotes`
   - Some notes would return with empty titles (see "Why Some Notes?" below)
   - Components like `PinnedNotes.svelte` would merge cached data with live data:

   ```typescript
   // Old problematic code
   const fullNote = notesStore.notes.find((note) => note.id === pinnedInfo.id);
   return fullNote || fallbackUsingCachedData;
   ```

4. **Live data overwrites cached data**
   - When `fullNote` was found, it would be used instead of cached data
   - If `fullNote.title` was empty, the display would switch to "Untitled"
   - This created the observed behavior: titles → "Untitled"

## Why Only Some Notes Were Affected?

The inconsistency was the key clue. Notes affected likely had one of these characteristics:

1. **Title field omitted from frontmatter**
   - Old notes created before titles were consistently added
   - Notes where title field was manually removed
   - Notes created by older versions of the app

2. **Empty title field in frontmatter**
   - Frontmatter with `title: ""` or `title:` (no value)
   - Would parse as empty string

3. **Notes not yet loaded into notesStore**
   - If a note wasn't in `notesStore.notes` yet, the fallback would use cached title
   - These notes would keep their titles until they were loaded

## Architecture Flaw: Dual Source of Truth

The fundamental architectural issue was maintaining **two sources of truth** for note metadata:

1. **Persistent storage** (cached in pinned/temporary stores)
   - Saved to disk
   - Loaded on app startup
   - Never invalidated or updated

2. **Live data** (from markdown files)
   - Read from disk on demand
   - Parsed from frontmatter
   - Could diverge from cached data

This created several problems:

- **Staleness:** Cached titles could become outdated
- **Race conditions:** Order of loading determined which data won
- **Complexity:** Had to maintain sync between two data sources
- **Bugs:** Hard to predict which source would be displayed

## Solution: Single Source of Truth

The fix was to eliminate cached metadata entirely:

### Changes to Data Model

**Before:**

```typescript
interface PinnedNoteInfo {
  id: string;
  title: string; // ❌ Cached
  filename: string; // ❌ Cached
  pinnedAt: string;
  order: number;
}

interface TemporaryTab {
  id: string;
  noteId: string;
  title: string; // ❌ Cached
  openedAt: Date;
  lastAccessed: Date;
  source: string;
  order: number;
}
```

**After:**

```typescript
interface PinnedNoteInfo {
  id: string; // ✓ Identifier only
  pinnedAt: string; // ✓ Metadata about pinning
  order: number; // ✓ UI state
}

interface TemporaryTab {
  id: string; // ✓ Tab ID
  noteId: string; // ✓ Note identifier
  openedAt: Date; // ✓ Metadata about tab
  lastAccessed: Date; // ✓ Metadata about tab
  source: string; // ✓ UI state
  order: number; // ✓ UI state
}
```

### Hydration Pattern

Components now hydrate metadata on every render:

```typescript
// PinnedNotes.svelte
$effect(() => {
  const result = pinnedNotesStore.notes
    .map((pinnedInfo) => {
      // Find live note data
      return notesStore.notes.find((note) => note.id === pinnedInfo.id);
    })
    .filter((note): note is NoteMetadata => note !== undefined);

  pinnedNotes = result;
});

// TemporaryTabs.svelte
let hydratedTabs = $derived(
  temporaryTabsStore.tabs.map((tab) => {
    const note = notesStore.notes.find((n) => n.id === tab.noteId);
    return {
      ...tab,
      title: note?.title || ''
    };
  })
);
```

### Benefits

1. **Single source of truth:** All metadata comes from note files
2. **No staleness:** Titles always reflect current file contents
3. **Simpler API:** No need to pass `title` and `filename` parameters
4. **No race conditions:** No competing data sources
5. **Automatic updates:** UI reflects changes without manual sync

## Key Learnings

### 1. Beware of Caching Derived Data

Caching identifiers is safe. Caching derived data (like titles extracted from files) creates sync problems.

**Good:**

- Cache: IDs, timestamps, order, user preferences
- Derive: Titles, content, metadata from files

**Bad:**

- Cache: Anything that can change in the source of truth

### 2. Race Conditions from Async Loading

When multiple data sources load asynchronously:

- Initial state may differ from final state
- Users see "flashing" or "switching" content
- Hard to debug without understanding load order

### 3. Svelte Reactivity and Data Flow

Svelte's `$effect` and `$derived` are perfect for hydration:

- Automatically recompute when dependencies change
- Clean separation of persistence vs. display
- No manual sync needed

### 4. Debugging Clues

The key clue was "**after a moment, some notes switch**":

- "After a moment" → something loads asynchronously
- "Some notes" → conditional behavior based on data state
- "Switch" → data source changes

## Related Code Locations

### Stores

- `src/renderer/src/services/pinnedStore.svelte.ts` - Pinned notes persistence
- `src/renderer/src/stores/temporaryTabsStore.svelte.ts` - Temporary tabs persistence
- `src/renderer/src/services/noteStore.svelte.ts` - Note metadata loading

### Components

- `src/renderer/src/components/PinnedNotes.svelte` - Pinned notes display
- `src/renderer/src/components/TemporaryTabs.svelte` - Temporary tabs display

### Backend

- `src/server/core/notes.ts` - `listNotes()` reads from files
- `src/server/utils/yaml-parser.ts` - Frontmatter parsing

## Testing Recommendations

To prevent similar issues:

1. **Test with notes that have no title field**
   - Create markdown files without `title:` in frontmatter
   - Verify UI shows "Untitled" consistently

2. **Test title updates**
   - Change title in file directly
   - Verify UI reflects change after refresh

3. **Test load order**
   - Clear caches
   - Reload app
   - Verify no "flashing" from cached to live data

4. **Test edge cases**
   - Empty title: `title: ""`
   - Special characters: `title: "Test: With Colons"`
   - Multi-line (should not be valid YAML)

## Prevention Guidelines

When designing features that cache data:

1. **Ask: Is this derived data?**
   - If yes, consider hydrating instead of caching

2. **Ask: Can this data change?**
   - If yes, plan for invalidation/updates

3. **Ask: Do I need two sources of truth?**
   - Usually no - pick one and derive the rest

4. **Prefer: IDs + hydration over cached metadata**
   - More complex initially
   - Simpler long-term
   - No sync bugs

## Additional Critical Bug: Frontmatter Destruction During Link Updates

### Discovery

After fixing the cached metadata issue, a more serious bug was discovered: **when renaming a note, the frontmatter of OTHER notes that link to it would be completely destroyed.**

### Root Cause

The bug was in `src/server/core/link-extractor.ts` in two functions:

- `updateWikilinksForRenamedNote` (line 431+)
- `updateWikilinksForMovedNote` (line 531+)

#### The Problematic Code

When a note's title changed, the system would:

1. Find all notes that link to the renamed note
2. Query the database for each linking note's **content** (body only, no frontmatter):

   ```typescript
   const noteRow = await db.get<{ content: string; content_hash: string }>(
     'SELECT content, content_hash FROM notes WHERE id = ?',
     [linkingNote.source_note_id]
   );
   ```

3. Update wikilinks in that content
4. **Write the body-only content directly to the file**:
   ```typescript
   await fs.writeFile(notePath.path, updatedContent, 'utf-8');
   ```

This completely **destroyed all frontmatter** because:

- The database stores `content` (markdown body) and metadata **separately**
- The code only fetched the body content from the database
- It wrote that body-only content back to the file, replacing frontmatter with nothing

### Why This Happened

The database schema separates content from metadata:

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,        -- Body only, no frontmatter
  type TEXT,
  filename TEXT,
  path TEXT,
  created DATETIME,
  updated DATETIME,
  ...
)
```

When notes are indexed, `parseNoteContent` separates the frontmatter from the markdown body, storing only the body in the `content` field. This is correct for the database, but the link update code assumed `content` was the full file.

### The Fix

Changed both functions to:

1. **Read the full file from disk** (not from database)
2. **Parse to separate frontmatter from body**
3. **Update wikilinks in body only**
4. **Reconstruct the complete file** with frontmatter + updated body
5. **Write the complete file back to disk**

```typescript
// Read full file with frontmatter
const fullFileContent = await fs.readFile(notePath.path, 'utf-8');

// Parse to separate frontmatter from content
const parsed = parseNoteContent(fullFileContent);

// Update wikilinks in body only
const { updatedContent, linksUpdated } = this.updateWikilinksInContent(
  parsed.content,
  oldTitle,
  newTitle,
  oldNoteId,
  newNoteId
);

// Update metadata timestamp
const updatedMetadata = {
  ...parsed.metadata,
  updated: new Date().toISOString()
};

// Reconstruct complete file with frontmatter
const fullUpdatedContent = this.formatNoteWithFrontmatter(
  updatedMetadata,
  updatedContent
);

// Write complete file back
await fs.writeFile(notePath.path, fullUpdatedContent, 'utf-8');
```

Added a helper method `formatNoteWithFrontmatter` to reconstruct the complete file.

### Additional Bug: formatNoteContent vs formatUpdatedNoteContent

While investigating, discovered that `renameNoteWithFile` in `src/server/core/notes.ts` (line 1525) was calling `formatNoteContent` instead of `formatUpdatedNoteContent`.

**Problem:** `formatNoteContent` is designed for **creating new notes** and:

- Generates a new `created` timestamp (destroying the original)
- Generates a new `updated` timestamp (correct but should use existing)
- Only includes hardcoded fields: `title`, `filename`, `type`, `created`, `updated`, `tags`
- **Drops all custom metadata fields**

**Solution:** Changed to use `formatUpdatedNoteContent` which:

- Preserves all existing metadata fields
- Only updates the `updated` timestamp
- Handles complex metadata structures (arrays, links, etc.)

```typescript
// Before (WRONG)
const updatedContent = await this.formatNoteContent(
  trimmedTitle,
  currentNote.content,
  currentNote.type,
  updatedMetadata
);

// After (CORRECT)
const updatedContent = this.formatUpdatedNoteContent(
  updatedMetadata,
  currentNote.content
);
```

## Conclusion

This issue demonstrated the dangers of caching derived data. While caching can improve performance, it must be carefully managed with proper invalidation strategies. In this case, the simpler solution was to eliminate caching entirely and hydrate metadata on every render - Svelte's reactivity system makes this pattern efficient and bug-free.

The key insight: **Store what you own (IDs, user actions), derive what you don't (metadata from files).**

### Critical Data Loss Bugs Fixed

Two critical bugs that caused **complete frontmatter destruction** were also discovered and fixed:

1. **Link update functions writing body-only content to files** - Fixed by reading full files, parsing frontmatter, updating only body, and reconstructing complete files
2. **Rename using formatNoteContent instead of formatUpdatedNoteContent** - Fixed by using the correct function that preserves all metadata

These bugs could cause **permanent data loss** by destroying frontmatter, making them critical to fix.
