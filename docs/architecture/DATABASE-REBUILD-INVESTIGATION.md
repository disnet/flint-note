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

## Issue 5: Stale Database Connections After Rebuild (RESOLVED)

**Problem:** After database rebuild, notes appear missing ("Note not found") and wikilinks show as broken/red, even after the fixes for Issues 1-4. This occurs when:

1. User rebuilds database from Settings
2. User restarts app
3. User opens a note (works fine initially)
4. User restarts app again (note fails to load with "Note not found" error)

**Root Cause Analysis:**

The issue is **stale database connection snapshots in SQLite WAL mode**:

1. **SQLite WAL Mode Connection Isolation**: Each `HybridSearchManager` instance caches its own `DatabaseConnection` wrapper around the underlying `sqlite3.Database` object
2. **Stale Read Snapshots**: In SQLite WAL mode, connections can maintain read snapshots that don't see recent writes by other connections
3. **The Failure Sequence**:
   - Database rebuild clears all data and rebuilds notes (commits successfully)
   - **Existing database connections retain stale read snapshots from BEFORE the rebuild**
   - When app restarts, `NoteManager.getNote()` queries for note `n-77d33c76` using an existing connection
   - The connection's stale snapshot returns `undefined` even though the note exists in the database file
   - This causes "Note not found" errors

**Code Path**:

- `NoteManager.getNote()` (notes.ts:514-596) queries: `SELECT id, type, filename FROM notes WHERE id = ?`
- Line 532: `if (!dbNote) { throw new Error('Note not found') }`
- The query returns `undefined` because the connection has a stale snapshot

**Why It Only Happens After App Restart**:

1. During rebuild: Connection is actively writing, sees its own writes
2. After rebuild completes: Connection snapshot becomes "frozen"
3. On app restart: Same connection instance is reused
4. Connection still has the old snapshot, doesn't see rebuilt data

**Fix Applied:**

Added `refreshConnections()` method to `HybridSearchManager` to close and reopen database connections after rebuild:

```typescript
// In search-manager.ts
async refreshConnections(): Promise<void> {
  // Close existing connections
  if (this.connection) {
    await this.connection.close();
    this.connection = null;
    this.isInitialized = false;
  }
  if (this.readOnlyConnection) {
    await this.readOnlyConnection.close();
    this.readOnlyConnection = null;
  }
  // Reinitialize to get fresh connections
  await this.ensureInitialized();
}
```

Called after rebuild completes:

```typescript
// In flint-note-api.ts:1540-1543
await hybridSearchManager.rebuildIndex(...);
await hybridSearchManager.refreshConnections();
console.log('Database connections refreshed after rebuild');
```

**Additional Fix**: Modified `getVaultContext()` to reuse existing `HybridSearchManager` instances instead of creating new ones, preventing connection proliferation (flint-note-api.ts:215-220).

**Files Modified:**

- `src/server/database/search-manager.ts:1085-1103` - Added `refreshConnections()` method
- `src/server/api/flint-note-api.ts:1540-1543` - Call `refreshConnections()` after rebuild
- `src/server/api/flint-note-api.ts:215-220` - Reuse existing HybridSearchManager in `getVaultContext()`

## Issue 6: Concurrent Initialization Race Condition (RESOLVED)

**Problem:** Even with all previous fixes, "Note not found" errors persist during app startup when the UI tries to restore the active note.

**Root Cause:**

The real issue is a **concurrent initialization race condition** in `NoteService`:

1. App starts and begins initializing `NoteService` in `main/index.ts:200`
2. Window loads and renderer starts immediately
3. Multiple UI components load in parallel: `activeNoteStore`, `notesStore`, etc.
4. Each component makes IPC calls that trigger `await noteService.initialize()`
5. **Critical bug**: `NoteService.initialize()` had NO promise tracking
6. Multiple concurrent calls to `initialize()` all started their own initialization
7. Each created a NEW `FlintNoteApi` instance, each with its own database connections
8. Race condition: Some connections might see data, others might not

**Code Flow:**

```typescript
// BEFORE (buggy):
async initialize(): Promise<void> {
  if (this.isInitialized) {
    return;  // ← Only guards AFTER completion
  }
  // ❌ No guard against concurrent calls
  this.api = new FlintNoteApi(...);  // Multiple instances created!
  await this.api.initialize();
}
```

Multiple concurrent calls all passed the `isInitialized` check and created separate API instances simultaneously.

**Fix Applied:**

Added initialization promise tracking to prevent concurrent initialization:

```typescript
// In note-service.ts:39,53-73
private initializationPromise: Promise<void> | null = null;

async initialize(): Promise<void> {
  if (this.isInitialized) {
    return;
  }

  // If initialization is in progress, wait for it to complete
  if (this.initializationPromise) {
    return this.initializationPromise;  // ← Reuse existing promise
  }

  // Start new initialization and store the promise
  this.initializationPromise = this.doInitialize();

  try {
    await this.initializationPromise;
  } finally {
    this.initializationPromise = null;
  }
}
```

**Files Modified:**

- `src/main/note-service.ts:39,53-150` - Added promise tracking to prevent concurrent initialization

## Issue 7: Note Type Determination Inconsistency (RESOLVED)

**Problem:** After database rebuild, notes get indexed with `type = 'default'` instead of their actual directory-based type, causing "Note not found" errors when the UI queries by type.

**Root Cause:**

Two different code paths determine note type differently:

1. **During rebuild** (`search-manager.ts:1048-1049`):

   ```typescript
   const parentDir = path.basename(path.dirname(filePath));
   const type = (typeof metadata.type === 'string' ? metadata.type : null) || parentDir;
   ```

   ✅ Correctly falls back to parent directory name

2. **During note updates** (`notes.ts:1365`):
   ```typescript
   parsed.metadata.type || 'default';
   ```
   ❌ Falls back to hardcoded `'default'` string

**The Failure Sequence:**

1. Database rebuild correctly indexes note with `type = 'projects'` (from directory)
2. User edits and saves the note
3. `NoteManager.updateSearchIndex()` is called
4. Note doesn't have `type` in frontmatter, so it gets `type = 'default'`
5. Database now has wrong type, queries fail

**Fix Applied:**

Modified `notes.ts:1361-1364` to derive type from directory name, matching the rebuild logic:

```typescript
// Determine type from frontmatter or fallback to parent directory name
const parentDir = path.basename(path.dirname(notePath));
const noteType =
  (typeof parsed.metadata.type === 'string' ? parsed.metadata.type : null) || parentDir;
```

**Files Modified:**

- `src/server/core/notes.ts:1361-1370` - Fixed type determination to match rebuild logic

## Summary of All Fixes

1. **Issue 1**: Clear `ui_state` table during rebuild (`schema.ts:425`)
2. **Issue 2**: Extract and store wikilinks during rebuild (`search-manager.ts:1012-1017`)
3. **Issue 3**: Add `useTransaction` parameter to `storeLinks()` (`link-extractor.ts:236-291`)
4. **Issue 4**: Migrate `external_links` schema to v2.0.1 (`migration-manager.ts:621-750`)
5. **Issue 5**: Refresh database connections after rebuild (`search-manager.ts:1089-1103`, `flint-note-api.ts:1542`)
6. **Issue 6**: Prevent concurrent initialization race condition (`note-service.ts:39,53-73`)
7. **Issue 7**: Fix note type determination inconsistency (`notes.ts:1361-1370`)
8. **Issue 8**: Add path-based wikilink resolution (`wikilinks.svelte.ts:212-223`)

## Files Changed

1. `src/server/database/schema.ts` - Added `ui_state` table clearing during rebuild
2. `src/server/database/search-manager.ts` - Added link extraction during note indexing + connection refresh method
3. `src/server/core/link-extractor.ts` - Added `useTransaction` parameter to prevent nested transactions
4. `src/server/database/migration-manager.ts` - Added v2.0.1 migration for external_links schema
5. `src/server/api/flint-note-api.ts` - Added connection refresh after rebuild + reuse HybridSearchManager instances
6. `src/main/note-service.ts` - Added initialization promise tracking to prevent concurrent initialization
7. `src/server/core/notes.ts` - Fixed type determination to derive from directory name
8. `src/renderer/src/lib/wikilinks.svelte.ts` - Added path-based lookup for type/filename wikilinks
9. `tests/server/database/migration-manager.test.ts` - Updated tests for v2.0.1

## Related Documentation

- [Immutable Note Identity System](./IMMUTABLE-NOTE-IDENTITY.md)
- [UI State Management](./UI-STATE-MANAGEMENT.md)
- [Database Architecture](./DATABASE-ARCHITECTURE.md)

## Investigation Timeline

- **Initial symptoms:** "Note not found" errors after rebuild + restart sequence
- **First hypothesis:** UI state loading before rebuild completion (race condition)
- **Finding 1:** `ui_state` table survives rebuild, creating stale references → Fixed by clearing ui_state
- **Finding 2:** Link extraction missing from rebuild process → Fixed by adding link extraction to indexNoteFile()
- **Finding 3:** Nested transaction errors during rebuild → Fixed with `useTransaction` parameter
- **Finding 4:** External links schema mismatch → Fixed with v2.0.1 migration
- **Finding 5:** Stale database connections in SQLite WAL mode → Fixed with connection refresh
- **Finding 6:** Concurrent initialization creating multiple API instances → Fixed with promise tracking
- **Finding 7:** Note type determination inconsistency between rebuild and updates → Fixed by deriving type from directory
- **Finding 8:** Wikilink resolution missing path-based lookup for `type/filename` format → Fixed by adding path parsing
- **Status:** All issues resolved, ready for testing

## Issue 8: Wikilink Resolution Missing Path-Based Lookup (RESOLVED)

**Problem:** Wikilinks using the `type/filename` format (e.g., `[[sketch/what-makes-a-good-thinking-system|...]]`) fail to resolve to the correct note, even when the note exists in the database.

**Symptoms:**

- Clicking wikilink with `[[sketch/what-makes-a-good-thinking-system|What makes a good thinking system?]]` format creates a new note instead of opening the existing one
- The existing note at `~/pkb-flint/sketch/what-makes-a-good-thinking-system.md` (ID: `n-37f12926`) is never found
- Wikilinks appear "broken" even though the target note exists

**Root Cause:**

The `findNoteByIdentifier()` function in `src/renderer/src/lib/wikilinks.svelte.ts` was missing support for the `type/filename` identifier format:

1. **Original lookup order**:
   - By note ID (exact match)
   - By title (case-insensitive)
   - By filename without extension

2. **Missing**: No support for `type/filename` format like `sketch/what-makes-a-good-thinking-system`

3. The function would try to match the full string `"sketch/what-makes-a-good-thinking-system"` against note IDs, titles, and filenames, but never parsed it as a path-based identifier

**Fix Applied:**

Added path-based lookup to `findNoteByIdentifier()` (lines 212-223):

```typescript
// Then try to match by type/filename format (e.g., "sketch/what-makes-a-good-thinking-system")
if (normalizedIdentifier.includes('/')) {
  const [type, ...filenameParts] = normalizedIdentifier.split('/');
  const filename = filenameParts.join('/'); // Handle nested paths if any

  const byTypePath = notes.find(
    (note) =>
      note.type.toLowerCase() === type &&
      note.filename.toLowerCase().replace(/\.md$/, '').trim() === filename
  );
  if (byTypePath) return byTypePath;
}
```

**New lookup order**:
1. By note ID (exact match)
2. **By type/filename path** (e.g., `sketch/what-makes-a-good-thinking-system`)
3. By title (case-insensitive)
4. By filename without extension

**Files Modified:**

- `src/renderer/src/lib/wikilinks.svelte.ts:199-239` - Added type/filename path lookup

## Key Insight

The fundamental issue was **not** about database rebuild specifically, but about **concurrent initialization during app startup**. The rebuild sequence exposed the race condition because it triggered app restarts, which caused the UI to load while multiple IPC handlers were all calling `initialize()` concurrently. Each created separate database connections, some of which had stale snapshots.
