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
  notes: Record<string, Note>;
  workspaces: Record<string, Workspace>;
  activeWorkspaceId: string;
  noteTypes: Record<string, NoteType>;
  workspaceOrder?: string[]; // Ordered list of workspace IDs for display order
  conversations?: Record<string, Conversation>;
  shelfItems?: ShelfItemData[]; // Items on the shelf
  lastViewState?: LastViewState; // Persist active view for app restart
}

type SystemView = 'notes' | 'settings' | 'search' | 'types' | 'daily' | 'conversations' | null;

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

#### `AutomergeApp.svelte`

Main app component that:

- Initializes automerge state on mount
- Shows loading state during initialization
- Shows error state if initialization fails
- Routes to FirstTimeExperience or MainView based on vault existence
- Applies theme and platform detection

#### `AutomergeFirstTimeExperience.svelte`

First-time vault creation flow:

- Explains what a vault is
- Form to name the vault
- Creates vault and initializes state on submit

#### `AutomergeMainView.svelte`

Main interface with:

- Left sidebar (via `AutomergeLeftSidebar`)
- Title bar with search and vault switcher
- "All Notes" grid view when system view selected
- Note editor for selected note
- Settings panel
- Keyboard shortcuts (⌘N, ⌘K, ⌘B)

#### `AutomergeLeftSidebar.svelte`

Resizable left sidebar containing:

- System views navigation (All Notes, Settings)
- Pinned notes list for active workspace
- Recent notes list
- Workspace bar at bottom
- Slide animations when switching workspaces

#### `AutomergeSystemViews.svelte`

Navigation component with "All Notes" and "Settings" options.

#### `AutomergeSidebarItems.svelte`

Unified sidebar items component (replaces separate PinnedNotes and RecentNotes):

- Displays both pinned and recent sections
- Supports multiple item types (notes, conversations)
- Type-specific icons (emoji for notes, chat bubble for conversations)
- Drag-and-drop reordering within and between sections
- Context menu for pin/unpin/close/archive
- Collapsible pinned section

#### `AutomergeWorkspaceBar.svelte`

Workspace management at sidebar bottom:

- Workspace icons with tooltips and keyboard shortcuts (Ctrl+1-9)
- Drag-and-drop reordering with horizontal lock and FLIP animations
- Add menu with "New Note" and "New Workspace" options
- Context menu for edit/delete workspace
- Workspace order persisted in `workspaceOrder` array

#### `AutomergeNoteEditor.svelte`

Simple text-based note editor:

- Title input
- Content textarea with debounced updates
- Last modified timestamp
- Archive button
- Backlinks display

### 4. Entry Point Update

Updated `src/renderer/src/main.ts` to use `AutomergeApp.svelte` instead of the old `App.svelte`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Renderer                            │
├─────────────────────────────────────────────────────────────┤
│  AutomergeApp.svelte                                        │
│    ├── AutomergeFirstTimeExperience.svelte                  │
│    └── AutomergeMainView.svelte                             │
│          ├── AutomergeLeftSidebar.svelte                    │
│          │     ├── AutomergeSystemViews.svelte              │
│          │     ├── AutomergeSidebarItems.svelte             │
│          │     └── AutomergeWorkspaceBar.svelte             │
│          └── AutomergeNoteEditor.svelte                     │
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
  - `src/renderer/src/components/AutomergeSearchResults.svelte` - Enhanced results component

#### Note Types Management (Complete)

Full note type management UI with:

- **Note Types View** (`AutomergeNoteTypesView.svelte`):
  - List all note types with icons and note counts
  - Create new note types with name, icon, and purpose
  - Edit existing note types
  - Archive note types (soft delete, prevents deletion of default type)
  - View all notes of a specific type
  - Create new notes directly from type detail view

- **Note Type Dropdown** (`AutomergeNoteTypeDropdown.svelte`):
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

- **Action Popover** (`AutomergeWikilinkActionPopover.svelte`):
  - Appears on hover over wikilinks (300ms delay)
  - Also appears when cursor is adjacent to a wikilink
  - "Open" action to navigate to linked note (⌘Enter)
  - "Edit Display Text" action to modify link text (⌥Enter)
  - Viewport-aware positioning (avoids edges)
  - Mouse-leave timeout to prevent flickering

- **Edit Popover** (`AutomergeWikilinkEditPopover.svelte`):
  - Text input for editing wikilink display text
  - Auto-focuses and selects text on open
  - Enter to commit, Escape to cancel
  - Updates wikilink in editor in real-time

- **Integration** (in `AutomergeNoteEditor.svelte`):
  - Hover handler from wikilinks extension
  - Cursor-based detection for keyboard navigation
  - Proper focus management between editor and popovers
  - Selection restoration after edit

#### Note Shelf (Complete)

Implemented a floating shelf panel for quick access to frequently referenced notes and conversations:

**Components:**

- **`AutomergeFABMenu.svelte`** - Floating action button with hover expansion
  - Shows plus icon by default
  - On hover, expands to show Chat and Shelf buttons
  - When a panel is open, shows close button instead
  - Smooth animations and hover delay to prevent flickering

- **`AutomergeShelfPanel.svelte`** - Floating shelf panel
  - Slides in from the right side
  - Header with title and close button
  - Empty state with instructions
  - Scrollable list of shelf items

- **`AutomergeShelfItem.svelte`** - Individual shelf item
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
- `src/renderer/src/components/AutomergeVaultSyncSettings.svelte` - Sync settings UI

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

- **`AutomergeDailyView.svelte`** - Main daily view component
  - Week-based view showing Monday through Sunday
  - Week navigation (Previous/Next/Today buttons)
  - Keyboard shortcuts: `T` (focus today), `[` (previous week), `]` (next week), `Escape` (blur)
  - Reactive data from Automerge state

- **`AutomergeDaySection.svelte`** - Individual day container
  - Sticky day label (Mon, Tue, etc.)
  - Contains daily note editor
  - Click on day label opens note in main view

- **`AutomergeWeekNavigation.svelte`** - Navigation header
  - Previous/Next week buttons
  - Week display (e.g., "Week of Dec 9")
  - "Today" button to jump to current week

- **`AutomergeDailyNoteEditor.svelte`** - Per-day editor
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

#### Unified Sidebar Items (Complete)

Refactored the sidebar to support multiple item types (notes, conversations, and future types like epub/pdf):

**Data Model Changes:**

- Workspace now uses `pinnedItemIds: SidebarItemRef[]` and `recentItemIds: SidebarItemRef[]`
- Replaced separate `activeNoteId`/`activeConversationId` with unified `activeItem: ActiveItem`
- `SidebarItemRef` is a lightweight reference: `{ type: 'note' | 'conversation', id: string }`
- `SidebarItem` is the full display object with title, icon, updated timestamp, and metadata

**Component Changes:**

- Renamed `AutomergeSidebarNotes.svelte` → `AutomergeSidebarItems.svelte`
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
- `src/renderer/src/AutomergeApp.svelte`
- `src/renderer/src/components/AutomergeFirstTimeExperience.svelte`
- `src/renderer/src/components/AutomergeMainView.svelte`
- `src/renderer/src/components/AutomergeNoteEditor.svelte`
- `src/renderer/src/components/AutomergeLeftSidebar.svelte`
- `src/renderer/src/components/AutomergeSystemViews.svelte`
- `src/renderer/src/components/AutomergeSidebarItems.svelte` (unified, replaces PinnedNotes + RecentNotes)
- `src/renderer/src/components/AutomergeWorkspaceBar.svelte`
- `src/renderer/src/components/AutomergeSearchResults.svelte`
- `src/renderer/src/components/AutomergeNoteTypesView.svelte` (note types management view)
- `src/renderer/src/components/AutomergeNoteTypeDropdown.svelte` (type selector dropdown)
- `src/renderer/src/components/AutomergeWikilinkActionPopover.svelte` (wikilink action menu)
- `src/renderer/src/components/AutomergeWikilinkEditPopover.svelte` (wikilink display text editor)
- `src/renderer/src/components/AutomergeVaultSyncSettings.svelte` (file sync settings UI)
- `src/renderer/src/components/AutomergeDailyView.svelte` (daily view main component)
- `src/renderer/src/components/AutomergeDaySection.svelte` (individual day container)
- `src/renderer/src/components/AutomergeWeekNavigation.svelte` (week navigation header)
- `src/renderer/src/components/AutomergeDailyNoteEditor.svelte` (per-day CodeMirror editor)
- `src/renderer/src/components/AutomergeChatPanel.svelte` (AI chat interface)
- `src/renderer/src/components/AutomergeChatInput.svelte` (chat message input)
- `src/renderer/src/components/AutomergeChatFAB.svelte` (floating action button for chat)
- `src/renderer/src/components/AutomergeFABMenu.svelte` (expandable FAB with chat/shelf options)
- `src/renderer/src/components/AutomergeShelfPanel.svelte` (floating shelf panel)
- `src/renderer/src/components/AutomergeShelfItem.svelte` (individual shelf item with expand/collapse)
- `src/renderer/src/lib/automerge/shelf-state.svelte.ts` (shelf state wrapper)
- `src/renderer/src/components/AutomergeConversationView.svelte` (full conversation view)
- `src/renderer/src/components/AutomergeConversationList.svelte` (conversation list in chat panel)
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
- `src/renderer/src/components/AutomergeMainView.svelte` (integrated sync settings, daily view)
- `src/renderer/src/components/AutomergeSystemViews.svelte` (added Daily nav item)
- `src/renderer/src/components/AutomergeLeftSidebar.svelte` (updated view types)
- `src/renderer/src/lib/automerge/index.ts` (exported daily view functions)

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
