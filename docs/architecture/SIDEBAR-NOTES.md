# Sidebar Notes Feature

## Overview

The Sidebar Notes feature allows users to pin notes to the right sidebar for quick reference while working on other content. Each sidebar note displays with an editable title, collapsible content area, and full CodeMirror editor support including wikilinks.

## User Workflow

1. **Adding Notes to Sidebar**
   - While viewing a note in the main editor, click "Add to Sidebar" button in the Note Action Bar
   - The note is immediately added to the sidebar notes list
   - Button becomes disabled and shows "In Sidebar" state if note is already in sidebar

2. **Managing Sidebar Notes**
   - Click the clipboard icon in the title bar to toggle the sidebar notes view
   - Each note shows a disclosure triangle to expand/collapse content
   - Click the note title to edit it inline
   - Click the X button to remove a note from the sidebar

3. **Editing Sidebar Notes**
   - Expanded notes show a full CodeMirrorEditor with all features:
     - Wikilink support (type `[[` to create links)
     - Hover previews on wikilinks
     - Click to navigate to linked notes
     - All standard editor extensions
   - Changes auto-save to the sidebar notes store
   - Edits do not affect the actual note files - sidebar notes are independent copies

## Architecture

### Data Flow

```
User Action (Add to Sidebar)
    ↓
NoteEditor.handleAddToSidebar()
    ↓
sidebarNotesStore.addNote(noteId, title, content)
    ↓
Store updates state + persists to app settings
    ↓
SidebarNotes component reactively updates
```

### Components

#### **SidebarNotes.svelte**
- Main component for displaying the sidebar notes list
- Manages disclosure state for expand/collapse
- Handles title editing with inline input
- Renders CodeMirrorEditor for each expanded note
- Connects wikilink clicks to navigation via `wikilinkService`

**Key Props:**
- None (reads directly from `sidebarNotesStore`)

**Key Features:**
- Inline title editing (click to edit, Enter to save, Escape to cancel)
- Disclosure triangles for expand/collapse
- Remove buttons to delete notes from sidebar
- Full CodeMirror integration with wikilinks

#### **NoteActionBar.svelte**
Extended with sidebar functionality:

**New Props:**
- `isInSidebar: boolean` - Whether the current note is in the sidebar
- `onAddToSidebar: () => Promise<void>` - Callback to add note to sidebar

**Button States:**
- Not in sidebar: Shows "📋 Add to Sidebar"
- Already in sidebar: Shows "📋 In Sidebar" (disabled)

#### **NoteEditor.svelte**
Implements sidebar integration:

**New Methods:**
- `handleAddToSidebar()` - Adds current note to sidebar store with snapshot of content

**Integration Points:**
- Checks `sidebarNotesStore.isInSidebar(note.id)` to determine button state
- Passes handler and state to NoteActionBar

#### **RightSidebar.svelte**
Extended to support notes mode:

**Modes:**
- `'ai'` - AI Assistant view
- `'threads'` - Thread list view
- `'notes'` - Sidebar notes view (new)

**Rendering:**
```svelte
{:else if sidebarState.rightSidebar.mode === 'notes'}
  <div class="notes-mode">
    <SidebarNotes />
  </div>
{/if}
```

### State Management

#### **sidebarNotesStore.svelte.ts**

**State Structure:**
```typescript
interface SidebarNote {
  noteId: string;      // Original note ID
  title: string;       // Editable title
  content: string;     // Editable content snapshot
  isExpanded: boolean; // Disclosure state
}
```

**Key Methods:**
- `addNote(noteId, title, content)` - Add note to sidebar (no-op if exists)
- `removeNote(noteId)` - Remove note from sidebar
- `updateNote(noteId, updates)` - Update title and/or content
- `toggleExpanded(noteId)` - Toggle disclosure state
- `isInSidebar(noteId)` - Check if note exists in sidebar

**Persistence:**
- Stores data in app settings file via `window.api?.saveAppSettings()`
- Loads on initialization via `window.api?.loadAppSettings()`
- Uses `$state.snapshot()` for IPC serialization

#### **sidebarState.svelte.ts**

**Extended Type:**
```typescript
rightSidebar: {
  mode: 'ai' | 'threads' | 'notes'; // Added 'notes'
}
```

**New Method:**
- `setRightSidebarMode('notes')` - Switch to notes view

### UI Integration

#### **App.svelte - Title Bar**

**Pillbox Controls:**
Three-button layout for right sidebar modes:

1. **AI Assistant** (left button)
   - Bulb icon
   - Toggles AI mode

2. **Agent Threads** (middle button)
   - Chat bubble icon
   - Toggles threads mode

3. **Sidebar Notes** (right button, new)
   - Clipboard icon
   - Toggles notes mode

**Button Behavior:**
- Clicking active mode toggles sidebar visibility
- Clicking inactive mode switches mode and opens sidebar if closed

**Styling:**
- Left button: Rounded left corners
- Middle button: No rounded corners
- Right button: Rounded right corners
- Active state: Accent color background

## Editor Integration

### CodeMirror Configuration

Sidebar note editors use the same CodeMirrorEditor component as the main note view, ensuring feature parity:

**Enabled Features:**
- Wikilink syntax highlighting
- Wikilink hover popovers
- Click to navigate wikilinks
- Wikilink autocomplete with `[[`
- All standard editor extensions

**Implementation:**
```svelte
<CodeMirrorEditor
  content={note.content}
  onContentChange={(content) => handleContentChange(note.noteId, content)}
  onWikilinkClick={handleWikilinkClick}
  placeholder="Note content..."
/>
```

**Wikilink Navigation:**
- Uses centralized `wikilinkService.handleWikilinkClick()`
- Navigates to existing notes
- Prompts creation for broken links
- Maintains navigation history

## Important Design Decisions

### 1. Independent Content Snapshots

**Decision:** Sidebar notes store independent copies of note content, not live references.

**Rationale:**
- Allows users to preserve specific versions for reference
- Prevents unintended updates when original notes change
- Simpler state management without reactivity to source notes
- Clear separation of concerns

**Trade-off:** Changes to original notes don't reflect in sidebar copies. Users must manually update or re-add notes if they want fresh content.

### 2. No Duplicate Prevention Beyond noteId

**Decision:** Can only add each note once (checked by noteId), but no duplicate content detection.

**Rationale:**
- Simple, predictable behavior
- Users understand "one copy per note"
- Prevents infinite additions of same note

### 3. Persistent Storage in App Settings

**Decision:** Store sidebar notes in app settings file alongside other UI state.

**Rationale:**
- Consistent with other UI persistence (sidebar state, pinned notes)
- Survives app restarts
- No database schema changes needed
- App-specific data, not vault-specific

### 4. Full Editor Experience

**Decision:** Use complete CodeMirrorEditor with all extensions, not a simplified textarea.

**Rationale:**
- Consistency with main editing experience
- Wikilinks are essential for note-taking workflow
- Users expect same editing capabilities everywhere
- Minimal additional complexity since component is reusable

## Future Enhancements

### Potential Features

1. **Sync with Source Notes**
   - Option to keep sidebar notes in sync with original
   - Visual indicator when source note has changed
   - "Refresh from source" button

2. **Note Organization**
   - Drag-to-reorder sidebar notes
   - Group notes into categories/sections
   - Search/filter sidebar notes

3. **Enhanced Editing**
   - Resize individual note editors
   - Split view to see multiple sidebar notes
   - Rich text formatting

4. **Collaboration**
   - Share sidebar note collections
   - Export/import sidebar configurations
   - Team note templates

5. **Smart Features**
   - Auto-add related notes based on wikilinks
   - Recently edited notes quick-add
   - Workspace-specific sidebar configurations

## Testing Considerations

### Manual Test Cases

1. **Adding Notes**
   - ✓ Add note to empty sidebar
   - ✓ Add note when sidebar already has notes
   - ✓ Attempt to add same note twice (should disable button)
   - ✓ Add note while sidebar is closed (should work, visible when opened)

2. **Editing Notes**
   - ✓ Edit title with Enter to save, Escape to cancel
   - ✓ Edit content with wikilinks
   - ✓ Click wikilinks to navigate
   - ✓ Verify changes persist after app restart

3. **Managing Notes**
   - ✓ Expand/collapse notes with disclosure triangle
   - ✓ Remove notes from sidebar
   - ✓ Multiple notes expanded simultaneously

4. **UI Integration**
   - ✓ Toggle sidebar with clipboard button
   - ✓ Switch between AI/Threads/Notes modes
   - ✓ Clicking active mode closes sidebar
   - ✓ Button states update correctly

### Edge Cases

- Empty sidebar state
- Very long note titles
- Large number of sidebar notes (performance)
- Deleted source notes (sidebar retains copy)
- Notes with special characters in titles
- Wikilinks to non-existent notes in sidebar

## Related Documentation

- [Note Editor Architecture](./NOTE-EDITOR.md)
- [Wikilink Popover Controls](./WIKILINK-POPOVER-CONTROLS.md)
- [Core Concepts](./CORE-CONCEPTS.md)
