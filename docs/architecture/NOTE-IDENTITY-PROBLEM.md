# Note Identity Problem

## Current Problem

We've discovered a fundamental architectural issue with how notes are identified in the system. The current implementation conflates three distinct concepts into a single "identity" field, leading to cascading complexity when notes are renamed.

### The Issue

Currently, we have:
- **`note.id`** (also called `identifier` in APIs): A string that serves as both the unique identifier AND the filename/wikilink reference
- **`note.title`**: The user-visible title displayed in the UI

**The problem:** When a user changes the title, the `note.id` also changes because it's derived from the title. This causes a ripple effect throughout the system:

1. Any component holding a reference to the old ID becomes stale
2. We need complex rename tracking (`noteRenameCounter`, `lastRenamedNoteOldId`, `lastRenamedNoteNewId`)
3. Every store/component that references notes must watch for renames and update their references
4. Pinned notes, temporary tabs, sidebar notes, cursor positions, and navigation history all need special handling
5. The complexity compounds: we now have separate update and rename notification systems

### Example of the Complexity

When a note title changes in the sidebar:

```typescript
// 1. Sidebar calls rename API
const result = await window.api?.renameNote({
  identifier: noteId,           // old ID
  newIdentifier: updates.title  // becomes new ID
});

// 2. Update sidebar's own reference
note.noteId = result.new_id;

// 3. Notify other components about the rename
notesStore.notifyNoteRenamed(noteId, result.new_id);

// 4. NoteEditor watches for renames
$effect(() => {
  if (oldId === note?.id && newId) {
    // Update local reference
    note = { ...note, id: newId, title: updatedNote.title };
  }
});

// 5. Every other component must do the same dance
```

This is fragile and error-prone. Every new feature that references notes must implement this rename-tracking logic.

## Root Cause Analysis

The root cause is **conflating identity with addressability**:

- **Identity** should answer "Is this the same note I was looking at before?"
- **Addressability** should answer "How do I reference this note in a wikilink or file system?"

Currently, both questions are answered by the same field (`note.id`), which breaks down when addressability changes (title rename) but identity should remain constant.

## Proposed Solution: Three-Concept Model

We should separate notes into three distinct concepts:

### 1. **Note Identity** (Immutable)
- **Purpose**: Permanent, stable identifier that never changes
- **Format**: Timestamp-based hash or UUID (e.g., `note-20251006-a3b4c5d6` or UUID)
- **Used for**:
  - Primary key in database
  - References in stores (pinned, sidebar, temporary tabs)
  - Cursor position tracking
  - Navigation history
  - Any internal system that needs to "remember" a note

### 2. **Note Title** (Mutable)
- **Purpose**: Human-readable name displayed in UI
- **Format**: Free-form text, can be empty
- **Used for**:
  - Display in note lists
  - Display in editor headers
  - Display in tabs
  - Can change without affecting any references

### 3. **Link ID** (Mutable)
- **Purpose**: How the note is addressed in wikilinks and filesystem
- **Format**: Derived from title (or generated if title is empty)
- **Used for**:
  - Wikilink syntax: `[[Link ID]]`
  - Filename: `{linkId}.md`
  - URL fragments
  - Human-readable references

### Data Structure

```typescript
interface Note {
  id: string;           // Immutable identity (e.g., "note-20251006-a3b4c5d6")
  title: string;        // Mutable user-visible title
  linkId: string;       // Mutable wikilink/filename identifier
  type: string;
  content: string;
  created: string;
  modified: string;
  // ... other fields
}
```

### API Changes

```typescript
// Current (problematic)
renameNote(identifier: string, newIdentifier: string)

// Proposed
updateNoteTitle(id: string, newTitle: string)  // Changes title and derives new linkId
updateNoteLinkId(id: string, newLinkId: string)  // Explicit linkId change (advanced use)
```

## Benefits of Three-Concept Model

### 1. **Simplified Reactivity**
- Components only watch for content/title updates, not identity changes
- No need for rename tracking infrastructure
- References never become stale

```typescript
// Simple - just watch for updates, ID never changes
$effect(() => {
  if (notesStore.lastUpdatedNoteId === note.id) {
    await loadNote(note);
  }
});
```

### 2. **Cleaner Store Logic**

```typescript
// No updateNoteId() methods needed
class PinnedNotesStore {
  pinNote(id: string) { /* just store the id */ }
  // id never changes, no update method needed
}
```

### 3. **Better Data Integrity**
- Immutable IDs mean foreign key relationships never break
- No cascade of updates when a title changes
- Easier to reason about data flow

### 4. **Flexibility for Future Features**
- Can have multiple notes with same title (different IDs)
- Can have notes with same linkId in different vaults
- Can implement "aliases" (multiple linkIds for same note)
- Can track full rename history without ID confusion

## Migration Strategy

### Phase 1: Database Schema Update
1. Add `id` column (immutable, generated on creation)
2. Rename current `id` to `link_id`
3. Add `title` column separate from `link_id`
4. Migration script to generate stable IDs for existing notes

### Phase 2: API Layer Update
1. Update all APIs to accept/return new structure
2. Maintain backward compatibility with adapter layer
3. Update IPC methods in preload

### Phase 3: Frontend Update
1. Update `NoteMetadata` type
2. Update all stores to use immutable `id`
3. Remove all `updateNoteId()` methods
4. Remove rename tracking infrastructure
5. Update components to use `note.id` for identity, `note.linkId` for wikilinks

### Phase 4: Cleanup
1. Remove old rename notification system
2. Remove compatibility layer
3. Update documentation

## Edge Cases & Considerations

### Wikilink Resolution
- When user types `[[Some Note]]`, resolve to `linkId`
- If multiple notes have same `linkId`, show disambiguation
- Store relationship in wikilinks table: `(source_id, target_id, link_text)`

### File System
- Filename derived from `linkId`: `{linkId}.md`
- If `linkId` conflicts, append disambiguator: `{linkId}-2.md`
- Track filename separately in database to handle conflicts

### Backward Compatibility
- Old vaults using title-based IDs need migration
- Provide migration tool that generates stable IDs
- During migration, preserve linkId from old title-based ID

### Title vs LinkId Sync
- By default, changing title updates linkId (current behavior)
- Advanced users can "lock" linkId separate from title
- Setting in note metadata: `lockLinkId: boolean`

## Alternative Approaches Considered

### 1. Keep Current System, Add Rename Tracking
**Rejected because:**
- Doesn't solve the fundamental problem
- Adds complexity rather than removing it
- Every new feature requires rename-aware code

### 2. Use UUIDs for Everything
**Rejected because:**
- Loses human-readable wikilinks
- Existing notes would need massive migration
- Doesn't align with Zettelkasten/note-taking conventions

### 3. Stable Numeric IDs (Auto-increment)
**Rejected because:**
- Requires central ID authority
- Difficult to merge vaults
- Doesn't work well in distributed/sync scenarios
- Not meaningful to users

## Recommendation

**Implement the Three-Concept Model with phased migration.**

This solves the root cause rather than patching symptoms. While it requires upfront work, it will:
- Eliminate entire categories of bugs
- Simplify future development
- Make the system more robust
- Align with how users think about notes (identity vs. title vs. reference)

The migration can be done incrementally without breaking existing functionality, and the long-term benefits far outweigh the implementation cost.

## Related Issues

- Sidebar notes sync issue (immediate trigger for this analysis)
- Pinned notes stale title issue (previously patched)
- Temporary tabs reference tracking
- Cursor position across renames
- Navigation history stability

All of these stem from the same root cause: mutable identity.
