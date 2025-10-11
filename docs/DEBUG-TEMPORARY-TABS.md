# Debug Logging for Temporary Tabs Issue

## Problem

Users are experiencing issues where temporary tabs show "Untitled" and clicking on them does nothing. This happens when a tab references a note that doesn't exist in the `notesStore`.

## Debug Logging Added

### 1. Tab Hydration (`TemporaryTabs.svelte:27-38`)

When tabs are rendered, they need to be "hydrated" with note metadata. We log when this fails:

```typescript
console.warn('[TemporaryTabs] Tab hydration failed - note not found:', {
  tabId: tab.id,
  noteId: tab.noteId,
  source: tab.source,
  openedAt: tab.openedAt,
  lastAccessed: tab.lastAccessed,
  totalNotesInStore: notesStore.notes.length
});
```

### 2. Tab Click Handler (`TemporaryTabs.svelte:47-71`)

When a user clicks on a tab, we log:

- The click event with the noteId
- If the note is found and opened successfully
- **If the note is NOT found** (ERROR level):
  - The noteId being searched for
  - Sample of available note IDs (first 10)
  - Total notes in store
  - The tab object itself

### 3. Tab Addition (`temporaryTabsStore.svelte.ts:88-146`)

When adding a tab:

- Log when tab addition is blocked due to vault switching
- Log when adding a new tab (with details)
- Log when updating an existing tab
- Log when old tabs are removed due to max limit

### 4. Loading from Storage (`temporaryTabsStore.svelte.ts:447-505`)

When loading tabs from persistent storage:

- Log which vault is being loaded
- Log the count and note IDs of stored tabs found
- Log the parsed tabs with all details
- Log when no stored tabs are found

### 5. Note Events (`temporaryTabsStore.svelte.ts:39-59`)

When note events are received via message bus:

- `note.renamed`: Log old and new IDs
- `note.deleted`: Log the deleted note ID
- `vault.switched`: Log the vault ID being switched to

### 6. Tab Removal by Note IDs (`temporaryTabsStore.svelte.ts:210-219`)

When tabs are removed because their notes were deleted or to handle coordination:

- Log the note IDs being removed
- Log the tabs being removed with their details

### 7. Note ID Updates (`temporaryTabsStore.svelte.ts:295-311`)

When a note is renamed and tabs need to be updated:

- Log each tab being updated with old and new note ID
- Log summary of how many tabs were updated

### 8. Old Tab Cleanup (`temporaryTabsStore.svelte.ts:377-389`)

When cleaning up old tabs based on last accessed time:

- Log the cutoff time
- Log each tab being removed with its age in hours

## How to Use This Logging

When investigating the "Untitled" tab issue:

1. **Look for hydration warnings** - These show when a tab is trying to display but can't find its note
2. **Look for click error logs** - These show the full context when a user clicks an "Untitled" tab
3. **Trace backward** - Use the noteId from the error to search for when that tab was created
4. **Check storage logs** - See if the problematic tab was loaded from storage
5. **Check deletion logs** - See if the note was deleted after the tab was created
6. **Check cleanup logs** - See if legitimate tabs are being removed too aggressively

## Common Scenarios

### Scenario 1: Note Deleted But Tab Remains

- Look for `note.deleted` event log
- Check if corresponding `removeTabsByNoteIds` log shows the tab was removed
- If not removed, there may be a race condition or event not firing

### Scenario 2: Note Never Existed

- Look at `addTab` logs to see what noteId was added
- Check if that noteId exists in `notesStore` at that time
- May indicate the tab was added before the note was created

### Scenario 3: Vault Switching Issues

- Check `vault.switched` event logs
- Check `loadFromStorage` logs to see if wrong vault's tabs were loaded
- Look for `isVaultSwitching` blocks that may have prevented cleanup

### Scenario 4: Old Tabs Persisting

- Check `cleanupOldTabs` logs to see if cleanup is running
- Check if `autoCleanupHours` setting is too large (default: 24 hours)
- Look at `lastAccessed` timestamps in hydration warnings
