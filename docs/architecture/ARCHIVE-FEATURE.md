# Archive Feature Implementation

## Overview

This document describes the implementation of a proper note archiving system that allows users to archive notes while preserving wikilinks and note relationships. Archived notes are hidden from normal workflows (search, autocomplete) but remain accessible via wikilinks and a dedicated archived notes view.

## Goals

1. **Soft Archive**: Mark notes as archived without deleting them
2. **Preserve Links**: Wikilinks to archived notes continue to work
3. **Hide from Workflows**: Archived notes excluded from search, autocomplete, and normal note lists
4. **Read-Only Access**: Archived notes are read-only with an unarchive option
5. **Visual Distinction**: Clear visual indicators for archived note links
6. **Type Preservation**: Archived notes retain their original note type

## Database Schema Changes

### Notes Table

Add `archived` column to the notes table:

```sql
ALTER TABLE notes ADD COLUMN archived INTEGER DEFAULT 0;
CREATE INDEX idx_notes_archived ON notes(archived);
CREATE INDEX idx_notes_type_archived ON notes(type, archived);
```

**Location**: `src/server/database/schema.ts`

**Migration**: Add to `src/server/database/migration-manager.ts`

```typescript
// Migration version: increment schema version
{
  version: 'X.X.X',
  description: 'Add archived column to notes table',
  up: async (db: Database) => {
    db.exec(`
      ALTER TABLE notes ADD COLUMN archived INTEGER DEFAULT 0;
      CREATE INDEX idx_notes_archived ON notes(archived);
      CREATE INDEX idx_notes_type_archived ON notes(type, archived);
    `);
  }
}
```

### Query Updates

All queries that list notes need to filter by `archived`:

```sql
-- Default: exclude archived
SELECT * FROM notes WHERE archived = 0;

-- Include archived when needed
SELECT * FROM notes WHERE archived = 1; -- only archived
SELECT * FROM notes; -- all notes (for specific use cases)
```

## API Changes

### Core API Methods

**File**: `src/server/core/notes.ts`

#### 1. `archiveNote(identifier: string): Promise<ArchiveNoteResult>`

```typescript
async archiveNote(identifier: string): Promise<ArchiveNoteResult> {
  try {
    const { notePath, noteId } = await this.parseNoteIdentifier(identifier);

    // Read current note content
    const note = await this.getNote(identifier);

    // Update frontmatter to add archived: true
    const updatedContent = this.addArchivedToFrontmatter(note.content);

    // Write updated content
    await fs.writeFile(notePath, updatedContent, 'utf-8');

    // Update database
    await this.#db.run(
      'UPDATE notes SET archived = 1, updated = ? WHERE id = ?',
      [new Date().toISOString(), noteId]
    );

    // Update search index status (mark as archived)
    await this.updateSearchIndexArchivedStatus(noteId, true);

    return {
      id: noteId,
      archived: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to archive note: ${error.message}`);
  }
}
```

#### 2. `unarchiveNote(identifier: string): Promise<ArchiveNoteResult>`

```typescript
async unarchiveNote(identifier: string): Promise<ArchiveNoteResult> {
  try {
    const { notePath, noteId } = await this.parseNoteIdentifier(identifier);

    // Read current note content
    const note = await this.getNote(identifier);

    // Update frontmatter to remove/set archived: false
    const updatedContent = this.removeArchivedFromFrontmatter(note.content);

    // Write updated content
    await fs.writeFile(notePath, updatedContent, 'utf-8');

    // Update database
    await this.#db.run(
      'UPDATE notes SET archived = 0, updated = ? WHERE id = ?',
      [new Date().toISOString(), noteId]
    );

    // Update search index status (mark as active)
    await this.updateSearchIndexArchivedStatus(noteId, false);

    return {
      id: noteId,
      archived: false,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to unarchive note: ${error.message}`);
  }
}
```

#### 3. Helper Methods

```typescript
private addArchivedToFrontmatter(content: string): string {
  // Parse frontmatter and add archived: true
  // Handle cases with/without existing frontmatter
}

private removeArchivedFromFrontmatter(content: string): string {
  // Parse frontmatter and remove archived field or set to false
}

private async updateSearchIndexArchivedStatus(
  noteId: string,
  archived: boolean
): Promise<void> {
  // Update search index to mark note as archived/active
}
```

### API Type Definitions

**File**: `src/server/types/index.ts`

```typescript
export interface ArchiveNoteResult {
  id: string;
  archived: boolean;
  timestamp: string;
}

export interface Note {
  // ... existing fields
  archived?: boolean; // Add to existing Note interface
}
```

### IPC Handlers

**File**: `src/main/index.ts`

```typescript
ipcMain.handle(
  'archive-note',
  async (
    _event,
    params: {
      identifier: string;
      vaultId?: string;
    }
  ) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }

    const result = await noteService.archiveNote(params.identifier, params.vaultId);

    // Publish event
    publishNoteEvent({
      type: 'note.archived',
      noteId: params.identifier
    });

    return result;
  }
);

ipcMain.handle(
  'unarchive-note',
  async (
    _event,
    params: {
      identifier: string;
      vaultId?: string;
    }
  ) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }

    const result = await noteService.unarchiveNote(params.identifier, params.vaultId);

    // Publish event
    publishNoteEvent({
      type: 'note.unarchived',
      noteId: params.identifier
    });

    return result;
  }
);
```

**File**: `src/preload/index.ts`

```typescript
archiveNote: (params: { identifier: string; vaultId?: string }) =>
  electronAPI.ipcRenderer.invoke('archive-note', params),

unarchiveNote: (params: { identifier: string; vaultId?: string }) =>
  electronAPI.ipcRenderer.invoke('unarchive-note', params),
```

**File**: `src/main/note-service.ts`

```typescript
async archiveNote(identifier: string, vaultId: string): Promise<ArchiveNoteResult> {
  this.ensureInitialized();
  return await this.api.archiveNote({
    identifier,
    vaultId
  });
}

async unarchiveNote(identifier: string, vaultId: string): Promise<ArchiveNoteResult> {
  this.ensureInitialized();
  return await this.api.unarchiveNote({
    identifier,
    vaultId
  });
}
```

**File**: `src/server/api/flint-note-api.ts`

```typescript
async archiveNote(params: {
  identifier: string;
  vaultId: string;
}): Promise<ArchiveNoteResult> {
  const vault = this.vaultManager.getVault(params.vaultId);
  if (!vault) {
    throw new Error(`Vault not found: ${params.vaultId}`);
  }
  return await vault.notes.archiveNote(params.identifier);
}

async unarchiveNote(params: {
  identifier: string;
  vaultId: string;
}): Promise<ArchiveNoteResult> {
  const vault = this.vaultManager.getVault(params.vaultId);
  if (!vault) {
    throw new Error(`Vault not found: ${params.vaultId}`);
  }
  return await vault.notes.unarchiveNote(params.identifier);
}
```

## Search and Filtering

### Search Manager Updates

**File**: `src/server/database/search-manager.ts`

Update all search queries to exclude archived notes by default:

```typescript
async searchNotes(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const includeArchived = options?.includeArchived ?? false;
  const archivedFilter = includeArchived ? '' : 'AND archived = 0';

  const sql = `
    SELECT * FROM notes_fts
    WHERE notes_fts MATCH ?
    ${archivedFilter}
    ORDER BY rank
    LIMIT ?
  `;

  // ... rest of implementation
}
```

### Note Listing Updates

**File**: `src/server/core/notes.ts`

```typescript
async listNotes(options?: {
  type?: string;
  includeArchived?: boolean;
}): Promise<NoteMetadata[]> {
  const includeArchived = options?.includeArchived ?? false;
  const archivedFilter = includeArchived ? '' : 'WHERE archived = 0';
  const typeFilter = options?.type
    ? `${archivedFilter ? 'AND' : 'WHERE'} type = ?`
    : '';

  const sql = `
    SELECT * FROM notes
    ${archivedFilter}
    ${typeFilter}
    ORDER BY updated DESC
  `;

  // ... rest of implementation
}

async getArchivedNotes(): Promise<NoteMetadata[]> {
  const sql = `
    SELECT * FROM notes
    WHERE archived = 1
    ORDER BY updated DESC
  `;

  return this.#db.all(sql);
}
```

## Frontend Changes

### Service Layer

**File**: `src/renderer/src/services/electronChatService.ts`

```typescript
async archiveNote(params: {
  vaultId: string;
  identifier: string;
}): Promise<ArchiveNoteResult> {
  const { vaultId, identifier } = params;
  try {
    return await window.api.archiveNote({ vaultId, identifier });
  } catch (error) {
    console.error('Failed to archive note:', error);
    throw new Error('Failed to archive note. Please try again.');
  }
}

async unarchiveNote(params: {
  vaultId: string;
  identifier: string;
}): Promise<ArchiveNoteResult> {
  const { vaultId, identifier } = params;
  try {
    return await window.api.unarchiveNote({ vaultId, identifier });
  } catch (error) {
    console.error('Failed to unarchive note:', error);
    throw new Error('Failed to unarchive note. Please try again.');
  }
}
```

### Note Store Updates

**File**: `src/renderer/src/services/noteStore.svelte.ts`

Update the NoteMetadata type:

```typescript
export type NoteMetadata = {
  id: string;
  type: string;
  filename: string;
  title: string;
  created: string;
  modified: string;
  size: number;
  tags: string[];
  path: string;
  archived?: boolean; // Add this field
};
```

Filter archived notes from the main notes list:

```typescript
const notes = $derived.by(() => {
  const allNotes = noteCache.getAllNotes();
  // Filter out archived notes
  return allNotes.filter((note) => !note.archived);
});
```

Add method to get archived notes:

```typescript
async getArchivedNotes(): Promise<NoteMetadata[]> {
  const chatService = getChatService();
  if (await chatService.isReady()) {
    return await chatService.getArchivedNotes();
  }
  return [];
}
```

### Note Cache Updates

**File**: `src/renderer/src/services/noteCache.svelte.ts`

Handle archive/unarchive events:

```typescript
initialize() {
  // ... existing initialization

  // Listen for archive/unarchive events
  messageBus.subscribe('note.archived', ({ noteId }) => {
    const note = this.getNote(noteId);
    if (note) {
      note.archived = true;
      this.updateNote(note);
    }
  });

  messageBus.subscribe('note.unarchived', ({ noteId }) => {
    const note = this.getNote(noteId);
    if (note) {
      note.archived = false;
      this.updateNote(note);
    }
  });
}
```

### System Views - Archived Notes Type

**File**: `src/renderer/src/components/SystemViews.svelte` (or similar)

Add "Archived" as a pseudo note type:

```typescript
const systemNoteTypes = $derived.by(() => {
  const types = [...notesStore.noteTypes];

  // Add archived pseudo-type
  types.push({
    name: 'archived',
    count: archivedNotesCount,
    purpose: 'View all archived notes',
    icon: '📦'
  });

  return types;
});
```

Create a view component for archived notes:

**File**: `src/renderer/src/components/ArchivedNotesView.svelte`

```svelte
<script lang="ts">
  import { getChatService } from '../services/chatService';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  let archivedNotes = $state<NoteMetadata[]>([]);
  let loading = $state(true);

  async function loadArchivedNotes() {
    try {
      loading = true;
      const chatService = getChatService();
      archivedNotes = await chatService.getArchivedNotes();
    } catch (error) {
      console.error('Failed to load archived notes:', error);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadArchivedNotes();
  });
</script>

{#if loading}
  <div class="loading">Loading archived notes...</div>
{:else if archivedNotes.length === 0}
  <div class="empty">No archived notes</div>
{:else}
  <div class="archived-notes-list">
    {#each archivedNotes as note}
      <div class="archived-note-item">
        <span class="type-icon">{note.type}</span>
        <span class="archived-badge">📦 Archived</span>
        <span class="note-title">{note.title}</span>
      </div>
    {/each}
  </div>
{/if}
```

### Read-Only Editor for Archived Notes

**File**: `src/renderer/src/components/NoteEditor.svelte`

Add archived state and make editor read-only:

```typescript
// Detect if note is archived
const isArchived = $derived(noteData?.metadata?.archived === true);

// Disable editing when archived
<CodeMirrorEditor
  bind:this={editorRef}
  content={doc.content}
  onContentChange={handleContentChange}
  onCursorChange={handleCursorChange}
  onWikilinkClick={handleWikilinkClick}
  cursorPosition={pendingCursorPosition}
  placeholder="Write, type [[ to make links..."
  readOnly={isArchived}  // Add this prop
  {suggestions}
  {expandedSuggestions}
  onDismissSuggestion={dismissSuggestion}
/>
```

Add unarchive button to header:

```svelte
{#if isArchived}
  <div class="archived-banner">
    <span class="archived-icon">📦</span>
    <span>This note is archived</span>
    <button class="unarchive-btn" onclick={handleUnarchiveNote}> Unarchive Note </button>
  </div>
{/if}
```

Handler:

```typescript
async function handleUnarchiveNote(): Promise<void> {
  try {
    const noteService = getChatService();
    await noteService.unarchiveNote({
      identifier: note.id
    });

    // Reload note data to reflect unarchived status
    await loadNoteMetadata(note);
  } catch (err) {
    console.error('Error unarchiving note:', err);
  }
}
```

### CodeMirror Editor Updates

**File**: `src/renderer/src/components/CodeMirrorEditor.svelte`

Add `readOnly` prop:

```typescript
interface Props {
  // ... existing props
  readOnly?: boolean;
}

let {
  // ... existing props
  readOnly = false
}: Props = $props();

// Apply read-only state to CodeMirror
$effect(() => {
  if (view) {
    view.dispatch({
      effects: StateEffect.reconfigure.of([
        // ... other extensions
        EditorState.readOnly.of(readOnly)
      ])
    });
  }
});
```

## Wikilink Updates

### Wikilink Data Enhancement

**File**: `src/server/core/notes.ts`

When resolving wikilinks, include archived status:

```typescript
async resolveWikilink(target: string): Promise<WikiLinkResolution> {
  const note = await this.findNoteByIdentifier(target);

  if (note) {
    return {
      id: note.id,
      title: note.title,
      type: note.type,
      archived: note.archived ?? false, // Include archived status
      exists: true
    };
  }

  return {
    exists: false,
    target
  };
}
```

### Wikilink Popover Updates

**File**: `src/renderer/src/components/WikilinkPopover.svelte`

Show archived status in popover:

```svelte
<script lang="ts">
  interface Props {
    noteId: string;
    title: string;
    archived?: boolean;
    type?: string;
    // ... other props
  }

  let { noteId, title, archived = false, type }: Props = $props();
</script>

<div class="wikilink-popover" class:archived>
  {#if archived}
    <div class="archived-indicator">
      {#if type}<span class="type-icon">{getTypeIcon(type)}</span>{/if}
      <span class="archived-badge">📦 Archived</span>
    </div>
  {/if}
  <div class="note-title">{title}</div>
  <!-- ... rest of popover content -->
</div>

<style>
  .wikilink-popover.archived {
    border-left: 3px solid var(--warning-color, orange);
    background: var(--archived-bg, rgba(255, 165, 0, 0.1));
  }

  .archived-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }

  .archived-badge {
    color: var(--warning-color, orange);
    font-weight: 500;
  }
</style>
```

### Wikilink Autocomplete Updates

**File**: `src/renderer/src/components/WikilinkAutocomplete.svelte`

Exclude archived notes from autocomplete suggestions:

```typescript
const filteredNotes = $derived.by(() => {
  return notes
    .filter((note) => !note.archived) // Exclude archived notes
    .filter((note) => note.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10);
});
```

### Wikilink Styling in Editor

**File**: `src/renderer/src/lib/wikilinks.svelte.ts`

Add styling for links to archived notes:

```typescript
function getWikilinkDecoration(target: NoteResolution): Decoration {
  const className = target.archived
    ? 'cm-wikilink cm-wikilink-archived'
    : target.exists
      ? 'cm-wikilink cm-wikilink-exists'
      : 'cm-wikilink cm-wikilink-missing';

  return Decoration.mark({
    class: className,
    attributes: {
      'data-note-id': target.id,
      'data-archived': target.archived ? 'true' : 'false'
    }
  });
}
```

**File**: `src/renderer/src/lib/wikilink-theme.ts`

Add CSS for archived wikilinks:

```typescript
export const wikilinkTheme = EditorView.theme({
  // ... existing styles

  '.cm-wikilink-archived': {
    color: 'var(--warning-color, orange)',
    borderBottom: '1px dashed var(--warning-color, orange)',
    opacity: '0.7'
  }
});
```

## UI/UX Considerations

### Archive Confirmation Modal

Update the existing confirmation modal message:

```typescript
<ConfirmationModal
  isOpen={showArchiveConfirmation}
  title="Archive Note"
  message="Archive this note? It will be hidden from search and autocomplete but wikilinks will still work. You can unarchive it later from the Archived notes view."
  confirmText="Archive"
  cancelText="Cancel"
  confirmStyle="primary"  // Changed from "danger" since it's not destructive
  onConfirm={confirmArchiveNote}
  onCancel={cancelArchiveNote}
/>
```

### Visual Indicators

1. **Archived Badge**: Show 📦 icon with "Archived" text
2. **Type Icon Retention**: Keep original note type icon alongside archive indicator
3. **Color Coding**: Use orange/warning color for archived items
4. **Opacity/Styling**: Slightly faded appearance for archived wikilinks

### Navigation

1. **Archived Notes View**: Accessible from system views sidebar
2. **Breadcrumb**: Show archived status in note breadcrumb/header
3. **Search**: Add toggle to include/exclude archived notes in search

## Edge Cases and Considerations

### 1. Archived Note Type Changes

**Issue**: What happens if user tries to change the type of an archived note?

**Solution**: Disallow type changes for archived notes. Show message: "Unarchive note to change its type."

### 2. Creating Links to Archived Notes

**Issue**: Should autocomplete suggest archived notes when creating new wikilinks?

**Solution**: No - keep autocomplete clean. Users can still type the full note name to create the link.

### 3. Bulk Operations

**Issue**: What about bulk archiving/unarchiving?

**Solution**:

- Phase 1: Single note archive/unarchive only
- Phase 2: Add bulk operations with confirmation

### 4. Daily Notes

**Issue**: Should daily notes be archivable?

**Solution**: Yes - all note types can be archived, including daily notes.

### 5. Backlinks

**Issue**: Should archived notes show backlinks?

**Solution**: Yes - backlinks still work, but archived notes won't show up as backlinks in other notes' backlink panels (filtered out by default).

### 6. Export/Import

**Issue**: How are archived notes handled in export/import?

**Solution**: Archived status is preserved in frontmatter, so it's maintained across export/import.

## Testing Strategy

### Database Tests

**File**: `tests/server/database/archive-notes.test.ts`

```typescript
describe('Archive Notes', () => {
  test('should archive note and update database', async () => {
    // Test archiving sets archived = 1 in DB
  });

  test('should exclude archived notes from search', async () => {
    // Test search doesn't return archived notes
  });

  test('should include archived notes when explicitly requested', async () => {
    // Test includeArchived option
  });
});
```

### API Tests

**File**: `tests/server/api/archive-notes.test.ts`

```typescript
describe('Archive API', () => {
  test('archiveNote() should set frontmatter and DB', async () => {
    // Test full archive flow
  });

  test('unarchiveNote() should remove archived status', async () => {
    // Test unarchive flow
  });

  test('wikilinks to archived notes should resolve', async () => {
    // Test wikilink resolution includes archived notes
  });
});
```

### Integration Tests

**File**: `tests/integration/archive-workflow.test.ts`

```typescript
describe('Archive Workflow', () => {
  test('archived notes hidden from main list', async () => {
    // Test UI filtering
  });

  test('can open archived note via wikilink', async () => {
    // Test wikilink navigation to archived note
  });

  test('archived note editor is read-only', async () => {
    // Test read-only state
  });

  test('can unarchive note', async () => {
    // Test unarchive flow
  });
});
```

## Migration Path

### For Existing Users

1. **Database Migration**: Automatic on app start - adds `archived` column with default value `0`
2. **No Breaking Changes**: All existing notes are active (archived = 0) by default
3. **Gradual Adoption**: Users can start archiving notes after update

### Rollback Plan

If issues arise:

1. Database column remains (no harm)
2. Remove archive UI elements
3. All notes remain accessible (archived flag ignored)

## Performance Considerations

### Indexing

- Add composite index on `(type, archived)` for efficient filtering
- Add index on `archived` alone for archived notes view

### Query Optimization

- Use prepared statements for archive/unarchive operations
- Batch updates for bulk operations (future)

### Cache Invalidation

- Clear note cache on archive/unarchive
- Update search index atomically with archive operation

## Future Enhancements

1. **Bulk Archive**: Select multiple notes to archive at once
2. **Auto-Archive**: Archive notes older than X days (configurable)
3. **Archive Rules**: Auto-archive based on note type or tags
4. **Archive Statistics**: Show count of archived notes, archive date, etc.
5. **Archive Search**: Dedicated search within archived notes
6. **Restore from Archive**: Show archive history and restore specific versions

## Summary

This archive feature provides a comprehensive soft-delete mechanism that:

- ✅ Preserves note relationships and wikilinks
- ✅ Hides archived notes from normal workflows
- ✅ Provides clear visual indicators
- ✅ Maintains data integrity
- ✅ Allows easy unarchiving
- ✅ Requires minimal migration effort

The implementation touches ~20 files but follows existing patterns and integrates cleanly with the current architecture.
