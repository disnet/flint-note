# Automerge Migration Plan

## Overview

This document outlines the migration of Flint UI to use Automerge v3 and automerge-repo v2 for data storage. Phase 1 focuses on the renderer side only, with data stored locally in IndexedDB.

## Goals

- **Local-first**: All note data stored in IndexedDB via automerge-repo
- **Simplified state management**: Replace complex stores with unified function-based state module
- **Fresh start**: No migration from existing SQLite data - users create new vaults
- **Basic notes only**: Standard markdown notes with types (no epub/pdf/deck/review/AI features in Phase 1)

## Completed Work

### 1. Build Configuration

Updated the build system to properly handle Automerge's WASM module:

- **`vite.renderer.config.ts`**: Standalone Vite config for renderer with `vite-plugin-wasm`
- **`electron.vite.main-preload.config.ts`**: Electron-vite config for main/preload only
- **`package.json`**: Updated build scripts to build renderer separately
- **`src/renderer/index.html`**: Added `'wasm-unsafe-eval'` to CSP for WASM compilation

Key insight: electron-vite's bundler doesn't properly handle WASM ESM imports. Solution was to build the renderer separately using plain Vite with `vite-plugin-wasm`.

### 2. Automerge Foundation (`src/renderer/src/lib/automerge/`)

Created a complete automerge integration layer:

#### `types.ts`

```typescript
interface Note {
  id: string; // "n-xxxxxxxx"
  title: string;
  content: string;
  type: string; // Reference to NoteType.id
  created: string; // ISO timestamp
  updated: string;
  archived: boolean;
}

interface Workspace {
  id: string; // "ws-xxxxxxxx"
  name: string;
  icon: string;
  pinnedItemIds: SidebarItemRef[]; // Items pinned to this workspace (always visible)
  recentItemIds: SidebarItemRef[]; // Recent items (can be closed)
  created: string;
}

// Unified sidebar item types (notes, conversations, future: epub, pdf, etc.)
type SidebarItemType = 'note' | 'conversation';

interface SidebarItemRef {
  type: SidebarItemType;
  id: string;
}

interface SidebarItem {
  id: string;
  type: SidebarItemType;
  title: string;
  icon: string;
  updated: string;
  metadata?: {
    noteTypeId?: string;
    messageCount?: number;
    isPreview?: boolean;
  };
}

type ActiveItem =
  | { type: 'note'; id: string }
  | { type: 'conversation'; id: string }
  | null;

interface NoteType {
  id: string; // "type-xxxxxxxx"
  name: string;
  purpose: string;
  icon: string;
  archived: boolean;
  created: string;
}

interface NotesDocument {
  schemaVersion?: number; // Document schema version for migrations
  notes: Record<string, Note>;
  workspaces: Record<string, Workspace>;
  activeWorkspaceId: string;
  noteTypes: Record<string, NoteType>;
  workspaceOrder?: string[]; // Ordered list of workspace IDs for display order
  conversations?: Record<string, Conversation>;
  shelfItems?: ShelfItemData[]; // Items on the shelf
  lastViewState?: LastViewState; // Persist active view for app restart
}

type SystemView =
  | 'notes'
  | 'settings'
  | 'search'
  | 'types'
  | 'daily'
  | 'conversations'
  | null;

interface LastViewState {
  activeItem: ActiveItem;
  systemView: SystemView;
}

interface ShelfItemData {
  type: 'note' | 'conversation';
  id: string;
  isExpanded: boolean;
}

interface Vault {
  id: string;
  name: string;
  docUrl: string; // Automerge document URL
  archived: boolean;
  created: string;
}
```

#### `utils.ts`

- ID generation functions: `generateNoteId()`, `generateWorkspaceId()`, `generateNoteTypeId()`, `generateVaultId()`
- `nowISO()` for timestamp generation

#### `repo.ts`

- `createRepo()`: Creates Automerge repo with IndexedDB storage adapter
- `getRepo()`: Returns singleton repo instance
- Vault CRUD operations (stored in localStorage, not synced)
- `createNewNotesDocument()`: Creates document with default workspace and note type

#### `state.svelte.ts`

Unified reactive state module (~800 lines) providing:

**Reactive State:**

- `currentDoc`: The automerge document (updated via subscription)
- `activeItem`: Currently selected item as `ActiveItem` (persisted in document's `lastViewState`)
- `activeSystemView`: Current system view (persisted in document's `lastViewState`)
- `isInitialized`, `isLoading`: Loading states
- `vaults`: List of vaults

**Initialization:**

- `initializeState(vaultId?)`: Initialize repo, load vaults, subscribe to document changes, restore last view state

**Note Operations:**

- `getNotes()`, `getAllNotes()`, `getNote(id)`, `searchNotes(query)`, `getNotesByType(typeId)`
- `createNote()`, `updateNote()`, `archiveNote()`, `deleteNote()`

**Workspace Operations:**

- `getWorkspaces()`, `getActiveWorkspace()`
- `createWorkspace()`, `updateWorkspace()`, `deleteWorkspace()`
- `setActiveWorkspace()`, `reorderWorkspaces()`

**Unified Sidebar Item Operations:**

- `getActiveItem()`, `setActiveItem()`, `getActiveNote()`, `getActiveConversation()`
- `getActiveSystemView()`, `setActiveSystemView()` - Persisted system view state
- `getRecentItems()`, `getPinnedItems()`, `isItemRecent()`, `isItemPinned()`
- `addItemToWorkspace()`, `removeItemFromWorkspace()`, `bumpItemToRecent()`
- `pinItem()`, `unpinItem()`, `reorderPinnedItems()`, `reorderRecentItems()`
- Convenience wrappers: `getActiveNoteId()`, `setActiveNoteId()`, `addNoteToWorkspace()`

**Note Type Operations:**

- `getNoteTypes()`, `getAllNoteTypes()`, `getNoteType(id)`
- `createNoteType()`, `updateNoteType()`, `archiveNoteType()`, `setNoteType()`

**Backlinks:**

- `getBacklinks(noteId)`: Returns notes that link to the given note with context

**Shelf Operations:**

- `getShelfItems()` - Get all shelf items
- `isItemOnShelf(type, id)` - Check if item is on shelf
- `addShelfItem(type, id)` - Add item to shelf
- `removeShelfItem(type, id)` - Remove item from shelf
- `toggleShelfItemExpanded(type, id)` - Toggle expanded state
- `setShelfItemExpanded(type, id, expanded)` - Set expanded state
- `clearShelfItems()` - Clear all shelf items

#### `index.ts`

Barrel exports for all automerge functionality.

### 3. UI Components

Created simplified automerge-powered UI components:

#### `App.svelte`

Main app component that:

- Initializes automerge state on mount
- Shows loading state during initialization
- Shows error state if initialization fails
- Routes to FirstTimeExperience or MainView based on vault existence
- Applies theme and platform detection

#### `FirstTimeExperience.svelte`

First-time vault creation flow:

- Explains what a vault is
- Form to name the vault
- Creates vault and initializes state on submit

#### `MainView.svelte`

Main interface with:

- Left sidebar (via `AutomergeLeftSidebar`)
- Title bar with search and vault switcher
- "All Notes" grid view when system view selected
- Note editor for selected note
- Settings panel
- Keyboard shortcuts (⌘N, ⌘K, ⌘B)

#### `LeftSidebar.svelte`

Resizable left sidebar containing:

- System views navigation (All Notes, Settings)
- Pinned notes list for active workspace
- Recent notes list
- Workspace bar at bottom
- Slide animations when switching workspaces

#### `SystemViews.svelte`

Navigation component with "All Notes" and "Settings" options.

#### `SidebarItems.svelte`

Unified sidebar items component (replaces separate PinnedNotes and RecentNotes):

- Displays both pinned and recent sections
- Supports multiple item types (notes, conversations)
- Type-specific icons (emoji for notes, chat bubble for conversations)
- Drag-and-drop reordering within and between sections
- Context menu for pin/unpin/close/archive
- Collapsible pinned section

#### `WorkspaceBar.svelte`

Workspace management at sidebar bottom:

- Workspace icons with tooltips and keyboard shortcuts (Ctrl+1-9)
- Drag-and-drop reordering with horizontal lock and FLIP animations
- Add menu with "New Note" and "New Workspace" options
- Context menu for edit/delete workspace
- Workspace order persisted in `workspaceOrder` array

#### `NoteEditor.svelte`

Simple text-based note editor:

- Title input
- Content textarea with debounced updates
- Last modified timestamp
- Archive button
- Backlinks display

### 4. Entry Point Update

Updated `src/renderer/src/main.ts` to use `App.svelte`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Renderer                            │
├─────────────────────────────────────────────────────────────┤
│  App.svelte                                                 │
│    ├── FirstTimeExperience.svelte                           │
│    └── MainView.svelte                                      │
│          ├── LeftSidebar.svelte                             │
│          │     ├── SystemViews.svelte                       │
│          │     ├── SidebarItems.svelte                      │
│          │     └── WorkspaceBar.svelte                      │
│          └── NoteEditor.svelte                              │
├─────────────────────────────────────────────────────────────┤
│  lib/automerge/                                             │
│    ├── state.svelte.ts  (unified reactive state)            │
│    ├── repo.ts          (repo & vault management)           │
│    ├── types.ts         (TypeScript interfaces)             │
│    └── utils.ts         (ID generation, timestamps)         │
├─────────────────────────────────────────────────────────────┤
│  @automerge/automerge-repo                                  │
│    └── IndexedDBStorageAdapter                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Initialization**: `initializeState()` creates repo, loads vaults from localStorage, finds active vault's document
2. **Reading**: Components call getter functions (e.g., `getNotes()`) which read from `currentDoc`
3. **Writing**: Components call mutation functions (e.g., `updateNote()`) which call `docHandle.change()`
4. **Reactivity**: Document changes trigger subscription callback which updates `currentDoc`, propagating to all derived values

## Schema Versioning & Migrations

The Automerge document includes a `schemaVersion` field to track which migrations have been applied. This enables one-time migrations that run only when upgrading from an older version.

### How It Works

1. **Version Tracking**: `NotesDocument.schemaVersion` tracks the current schema version (defaults to 0 for existing documents)
2. **Version Constant**: `CURRENT_SCHEMA_VERSION` in `state.svelte.ts` defines the target version
3. **Migration Registry**: `SCHEMA_MIGRATIONS` maps version numbers to migration functions
4. **Migration Runner**: `runSchemaMigrations()` runs on vault load, applying only needed migrations

### Adding New Migrations

1. Increment `CURRENT_SCHEMA_VERSION`
2. Create a migration function that takes `NotesDocument` as parameter
3. Register it in `SCHEMA_MIGRATIONS` with the new version number

```typescript
// In state.svelte.ts
const CURRENT_SCHEMA_VERSION = 2; // Increment this

function migrateNewFeature(d: NotesDocument): void {
  // Migration logic here
}

const SCHEMA_MIGRATIONS: Record<number, (d: NotesDocument) => void> = {
  1: migratePropsCleanup,
  2: migrateNewFeature // Add new migration
};
```

### Current Migrations

- **Version 1** (`migratePropsCleanup`): Cleans up legacy props from old migrations
  - Removes standard Note field keys from props (`flint_id`, `flint_title`, etc.)
  - Converts flattened review props to structured `ReviewData` object

### Key Considerations

- **Idempotent by version**: Each migration runs exactly once per document
- **Atomic**: All migrations run in a single `docHandle.change()` block
- **Sequential**: Migrations run in order from current version to target
- **Backward compatible**: Documents without `schemaVersion` are treated as version 0

## What's Next

### Immediate Tasks

1. **Test the current implementation**
   - Create a vault
   - Create, edit, and archive notes
   - Verify persistence across page reloads
   - Test backlinks functionality

2. **Fix any bugs discovered during testing**

### Phase 1 Completion

The following tasks from the original plan:

- [x] Migrate existing note list components (NotesView, LeftSidebar)
- [x] Migrate workspace components (WorkspaceBar, PinnedNotes, TemporaryTabs)
- [x] Migrate note editor components (NoteEditor with CodeMirror)
- [ ] Migrate navigation services
- [ ] Remove deprecated stores and services

**Completed:** Left sidebar migration with full feature parity including:

- System views (All Notes, Settings)
- Pinned notes with workspace-specific storage
- Recent notes list
- Workspace bar with create/edit/delete
- Resizable sidebar with persistence
- Context menus for note management

**Completed:** CodeMirror integration for note editing including:

- Full CodeMirror 6 editor with markdown support
- Automerge-specific wikilinks extension (`wikilinks.svelte.ts`)
- Wikilink rendering as clickable widgets
- Wikilink autocomplete when typing `[[`
- Note navigation via wikilink clicks
- Create new notes via broken wikilinks
- Backlinks display at bottom of editor
- Theme support (GitHub Light/Dark)
- Markdown list styling

### Phase 2: Enhanced Features

After Phase 1 is stable:

1. **Search Improvements**: Full-text search with highlighting ✅
2. **Multiple Workspaces**: Full workspace management UI ✅
3. **Note Types**: UI for creating and managing custom note types ✅
4. **Wikilink hover popovers**: Action popover on hover ✅
5. **Inline images**: Support for images in notes (requires IPC)
6. **Daily View**: Week-based daily notes view ✅

**Completed in Phase 2:**

#### Workspace Management (Complete)

Enhanced workspace bar with full management capabilities:

- **Drag-and-drop reordering**: Workspaces can be reordered by dragging
  - Horizontal movement only (locked vertically)
  - FLIP animations for smooth transitions
  - Persisted order in `workspaceOrder` array
- **Add menu**: Plus button now shows a menu with:
  - "New Note" option
  - "New Workspace" option (opens creation form)
- **Context menu**: Right-click workspace to edit or delete
- **Edit functionality**: Opens form pre-filled with workspace name and icon

#### Search Improvements (Complete)

Implemented enhanced search functionality with:

- **Ranking algorithm**: Multi-factor scoring based on:
  - Title matches (worth more than content)
  - Exact title matches (highest value)
  - Title starting with search term
  - Content match frequency (capped at 5)
  - Note type name matches
  - Recency boost (last 7 days)
  - Bonus for matching both title and content

- **Match highlighting**:
  - Extract context around matches
  - Highlight matched terms in search results
  - Show line numbers for matches
  - Support for multiple terms (tokenized search)

- **Enhanced search UI**:
  - Dropdown results with highlighted previews
  - Dedicated search view (press Enter in search box)
  - Results show note type icon, title, and preview
  - Match count indicator for multiple matches
  - Relevance score display

- **New files**:
  - `src/renderer/src/lib/automerge/search.svelte.ts` - Search engine with ranking/highlighting
  - `src/renderer/src/components/SearchResults.svelte` - Enhanced results component

#### Note Types Management (Complete)

Full note type management UI with:

- **Note Types View** (`NoteTypesView.svelte`):
  - List all note types with icons and note counts
  - Create new note types with name, icon, and purpose
  - Edit existing note types
  - Archive note types (soft delete, prevents deletion of default type)
  - View all notes of a specific type
  - Create new notes directly from type detail view

- **Note Type Dropdown** (`NoteTypeDropdown.svelte`):
  - Integrated into note editor header
  - Search/filter available types
  - Keyboard navigation (arrow keys, Enter, Escape)
  - Shows current type icon and name

- **System Navigation**:
  - Added "Note Types" to sidebar system views
  - Accessible from left sidebar alongside "All Notes" and "Settings"

- **State Management** (already in `state.svelte.ts`):
  - `getNoteTypes()` - Get all non-archived types
  - `getNoteType(id)` - Get single type by ID
  - `createNoteType()` - Create new type
  - `updateNoteType()` - Edit type properties
  - `archiveNoteType()` - Soft delete type
  - `setNoteType()` - Change a note's type

#### Wikilink Hover Popovers (Complete)

Action popover system for wikilinks with:

- **Action Popover** (`WikilinkActionPopover.svelte`):
  - Appears on hover over wikilinks (300ms delay)
  - Also appears when cursor is adjacent to a wikilink
  - "Open" action to navigate to linked note (⌘Enter)
  - "Edit Display Text" action to modify link text (⌥Enter)
  - Viewport-aware positioning (avoids edges)
  - Mouse-leave timeout to prevent flickering

- **Edit Popover** (`WikilinkEditPopover.svelte`):
  - Text input for editing wikilink display text
  - Auto-focuses and selects text on open
  - Enter to commit, Escape to cancel
  - Updates wikilink in editor in real-time

- **Integration** (in `NoteEditor.svelte`):
  - Hover handler from wikilinks extension
  - Cursor-based detection for keyboard navigation
  - Proper focus management between editor and popovers
  - Selection restoration after edit

#### Note Shelf (Complete)

Implemented a floating shelf panel for quick access to frequently referenced notes and conversations:

**Components:**

- **`FABMenu.svelte`** - Floating action button with hover expansion
  - Shows plus icon by default
  - On hover, expands to show Chat and Shelf buttons
  - When a panel is open, shows close button instead
  - Smooth animations and hover delay to prevent flickering

- **`ShelfPanel.svelte`** - Floating shelf panel
  - Slides in from the right side
  - Header with title and close button
  - Empty state with instructions
  - Scrollable list of shelf items

- **`ShelfItem.svelte`** - Individual shelf item
  - Disclosure arrow for expand/collapse
  - Type-specific icon (note emoji or chat bubble)
  - Item title
  - Remove button on hover
  - Expandable content preview

**State Management:**

- Shelf items stored directly in Automerge document (`shelfItems` array)
- Automatically persisted and synced with file sync
- No separate storage mechanism needed
- `shelf-state.svelte.ts` provides thin wrapper class for components

**Integration:**

- "Add to Shelf" button in safe-zone header (top-right)
- Button only appears when a note or conversation is active
- Button shows different state when item is already on shelf
- Clicking "Add to Shelf" also opens the shelf panel
- Mutual exclusion with chat panel (opening one closes the other)

### Phase 3: External File Sync (Complete)

Implemented two-way sync between Automerge and markdown files on the filesystem:

#### Architecture

```
[Renderer Process]
  ├── Automerge Repo (IndexedDB storage)
  ├── IPCNetworkAdapterRenderer
  └── IPC Channel: "automerge-repo-message"
       ↓↑
[Main Process]
  ├── IPCNetworkAdapterMain
  ├── Automerge Repo (NodeFS storage in .automerge/)
  ├── Markdown Sync (file watcher + frontmatter)
  └── Filesystem: baseDirectory/notes/<TypeName>/*.md
```

#### Features

- **Enable/Disable Sync**: Settings panel to choose sync directory
- **File Organization**: Notes organized by type: `notes/<TypeName>/<title>.md`
- **YAML Frontmatter**: Each file includes metadata (id, title, type)
- **Two-Way Sync**:
  - Edit in app → updates markdown file
  - Edit markdown file externally → updates note in app
  - Create new .md file → imports as new note
  - Delete .md file → archives note
- **Sync Loop Prevention**: Tracks files being written to avoid re-importing own changes

#### New Files

**Renderer Side:**

- `src/renderer/src/lib/automerge/ipc/types.ts` - IPC message types
- `src/renderer/src/lib/automerge/ipc/IPCNetworkAdapterRenderer.ts` - Network adapter for renderer
- `src/renderer/src/lib/automerge/ipc/index.ts` - Barrel exports
- `src/renderer/src/components/VaultSyncSettings.svelte` - Sync settings UI

**Main Process Side:**

- `src/main/automerge-sync/IPCNetworkAdapterMain.ts` - Network adapter for main process
- `src/main/automerge-sync/vault-manager.ts` - Vault repo management
- `src/main/automerge-sync/markdown-sync.ts` - Two-way sync logic
- `src/main/automerge-sync/utils.ts` - Filename sanitization, frontmatter parsing
- `src/main/automerge-sync/index.ts` - Barrel exports

#### State Management Additions

- `getIsFileSyncAvailable()` - Check if running in Electron
- `getIsFileSyncEnabled()` - Check if vault has sync directory
- `getSyncDirectory()` - Get current sync path
- `getIsSyncing()` - Check if actively syncing
- `enableFileSync()` - Select directory and enable sync
- `disableFileSync()` - Disconnect sync

#### Vault Type Update

```typescript
interface Vault {
  id: string;
  name: string;
  docUrl: string;
  baseDirectory?: string; // NEW: Optional sync directory
  archived: boolean;
  created: string;
}
```

#### Daily View (Complete)

Implemented the daily notes view for capturing daily thoughts and tracking activity:

**Components:**

- **`DailyView.svelte`** - Main daily view component
  - Week-based view showing Monday through Sunday
  - Week navigation (Previous/Next/Today buttons)
  - Keyboard shortcuts: `T` (focus today), `[` (previous week), `]` (next week), `Escape` (blur)
  - Reactive data from Automerge state

- **`DaySection.svelte`** - Individual day container
  - Sticky day label (Mon, Tue, etc.)
  - Contains daily note editor
  - Click on day label opens note in main view

- **`WeekNavigation.svelte`** - Navigation header
  - Previous/Next week buttons
  - Week display (e.g., "Week of Dec 9")
  - "Today" button to jump to current week

- **`DailyNoteEditor.svelte`** - Per-day editor
  - CodeMirror editor with markdown support
  - Collapsible with 5-line default height when unfocused
  - Smooth expansion on focus
  - Wikilink support via Automerge editor config

**State Management Additions:**

- `DAILY_NOTE_TYPE_ID` - Constant for daily note type
- `DayData` and `WeekData` interfaces
- `getDailyNote(date)` - Get daily note for a date
- `getDailyNoteId(date)` - Generate predictable ID (`daily-YYYY-MM-DD`)
- `getOrCreateDailyNote(date)` - Get or create daily note
- `updateDailyNote(date, content)` - Update daily note content
- `getWeekData(startDate)` - Get week data with activity tracking
- `ensureDailyNoteType()` - Auto-create daily note type if missing

**Key Differences from Original:**

- No IPC calls needed - all data is local in Automerge
- Uses unified Automerge state module instead of separate store
- Predictable daily note IDs: `daily-YYYY-MM-DD`
- Daily note type auto-created on first use

#### EPUB Support (Complete)

Full EPUB file support for reading books directly in Flint:

**Architecture:**

```
[OPFS (Origin Private File System)]     [Automerge Document]
└── /epubs/                             └── notes["n-xxx"]
    └── {sha256-hash}.epub                  ├── type: "type-epub"
                                            ├── title: "Deep Work"
                                            ├── content: "<!-- highlights -->"
                                            └── props:
                                                ├── epubHash: "sha256-..."
                                                ├── epubTitle: "Deep Work"
                                                ├── epubAuthor: "Cal Newport"
                                                ├── currentCfi: "epubcfi(...)"
                                                ├── progress: 34
                                                ├── lastRead: "2025-01-15T..."
                                                └── textSize: 100
```

**Key Design Decisions:**

- **OPFS for binary storage**: EPUBs stored in browser's Origin Private File System, content-addressed by SHA-256 hash for deduplication
- **Automerge for metadata**: Reading progress, highlights, and settings synced via Automerge
- **Highlights in note content**: Stored as markdown in the note's content field for future portability

**New Files:**

- `src/renderer/src/lib/automerge/opfs-storage.svelte.ts` - OPFS storage service with content-addressed hashing
- `src/renderer/src/lib/automerge/epub-import.svelte.ts` - EPUB import flow with metadata extraction
- `src/renderer/src/lib/automerge/epub-tools.svelte.ts` - AI tools for EPUB content access
- `src/renderer/src/components/EpubViewer.svelte` - Main EPUB viewer container
- `src/renderer/src/components/EpubReader.svelte` - foliate-js wrapper for rendering
- `src/renderer/src/components/EpubToc.svelte` - Table of contents panel
- `src/renderer/src/components/EpubHighlights.svelte` - Highlights list panel
- `src/renderer/src/components/EpubProgress.svelte` - Progress bar and navigation

**Type Definitions** (in `types.ts`):

```typescript
interface EpubNoteProps {
  epubHash: string;
  epubTitle?: string;
  epubAuthor?: string;
  currentCfi?: string;
  progress?: number; // 0-100
  lastRead?: string; // ISO timestamp
  textSize?: number; // 75-200
}

interface EpubHighlight {
  id: string;
  cfi: string;
  text: string;
  createdAt: string;
}

interface EpubTocItem {
  label: string;
  href: string;
  subitems?: EpubTocItem[];
}
```

**State Management** (in `state.svelte.ts`):

- `EPUB_NOTE_TYPE_ID` - Constant for EPUB note type
- `ensureEpubNoteType()` - Auto-create EPUB type on first import
- `createEpubNote()` - Create note with EPUB props
- `updateEpubReadingState()` - Update CFI, progress, lastRead
- `updateEpubTextSize()` - Update text size preference

**Features:**

- **Import**: Via FAB menu "Import Book" button or drag-and-drop
- **Metadata extraction**: Parses OPF to extract title, author, publisher, etc.
- **Reading position**: Persists CFI location and progress percentage
- **Text size**: Adjustable font size (75-200%)
- **Table of contents**: Navigable TOC sidebar
- **Highlights**: Select text to create highlights, stored in note content
- **AI tools**: `get_document_structure`, `get_document_chunk`, `search_document_text`

**Integration:**

- EPUB notes appear in sidebar like regular notes
- View routing in `MainView.svelte` detects EPUB type
- FAB menu includes "Import Book" option
- Highlights stored as markdown for future migration compatibility

**Key Considerations:**

- OPFS is device-local; EPUBs must be re-imported on each device
- Content-addressing enables deduplication (same EPUB = same hash)
- Uses foliate-js for rendering with scrolled flow mode
- Debounced reading state updates to reduce Automerge changes

#### PDF Support (Complete)

Full PDF file support for reading documents directly in Flint:

**Architecture:**

```
[OPFS (Origin Private File System)]     [Automerge Document]
└── /pdfs/                              └── notes["n-xxx"]
    └── {sha256-hash}.pdf                   ├── type: "type-pdf"
                                            ├── title: "Research Paper"
                                            ├── content: "<!-- highlights -->"
                                            └── props:
                                                ├── pdfHash: "sha256-..."
                                                ├── pdfTitle: "..."
                                                ├── pdfAuthor: "..."
                                                ├── totalPages: 150
                                                ├── currentPage: 34
                                                ├── zoomLevel: 100
                                                └── lastRead: "2025-01-15T..."
```

**Key Design Decisions:**

- **OPFS for binary storage**: PDFs stored in browser's Origin Private File System, content-addressed by SHA-256 hash for deduplication (same pattern as EPUB)
- **Automerge for metadata**: Reading progress, highlights, and zoom preferences synced via Automerge
- **Highlights in note content**: Stored as markdown in the note's content field for portability
- **pdfjs-dist for rendering**: Uses Mozilla's PDF.js library (v5.0.375) with canvas rendering and text layer for selection

**New Files:**

- `src/renderer/src/lib/automerge/pdf-opfs-storage.svelte.ts` - OPFS storage service for PDFs
- `src/renderer/src/lib/automerge/pdf-import.svelte.ts` - PDF import flow with metadata extraction
- `src/renderer/src/lib/automerge/pdf-tools.svelte.ts` - AI tools for PDF content access
- `src/renderer/src/components/PdfViewer.svelte` - Main PDF viewer container with controls
- `src/renderer/src/components/PdfReader.svelte` - PDF.js wrapper for canvas rendering
- `src/renderer/src/components/PdfOutline.svelte` - Table of contents/bookmarks panel
- `src/renderer/src/components/PdfHighlights.svelte` - Highlights list panel

**Type Definitions** (in `types.ts`):

```typescript
interface PdfNoteProps {
  pdfHash: string;
  pdfTitle?: string;
  pdfAuthor?: string;
  totalPages?: number;
  currentPage?: number; // 1-indexed
  zoomLevel?: number; // 50-200
  lastRead?: string; // ISO timestamp
}

interface PdfHighlight {
  id: string;
  pageNumber: number;
  text: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  createdAt: string;
}

interface PdfOutlineItem {
  title: string;
  pageNumber: number;
  children?: PdfOutlineItem[];
}

interface PdfMetadata {
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  pageCount: number;
}
```

**State Management** (in `state.svelte.ts`):

- `PDF_NOTE_TYPE_ID` - Constant for PDF note type
- `ensurePdfNoteType()` - Auto-create PDF type on first import
- `createPdfNote()` - Create note with PDF props
- `updatePdfReadingState()` - Update currentPage, lastRead
- `updatePdfZoomLevel()` - Update zoom level preference
- `getPdfNotes()` - Get all PDF notes sorted by lastRead

**Features:**

- **Import**: Via FAB menu "Import PDF" button or drag-and-drop
- **Metadata extraction**: Parses PDF info dictionary for title, author, page count
- **Reading position**: Persists current page and progress percentage
- **Zoom levels**: Adjustable zoom (50%, 75%, 100%, 125%, 150%, 200%)
- **Table of contents**: Navigable outline/bookmarks sidebar
- **Text selection**: Full text selection support via PDF.js TextLayer
- **Highlights**: Select text to create highlights, stored in note content
- **High DPI support**: Canvas scaling for sharp rendering on Retina displays
- **Keyboard navigation**: Arrow keys and Page Up/Down for page navigation
- **AI tools**: `get_document_structure`, `get_document_chunk`, `search_document_text`

**Integration:**

- PDF notes appear in sidebar like regular notes
- View routing in `MainView.svelte` detects PDF type
- FAB menu includes "Import PDF" option alongside "Import Book"
- Full-width display mode for better reading experience
- Highlights stored as markdown for future migration compatibility

**Key Considerations:**

- OPFS is device-local; PDFs must be re-imported on each device
- Content-addressing enables deduplication (same PDF = same hash)
- Uses canvas rendering with text layer overlay for selection
- PDF.js worker bundled locally via Vite's `?url` import to avoid CSP issues
- Debounced reading state updates to reduce Automerge changes
- Non-reactive Maps/Sets used internally to prevent Svelte 5 effect loops

#### Webpage Archiving (Complete)

Full webpage archiving support for saving articles and web pages for offline reading:

**Architecture:**

```
[OPFS (Origin Private File System)]     [Automerge Document]
└── /webpages/                          └── notes["n-xxx"]
    ├── {sha256-hash}.html                  ├── type: "type-webpage"
    └── {sha256-hash}.meta.json             ├── title: "Article Title"
                                            ├── content: "<!-- highlights -->"
                                            └── props:
                                                ├── webpageHash: "sha256-..."
                                                ├── webpageUrl: "https://..."
                                                ├── webpageTitle: "..."
                                                ├── webpageAuthor: "..."
                                                ├── webpageSiteName: "..."
                                                ├── progress: 50
                                                └── lastRead: "2025-01-15T..."
```

**Key Design Decisions:**

- **OPFS for HTML storage**: Archived HTML stored in browser's Origin Private File System, content-addressed by SHA-256 hash
- **Defuddle for article extraction**: Uses Defuddle library in main process to extract clean article content from web pages
- **Shadow DOM rendering**: Webpage content rendered in Shadow DOM to isolate styles from the app
- **DOMPurify sanitization**: HTML sanitized before rendering to prevent XSS
- **70ch width constraint**: Matches markdown notes for consistent reading experience

**New Files:**

- `src/renderer/src/lib/automerge/webpage-opfs-storage.svelte.ts` - OPFS storage service for archived webpages
- `src/renderer/src/lib/automerge/webpage-import.svelte.ts` - Webpage import flow via IPC
- `src/renderer/src/components/WebpageViewer.svelte` - Main webpage viewer with header and highlights
- `src/renderer/src/components/WebpageReader.svelte` - Shadow DOM reader with DOMPurify
- `src/renderer/src/components/ImportWebpageModal.svelte` - URL input modal

**Type Definitions** (in `types.ts`):

```typescript
interface WebpageNoteProps {
  webpageHash: string;
  webpageUrl: string;
  webpageTitle?: string;
  webpageAuthor?: string;
  webpageSiteName?: string;
  webpageExcerpt?: string;
  progress?: number; // 0-100
  lastRead?: string; // ISO timestamp
  archivedAt?: string;
}

interface WebpageMetadata {
  url: string;
  title: string;
  siteName?: string;
  author?: string;
  excerpt?: string;
  fetchedAt: string;
  lang?: string;
  dir?: string;
}

interface WebpageHighlight {
  id: string;
  text: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
  createdAt: string;
}
```

**State Management** (in `state.svelte.ts`):

- `WEBPAGE_NOTE_TYPE_ID` - Constant for webpage note type
- `ensureWebpageNoteType()` - Auto-create webpage type on first import
- `createWebpageNote()` - Create note with webpage props
- `updateWebpageReadingState()` - Update progress, lastRead
- `getWebpageProps()` - Get webpage-specific props from note
- `getWebpageNotes()` - Get all webpage notes sorted by lastRead

**Features:**

- **Import via URL**: Enter URL in modal, fetches and archives article
- **Article extraction**: Defuddle extracts main content, removes ads/navigation
- **Offline reading**: Full article available without internet
- **Reading progress**: Scroll position tracked as percentage
- **Text highlights**: Select text to create highlights, stored in note content
- **Property chips**: Shows site, author, progress, last read, highlight count
- **Source link**: Click to open original URL in browser
- **Editable title**: Title can be edited like regular notes

**IPC Handler** (in `src/main/index.ts`):

- `archive-webpage` - Fetches URL, extracts article with Defuddle, converts images to data URIs, returns HTML + metadata

**Integration:**

- Webpage notes appear in sidebar like regular notes
- View routing in `MainView.svelte` detects webpage type
- FAB menu includes "Archive Webpage" option
- 70ch max-width display matching markdown notes
- Highlights stored as markdown for future migration compatibility

**Key Considerations:**

- OPFS is device-local; webpages must be re-archived on each device
- Content-addressing enables deduplication (same content = same hash)
- Images converted to data URIs for offline availability
- Shadow DOM prevents webpage CSS from affecting app styles
- DOMPurify removes potentially dangerous HTML/scripts

#### Deck Support (Complete)

Full deck (filtered note list) support ported from the legacy version to Automerge:

**Architecture:**

Decks are special notes that contain YAML configuration in code blocks, defining filtered views of notes with sorting, pagination, and column configuration.

````
[Automerge Document]
└── notes["n-xxx"]
    ├── type: "type-deck"
    ├── title: "My Tasks"
    └── content: """
        ```flint-deck
        views:
          - name: Default
            filters:
              - field: flint_type
                operator: "="
                value: "Task"
            sort:
              field: updated
              order: desc
        ```
        """
````

**Key Design Decisions:**

- **Client-side filtering**: All filtering, sorting, and pagination done in-browser (no SQL)
- **YAML configuration**: Deck config stored as YAML in `flint-deck` code blocks
- **Type names in filters**: `flint_type` filter uses type names (not IDs) for readability
- **Shared YAML utilities**: Parsing/serialization shared with legacy via `shared/deck-yaml-utils.ts`

**New Files:**

- `src/renderer/src/lib/automerge/deck/deck-types.ts` - Type definitions, system fields, operators
- `src/renderer/src/lib/automerge/deck/deck-query.svelte.ts` - Client-side query engine
- `src/renderer/src/lib/automerge/deck/deck-theme.ts` - CodeMirror theme for deck blocks
- `src/renderer/src/lib/automerge/deck/deck-extension.svelte.ts` - CodeMirror extension for deck widgets
- `src/renderer/src/lib/automerge/deck/index.ts` - Barrel exports
- `src/renderer/src/components/DeckWidget.svelte` - Main deck widget (toolbar, filters, results)
- `src/renderer/src/components/DeckViewer.svelte` - Full-page deck viewer
- `src/renderer/src/components/DeckToolbar.svelte` - Column/sort controls
- `src/renderer/src/components/DeckFilterPopup.svelte` - Quick filter editing popup
- `src/renderer/src/components/DeckFilterBuilder.svelte` - Full filter editor
- `src/renderer/src/components/DeckFilterRow.svelte` - Individual filter row
- `src/renderer/src/components/DeckValueInput.svelte` - Filter value input (text, select, checkboxes)
- `src/renderer/src/components/DeckFieldSelector.svelte` - Field picker dropdown
- `src/renderer/src/components/DeckOperatorSelector.svelte` - Operator picker
- `src/renderer/src/components/DeckNoteListItem.svelte` - Result row with inline editing
- `src/renderer/src/components/DeckPagination.svelte` - Pagination controls
- `src/renderer/src/components/DeckColumnConfig.svelte` - Column visibility/order
- `src/renderer/src/components/DeckPropPickerDialog.svelte` - Add column dialog
- `src/renderer/src/components/DeckViewSwitcher.svelte` - Multi-view tabs

**State Management** (in `state.svelte.ts`):

- `DECK_NOTE_TYPE_ID` - Constant for deck note type (`"type-deck"`)
- `ensureDeckNoteType()` - Auto-create deck type on first use
- `createDeckNote(title)` - Create new deck note with default config
- `getDeckNotes()` - Get all deck notes

**Features:**

- **Filter types**: Type (select dropdown), Title (text), Created/Updated (date), Archived (boolean), custom props
- **Filter operators**: `=`, `!=`, `LIKE`, `IN`, `NOT IN`, `BETWEEN`, `>`, `<`, `>=`, `<=`
- **Type filter UI**: Dropdown/checkbox list of available note types
- **Multi-view support**: Multiple named views with tabs
- **Column configuration**: Show/hide columns, drag reorder, custom labels
- **Inline editing**: Edit title and properties directly in result rows
- **Type switcher**: Compact icon-only type selector per row
- **New note creation**: Pre-fills type and props from active filters
- **Pagination**: Configurable page sizes (10, 25, 50, 100, All)
- **Sorting**: Click column headers or use sort dropdown

**Integration:**

- Deck notes appear in sidebar like regular notes
- CodeMirror extension renders `flint-deck` blocks as interactive widgets
- "New Deck" button in workspace bar add menu
- Full-page viewer for deck notes (`DeckViewer.svelte`)

**Key Differences from Legacy:**

- No SQL queries - all filtering done client-side with JavaScript
- Type filter uses names instead of IDs for human readability
- Query service returns `AutomergeDeckResultNote` with pre-resolved type info
- Uses Svelte 5 reactivity (`$derived`, `$state`) throughout

#### Unified Sidebar Items (Complete)

Refactored the sidebar to support multiple item types (notes, conversations, and future types like epub/pdf):

**Data Model Changes:**

- Workspace now uses `pinnedItemIds: SidebarItemRef[]` and `recentItemIds: SidebarItemRef[]`
- Replaced separate `activeNoteId`/`activeConversationId` with unified `activeItem: ActiveItem`
- `SidebarItemRef` is a lightweight reference: `{ type: 'note' | 'conversation', id: string }`
- `SidebarItem` is the full display object with title, icon, updated timestamp, and metadata

**Component Changes:**

- `SidebarItems.svelte` - unified sidebar component (replaces separate PinnedNotes and RecentNotes)
- Items render with type-specific icons (emoji for notes, chat bubble for conversations)
- Conversations clickable to open in main view
- Full drag-and-drop support for reordering both notes and conversations
- Context menu works for both types (Archive, Close, Pin/Unpin)

**State Management:**

- `getActiveItem()`, `setActiveItem()` - Unified active item state
- `getActiveNote()`, `getActiveConversation()` - Convenience getters
- `getRecentItems()`, `getPinnedItems()` - Return `SidebarItem[]` for rendering
- `pinItem()`, `unpinItem()`, `addItemToWorkspace()`, `removeItemFromWorkspace()`
- `reorderPinnedItems()`, `reorderRecentItems()` - Drag-and-drop support
- Backward-compatible wrappers: `getActiveNoteId()`, `setActiveNoteId()`, `addNoteToWorkspace()`

**Migration Handling:**

- `ensureWorkspaceArrays()` helper migrates old field names (`pinnedNoteIds` → `pinnedItemIds`)
- `getWorkspacePinnedRefs()`, `getWorkspaceRecentRefs()` handle reading from old or new format
- Automatic migration happens on first access within Automerge change callbacks

**Automerge Considerations:**

- When reordering items, create new plain objects to avoid "Cannot create a reference to existing document object" error
- Objects spliced from Automerge arrays cannot be directly re-inserted; must create fresh objects

### Phase 4: Future Sync

Future work for multi-device sync:

1. **Server Component**: Backend service for relay/persistence
2. **Conflict Resolution**: UI for handling sync conflicts
3. **Real-time Collaboration**: Multiple users editing simultaneously

## Files Reference

### New Files Created

- `src/renderer/src/lib/automerge/types.ts`
- `src/renderer/src/lib/automerge/utils.ts`
- `src/renderer/src/lib/automerge/repo.ts`
- `src/renderer/src/lib/automerge/state.svelte.ts`
- `src/renderer/src/lib/automerge/index.ts`
- `src/renderer/src/lib/automerge/wikilinks.svelte.ts` (automerge-specific wikilinks)
- `src/renderer/src/lib/automerge/editorConfig.svelte.ts` (CodeMirror config for automerge)
- `src/renderer/src/lib/automerge/search.svelte.ts` (enhanced search with ranking/highlighting)
- `src/renderer/src/lib/automerge/chat-service.svelte.ts` (AI chat streaming with tool support)
- `src/renderer/src/lib/automerge/note-tools.svelte.ts` (AI tools for note operations)
- `src/renderer/src/lib/automerge/ipc/types.ts` (IPC message types for sync)
- `src/renderer/src/lib/automerge/ipc/IPCNetworkAdapterRenderer.ts` (renderer network adapter)
- `src/renderer/src/lib/automerge/ipc/index.ts` (barrel exports)
- `src/main/automerge-sync/IPCNetworkAdapterMain.ts` (main process network adapter)
- `src/main/automerge-sync/vault-manager.ts` (vault repo lifecycle management)
- `src/main/automerge-sync/markdown-sync.ts` (two-way sync with file watcher)
- `src/main/automerge-sync/utils.ts` (filename sanitization, frontmatter helpers)
- `src/main/automerge-sync/index.ts` (barrel exports)
- `src/renderer/src/App.svelte`
- `src/renderer/src/components/FirstTimeExperience.svelte`
- `src/renderer/src/components/MainView.svelte`
- `src/renderer/src/components/NoteEditor.svelte`
- `src/renderer/src/components/LeftSidebar.svelte`
- `src/renderer/src/components/SystemViews.svelte`
- `src/renderer/src/components/SidebarItems.svelte` (unified, replaces PinnedNotes + RecentNotes)
- `src/renderer/src/components/WorkspaceBar.svelte`
- `src/renderer/src/components/SearchResults.svelte`
- `src/renderer/src/components/NoteTypesView.svelte` (note types management view)
- `src/renderer/src/components/NoteTypeDropdown.svelte` (type selector dropdown)
- `src/renderer/src/components/WikilinkActionPopover.svelte` (wikilink action menu)
- `src/renderer/src/components/WikilinkEditPopover.svelte` (wikilink display text editor)
- `src/renderer/src/components/VaultSyncSettings.svelte` (file sync settings UI)
- `src/renderer/src/components/DailyView.svelte` (daily view main component)
- `src/renderer/src/components/DaySection.svelte` (individual day container)
- `src/renderer/src/components/WeekNavigation.svelte` (week navigation header)
- `src/renderer/src/components/DailyNoteEditor.svelte` (per-day CodeMirror editor)
- `src/renderer/src/components/ChatPanel.svelte` (AI chat interface)
- `src/renderer/src/components/ChatInput.svelte` (chat message input)
- `src/renderer/src/components/ChatFAB.svelte` (floating action button for chat)
- `src/renderer/src/components/FABMenu.svelte` (expandable FAB with chat/shelf options)
- `src/renderer/src/components/ShelfPanel.svelte` (floating shelf panel)
- `src/renderer/src/components/ShelfItem.svelte` (individual shelf item with expand/collapse)
- `src/renderer/src/lib/automerge/shelf-state.svelte.ts` (shelf state wrapper)
- `src/renderer/src/components/ConversationView.svelte` (full conversation view)
- `src/renderer/src/components/ConversationList.svelte` (conversation list in chat panel)
- `src/renderer/src/lib/automerge/opfs-storage.svelte.ts` (OPFS storage with content-addressed hashing)
- `src/renderer/src/lib/automerge/epub-import.svelte.ts` (EPUB import and metadata extraction)
- `src/renderer/src/lib/automerge/epub-tools.svelte.ts` (AI tools for EPUB content access)
- `src/renderer/src/components/EpubViewer.svelte` (EPUB viewer container)
- `src/renderer/src/components/EpubReader.svelte` (foliate-js wrapper)
- `src/renderer/src/components/EpubToc.svelte` (table of contents panel)
- `src/renderer/src/components/EpubHighlights.svelte` (highlights list panel)
- `src/renderer/src/components/EpubProgress.svelte` (progress bar and navigation)
- `src/renderer/src/lib/automerge/pdf-opfs-storage.svelte.ts` (OPFS storage for PDFs)
- `src/renderer/src/lib/automerge/pdf-import.svelte.ts` (PDF import and metadata extraction)
- `src/renderer/src/lib/automerge/pdf-tools.svelte.ts` (AI tools for PDF content access)
- `src/renderer/src/components/PdfViewer.svelte` (PDF viewer container)
- `src/renderer/src/components/PdfReader.svelte` (PDF.js wrapper for canvas rendering)
- `src/renderer/src/components/PdfOutline.svelte` (bookmarks/outline panel)
- `src/renderer/src/components/PdfHighlights.svelte` (highlights list panel)
- `src/renderer/src/lib/automerge/webpage-opfs-storage.svelte.ts` (OPFS storage for webpages)
- `src/renderer/src/lib/automerge/webpage-import.svelte.ts` (webpage import and archiving)
- `src/renderer/src/components/WebpageViewer.svelte` (webpage viewer container)
- `src/renderer/src/components/WebpageReader.svelte` (Shadow DOM reader with DOMPurify)
- `src/renderer/src/components/ImportWebpageModal.svelte` (URL input modal)
- `src/renderer/src/lib/automerge/deck/deck-types.ts` (deck type definitions)
- `src/renderer/src/lib/automerge/deck/deck-query.svelte.ts` (client-side query engine)
- `src/renderer/src/lib/automerge/deck/deck-theme.ts` (CodeMirror theme)
- `src/renderer/src/lib/automerge/deck/deck-extension.svelte.ts` (CodeMirror extension)
- `src/renderer/src/lib/automerge/deck/index.ts` (barrel exports)
- `src/renderer/src/components/DeckWidget.svelte` (main deck widget)
- `src/renderer/src/components/DeckViewer.svelte` (full-page deck viewer)
- `src/renderer/src/components/DeckToolbar.svelte` (column/sort controls)
- `src/renderer/src/components/DeckFilterPopup.svelte` (quick filter popup)
- `src/renderer/src/components/DeckFilterBuilder.svelte` (full filter editor)
- `src/renderer/src/components/DeckFilterRow.svelte` (individual filter row)
- `src/renderer/src/components/DeckValueInput.svelte` (filter value input)
- `src/renderer/src/components/DeckFieldSelector.svelte` (field picker)
- `src/renderer/src/components/DeckOperatorSelector.svelte` (operator picker)
- `src/renderer/src/components/DeckNoteListItem.svelte` (result row)
- `src/renderer/src/components/DeckPagination.svelte` (pagination controls)
- `src/renderer/src/components/DeckColumnConfig.svelte` (column config)
- `src/renderer/src/components/DeckPropPickerDialog.svelte` (add column dialog)
- `src/renderer/src/components/DeckViewSwitcher.svelte` (multi-view tabs)
- `vite.renderer.config.ts`
- `electron.vite.main-preload.config.ts`

### Files Modified

- `src/renderer/src/main.ts` (entry point)
- `src/renderer/index.html` (CSP for WASM)
- `package.json` (build scripts, dependencies)
- `src/renderer/src/lib/automerge/types.ts` (added baseDirectory to Vault)
- `src/renderer/src/lib/automerge/repo.ts` (sync connection functions)
- `src/renderer/src/lib/automerge/state.svelte.ts` (sync state management)
- `src/preload/index.ts` (automergeSync IPC methods)
- `src/main/index.ts` (IPC handlers for sync)
- `src/renderer/src/components/MainView.svelte` (integrated sync settings, daily view)
- `src/renderer/src/components/SystemViews.svelte` (added Daily nav item)
- `src/renderer/src/components/LeftSidebar.svelte` (updated view types)
- `src/renderer/src/lib/automerge/index.ts` (exported daily view functions, EPUB functions)
- `src/renderer/src/lib/automerge/types.ts` (added EpubNoteProps, EpubHighlight, EpubTocItem, EpubLocation, EpubMetadata, PdfNoteProps, PdfHighlight, PdfOutlineItem, PdfMetadata, WebpageNoteProps, WebpageMetadata, WebpageHighlight, WebpageSelectionInfo)
- `src/renderer/src/lib/automerge/state.svelte.ts` (added EPUB, PDF, and Webpage functions: createEpubNote, createPdfNote, createWebpageNote, updateEpubReadingState, updatePdfReadingState, updateWebpageReadingState, etc.)
- `src/renderer/src/lib/automerge/chat-service.svelte.ts` (integrated EPUB and PDF AI tools)
- `src/renderer/src/components/MainView.svelte` (EPUB, PDF, and Webpage view routing, full-width content mode for EPUB/PDF)
- `src/renderer/src/components/FABMenu.svelte` (added Import Book, Import PDF, and Archive Webpage options)
- `src/renderer/src/lib/automerge/index.ts` (exported PDF, Webpage, and Deck functions and types)
- `src/main/index.ts` (added archive-webpage IPC handler)
- `src/renderer/src/lib/automerge/state.svelte.ts` (added deck functions: createDeckNote, getDeckNotes, ensureDeckNoteType)
- `src/renderer/src/lib/automerge/editorConfig.svelte.ts` (integrated deck CodeMirror extension)
- `src/renderer/src/components/MainView.svelte` (deck viewer routing, deck creation handler)
- `src/renderer/src/components/WorkspaceBar.svelte` (added "New Deck" to add menu)
- `src/renderer/src/components/LeftSidebar.svelte` (passed onCreateDeck prop)
- `src/preload/index.ts` (added archiveWebpage IPC definition)
- `src/renderer/src/env.d.ts` (added archiveWebpage type definition)

### Files to Eventually Remove (after full migration)

- `src/renderer/src/App.svelte`
- `src/renderer/src/stores/workspacesStore.svelte.ts`
- `src/renderer/src/stores/activeNoteStore.svelte.ts`
- `src/renderer/src/stores/noteDocumentRegistry.svelte.ts`
- `src/renderer/src/services/noteStore.svelte.ts`
- `src/renderer/src/services/noteCache.svelte.ts`

## Dependencies

```json
{
  "@automerge/automerge": "^3.2.1",
  "@automerge/automerge-repo": "^2.5.1",
  "@automerge/automerge-repo-storage-indexeddb": "^2.5.1",
  "@automerge/automerge-repo-storage-nodefs": "^2.5.1",
  "js-yaml": "^4.1.0",
  "pdfjs-dist": "^5.0.375",
  "vite-plugin-wasm": "^3.5.0"
}
```

## Running the App

```bash
# Build and run
npm run dev

# Or build only
npm run build

# Then run separately
electron .
```
