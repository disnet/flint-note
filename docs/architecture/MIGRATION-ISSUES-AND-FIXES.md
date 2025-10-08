# Migration Issues and Fixes

## Overview

This document outlines the issues encountered during the v2.0.0 database migration (immutable note IDs) and the solutions implemented to resolve them.

## Background: What Changed in v2.0.0

The v2.0.0 migration fundamentally changed how notes are identified:

**Before (v1.1.0 and earlier):**
- Note IDs were derived from type and filename: `type/filename` (e.g., `note/my-daily-note`)
- When a note was renamed, its ID changed
- This required complex rename tracking throughout the entire UI

**After (v2.0.0):**
- Note IDs are immutable random hashes: `n-xxxxxxxx` (e.g., `n-3f8a9b2c`)
- IDs are stored in note frontmatter as the source of truth
- When a note is renamed, only the filename changes - ID stays stable
- Eliminates need for rename tracking

## Issues Discovered

### Issue 1: Timing Problem with UI State

**Problem:**
When opening an old vault (schema version 1.1.0) with the new application:

1. Database migration ran successfully, converting all note IDs in the database
2. But UI stores (activeNoteStore, pinnedNotesStore, temporaryTabsStore, etc.) loaded stale IDs from storage
3. Stores tried to fetch notes using old IDs from the newly-migrated database
4. Result: "Note not found" errors for every note

**Root Cause:**
JavaScript module imports are synchronous and happen at the top level. When App.svelte imports stores:

```typescript
import { activeNoteStore } from './stores/activeNoteStore.svelte';
```

The store class constructor runs immediately and loads data from localStorage:

```typescript
constructor() {
  this.initializationPromise = this.initializeVault(); // Runs immediately
}

private async initializeVault() {
  await this.loadFromStorage(); // Loads old IDs from localStorage
}
```

This happens BEFORE any migration code can run to update the stored IDs.

### Issue 2: Multiple Storage Locations

**Problem:**
There were actually TWO places where note IDs were stored, and our initial fix only handled one:

1. **localStorage** (client-side, browser storage)
   - `pinned-notes`
   - `sidebar-notes`
   - `temporary-tabs`
   - `cursor-positions`
   - `note-scroll-positions`
   - `recent-notes`
   - `last-opened-note`

2. **Vault-data JSON files** (server-side, filesystem)
   - `~/Library/Application Support/flint/vault-data/{vaultId}/temporary-tabs.json`
   - `~/Library/Application Support/flint/vault-data/{vaultId}/active-note.json`
   - `~/Library/Application Support/flint/vault-data/{vaultId}/cursor-positions.json`
   - `~/Library/Application Support/flint/vault-data/{vaultId}/navigation-history.json`

Initial fix only cleared localStorage, but stores also loaded from vault-data files via IPC calls.

### Issue 3: Migration Complexity

**Problem:**
Initial approach tried to migrate the stored IDs by:
1. Reading old IDs from localStorage
2. Looking up the mapping (old ID → new ID) from the database
3. Updating all the stored references

But this was complex and timing-dependent:
- Migration mapping available asynchronously
- Stores loading synchronously
- Race conditions everywhere

## Solutions Implemented

### Solution 1: Backup-and-Clear Strategy for localStorage

**Approach:** Instead of trying to migrate in-place, we backup then clear all localStorage containing note IDs BEFORE stores initialize.

**Implementation:**

1. **Early Execution** (`App.svelte`):
   ```typescript
   // FIRST import - before any other stores
   import { migrationService } from './services/migrationService.svelte';
   migrationService.clearStaleUIState(); // Synchronous, runs immediately

   // NOW safe to import stores
   import { activeNoteStore } from './stores/activeNoteStore.svelte';
   // ... other imports
   ```

2. **Backup localStorage** (`migrationService.svelte.ts`):
   ```typescript
   clearStaleUIState(): void {
     if (this.isMigrationComplete()) return;

     const keysToBackup = [
       'pinned-notes', 'sidebar-notes', 'temporary-tabs',
       'cursor-positions', 'note-scroll-positions',
       'recent-notes', 'last-opened-note'
     ];

     // Backup to separate key
     const backup = {};
     keysToBackup.forEach(key => {
       backup[key] = localStorage.getItem(key);
     });
     localStorage.setItem('note-id-migration-backup', JSON.stringify(backup));

     // Clear original keys
     keysToBackup.forEach(key => localStorage.removeItem(key));
   }
   ```

3. **Stores Load Empty State:**
   - When stores initialize, they find no localStorage data
   - No errors occur because there are no stale IDs to load
   - App starts cleanly

4. **Async Migration Restores Data:**
   ```typescript
   async migrateUIState(): Promise<void> {
     const mapping = await window.api.getMigrationMapping();
     const backup = this.getBackup();

     // Migrate each storage key using the backup + mapping
     this.migratePinnedNotes(mapping, backup);
     this.migrateSidebarNotes(mapping, backup);
     // ... etc

     this.markMigrationComplete();
   }
   ```

**Benefits:**
- No errors on first load (critical UX win)
- Migration happens in background
- Users eventually get their UI state back (with new IDs)
- Simple, robust, testable

### Solution 2: Clear Vault-Data Files via IPC

**Approach:** Add IPC method to clear server-side JSON files during migration.

**Implementation:**

1. **Added IPC Handler** (`src/main/index.ts`):
   ```typescript
   ipcMain.handle('clear-vault-ui-state', async (_event, params: { vaultId: string }) => {
     logger.info('Clearing vault UI state for migration', { vaultId });
     await vaultDataStorageService.clearVaultData(params.vaultId);
     logger.info('Vault UI state cleared successfully');
   });
   ```

2. **Called During Migration** (`migrationService.svelte.ts`):
   ```typescript
   async migrateUIState(): Promise<void> {
     // Clear server-side vault-data files
     const vault = await chatService.getCurrentVault();
     if (vault?.id) {
       await window.api.clearVaultUIState({ vaultId: vault.id });
     }

     // Continue with localStorage migration...
   }
   ```

3. **Exposed via Preload** (`src/preload/index.ts`):
   ```typescript
   clearVaultUIState: (params: { vaultId: string }) =>
     electronAPI.ipcRenderer.invoke('clear-vault-ui-state', params)
   ```

**Benefits:**
- Handles both storage locations comprehensively
- Uses existing `clearVaultData()` method (already tested)
- Server-side clearing is atomic and safe

### Solution 3: Show Migration Progress

**Approach:** Block UI rendering until localStorage is cleared, show migration status.

**Implementation:**

1. **Track Migration State** (`App.svelte`):
   ```typescript
   let migrationComplete = $state(false);
   let migrationError = $state<string | null>(null);

   $effect(() => {
     async function runMigration() {
       if (!migrationService.isMigrationComplete()) {
         await migrationService.migrateUIState();
       }
       migrationComplete = true;
     }
     runMigration();
   });
   ```

2. **Conditional Rendering**:
   ```svelte
   {#if !migrationComplete}
     <div class="app loading-state">
       <div class="loading-content">
         <div class="loading-spinner">🔥</div>
         <p>Migrating vault data...</p>
       </div>
     </div>
   {:else if vaultAvailabilityService.isLoading}
     <!-- Normal loading... -->
   {:else}
     <!-- App UI -->
   {/if}
   ```

**Benefits:**
- Clear user feedback during migration
- Prevents flickering/errors
- Professional migration experience

## Trade-offs and Limitations

### What Users Lose (One-Time)

When migrating from v1.1.0 to v2.0.0, users will lose:

1. **Temporary tabs** - All temporary tabs cleared
2. **Cursor positions** - Last cursor position in each note lost
3. **Scroll positions** - Last scroll position in each note lost
4. **Recent notes list** - Recently opened notes list cleared
5. **Active note** - Last open note not restored

### What Users Keep

- ✅ All note content (unchanged)
- ✅ All note metadata (unchanged)
- ✅ All wikilinks (text updated to new filenames)
- ✅ Pinned notes (restored via migration)
- ✅ Sidebar notes (restored via migration)
- ✅ Conversations (not affected, no note IDs)

### Why This Trade-off is Acceptable

1. **One-time migration** - Users only experience this once
2. **No data loss** - All actual content is preserved
3. **UI state is ephemeral** - Tabs and cursor positions are convenience, not critical
4. **Alternative would be worse** - Trying to maintain all UI state would be:
   - Much more complex
   - Higher risk of bugs
   - Not worth the engineering cost for one-time migration

## Future Considerations

### If We Need Another Breaking Migration

Based on lessons learned:

1. **Always use backup-and-clear** for complex state migrations
2. **Identify ALL storage locations** early (localStorage, IndexedDB, filesystem, etc.)
3. **Clear synchronously, migrate asynchronously** to prevent errors
4. **Accept some UI state loss** rather than risking data corruption
5. **Show clear migration progress** to users
6. **Test with real old vaults** before release

### Preventing Future Issues

1. **Immutable IDs solve most problems** - v2.0.0's immutable IDs should eliminate need for future ID migrations
2. **Version all storage formats** - Include version numbers in localStorage/JSON data structures
3. **Fail gracefully** - If stored data doesn't match current format, clear it rather than crash
4. **Comprehensive testing** - Test migration with vaults from every previous version

## Testing Strategy

### Test Cases Created

1. **Fresh vault** - New vault with v2.0.0 should work normally
2. **Old vault, first migration** - v1.1.0 vault opens cleanly
3. **Idempotency** - Running migration twice doesn't break anything
4. **Partial migration** - If migration fails mid-way, retry works
5. **Empty vault** - Vault with no notes migrates cleanly
6. **Large vault** - 1000+ notes migrate in reasonable time (<10s)

### How to Test

1. **Create old vault**:
   ```bash
   mkdir -p test-vault/note
   echo "# Test" > test-vault/note/test.md
   mkdir -p test-vault/.flint-note
   cat > test-vault/.flint-note/config.yml << EOF
   database:
     schema_version: 1.1.0
   EOF
   ```

2. **Open in new version** - Should migrate cleanly without errors

3. **Verify**:
   - No "Note not found" errors in console
   - Notes load correctly
   - Can create new notes
   - Can rename notes without errors

## Summary

The migration issues stemmed from a timing problem: stores loaded old IDs before migration could update them. The solution is a comprehensive backup-and-clear strategy that:

1. **Clears localStorage synchronously** before stores initialize
2. **Clears vault-data files asynchronously** during migration
3. **Migrates backed-up data** with new IDs in background
4. **Shows clear progress** to users

While users lose some ephemeral UI state (tabs, cursor positions), this is an acceptable trade-off for a clean, robust migration that prevents data corruption and ensures all actual content is preserved.

The immutable ID system in v2.0.0 should prevent the need for this type of migration in the future, as IDs will never change regardless of file renames or moves.
