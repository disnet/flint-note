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
  pinnedNoteIds: string[]; // Notes pinned to this workspace (always visible)
  recentNoteIds: string[]; // Recent notes (can be closed)
  created: string;
}

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
- `activeNoteId`: Currently selected note (UI-only)
- `isInitialized`, `isLoading`: Loading states
- `vaults`: List of vaults

**Initialization:**

- `initializeState(vaultId?)`: Initialize repo, load vaults, subscribe to document changes

**Note Operations:**

- `getNotes()`, `getAllNotes()`, `getNote(id)`, `searchNotes(query)`, `getNotesByType(typeId)`
- `createNote()`, `updateNote()`, `archiveNote()`, `deleteNote()`

**Workspace Operations:**

- `getWorkspaces()`, `getActiveWorkspace()`, `getRecentNotes()`, `isNoteRecent()`
- `createWorkspace()`, `updateWorkspace()`, `deleteWorkspace()`
- `setActiveWorkspace()`, `addNoteToWorkspace()`, `removeNoteFromWorkspace()`, `reorderWorkspaceNotes()`

**Pinned Notes Operations:**

- `getPinnedNotes()`, `pinNote()`, `unpinNote()`, `isNotePinned()`, `reorderPinnedNotes()`

**Note Type Operations:**

- `getNoteTypes()`, `getAllNoteTypes()`, `getNoteType(id)`
- `createNoteType()`, `updateNoteType()`, `archiveNoteType()`, `setNoteType()`

**Backlinks:**

- `getBacklinks(noteId)`: Returns notes that link to the given note with context

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

#### `AutomergePinnedNotes.svelte`

Pinned notes list for active workspace:

- Collapsible section
- Context menu for unpin/archive
- Display of note type icons

#### `AutomergeRecentNotes.svelte`

Recent notes in active workspace:

- "Close all" button
- Context menu for pin/close/archive
- Close button on hover

#### `AutomergeWorkspaceBar.svelte`

Workspace management at sidebar bottom:

- Workspace icons with tooltips
- Add workspace popover with form
- Context menu for edit/delete
- Quick action to create notes

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
│          │     ├── AutomergePinnedNotes.svelte              │
│          │     ├── AutomergeRecentNotes.svelte              │
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
2. **Multiple Workspaces**: Full workspace management UI
3. **Note Types**: UI for creating and managing custom note types
4. **Wikilink hover popovers**: Action popover on hover (currently simplified)
5. **Inline images**: Support for images in notes (requires IPC)

**Completed in Phase 2:**

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

### Phase 3: Sync

Future work for multi-device sync:

1. **Network Adapter**: Implement automerge-repo network adapter for sync
2. **Server Component**: Backend service for relay/persistence
3. **Conflict Resolution**: UI for handling sync conflicts
4. **Offline Support**: Queue changes when offline

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
- `src/renderer/src/AutomergeApp.svelte`
- `src/renderer/src/components/AutomergeFirstTimeExperience.svelte`
- `src/renderer/src/components/AutomergeMainView.svelte`
- `src/renderer/src/components/AutomergeNoteEditor.svelte`
- `src/renderer/src/components/AutomergeLeftSidebar.svelte`
- `src/renderer/src/components/AutomergeSystemViews.svelte`
- `src/renderer/src/components/AutomergePinnedNotes.svelte`
- `src/renderer/src/components/AutomergeRecentNotes.svelte`
- `src/renderer/src/components/AutomergeWorkspaceBar.svelte`
- `src/renderer/src/components/AutomergeSearchResults.svelte`
- `vite.renderer.config.ts`
- `electron.vite.main-preload.config.ts`

### Files Modified

- `src/renderer/src/main.ts` (entry point)
- `src/renderer/index.html` (CSP for WASM)
- `package.json` (build scripts, dependencies)

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
