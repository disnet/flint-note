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

## Proposed Solution: Two-Concept Model

We should separate notes into two distinct concepts:

### 1. **Note ID** (Immutable)
- **Purpose**: Permanent, stable identifier that never changes
- **Format**: Short hash derived from `sha256(vault_id + creation_timestamp + random_salt)` (e.g., `n-a3b4c5d6`)
- **Used for**:
  - Primary key in database
  - References in stores (pinned, sidebar, temporary tabs)
  - Cursor position tracking
  - Navigation history
  - Internal wikilink resolution (database stores `source_id` and `target_id` as immutable IDs)
  - Any internal system that needs to "remember" a note

### 2. **Note Title** (Mutable)
- **Purpose**: Human-readable name displayed in UI and used for addressing
- **Format**: Free-form text, can be empty
- **Used for**:
  - Display in note lists, editor headers, tabs
  - **Filename derivation**: `generateFilename(title)` → `my-note.md`
  - **Wikilink syntax**: `[[type/filename]]` or `[[type/filename|Display Text]]`
  - Can change without affecting internal references

### Why Not a Third "LinkID" Concept?

Initially considered having a separate `linkId` field, but it's **unnecessary** because:

1. **Wikilink compatibility**: We already auto-derive filenames from titles (e.g., "My Note" → `my-note.md`)
2. **Tool compatibility**: Other apps like Obsidian expect `[[type/filename]]` syntax
3. **Human ergonomics**: Filenames remain meaningful, not UUIDs
4. **Simplicity**: Two concepts are easier to reason about than three

The filename IS the "link ID" - it's just automatically derived from the title.

### Data Structure

```typescript
interface Note {
  id: string;           // Immutable identity (e.g., "n-a3b4c5d6")
  title: string;        // Mutable user-visible title
  filename: string;     // Derived from title (e.g., "my-note.md")
  type: string;
  content: string;
  created: string;
  modified: string;
  // ... other fields
}
```

### API Changes

```typescript
// Current (problematic) - ID changes when title changes
renameNote(identifier: string, newTitle: string) → {
  new_id: string,  // ID changed! Requires updating all references
  old_id: string
}

// Proposed - ID stays stable
renameNote(id: string, newTitle: string) → {
  id: string,              // Same ID (unchanged)
  filename_changed: boolean,  // Did the filename change?
  wikilinks_updated: number   // How many wikilinks were updated
}
```

### What Happens When Title Changes

**Example: Renaming "My Daily Note" → "My Updated Note"**

```typescript
// Before rename
{
  id: "n-3f8a9b2c",           // ← Never changes
  title: "My Daily Note",
  filename: "my-daily-note.md",
  type: "daily"
}

// After rename
{
  id: "n-3f8a9b2c",           // ← Same ID!
  title: "My Updated Note",
  filename: "my-updated-note.md",  // ← Derived from new title
  type: "daily"
}
```

**What gets updated:**
1. ✅ **File renamed**: `daily/my-daily-note.md` → `daily/my-updated-note.md`
2. ✅ **Wikilinks updated**: `[[daily/my-daily-note]]` → `[[daily/my-updated-note]]` in other notes
3. ✅ **Database link table**: `link_text` updated (but `source_id` and `target_id` stay stable)
4. ❌ **Store references**: No updates needed! ID didn't change

**What does NOT get updated:**
- Pinned notes store: Still references `n-3f8a9b2c`
- Sidebar notes store: Still references `n-3f8a9b2c`
- Temporary tabs store: Still references `n-3f8a9b2c`
- Navigation history: Still references `n-3f8a9b2c`

## Benefits of Two-Concept Model

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
// BEFORE: Every store needs updateNoteId() for rename tracking
class PinnedNotesStore {
  async updateNoteId(oldId: string, newId: string) {
    const note = this.notes.find(n => n.id === oldId);
    if (note) {
      note.id = newId;
      await this.save();
    }
  }
}

// AFTER: No rename tracking needed at all
class PinnedNotesStore {
  pinNote(id: string) { /* just store the id */ }
  // id never changes, no update method needed!
}
```

**Methods that can be DELETED entirely:**
- `sidebarNotesStore.updateNoteId()` (line 228-236)
- `pinnedStore.updateNoteId()` (line 188-194)
- `temporaryTabsStore.updateNoteId()` (line 235-249)
- `notesStore.notifyNoteRenamed()` (line 246-250)
- All rename counter tracking (`noteRenameCounter`, `lastRenamedNoteOldId`, `lastRenamedNoteNewId`)

### 3. **Better Data Integrity**
- Immutable IDs mean foreign key relationships never break
- No cascade of updates when a title changes
- Easier to reason about data flow
- Wikilink database entries remain stable (only `link_text` updates, not IDs)

### 4. **Maintains Tool Compatibility**
- ✅ **Obsidian compatibility**: `[[type/filename]]` wikilink syntax works
- ✅ **Human-readable files**: Filenames like `my-note.md`, not `n-a3b4c5d6.md`
- ✅ **Git-friendly**: Meaningful filenames in version control
- ✅ **Filesystem browsing**: Users can navigate vault folder directly

## Migration Strategy

Since there are currently no users, we can implement a breaking change without migration concerns.

### Phase 1: Database Schema Update
**File**: `src/server/database/schema.sql`

```sql
-- Add immutable ID column (primary key)
ALTER TABLE notes ADD COLUMN id TEXT PRIMARY KEY;

-- Generate IDs for existing notes (one-time migration)
UPDATE notes SET id = 'n-' || substr(hex(randomblob(4)), 1, 8);

-- Keep existing columns (title, filename, type)
-- No changes needed - they already exist and work correctly
```

### Phase 2: Core Note Manager Update
**File**: `src/server/core/notes.ts`

1. **Change `generateNoteId()` (line 453)**:
   ```typescript
   // OLD: Returns "type/filename"
   generateNoteId(typeName: string, filename: string): string {
     return `${typeName}/${filename.replace(/\.md$/, '')}`;
   }

   // NEW: Returns immutable hash
   generateNoteId(): string {
     return 'n-' + createHash('sha256')
       .update(`${Date.now()}-${Math.random()}`)
       .digest('hex')
       .substring(0, 8);
   }
   ```

2. **Simplify `renameNoteWithFile()` (line 1427-1644)**:
   - Remove ID change logic (line 1514)
   - Keep file rename (line 1547-1548)
   - Keep wikilink updates (line 1577-1607)
   - **Remove** rollback of "wasRemovedFromIndex" - ID stays in index
   - Return `{ id, filename_changed }` instead of `{ old_id, new_id }`

3. **Update `createNote()` (line 293-375)**:
   - Generate immutable ID at creation time
   - Store ID in database immediately

### Phase 3: Frontend Store Cleanup
**Files**: All `*.svelte.ts` stores

**DELETE these methods entirely:**
- `src/renderer/src/stores/sidebarNotesStore.svelte.ts:228-236` - `updateNoteId()`
- `src/renderer/src/services/pinnedStore.svelte.ts:188-194` - `updateNoteId()`
- `src/renderer/src/stores/temporaryTabsStore.svelte.ts:235-249` - `updateNoteId()`
- `src/renderer/src/services/noteStore.svelte.ts:246-250` - `notifyNoteRenamed()`

**DELETE these state fields:**
- `src/renderer/src/services/noteStore.svelte.ts:29-31`:
  ```typescript
  noteRenameCounter: number;
  lastRenamedNoteOldId: string | null;
  lastRenamedNoteNewId: string | null;
  ```

### Phase 4: API Type Updates
**File**: `src/server/api/flint-api-types.ts`

```typescript
// OLD (line 211-224)
interface RenameNoteOptions {
  id: string;
  newTitle: string;
  contentHash?: string;
}

interface RenameNoteResult {
  id: string;           // NEW ID - causes all the problems!
  old_title: string;
  new_title: string;
  old_path: string;
  new_path: string;
}

// NEW
interface RenameNoteOptions {
  id: string;           // Immutable ID
  newTitle: string;
  contentHash?: string;
}

interface RenameNoteResult {
  id: string;                // SAME ID (unchanged)
  old_title: string;
  new_title: string;
  old_filename: string;
  new_filename: string;
  filename_changed: boolean;
  wikilinks_updated: number;
}
```

### Phase 5: Component Updates
**Files**: Any components that handle rename events

**BEFORE**:
```typescript
// Watch for rename events
$effect(() => {
  if (oldId === note?.id && newId) {
    note = { ...note, id: newId, title: updatedNote.title };
  }
});
```

**AFTER**:
```typescript
// Just watch for content updates - ID never changes!
$effect(() => {
  if (notesStore.lastUpdatedNoteId === note.id) {
    await loadNote(note);
  }
});
```

## Edge Cases & Considerations

### Wikilink Resolution
**User types**: `[[type/some-note]]` or `[[Some Note]]`

**Resolution process**:
1. Try exact match on `type/filename` in database
2. If not found, fuzzy search on title → suggest matches
3. Store in database: `(source_id: "n-abc123", target_id: "n-xyz789", link_text: "type/some-note")`

**When target note is renamed**:
- Internal IDs stay stable (`source_id`, `target_id` unchanged)
- `link_text` gets updated to new filename
- Markdown content updated: `[[type/old-name]]` → `[[type/new-name]]`

### Filename Conflicts
**Already handled** by existing `generateUniqueFilename()` (notes.ts:410-448):

```typescript
// If "my-note.md" exists, generates "my-note-2.md"
// This behavior doesn't change with immutable IDs
```

### ID Generation
**Collision resistance**: SHA256 with timestamp + random → virtually impossible

```typescript
// Example generated IDs (8-char hex)
n-3f8a9b2c  // Probability of collision: ~1 in 4 billion
n-7e2d1a5f
n-9c4b6e8a
```

### Wikilink Updates Still Required
**Important**: Even though IDs don't change, wikilink **text** must still update:

```markdown
<!-- Note renamed: "Old Title" → "New Title" -->

<!-- BEFORE (in another note) -->
See [[daily/old-title]] for details.

<!-- AFTER (wikilink text updated) -->
See [[daily/new-title]] for details.

<!-- But internally: both point to same immutable ID "n-3f8a9b2c" -->
```

This is **not** ID tracking - it's maintaining readable wikilink text for human/tool compatibility.

## Alternative Approaches Considered

### 1. Keep Current System, Add Rename Tracking
**Rejected because:**
- Doesn't solve the fundamental problem
- Adds complexity rather than removing it
- Every new feature requires rename-aware code
- Already tried this - it's what we have now and it's painful

### 2. Use UUIDs for Everything (Including Filenames)
**Rejected because:**
- Filenames become `a3b4c5d6-e7f8-9012-3456-789abcdef012.md`
- Breaks Obsidian/tool compatibility
- Not human-browseable in filesystem
- Poor git diffs (can't tell what changed)

### 3. Three-Concept Model (ID + Title + LinkID)
**Rejected because:**
- Adds unnecessary complexity (third field to track)
- LinkID is redundant - already auto-derive filename from title
- No clear use case for "locked linkID separate from title"
- Users don't need or want aliases in wikilinks

### 4. Stable Numeric IDs (Auto-increment)
**Rejected because:**
- Requires central ID authority
- Difficult to merge vaults
- Doesn't work well in distributed/sync scenarios

## Recommendation

**Implement the Two-Concept Model (Immutable ID + Mutable Title/Filename)**

This is the simplest solution that solves the root cause:

**Benefits:**
- ✅ Eliminates entire categories of bugs (stale references)
- ✅ Removes ~150 lines of rename-tracking code
- ✅ Maintains Obsidian/tool compatibility
- ✅ Human-readable filenames
- ✅ Simpler mental model (just ID + title)

**Costs:**
- Database migration (add ID column)
- Update note creation/lookup logic
- Remove rename tracking from stores

**No users yet** → Can implement without backward compatibility concerns.

## Related Issues

All of these stem from the same root cause (mutable identity) and will be **eliminated** by this change:

- ✅ **Sidebar notes sync issue** (immediate trigger for this analysis) → No longer needs `updateNoteId()`
- ✅ **Pinned notes stale references** → No longer needs `updateNoteId()`
- ✅ **Temporary tabs stale references** → No longer needs `updateNoteId()`
- ✅ **Cursor position across renames** → ID stays stable, position tracking works
- ✅ **Navigation history stability** → History entries never go stale

## Summary

The two-concept model (immutable ID + mutable title/filename) is the right architectural fix. It:

1. **Fixes the root cause** (conflated identity and addressability)
2. **Maintains compatibility** (Obsidian wikilinks, human-readable files)
3. **Simplifies the codebase** (deletes ~150 lines of tracking code)
4. **Prevents entire bug classes** (no more stale references)

Wikilink text still updates when notes are renamed, but this is for **human/tool readability**, not system correctness. The internal references (database IDs, store pointers) remain stable forever.
