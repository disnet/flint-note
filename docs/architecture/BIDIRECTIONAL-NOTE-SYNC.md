# Bidirectional Note Synchronization

## Overview

This document describes how the main NoteEditor and SidebarNotes components maintain bidirectional synchronization when the same note is open in both locations. The system allows users to edit a note in either the main editor or the sidebar, with changes immediately reflected in the other location.

## Architecture

### Components

1. **NoteEditor** - Main note editing view in the center panel
2. **SidebarNotes** - Collapsible note editors in the right sidebar
3. **notesStore** - Central notification hub for note changes
4. **sidebarNotesStore** - Storage and state management for sidebar notes

### Data Flow

```
User Edit (NoteEditor)
    ↓
Save to Database
    ↓
notesStore.notifyNoteUpdated(noteId)
    ↓
SidebarNotes $effect detects update
    ↓
Reload from database
    ↓
Update sidebar display (with external update protection)

─────────────────────────────────────

User Edit (SidebarNotes)
    ↓
Debounced save to database (500ms)
    ↓
notesStore.notifyNoteUpdated(noteId)
    ↓
NoteEditor $effect detects update
    ↓
Reload from database
    ↓
Update editor display
```

## NoteEditor: Handling Updates from Sidebar

### Content Updates

**Location:** `src/renderer/src/components/NoteEditor.svelte`

```typescript
// Watch for specific note updates and reload content if the current note was updated
$effect(() => {
  const updateCounter = notesStore.noteUpdateCounter;
  const lastUpdatedNoteId = notesStore.lastUpdatedNoteId;

  // Skip initial load (when counter is 0) and only reload if current note was updated
  if (updateCounter > 0 && lastUpdatedNoteId === note?.id) {
    setTimeout(async () => {
      try {
        await loadNote(note);
      } catch (loadError) {
        console.warn('Failed to reload note content after agent update:', loadError);
      }
    }, 100);
  }
});
```

**How It Works:**

1. Watches `notesStore.noteUpdateCounter` for changes
2. Checks if the updated note matches the currently open note
3. Reloads the entire note from database (content + cursor position)
4. 100ms delay allows the database write to complete

### Title Updates (Renames)

```typescript
// Watch for note renames and update note reference if this note was renamed
$effect(() => {
  const renameCounter = notesStore.noteRenameCounter;
  const oldId = notesStore.lastRenamedNoteOldId;
  const newId = notesStore.lastRenamedNoteNewId;

  // Skip initial load (when counter is 0) and only update if current note was renamed
  if (renameCounter > 0 && oldId === note?.id && newId) {
    setTimeout(async () => {
      try {
        const noteService = getChatService();
        const updatedNote = await noteService.getNote({ identifier: newId });

        if (updatedNote) {
          // Update the title override to reflect the rename
          titleOverride = updatedNote.title || note.title;

          // Only reload content if the ID actually changed
          if (oldId !== newId) {
            note = { ...note, id: newId, title: updatedNote.title || note.title };
            await loadNote(note);
          } else {
            // ID didn't change, just update the title
            note = { ...note, title: updatedNote.title || note.title };
          }
        }
      } catch (loadError) {
        console.warn('Failed to reload note after external rename:', loadError);
      }
    }, 100);
  }
});
```

**How It Works:**

1. Watches `notesStore.noteRenameCounter` for rename events
2. Checks if the renamed note matches the currently open note
3. Updates `titleOverride` state to display the new title immediately
4. Only reloads content if the noteId changed (full rename with ID change)
5. For title-only changes (same noteId), just updates the title without content reload

**Key Design Decision:**

- Uses `titleOverride` state that can be updated independently from the parent `note` prop
- Uses `$derived` to compute `displayTitle = titleOverride ?? note.title`
- Allows title to update immediately without waiting for parent prop to change

### Triggering Updates from NoteEditor

When the user edits content in NoteEditor:

```typescript
async function saveNote(): Promise<void> {
  if (!noteData) return;

  try {
    error = null;
    const noteService = getChatService();
    await noteService.updateNote({ identifier: note.id, content: noteContent });
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to save note';
    console.error('Error saving note:', err);
    throw err;
  }
}
```

**Note:** NoteEditor does NOT call `notifyNoteUpdated()` after saving because:

- It's the source of the change, so it doesn't need to reload itself
- The sidebar will detect the change through its own `$effect`
- This prevents unnecessary reload cycles

When the user renames in NoteEditor:

```typescript
async function handleTitleChange(newTitle: string): Promise<void> {
  // ... rename logic ...

  if (result.success) {
    const oldId = note.id;
    const newId = result.new_id || note.id;

    // Update sidebar notes if this note is in the sidebar
    if (sidebarNotesStore.isInSidebar(oldId) && newId !== oldId) {
      await sidebarNotesStore.updateNoteId(oldId, newId);
      // Notify about the rename so sidebar can reload content
      notesStore.notifyNoteRenamed(oldId, newId);
    }

    // Update the title override
    titleOverride = newTitle;
  }
}
```

**How It Works:**

1. Renames the note in the database
2. If note is in sidebar AND noteId changed, updates sidebar's noteId reference
3. Calls `notifyNoteRenamed()` to trigger sidebar reload
4. Updates local `titleOverride` for immediate UI update

## SidebarNotes: Handling Updates from Main Editor

### Content Updates

**Location:** `src/renderer/src/components/SidebarNotes.svelte`

```typescript
// React to external note updates (e.g., from NoteEditor)
$effect(() => {
  const updateCounter = notesStore.noteUpdateCounter;
  const lastUpdatedNoteId = notesStore.lastUpdatedNoteId;

  // Skip initial load (when counter is 0)
  if (updateCounter > 0 && lastUpdatedNoteId) {
    const sidebarNote = sidebarNotesStore.notes.find(
      (n) => n.noteId === lastUpdatedNoteId
    );
    if (sidebarNote) {
      // Clear any pending debounce timer for this note to prevent stale edits
      const existingTimer = contentDebounceTimers.get(lastUpdatedNoteId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        contentDebounceTimers.delete(lastUpdatedNoteId);
      }

      // Mark this note as being updated externally
      notesBeingUpdatedExternally.add(lastUpdatedNoteId);

      // Reload the note content from the database
      setTimeout(async () => {
        try {
          const noteService = getChatService();
          const updatedNote = await noteService.getNote({
            identifier: lastUpdatedNoteId
          });
          if (updatedNote) {
            // Update both title and content to stay in sync
            // Pass syncToDatabase=false to prevent infinite loop
            await sidebarNotesStore.updateNote(
              lastUpdatedNoteId,
              {
                title: updatedNote.title || sidebarNote.title,
                content: updatedNote.content || ''
              },
              false // Don't sync back to database - we're already in sync
            );
          }
        } catch (error) {
          console.warn('Failed to reload sidebar note after external update:', error);
        } finally {
          // Clear the external update flag after a short delay
          // to allow the CodeMirror update to settle
          setTimeout(() => {
            notesBeingUpdatedExternally.delete(lastUpdatedNoteId);
          }, 150);
        }
      }, 100);
    }
  }
});
```

**How It Works:**

1. Watches `notesStore.noteUpdateCounter` for changes
2. Checks if the updated note is in the sidebar
3. **Clears any pending debounce timer** to prevent stale edits from overwriting fresh content
4. **Marks note as externally updating** to prevent CodeMirror onChange from triggering
5. Reloads from database with `syncToDatabase: false`
6. **Clears external update flag after 150ms** to allow CodeMirror to settle

**Critical Race Condition Prevention:**

The sidebar uses three safeguards to prevent edit conflicts:

1. **Debounce Timer Cleanup:**

   ```typescript
   const existingTimer = contentDebounceTimers.get(lastUpdatedNoteId);
   if (existingTimer) {
     clearTimeout(existingTimer);
     contentDebounceTimers.delete(lastUpdatedNoteId);
   }
   ```

   - Prevents old timers from firing after reload
   - Without this: old timer fires → saves stale content → overwrites fresh edits

2. **External Update Flag:**

   ```typescript
   const notesBeingUpdatedExternally = new Set<string>();
   notesBeingUpdatedExternally.add(lastUpdatedNoteId);
   ```

   - Tracks which notes are currently being updated from external sources
   - Used by `handleContentChange` to ignore spurious onChange events

3. **Ignore CodeMirror onChange During External Updates:**

   ```typescript
   function handleContentChange(noteId: string, content: string): void {
     // Ignore changes if this note is being updated from an external source
     if (notesBeingUpdatedExternally.has(noteId)) {
       return;
     }
     // ... normal debounce logic
   }
   ```

   - CodeMirror fires onChange when content prop changes externally
   - Without this check: external reload → onChange → debounce → save → triggers another update (loop!)

### Title Updates (Renames)

```typescript
// React to external note renames (e.g., from NoteEditor)
$effect(() => {
  const renameCounter = notesStore.noteRenameCounter;
  const oldId = notesStore.lastRenamedNoteOldId;
  const newId = notesStore.lastRenamedNoteNewId;

  // Skip initial load (when counter is 0)
  if (renameCounter > 0 && oldId && newId) {
    const sidebarNote = sidebarNotesStore.notes.find((n) => n.noteId === oldId);
    if (sidebarNote) {
      setTimeout(async () => {
        try {
          const noteService = getChatService();
          const updatedNote = await noteService.getNote({ identifier: newId });
          if (updatedNote) {
            await sidebarNotesStore.updateNote(
              newId, // Use new ID
              {
                title: updatedNote.title || sidebarNote.title,
                content: updatedNote.content || ''
              },
              false // Don't sync back to database - we're already in sync
            );
          }
        } catch (error) {
          console.warn('Failed to reload sidebar note after external rename:', error);
        }
      }, 100);
    }
  }
});
```

**How It Works:**

1. Watches `notesStore.noteRenameCounter` for rename events
2. Checks if the renamed note is in the sidebar
3. Reloads from database using the NEW noteId
4. Updates both title and content with `syncToDatabase: false`

**Note:** The `sidebarNotesStore.updateNoteId()` is called by NoteEditor BEFORE the notification, so the sidebar already has the correct noteId when this effect runs.

### Triggering Updates from SidebarNotes

When the user edits content in the sidebar:

```typescript
function handleContentChange(noteId: string, content: string): void {
  // Ignore changes if this note is being updated from an external source
  if (notesBeingUpdatedExternally.has(noteId)) {
    return;
  }

  // Clear existing timer for this note
  const existingTimer = contentDebounceTimers.get(noteId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new timer - update after 500ms of no typing
  const timer = setTimeout(() => {
    sidebarNotesStore.updateNote(noteId, { content });
    contentDebounceTimers.delete(noteId);
  }, 500);

  contentDebounceTimers.set(noteId, timer);
}
```

**How It Works:**

1. Checks if note is being updated externally → ignores if true
2. Clears any existing debounce timer
3. Sets new 500ms timer
4. Timer fires → calls `sidebarNotesStore.updateNote()`

When the user renames in the sidebar:

```typescript
function handleTitleBlur(noteId: string, newTitle: string): void {
  const originalTitle = originalTitles.get(noteId);
  if (originalTitle !== undefined && newTitle !== originalTitle) {
    sidebarNotesStore.updateNote(noteId, { title: newTitle });
  }
  originalTitles.delete(noteId);
}
```

**How It Works:**

1. Only saves if title actually changed
2. Calls `sidebarNotesStore.updateNote()` with new title
3. Store handles database sync and notifications

## sidebarNotesStore: Database Sync and Notifications

**Location:** `src/renderer/src/stores/sidebarNotesStore.svelte.ts`

### Update Logic

```typescript
async updateNote(
  noteId: string,
  updates: Partial<Pick<SidebarNote, 'title' | 'content'>>,
  syncToDatabase: boolean = true
): Promise<void> {
  await this.ensureInitialized();

  const note = this.state.notes.find((n) => n.noteId === noteId);
  if (note) {
    const oldTitle = note.title;

    // Update the sidebar note copy
    if (updates.title !== undefined) {
      note.title = updates.title;
    }
    if (updates.content !== undefined) {
      note.content = updates.content;
    }

    await this.saveToStorage();

    // Only sync to database if requested (prevents infinite loops)
    if (!syncToDatabase) {
      return;
    }

    // Sync title changes back to the actual note (rename)
    if (updates.title !== undefined && updates.title !== oldTitle) {
      try {
        const result = await window.api?.renameNote({
          identifier: noteId,
          newIdentifier: updates.title
        });

        if (result?.new_id && result.new_id !== noteId) {
          note.noteId = result.new_id;
          await this.saveToStorage();
          notesStore.notifyNoteRenamed(noteId, result.new_id);
        } else {
          // Title changed but noteId stayed the same - still notify as rename
          // so NoteEditor can update the displayed title
          notesStore.notifyNoteRenamed(noteId, noteId);
        }
      } catch (error) {
        console.error('Failed to rename note in database:', error);
        note.title = oldTitle;
        await this.saveToStorage();
      }
    }

    // Sync content changes back to the actual note
    if (updates.content !== undefined) {
      try {
        await window.api?.updateNote({
          identifier: note.noteId,
          content: updates.content
        });
        notesStore.notifyNoteUpdated(note.noteId);
      } catch (error) {
        console.error('Failed to update note content in database:', error);
      }
    }
  }
}
```

**Key Features:**

1. **syncToDatabase Parameter:**
   - Default: `true` - saves to database and sends notifications
   - When `false` - only updates local sidebar state (used during external reloads)
   - Prevents infinite loops when reloading from database

2. **Title Change Handling:**
   - Calls `renameNote()` API
   - Updates noteId if rename returns new ID
   - **Always calls `notifyNoteRenamed()`** even if noteId didn't change
   - This ensures NoteEditor receives title updates for all renames

3. **Content Change Handling:**
   - Calls `updateNote()` API
   - Calls `notifyNoteUpdated()` to trigger NoteEditor reload

4. **Error Handling:**
   - Reverts title on rename failure
   - Preserves content in sidebar even if database save fails

## notesStore: Notification Hub

**Location:** `src/renderer/src/services/noteStore.svelte.ts`

### Notification Methods

```typescript
function notifyNoteUpdated(noteId: string): void {
  state.noteUpdateCounter++;
  state.lastUpdatedNoteId = noteId;
}

function notifyNoteRenamed(oldId: string, newId: string): void {
  state.noteRenameCounter++;
  state.lastRenamedNoteOldId = oldId;
  state.lastRenamedNoteNewId = newId;
}
```

**How It Works:**

1. Increment counter (triggers all watchers)
2. Store specific note identifiers
3. Watchers check if the notification applies to them

**Key Design Decision:**

- Separate counters for updates vs renames
- Allows components to react differently to each type of change
- NoteEditor can optimize by only reloading content on actual content updates

## Important Design Decisions

### 1. Separate Update and Rename Notifications

**Rationale:**

- Renames may or may not change the noteId
- Title-only changes need different handling than full noteId changes
- Allows NoteEditor to optimize: don't reload content for title-only changes

**Implementation:**

- `notifyNoteUpdated(noteId)` - for content changes
- `notifyNoteRenamed(oldId, newId)` - for title changes (even if oldId === newId)

### 2. syncToDatabase Parameter

**Rationale:**

- Prevents infinite notification loops
- When reloading from external update, we're already in sync with database
- Sending the content back to database would trigger another notification

**Flow Prevention:**

```
External edit → notification → reload from DB → DON'T save back → no new notification ✅
```

**Without This:**

```
External edit → notification → reload from DB → save to DB → new notification → loop! ❌
```

### 3. External Update Flag with Timing Window

**Rationale:**

- CodeMirror fires onChange when content prop changes
- Can't distinguish between "user typed" vs "prop changed externally"
- Need to ignore onChange events triggered by external reloads

**Implementation:**

- Add noteId to `notesBeingUpdatedExternally` Set before updating
- Check this Set in `handleContentChange` → return early if marked
- Clear flag after 150ms (enough for CodeMirror to process prop change)

**Timing Considerations:**

- Too short (< 50ms): CodeMirror onChange might fire after flag is cleared
- Too long (> 500ms): Real user edits during window would be ignored
- 150ms: Sweet spot that allows CodeMirror to settle without blocking user input

### 4. Debounce Timer Cleanup

**Rationale:**

- User might edit in sidebar, then switch to main editor before 500ms
- Old timer would fire and overwrite the new edits
- Must cancel pending timers when external update detected

**Example Scenario Prevented:**

```
T+0ms: User types in sidebar
T+200ms: User switches to main editor and makes different edit
T+300ms: Main editor saves to DB
T+400ms: Sidebar reloads from DB (gets new content)
T+500ms: OLD sidebar timer fires → saves stale content → overwrites new edit ❌
```

**With Timer Cleanup:**

```
T+0ms: User types in sidebar
T+200ms: User switches to main editor and makes different edit
T+300ms: Main editor saves to DB
T+400ms: Sidebar reloads from DB → CLEARS old timer → no stale save ✅
```

### 5. Database as Single Source of Truth

**Rationale:**

- Both components reload from database when notified
- No complex state synchronization logic needed
- Database ensures consistency

**Trade-offs:**

- Requires async reloads (100ms delay)
- Small lag before changes appear in other location
- But: simpler, more reliable, prevents sync bugs

## Edge Cases and Known Limitations

### 1. Rapid Switching Between Editors

**Scenario:** User rapidly switches between main editor and sidebar, making edits in both.

**Behavior:**

- 500ms debounce in sidebar means rapid edits may not all save
- Last edit in each location wins
- Database state is eventual consistent (after all debounce timers fire)

**Mitigation:**

- User must wait 500ms for sidebar edit to save before switching
- Could add "saving..." indicator in sidebar (future enhancement)

### 2. Concurrent Edits

**Scenario:** User edits same note in main editor AND sidebar simultaneously.

**Behavior:**

- Last save wins (no conflict resolution)
- Content from one editor will overwrite the other
- User sees whichever save happened last

**Mitigation:**

- UX discourages this (user typically focuses on one location)
- Could add visual indicator showing note is open elsewhere (future enhancement)

### 3. Very Large Notes

**Scenario:** Note has >100KB of content.

**Behavior:**

- Reload from database may be slow (>100ms)
- User might see flash of old content before reload completes
- CodeMirror needs time to render large document

**Mitigation:**

- 100ms delay before reload helps database catch up
- CodeMirror is generally performant even with large docs
- Consider lazy loading for very large notes (future enhancement)

### 4. Network/Disk Latency

**Scenario:** Slow disk or database access (>500ms).

**Behavior:**

- Reload might not complete before user makes another edit
- Could see stale content briefly
- Race conditions if database is very slow

**Mitigation:**

- SQLite is typically fast (<50ms for reads)
- 100ms delay buffer provides safety margin
- Error handling reverts to previous state on failure

## Testing Scenarios

### Manual Test Cases

1. **Basic Bidirectional Sync:**
   - ✓ Edit content in main editor → see update in sidebar
   - ✓ Edit content in sidebar → see update in main editor
   - ✓ Rename in main editor → see new title in sidebar
   - ✓ Rename in sidebar → see new title in main editor

2. **Race Condition Prevention:**
   - ✓ Edit in sidebar, immediately edit in main editor → main editor edit wins
   - ✓ Edit in main editor, immediately edit in sidebar → sidebar edit wins after debounce
   - ✓ Rapid edits in main editor → all saves complete, sidebar sees final state

3. **Edge Cases:**
   - ✓ Close and reopen sidebar → content still in sync
   - ✓ Multiple notes in sidebar → only edited one updates
   - ✓ Rename note with ID change → both editors update to new ID
   - ✓ Rename note without ID change → only title updates, no content reload

4. **External Update Handling:**
   - ✓ Edit in main editor while sidebar is collapsed → sidebar syncs when expanded
   - ✓ Edit in sidebar while main editor is closed → main editor syncs when opened
   - ✓ Agent makes edit → both editors reload from database

## Future Enhancements

### 1. Operational Transform (OT) or CRDT

**Problem:** Last-write-wins can lose edits in concurrent editing scenarios.

**Solution:**

- Implement OT or CRDT for true collaborative editing
- Track character-level changes instead of full document overwrites
- Merge concurrent edits intelligently

**Complexity:** High - requires significant architectural changes

### 2. Optimistic UI Updates

**Problem:** 100ms delay before seeing changes in other location feels slow.

**Solution:**

- Update UI immediately (optimistically)
- Confirm from database in background
- Rollback on conflict or error

**Trade-off:** More complex state management, potential UI flicker on rollback

### 3. Visual Indicators

**Problem:** User doesn't know if edits are saved or if note is open elsewhere.

**Solutions:**

- "Saving..." spinner in sidebar
- "Modified in main editor" badge in sidebar notes
- Last saved timestamp

**Benefits:** Better UX, prevents user confusion about sync state

### 4. Differential Updates

**Problem:** Reloading entire note is wasteful for small edits.

**Solution:**

- Send only changed portions over IPC
- Apply patches instead of full replacement
- Preserve CodeMirror state (selection, undo history)

**Benefits:** Better performance, smoother UX, preserves editor state

### 5. Conflict Resolution UI

**Problem:** Concurrent edits silently overwrite each other.

**Solution:**

- Detect conflicts (based on content hash or version)
- Show diff UI to user
- Let user choose which version to keep or merge manually

**Benefits:** No data loss, user control over conflicts

## Related Documentation

- [Sidebar Notes Feature](./SIDEBAR-NOTES.md) - Complete feature overview
- [Note Editor Architecture](./NOTE-EDITOR.md) - Main editor implementation
- [Core Concepts](./CORE-CONCEPTS.md) - Overall architecture patterns
