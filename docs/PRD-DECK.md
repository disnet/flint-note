# PRD: Deck Feature

## Overview

The Deck feature enables users to embed dynamic, queryable note lists directly within their notes. Similar to Obsidian's Dataview plugin, this feature allows users to create live tables of notes based on filters, with interactive sorting and the ability to create new notes directly from the widget.

## Current Implementation (v6)

### Features Implemented

#### 1. Deck Block Syntax

Users can create deck widgets using fenced code blocks with the `flint-deck` language identifier:

````markdown
```flint-deck
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
````

#### 2. YAML Configuration Schema

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

#### 3. Widget Rendering

- **Live Preview**: Widget renders as an interactive table when cursor is outside the code block
- **Edit Mode**: Shows raw YAML when cursor is inside the block for editing
- **Header**: Displays deck name (click to edit) and result count
- **Table**: Shows title column (always first) plus configured metadata columns
- **Clickable Titles**: Click title to navigate to note, Shift+click for split view
- **Sortable Headers**: Click column headers to toggle sort order
- **Expand/Collapse**: Height-capped by default with toggle button; state persisted in YAML
- **Inline Note Creation**: New Note button adds editable row for inline editing (title + metadata fields)
- **Inline Row Editing**: Edit button (✎) appears on row hover; click to edit existing note inline
- **Schema-Aware Editing**: Select fields show dropdown with valid options from note type schema
- **Untitled Note Styling**: Notes without titles display as muted, italic "Untitled" (matching wikilink style)

#### 4. Query Execution (v2 - Optimized)

- **Server-side filtering**: All filtering (type and metadata) performed server-side via `queryNotesForDataview` API
- **Batch metadata fetching**: Notes and metadata fetched in a single optimized query (no N+1 problem)
- **Efficient SQL**: Uses JOINs with `note_metadata` table for metadata filtering
- **Fallback support**: Gracefully falls back to legacy client-side approach if new API unavailable

#### 5. Real-time Updates (v2)

- **Event subscription**: Widget subscribes to note events via `messageBus`
- **Monitored events**: `note.created`, `note.updated`, `note.deleted`, `note.renamed`, `note.moved`, `note.archived`, `note.unarchived`, `notes.bulkRefresh`, `file.sync-completed`
- **Smart refresh**: Only refreshes when events are relevant to the current deck
- **Debouncing**: 300ms debounce prevents excessive re-renders during rapid changes

#### 6. Integration Points

- **EditorConfig**: Extension integrated with deck handlers
- **NoteEditor**: Handles new note creation from widget
- **CodeMirror**: Uses `Decoration.replace` with custom `WidgetType` for rendering
- **MessageBus**: Real-time event subscription for live updates

### Technical Architecture

```
src/renderer/src/lib/deck/
├── types.ts                    # Type definitions + filter utilities
├── yaml-utils.ts               # YAML parsing/serialization
├── deck-theme.ts               # CodeMirror styling
├── deckExtension.svelte.ts     # CodeMirror extension
├── queryService.svelte.ts      # Query execution (uses queryNotesForDataview API)
├── DeckWidget.svelte           # UI component with real-time updates
├── FilterBuilder.svelte        # Visual filter editor (v3)
├── FilterRow.svelte            # Single filter row component (v3)
├── FieldSelector.svelte        # Field dropdown with search (v3)
├── OperatorSelector.svelte     # Operator selection dropdown (v3)
├── ValueInput.svelte           # Smart value input by type (v3)
└── index.ts                    # Public exports

src/server/database/search-manager.ts
├── queryNotesForDataview()     # Optimized server-side query with metadata
└── batchFetchMetadata()        # Batch metadata retrieval

src/server/api/flint-note-api.ts
└── queryNotesForDataview()     # API wrapper

src/main/index.ts
└── 'query-notes-for-dataview'  # IPC handler
```

### Known Limitations (v6)

1. ~~**Client-side metadata filtering**: Metadata filters are applied after fetching notes~~ ✅ Fixed in v2
2. ~~**N+1 query problem**: Each note requires a separate `getNote` call~~ ✅ Fixed in v2
3. ~~**No filter builder UI**: Users must manually write YAML~~ ✅ Fixed in v3
4. ~~**No column configuration UI**: Column selection requires YAML editing~~ ✅ Fixed in v4
5. ~~**No real-time updates**: Widget doesn't automatically refresh when notes change~~ ✅ Fixed in v2
6. ~~**No inline note creation**: New note button opens editor instead of inline editing~~ ✅ Fixed in v5
7. ~~**No inline row editing**: Cannot edit existing notes inline~~ ✅ Fixed in v6
8. ~~**No schema-aware inputs**: Select fields rendered as text instead of dropdown~~ ✅ Fixed in v6
9. **Limited to 50 results**: Default limit prevents performance issues but may hide relevant notes
10. **Metadata field sorting**: Sorting by metadata fields falls back to updated date (server-side metadata sort not yet implemented)
11. **Column width configuration**: Not yet implemented (planned)

---

## Completed Phases

### Phase 2: Enhanced Query Capabilities ✅

Implemented in v2.

#### 2.1 Server-side Metadata Filtering ✅

- Added `queryNotesForDataview` IPC endpoint with metadata filter support
- Filtering performed server-side via SQL JOINs with `note_metadata` table
- Supports all operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `IN`
- Significantly reduced data transfer between main and renderer processes

#### 2.2 Batch Note Fetching ✅

- Added `batchFetchMetadata` helper for efficient metadata retrieval
- Single query fetches all metadata for matching notes
- Eliminated N+1 query problem - notes and metadata fetched together

#### 2.3 Real-time Updates ✅

- Widget subscribes to note change events via `messageBus`
- Smart relevance checking - only refreshes when events affect current deck
- 300ms debouncing prevents excessive re-renders
- Handles: create, update, delete, rename, move, archive, unarchive, bulk refresh, file sync

### Phase 3: Filter Builder UI ✅

Implemented in v3.

#### 3.1 Visual Filter Editor ✅

- FieldSelector dropdown for field selection (shows system fields + metadata fields from type schema)
- OperatorSelector dropdown with context-aware operators based on field type
- ValueInput component with smart input types (text, number, date, boolean toggle, select dropdown)
- Multi-value tag input for IN operator
- Add/remove filter buttons
- Configure button (filter icon) in widget header to toggle filter builder

#### 3.2 Filter Suggestions ✅

- Loads note type schemas to populate available fields
- System fields always available (flint_type, flint_title, flint_created, flint_updated, flint_archived)
- Field type indicators (T=text, #=number, ?=boolean, D=date, []=array, S=select, \*=system)
- Select field options shown as suggestions
- Note type list used for flint_type autocomplete

#### 3.3 Implementation Details

**Local Editing State:**

- FilterBuilder maintains local `editingFilters` state separate from parent config
- Incomplete filters (missing field or value) are kept locally but not synced to YAML
- Only complete filters are serialized to the deck block
- Prevents widget disappearing while building filters

**Pending Filters (Deferred YAML Updates):**

- DeckWidget maintains `pendingFilters` state while filter builder is open
- Filter changes update `pendingFilters` locally and re-run queries in real-time
- YAML is only updated when filter builder is closed (prevents widget recreation during editing)
- Uses `setTimeout` to defer YAML update and avoid CodeMirror "update during update" errors

**Event Handling:**

- Value inputs use `oninput` for real-time suggestion filtering as user types
- Enter key always triggers onChange (selects first highlighted suggestion if available)
- Event propagation stopped on filter builder container to prevent cursor jumps
- Click-outside detection uses capture phase to work with stopPropagation in parent elements

**Dropdown Positioning:**

- FieldSelector and OperatorSelector use `position: fixed` with calculated coordinates
- Position calculated from button's bounding rect when dropdown opens
- Escapes parent container's `overflow: hidden` constraints
- High z-index (10000) ensures dropdowns appear above other elements

**YAML Serialization:**

- Incomplete filters filtered out during serialization
- Widget remains visible even with in-progress filter edits

**New Components:**

- `FilterBuilder.svelte` - Main filter management with local editing state
- `FilterRow.svelte` - Individual filter row with field/operator/value
- `FieldSelector.svelte` - Searchable field dropdown with keyboard navigation, fixed positioning
- `OperatorSelector.svelte` - Operator selection dropdown with fixed positioning
- `ValueInput.svelte` - Smart input based on field type (text, number, date, boolean, select, tags) with real-time suggestion filtering

### Phase 4: Column Configuration UI ✅

Implemented in v4.

#### 4.1 Visual Column Editor ✅

- ColumnBuilder component for adding/removing/reordering columns
- Drag-and-drop reordering with visual feedback
- Field selector dropdown (reuses FieldSelector from filter builder)
- Optional custom label input for column headers
- Format selector for applicable field types

#### 4.2 Type-Aware Column Rendering ✅

- ColumnCell component with smart formatting based on field type:
  - Date: relative ("2 days ago"), absolute ("Dec 15, 2024"), or ISO format
  - Number: thousands separators
  - Boolean: checkbox or Yes/No text
  - Array: pill badges or comma-separated
  - Wikilink: clickable links parsed from `[[note]]` syntax
- Format can be configured per-column in YAML

#### 4.3 Enhanced YAML Schema ✅

Backward-compatible enhanced column format:

```yaml
columns:
  - status # Simple string (still works)
  - field: priority # Enhanced format with options
    label: Priority Level
    format: pills
```

#### 4.4 New Components ✅

- `ColumnBuilder.svelte` - Main column configuration panel with drag-and-drop
- `ColumnRow.svelte` - Individual column row with field/label/format controls
- `ColumnCell.svelte` - Type-aware cell renderer with multiple format options

### Phase 5: UI Enhancements ✅

Implemented in v5.

#### 5.1 Editable Deck Name ✅

- Click deck name in header to edit inline
- Saves to YAML on blur or Enter key
- Escape cancels edit

#### 5.2 Expand/Collapse Widget ✅

- Widget has max-height by default with internal scrolling
- Toggle button in header to expand/collapse
- `expanded` state persisted in YAML config

#### 5.3 Inline Note Creation ✅

- "New Note" button creates editable row at top of table
- Title and metadata fields editable inline
- Enter saves note, Escape cancels
- Note created on save (not on click) - uses placeholder until saved
- Empty titles allowed (creates untitled note)

#### 5.4 Inline Row Editing ✅

- Edit button (✎) appears on far right of row on hover
- Clicking edit button enters inline edit mode for that row
- Same editing interface as new note creation
- Confirm (✓) saves changes, Cancel (✕) discards

#### 5.5 Schema-Aware Editing ✅

- Loads note type schema when type filter is present
- Select fields render as dropdown with valid options from schema
- Prevents invalid values for constrained fields
- Field types detected from schema (not inferred from values)

#### 5.6 Untitled Note Styling ✅

- Notes without titles display "Untitled" text
- Styled with muted color and italic (matching wikilink style in editor)
- Server returns empty string for untitled notes (UI handles display)

#### 5.7 Title-Only Navigation ✅

- Only clicking on title text navigates to note (not entire row)
- Allows interaction with other cells without accidental navigation
- Title styled as clickable link with hover effect

#### 5.8 New Components ✅

- `EditableCell.svelte` - Inline cell editor with schema-aware inputs (text, number, date, boolean, select dropdown)

---

## Next Steps

### Phase 6: Advanced Features

#### 6.1 Grouping

- Group results by field value
- Collapsible groups
- Group counts

#### 6.2 Aggregations

- Count, sum, average for numeric fields
- Display in footer row

#### 6.3 Multiple Views

- Table view (current)
- List view (compact)
- Card/gallery view
- Calendar view (for date-based queries)

#### 6.4 Saved Decks

- Save deck configurations as reusable templates
- Insert saved deck via autocomplete
- Share decks across notes

#### 6.5 Deck Chaining

- Reference other deck results
- Filter based on linked notes
- Intersection/union of multiple decks

### Phase 7: Performance Optimizations

#### 7.1 Virtual Scrolling

- Only render visible rows
- Handle large result sets efficiently

#### 7.2 Query Caching

- Cache query results with invalidation
- Share cache across identical decks

#### 7.3 Incremental Updates

- Track which notes changed
- Update only affected rows instead of full re-query

#### 7.4 Metadata Field Sorting

- Implement server-side sorting by metadata fields
- Add LEFT JOIN for sort field to enable proper ordering

---

## Success Metrics

1. **Adoption**: % of users with at least one deck block
2. **Usage**: Average deck blocks per active user
3. **Performance**: Query execution time p50/p95
4. **Satisfaction**: User feedback on feature usefulness

## Dependencies

- CodeMirror 6 widget system
- js-yaml for YAML parsing
- Existing note search and type APIs
- MessageBus for real-time event subscription

## Risks & Mitigations

| Risk                          | Impact | Mitigation                                                                  |
| ----------------------------- | ------ | --------------------------------------------------------------------------- |
| Performance with large vaults | High   | ✅ Server-side filtering implemented; pagination, virtual scrolling planned |
| YAML syntax errors            | Medium | Add validation feedback, consider GUI-only mode                             |
| Widget conflicts with editor  | Medium | Thorough testing of cursor detection and edit mode                          |
| Stale data display            | Low    | ✅ Real-time updates with debouncing implemented                            |
