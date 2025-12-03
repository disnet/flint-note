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
- `LIKE` (pattern matching with `%` wildcard)
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
├── types.ts                    # Type definitions
├── yaml-utils.ts               # YAML parsing/serialization
├── dataview-theme.ts           # CodeMirror styling
├── dataviewExtension.svelte.ts # CodeMirror extension
├── queryService.svelte.ts      # Query execution (uses queryNotesForDataview API)
├── DataviewWidget.svelte       # UI component with real-time updates
└── index.ts                    # Public exports

src/server/database/search-manager.ts
├── queryNotesForDataview()     # Optimized server-side query with metadata
└── batchFetchMetadata()        # Batch metadata retrieval

src/server/api/flint-note-api.ts
└── queryNotesForDataview()     # API wrapper

src/main/index.ts
└── 'query-notes-for-dataview'  # IPC handler
```

### Known Limitations (v2)

1. ~~**Client-side metadata filtering**: Metadata filters are applied after fetching notes~~ ✅ Fixed in v2
2. ~~**N+1 query problem**: Each note requires a separate `getNote` call~~ ✅ Fixed in v2
3. **No filter builder UI**: Users must manually write YAML
4. **No column configuration UI**: Column selection requires YAML editing
5. ~~**No real-time updates**: Widget doesn't automatically refresh when notes change~~ ✅ Fixed in v2
6. **Limited to 50 results**: Default limit prevents performance issues but may hide relevant notes
7. **Metadata field sorting**: Sorting by metadata fields falls back to updated date (server-side metadata sort not yet implemented)

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

---

## Next Steps

### Phase 3: Filter Builder UI

#### 3.1 Visual Filter Editor

- Dropdown for field selection (shows available metadata fields from type schema)
- Operator selector
- Value input with autocomplete for known values
- Add/remove filter buttons

#### 3.2 Filter Suggestions

- Analyze note type schemas to suggest filterable fields
- Show field types to guide value input
- Validate filter values against field types

### Phase 4: Column Configuration UI

#### 4.1 Column Picker

- Checkbox list of available columns
- Drag-and-drop reordering
- Column width configuration

#### 4.2 Column Types

- Support different renderers per column type:
  - Date: formatted dates with relative time option
  - Number: numeric formatting
  - Boolean: checkboxes
  - List: comma-separated or pill display
  - Link: clickable wikilinks

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

| Risk                          | Impact | Mitigation                                                     |
| ----------------------------- | ------ | -------------------------------------------------------------- |
| Performance with large vaults | High   | ✅ Server-side filtering implemented; pagination, virtual scrolling planned |
| YAML syntax errors            | Medium | Add validation feedback, consider GUI-only mode                |
| Widget conflicts with editor  | Medium | Thorough testing of cursor detection and edit mode             |
| Stale data display            | Low    | ✅ Real-time updates with debouncing implemented               |
