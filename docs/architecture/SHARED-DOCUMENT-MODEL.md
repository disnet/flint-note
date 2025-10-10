# Shared Document Model Architecture

## Overview

The shared document model provides bidirectional synchronization between multiple editor components (NoteEditor and SidebarNotes) when the same note is open in multiple locations. Instead of using event-driven notifications and database reloads, components share a single reactive `NoteDocument` instance that automatically syncs changes through Svelte's reactivity system.

## Architecture

### Components

1. **NoteDocument** - Shared reactive document instance for a single note
2. **NoteDocumentRegistry** - Manages document lifecycle (loading, sharing, cleanup)
3. **NoteEditor** - Main note editing view
4. **SidebarNotes** - Collapsible note editors in sidebar

### Key Improvement Over Previous System

**Before (Event-Driven with DB Reload):**

- Each component maintained its own copy of note content
- Changes triggered notifications through notesStore
- Components reloaded entire note from database on notifications
- Required complex race condition handling (debounce cleanup, external update flags, timing windows)
- Had infinite loop prevention with `syncToDatabase` parameter
- Last-write-wins with no conflict detection

**After (Shared Document Model):**

- Single `NoteDocument` instance per note, shared across components
- Changes update shared state directly - Svelte reactivity handles sync
- No notifications or database reloads needed for sync
- No race conditions - only one copy of data
- Automatic bidirectional sync through reactive bindings
- Simpler, more reliable, fewer edge cases

## NoteDocument Class

**Location:** `src/renderer/src/stores/noteDocumentRegistry.svelte.ts`

### Core State

```typescript
class NoteDocument {
  noteId = $state('');
  content = $state('');
  title = $state('');

  // Track which editor components are viewing/editing
  activeEditors = $state<Set<string>>(new Set());

  // Single autosave instance for this document
  private autoSave: AutoSave;

  isLoading = $state(false);
  error = $state<string | null>(null);
}
```

### Key Methods

#### `updateContent(newContent: string)`

Updates content and marks as changed for autosave. All editors bound to this document automatically see the update.

```typescript
updateContent(newContent: string): void {
  if (this.content !== newContent) {
    this.content = newContent;
    this.autoSave.markChanged(); // Debounced save to DB
  }
}
```

#### `updateTitle(newTitle: string)`

Updates title and saves immediately (not debounced). Handles note ID changes from renames.

```typescript
async updateTitle(newTitle: string): Promise<{
  success: boolean;
  newId?: string;
  linksUpdated?: number;
}> {
  if (this.title === newTitle) {
    return { success: true };
  }

  const oldId = this.noteId;
  const result = await noteService.renameNote({
    identifier: this.noteId,
    newIdentifier: newTitle
  });

  if (result.success) {
    this.title = newTitle;
    if (result.new_id && result.new_id !== oldId) {
      this.noteId = result.new_id;
    }
    return { success: true, newId: result.new_id, linksUpdated: result.linksUpdated };
  }

  return { success: false };
}
```

#### `reload()`

Reloads document from database. Used after external changes (e.g., AI agent edits).

```typescript
async reload(): Promise<void> {
  this.isLoading = true;
  try {
    const note = await noteService.getNote({ identifier: this.noteId });
    if (note) {
      this.content = note.content || '';
      this.title = note.title || '';
      this.autoSave.clearChanges();
    }
  } finally {
    this.isLoading = false;
  }
}
```

### Editor Registration

Each editor registers when opening a document and unregisters when closing:

```typescript
registerEditor(editorId: string): void {
  this.activeEditors.add(editorId);
}

unregisterEditor(editorId: string): void {
  this.activeEditors.delete(editorId);
}

get isOpenInMultipleEditors(): boolean {
  return this.activeEditors.size > 1;
}
```

## NoteDocumentRegistry Class

Manages the lifecycle of note documents - ensures only one `NoteDocument` instance exists per noteId.

### Core State

```typescript
class NoteDocumentRegistryClass {
  private documents = $state(new Map<string, NoteDocument>());
}
```

### Key Methods

#### `open(noteId: string, editorId: string): Promise<NoteDocument>`

Opens a note for editing. Returns existing instance if already open, otherwise creates and loads new instance.

```typescript
async open(noteId: string, editorId: string): Promise<NoteDocument> {
  // Return existing document if already open
  if (this.documents.has(noteId)) {
    const doc = this.documents.get(noteId)!;
    doc.registerEditor(editorId);
    return doc;
  }

  // Create new document and load from database
  const doc = new NoteDocument(noteId);
  doc.registerEditor(editorId);
  this.documents.set(noteId, doc);

  const note = await noteService.getNote({ identifier: noteId });
  if (note) {
    doc.content = note.content || '';
    doc.title = note.title || '';
  }

  return doc;
}
```

#### `close(noteId: string, editorId: string)`

Closes a note for a specific editor. Cleans up document if no more editors are using it.

```typescript
close(noteId: string, editorId: string): void {
  const doc = this.documents.get(noteId);
  if (!doc) return;

  doc.unregisterEditor(editorId);

  // Clean up if no editors are using this document
  if (doc.activeEditors.size === 0) {
    doc.destroy();
    this.documents.delete(noteId);
  }
}
```

#### `updateNoteId(oldId: string, newId: string)`

Updates registry mapping when a note is renamed and its ID changes.

```typescript
updateNoteId(oldId: string, newId: string): void {
  const doc = this.documents.get(oldId);
  if (doc) {
    doc.noteId = newId;
    this.documents.delete(oldId);
    this.documents.set(newId, doc);
  }
}
```

#### `reload(noteId: string)` and `reloadAll()`

Force reload document(s) from database (used after AI edits).

```typescript
async reload(noteId: string): Promise<void> {
  const doc = this.documents.get(noteId);
  if (doc) {
    await doc.reload();
  }
}

async reloadAll(): Promise<void> {
  const promises = Array.from(this.documents.values()).map(doc => doc.reload());
  await Promise.all(promises);
}
```

## Component Integration

### NoteEditor

**Location:** `src/renderer/src/components/NoteEditor.svelte`

#### Opening a Document

```typescript
const editorId = 'main';
let doc = $state<NoteDocument | null>(null);

$effect(() => {
  (async () => {
    // Close previous document if switching notes
    if (previousNote && previousNote.id !== note.id && doc) {
      noteDocumentRegistry.close(previousNote.id, editorId);
    }

    // Open the shared document for this note
    doc = await noteDocumentRegistry.open(note.id, editorId);

    previousNote = note;
  })();
});

// Cleanup on unmount
$effect(() => {
  return () => {
    if (note?.id) {
      noteDocumentRegistry.close(note.id, editorId);
    }
  };
});
```

#### Handling Content Changes

```typescript
function handleContentChange(content: string): void {
  if (!doc) return;
  // Update shared document - this automatically syncs to other editors
  doc.updateContent(content);
}
```

#### Handling Title Changes

```typescript
async function handleTitleChange(newTitle: string): Promise<void> {
  if (!doc) return;

  const oldId = note.id;
  const result = await doc.updateTitle(newTitle);

  if (result.success) {
    const newId = result.newId || note.id;

    // Update other stores that reference this note
    if (newId !== oldId) {
      await pinnedNotesStore.updateNoteId(oldId, newId);
      await temporaryTabsStore.updateNoteId(oldId, newId);
      await sidebarNotesStore.updateNoteId(oldId, newId);
      noteDocumentRegistry.updateNoteId(oldId, newId);
    }

    // Update local note reference
    note = { ...note, id: newId, title: newTitle };

    await notesStore.refresh();
  }
}
```

#### Template Binding

```svelte
{#if doc}
  <div class="note-editor">
    <EditorHeader
      title={doc.title}
      onTitleChange={handleTitleChange}
      disabled={doc.isSaving}
    />


    <CodeMirrorEditor content={doc.content} onContentChange={handleContentChange} />
  </div>
{/if}
```

### SidebarNotes

**Location:** `src/renderer/src/components/SidebarNotes.svelte`

#### Managing Multiple Documents

```typescript
let sidebarDocs = $state<Map<string, NoteDocument>>(new Map());

// Open documents for all sidebar notes
$effect(() => {
  (async () => {
    const notes = sidebarNotesStore.notes;
    const newDocs = new Map<string, NoteDocument>();

    // Open documents for all current sidebar notes
    for (const note of notes) {
      const editorId = `sidebar-${note.noteId}`;
      const doc = await noteDocumentRegistry.open(note.noteId, editorId);
      newDocs.set(note.noteId, doc);
    }

    // Close documents no longer in sidebar
    for (const [noteId] of sidebarDocs) {
      if (!newDocs.has(noteId)) {
        const editorId = `sidebar-${noteId}`;
        noteDocumentRegistry.close(noteId, editorId);
      }
    }

    sidebarDocs = newDocs;
  })();
});
```

#### Template Binding

```svelte
{#each sidebarNotesStore.notes as note (note.noteId)}
  {@const doc = sidebarDocs.get(note.noteId)}
  {#if doc}
    <div class="sidebar-note">
      <input
        value={doc.title || ''}
        onblur={(e) => handleTitleBlur(note.noteId, e.currentTarget.value)}
      />


      <CodeMirrorEditor
        content={doc.content}
        onContentChange={(content) => handleContentChange(note.noteId, content)}
      />
    </div>
  {/if}
{/each}
```

## AI Agent Integration

When AI agents modify notes, the system reloads affected documents:

**Location:** `src/renderer/src/services/electronChatService.ts`

```typescript
private async handleNoteModifyingTool(toolCall: {
  name: string;
  arguments?: unknown;
}): Promise<void> {
  const noteModifyingTools = ['update_note', 'create_note', 'delete_note'];

  if (noteModifyingTools.includes(toolCall.name)) {
    const args = /* parse arguments */;
    const noteId = /* extract note ID */;

    // Reload the affected note document if it's currently open
    if (noteId && noteDocumentRegistry.isOpen(noteId)) {
      await noteDocumentRegistry.reload(noteId);
    }
  }
}
```

## Benefits Over Previous System

### 1. Simplicity

**Before:**

- Multiple $effects watching notification counters
- Complex debounce timer cleanup
- External update flags with timing windows
- `syncToDatabase` parameter to prevent loops

**After:**

- Single document instance
- Direct reactive bindings
- Svelte handles reactivity automatically
- No coordination logic needed

### 2. Performance

**Before:**

- 100ms delay + full database reload on every change
- Multiple round-trips to database
- Lag before changes appear in other editors

**After:**

- Instant updates through Svelte reactivity
- Only one database save (debounced)
- No perceptible delay

### 3. Reliability

**Before:**

- Race conditions (stale timers, onChange loops)
- Edge cases around rapid switching
- Potential for infinite notification loops

**After:**

- No race conditions - single source of truth
- No edge cases from coordination
- No loops - no notifications

### 4. User Experience

**Before:**

- Small lag when editing in one location and viewing in another
- No indication note is open elsewhere
- Confusing behavior with rapid edits

**After:**

- Instant sync between editors
- Visual indicators when note is open in multiple places
- Predictable behavior

## Visual Indicators

Both components show when a note is open in multiple editors:

**NoteEditor:**



**SidebarNotes:**



## Edge Cases

### 1. Rapid Note Switching

**Scenario:** User quickly switches between notes.

**Behavior:**

- Old documents are closed immediately
- New documents load from database
- No stale state carried over

**No special handling needed** - lifecycle management is automatic.

### 2. Concurrent Edits

**Scenario:** User types in both main editor and sidebar simultaneously.

**Behavior:**

- Last character typed wins
- Both editors show the same content in real-time
- Single autosave debounce prevents multiple DB writes

**Trade-off:** Still last-write-wins, but immediate visual feedback prevents confusion.

### 3. Very Large Notes

**Scenario:** Note with >100KB content.

**Behavior:**

- Initial load may take time
- Updates are instant (no reload)
- CodeMirror handles large docs well

**No degradation** - actually better than before (no repeated reloads).

### 4. AI Agent Edits

**Scenario:** AI modifies a note that's currently open.

**Behavior:**

- Agent makes edit through tool call
- `handleNoteModifyingTool` triggers reload
- All open editors receive fresh content
- User sees update immediately

**Clean separation:** Human edits sync through reactivity, AI edits trigger reload.

## Migrat from Previous System

The refactoring removed:

1. **notesStore notification methods:**
   - `notifyNoteUpdated(noteId)` ✗
   - `notifyNoteRenamed(oldId, newId)` ✗
   - `noteUpdateCounter` ✗
   - `lastUpdatedNoteId` ✗
   - `noteRenameCounter` ✗
   - `lastRenamedNoteOldId` ✗
   - `lastRenamedNoteNewId` ✗

2. **sidebarNotesStore complexity:**
   - `syncToDatabase` parameter ✗
   - Database sync logic in `updateNote()` ✗
   - Notification calls ✗

3. **Component $effects:**
   - Watching `noteUpdateCounter` ✗
   - Watching `noteRenameCounter` ✗
   - Database reloads on notifications ✗
   - Debounce timer cleanup ✗
   - External update flags ✗

4. **All related complexity:**
   - ~150 lines removed from NoteEditor
   - ~130 lines removed from SidebarNotes
   - ~70 lines removed from sidebarNotesStore
   - ~50 lines removed from notesStore

## Future Enhancements

### 1. Conflict Detection

Add version tracking to detect concurrent edits:

```typescript
class NoteDocument {
  version = $state(0);

  updateContent(newContent: string): void {
    if (this.content !== newContent) {
      this.version++;
      this.content = newContent;
      this.autoSave.markChanged();
    }
  }
}
```

### 2. Operational Transform

For true collaborative editing:

- Track character-level changes
- Transform operations based on document state
- Merge concurrent edits intelligently

### 3. Cursor Sharing

Show where other editors have their cursor:

```typescript
class NoteDocument {
  editorCursors = $state<Map<string, number>>(new Map());

  updateCursor(editorId: string, position: number): void {
    this.editorCursors.set(editorId, position);
  }
}
```

### 4. Diff Visualization

When reloading after AI edits, show what changed:

```typescript
async reload(): Promise<void> {
  const oldContent = this.content;
  // ... load new content ...
  if (oldContent !== this.content) {
    this.showDiff(oldContent, this.content);
  }
}
```

## Related Documentation

- [Note Editor Architecture](./NOTE-EDITOR.md)
- [Sidebar Notes Feature](./SIDEBAR-NOTES.md)
- [Core Concepts](./CORE-CONCEPTS.md)
- [Previous System (for reference)](./BIDIRECTIONAL-NOTE-SYNC.md)
