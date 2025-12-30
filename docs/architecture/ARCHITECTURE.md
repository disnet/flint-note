# Flint System Architecture

## Overview

This document describes the high-level architecture of the Flint note-taking application. Flint is a cross-platform desktop application built with Electron, featuring a Svelte 5 frontend with local-first data storage using Automerge CRDTs.

For migration history and implementation details, see [AUTOMERGE-MIGRATION.md](../AUTOMERGE-MIGRATION.md).

## System Components

### Core Architecture Layers

```
┌──────────────────────────────────────────────────────────────┐
│                    Renderer Process                          │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   UI Components │  │ Unified State│  │  Chat Service   │  │
│  │   (Svelte 5)    │  │  (Automerge) │  │  (AI Streaming) │  │
│  └─────────────────┘  └──────────────┘  └─────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Browser Storage (IndexedDB, OPFS)          │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
                         IPC Bridge
                              │
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                           │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Chat Server    │  │  File Sync   │  │ Secure Storage  │ │
│  │  (API Proxy)    │  │  (Markdown)  │  │   (API Keys)    │ │
│  └─────────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                      External Services
                              │
┌─────────────────────────────────────────────────────────────┐
│        ┌──────────────┐              ┌─────────────────┐    │
│        │ AI Providers │              │  File System    │    │
│        │ (OpenRouter) │              │   (Optional)    │    │
│        └──────────────┘              └─────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Process Architecture

### Electron Multi-Process Model

Flint follows Electron's standard multi-process architecture with clear separation of concerns:

#### Main Process (`src/main/`)

**Location**: `src/main/index.ts`

The main process acts as the application orchestrator and handles:

- **Window Management**: Creates and manages the main application window
- **Chat Server**: HTTP proxy server for AI API requests (keeps API keys secure)
- **File Sync**: Optional two-way sync between Automerge and markdown files
- **Secure Storage**: Manages API keys through OS-level secure storage
- **IPC Handlers**: Routes requests between renderer and external services

**Key Responsibilities**:

- Start chat proxy server for secure AI API access
- Handle file sync initialization and markdown synchronization
- Manage API key storage and retrieval
- Archive webpages by fetching and extracting content

#### Preload Script (`src/preload/`)

**Location**: `src/preload/index.ts`

The preload script creates a secure bridge between main and renderer processes:

- **API Exposure**: Exposes backend functionality through `contextBridge`
- **Type Safety**: Provides TypeScript interfaces for all IPC operations
- **Event Handling**: Manages streaming AI responses and usage tracking events
- **Security Boundary**: Ensures renderer cannot directly access Node.js APIs

#### Renderer Process (`src/renderer/`)

**Location**: `src/renderer/src/`

The renderer process implements the entire user interface and data management:

- **Svelte 5 Components**: Reactive UI components with runes-based state management
- **Automerge State**: Unified state module with CRDT-backed persistence
- **Chat Service**: AI streaming with tool calling support
- **OPFS Storage**: Origin Private File System for binary files (EPUB, PDF, webpages)

## Data Architecture

### Local-First with Automerge

All application data is stored locally using Automerge CRDTs with IndexedDB:

```
┌─────────────────────────────────────────────────────────────┐
│  IndexedDB (via automerge-repo-storage-indexeddb)           │
│  └── Automerge Documents                                    │
│      └── Vault Document (NotesDocument)                     │
│          ├── notes: Record<string, Note>                    │
│          ├── workspaces: Record<string, Workspace>          │
│          ├── noteTypes: Record<string, NoteType>            │
│          ├── conversations: Record<string, Conversation>    │
│          ├── agentRoutines: Record<string, AgentRoutine>    │
│          ├── reviewState: ReviewState                       │
│          ├── shelfItems: ShelfItemData[]                    │
│          └── lastViewState: LastViewState                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  localStorage                                                │
│  ├── flint-vaults: Vault[]           # Vault metadata       │
│  └── flint-active-vault-id: string   # Current vault ID     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  OPFS (Origin Private File System)                          │
│  ├── /epubs/{sha256-hash}.epub       # EPUB binary files    │
│  ├── /pdfs/{sha256-hash}.pdf         # PDF binary files     │
│  └── /webpages/{sha256-hash}.html    # Archived webpages    │
└─────────────────────────────────────────────────────────────┘
```

### Document Structure

The main `NotesDocument` type stored in Automerge:

```typescript
interface NotesDocument {
  schemaVersion?: number; // Schema version for migrations
  notes: Record<string, Note>;
  workspaces: Record<string, Workspace>;
  activeWorkspaceId: string;
  noteTypes: Record<string, NoteType>;
  workspaceOrder?: string[];
  conversations?: Record<string, Conversation>;
  shelfItems?: ShelfItemData[];
  lastViewState?: LastViewState;
  agentRoutines?: Record<string, AgentRoutine>;
  reviewState?: ReviewState;
  processedNoteIds?: Record<string, string>;
}
```

### Vault System

Vaults provide workspace isolation:

```typescript
interface Vault {
  id: string;
  name: string;
  docUrl: string; // Automerge document URL
  baseDirectory?: string; // Optional sync directory
  archived: boolean;
  created: string;
}
```

**Storage Pattern**:

- **Vault Metadata**: Stored in localStorage for fast bootstrap
- **Vault Content**: Stored in Automerge/IndexedDB as full document
- **One Document Per Vault**: Scalability via vault separation

## State Management

### Unified State Module (`src/renderer/src/lib/automerge/state.svelte.ts`)

All application state flows through a single module using Svelte 5 runes:

**Core Reactive State**:

```typescript
let currentDoc = $state<NotesDocument>(); // Automerge document
let docHandle: DocHandle<NotesDocument>; // Document handle
let vaults = $state<Vault[]>(); // Vault list
let activeVaultId = $state<string | null>();
let activeItem = $state<ActiveItem>(); // Current note/conversation
let activeSystemView = $state<SystemView>(); // Current system view
let isInitialized = $state(false);
let isLoading = $state(true);
```

**Initialization Flow**:

1. `initializeState()` called from `App.svelte` on mount
2. Creates Automerge repo with IndexedDB storage adapter
3. Loads vault metadata from localStorage
4. If no vaults exist → shows first-time experience
5. Subscribes to document changes via `handle.on('change', ...)`
6. Restores last view state for UX continuity
7. Connects file sync if vault has `baseDirectory` set

**Data Flow - Reading**:

```
currentDoc (Automerge)
  → getter functions (getNotes(), getActiveNote(), etc.)
  → components use $derived() for reactive updates
  → UI automatically re-renders on document changes
```

**Data Flow - Writing**:

```typescript
// All mutations use docHandle.change()
export function createNote(params) {
  if (!docHandle) return;

  docHandle.change((doc) => {
    doc.notes[noteId] = clone({
      id: noteId,
      title: params.title,
      content: params.content
      // ... other fields
    });
  });
}
```

### Key State Operations

**Note Operations**:

- `getNotes()`, `getAllNotes()`, `getNote(id)`, `searchNotes(query)`
- `createNote()`, `updateNote()`, `archiveNote()`, `deleteNote()`
- `getNoteProps()`, `setNoteProps()`, `deleteNoteProp()`

**Workspace Operations**:

- `getWorkspaces()`, `getActiveWorkspace()`
- `createWorkspace()`, `updateWorkspace()`, `deleteWorkspace()`
- `setActiveWorkspace()`, `reorderWorkspaces()`

**Sidebar Item Operations**:

- `getActiveItem()`, `setActiveItem()`
- `getPinnedItems()`, `getRecentItems()`
- `pinItem()`, `unpinItem()`, `addItemToWorkspace()`

**Conversation Operations**:

- `getConversations()`, `getConversation(id)`
- `createConversation()`, `archiveConversation()`
- `addMessageToConversation()`, `updateConversationMessage()`

## AI Integration

### Chat Service (`src/renderer/src/lib/automerge/chat-service.svelte.ts`)

The chat service handles AI communication with streaming and tool support:

```typescript
class ChatService {
  private _messages = $state<ChatMessage[]>([]);
  private _status = $state<ChatStatus>();
  private _conversationId = $state<string | null>();

  loadConversation(conversationId); // Load from Automerge
  startNewConversation(); // Create and activate
  sendMessage(text); // Stream AI response
  clearMessages();
}

// Factory function
export function createChatService(port: number): ChatService;
```

**Message Flow**:

1. User sends message via `ChatPanel` or `ConversationView`
2. User message persisted to Automerge via `addMessageToConversation()`
3. Service calls `streamText()` from Vercel AI SDK
4. Uses chat server proxy at `http://127.0.0.1:{port}/api/chat/proxy`
5. API key handled by proxy server (not exposed to renderer)
6. Streams text chunks and tool calls to UI
7. Tools execute in renderer, results sent back to AI
8. Final message persisted to Automerge

### Tool Integration

AI tools are defined in the renderer and executed during conversations:

- `createNoteTools()` - Note CRUD, search, type management
- `createEpubTools()` - EPUB content access and navigation
- `createPdfTools()` - PDF content access and search
- `createRoutineTools()` - Agent routine management

**Tool Pattern**:

```typescript
const tools = {
  create_note: {
    description: 'Create a new note',
    parameters: z.object({
      title: z.string(),
      content: z.string(),
      type: z.string().optional()
    }),
    execute: async ({ title, content, type }) => {
      const note = createNote({ title, content, type });
      return { success: true, noteId: note.id };
    }
  }
};
```

### Conversation Storage

Conversations are stored in the Automerge document:

```typescript
interface Conversation {
  id: string; // "conv-xxxxxxxx"
  title: string;
  workspaceId: string;
  messages: PersistedChatMessage[];
  created: string;
  updated: string;
  archived: boolean;
}

interface PersistedChatMessage {
  id: string; // "msg-xxxxxxxx"
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: PersistedToolCall[];
  createdAt: string;
}
```

## Frontend Architecture

### Component Hierarchy

```
App.svelte (Root)
├── FirstTimeExperience.svelte (vault creation)
└── MainView.svelte (main app)
    ├── LeftSidebar.svelte
    │   ├── SystemViews.svelte
    │   ├── SidebarItems.svelte (unified pinned/recent)
    │   └── WorkspaceBar.svelte
    ├── Content Area (view router)
    │   ├── NoteEditor.svelte
    │   ├── ConversationView.svelte
    │   ├── DailyView.svelte
    │   ├── SearchResults.svelte
    │   ├── NoteTypesView.svelte
    │   ├── ReviewView.svelte
    │   ├── RoutinesView.svelte
    │   ├── InboxView.svelte
    │   ├── EpubViewer.svelte
    │   ├── PdfViewer.svelte
    │   ├── WebpageViewer.svelte
    │   └── DeckViewer.svelte
    └── Right Panels (floating)
        ├── ChatPanel.svelte
        ├── ShelfPanel.svelte
        └── FABMenu.svelte
```

### View Routing

`MainView.svelte` routes based on active item and system view:

```typescript
const activeItem = $derived(getActiveItem()); // { type, id } or null
const activeSystemView = $derived(getActiveSystemView()); // system view name

// Routing logic
{#if activeItem?.type === 'note'}
  // Check note type for specialized viewers
  {#if noteType === 'type-epub'}
    <EpubViewer />
  {:else if noteType === 'type-pdf'}
    <PdfViewer />
  {:else if noteType === 'type-webpage'}
    <WebpageViewer />
  {:else if noteType === 'type-deck'}
    <DeckViewer />
  {:else}
    <NoteEditor />
  {/if}
{:else if activeItem?.type === 'conversation'}
  <ConversationView />
{:else if activeSystemView === 'daily'}
  <DailyView />
{:else if activeSystemView === 'review'}
  <ReviewView />
// ... other system views
{/if}
```

### Sidebar Items

The sidebar uses a unified item model supporting multiple types:

```typescript
type SidebarItemType = 'note' | 'conversation';

interface SidebarItemRef {
  type: SidebarItemType;
  id: string;
}

interface Workspace {
  pinnedItemIds: SidebarItemRef[];
  recentItemIds: SidebarItemRef[];
}
```

## Specialized Note Types

### Standard Note Types

| Type ID        | Purpose                | Storage                     |
| -------------- | ---------------------- | --------------------------- |
| `type-default` | General markdown notes | Automerge                   |
| `type-daily`   | Daily capture notes    | Automerge (ID: daily-DATE)  |
| `type-deck`    | Filtered note views    | Automerge (YAML in content) |
| `type-epub`    | E-books                | Automerge + OPFS            |
| `type-pdf`     | PDF documents          | Automerge + OPFS            |
| `type-webpage` | Archived web pages     | Automerge + OPFS            |
| User-created   | Custom note types      | Automerge                   |

### Binary File Storage Pattern

For EPUB, PDF, and webpage types:

```typescript
// Metadata in Automerge note
interface EpubNoteProps {
  epubHash: string; // SHA-256 hash for OPFS lookup
  epubTitle?: string;
  epubAuthor?: string;
  currentCfi?: string; // Reading position
  progress?: number;
  lastRead?: string;
}

// Binary file in OPFS
// Path: /epubs/{epubHash}.epub
```

**Benefits**:

- Content-addressed storage enables deduplication
- OPFS is device-local (re-import on each device)
- Metadata syncs via Automerge
- Reading state persists across sessions

## IPC Architecture

### Main Process Handlers

```typescript
// Chat/AI Handlers
ipcMain.handle('get-chat-server-port', () => chatServerPort);

// Streaming handled via preload callbacks
window.api?.sendMessageStream(params, onStart, onChunk, onEnd, onError);

// Events sent to renderer:
// - ai-stream-start, ai-stream-chunk, ai-stream-tool-call
// - ai-stream-tool-result, ai-stream-end, ai-stream-error
// - ai-usage-recorded

// Vault Sync Handlers
ipcMain.handle('init-vault-sync', async (e, { vaultId, baseDirectory, docUrl }) => { ... });
ipcMain.handle('dispose-vault-sync', async (e, { vaultId }) => { ... });
ipcMain.on('automerge-repo-message', (e, { vaultId, data }) => { ... });

// Storage Handlers
ipcMain.handle('store-api-key', async (e, { provider, apiKey }) => { ... });
ipcMain.handle('get-api-key', async (e, { provider }) => { ... });
ipcMain.handle('load-app-settings', async () => { ... });
ipcMain.handle('save-app-settings', async (e, settings) => { ... });

// File Operations
ipcMain.handle('archive-webpage', async (e, { url }) => { ... });
ipcMain.handle('open-external', async (e, url) => { ... });
```

### File Sync Architecture

Optional two-way sync between Automerge and markdown files:

```
[Renderer Process]
  ├── Automerge Repo (IndexedDB)
  ├── IPCNetworkAdapterRenderer
  └── IPC Channel: "automerge-repo-message"
       ↓↑
[Main Process]
  ├── IPCNetworkAdapterMain
  ├── Automerge Repo (NodeFS in .automerge/)
  ├── Markdown Sync (file watcher + frontmatter)
  └── Filesystem: baseDirectory/notes/<TypeName>/*.md
```

**Features**:

- Edit in app → updates markdown file
- Edit markdown externally → updates note in app
- Create new .md file → imports as new note
- Delete .md file → archives note
- YAML frontmatter preserves metadata

## Key Architecture Patterns

### Pattern 1: Reactive State with Svelte 5 Runes

```typescript
// State declaration
let notes = $state<Note[]>([]);

// Derived values
const activeNotes = $derived(notes.filter((n) => !n.archived));

// Components automatically re-render when state changes
```

### Pattern 2: Snapshot for IPC Serialization

```typescript
// ❌ WRONG - reactive state contains metadata that can't be cloned
await window.api?.saveData(this.reactiveState);

// ✅ CORRECT - snapshot creates plain object
const serializable = $state.snapshot(this.reactiveState);
await window.api?.saveData(serializable);
```

### Pattern 3: Clone for Automerge Mutations

```typescript
// ❌ WRONG - may reference existing document objects
docHandle.change((doc) => {
  doc.config = externalConfig;
});

// ✅ CORRECT - clone creates fresh plain object
docHandle.change((doc) => {
  doc.config = clone(externalConfig);
});
```

### Pattern 4: Persisted UI State

```typescript
// View state saved to Automerge when changed
function setActiveItem(item: ActiveItem) {
  activeItem = item;
  docHandle?.change((doc) => {
    doc.lastViewState = { activeItem, systemView: activeSystemView };
  });
}

// Restored on app initialization
function restoreLastViewState() {
  if (doc?.lastViewState) {
    activeItem = doc.lastViewState.activeItem;
    activeSystemView = doc.lastViewState.systemView;
  }
}
```

## Storage Services

### Secure Storage Service

Manages API keys using OS-level secure storage:

- **Platform Integration**: Keychain on macOS, Credential Manager on Windows
- **Provider Support**: OpenRouter, Anthropic, OpenAI
- **Key Validation**: Test keys before storage

### Settings Storage Service

Manages application preferences:

- **App Settings**: Theme, editor preferences
- **Model Preferences**: AI model selection
- **Cache Metrics**: Token usage and optimization

## Security Architecture

### Credential Management

- **No Plaintext Storage**: API keys stored in OS secure storage
- **Proxy Pattern**: Chat server in main process handles API keys
- **Renderer Isolation**: Renderer never sees raw API keys

### Process Security

- **Context Isolation**: Renderer cannot access Node.js directly
- **Preload Bridge**: Limited API surface through secure preload
- **Content Security Policy**: WASM-unsafe-eval only (required for Automerge)

### Data Protection

- **Local Processing**: All note data stored and processed locally
- **Optional Cloud**: AI API calls are user-initiated and controllable
- **No Analytics**: No telemetry or usage tracking

## Performance Architecture

### Automerge Optimizations

- **Incremental Changes**: Only changed data is persisted
- **Lazy Loading**: Documents loaded on vault switch
- **Debounced Updates**: Writing state changes batched

### UI Performance

- **Svelte 5 Reactivity**: Fine-grained updates via runes
- **Derived State**: Computed values cached until dependencies change
- **Virtualization**: Large lists use virtual scrolling where needed

### Search

- **Client-Side Indexing**: Full-text search in renderer
- **Ranked Results**: Multi-factor scoring (title, content, recency)
- **Highlighted Matches**: Context extraction around matches

## Deployment

### Application Packaging

- **Electron Builder**: Cross-platform packaging
- **Auto-Update**: Built-in update mechanism
- **Code Signing**: Platform-specific signing
- **Asset Optimization**: Bundled and optimized

### Build Configuration

- **Vite for Renderer**: Separate build with WASM support
- **Electron-Vite for Main/Preload**: Electron-specific bundling
- **TypeScript**: Full type safety across all code

## Data Flow Summary

```
┌─────────────────────────────────────────────────┐
│  User Interaction                               │
│  (click, type, navigate)                        │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  Svelte Components                              │
│  (NoteEditor, ChatPanel, etc.)                  │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  State Module (state.svelte.ts)                 │
│  ├─ docHandle.change() for mutations           │
│  └─ getter functions for reads                 │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  Automerge Document                             │
│  (CRDT with automatic conflict resolution)      │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  IndexedDB                                      │
│  (Persistent storage via automerge-repo)        │
└─────────────────────────────────────────────────┘

Optional File Sync:
  IndexedDB ←→ IPC ←→ Markdown Files
```

This architecture provides a robust foundation for a local-first, AI-integrated note-taking application while maintaining simplicity through unified state management and CRDT-based data synchronization.
