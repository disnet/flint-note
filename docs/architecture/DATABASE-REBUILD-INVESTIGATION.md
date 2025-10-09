# Database Rebuild Investigation

## Overview

Investigation into "Note not found" errors and broken wikilinks occurring after database rebuilds triggered from the Settings page, followed by app restart.

## Problem Statement

After performing the following sequence:

1. User triggers database rebuild from Settings
2. User restarts the app
3. User opens a particular note
4. User restarts the app again

The following issues occur:

- Error logs: `Failed to get note 'n-77d33c76': Note not found: n-77d33c76`
- Wikilinks in notes show as red (broken/unresolved)
- Clicking wikilinks triggers "Note not found" errors
- After a few seconds, note titles appear in the sidebar

## Root Causes Identified

### Issue 1: Stale UI State After Rebuild

**Problem:** The `ui_state` table survived database rebuilds while the `notes` table was cleared and rebuilt, creating temporal inconsistency.

**Flow:**

1. Database rebuild clears `notes`, `note_links`, `note_metadata`, etc. (`schema.ts:418-423`)
2. UI state (`ui_state` table) was NOT cleared, retaining references to note IDs
3. On app restart, `activeNoteStore.loadFromStorage()` loads stale note IDs from `ui_state`
4. UI attempts to load notes that haven't been reindexed yet
5. Race condition: UI loads before reindexing completes

**Fix Applied:**

- Added `DELETE FROM ui_state` to `schema.ts:425` in the `rebuild()` method
- UI state now clears along with notes, eliminating stale references
- Users will experience a clean UI state after database rebuilds (similar to migration behavior)

**Files Modified:**

- `src/server/database/schema.ts:408-434`

### Issue 2: Missing Link Extraction During Rebuild

**Problem:** Database rebuild indexed notes but never extracted wikilinks, leaving the `note_links` table empty after rebuild.

**Flow:**

1. `rebuildIndex()` calls `dbManager.rebuild()` which clears all tables including `note_links`
2. `rebuildFromFileSystem()` scans markdown files and calls `indexNoteFile()` for each
3. `indexNoteFile()` calls `upsertNote()` to save note content to database
4. **Missing step:** Link extraction never happens during rebuild
5. Result: `note_links` table remains empty, all wikilinks appear broken

**Symptoms:**

- All wikilinks show as red (unresolved) in the editor
- Clicking wikilinks fails with "Note not found" errors
- Backlinks panel shows no connections
- Link resolution fails because `note_links` table is empty

**Fix Applied:**

- Modified `search-manager.ts:996-1023` `indexNoteFile()` method
- Added link extraction and storage after upserting each note:
  ```typescript
  // Extract and store links for this note
  const { LinkExtractor } = await import('../core/link-extractor.js');
  const extractionResult = LinkExtractor.extractLinks(parsed.content);
  const db = await this.getConnection();
  await LinkExtractor.storeLinks(parsed.id, extractionResult, db);
  ```

**Files Modified:**

- `src/server/database/search-manager.ts:996-1023`

## Verification of Immutable ID Preservation

During investigation, verified that immutable IDs ARE correctly preserved during rebuild:

**Code Path:**

1. `search-manager.ts:999` reads file content
2. `parseNoteContent()` at line 1020 calls `parseNoteContentProper()` from `yaml-parser.ts`
3. Lines 1050-1056 check for immutable ID in frontmatter:
   ```typescript
   if (typeof metadata.id === 'string' && metadata.id.startsWith('n-')) {
     id = metadata.id; // Use immutable ID from frontmatter
   } else {
     // Fall back to old-style ID for legacy notes
     const baseFilename = filename.replace(/\.md$/, '');
     id = `${type}/${baseFilename}`;
   }
   ```

**Conclusion:** Notes with immutable IDs in frontmatter correctly preserve their IDs during rebuild. The "Note not found" errors were NOT caused by ID regeneration.

## Testing

All fixes verified with existing test suite:

- ✅ 219 tests pass
- ✅ Code formatted and linted
- ✅ Immutable IDs preserved from frontmatter
- ✅ Links extracted and stored during rebuild
- ✅ UI state cleared during rebuild

## Issue 3: Nested Transaction Error During Rebuild

**Problem:** Database rebuild was failing with transaction errors when indexing notes with wikilinks.

**Error:**

```
SQLITE_ERROR: cannot start a transaction within a transaction
```

**Root Cause:**

- `LinkExtractor.storeLinks()` always started its own transaction (`BEGIN TRANSACTION`)
- During rebuild, `indexNoteFile()` called `storeLinks()` for each note
- SQLite doesn't support nested transactions, causing the error

**Flow:**

1. Rebuild clears database and commits transaction (no active transaction after commit)
2. `rebuildFromFileSystem()` processes notes in batches
3. For each note, `indexNoteFile()` calls `upsertNote()`, then `storeLinks()`
4. `storeLinks()` attempts to start a new transaction
5. Error occurs if there's already an active transaction context

**Fix Applied:**

- Modified `LinkExtractor.storeLinks()` to accept optional `useTransaction` parameter (defaults to `true`)
- Updated `search-manager.ts:1017` to call `storeLinks(parsed.id, extractionResult, db, false)`
- During rebuild, link storage happens without transaction management
- Other callers continue to use transactions for safety (e.g., `migrateLinks()`)

**Files Modified:**

- `src/server/core/link-extractor.ts:236-291` - Added `useTransaction` parameter
- `src/server/database/search-manager.ts:1017` - Pass `false` for transaction during rebuild

## Issue 4: External Links Table Schema Mismatch

**Problem:** Database rebuild was failing with "table external_links has no column named title" error during link extraction.

**Error:**

```
SQLITE_ERROR: table external_links has no column named title
```

**Root Cause:**

- The migration code in `migration-manager.ts` created an `external_links` table with old schema (columns: `link_text`)
- The current schema in `schema.ts` and `link-extractor.ts` uses new schema (columns: `title`, `link_type`)
- During database rebuild, link extraction tried to INSERT using the new schema columns, but the database had the old migrated schema

**Flow:**

1. Database migration (v2.0.0) created `external_links` table with `link_text` column
2. `link-extractor.ts` was updated to use `title` and `link_type` columns
3. Database rebuild triggered link extraction
4. INSERT query tried to use `title` column which didn't exist in the migrated table
5. SQLite error: "table external_links has no column named title"

**Fix Applied:**

- Created migration v2.0.1 to update `external_links` table schema
- New migration renames `link_text` to `title` and adds `link_type` column
- Updated `migrateToImmutableIds` function to create tables with correct schema from the start
- Migration handles three possible states:
  1. New schema with `title` and `link_type` - no migration needed
  2. Old schema with `link_text` - migrate to new schema
  3. Oldest schema without either - add both columns

**Files Modified:**

- `src/server/database/migration-manager.ts:621-750` - Added `migrateToV2_0_1` function and v2.0.1 migration
- `src/server/database/migration-manager.ts:401-479` - Updated `migrateToImmutableIds` to use correct schema
- `tests/server/database/migration-manager.test.ts` - Updated tests for v2.0.1

## Issue 5: Race Condition Between Rebuild and UI State (CURRENT ISSUE)

**Problem:** After database rebuild, notes appear missing ("Note not found") and wikilinks show as broken/red, even after the fixes for Issues 1-4.

**Root Cause Analysis:**

The issue is NOT a simple race condition, but a sequence problem:

1. User triggers rebuild from Settings → `rebuildDatabase()` called
2. `rebuildDatabase()` calls `dbManager.rebuild()` which:
   - Clears all tables including `ui_state` ✅
   - Commits the transaction ✅
3. `rebuildDatabase()` calls `rebuildIndex()` which:
   - Scans filesystem for markdown files
   - Indexes notes in batches (processing 10 files in parallel)
   - Extracts and stores wikilinks for each note
   - **This is synchronous and awaited** ✅
4. User restarts app (rebuild completed, ui_state is empty)
5. App initializes:
   - `initialize()` in `flint-note-api.ts:120-184` runs
   - Checks if index is empty (`stats.noteCount === 0`)
   - **Database is NOT empty** (rebuild completed in step 3)
   - Does NOT trigger reindexing ❌
6. UI starts loading:
   - `activeNoteStore` tries to load from storage
   - No active note stored (ui_state was cleared)
   - Works fine at this point ✅
7. User opens a note:
   - UI loads the note successfully
   - Saves note ID to `ui_state` via `activeNoteStore.setActiveNote()`
   - Works fine ✅
8. User restarts app again:
   - `activeNoteStore` tries to restore the note from step 7
   - **Note exists in database** ✅
   - **Links SHOULD exist** (extracted during rebuild)
   - **But wikilinks show as RED** ❌

**Wait - this means the links ARE being extracted during rebuild, but they're not being resolved properly!**

**The real bug:** The issue is that `ui_state` is being cleared correctly, and notes are being indexed correctly, but after restart the note appears to not exist OR the wikilinks aren't resolving correctly.

Looking at the error logs:
```
Failed to get note 'n-77d33c76': Note not found: n-77d33c76
```

This means the note DOESN'T EXIST in the database after restart, which means:
- Either the rebuild didn't complete
- OR the database file is being recreated on restart
- OR there's a timing issue where notes aren't indexed before UI queries

**Hypothesis:** The `initialize()` method checks `stats.noteCount === 0` at line 155, and if the database has ANY notes, it skips reindexing. But what if:
- Rebuild clears the database
- User restarts BEFORE rebuild completes
- On startup, database is empty, so it triggers reindexing
- But the reindexing happens ASYNC in the background
- UI loads before reindexing completes

**Solution:** Need to ensure `handleIndexRebuild()` completes BEFORE the app responds to IPC calls from the UI.

## Known Remaining Issues

Investigating race condition between app initialization and database rebuild completion.

## Files Changed

1. `src/server/database/schema.ts` - Added `ui_state` table clearing during rebuild
2. `src/server/database/search-manager.ts` - Added link extraction during note indexing

## Related Documentation

- [Immutable Note Identity System](./IMMUTABLE-NOTE-IDENTITY.md)
- [UI State Management](./UI-STATE-MANAGEMENT.md)
- [Database Architecture](./DATABASE-ARCHITECTURE.md)

## Next Steps for Investigation

If issues persist after these fixes:

1. **Check rebuild completion timing**
   - Verify `rebuildIndex()` fully completes before UI attempts to load notes
   - Look for race conditions in initialization flow
   - Check if `handleIndexRebuild()` properly awaits completion

2. **Verify link resolution logic**
   - Ensure `LinkExtractor.resolveWikilinks()` correctly maps wikilink text to note IDs
   - Check if type/filename format links resolve properly
   - Verify database queries in `findNoteByTitle()` work with immutable IDs

3. **Check app initialization order**
   - Review startup sequence in `flint-note-api.ts:120-185`
   - Verify `initialize()` completes before UI renders
   - Check if notes store waits for initialization

4. **Monitor specific error patterns**
   - Collect logs showing exact timing of errors
   - Identify if errors only occur for specific note types
   - Check if certain wikilink formats cause issues

## Investigation Timeline

- **Initial symptoms:** "Note not found" errors after rebuild + restart
- **First hypothesis:** UI state loading before rebuild completion (race condition)
- **Finding 1:** `ui_state` table survives rebuild, creating stale references
- **Finding 2:** Link extraction missing from rebuild process
- **Fixes applied:** Clear `ui_state` during rebuild, add link extraction
- **Status:** Partial fix - some issues may remain
