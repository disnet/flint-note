# Vault Switch Race Condition Investigation

## The Problem

When switching vaults and quickly clicking on a pinned or temporary tab, a tab with "Untitled" title appears and cannot be opened. The tab references a note ID that doesn't exist in the notes store.

**Error logs observed:**

```
[temporaryTabsStore] addTab: Adding tab for noteId: n-b5439957 source: navigation
[temporaryTabsStore] addTab: Tab already exists, updating lastAccessed
[TemporaryTabs] Tab hydration failed - note not found: {
  tabId: 'tab-1760162526955-9xzdk1s31',
  noteId: 'n-5e23c36f',
  source: 'navigation',
  ...
}
```

## Key Observations

1. **Timing**: Happens when user clicks quickly after vault switch starts
2. **Source**: The problematic tab has `source: 'navigation'`
3. **Sequence**: `addTab()` is called, but the note doesn't exist in `notesStore.notes`
4. **Hydration Failure**: `TemporaryTabs.svelte` tries to hydrate tabs by looking up note IDs in `notesStore.notes`, but the lookup fails

## Architecture Overview

### Vault Switch Sequence (VaultSwitcher.svelte:47-87)

```javascript
async function switchVault(vaultId: string) {
  // 1. Start vault switch - sets isVaultSwitching = true
  await temporaryTabsStore.startVaultSwitch()
  await activeNoteStore.startVaultSwitch()

  // 2. Close active note
  onNoteClose()

  // 3. Switch vault server-side
  await service.switchVault({ vaultId })

  // 4. Publish event
  messageBus.publish({ type: 'vault.switched', vaultId })

  // 5. Wait for notes to load
  await notesStore.initialize()

  // 6. Refresh stores
  await pinnedNotesStore.refreshForVault(vaultId)
  await temporaryTabsStore.refreshForVault(vaultId)
  await unifiedChatStore.refreshForVault(vaultId)
  await inboxStore.refresh(vaultId)
  await dailyViewStore.reinitialize()

  // 7. End vault switch - sets isVaultSwitching = false
  temporaryTabsStore.endVaultSwitch()
}
```

### Tab Hydration (TemporaryTabs.svelte:27-45)

```javascript
let hydratedTabs = $derived(
  temporaryTabsStore.tabs.map((tab) => {
    const note = notesStore.notes.find((n) => n.id === tab.noteId);
    if (!note && !isNotesLoading) {
      console.warn('[TemporaryTabs] Tab hydration failed - note not found:', {...});
    }
    return { ...tab, title: note?.title || '' };
  })
);
```

### Tab Addition Guard (temporaryTabsStore.svelte.ts:93-105)

```javascript
async addTab(noteId: string, source: string) {
  await this.ensureInitialized();

  // Don't add tabs while we're switching vaults
  if (this.isVaultSwitching) {
    console.log('[temporaryTabsStore] addTab: Blocked by isVaultSwitching flag');
    return;
  }

  // Proceed with adding tab...
}
```

## Attempted Fixes

### Fix 1: Loading State Guards (INSUFFICIENT)

**Files**: `TemporaryTabs.svelte`, `PinnedNotes.svelte`

Added `isNotesLoading` checks to prevent clicks while notes are loading:

```javascript
let isNotesLoading = $derived(notesStore.loading);

async function handleTabClick(noteId: string) {
  if (isNotesLoading) {
    console.log('Click blocked - notes are still loading');
    return;
  }
  // ...
}
```

**Result**: Didn't fix the issue. Tabs were still being added before notes loaded.

**Why it failed**: This only prevents _clicks_, not the initial `addTab()` call that's happening from somewhere else.

### Fix 2: Wait for noteStore Initialization (INSUFFICIENT)

**Files**: `VaultSwitcher.svelte`, `noteStore.svelte.ts`

Changed vault switch to explicitly wait for notes to load:

```javascript
await notesStore.initialize(); // Wait before refreshing tabs
await temporaryTabsStore.refreshForVault(vaultId);
```

Made `initialize()` idempotent to prevent duplicate initialization.

**Result**: Didn't fix the issue. Tabs are still being added with missing notes.

**Why it failed**: The vault switch sequence properly waits for notes, but something else is calling `addTab()` during the switch.

### Fix 3: Centralized Flag Control (INSUFFICIENT)

**Files**: `temporaryTabsStore.svelte.ts`

Moved `isVaultSwitching` flag control to VaultSwitcher:

```javascript
// refreshForVault() no longer clears the flag
// Only endVaultSwitch() clears it at the very end
```

**Result**: Still happening!

**Why it failed**: Unknown - the guard should be working but tabs are still being added.

## Current Theories

### Theory 1: Event Listener Race

The `vault.switched` event triggers `temporaryTabsStore.refreshForVault()` via event listener (temporaryTabsStore.svelte.ts:54-59):

```javascript
messageBus.subscribe('vault.switched', async (event) => {
  await this.refreshForVault(event.vaultId);
});
```

This could run concurrently with the explicit `await temporaryTabsStore.refreshForVault()` call in VaultSwitcher, potentially causing the flag to be cleared prematurely or other timing issues.

### Theory 2: Navigation Event During Switch

The log shows `source: 'navigation'`, which means something is triggering note navigation during the vault switch. Potential sources:

- User clicking a tab/pinned note
- Auto-navigation from saved UI state
- Navigation history restoration
- System trying to restore last active note

The navigation triggers `addTab()` which should be blocked by `isVaultSwitching`, but somehow it's getting through.

### Theory 3: Reactivity Propagation Delay

Svelte's reactivity might not propagate `isVaultSwitching` flag changes immediately to all derived states. There could be a window where:

1. Flag is set to `true`
2. Some reactive derivation hasn't updated yet
3. Navigation happens in that window
4. `addTab()` sees old flag value (`false`)

### Theory 4: Tab Loading Before Notes Published

The sequence:

1. `notesStore.initialize()` completes
2. Notes are published via `notes.bulkRefresh` event
3. `temporaryTabsStore.refreshForVault()` loads tabs from DB
4. **Gap here**: Tabs exist but notes haven't propagated to `notesStore.notes` derived value
5. Hydration fails because `notesStore.notes` is still empty

### Theory 5: Old Tabs from Previous Vault

`refreshForVault()` loads tabs for the new vault from DB, but those tabs might reference note IDs that:

- Existed in a previous session
- Were deleted since last session
- Are from a different vault (DB corruption/migration issue)

## Next Steps to Debug

1. **Add comprehensive logging** to trace `isVaultSwitching` flag changes:

   ```javascript
   set isVaultSwitching(value) {
     console.log('[FLAG CHANGE]', this._isVaultSwitching, '->', value, new Error().stack);
     this._isVaultSwitching = value;
   }
   ```

2. **Log all `addTab()` calls** with stack traces to find the source:

   ```javascript
   console.log(
     '[addTab] Called with:',
     noteId,
     source,
     'isVaultSwitching:',
     this.isVaultSwitching,
     new Error().stack
   );
   ```

3. **Check event listener execution** - verify if `vault.switched` listener is running concurrently

4. **Add assertion** to verify notes are actually in store after `initialize()`:

   ```javascript
   await notesStore.initialize();
   console.assert(
     notesStore.notes.length > 0,
     'Notes should be loaded after initialize!'
   );
   ```

5. **Verify tab data integrity** - check if tabs loaded from DB have valid note IDs:

   ```javascript
   // In refreshForVault after loadFromStorage
   console.log(
     'Loaded tabs:',
     this.state.tabs.map((t) => t.noteId)
   );
   console.log(
     'Available notes:',
     notesStore.notes.map((n) => n.id)
   );
   ```

6. **Check navigation service** - verify if `noteNavigationService` is triggering navigation during vault switch

7. **Disable event listener temporarily** to see if the problem goes away:
   ```javascript
   // Temporarily comment out the vault.switched subscription
   // messageBus.subscribe('vault.switched', async (event) => {
   //   await this.refreshForVault(event.vaultId);
   // });
   ```

## Code References

- **VaultSwitcher**: `src/renderer/src/components/VaultSwitcher.svelte:47-87`
- **temporaryTabsStore.addTab**: `src/renderer/src/stores/temporaryTabsStore.svelte.ts:93-162`
- **temporaryTabsStore.refreshForVault**: `src/renderer/src/stores/temporaryTabsStore.svelte.ts:586-623`
- **noteStore.initialize**: `src/renderer/src/services/noteStore.svelte.ts:124-180`
- **TemporaryTabs hydration**: `src/renderer/src/components/TemporaryTabs.svelte:27-45`
- **Event listener**: `src/renderer/src/stores/temporaryTabsStore.svelte.ts:54-59`

## Related Issues

- Tabs loaded from DB reference note IDs that should exist in the new vault
- Tab hydration happens via reactive `$derived` which depends on `notesStore.notes`
- Multiple stores subscribe to `vault.switched` event and refresh independently
- The `isVaultSwitching` flag is meant to block tab additions during the switch

## Questions to Answer

1. Where exactly is the `addTab('n-b5439957', 'navigation')` call coming from?
2. Why isn't the `isVaultSwitching` guard preventing it?
3. Is the tab being added from the new vault's DB, or is it leaking from the old vault?
4. Are the notes actually loaded when we think they are, or is there a reactivity delay?
5. Is there a race between the event listener and the explicit `refreshForVault()` call?
