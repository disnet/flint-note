# PRD: Dataview Feature

## Overview

The Dataview feature enables users to embed dynamic, queryable note lists directly within their notes. Similar to Obsidian's Dataview plugin, this feature allows users to create live tables of notes based on filters, with interactive sorting and the ability to create new notes directly from the widget.

## Current Implementation (v2)

### Features Implemented

#### 1. Query Block Syntax

Users can create dataview widgets using fenced code blocks with the `flint-query` language identifier:

````markdown
```flint-query
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
| `name`               | string       | No       | Display name for the query (shown in header)             |
| `filters`            | array        | No       | Array of filter conditions                               |
| `filters[].field`    | string       | Yes      | Field to filter on (e.g., `flint_type`, metadata fields) |
| `filters[].operator` | string       | No       | Comparison operator (default: `=`)                       |
| `filters[].value`    | string/array | Yes      | Value(s) to match                                        |
| `sort`               | object       | No       | Sort configuration                                       |
| `sort.field`         | string       | Yes      | Field to sort by                                         |
| `sort.order`         | string       | No       | `asc` or `desc` (default: `desc`)                        |
| `columns`            | array        | No       | Metadata fields to display as columns                    |
| `limit`              | number       | No       | Maximum results (default: 50)                            |

**Supported Filter Operators:**

- `=` (equals, default)
- `!=` (not equals)
- `>`, `<`, `>=`, `<=` (comparison)
- `LIKE` (pattern matching, automatically wraps value with `%` for "contains" matching unless user includes their own wildcards)
- `IN` (matches any value in list)

#### 3. Widget Rendering

- **Live Preview**: Widget renders as an interactive table when cursor is outside the code block
- **Edit Mode**: Shows raw YAML when cursor is inside the block for editing
- **Header**: Displays query name and result count
- **Table**: Shows title column (always first) plus configured metadata columns
- **Clickable Rows**: Click to navigate to note, Shift+click for split view
- **Sortable Headers**: Click column headers to toggle sort order
- **New Note Button**: Creates a new note with the filtered type

#### 4. Query Execution (v2 - Optimized)

- **Server-side filtering**: All filtering (type and metadata) performed server-side via `queryNotesForDataview` API
- **Batch metadata fetching**: Notes and metadata fetched in a single optimized query (no N+1 problem)
- **Efficient SQL**: Uses JOINs with `note_metadata` table for metadata filtering
- **Fallback support**: Gracefully falls back to legacy client-side approach if new API unavailable

#### 5. Real-time Updates (v2)

- **Event subscription**: Widget subscribes to note events via `messageBus`
- **Monitored events**: `note.created`, `note.updated`, `note.deleted`, `note.renamed`, `note.moved`, `note.archived`, `note.unarchived`, `notes.bulkRefresh`, `file.sync-completed`
- **Smart refresh**: Only refreshes when events are relevant to the current query
- **Debouncing**: 300ms debounce prevents excessive re-renders during rapid changes

#### 6. Integration Points

- **EditorConfig**: Extension integrated with dataview handlers
- **NoteEditor**: Handles new note creation from widget
- **CodeMirror**: Uses `Decoration.replace` with custom `WidgetType` for rendering
- **MessageBus**: Real-time event subscription for live updates

### Technical Architecture

```
src/renderer/src/lib/dataview/
├── types.ts                    # Type definitions + filter utilities
├── yaml-utils.ts               # YAML parsing/serialization
├── dataview-theme.ts           # CodeMirror styling
├── dataviewExtension.svelte.ts # CodeMirror extension
├── queryService.svelte.ts      # Query execution (uses queryNotesForDataview API)
├── DataviewWidget.svelte       # UI component with real-time updates
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

### Known Limitations (v4)

1. ~~**Client-side metadata filtering**: Metadata filters are applied after fetching notes~~ ✅ Fixed in v2
2. ~~**N+1 query problem**: Each note requires a separate `getNote` call~~ ✅ Fixed in v2
3. ~~**No filter builder UI**: Users must manually write YAML~~ ✅ Fixed in v3
4. ~~**No column configuration UI**: Column selection requires YAML editing~~ ✅ Fixed in v4
5. ~~**No real-time updates**: Widget doesn't automatically refresh when notes change~~ ✅ Fixed in v2
6. **Limited to 50 results**: Default limit prevents performance issues but may hide relevant notes
7. **Metadata field sorting**: Sorting by metadata fields falls back to updated date (server-side metadata sort not yet implemented)
8. **Column width configuration**: Not yet implemented (planned)

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
- Smart relevance checking - only refreshes when events affect current query
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
- Only complete filters are serialized to the query block
- Prevents widget disappearing while building filters

**Pending Filters (Deferred YAML Updates):**

- DataviewWidget maintains `pendingFilters` state while filter builder is open
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

---

## Next Steps

### Phase 5: Advanced Features

#### 5.1 Grouping

- Group results by field value
- Collapsible groups
- Group counts

#### 5.2 Aggregations

- Count, sum, average for numeric fields
- Display in footer row

#### 5.3 Multiple Views

- Table view (current)
- List view (compact)
- Card/gallery view
- Calendar view (for date-based queries)

#### 5.4 Saved Queries

- Save query configurations as reusable templates
- Insert saved query via autocomplete
- Share queries across notes

#### 5.5 Query Chaining

- Reference other dataview results
- Filter based on linked notes
- Intersection/union of multiple queries

### Phase 6: Performance Optimizations

#### 6.1 Virtual Scrolling

- Only render visible rows
- Handle large result sets efficiently

#### 6.2 Query Caching

- Cache query results with invalidation
- Share cache across identical queries

#### 6.3 Incremental Updates

- Track which notes changed
- Update only affected rows instead of full re-query

#### 6.4 Metadata Field Sorting

- Implement server-side sorting by metadata fields
- Add LEFT JOIN for sort field to enable proper ordering

---

## Success Metrics

1. **Adoption**: % of users with at least one dataview block
2. **Usage**: Average dataview blocks per active user
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
