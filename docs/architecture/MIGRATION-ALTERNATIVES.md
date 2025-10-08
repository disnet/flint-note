# Alternative Migration Strategies

## Critical Analysis of Current Approach

### Why the Current Approach Fails

The current migration strategy documented in `MIGRATION-ISSUES-AND-FIXES.md` has several fundamental flaws:

#### Problem 1: Migration Flag is Per-Browser, Not Per-Vault

```typescript
// migrationService.svelte.ts:34
isMigrationComplete(): boolean {
  return localStorage.getItem(this.migrationCompleteKey) === 'true';
}
```

**Issue**: The migration flag `note-id-migration-complete` is stored in browser localStorage without any vault association. This means:

1. **Opening an old vault after a new one**: If you open a new vault first, migration runs and sets the flag. Then opening an old vault (schema 1.1.0) skips migration because the flag is already set globally.
2. **Multiple vaults with different schema versions**: Users with multiple vaults at different schema versions will have inconsistent behavior.
3. **Cannot distinguish vault state**: There's no way to know which vaults have been migrated and which haven't.

#### Problem 2: Synchronous Clear vs Async Store Initialization

```typescript
// App.svelte:5
migrationService.clearStaleUIState(); // Synchronous

// activeNoteStore.svelte.ts:22
constructor() {
  this.initializationPromise = this.initializeVault(); // Starts async work
}
```

**Issue**: Even though `clearStaleUIState()` clears localStorage synchronously, stores have already started async initialization during module import. The race conditions are:

1. **Store constructors run during import** - They kick off async `loadFromStorage()` calls
2. **Clear happens after import** - By the time `clearStaleUIState()` runs, stores have already queued reads
3. **Vault-data files untouched** - Even if localStorage is cleared, `loadFromStorage()` methods also read from server-side vault-data files via IPC

#### Problem 3: Migration Mapping May Not Exist

```typescript
// migrationService.svelte.ts:119
const mapping = await window.api?.getMigrationMapping();

if (!mapping) {
  console.log('No migration mapping available, skipping UI migration');
  this.markMigrationComplete(); // ❌ MARKS COMPLETE EVEN THOUGH NOTHING WAS MIGRATED
  return;
}
```

**Issue**: If the database migration hasn't run yet (or the `note_id_migration` table doesn't exist), the function marks migration as complete anyway. This means:

1. **First app start**: No mapping exists yet → migration skipped → flag set → UI state never migrated
2. **Database rebuilds**: If the database is rebuilt later, mapping may be regenerated but UI migration won't run again
3. **Silent failure**: No error is logged, users have no idea their state wasn't migrated

#### Problem 4: Vault-Data Storage Timing

Stores like `activeNoteStore` and `temporaryTabsStore` use **both** localStorage and vault-data files:

```typescript
// activeNoteStore.svelte.ts:146
const activeNoteId = await window.api?.loadActiveNote({ vaultId });
```

**The actual flow**:

1. Store constructor fires during module import
2. `initializeVault()` starts async
3. Waits for `getCurrentVault()` to get vault ID
4. Calls `loadActiveNote({ vaultId })` which reads from server-side JSON file
5. **This completely bypasses localStorage clearing**

Even if localStorage is cleared, the vault-data files contain stale IDs that get loaded.

#### Problem 5: Race Between Migration and App Render

```typescript
// App.svelte:41-59
$effect(() => {
  async function runMigration(): Promise<void> {
    if (!migrationService.isMigrationComplete()) {
      await migrationService.migrateUIState();
    }
    migrationComplete = true;
  }
  runMigration();
});
```

**Issue**: This runs in a Svelte `$effect`, which executes **after** component mount. By that time:

1. All stores have already initialized
2. Store constructors have completed or are mid-flight
3. Data has already been loaded from storage
4. UI is potentially already rendering with stale IDs

The "loading screen" only prevents rendering, but stores have already loaded data.

---

## Root Cause Summary

**The fundamental issue**: We're trying to migrate UI state **after** stores have already initialized and loaded data. It's like trying to change the water in a fish tank after the fish are already swimming in it.

**Why backup-and-clear doesn't work**:

- Stores don't just read from localStorage (which we clear)
- They also read from vault-data files (which we clear too late, async)
- Store initialization starts during module import (before we can intervene)
- Migration flag is global, not per-vault
- Migration may silently skip if mapping doesn't exist

---

## Alternative Strategies

### Option 1: Database-Driven Migration (Recommended)

**Core Idea**: Store the migration state and mapping in the database itself, and migrate UI state on-demand when stores request old IDs.

#### Implementation

1. **Add migration state to database**:

```sql
CREATE TABLE ui_migration_state (
  vault_id TEXT PRIMARY KEY,
  ui_state_migrated INTEGER DEFAULT 0,
  migration_completed_at TEXT
);
```

2. **Migration mapping stays in database** (already exists as `note_id_migration` table)

3. **Stores transparently migrate on read**:

```typescript
// activeNoteStore.svelte.ts
private async loadFromStorage(): Promise<void> {
  const vaultId = this.state.currentVaultId || 'default';
  let activeNoteId = await window.api?.loadActiveNote({ vaultId });

  // Check if this ID needs migration
  if (activeNoteId && !activeNoteId.startsWith('n-')) {
    const mapping = await window.api?.getMigrationMapping();
    if (mapping && mapping[activeNoteId]) {
      activeNoteId = mapping[activeNoteId];
      // Save migrated ID back to storage
      await window.api?.saveActiveNote({ vaultId, noteId: activeNoteId });
    }
  }

  // Continue with normal loading...
}
```

4. **No global migration flag** - Each store migrates its own data lazily

5. **Mark vault as migrated after all data is accessed**:

```typescript
// After all stores have loaded and migrated their data
await window.api?.markUIStateMigrated({ vaultId });
```

#### Benefits

- ✅ **Per-vault migration**: Each vault tracks its own migration state
- ✅ **No timing issues**: Migration happens when data is accessed, not before
- ✅ **Idempotent**: Safe to run multiple times (IDs starting with 'n-' are already migrated)
- ✅ **Graceful degradation**: If mapping doesn't exist, old ID is used (better than crash)
- ✅ **No pre-initialization clearing**: Stores load normally, migrate on-the-fly
- ✅ **Works with both localStorage and vault-data**: Each store handles its own migration

#### Drawbacks

- ⚠️ More complex store code (each store needs migration logic)
- ⚠️ Repeated IPC calls to get mapping (can be cached in renderer)
- ⚠️ Migration spread across codebase rather than centralized

---

### Option 2: Deferred Store Initialization

**Core Idea**: Don't initialize stores during module import. Initialize them explicitly after migration completes.

#### Implementation

1. **Lazy store singletons**:

```typescript
// activeNoteStore.svelte.ts
class ActiveNoteStore {
  // Don't auto-initialize in constructor
  constructor() {
    // Empty - no auto-init
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.initializeVault();
  }
}

// Export factory, not instance
let storeInstance: ActiveNoteStore | null = null;
export function getActiveNoteStore(): ActiveNoteStore {
  if (!storeInstance) {
    storeInstance = new ActiveNoteStore();
  }
  return storeInstance;
}
```

2. **Explicit initialization in App.svelte**:

```typescript
// App.svelte
$effect(() => {
  async function init(): Promise<void> {
    // 1. Run migration FIRST
    await migrationService.migrateAll();

    // 2. THEN initialize stores
    await getActiveNoteStore().initialize();
    await getTemporaryTabsStore().initialize();
    // ... etc

    migrationComplete = true;
  }
  init();
});
```

3. **Migration clears ALL storage (localStorage + vault-data) before store init**:

```typescript
// migrationService.svelte.ts
async migrateAll(): Promise<void> {
  const vault = await getCurrentVault();

  // Clear localStorage
  this.clearLocalStorage();

  // Clear vault-data files
  await window.api?.clearVaultUIState({ vaultId: vault.id });

  // NOW stores can initialize with clean slate
}
```

#### Benefits

- ✅ **Guaranteed ordering**: Migration always runs before store initialization
- ✅ **No race conditions**: Stores can't load stale data because they haven't started yet
- ✅ **Centralized migration**: All logic in one place
- ✅ **Clean separation**: Clear boundary between migration and app startup

#### Drawbacks

- ⚠️ **Major refactor**: All stores need to change from auto-init to lazy-init
- ⚠️ **Breaks existing code**: Many places import stores expecting them to be ready
- ⚠️ **Complex initialization order**: Need to manage dependencies between stores
- ⚠️ **Risk of forgetting initialization**: Easy to use a store before calling `.initialize()`

---

### Option 3: Schema Version in Vault-Data

**Core Idea**: Store schema version in vault-data. When schema changes, auto-clear that vault's data.

#### Implementation

1. **Add version to vault-data structure**:

```typescript
interface VaultUIState {
  schemaVersion: string; // '2.0.0'
  activeNote: string | null;
  temporaryTabs: TemporaryTab[];
  // ... etc
}
```

2. **Stores check version on load**:

```typescript
// activeNoteStore.svelte.ts
private async loadFromStorage(): Promise<void> {
  const stored = await window.api?.loadActiveNote({ vaultId });

  if (stored.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    console.log('Schema version mismatch, clearing stale state');
    await this.clearStorage(); // Clear and return
    return;
  }

  // Load normally...
}
```

3. **Migration sets new version**:

```typescript
// After database migration completes
await window.api?.updateVaultDataVersion({
  vaultId,
  schemaVersion: '2.0.0'
});
```

#### Benefits

- ✅ **Automatic invalidation**: Old data automatically discarded on version mismatch
- ✅ **Per-vault**: Each vault has its own version
- ✅ **Simple stores**: No migration logic, just version check
- ✅ **Future-proof**: Works for future schema changes too

#### Drawbacks

- ⚠️ **Loses all UI state**: Users lose tabs, cursor positions, etc. (but this was accepted in current approach anyway)
- ⚠️ **No granular migration**: Can't migrate some data and discard others
- ⚠️ **Requires vault-data changes**: Need to update all vault-data structures

---

### Option 4: Two-Phase Migration with Vault Lock

**Core Idea**: Lock the vault during migration to prevent stores from accessing data until migration completes.

#### Implementation

1. **Vault-level migration lock**:

```typescript
// New IPC handler
ipcMain.handle('is-vault-migrating', async (_event, params: { vaultId: string }) => {
  return vaultMigrationLocks.has(params.vaultId);
});
```

2. **Stores wait for migration lock**:

```typescript
// activeNoteStore.svelte.ts
private async loadFromStorage(): Promise<void> {
  const vaultId = this.currentVaultId;

  // Wait for migration to complete
  while (await window.api?.isVaultMigrating({ vaultId })) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Now safe to load
  const stored = await window.api?.loadActiveNote({ vaultId });
  // ...
}
```

3. **Migration acquires lock**:

```typescript
// migrationService.svelte.ts
async migrateUIState(): Promise<void> {
  const vault = await getCurrentVault();

  // Acquire lock
  await window.api?.acquireVaultMigrationLock({ vaultId: vault.id });

  try {
    // Clear storage
    // Migrate data
    // ...
  } finally {
    // Release lock
    await window.api?.releaseVaultMigrationLock({ vaultId: vault.id });
  }
}
```

#### Benefits

- ✅ **Guaranteed ordering**: Stores can't load until migration completes
- ✅ **Minimal store changes**: Just add wait-for-lock at start of load
- ✅ **Centralized migration**: All logic still in migration service
- ✅ **Per-vault**: Locks are vault-specific

#### Drawbacks

- ⚠️ **Polling overhead**: Stores poll for lock status
- ⚠️ **Deadlock risk**: If migration crashes, lock may never release
- ⚠️ **Complex state management**: Need lock tracking in main process
- ⚠️ **Still has timing issues**: Stores start initialization before we can prevent it

---

## Recommendation

**Use Option 1 (Database-Driven Migration) + Option 3 (Schema Version)**

### Combined Approach

1. **Add schema version to vault-data** - Auto-clear on version mismatch
2. **Store migration mapping in database** - Persist old_id → new_id mapping
3. **Lazy migration on first access** - Each store migrates its own data when loaded
4. **Mark vault as migrated** - Track completion in database

### Why This Combination Works

- **Handles timing gracefully**: Stores can load whenever they want, migration happens on-demand
- **Per-vault state**: Each vault tracks its own migration independently
- **Idempotent**: Safe to run multiple times, checks ID format before migrating
- **Progressive**: Can migrate some data and leave others (or discard if version too old)
- **Simple fallback**: If mapping missing, use old ID (app may show "note not found" but won't crash)
- **Future-proof**: Schema version system works for all future migrations

### Implementation Steps

1. Add `schemaVersion` field to all vault-data structures
2. Add helper function to get migration mapping (with caching)
3. Update each store's `loadFromStorage()` to:
   - Check schema version
   - If mismatch and ID is old format, try to migrate using mapping
   - Save migrated data back to storage
4. Remove global migration flag from localStorage
5. Remove synchronous `clearStaleUIState()` call
6. Remove `migrateUIState()` background migration

### Code Changes Required

**Minimal changes to stores**:

```typescript
private async loadFromStorage(): Promise<void> {
  const stored = await window.api?.loadActiveNote({ vaultId });

  // Version check
  if (stored.schemaVersion !== '2.0.0') {
    console.log('Clearing outdated UI state');
    return; // Use empty state
  }

  // ID migration (if needed)
  let noteId = stored.noteId;
  if (noteId && !noteId.startsWith('n-')) {
    const newId = await migrateNoteId(noteId); // Helper function
    if (newId) {
      noteId = newId;
      await this.saveToStorage(); // Persist migrated ID
    }
  }

  this.state.activeNote = noteId;
}
```

**Helper function**:

```typescript
// migrationHelper.svelte.ts
let cachedMapping: Record<string, string> | null = null;

export async function migrateNoteId(oldId: string): Promise<string | null> {
  if (!cachedMapping) {
    cachedMapping = (await window.api?.getMigrationMapping()) || {};
  }
  return cachedMapping[oldId] || null;
}
```

---

## What About the Current Implementation?

### Can We Fix It?

The current approach could theoretically work if we fix these issues:

1. **Make migration flag per-vault** instead of global
2. **Block store initialization** until migration completes (Option 4's locking)
3. **Check vault schema before deciding to migrate** (don't rely on global flag)
4. **Don't mark complete if mapping doesn't exist** (retry on next startup)

But even with all these fixes, we're fighting against JavaScript's module loading system. The fundamental architecture (synchronous imports, async initialization) makes this approach fragile and error-prone.

### Why Not Just Fix It?

- Too many edge cases (vault switching, multiple vaults, partial migrations)
- Still requires major refactoring of stores (to delay initialization)
- Doesn't solve the per-vault state problem elegantly
- Future schema changes will have the same issues

**Better to adopt a migration strategy that works WITH the architecture, not against it.**

---

## Testing Strategy for New Approach

1. **New vault (v2.0.0)**: Should work normally, no migration needed
2. **Old vault (v1.1.0) first open**:
   - Schema version mismatch detected
   - UI state cleared (or migrated if mapping exists)
   - New schema version saved
3. **Multiple vaults at different versions**:
   - Each vault migrates independently
   - Switching vaults doesn't affect migration state
4. **Database rebuild**:
   - Migration mapping may be regenerated
   - UI state can be migrated again using new mapping
5. **Partial migration failure**:
   - Some stores migrate, others don't
   - Next startup migrates remaining stores
   - No "all or nothing" requirement

---

## Migration Path from Current Implementation

1. **Keep current migration code** for users who already ran it
2. **Add new schema version system** for future robustness
3. **Add lazy migration helpers** to stores
4. **Deprecate global migration flag** (but don't remove yet)
5. **Test thoroughly** with old vaults before release
6. **Document the change** for users (may lose some UI state)

---

## Conclusion

The current migration approach has fundamental architectural mismatches:

- Tries to migrate before stores init, but stores init during import
- Uses global flag for per-vault state
- Clears storage but stores read from multiple sources
- No handling for missing migration mapping

**Recommended solution**: Database-driven lazy migration with schema versioning. This works with the existing architecture instead of fighting it, handles per-vault state correctly, and is robust to timing issues.
