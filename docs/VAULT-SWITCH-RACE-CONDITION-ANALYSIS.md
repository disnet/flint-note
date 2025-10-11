# Vault Switch Race Condition - Deep Analysis

## Executive Summary

After thorough investigation of the vault switching architecture, I've identified **the root cause** of the race condition and understand why all previous fixes have failed. The issue is a fundamental **architectural problem with reactive timing** and **multiple competing event flows**.

## Root Cause Analysis

### The Core Problem: Event Listener Race

The race condition occurs because **two separate code paths** try to refresh the temporary tabs store concurrently:

1. **Explicit await path** (VaultSwitcher.svelte:74)

   ```javascript
   await temporaryTabsStore.refreshForVault(vaultId);
   ```

2. **Event listener path** (temporaryTabsStore.svelte.ts:54-59)
   ```javascript
   messageBus.subscribe('vault.switched', async (event) => {
     await this.refreshForVault(event.vaultId);
   });
   ```

The `vault.switched` event is published at line 63-66 in VaultSwitcher, **BEFORE** the explicit `await temporaryTabsStore.refreshForVault()` at line 74. This means:

```
Timeline:
1. [Line 52] startVaultSwitch() - sets isVaultSwitching = true
2. [Line 59] service.switchVault() completes
3. [Line 63-66] vault.switched event published
4. [Line 63-66] → Event listener fires → refreshForVault() starts (async, doesn't block)
5. [Line 70] notesStore.initialize() starts
6. [Line 74] temporaryTabsStore.refreshForVault() called explicitly
7. [Line 82] endVaultSwitch() - sets isVaultSwitching = false

RACE: Steps 4 and 6 run concurrently, both trying to load tabs!
```

### Why the `isVaultSwitching` Guard Failed

The guard in `addTab()` (temporaryTabsStore.svelte.ts:99-104) checks:

```javascript
if (this.isVaultSwitching) {
  console.log('[temporaryTabsStore] addTab: Blocked by isVaultSwitching flag');
  return;
}
```

However, the problematic `addTab()` call is coming from **AFTER** `endVaultSwitch()` is called at line 82. Here's the sequence:

1. Vault switch completes, flag cleared
2. User clicks on a pinned note or temporary tab
3. Click handler calls `handleNoteSelect()`
4. `handleNoteSelect()` → `noteNavigationService.openNote()`
5. `noteNavigationService.openNote()` → `temporaryTabsStore.addTab()` (line 51)
6. Tab is added, but notes haven't fully propagated from noteCache to notesStore.notes yet!

### The Reactivity Propagation Delay

There's a critical window between:

- **Event published**: `notes.bulkRefresh` (noteStore.svelte.ts:164)
- **Cache updated**: noteCache handles the event immediately (noteCache.svelte.ts:60-64)
- **Derived value propagates**: `notesStore.notes` is a `$derived` that reads from cache (noteStore.svelte.ts:47-55)

Svelte's reactivity is **synchronous within the same tick**, but there can be a microtask delay before derived values propagate to all consumers. During this window:

- `temporaryTabsStore.refreshForVault()` loads tabs from DB
- `notesStore.notes` is still empty or incomplete
- User clicks trigger navigation
- `addTab()` is called with a valid noteId
- `TemporaryTabs.svelte` tries to hydrate but `notesStore.notes.find()` returns undefined

## Why Previous Fixes Failed

### Fix 1: Loading State Guards (INSUFFICIENT)

**Files**: TemporaryTabs.svelte:49-52, PinnedNotes.svelte:46-50

```javascript
if (isNotesLoading) {
  console.log('[TemporaryTabs] Click blocked - notes are still loading');
  return;
}
```

**Why it failed**:

- Only blocks **UI clicks**, not programmatic `addTab()` calls
- Doesn't address the event listener race
- `notesStore.loading` becomes `false` immediately after `initialize()` completes, but derived values may not have propagated yet

### Fix 2: Wait for noteStore Initialization (INSUFFICIENT)

**Files**: VaultSwitcher.svelte:70, noteStore.svelte.ts:126-131

```javascript
await notesStore.initialize(); // Wait before refreshing tabs
await temporaryTabsStore.refreshForVault(vaultId);
```

**Why it failed**:

- The event listener path (`vault.switched` → `refreshForVault()`) runs **concurrently** with this explicit path
- Event listener was triggered at line 63-66, **before** `notesStore.initialize()` at line 70
- Two `refreshForVault()` calls race against each other

### Fix 3: Centralized Flag Control (INSUFFICIENT)

**Files**: temporaryTabsStore.svelte.ts:586-623

```javascript
// refreshForVault() no longer clears the flag
// Only endVaultSwitch() clears it at the very end
```

**Why it failed**:

- Flag is cleared at line 82 after all stores are refreshed
- But navigation can happen **immediately after**, before reactivity propagates
- Also, the event listener race still exists

## The Complete Picture

### Event Flow Diagram

```
User clicks "Switch Vault"
        ↓
VaultSwitcher.switchVault()
        ↓
┌───────────────────────────────────────────────────────┐
│ 1. startVaultSwitch() - Flag ON, UI tabs cleared     │
├───────────────────────────────────────────────────────┤
│ 2. service.switchVault()                              │
├───────────────────────────────────────────────────────┤
│ 3. messageBus.publish('vault.switched')               │
│    ↓                                                  │
│    ├→ noteStore listener → initialize()              │
│    ├→ temporaryTabsStore listener → refreshForVault()│ ← RACE #1
│    └→ other store listeners...                       │
├───────────────────────────────────────────────────────┤
│ 4. await notesStore.initialize()                      │
│    ↓                                                  │
│    - Loads notes                                      │
│    - Publishes notes.bulkRefresh event                │
│    - noteCache updates synchronously                  │
│    - notesStore.notes ($derived) updates              │ ← Reactivity delay
├───────────────────────────────────────────────────────┤
│ 5. await temporaryTabsStore.refreshForVault()        │ ← RACE #1
│    ↓                                                  │
│    - Loads tabs from DB                               │
│    - Tab IDs may reference notes not yet visible     │
├───────────────────────────────────────────────────────┤
│ 6. Other store refreshes...                           │
├───────────────────────────────────────────────────────┤
│ 7. endVaultSwitch() - Flag OFF                       │
└───────────────────────────────────────────────────────┘
        ↓
User immediately clicks pinned/temp tab
        ↓
handleNoteSelect() → noteNavigationService.openNote()
        ↓
temporaryTabsStore.addTab(noteId, 'navigation')  ← RACE #2
        ↓
TemporaryTabs.svelte hydration fails:
  notesStore.notes.find() returns undefined  ← Derived not yet propagated
        ↓
Tab shows "Untitled" ❌
```

### Multiple Sources of `addTab()` Calls

1. **Direct navigation** (App.svelte:80-82)

   ```javascript
   async function handleNoteSelect(note: NoteMetadata): Promise<void> {
     await noteNavigationService.openNote(note, 'navigation', openNoteEditor, () => {
       activeSystemView = null;
     });
   }
   ```

2. **Note navigation service** (noteNavigationService.svelte.ts:51)

   ```javascript
   await temporaryTabsStore.addTab(note.id, source);
   ```

3. **Unpinned notes handler** (App.svelte:312)

   ```javascript
   for (const noteId of noteIds) {
     await temporaryTabsStore.addTab(noteId, 'navigation');
   }
   ```

4. **Active note restoration** (App.svelte:223-232)
   ```javascript
   await noteNavigationService.openNote(
     restoredNote,
     'navigation',
     ...
   );
   ```

All of these can fire immediately after vault switch completes!

## Architectural Issues

### Issue 1: Duplicate Event Handling

**Problem**: Both explicit calls and event listeners handle the same events, creating races.

**Example**:

- VaultSwitcher explicitly calls `temporaryTabsStore.refreshForVault(vaultId)`
- temporaryTabsStore also subscribes to `vault.switched` and calls `refreshForVault()`
- **Result**: Two concurrent loads from DB, race condition

### Issue 2: Event Bus Before Explicit Sequencing

**Problem**: `vault.switched` event is published **before** the coordinated sequence starts.

**Location**: VaultSwitcher.svelte:63-66 → fires before line 70 (notesStore.initialize)

### Issue 3: No Coordination Between Stores

**Problem**: Each store independently reacts to events without coordination.

**Examples**:

- noteStore initializes independently (noteStore.svelte.ts:187-189)
- temporaryTabsStore refreshes independently (temporaryTabsStore.svelte.ts:54-59)
- No guarantee of ordering or completion

### Issue 4: Reactive Derivation Timing Assumptions

**Problem**: Code assumes `$derived` values are immediately available after event publish.

**Example**: noteStore.svelte.ts:47-55

```javascript
const notes = $derived.by(() => {
  const allNotes = noteCache.getAllNotes();
  return allNotes;
});
```

This is synchronous, but consumers of `notes` may not see the update immediately.

### Issue 5: Flag-Based Blocking Is Insufficient

**Problem**: `isVaultSwitching` flag only blocks during the switch, not during reactivity propagation.

**Timeline**:

1. Switch completes → flag cleared
2. Tabs are in UI (loaded from DB)
3. Notes are in cache but `$derived` not propagated
4. User clicks → `addTab()` passes flag check
5. Hydration fails

## Proposed Architecture

### Option 1: Sequential Event-Driven (Recommended)

**Principle**: Use events for coordination, but with explicit sequencing.

```javascript
// VaultSwitcher.svelte
async function switchVault(vaultId: string): Promise<void> {
  try {
    isLoading = true;

    // Phase 1: Prepare for switch
    await temporaryTabsStore.startVaultSwitch();
    await activeNoteStore.startVaultSwitch();
    await cursorPositionStore.startVaultSwitch();
    onNoteClose();

    // Phase 2: Switch vault
    await service.switchVault({ vaultId });
    await loadVaults();

    // Phase 3: Load data (coordinated sequence)
    // 3a. Clear cache immediately
    messageBus.publish({ type: 'vault.switched', vaultId });

    // 3b. Wait for notes to fully load and propagate
    await notesStore.initialize();

    // 3c. Give derived values time to propagate
    await new Promise(resolve => setTimeout(resolve, 0));

    // 3d. Refresh stores that depend on notes
    await pinnedNotesStore.refreshForVault(vaultId);
    await temporaryTabsStore.refreshForVault(vaultId);
    await unifiedChatStore.refreshForVault(vaultId);
    await inboxStore.refresh(vaultId);
    await dailyViewStore.reinitialize();

    // Phase 4: Cleanup
    await cursorPositionStore.endVaultSwitch();
    await activeNoteStore.endVaultSwitch();
    temporaryTabsStore.endVaultSwitch();

    isDropdownOpen = false;
  } catch (error) {
    console.error('Failed to switch vault:', error);
    temporaryTabsStore.endVaultSwitch();
  } finally {
    isLoading = false;
  }
}
```

**Key Changes**:

1. **Remove event listeners** from stores for `vault.switched` that duplicate explicit calls
2. Use `vault.switched` event **only** for cache clearing, not for data loading
3. Explicit microtask yield after `initialize()` to ensure reactivity propagates
4. Keep sequential `await` chain for dependent operations

### Option 2: Centralized Vault Switch Manager

**Principle**: Single service coordinates all vault switching.

```javascript
// vaultSwitchManager.svelte.ts
class VaultSwitchManager {
  private isSwitching = $state(false);
  private switchPromise: Promise<void> | null = null;

  async switchVault(vaultId: string): Promise<void> {
    // Prevent concurrent switches
    if (this.isSwitching && this.switchPromise) {
      await this.switchPromise;
      return;
    }

    this.isSwitching = true;
    this.switchPromise = this._doSwitch(vaultId);

    try {
      await this.switchPromise;
    } finally {
      this.isSwitching = false;
      this.switchPromise = null;
    }
  }

  private async _doSwitch(vaultId: string): Promise<void> {
    // Phase 1: Start switch
    await Promise.all([
      temporaryTabsStore.startVaultSwitch(),
      activeNoteStore.startVaultSwitch(),
      cursorPositionStore.startVaultSwitch(),
    ]);

    // Phase 2: Switch backend
    await chatService.switchVault({ vaultId });

    // Phase 3: Clear and notify
    messageBus.publish({ type: 'vault.switched', vaultId });

    // Phase 4: Load notes (critical path)
    await notesStore.initialize();
    await this.ensureReactivityPropagation();

    // Phase 5: Load dependent stores in parallel
    await Promise.all([
      pinnedNotesStore.refreshForVault(vaultId),
      temporaryTabsStore.refreshForVault(vaultId),
      unifiedChatStore.refreshForVault(vaultId),
      inboxStore.refresh(vaultId),
      dailyViewStore.reinitialize(),
    ]);

    // Phase 6: End switch
    await Promise.all([
      cursorPositionStore.endVaultSwitch(),
      activeNoteStore.endVaultSwitch(),
    ]);
    temporaryTabsStore.endVaultSwitch();
  }

  private async ensureReactivityPropagation(): Promise<void> {
    // Wait for microtask queue to drain
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify notes are actually available
    if (notesStore.notes.length === 0) {
      console.warn('[VaultSwitch] Notes not propagated yet, waiting...');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  get isSwitchingVault(): boolean {
    return this.isSwitching;
  }
}

export const vaultSwitchManager = new VaultSwitchManager();
```

**Benefits**:

- Single source of truth for switching state
- Prevents concurrent switches
- Explicit reactivity propagation handling
- Parallel loading where safe, sequential where needed

### Option 3: Deferred UI Updates

**Principle**: Don't show tabs/pinned notes until data is fully ready.

```javascript
// temporaryTabsStore.svelte.ts
class TemporaryTabsStore {
  private state = $state<TemporaryTabsState>(defaultState);
  private isVaultSwitching = false;
  private isHydrated = $state(false); // NEW

  async refreshForVault(vaultId?: string): Promise<void> {
    this.isHydrated = false; // Mark as not hydrated

    // ... existing load logic ...

    await this.loadFromStorage();
    await this.cleanupOldTabs();

    // Wait for notes to be available
    await this.ensureNotesAvailable();

    this.isHydrated = true; // Mark as hydrated
  }

  private async ensureNotesAvailable(): Promise<void> {
    const { notesStore } = await import('../services/noteStore.svelte');

    // Wait for notes to be loaded
    let attempts = 0;
    while (notesStore.loading && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 10));
      attempts++;
    }

    // Validate all tabs have corresponding notes
    const missingNotes = this.state.tabs.filter(
      tab => !notesStore.notes.some(n => n.id === tab.noteId)
    );

    if (missingNotes.length > 0) {
      console.warn('[temporaryTabsStore] Removing tabs with missing notes:', missingNotes);
      this.state.tabs = this.state.tabs.filter(
        tab => notesStore.notes.some(n => n.id === tab.noteId)
      );
    }
  }

  get isReady(): boolean {
    return this.isHydrated && !this.isVaultSwitching;
  }
}
```

**UI Usage**:

```svelte
<!-- TemporaryTabs.svelte -->
{#if temporaryTabsStore.isReady}
  <div class="tabs-list">
    {#each hydratedTabs as tab, index (tab.id)}
      <!-- ... -->
    {/each}
  </div>
{:else}
  <div class="loading-state">Loading tabs...</div>
{/if}
```

## Recommended Solution

**Hybrid approach combining Options 1 and 3:**

1. **Remove duplicate event listeners** that race with explicit calls
2. **Add explicit microtask yield** after notes initialize
3. **Add `isReady` flag** to stores for UI rendering guards
4. **Validate tab data** before showing in UI
5. **Keep `isVaultSwitching` flag** for blocking new operations

### Implementation Steps

1. **Phase 1: Remove duplicate listeners**
   - Remove `vault.switched` listener from temporaryTabsStore (line 54-59)
   - Remove `vault.switched` listener from noteStore (line 187-189)
   - Keep event for cache clearing only

2. **Phase 2: Add reactivity propagation delay**
   - After `notesStore.initialize()`, add microtask yield
   - Verify notes are available before proceeding

3. **Phase 3: Add data validation**
   - In `refreshForVault()`, validate all loaded tabs have corresponding notes
   - Remove orphaned tabs immediately

4. **Phase 4: Add UI ready state**
   - Add `isReady` flag to temporaryTabsStore
   - Guard UI rendering on ready state
   - Show loading state during switch

5. **Phase 5: Test thoroughly**
   - Rapid vault switching
   - Clicking during switch
   - Empty vaults
   - Large vaults (>1000 notes)

## Testing Strategy

### Manual Test Cases

1. **Rapid switch and click**
   - Switch vault
   - Immediately click pinned note
   - Verify no "Untitled" tabs appear

2. **Concurrent switches**
   - Start switch
   - Switch again before first completes
   - Verify no corruption

3. **Empty vault**
   - Switch to vault with no notes
   - Verify tabs clear correctly

4. **Large vault**
   - Switch to vault with 1000+ notes
   - Verify reactivity propagation works

### Automated Tests

```typescript
describe('Vault Switch Race Conditions', () => {
  it('should not add tabs during vault switch', async () => {
    await vaultSwitchManager.switchVault('vault-2');
    expect(temporaryTabsStore.tabs).toHaveLength(0);
  });

  it('should wait for notes before showing tabs', async () => {
    await vaultSwitchManager.switchVault('vault-2');
    expect(temporaryTabsStore.isReady).toBe(true);
    expect(notesStore.notes.length).toBeGreaterThan(0);
  });

  it('should handle rapid switching', async () => {
    const switch1 = vaultSwitchManager.switchVault('vault-2');
    const switch2 = vaultSwitchManager.switchVault('vault-3');
    await Promise.all([switch1, switch2]);
    expect(
      temporaryTabsStore.tabs.every((tab) =>
        notesStore.notes.some((n) => n.id === tab.noteId)
      )
    ).toBe(true);
  });
});
```

## Conclusion

The race condition is caused by:

1. **Duplicate event handling paths** running concurrently
2. **Event published before coordinated sequence** begins
3. **Reactive derivation timing assumptions** without verification
4. **Immediate user interaction** after flag clearing but before propagation

The solution requires:

1. **Eliminating duplicate event listeners** for data loading
2. **Explicit reactivity propagation delays** with verification
3. **Data validation** before UI rendering
4. **UI ready states** to prevent premature interaction

This is a fundamental **architectural issue** that cannot be fixed with flags alone. It requires coordinating the timing of event handling, reactivity propagation, and UI updates.
