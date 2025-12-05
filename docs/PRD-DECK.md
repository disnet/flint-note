# PRD: Deck Feature

## Overview

The Deck feature enables users to create dynamic, queryable note lists. Decks can exist as **standalone deck notes** (opened full-screen like PDFs/EPUBs) or be **embedded within other notes**. Similar to Obsidian's Dataview plugin, decks allow users to create live tables of notes based on filters, with interactive sorting and the ability to create new notes directly from the widget.

## Current Implementation (v11)

### Features Implemented

#### 1. Standalone Deck Notes

Decks are now first-class note types with `flint_kind: 'deck'`. Creating a deck note:

- **Menu**: File → New Deck (`Cmd/Ctrl+Shift+D`)
- **Sidebar**: WorkspaceBar dropdown → New Deck button

When opened, deck notes display the DeckWidget as the main content area (no markdown editor), similar to how PDFs and EPUBs are rendered.

**Deck Note Content (YAML Configuration):**

```yaml
views:
  - name: All Projects
    filters:
      - field: flint_type
        value: project
    sort:
      field: flint_updated
      order: desc
    columns:
      - status
      - priority
  - name: Active Only
    filters:
      - field: flint_type
        value: project
      - field: status
        value: active
    sort:
      field: priority
      order: asc
    columns:
      - priority
      - due_date
activeView: 0
pageSize: 25
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

**Deck-level fields:**

| Field        | Type    | Required | Description                                                |
| ------------ | ------- | -------- | ---------------------------------------------------------- |
| `views`      | array   | Yes      | Array of view configurations                               |
| `activeView` | number  | No       | Index of currently active view (default: 0)                |
| `pageSize`   | number  | No       | Items per page: 10, 25, 50, or 100 (default: 25)           |
| `expanded`   | boolean | No       | Whether widget is fully expanded (default: false)          |

**View fields (`views[]`):**

| Field                | Type         | Required | Description                                              |
| -------------------- | ------------ | -------- | -------------------------------------------------------- |
| `name`               | string       | Yes      | Display name for the view (shown in dropdown)            |
| `filters`            | array        | Yes      | Array of filter conditions (can be empty)                |
| `filters[].field`    | string       | Yes      | Field to filter on (e.g., `flint_type`, metadata fields) |
| `filters[].operator` | string       | No       | Comparison operator (default: `=`)                       |
| `filters[].value`    | string/array | Yes      | Value(s) to match                                        |
| `sort`               | object       | No       | Sort configuration for this view                         |
| `sort.field`         | string       | Yes      | Field to sort by                                         |
| `sort.order`         | string       | No       | `asc` or `desc` (default: `desc`)                        |
| `columns`            | array        | No       | Metadata fields to display as columns                    |

**Supported Filter Operators:**

- `=` (equals, default)
- `!=` (not equals - includes notes where the field doesn't exist)
- `>`, `<`, `>=`, `<=` (comparison)
- `LIKE` (pattern matching, automatically wraps value with `%` for "contains" matching unless user includes their own wildcards)
- `IN` (matches any value in list)

#### 4. Widget Rendering

- **Standalone View**: Full-height DeckWidget with standard note header (title, action bar)
- **Embedded View**: Widget renders inline when cursor is outside the code block
- **Edit Mode**: Shows raw embed syntax (`n-<id>`) when cursor is inside the block
- **Header**: View switcher dropdown and page range display (e.g., "1-25 of 87")
- **View Switcher**: Dropdown to switch between views, with options to rename, duplicate, and delete views
- **Table**: Shows title column (always first) plus configured metadata columns
- **Clickable Titles**: Click title to navigate to note
- **Sortable Headers**: Click column headers to toggle sort order
- **Pagination Controls**: Previous/Next buttons with page size selector (10, 25, 50, 100 items)
- **Expand/Collapse**: Height-capped by default with toggle button; state persisted in YAML
- **Inline Note Creation**: New Note button adds editable row for inline editing
- **Inline Row Editing**: Edit button (✎) appears on row hover
- **Schema-Aware Editing**: Select fields show dropdown with valid options from note type schema
- **Union-Based Field Selection**: Available fields are the union of all filtered types' schemas (or all types if no filter)
- **Out-of-Schema Prop Styling**: Prop chips for fields not in the note's type schema appear muted (50% opacity, dashed border)
- **Untitled Note Styling**: Notes without titles display as muted, italic "Untitled"

#### 5. Query Execution

- **Server-side filtering**: All filtering performed server-side via `queryNotesForDataview` API
- **Server-side pagination**: Uses `LIMIT` and `OFFSET` SQL clauses for efficient paging
- **Batch metadata fetching**: Notes and metadata fetched in a single optimized query
- **Total count**: Server returns total matching count for pagination UI
- **Efficient SQL**: Uses JOINs with `note_metadata` table for metadata filtering
- **Smart != handling**: Uses LEFT JOIN for `!=` operator to include notes missing the field
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

#### 8. AI Agent Integration

AI agents can create, query, and modify decks through dedicated tools:

**Available Tools:**

| Tool               | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `query_deck`       | Execute deck queries (ad-hoc or from existing deck). Returns filtered notes |
| `create_deck`      | Create new deck notes with structured configuration                         |
| `get_deck_config`  | Retrieve deck configuration (views, filters, columns, settings)             |
| `update_deck_view` | Add, update, or remove views from existing decks                            |

**Ad-hoc Queries:**

Agents can run queries without creating deck notes by passing filters directly:

```typescript
query_deck({
  filters: [
    { field: 'flint_type', value: 'task' },
    { field: 'due_date', operator: '<', value: '2024-12-05' },
    { field: 'status', operator: '!=', value: 'completed' }
  ],
  sort: { field: 'due_date', order: 'asc' },
  limit: 50
});
```

**Field Discovery:**

Agents use `get_note_type_details` to discover available metadata fields before querying:

1. Call `get_note_type_details({ typeName: "task" })`
2. Receive schema with field names, types, and valid options for select fields
3. Use discovered fields in deck filters

**When Agents Use Deck Tools vs `search_notes`:**

- `search_notes`: Find notes by title/content text
- `query_deck`: Find notes by structured metadata (status, priority, dates)

**System Prompt Documentation:**

The agent system prompt includes comprehensive guidance on:

- When to use deck tools vs text search
- Filter operator reference
- Common filter patterns
- Step-by-step examples for common queries

### Technical Architecture

```
src/renderer/src/lib/deck/
├── types.ts                    # Type definitions (DeckConfig, DeckView, etc.) + utilities
├── yaml-utils.ts               # YAML parsing/serialization with auto-migration
├── deck-theme.ts               # CodeMirror styling (incl. embed & error styles)
├── deckExtension.svelte.ts     # CodeMirror extension (embed + deprecated error)
├── queryService.svelte.ts      # Query execution with pagination support
├── DeckWidget.svelte           # Main UI component
├── DeckToolbar.svelte          # Toolbar with filters/columns/sort
├── ViewSwitcher.svelte         # View dropdown with management (rename, duplicate, delete)
├── PaginationControls.svelte   # Pagination navigation and page size selector
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
├── menu-definitions.ts         # "New Deck" menu item
└── deck-yaml-utils.ts          # Shared YAML parsing/serialization (used by main + renderer)

src/main/
├── menu.ts                     # Native menu "New Deck" handler
├── index.ts                    # IPC handlers
├── tool-service.ts             # AI agent deck tools (query_deck, create_deck, etc.)
├── note-service.ts             # queryNotesForDataview wrapper
└── system-prompt.md            # Agent documentation for deck tools

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

### Known Limitations (v11)

1. **Metadata field sorting**: Sorting by metadata fields falls back to updated date
2. **Column width configuration**: Not yet implemented
3. **No deck templates**: Cannot save/reuse deck configurations across notes
4. **Single layout type**: All views use table layout; card/list/calendar views not yet implemented

---

## Version History

### v11: Pagination

- **Pagination controls**: Previous/Next navigation buttons at bottom of deck
- **Page range display**: Header shows "1-25 of 87" instead of just count
- **Page size selector**: Dropdown to choose 10, 25, 50, or 100 items per page
- **Persisted page size**: `pageSize` saved in deck YAML config
- **Smart page reset**: Returns to page 1 when filters/sort/pageSize change
- **Backward compatible**: Existing `limit` field migrated to `pageSize`
- **Server-side pagination**: Uses SQL `LIMIT`/`OFFSET` for efficient querying

### v10: AI Agent Integration

- **Dedicated agent tools**: `query_deck`, `create_deck`, `get_deck_config`, `update_deck_view`
- **Ad-hoc queries**: Agents can query notes by metadata without creating deck notes
- **Structured input**: Agents use structured tool parameters instead of raw YAML
- **Field discovery**: Agents use existing `get_note_type_details` to discover filterable fields
- **System prompt documentation**: Comprehensive guidance for when/how to use deck tools
- **Shared YAML utilities**: Moved parsing logic to `src/shared/deck-yaml-utils.ts` for main process access
- **Higher limits**: Agent queries support up to 200 results (vs 50 for UI)

### v9: Multi-View Support

- **Multiple views per deck**: Each deck can have multiple named views with different filters, columns, and sort
- **View switcher dropdown**: Header displays view name with dropdown to switch, create, rename, duplicate, and delete views
- **Per-view configuration**: Each view has its own filters, columns, and sort settings
- **Auto-migration**: Legacy single-view decks automatically migrate to multi-view format with a "Default" view
- **Removed deck name**: Decks no longer have a top-level name; views provide the naming

### v8: Multi-Type Field Support

- **Union-based field selection**: Available props are now the union of all types' fields (not intersection)
- **All-types fallback**: When no type filter, fields from ALL note types are available
- **Improved != operator**: `!=` filters now include notes where the field doesn't exist (uses LEFT JOIN)
- **Out-of-schema styling**: Prop chips appear muted when field isn't in the note's type schema
- **Type-to-fields tracking**: DeckWidget tracks which fields belong to which types

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

### Phase 11: Advanced Features

#### 11.1 Grouping

- Group results by field value
- Collapsible groups
- Group counts

#### 11.2 Aggregations

- Count, sum, average for numeric fields
- Display in footer row

#### 11.3 Layout Types

- Table view (current default)
- List view (compact)
- Card/gallery view
- Calendar view (for date-based queries)
- Layout type stored per-view

#### 11.4 Deck Templates

- Save deck configurations as reusable templates
- Quick-insert via command palette
- Template library management

#### 11.5 Deck Chaining

- Reference other deck results
- Filter based on linked notes
- Intersection/union of multiple decks

### Phase 12: Performance Optimizations

#### 12.1 Query Caching

- Cache query results with invalidation
- Share cache across identical decks

#### 12.2 Incremental Updates

- Track which notes changed
- Update only affected rows instead of full re-query

#### 12.3 Metadata Field Sorting

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

| Risk                          | Impact | Mitigation                                                            |
| ----------------------------- | ------ | --------------------------------------------------------------------- |
| Performance with large vaults | High   | ✅ Server-side filtering; ✅ pagination with configurable page sizes  |
| YAML syntax errors            | Medium | GUI-based editing; validation feedback                                |
| Widget conflicts with editor  | Medium | Embed syntax isolates deck reference from complex YAML                |
| Stale embedded data           | Low    | ✅ Real-time updates; embedded decks fetch live config                |
| Migration from inline YAML    | Low    | Clear deprecation error with guidance to create standalone decks      |
