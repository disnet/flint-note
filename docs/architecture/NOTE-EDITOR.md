# Note Editor Architecture

## Overview

The Flint UI note editor is a sophisticated text editing component built on top of **CodeMirror 6**, providing a rich markdown editing experience with features like wikilink support, intelligent autocomplete, custom list styling, and automatic scrolling.

## Core Technologies

### CodeMirror 6 Foundation

The editor is built on [CodeMirror 6](https://codemirror.net/), a modern, extensible code editor framework. CodeMirror provides:

- **Modular architecture**: Extensions system for custom functionality
- **State management**: Immutable state with transactions
- **View plugins**: For custom decorations and UI enhancements
- **Performance**: Efficient rendering and updates for large documents
- **Accessibility**: Built-in keyboard navigation and screen reader support

### Markdown Language Support

The editor uses CodeMirror's `@codemirror/lang-markdown` extension to provide:

- Syntax highlighting for markdown elements
- Syntax tree parsing for context-aware features
- Code block detection (used to prevent wikilinks inside code contexts)

## Component Architecture

### Component Hierarchy

```
CodeMirrorEditor.svelte (wrapper component)
  └── EditorConfig (configuration and extensions)
      ├── CodeMirror base extensions
      ├── Markdown language support
      ├── Wikilinks extension
      ├── List styling extension
      └── Auto-scroll service
```

### Key Components

#### 1. CodeMirrorEditor.svelte (`src/renderer/src/components/CodeMirrorEditor.svelte`)

The main Svelte component that wraps CodeMirror functionality:

- **Props**:
  - `content`: Current document content
  - `onContentChange`: Callback for content updates
  - `onCursorChange`: Callback for cursor position changes
  - `onWikilinkClick`: Handler for wikilink clicks
  - `cursorPosition`: External cursor position state
  - `placeholder`: Placeholder text
  - `variant`: Editor variant (`default` or `daily-note`)

- **Key features**:
  - Creates and manages `EditorView` instance
  - Handles cursor position restoration
  - Provides public API (`focus()`, `refreshWikilinks()`, `getContent()`, etc.)
  - Integrates auto-scroll service
  - Measures and updates marker widths for list styling

#### 2. EditorConfig (`src/renderer/src/stores/editorConfig.svelte.ts`)

Configuration class that assembles CodeMirror extensions:

- **Base extensions**:
  - Minimal setup (line numbers, search, etc.)
  - History (undo/redo)
  - Keyboard shortcuts
  - Line wrapping
  - Spell checking

- **Theme management**:
  - GitHub Light/Dark themes based on system preference
  - Custom theme overrides for editor styling
  - Variant-specific themes (default vs. daily-note)
  - Responsive dark mode using media queries

- **Content change detection**:
  - Update listeners for content and cursor changes
  - Debounced callbacks to parent components

## Wikilinks Feature

### Overview

Wikilinks provide bi-directional linking between notes using the syntax `[[Note Title]]` or `[[identifier|display title]]`.

### Implementation (`src/renderer/src/lib/wikilinks.svelte.ts`)

#### Parsing

The `parseWikilinks()` function:

- Uses regex `/\[\[([^[\]]+)\]\]/g` to match wikilink syntax
- Supports two formats:
  - `[[title]]`: Simple format using title as both identifier and display text
  - `[[identifier|title]]`: Advanced format with separate identifier and display text
- Validates wikilinks against available notes from `notesStore`
- Marks links as "exists" (valid) or "broken" (missing target note)

#### Note Resolution

The `findNoteByIdentifier()` function attempts to match identifiers in priority order:

1. **Note ID** (exact match, case-insensitive)
2. **Title** (case-insensitive)
3. **Filename** (without `.md` extension, case-insensitive)

This flexible matching allows users to reference notes in multiple ways.

#### Visual Rendering

**WikilinkWidget Class**:

- Extends CodeMirror's `WidgetType` to create custom inline elements
- Renders wikilinks as styled clickable buttons
- Shows only the display title (not the full `[[...]]` syntax)
- Different styling for existing vs. broken links:
  - **Existing links**: Button-like appearance with white background
  - **Broken links**: Red-tinted styling indicating missing target
- Hover effects with subtle animations (translate, shadow)
- Dark mode support via CSS media queries

**State Field Management**:

- `wikilinkField`: StateField that manages decoration lifecycle
- Recreates decorations on document changes
- Force update effect for external triggers (e.g., notes store updates)
- Skips wikilinks inside code contexts (inline code, code blocks)

**Styling** (`src/renderer/src/lib/wikilink-theme.ts`):

```typescript
// Light mode - existing links
background: rgba(255, 255, 255, 0.9)
color: #1a1a1a

// Light mode - broken links
background: rgba(255, 255, 255, 0.8)
color: #d73a49

// Dark mode - existing links
background: rgba(255, 255, 255, 0.15)
color: #ffffff

// Dark mode - broken links
background: rgba(255, 255, 255, 0.12)
color: #f85149
```

#### Cursor Behavior

Wikilinks are treated as **atomic ranges** using `EditorView.atomicRanges`:

- Cursor jumps over the entire wikilink widget
- Cannot position cursor inside a wikilink
- Arrow keys navigate around wikilinks as single units

#### Click Handling

Click events on wikilink widgets:

- **Existing links**: Navigate to the target note using `noteId`
- **Broken links**: Trigger note creation with `shouldCreate=true` flag
- Events propagate through `onWikilinkClick` callback prop
- Handled by `wikilinkService` in application layer

#### Hover-to-Edit Popover

**WikilinkPopover Component** (`src/renderer/src/components/WikilinkPopover.svelte`):

Allows users to edit the display text of wikilinks without manually editing the raw syntax:

- **Trigger**: Appears after 300ms hover delay over a wikilink widget
- **Dismissal**:
  - Closes 200ms after mouse leaves if mouse doesn't enter popover
  - Allows mouse movement from link to popover without closing
  - Escape key closes popover (with event propagation stopped)
- **UI Elements**:
  - Identifier shown as label (displays which note is being linked)
  - Editable input field for display text
  - Auto-focuses and selects text when opened
- **Keyboard shortcuts**:
  - `Escape`: Close popover (only when popover is visible)
- **Editing behavior**:
  - Live editing: Updates wikilink on every keystroke
  - Updates wikilink text from `[[identifier|old-title]]` to `[[identifier|new-title]]`
  - Preserves the identifier (target note reference)
  - Only modifies the display portion
  - Maintains focus and popover visibility during edits
  - Dynamically tracks position as text length changes
- **Styling**: Full dark mode support with consistent theming

**Hover State Management** (`src/renderer/src/components/CodeMirrorEditor.svelte`):

- Hover handler passed through EditorConfig to wikilinks extension
- Tracks hover position and popover visibility
- Manages enter/leave timeouts for smooth UX
- Coordinates between widget events and popover mouse events
- Updates popover position tracking during live edits to handle text length changes
- Keeps popover open and focused during editing

**Integration Points**:

- `WikilinkWidget` emits hover events with position and metadata
- `WikilinkHoverHandler` interface defines hover callback signature
- Hover handler stored in CodeMirror state field alongside click handler
- Popover positioned using `EditorView.coordsAtPos()` for accurate placement

### Autocomplete Integration

#### CodeMirror Autocomplete

**wikilinkCompletion()** function (`src/renderer/src/lib/wikilinks.svelte.ts:136-216`):

- Triggers when user types `[[`
- Matches pattern `/\[\[([^\]]*)/` to capture query text
- Returns `CompletionResult` with filtered note suggestions

**Filtering and Ranking**:

1. Filters notes by query matching title, filename, or ID
2. Ranks results by relevance:
   - Exact title match (highest)
   - Exact ID match
   - Title starts with query
   - ID starts with query
   - Alphabetical for same relevance
3. Limits to 10 results

**Completion Options**:

- Each option shows: `label` (note title), `info` (ID and type)
- Apply text uses format: `identifier|title]]`
- Special "Create new note" option if no exact title match

**Keyboard Navigation**:

- Custom keybindings for autocomplete:
  - `Ctrl-n`: Next option
  - `Ctrl-p`: Previous option
  - `Enter`: Select option
  - `Escape`: Cancel

#### Standalone Autocomplete Component

**WikilinkAutocomplete.svelte** (`src/renderer/src/components/WikilinkAutocomplete.svelte`):

- Used in contexts outside CodeMirror (e.g., message input)
- Svelte-based autocomplete UI
- Same filtering/ranking logic as CodeMirror version
- Position-aware rendering
- Mouse and keyboard interaction support

### System Integration

#### Notes Store Reactivity

The editor watches for changes in `notesStore` to update wikilinks:

```typescript
// In NoteEditor.svelte (lines 68-82)
$effect(() => {
  const notes = notesStore.notes;
  const loading = notesStore.loading;

  if (editorRef && !loading && notes.length >= 0) {
    setTimeout(() => {
      editorRef.refreshWikilinks();
    }, 50);
  }
});
```

When notes are added, removed, or renamed:

1. `notesStore` updates its internal state
2. Effect triggers in parent component
3. `refreshWikilinks()` called on editor
4. `forceWikilinkRefresh()` dispatches update effect
5. All wikilink decorations re-evaluate against new note list

#### Wikilink Service

**wikilinkService** (`src/renderer/src/services/wikilinkService.svelte.ts`):

- Centralized handler for wikilink clicks across the application
- Manages navigation to existing notes
- Handles new note creation flow
- Coordinates with notes store and temporary tabs

## Custom List Styling

### Purpose

Provides consistent, visually aligned markdown list rendering with proper indentation that works across different font sizes and nesting levels.

### Implementation

#### List Parser (`src/renderer/src/lib/markdownListParser.ts`)

Analyzes each line to detect:

- Unordered markers: `-`, `*`, `+`
- Ordered markers: `1.`, `2.`, etc.
- Nesting level based on leading whitespace
- Checkbox states (if task lists are present)

#### Styling Plugin (`src/renderer/src/lib/markdownListStyling.ts`)

**ListStylePlugin** ViewPlugin:

- Runs on every document update
- Decorates list marker lines with dynamic inline styles
- Calculates padding and text-indent using CSS `calc()` and custom properties

**Dynamic Style Calculation**:

```typescript
// For nested lists (level > 0)
paddingLeft: calc(var(--cm-line-padding) + (var(--list-base-indent) * level) + var(--list-marker-width))
textIndent: calc((var(--list-base-indent) * -level) - var(--list-marker-width))

// For top-level lists (level = 0)
paddingLeft: calc(var(--cm-line-padding) + var(--list-marker-width))
textIndent: calc(-1 * var(--list-marker-width))
```

#### Text Measurement (`src/renderer/src/lib/textMeasurement.ts`)

**measureMarkerWidths()** function:

- Creates invisible DOM element matching editor styles
- Measures pixel width of different markers:
  - Unordered: `- `, `* `, `+ `
  - Ordered: `1. `, `10. `, `100. ` (different digit counts)
  - Base indent: `  ` (two spaces)
- Measures CodeMirror's actual line padding
- Updates CSS custom properties on document root

**Measured values**:

- `--list-marker-dash-width`
- `--list-marker-star-width`
- `--list-marker-plus-width`
- `--list-marker-num1-width`
- `--list-marker-num2-width`
- `--list-marker-num3-width`
- `--list-base-indent`
- `--cm-line-padding`

**Timing**:

- Measured after editor creation
- Re-measured when editor configuration changes
- Uses 10ms timeout to ensure DOM is ready

### Visual Result

Lists render with:

- Pixel-perfect alignment of marker characters
- Proper indentation at all nesting levels
- Content alignment that respects marker width
- Consistent appearance across font sizes
- Wikilinks inside lists maintain proper positioning

## Auto-Scroll Service

### Purpose

Automatically scrolls the editor viewport to keep the cursor visible as the user types or navigates, with configurable margins and behavior.

### Implementation (`src/renderer/src/stores/scrollAutoService.svelte.ts`)

#### Configuration

Two variants with different behaviors:

**Default variant** (regular note editor):

```typescript
{
  enabled: true,
  bottomMargin: 150,
  topMargin: 75,
  smoothScroll: false,
  debounceMs: 50
}
```

**Daily-note variant** (daily note editor):

```typescript
{
  enabled: true,
  bottomMargin: 100,
  topMargin: 50,
  smoothScroll: true,
  debounceMs: 30
}
```

#### Scroll Detection

**Selection Monitoring**:

- Polls cursor position every 100ms when editor has focus
- Compares current selection range to previous
- Triggers debounced scroll check on changes

**Coordinate Calculation**:

- Uses `editorView.coordsAtPos(cursorPos)` to get cursor coordinates
- Calculates position relative to scroll container
- Checks if cursor is within margin zones

#### Scroll Behavior

**Margin zones**:

- **Top margin**: Scrolls up if cursor is within `topMargin` pixels of top edge
- **Bottom margin**: Scrolls down if cursor is within `bottomMargin` pixels of bottom edge
- **Safe zone**: No scrolling if cursor is between margins

**Scroll calculation**:

```typescript
// Top margin violation
scrollTarget = scrollTop - (topMargin - relativeTop);

// Bottom margin violation
scrollTarget = scrollTop + (relativeBottom - bottomThreshold);
```

**Smooth scrolling**:

- Daily-note variant uses `behavior: 'smooth'`
- Default variant uses instant scrolling

#### Container Discovery

**setupAutoScrollWithSearch()** method:

- Automatically finds scroll container by traversing DOM parents
- Looks for elements with `overflow: auto` or `overflowY: auto`
- Falls back gracefully if no container found

### Integration

The auto-scroll service is:

- Created in `CodeMirrorEditor` component
- Configured based on `variant` prop
- Set up after `EditorView` is created
- Cleaned up when component unmounts

## Cursor Position Management

### Persistence

**CursorPositionManager** (`src/renderer/src/stores/cursorPositionManager.svelte.ts`):

- Saves cursor position and selection range per note
- Uses debounced saves (500ms) for frequent cursor movements
- Stores in IPC-backed persistent storage
- Provides immediate save for note switching

### Restoration

When loading a note:

1. Fetch cursor position from storage
2. Set as `pendingCursorPosition` state
3. Apply during next content update
4. Clamp position to valid document range
5. Restore selection range if present

### Format

```typescript
interface CursorPosition {
  noteId: string;
  position: number; // Cursor position
  selectionStart?: number; // Selection start (if text selected)
  selectionEnd?: number; // Selection end (if text selected)
}
```

## Editor Variants

### Default Variant

Used in main note editor (`NoteEditor.svelte`):

- Large bottom margin (25vh) for comfortable editing
- No smooth scrolling (instant cursor tracking)
- Larger auto-scroll margins
- Standard scrollbar styling

### Daily-Note Variant

Used in daily note editor (`DailyNoteEditor.svelte`):

- No bottom margin (compact layout)
- Smooth scrolling enabled
- Smaller auto-scroll margins
- Lighter border radius
- More compact padding

## Theme Support

### Color Schemes

**Light mode**:

- GitHub Light theme from `@fsegurai/codemirror-theme-github-light`
- Light scrollbar: `rgba(0, 0, 0, 0.2)`

**Dark mode**:

- GitHub Dark theme from `@fsegurai/codemirror-theme-github-dark`
- Dark scrollbar: `rgba(255, 255, 255, 0.2)`

### Automatic Switching

Theme detection uses `window.matchMedia('(prefers-color-scheme: dark)')`:

- Listens for system theme changes
- Updates editor theme reactively
- Applies variant-specific theme overrides

### Font Configuration

All editor text uses consistent font stack:

```css
font-family:
  'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
```

Applied to:

- Editor content (`.cm-content`)
- Editor lines (`.cm-line`)
- Autocomplete tooltips (`.cm-tooltip-autocomplete`)
- Completion labels

## Extension System

### Extension Order

Extensions are applied in specific order for correct behavior:

1. **Minimal setup**: Line numbers, basic editing
2. **Drop cursor**: Visual cursor during drag
3. **Indent on input**: Auto-indent
4. **History**: Undo/redo
5. **Keymaps**: Keyboard shortcuts
6. **Search**: Find/replace
7. **Markdown**: Language support
8. **Line wrapping**: Soft wrap
9. **Theme**: Color scheme
10. **Base theme**: Custom styling
11. **Variant theme**: Variant-specific styling
12. **List styling**: Custom list rendering
13. **Wikilinks**: Link parsing and rendering
14. **Spell check**: Native browser spell checking
15. **Update listeners**: Content/cursor change callbacks

### Custom Extensions

#### Wikilinks Extension

**wikilinksExtension()**: Complete wikilink support with autocomplete
**wikilinksWithoutAutocomplete()**: Wikilink rendering only (for combining with other autocomplete sources)

Both provide:

- Wikilink theme
- Click handler field
- Decoration field
- Atomic ranges
- Update listeners

#### List Styling Extension

**markdownListStyling**: ViewPlugin for list decoration
**listStylingTheme**: Theme with base styles and wikilink fixes

## Performance Considerations

### Efficient Updates

- **Decorations map**: Changes are mapped instead of recreated when possible
- **Force updates**: Only triggered when notes store changes
- **Debounced saves**: Cursor position saves are debounced to reduce IPC calls
- **Viewport-based**: Some plugins only process visible content

### Code Context Detection

Wikilinks check if they're inside code using syntax tree:

```typescript
function isInCodeContext(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  // Check for InlineCode, FencedCode, CodeBlock, CodeText nodes
}
```

This prevents wikilink decoration inside code blocks and inline code.

### Measurement Caching

List marker widths:

- Measured once on editor creation
- Re-measured on configuration changes
- Stored as CSS custom properties
- Shared across all list lines

## Integration Points

### Parent Components

**NoteEditor.svelte**:

- Manages note loading and saving
- Handles title changes and metadata
- Coordinates cursor position persistence
- Watches for note store updates

**DailyNoteEditor.svelte**:

- Similar to NoteEditor but for daily notes
- Uses `variant="daily-note"`
- Different layout constraints

### Services

**noteStore**: Provides list of all notes for wikilink resolution
**wikilinkService**: Handles wikilink navigation and creation
**chatService**: Backend communication for note CRUD operations
**pinnedStore**: Tracks pinned notes
**temporaryTabsStore**: Manages temporary note tabs

### IPC Communication

All server communication uses `$state.snapshot()` before IPC calls:

```typescript
await window.api?.saveData($state.snapshot(this.reactiveState));
```

This prevents Svelte reactivity metadata from breaking structured cloning.

## Public API

### CodeMirrorEditor Component

**Methods**:

- `focus()`: Focus the editor
- `focusAtEnd()`: Focus and move cursor to end
- `refreshWikilinks()`: Force wikilink re-rendering
- `getCurrentCursorPosition()`: Get cursor position and selection
- `getContent()`: Get current document content
- `setContent(newContent)`: Replace all content
- `setAutoScrollEnabled(enabled)`: Enable/disable auto-scroll
- `updateAutoScrollConfig(config)`: Update auto-scroll settings

**Events**:

- `onContentChange(content)`: Document changed
- `onCursorChange()`: Cursor moved or selection changed
- `onWikilinkClick(noteId, title, shouldCreate)`: Wikilink clicked

## Future Enhancements

Potential improvements for the editor:

1. **Performance**: Lazy decoration for large documents
2. **Backlinks**: Show backlinks panel for current note
3. **Link preview**: Hover preview of linked note content
4. **Image support**: Inline image rendering
5. **Table editing**: Visual table editor
6. **Collaboration**: Real-time collaborative editing
7. **Templates**: Template expansion and snippets
8. **Custom themes**: User-configurable color schemes
