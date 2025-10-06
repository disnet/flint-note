# Sidebar Notes Feature

## Overview

The Sidebar Notes feature allows users to pin notes to the right sidebar for quick reference and editing while working on other content. Each sidebar note displays with an always-editable title input, collapsible content area, and full CodeMirror editor support including wikilinks. Edits to both title and content sync back to the actual note files.

## User Workflow

1. **Adding Notes to Sidebar**
   - While viewing a note in the main editor, click "Add to Sidebar" button in the Note Action Bar
   - The note is immediately added to the sidebar notes list
   - Button becomes disabled and shows "In Sidebar" state if note is already in sidebar

2. **Managing Sidebar Notes**
   - Click the clipboard icon in the title bar to toggle the sidebar notes view
   - Each note shows a disclosure triangle to expand/collapse content
   - Title is always editable - click to focus and type
   - Click the X button to remove a note from the sidebar

3. **Editing Sidebar Notes**
   - **Title Editing:**
     - Title input is always visible and editable
     - Press Enter or blur the input to commit changes (renames the actual note)
     - Press Escape to cancel and revert to original title
     - Changes sync to the actual note file via renameNote API
   - **Content Editing:**
     - Expanded notes show a full CodeMirrorEditor with all features:
       - Wikilink support (type `[[` to create links)
       - Hover previews on wikilinks
       - Click to navigate to linked notes
       - All standard editor extensions
     - Changes auto-save with 500ms debounce
     - Edits sync back to the actual note file via updateNote API

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
- Reacts to external note changes via `$effect` on `notesStore.noteUpdateCounter`

**Key Props:**

- None (reads directly from `sidebarNotesStore`)

**Key Features:**

- Always-editable title inputs with commit-on-blur/Enter and cancel-on-Escape
- Disclosure triangles for expand/collapse
- Remove buttons to delete notes from sidebar
- Full CodeMirror integration with wikilinks using 'sidebar-note' variant
- Content-hugging containers (no min-height, only max-height of 400px)
- Reactive updates: watches `notesStore.noteUpdateCounter` and reloads sidebar notes from database when they're updated externally (e.g., in NoteEditor)

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
- Updates `sidebarNotesStore.updateNoteId()` when renaming notes that are in the sidebar
- Has `$effect` watching `notesStore.noteUpdateCounter` that reloads when its note is updated from another source

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
  noteId: string; // Original note ID
  title: string; // Editable title
  content: string; // Editable content snapshot
  isExpanded: boolean; // Disclosure state
}
```

**Key Methods:**

- `addNote(noteId, title, content)` - Add note to sidebar (no-op if exists)
- `removeNote(noteId)` - Remove note from sidebar
- `updateNote(noteId, updates, syncToDatabase?)` - Update title and/or content with sync to actual note:
  - Title changes call `renameNote()` API and update `noteId` if changed
  - Content changes call `updateNote()` API with debounced updates
  - Reverts title on rename failure to prevent inconsistent state
  - Calls `notesStore.notifyNoteUpdated()` to notify other components
  - `syncToDatabase` parameter (default true) prevents infinite loops when reloading from external updates
- `toggleExpanded(noteId)` - Toggle disclosure state
- `isInSidebar(noteId)` - Check if note exists in sidebar
- `updateNoteId(oldId, newId)` - Update noteId when note is renamed externally

**Persistence:**

- Sidebar state stored in app settings file via `window.api?.saveAppSettings()`
- Loads on initialization via `window.api?.loadAppSettings()`
- Uses `$state.snapshot()` for IPC serialization
- Actual note changes sync to database via `renameNote()` and `updateNote()` APIs

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

Sidebar note editors use the same CodeMirrorEditor component as the main note view with a specialized 'sidebar-note' variant:

**Enabled Features:**

- Wikilink syntax highlighting
- Wikilink hover popovers
- Click to navigate wikilinks
- Wikilink autocomplete with `[[`
- All standard editor extensions

**Variant Customizations:**

The 'sidebar-note' variant (defined in `editorConfig.svelte.ts`) provides:

- `marginBottom: '0'` instead of default `'25vh'` to prevent excess whitespace
- Compact 8px scrollbars with auto overflow
- 0.5rem content padding for comfortable editing
- Scroll auto-service with tighter margins (80px bottom, 40px top)

**Implementation:**

```svelte
<CodeMirrorEditor
  content={note.content}
  onContentChange={(content) => handleContentChange(note.noteId, content)}
  onWikilinkClick={handleWikilinkClick}
  placeholder="Note content..."
  variant="sidebar-note"
/>
```

**Wikilink Navigation:**

- Uses centralized `wikilinkService.handleWikilinkClick()`
- Navigates to existing notes
- Prompts creation for broken links
- Maintains navigation history

## Important Design Decisions

### 1. Bidirectional Sync with Actual Notes

**Decision:** Sidebar notes sync edits back to actual note files in the database and react to external changes.

**Rationale:**

- Users expect edits to persist - sidebar is an alternative editing interface
- Title changes rename the actual note via `renameNote()` API
- Content changes update the actual note via `updateNote()` API with debouncing
- Maintains consistency between sidebar view and main editor view
- Handles noteId updates when rename returns a new identifier
- All components (NoteEditor, SidebarNotes) stay reactive to changes from any source

**Implementation Details:**

- Content changes debounced at 500ms to avoid excessive API calls during typing
- Title changes only commit on blur/Enter to give users explicit control
- Escape key cancels title edits and reverts to original value
- Rename failures revert title to prevent inconsistent state
- Sidebar state persists to app settings, actual note changes persist to vault database

**Reactivity Architecture:**

- When `sidebarNotesStore.updateNote()` changes a note, it calls `notesStore.notifyNoteUpdated(noteId)`
- `NoteEditor` has a `$effect` watching `notesStore.noteUpdateCounter` that reloads when its note is updated
- `SidebarNotes` has a `$effect` watching `notesStore.noteUpdateCounter` that reloads sidebar notes when updated externally
- Both reload from database (single source of truth) to stay in sync
- `syncToDatabase` parameter prevents infinite loops when reloading from external updates
- When notes are renamed in NoteEditor, it updates `sidebarNotesStore.updateNoteId()` to keep references current

### 2. Always-Editable Title Inputs

**Decision:** Title inputs are always visible and editable, not click-to-edit.

**Rationale:**

- More intuitive - users can see it's editable without clicking
- Simpler interaction model - no mode switching
- Consistent with modern web UX patterns
- Transparent background blends in when not focused

**UX Details:**

- Subtle styling: transparent background, border appears on hover/focus
- Commit on blur/Enter for deliberate changes
- Escape cancels and reverts to original

### 3. Content-Hugging Containers

**Decision:** Note containers have no min-height, only max-height (400px).

**Rationale:**

- Efficient use of sidebar space
- Single-line notes don't waste vertical space
- Users can see more notes at once
- Max-height prevents extremely long notes from dominating the sidebar

### 4. No Duplicate Prevention Beyond noteId

**Decision:** Can only add each note once (checked by noteId), but no duplicate content detection.

**Rationale:**

- Simple, predictable behavior
- Users understand "one copy per note"
- Prevents infinite additions of same note

### 5. Persistent Storage in App Settings

**Decision:** Store sidebar notes in app settings file alongside other UI state.

**Rationale:**

- Consistent with other UI persistence (sidebar state, pinned notes)
- Survives app restarts
- No database schema changes needed
- App-specific data, not vault-specific

### 6. Full Editor Experience with Variant

**Decision:** Use complete CodeMirrorEditor with all extensions via 'sidebar-note' variant.

**Rationale:**

- Consistency with main editing experience
- Wikilinks are essential for note-taking workflow
- Users expect same editing capabilities everywhere
- Variant system allows customization without code duplication
- Specialized theme (no bottom margin, compact scrollbars) optimized for sidebar context

## Future Enhancements

### Potential Features

1. **Note Organization**
   - Drag-to-reorder sidebar notes
   - Group notes into categories/sections
   - Search/filter sidebar notes

2. **Enhanced Editing**
   - Resize individual note editors
   - Split view to see multiple sidebar notes
   - Rich text formatting

3. **Collaboration**
   - Share sidebar note collections
   - Export/import sidebar configurations
   - Team note templates

4. **Smart Features**
   - Auto-add related notes based on wikilinks
   - Recently edited notes quick-add
   - Workspace-specific sidebar configurations

5. **Conflict Resolution**
   - Visual indicator when underlying note changes externally
   - Three-way merge options for conflicts
   - "Reload from source" button to discard sidebar changes

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
