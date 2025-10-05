# Backlinks Architecture

## Overview

The backlinks system provides bidirectional navigation between notes by tracking and displaying all notes that link to the current note via wikilinks. This creates a reverse index that allows users to discover related content and navigate their knowledge graph in both directions.

## Core Concepts

### What are Backlinks?

A backlink is an incoming reference to a note. When Note A contains a wikilink to Note B (e.g., `[[Note B]]`), Note B will show Note A in its backlinks section. This creates a bidirectional relationship where users can navigate both forward (following links) and backward (viewing what links here).

### Key Components

1. **Link Extraction** - Parsing markdown content to identify wikilinks
2. **Link Storage** - Database table tracking source note, target note, and line number
3. **Link Display** - UI component showing backlinks with editable context
4. **Link Updates** - Automatic refresh when notes or links change

## Database Schema

### `note_links` Table

```sql
CREATE TABLE note_links (
  id TEXT PRIMARY KEY,
  source_note_id TEXT NOT NULL,      -- Note containing the wikilink
  target_note_id TEXT NOT NULL,      -- Note being linked to
  link_text TEXT NOT NULL,           -- Display text of the link
  line_number INTEGER,               -- Line number where link appears
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX idx_note_links_source ON note_links(source_note_id);
CREATE INDEX idx_note_links_target ON note_links(target_note_id);
```

**Key Fields:**

- `source_note_id` - The note that contains the wikilink
- `target_note_id` - The note being referenced (the one showing the backlink)
- `line_number` - 1-indexed line number for precise context extraction and navigation
- Foreign key constraints ensure links are deleted when notes are deleted

## Link Extraction and Storage

### Link Extraction (`src/server/core/link-extractor.ts`)

The `LinkExtractor` class parses markdown content to find wikilinks:

```typescript
interface ExtractedLink {
  identifier: string; // Target note identifier
  displayText: string; // Text shown in brackets
  lineNumber: number; // 1-indexed line number
}
```

**Process:**

1. Split content into lines
2. Use regex to find all `[[...]]` patterns per line
3. Parse identifier and optional display text (e.g., `[[id|display]]`)
4. Return array of ExtractedLink objects with line numbers

### Link Storage (`src/server/core/links.ts`)

The `LinkManager` handles persistence:

```typescript
async updateNoteLinks(
  noteId: string,
  links: ExtractedLink[]
): Promise<void>
```

**Process:**

1. Delete all existing links for the source note
2. For each extracted link:
   - Resolve identifier to target note ID
   - Create new `note_links` row with source, target, line number
3. Uses transactions to ensure atomicity

## Backlinks UI Architecture

### Component Structure

```
Backlinks.svelte (Container)
├── Header with expand/collapse
├── Show All / Hide All controls
└── Backlink items
    ├── Context toggle arrow
    ├── Note type badge
    ├── Clickable note title
    └── BacklinkContextEditor (when expanded)
```

### `Backlinks.svelte` Component

**Location:** `src/renderer/src/components/Backlinks.svelte`

**Props:**

```typescript
interface Props {
  noteId: string;
  onNoteSelect: (note: NoteMetadata, lineNumber?: number) => void;
}
```

**State:**

```typescript
interface BacklinkWithContext {
  link: NoteLinkRow; // Database row
  context: string | null; // Line content from source note
  sourceTitle: string | null; // Display name of source note
  sourceType: string | null; // Type of source note
  contextExpanded: boolean; // UI expansion state
}
```

**Key Features:**

- Loads backlinks when `noteId` changes
- Fetches full note content to extract line context
- Expands/collapses individual backlinks
- Bulk expand/collapse all backlinks
- Auto-refreshes when wikilinks are updated (via `notesStore.wikilinksUpdateCounter`)

### `BacklinkContextEditor.svelte` Component

**Location:** `src/renderer/src/components/BacklinkContextEditor.svelte`

A minimal single-line CodeMirror editor for editing backlink context inline.

**Props:**

```typescript
interface Props {
  sourceNoteId: string;         // Note containing the link
  lineNumber: number;           // Line number in source note
  initialContent: string;       // Current line content
  onNavigate: () => void;       // Called when Enter is pressed
  onWikilinkClick?: (...) => Promise<void>;
}
```

**Features:**

- Full CodeMirror editor with wikilink support
- Markdown syntax highlighting
- Single-line editing (Enter navigates instead of adding newlines)
- Auto-save on blur and debounced (1s) during typing
- Updates only the specific line in the source note

**Editor Configuration:**

- Uses `'backlink-context'` variant in `EditorConfig`
- Compact single-line theme with minimal padding
- Custom Enter key handler for navigation
- Transparent background to blend with UI

## Data Flow

### Loading Backlinks

```
1. NoteEditor renders with note.id
2. Backlinks component receives noteId prop
3. $effect triggers loadBacklinks(noteId)
4. API call: getBacklinks({ identifier: noteId })
5. Database query: SELECT * FROM note_links WHERE target_note_id = ?
6. For each link:
   - Fetch source note content
   - Extract line at link.line_number
   - Build BacklinkWithContext object
7. Update local state and render
```

### Editing Backlink Context

```
1. User clicks on BacklinkContextEditor
2. User types characters
3. handleContentChange updates currentContent state
4. After 1s (debounced) or on blur:
   - Fetch full source note content
   - Split into lines array
   - Replace lines[lineNumber - 1] with currentContent
   - Call updateNote API with modified content
5. Source note is updated on disk and in database
6. Link extraction re-runs on source note
7. Wikilinks update counter increments
8. All open backlinks refresh with new context
```

### Navigation from Backlinks

```
1. User clicks note title → handleBacklinkClick(backlink)
   - Navigates to source note
   - No line positioning

2. User presses Enter in context editor → handleNavigateToSource(backlink)
   - Navigates to source note
   - Positions cursor at line_number

Process:
1. Call onNoteSelect(sourceNote, lineNumber)
2. In NoteEditor.handleBacklinkSelect:
   - Fetch target note content
   - Calculate character offset from line number
   - Save cursor position to database
   - Navigate via wikilinkService
3. When note opens, cursor is positioned at saved location
```

## Auto-Refresh Mechanism

### Wikilinks Update Counter

The `notesStore` maintains a reactive counter that increments whenever wikilinks change:

```typescript
// In noteStore.svelte.ts
wikilinksUpdateCounter = $state(0);

notifyWikilinksUpdated(): void {
  this.wikilinksUpdateCounter++;
}
```

**Triggers:**

- Note rename operations that update wikilinks in other notes
- Manual link updates
- Any operation that modifies note_links table

### Backlinks Auto-Refresh

```typescript
// In Backlinks.svelte
$effect(() => {
  const updateCounter = notesStore.wikilinksUpdateCounter;
  if (updateCounter > 0 && noteId) {
    loadBacklinks(noteId);
  }
});
```

This ensures backlinks stay synchronized with the current state of the knowledge graph.

## Editor Integration

### CodeMirror Configuration

The backlink context editor uses a specialized variant:

**Variant:** `'backlink-context'`

**Theme Customizations:**

- `height: auto` - Grows to fit content
- `overflow: hidden` - No scrolling
- `padding: 0` - Minimal spacing
- Transparent background
- Focus outline for clarity

**Extensions:**

- All standard markdown and wikilink support
- Custom Enter keymap that calls `onNavigate()`
- Line wrapping enabled
- Spellcheck enabled

**Key Difference from Main Editor:**

- Prevents newlines (Enter navigates)
- No cursor position persistence
- No auto-scroll margin
- Minimal visual chrome

### Reactive Updates

The editor uses Svelte 5 runes for reactivity:

```typescript
let currentContent = $state(initialContent);

$effect(() => {
  // Only update when parent changes initialContent
  if (editorView) {
    updateEditorContent();
  }
});
```

**Important:** The effect watches `initialContent` (from props), not `currentContent` (local edits). This prevents a feedback loop where user typing would reset the editor.

## Line Number Handling

### 1-Indexed Convention

All line numbers in the system use 1-based indexing:

- Database storage: `line_number` starts at 1
- Link extraction: Returns 1-based line numbers
- UI display: Shows line N as "line N"
- Context extraction: `lines[lineNumber - 1]`

### Character Offset Calculation

When navigating to a line, convert to character position:

```typescript
let position = 0;
for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
  position += lines[i].length + 1; // +1 for newline
}
```

This positions the cursor at the start of the target line.

## Performance Considerations

### Efficient Context Loading

- Backlinks fetch source notes in parallel using `Promise.all()`
- Line extraction is a simple array lookup (O(1) after split)
- Context is loaded only when backlinks are expanded

### Debounced Saves

- Editor changes are debounced to 1 second
- Prevents excessive API calls while typing
- Blur triggers immediate save to ensure no data loss

### Selective Refresh

- Only refreshes backlinks when wikilinks counter changes
- Individual components track their own expansion state
- No global re-render on every note update

## Error Handling

### Missing Source Notes

If a source note is deleted but the link remains:

```typescript
try {
  const sourceNote = await noteService.getNote({ identifier: link.source_note_id });
} catch {
  return {
    link,
    context: null,
    sourceTitle: null,
    sourceType: null,
    contextExpanded: true
  };
}
```

The backlink displays with null context rather than failing entirely.

### Invalid Line Numbers

If `line_number` exceeds the file length:

```typescript
if (lineNumber > 0 && lineNumber <= lines.length) {
  lines[lineNumber - 1] = currentContent;
}
```

The save operation is skipped silently to prevent corruption.

### Navigation Failures

If cursor position cannot be saved:

```typescript
try {
  await cursorManager.saveCursorPositionImmediately(...);
} catch (err) {
  console.warn('Failed to set cursor position for backlink navigation:', err);
}
// Navigation proceeds anyway
```

## Future Enhancements

### Potential Improvements

1. **Backlink Counts** - Show count in collapsed state
2. **Grouped Backlinks** - Group by note type or date
3. **Preview on Hover** - Show note preview in tooltip
4. **Multi-line Context** - Show surrounding lines for more context
5. **Backlink Graph** - Visual representation of link network
6. **Link Strength** - Track frequency of references
7. **Orphan Detection** - Find notes with no backlinks
8. **Link Validation** - Detect broken wikilinks

### Scalability Considerations

For large vaults (1000+ notes):

- Consider pagination for backlinks
- Virtual scrolling for long backlink lists
- Lazy loading of context content
- Caching of frequently accessed backlinks
- Background indexing of links

## Testing Recommendations

### Unit Tests

- Link extraction with various wikilink formats
- Line number calculation edge cases
- Context update logic with boundary conditions
- Cursor position offset calculations

### Integration Tests

- End-to-end backlink creation and display
- Note deletion cascades to links
- Concurrent edits to source and target notes
- Wikilink updates during active editing

### UI Tests

- Expand/collapse all functionality
- Context editor save behavior
- Navigation with line positioning
- Auto-refresh on wikilink changes
