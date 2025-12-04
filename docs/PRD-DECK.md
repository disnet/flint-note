# PRD: Deck Feature

## Overview

The Deck feature enables users to create dynamic, queryable note lists. Decks can exist as **standalone deck notes** (opened full-screen like PDFs/EPUBs) or be **embedded within other notes**. Similar to Obsidian's Dataview plugin, decks allow users to create live tables of notes based on filters, with interactive sorting and the ability to create new notes directly from the widget.

## Current Implementation (v7)

### Features Implemented

#### 1. Standalone Deck Notes

Decks are now first-class note types with `flint_kind: 'deck'`. Creating a deck note:

- **Menu**: File → New Deck (`Cmd/Ctrl+Shift+D`)
- **Sidebar**: WorkspaceBar dropdown → New Deck button

When opened, deck notes display the DeckWidget as the main content area (no markdown editor), similar to how PDFs and EPUBs are rendered.

**Deck Note Content (YAML Configuration):**

```yaml
name: My Projects
filters:
  - field: flint_type
    value: project
sort:
  field: flint_updated
  order: desc
columns:
  - status
  - priority
limit: 50
```

#### 2. Embedded Decks

Other notes can embed existing deck notes using the embed syntax:

````markdown
```flint-deck
n-abc123xyz
```
````

Where `n-abc123xyz` is the ID of a deck note. The embedded deck:

- Displays the same interactive DeckWidget
- Is fully interactive (edit filters, create notes, etc.)
- Saves config changes back to the source deck note
- Shows loading state while fetching deck configuration
- Shows error if deck note not found or invalid

**Deprecated Syntax:**

The old inline YAML configuration syntax is deprecated:

````markdown
```flint-deck
name: My Deck
filters:
  - field: flint_type
    value: task
```
````

This now displays an error widget prompting users to create a standalone deck note and embed it instead.

#### 3. YAML Configuration Schema

| Field                | Type         | Required | Description                                              |
| -------------------- | ------------ | -------- | -------------------------------------------------------- |
| `name`               | string       | No       | Display name for the deck (shown in header)              |
| `filters`            | array        | No       | Array of filter conditions                               |
| `filters[].field`    | string       | Yes      | Field to filter on (e.g., `flint_type`, metadata fields) |
| `filters[].operator` | string       | No       | Comparison operator (default: `=`)                       |
| `filters[].value`    | string/array | Yes      | Value(s) to match                                        |
| `sort`               | object       | No       | Sort configuration                                       |
| `sort.field`         | string       | Yes      | Field to sort by                                         |
| `sort.order`         | string       | No       | `asc` or `desc` (default: `desc`)                        |
| `columns`            | array        | No       | Metadata fields to display as columns                    |
| `limit`              | number       | No       | Maximum results (default: 50)                            |
| `expanded`           | boolean      | No       | Whether widget is fully expanded (default: false)        |

**Supported Filter Operators:**

- `=` (equals, default)
- `!=` (not equals)
- `>`, `<`, `>=`, `<=` (comparison)
- `LIKE` (pattern matching, automatically wraps value with `%` for "contains" matching unless user includes their own wildcards)
- `IN` (matches any value in list)

#### 4. Widget Rendering

- **Standalone View**: Full-height DeckWidget with standard note header (title, action bar)
- **Embedded View**: Widget renders inline when cursor is outside the code block
- **Edit Mode**: Shows raw embed syntax (`n-<id>`) when cursor is inside the block
- **Header**: Displays deck name (click to edit) and result count
- **Table**: Shows title column (always first) plus configured metadata columns
- **Clickable Titles**: Click title to navigate to note
- **Sortable Headers**: Click column headers to toggle sort order
- **Expand/Collapse**: Height-capped by default with toggle button; state persisted in YAML
- **Inline Note Creation**: New Note button adds editable row for inline editing
- **Inline Row Editing**: Edit button (✎) appears on row hover
- **Schema-Aware Editing**: Select fields show dropdown with valid options from note type schema
- **Untitled Note Styling**: Notes without titles display as muted, italic "Untitled"

#### 5. Query Execution

- **Server-side filtering**: All filtering performed server-side via `queryNotesForDataview` API
- **Batch metadata fetching**: Notes and metadata fetched in a single optimized query
- **Efficient SQL**: Uses JOINs with `note_metadata` table for metadata filtering
- **Fallback support**: Gracefully falls back to legacy client-side approach if new API unavailable

#### 6. Real-time Updates

- **Event subscription**: Widget subscribes to note events via `messageBus`
- **Monitored events**: `note.created`, `note.updated`, `note.deleted`, `note.renamed`, `note.moved`, `note.archived`, `note.unarchived`, `notes.bulkRefresh`, `file.sync-completed`
- **Smart refresh**: Only refreshes when events are relevant to the current deck
- **Debouncing**: 300ms debounce prevents excessive re-renders during rapid changes

#### 7. Integration Points

- **ViewRegistry**: `DeckNoteView` registered for `flint_kind: 'deck'`
- **EditorConfig**: Extension integrated with deck handlers for embeds
- **Menu System**: "New Deck" in File menu and WorkspaceBar dropdown
- **NoteNavigationService**: Navigation from deck items via wikilink service
- **MessageBus**: Real-time event subscription for live updates

### Technical Architecture

```
src/renderer/src/lib/deck/
├── types.ts                    # Type definitions + filter utilities
├── yaml-utils.ts               # YAML parsing/serialization
├── deck-theme.ts               # CodeMirror styling (incl. embed & error styles)
├── deckExtension.svelte.ts     # CodeMirror extension (embed + deprecated error)
├── queryService.svelte.ts      # Query execution
├── DeckWidget.svelte           # Main UI component
├── DeckToolbar.svelte          # Toolbar with filters/columns/sort
├── NoteListItem.svelte         # Individual note row
├── FilterBuilder.svelte        # Visual filter editor
├── FilterRow.svelte            # Single filter row
├── FieldSelector.svelte        # Field dropdown
├── OperatorSelector.svelte     # Operator dropdown
├── ValueInput.svelte           # Smart value input
├── PropPickerDialog.svelte     # Column/prop picker
├── PropFilterPopup.svelte      # Filter popup editor
└── index.ts                    # Public exports

src/renderer/src/lib/views/
├── DeckNoteView.svelte         # Standalone deck note view
├── ViewRegistry.ts             # View registration (includes 'deck' kind)
└── index.ts                    # View registrations

src/server/core/
└── system-fields.ts            # NoteKind type includes 'deck'

src/shared/
└── menu-definitions.ts         # "New Deck" menu item

src/main/
├── menu.ts                     # Native menu "New Deck" handler
└── index.ts                    # IPC handlers

src/renderer/src/
├── App.svelte                  # handleCreateDeck(), menu action handler
└── components/
    ├── LeftSidebar.svelte      # onCreateDeck prop
    ├── WorkspaceBar.svelte     # onCreateDeck prop
    └── WorkspacePopover.svelte # "New Deck" button

src/server/database/search-manager.ts
├── queryNotesForDataview()     # Optimized server-side query
└── batchFetchMetadata()        # Batch metadata retrieval

src/server/api/flint-note-api.ts
└── queryNotesForDataview()     # API wrapper
```

### Known Limitations (v7)

1. **Limited to 50 results**: Default limit prevents performance issues but may hide relevant notes
2. **Metadata field sorting**: Sorting by metadata fields falls back to updated date
3. **Column width configuration**: Not yet implemented
4. **No deck templates**: Cannot save/reuse deck configurations across notes

---

## Version History

### v7: Standalone Deck Notes

- **Deck as note type**: Decks are now `flint_kind: 'deck'` notes
- **DeckNoteView**: Full-screen deck view (like PDF/EPUB)
- **Embed syntax**: `n-<note-id>` for embedding decks in other notes
- **Menu integration**: "New Deck" in File menu (`Cmd/Ctrl+Shift+D`)
- **Sidebar integration**: "New Deck" button in WorkspaceBar dropdown
- **Deprecated inline YAML**: Shows error widget for old syntax
- **Embedded config persistence**: Changes to embedded decks save to source note

### v6: Inline Row Editing

- Edit button (✎) on row hover
- Same editing interface as new note creation
- Schema-aware inputs for select fields

### v5: UI Enhancements

- Editable deck name in header
- Expand/collapse toggle with YAML persistence
- Inline note creation with placeholder rows
- Untitled note styling (muted, italic)
- Title-only navigation (not entire row)

### v4: Column Configuration UI

- ColumnBuilder for visual column management
- Drag-and-drop column reordering
- Type-aware cell rendering (dates, numbers, booleans, arrays, wikilinks)
- Custom column labels and format options

### v3: Filter Builder UI

- Visual filter editor with field/operator/value selectors
- Schema-aware field suggestions
- Local editing state (incomplete filters not synced)
- Pending filters for deferred YAML updates

### v2: Enhanced Query Capabilities

- Server-side metadata filtering via SQL JOINs
- Batch note fetching (eliminated N+1 problem)
- Real-time updates via messageBus subscription
- Smart relevance checking and debouncing

### v1: Initial Implementation

- Basic YAML-configured deck blocks
- Client-side filtering
- CodeMirror widget rendering

---

## Next Steps

### Phase 8: Advanced Features

#### 8.1 Grouping

- Group results by field value
- Collapsible groups
- Group counts

#### 8.2 Aggregations

- Count, sum, average for numeric fields
- Display in footer row

#### 8.3 Multiple Views

- Table view (current)
- List view (compact)
- Card/gallery view
- Calendar view (for date-based queries)

#### 8.4 Deck Templates

- Save deck configurations as reusable templates
- Quick-insert via command palette
- Template library management

#### 8.5 Deck Chaining

- Reference other deck results
- Filter based on linked notes
- Intersection/union of multiple decks

### Phase 9: Performance Optimizations

#### 9.1 Virtual Scrolling

- Only render visible rows
- Handle large result sets efficiently

#### 9.2 Query Caching

- Cache query results with invalidation
- Share cache across identical decks

#### 9.3 Incremental Updates

- Track which notes changed
- Update only affected rows instead of full re-query

#### 9.4 Metadata Field Sorting

- Implement server-side sorting by metadata fields
- Add LEFT JOIN for sort field to enable proper ordering

---

## Success Metrics

1. **Adoption**: % of users with at least one deck note
2. **Usage**: Average deck notes per active user
3. **Embedding**: % of decks that are embedded in other notes
4. **Performance**: Query execution time p50/p95
5. **Satisfaction**: User feedback on feature usefulness

## Dependencies

- CodeMirror 6 widget system
- js-yaml for YAML parsing
- Existing note search and type APIs
- MessageBus for real-time event subscription
- ViewRegistry for custom note kind rendering

## Risks & Mitigations

| Risk                          | Impact | Mitigation                                                                  |
| ----------------------------- | ------ | --------------------------------------------------------------------------- |
| Performance with large vaults | High   | ✅ Server-side filtering; pagination, virtual scrolling planned             |
| YAML syntax errors            | Medium | GUI-based editing; validation feedback                                      |
| Widget conflicts with editor  | Medium | Embed syntax isolates deck reference from complex YAML                      |
| Stale embedded data           | Low    | ✅ Real-time updates; embedded decks fetch live config                      |
| Migration from inline YAML    | Low    | Clear deprecation error with guidance to create standalone decks            |
