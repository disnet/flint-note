# Missing Event Publishing Analysis

## Overview

This analysis identifies locations in the codebase where note operations create or modify notes but do not publish events to the message bus, potentially causing issues similar to the recently fixed daily note creation bug.

## Background: The Daily Note Bug

The recently fixed bug occurred when clicking future date entries in daily view:

- Notes were created successfully
- But "Untitled" appeared in temporary tabs
- **Root cause**: `get-or-create-daily-note` IPC handler wasn't publishing `note.created` events
- This prevented noteCache from becoming aware of new notes
- temporaryTabs component failed title hydration when deriving titles from notesStore

**Fix location**: `src/main/index.ts:1599-1614`

## Event Sourcing Architecture

The application uses an event sourcing pattern where:

1. Main process operations publish events via `publishNoteEvent()` (`src/main/note-events.ts:24`)
2. Events are sent to renderer via IPC (`note-event` channel)
3. All stores (noteCache, notesStore, temporaryTabs, etc.) stay synchronized through message bus events
4. Stores should NOT manually refresh - they should react to events

## Critical Missing Events

### 1. **AI Tool Service - Note CRUD Operations** ⚠️ HIGH PRIORITY

**Location**: `src/main/tool-service.ts`

**Operations missing events**:

- `createNoteTool` (line 461-528): Creates notes via `flintApi.createNote()` but does NOT publish `note.created` event
- `updateNoteTool` (line 557-245): Updates notes via `flintApi.updateNote()` and `flintApi.renameNote()` but does NOT publish `note.updated` or `note.renamed` events
- `deleteNoteTool` (line 384-442): Deletes notes via `flintApi.deleteNote()` but does NOT publish `note.deleted` event

**Impact**:

- When AI creates/updates/deletes notes, the UI doesn't know about it
- NoteCache becomes stale
- Tabs showing AI-created notes may show "Untitled"
- Search results and sidebar listings may not include AI-created notes
- Similar symptoms to the daily note bug

**Recommended fix**:

```typescript
// In createNoteTool after line 505:
publishNoteEvent({
  type: 'note.created',
  note: {
    id: noteInfo.id,
    type: noteType,
    filename: note.filename,
    title: note.title,
    created: note.created,
    modified: note.updated,
    size: note.size || 0,
    tags: note.metadata.tags || [],
    path: note.path
  }
});

// In updateNoteTool after line 208 (for updates):
publishNoteEvent({
  type: 'note.updated',
  noteId: updates.identifier,
  updates: {
    modified: new Date().toISOString()
  }
});

// In updateNoteTool after line 189 (for renames):
if (renameResult.success && renameResult.new_id) {
  publishNoteEvent({
    type: 'note.renamed',
    oldId: id,
    newId: renameResult.new_id
  });
}

// In deleteNoteTool after line 414:
if (result.deleted) {
  publishNoteEvent({
    type: 'note.deleted',
    noteId: id
  });
}
```

### 2. **Hierarchy Operations** ⚠️ MEDIUM PRIORITY

**Location**: `src/server/api/flint-note-api.ts`

**Operations potentially missing events**:

- `addSubnote` (line 981-1038): Adds parent-child relationships
- `removeSubnote` (line 1043-1072): Removes parent-child relationships
- `reorderSubnotes` (line 1077-1106): Reorders children

**Current status**: These operations exist in the API but:

1. No IPC handlers found in `src/main/index.ts`
2. No corresponding methods in `src/preload/index.ts`
3. Appears to be server-side only functionality

**Impact**: If/when hierarchy operations are exposed to the UI:

- Changes to note hierarchies won't trigger UI updates
- Sidebar tree views may become stale
- Need `note.hierarchyChanged` or `note.updated` events

**Recommended action**: When implementing IPC handlers for hierarchy operations, ensure events are published:

```typescript
publishNoteEvent({
  type: 'note.updated',
  noteId: result.noteId,
  updates: {
    // Include relevant hierarchy metadata changes
  }
});
```

### 3. **Note Type Operations** ✓ LOW PRIORITY

**Location**: `src/main/tool-service.ts`

**Operations**:

- `createNoteTypeTool` (line 933-1009): Creates note types
- `updateNoteTypeTool` (line 1012-1074): Updates note types
- `deleteNoteTypeTool` (line 1077-1164): Deletes note types

**Current status**: These don't directly affect note listings/caching, but may warrant events for:

- Refreshing note type selectors in UI
- Updating note type metadata displays
- Triggering schema validation updates

**Impact**: Low - these are structural changes that don't affect individual notes directly

**Recommended action**: Consider adding dedicated event types if UI needs to react:

```typescript
type NoteEvent =
  // ... existing types
  | { type: 'noteType.created'; typeName: string }
  | { type: 'noteType.updated'; typeName: string }
  | { type: 'noteType.deleted'; typeName: string };
```

## Correctly Publishing Events

### ✅ Operations that DO publish events correctly:

1. **Direct IPC handlers in main/index.ts**:
   - `create-note` (lines 461-500): ✓ Publishes `note.created`
   - `update-note` (lines 522-564): ✓ Publishes `note.updated`
   - `delete-note` (lines 566-592): ✓ Publishes `note.deleted`
   - `rename-note` (lines 594-633): ✓ Publishes `note.renamed`
   - `move-note` (lines 635-675): ✓ Publishes `note.moved`
   - `get-or-create-daily-note` (lines 1573-1623): ✓ Publishes `note.created` (fixed recently)

## Server-Side Operations (No Event Publishing Needed)

The following operations run entirely on the server side and don't need to publish events to the renderer:

1. **Database rebuild** (`flint-note-api.ts:1527-1571`): Rebuilds entire database
2. **Link migration** (`flint-note-api.ts:919-974`): One-time link table population
3. **Template application** (`template-manager.ts`): Runs during vault initialization

These operations are followed by bulk refreshes or application restarts, so individual events aren't needed.

## Recommendations

### Immediate Actions (High Priority)

1. **Add event publishing to AI tool service** - This is the most critical fix
   - Import `publishNoteEvent` in `tool-service.ts`
   - Add event publishing after each create/update/delete/rename operation
   - Follow the same pattern as IPC handlers in `main/index.ts`

2. **Test AI note operations thoroughly**
   - Verify AI-created notes appear immediately in UI
   - Verify note titles are correct in tabs
   - Verify sidebar and search reflect AI changes

### Future Considerations

1. **Hierarchy operations**: When implementing UI for hierarchy management, add events
2. **Note type changes**: Consider if UI needs to react to note type CRUD operations
3. **Consistent event pattern**: Create a helper function to standardize event publishing:

```typescript
// Potential helper in note-events.ts
export async function publishNoteCreated(noteInfo: NoteInfo, note: Note): Promise<void> {
  publishNoteEvent({
    type: 'note.created',
    note: {
      id: noteInfo.id,
      type: noteInfo.type,
      filename: noteInfo.filename,
      title: noteInfo.title,
      created: noteInfo.created,
      modified: note.updated,
      size: note.size || 0,
      tags: note.metadata.tags || [],
      path: noteInfo.path
    }
  });
}
```

## Testing Checklist

After adding event publishing to tool service:

- [ ] AI creates note → appears immediately in sidebar
- [ ] AI creates note → tab shows correct title (not "Untitled")
- [ ] AI updates note → changes reflected in open tabs
- [ ] AI renames note → tab title updates
- [ ] AI deletes note → removed from sidebar and tabs close
- [ ] Search includes AI-created notes immediately
- [ ] Daily view shows AI-created notes without refresh

## Related Files

- `src/main/note-events.ts` - Event type definitions and publishing
- `src/main/index.ts` - IPC handlers (reference implementation for event publishing)
- `src/main/tool-service.ts` - AI tool implementations (needs fixes)
- `src/renderer/src/services/noteCache.svelte.ts` - Subscribes to events
- `src/renderer/src/services/noteStore.svelte.ts` - Message bus implementation
