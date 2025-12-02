# PRD: Dataview Feature

## Overview

The Dataview feature enables users to embed dynamic, queryable note lists directly within their notes. Similar to Obsidian's Dataview plugin, this feature allows users to create live tables of notes based on filters, with interactive sorting and the ability to create new notes directly from the widget.

## Current Implementation (v1)

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Display name for the query (shown in header) |
| `filters` | array | No | Array of filter conditions |
| `filters[].field` | string | Yes | Field to filter on (e.g., `flint_type`, metadata fields) |
| `filters[].operator` | string | No | Comparison operator (default: `=`) |
| `filters[].value` | string/array | Yes | Value(s) to match |
| `sort` | object | No | Sort configuration |
| `sort.field` | string | Yes | Field to sort by |
| `sort.order` | string | No | `asc` or `desc` (default: `desc`) |
| `columns` | array | No | Metadata fields to display as columns |
| `limit` | number | No | Maximum results (default: 50) |

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

#### 4. Query Execution

- Type filtering via `flint_type` field uses optimized `listNotesByType` API
- Metadata filtering applied client-side after fetching notes
- Results include note title, type, created/updated dates, and user metadata

#### 5. Integration Points

- **EditorConfig**: Extension integrated with dataview handlers
- **NoteEditor**: Handles new note creation from widget
- **CodeMirror**: Uses `Decoration.replace` with custom `WidgetType` for rendering

### Technical Architecture

```
src/renderer/src/lib/dataview/
├── types.ts                    # Type definitions
├── yaml-utils.ts               # YAML parsing/serialization
├── dataview-theme.ts           # CodeMirror styling
├── dataviewExtension.svelte.ts # CodeMirror extension
├── queryService.svelte.ts      # Query execution
├── DataviewWidget.svelte       # UI component
└── index.ts                    # Public exports
```

### Known Limitations (v1)

1. **Client-side metadata filtering**: Metadata filters are applied after fetching notes, which is inefficient for large vaults
2. **N+1 query problem**: Each note requires a separate `getNote` call to fetch full metadata
3. **No filter builder UI**: Users must manually write YAML
4. **No column configuration UI**: Column selection requires YAML editing
5. **No real-time updates**: Widget doesn't automatically refresh when notes change
6. **Limited to 50 results**: Default limit prevents performance issues but may hide relevant notes

---

## Next Steps

### Phase 2: Enhanced Query Capabilities

#### 2.1 Server-side Metadata Filtering
- Extend `searchNotesAdvanced` IPC to support metadata filter parameters
- Move filtering logic to server for better performance
- Reduce data transfer between main and renderer processes

#### 2.2 Batch Note Fetching
- Add `getNotesBatch` IPC endpoint
- Fetch multiple notes in single request
- Reduce N+1 query overhead

#### 2.3 Real-time Updates
- Subscribe to note change events
- Refresh widget when relevant notes are created/modified/deleted
- Debounce updates to prevent excessive re-renders

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

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance with large vaults | High | Implement server-side filtering, pagination, virtual scrolling |
| YAML syntax errors | Medium | Add validation feedback, consider GUI-only mode |
| Widget conflicts with editor | Medium | Thorough testing of cursor detection and edit mode |
| Stale data display | Low | Implement real-time updates with debouncing |
