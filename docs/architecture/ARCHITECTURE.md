# Flint System Architecture

## Overview

This document describes the high-level architecture of the Flint note-taking application, complementing the [Design Document](./DESIGN.md) by focusing on the technical system components, process communication, and service integration patterns.

Flint is a cross-platform desktop application built with Electron, featuring a Svelte 5 frontend and a Node.js backend that integrates with AI services through the Model Context Protocol (MCP).

## System Components

### Core Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer Process                     │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   UI Components │  │ State Stores │  │   Services  │ │
│  │   (Svelte 5)    │  │   (Runes)    │  │ (Frontend)  │ │
│  └─────────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────┘
                              │
                         IPC Bridge
                              │
┌─────────────────────────────────────────────────────────┐
│                      Main Process                       │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   AI Service    │  │ Note Service │  │   Storage   │ │
│  │   (MCP Client)  │  │ (Flint API)  │  │   Service   │ │
│  └─────────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────┘
                              │
                      External Services
                              │
┌─────────────────────────────────────────────────────────┐
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Flint MCP Server│  │ AI Providers │  │ File System │ │
│  │ (@flint-note/   │  │ (Anthropic,  │  │   Storage   │ │
│  │   server)       │  │  OpenAI)     │  │             │ │
│  └─────────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Process Architecture

### Electron Multi-Process Model

Flint follows Electron's standard multi-process architecture with clear separation of concerns:

#### Main Process (`src/main/`)

**Location**: `src/main/index.ts`

The main process acts as the application orchestrator and handles:

- **Window Management**: Creates and manages the main application window
- **Service Initialization**: Bootstraps AI Service, Note Service, and Secure Storage
- **IPC Coordination**: Exposes backend functionality through Inter-Process Communication handlers
- **Security**: Manages API keys through secure storage service
- **Process Lifecycle**: Handles application startup, shutdown, and platform-specific behaviors

**Key Responsibilities**:

- Initialize services in proper order (Note Service → Secure Storage → AI Service)
- Forward AI streaming events between backend services and renderer
- Provide fallback mechanisms when services fail to initialize
- Handle usage tracking and cost monitoring

#### Preload Script (`src/preload/`)

**Location**: `src/preload/index.ts`

The preload script creates a secure bridge between main and renderer processes:

- **API Exposure**: Exposes backend functionality through `contextBridge`
- **Type Safety**: Provides TypeScript interfaces for all IPC operations
- **Event Handling**: Manages streaming AI responses and usage tracking events
- **Security Boundary**: Ensures renderer cannot directly access Node.js APIs

#### Renderer Process (`src/renderer/`)

**Location**: `src/renderer/src/`

The renderer process implements the entire user interface using modern web technologies:

- **Svelte 5 Components**: Reactive UI components with runes-based state management
- **Service Layer**: Frontend services that communicate with main process via IPC
- **State Management**: Distributed stores for different application concerns
- **Event Coordination**: Handles real-time updates from AI streaming and usage tracking

## Service Architecture

### AI Service Integration

#### AI Service (`src/main/ai-service.ts`)

The AI Service is the central coordinator for all AI-related functionality:

**Core Features**:

- **Multi-Provider Support**: Integrates with Anthropic, OpenAI, and OpenRouter
- **Conversation Management**: Maintains conversation history with automatic pruning (20 message limit)
- **Prompt Caching**: Advanced caching strategies for system messages and conversation history
- **Streaming Support**: Real-time message streaming with tool call handling and abort control
- **Cost Tracking**: Precise token usage and cost calculation in micro-cents
- **Performance Monitoring**: Cache hit rates, token savings, and optimization recommendations
- **Custom Functions Integration**: Executes user-defined JavaScript functions via CustomFunctionsApi
- **Review Mode**: Specialized prompts for spaced repetition reviews
- **Todo Plans**: Generates and tracks AI-created task lists via TodoPlanService

**Key Components**:

```typescript
class AIService extends EventEmitter {
  // Model and conversation management
  private currentModelName: string;
  private conversationHistories: Map<string, ModelMessage[]>;
  private currentConversationId: string | null;

  // MCP integration
  private mcpClient: unknown;
  private gateway: GatewayProvider;

  // Caching and performance
  private cacheConfig: CacheConfig;
  private cacheMetrics: CacheMetrics;

  // Services integration
  private noteService: NoteService | null;
  private customFunctionsApi: CustomFunctionsApi | null;
  private todoPlanService: TodoPlanService | null;
}
```

#### MCP Server Integration

The AI Service connects to the Flint MCP Server for note operations:

**Connection Pattern**:

- **Process**: Spawns `@flint-note/server` as a separate Node.js process
- **Transport**: Uses stdio-based communication via `StdioMCPTransport`
- **Tools**: Exposes comprehensive note management tools to AI models
- **Initialization**: Handles connection failures gracefully with fallback responses

**Tool Categories**:

- Note Management: Create, read, update, delete, rename, move notes
- Search Operations: Text search, advanced filtering, metadata queries
- Note Type Management: Create and manage note type schemas
- Vault Operations: Multi-vault workspace management
- Link Operations: Wikilink tracking, backlinks, broken link detection

### Note Service Integration

#### Note Service (`src/main/note-service.ts`)

The Note Service provides a clean abstraction over the Flint Note API:

**Architecture**:

```typescript
class NoteService {
  private api: FlintNoteApi;
  private isInitialized: boolean;

  // Initialization and lifecycle management
  async initialize(): Promise<void>;
  private ensureInitialized(): void;

  // Core CRUD operations
  async createNote(type, identifier, content, vaultId?): Promise<NoteInfo>;
  async getNote(identifier, vaultId?): Promise<Note>;
  async updateNote(identifier, content, vaultId?, metadata?): Promise<UpdateResult>;
  async deleteNote(identifier, vaultId?): Promise<DeleteNoteResult>;

  // Advanced operations
  async searchNotes(query, vaultId?, limit?): Promise<SearchResult[]>;
  async listNoteTypes(): Promise<NoteTypeListItem[]>;
  async listVaults(): Promise<VaultInfo[]>;
}
```

**Integration Pattern**:

- **Dependency**: Uses `@flint-note/server` package as a library
- **Initialization**: Must be initialized before the AI Service can access note tools
- **Error Handling**: Graceful degradation when note operations fail
- **Type Safety**: Provides TypeScript interfaces for all note operations

### Storage Services

#### File System Storage Architecture

Flint uses a comprehensive file system storage architecture. All application state is persisted to the file system through dedicated storage services.

**File System Structure**:

```
{userData}/
├── secure/                          # OS-level secure storage
│   └── encrypted-data.bin          # API keys and sensitive data
├── settings/                        # Global application settings
│   ├── app-settings.json           # Main app preferences
│   ├── model-preferences.json      # AI model selection
│   └── sidebar-state.json          # Sidebar collapse/expand state
├── vault-data/                      # Vault-specific data
│   ├── default/                    # Default vault data
│   │   ├── conversations.json      # AI chat history
│   │   ├── temporary-tabs.json     # Arc-style tab management
│   │   ├── navigation-history.json # Navigation history
│   │   ├── active-note.json        # Currently active note
│   │   └── cursor-positions.json   # Editor cursor positions per note
│   ├── vault-{id}/                 # Specific vault data
│   │   ├── conversations.json
│   │   ├── temporary-tabs.json
│   │   ├── navigation-history.json
│   │   ├── active-note.json
│   │   └── cursor-positions.json
│   └── ...
```

#### Base Storage Service (`src/main/storage-service.ts`)

Provides common file operations that specialized services extend:

**Core Features**:

- **File Operations**: JSON serialization, directory management, error handling
- **Type Safety**: Generic methods with TypeScript support
- **Error Recovery**: Graceful fallbacks to default values on read failures
- **Atomic Operations**: Safe file writes with temporary file strategy

```typescript
export class BaseStorageService {
  protected async ensureDirectory(dirPath: string): Promise<void>;
  protected async readJsonFile<T>(filePath: string, defaultValue: T): Promise<T>;
  protected async writeJsonFile<T>(filePath: string, data: T): Promise<void>;
  protected async deleteFile(filePath: string): Promise<void>;
  protected async listFiles(dirPath: string): Promise<string[]>;
}
```

#### Settings Storage Service (`src/main/settings-storage-service.ts`)

Manages global application settings:

**Responsibilities**:

- **Global Preferences**: App settings, model selection
- **UI State**: Sidebar configuration stored separately in sidebar-state.json
- **Non-Vault Data**: Settings that persist across all vaults

#### Vault Data Storage Service (`src/main/vault-data-storage-service.ts`)

Manages vault-specific data with automatic isolation:

**Features**:

- **Vault Isolation**: Automatic data separation per vault ID
- **Chat History**: Conversation management with cost tracking
- **Navigation State**: Tab management and navigation history
- **Active State**: Currently selected notes per vault
- **Editor State**: Cursor positions per note for seamless editing restoration

#### Secure Storage Service (`src/main/secure-storage-service.ts`)

Manages sensitive data like API keys:

**Features**:

- **Platform Integration**: Uses OS-level secure storage (Keychain on macOS, etc.)
- **Provider Support**: Manages keys for Anthropic, OpenAI, and OpenRouter
- **Key Testing**: Validates API keys before storage
- **Fallback Handling**: Graceful degradation when secure storage is unavailable

#### Workflow Service (`src/main/workflow-service.ts`)

Manages workflow lifecycle and task tracking:

**Features**:

- **Workflow CRUD**: Create, update, delete, and retrieve workflows
- **Material Tracking**: Link notes and resources to workflows
- **Status Management**: Track workflow completion and progress
- **Due Date Handling**: Schedule and filter workflows by due date
- **Recurring Workflows**: Support for repeating workflow patterns

#### Todo Plan Service (`src/main/todo-plan-service.ts`)

Manages AI-generated todo plans within conversations:

**Features**:

- **Plan Generation**: AI creates structured task lists during chat
- **Task Tracking**: Monitor todo item completion status
- **Conversation Integration**: Plans tied to specific conversation threads
- **Plan Abandonment**: Automatic cleanup when new plans are created

#### Auto Updater Service (`src/main/auto-updater-service.ts`)

Handles automatic application updates:

**Features**:

- **Update Detection**: Checks for new versions
- **Download Management**: Downloads updates in background
- **Installation**: Prompts user to install updates
- **Platform Support**: Cross-platform update handling

#### Custom Functions API (`src/server/api/custom-functions-api.ts`)

Enables user-defined JavaScript functions for AI tool execution:

**Features**:

- **Function Registration**: Store and manage custom JavaScript functions
- **Sandboxed Execution**: WASM-based code evaluation for security
- **TypeScript Support**: Compile TypeScript functions before execution
- **Custom Context**: Inject API access into function execution environment
- **Validation**: Test and validate functions before use
- **Import/Export**: Share functions across installations
- **Tag-Based Organization**: Filter and categorize functions by tags

### Review System (Spaced Repetition)

Flint includes a comprehensive spaced repetition system for knowledge retention:

**Architecture**:

- **Note-Level Reviews**: Individual notes can be enabled for review
- **Session-Based**: Reviews are organized into daily sessions
- **AI-Powered**: Uses AI to generate review prompts and analyze responses
- **Statistics Tracking**: Monitors review progress, completion rates, and session availability

**Key Features**:

- **Review Configuration**: Customizable review modes (default vs custom prompts)
- **Review Statistics**: Track notes due for review, total enabled, retired notes
- **Session Management**: One session per day with increment controls
- **Review Modes**: Default AI prompts or custom per-note-type prompts
- **Completion Tracking**: Marks notes as reviewed and schedules next review

**Integration Points**:

- Backend: Review state stored in note metadata via Note Service
- Frontend: reviewStore manages UI state and statistics
- AI Service: Generates review prompts and analyzes user responses
- IPC: Comprehensive handlers for review operations, stats, and configuration

## Frontend Architecture

### Component Hierarchy

```
App.svelte (Root)
├── LeftSidebar.svelte
│   ├── VaultSwitcher.svelte
│   ├── SystemViews.svelte
│   ├── PinnedNotes.svelte
│   └── TemporaryTabs.svelte
├── MainView.svelte
│   └── NoteEditor.svelte
└── RightSidebar.svelte
    ├── Agent.svelte
    │   ├── MessageComponent.svelte
    │   ├── MessageInput.svelte
    │   ├── ToolCallComponent.svelte
    │   └── LoadingMessage.svelte
    └── MetadataEditor.svelte
```

### State Management

#### Distributed Store Architecture with File System Persistence

Each major feature area has its own state store that automatically persists to the file system. All stores use async initialization patterns with loading states to handle file system operations.

**Core Stores**:

- `notesStore.svelte.ts` - Note data and active note management (ephemeral, not persisted)
- `modelStore.svelte.ts` - AI model selection → `settings/model-preferences.json`
- `settingsStore.svelte.ts` - Application preferences → `settings/app-settings.json`
- `sidebarState.svelte.ts` - UI layout and sidebar visibility → `settings/sidebar-state.json`
- `temporaryTabsStore.svelte.ts` - Arc-style tab management → `vault-data/{vaultId}/temporary-tabs.json`
- `unifiedChatStore.svelte.ts` - AI conversation state → `vault-data/{vaultId}/conversations.json`
- `activeNoteStore.svelte.ts` - Active note per vault → `vault-data/{vaultId}/active-note.json`
- `navigationHistoryStore.svelte.ts` - Navigation history → `vault-data/{vaultId}/navigation-history.json`
- `workflowStore.svelte.ts` - Workflow management and filtering (ephemeral, loaded from backend)
- `reviewStore.svelte.ts` - Spaced repetition system state (ephemeral, loaded from backend)
- `todoPlanStore.svelte.ts` - AI-generated task lists within conversations (ephemeral)
- `workspacesStore.svelte.ts` - Vault list and current vault tracking (ephemeral)
- `customFunctionsStore.svelte.ts` - Custom function list and search (ephemeral)
- `cursorPositionManager.svelte.ts` - Editor cursor position restoration → `vault-data/{vaultId}/cursor-positions.json`
- `dailyViewStore.svelte.ts` - Daily note view state (ephemeral)
- `inboxStore.svelte.ts` - Inbox (unprocessed notes) state (ephemeral)
- `notesShelfStore.svelte.ts` - Pinned/recent notes shelf (ephemeral)
- `noteDocumentRegistry.svelte.ts` - Open note document tracking (ephemeral)
- `dragState.svelte.ts` - Drag and drop state (ephemeral)
- `editorConfig.svelte.ts` - Editor preferences (ephemeral)
- `scrollAutoService.svelte.ts` - Auto-scroll behavior (ephemeral)

**Store Pattern with File System Persistence**:

```typescript
// Modern store pattern with async file system operations
class MigratedStore {
  private data = $state(defaultData);
  private isLoading = $state(true);
  private isInitialized = $state(false);
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initialize();
  }

  get loading(): boolean {
    return this.isLoading;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  // Ensure initialization is complete before operations
  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  private async initialize(): Promise<void> {
    this.isLoading = true;
    try {
      // Load data from file system via IPC
      const stored = await window.api?.loadYourData(/* params */);
      if (stored) {
        this.data = { ...defaultData, ...stored };
      }
    } catch (error) {
      console.warn('Store initialization failed:', error);
      // Use default state
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  // All mutation methods are async and persist to file system
  async updateData(newData: DataType): Promise<void> {
    await this.ensureInitialized();
    this.data = newData;
    // Persist to file system via IPC using snapshot for serialization
    await window.api?.saveYourData($state.snapshot(newData));
  }
}
```

**Key Architecture Benefits**:

- **Reliability**: Data survives browser cache clearing and storage limitations
- **Vault Isolation**: Automatic data separation between different vaults
- **Performance**: Async operations with proper loading states
- **Type Safety**: Full TypeScript support with IPC communication
- **Error Recovery**: Graceful fallbacks to default values on failures

### Service Layer (Frontend)

#### Message Bus (`src/renderer/src/services/messageBus.svelte.ts`)

Centralized event pub/sub system:

**Features**:

- **Event Publishing**: Publish typed events to subscribers
- **Event Subscription**: Subscribe to specific or all event types
- **Event Logging**: Debug logging of all published events
- **Type Safety**: Full TypeScript support for event types

#### Note Store (`src/renderer/src/services/noteStore.svelte.ts`)

Note metadata management and filtering:

**Features**:

- **Note Metadata**: Uses noteCache for in-memory note data
- **Active Notes**: Derives filtered list of non-archived notes
- **Grouped Notes**: Organizes notes by type
- **Note Type Access**: Lists available note types

#### Note Cache (`src/renderer/src/services/noteCache.svelte.ts`)

In-memory note metadata cache:

**Features**:

- **Initialization**: Loads all note metadata on startup
- **Event-Driven Updates**: Reacts to messageBus note events
- **Fast Access**: Provides `getAllNotes()` for derived stores
- **Type Safety**: Maintains type information for all notes

#### Chat Service (`src/renderer/src/services/electronChatService.ts`)

Handles AI communication in the renderer:

**Responsibilities**:

- **IPC Communication**: Bridges frontend chat operations to main process
- **Streaming Management**: Handles real-time message streaming
- **Error Handling**: Provides fallback behavior for AI service failures
- **Event Coordination**: Manages conversation state and message history

#### Note Navigation Service (`src/renderer/src/services/noteNavigationService.svelte.ts`)

Manages note discovery and navigation:

**Features**:

- **Search Integration**: Connects search UI to backend search operations
- **Wikilink Resolution**: Handles note linking and navigation
- **Temporary Tabs**: Manages Arc-style temporary note access
- **State Synchronization**: Keeps frontend note state in sync with backend

#### Wikilink Service (`src/renderer/src/services/wikilinkService.svelte.ts`)

Handles wikilink parsing and resolution:

**Features**:

- **Link Extraction**: Parses wikilinks from note content
- **Link Resolution**: Resolves wikilinks to actual note IDs
- **Link Validation**: Checks for broken or invalid links
- **Link Formatting**: Standardizes wikilink syntax

#### Secure Storage Service (`src/renderer/src/services/secureStorageService.ts`)

Frontend interface to secure storage:

**Features**:

- **API Key Access**: Retrieves stored API keys via IPC
- **Provider Credits**: Checks OpenRouter account balance
- **Key Storage**: Stores new API keys securely
- **Key Testing**: Validates API keys before use

#### Vault Availability Service (`src/renderer/src/services/vaultAvailabilityService.svelte.ts`)

Monitors vault status and availability:

**Features**:

- **Vault Status**: Checks if vaults are accessible
- **Error Detection**: Identifies vault access issues
- **Status Updates**: Provides real-time vault availability

#### Migration Service (`src/renderer/src/services/migrationService.svelte.ts`)

Handles data migration during vault operations:

**Features**:

- **Schema Migration**: Updates data structures when switching vaults
- **Data Conversion**: Converts between old and new formats
- **Migration Tracking**: Monitors migration progress and errors
- **Rollback Support**: Handles migration failures gracefully

#### Scroll Auto Service (`src/renderer/src/services/scrollAutoService.svelte.ts`)

Manages automatic scrolling behavior:

**Features**:

- **Auto-Scroll**: Automatically scrolls to new content
- **Scroll Detection**: Detects user-initiated scrolling
- **Scroll State**: Maintains scroll position across navigation
- **Smooth Scrolling**: Provides smooth scroll animations

## Communication Patterns

### Event System Architecture

#### Message Bus (`src/renderer/src/services/messageBus.svelte.ts`)

Flint uses a centralized event bus for frontend event coordination:

**Event-Driven Pattern**:

- **Publisher-Subscriber**: Components publish events, stores subscribe to them
- **Decoupled Communication**: Components don't need direct references to each other
- **Event Logging**: All events logged for debugging and auditing
- **Wildcard Support**: Subscribe to all events or specific event types

**Event Categories**:

```typescript
// Note Events
type NoteEvent =
  | { type: 'note:created', data: { noteId: string, noteType: string } }
  | { type: 'note:updated', data: { noteId: string, content: string } }
  | { type: 'note:deleted', data: { noteId: string } }
  | { type: 'note:renamed', data: { oldId: string, newId: string } }
  | { type: 'note:moved', data: { noteId: string, newPath: string } }
  | { type: 'note:archived', data: { noteId: string } };

// Workflow Events
type WorkflowEvent =
  | { type: 'workflow:created', data: { workflowId: string } }
  | { type: 'workflow:updated', data: { workflowId: string } }
  | { type: 'workflow:completed', data: { workflowId: string } }
  | { type: 'workflow:deleted', data: { workflowId: string } };

// Review Events
type ReviewEvent =
  | { type: 'review:enabled', data: { noteId: string } }
  | { type: 'review:disabled', data: { noteId: string } }
  | { type: 'review:completed', data: { noteId: string } };

// Toast Events
type ToastEvent =
  | { type: 'toast:show', data: { message: string, variant: 'success' | 'error' | 'info' } };
```

**Usage Pattern**:

```typescript
// Publishing events
import { messageBus } from './messageBus.svelte';
messageBus.publish({ type: 'note:created', data: { noteId, noteType } });

// Subscribing to events
const unsubscribe = messageBus.subscribe('note:created', (event) => {
  console.log('Note created:', event.data.noteId);
});

// Wildcard subscription
const unsubAll = messageBus.subscribe('*', (event) => {
  console.log('Event:', event);
});
```

**Integration with Backend**:

- Main process publishes events via `window.dispatchEvent(new CustomEvent('note-event'))`
- Renderer listens with `window.addEventListener('note-event')` and forwards to messageBus
- Stores react to events and update state accordingly

### IPC Architecture

#### Main → Renderer Communication

- **Usage Events**: AI usage and cost data forwarding
- **Stream Events**: Real-time AI response streaming
- **Status Updates**: Service initialization and health status

#### Renderer → Main Communication

- **Note Operations**: All CRUD operations go through IPC handlers
- **AI Requests**: Message sending and conversation management
- **Storage Operations**: File system persistence for all app state
- **Configuration**: Settings and API key management

**IPC Handler Categories** (200+ handlers total):

```typescript
// Note Operations
ipcMain.handle('create-note', async (_event, { type, identifier, content, vaultId }) => { ... });
ipcMain.handle('get-note', async (_event, { identifier, vaultId }) => { ... });
ipcMain.handle('update-note', async (_event, { identifier, content, vaultId, metadata }) => { ... });
ipcMain.handle('delete-note', async (_event, { identifier, vaultId }) => { ... });
ipcMain.handle('rename-note', async (_event, { oldIdentifier, newIdentifier, vaultId }) => { ... });
ipcMain.handle('move-note', async (_event, { identifier, newPath, vaultId }) => { ... });
ipcMain.handle('archive-note', async (_event, { identifier, vaultId }) => { ... });
ipcMain.handle('search-notes', async (_event, { query, vaultId, limit }) => { ... });

// Note Type Management
ipcMain.handle('list-note-types', async (_event, { vaultId }) => { ... });
ipcMain.handle('create-note-type', async (_event, { name, schema, vaultId }) => { ... });
ipcMain.handle('update-note-type', async (_event, { name, schema, vaultId }) => { ... });
ipcMain.handle('delete-note-type', async (_event, { name, vaultId }) => { ... });

// Review System (Spaced Repetition)
ipcMain.handle('enable-review', async (_event, { identifier, vaultId }) => { ... });
ipcMain.handle('disable-review', async (_event, { identifier, vaultId }) => { ... });
ipcMain.handle('complete-review', async (_event, { identifier, vaultId, response }) => { ... });
ipcMain.handle('get-review-stats', async (_event, { vaultId }) => { ... });
ipcMain.handle('get-notes-for-review', async (_event, { vaultId, limit }) => { ... });
ipcMain.handle('get-review-config', async (_event, { vaultId }) => { ... });
ipcMain.handle('update-review-config', async (_event, { vaultId, config }) => { ... });

// Workflow Operations
ipcMain.handle('workflow:create', async (_event, { workflow, vaultId }) => { ... });
ipcMain.handle('workflow:update', async (_event, { id, updates, vaultId }) => { ... });
ipcMain.handle('workflow:delete', async (_event, { id, vaultId }) => { ... });
ipcMain.handle('workflow:complete', async (_event, { id, vaultId }) => { ... });
ipcMain.handle('workflow:list', async (_event, { vaultId }) => { ... });

// Custom Functions
ipcMain.handle('create-custom-function', async (_event, { name, code, tags }) => { ... });
ipcMain.handle('update-custom-function', async (_event, { id, name, code, tags }) => { ... });
ipcMain.handle('delete-custom-function', async (_event, { id }) => { ... });
ipcMain.handle('list-custom-functions', async () => { ... });
ipcMain.handle('test-custom-function', async (_event, { id, testInput }) => { ... });

// AI & Chat
ipcMain.handle('send-message', async (_event, { message, conversationId }) => { ... });
ipcMain.handle('send-message-stream', async (_event, { message, conversationId }) => { ... });
ipcMain.handle('clear-conversation', async (_event, { conversationId }) => { ... });
ipcMain.handle('switch-ai-provider', async (_event, { provider }) => { ... });
ipcMain.handle('get-cache-metrics', async () => { ... });

// Vault Management
ipcMain.handle('list-vaults', async () => { ... });
ipcMain.handle('create-vault', async (_event, { name, path }) => { ... });
ipcMain.handle('switch-vault', async (_event, { vaultId }) => { ... });
ipcMain.handle('remove-vault', async (_event, { vaultId }) => { ... });

// Storage (Settings & State)
ipcMain.handle('load-app-settings', async () => { ... });
ipcMain.handle('save-app-settings', async (_event, settings) => { ... });
ipcMain.handle('load-model-preference', async () => { ... });
ipcMain.handle('save-model-preference', async (_event, modelId) => { ... });
ipcMain.handle('load-sidebar-state', async () => { ... });
ipcMain.handle('save-sidebar-state', async (_event, state) => { ... });
ipcMain.handle('load-conversations', async (_event, { vaultId }) => { ... });
ipcMain.handle('save-conversations', async (_event, { vaultId, conversations }) => { ... });
ipcMain.handle('load-temporary-tabs', async (_event, { vaultId }) => { ... });
ipcMain.handle('save-temporary-tabs', async (_event, { vaultId, tabs }) => { ... });
ipcMain.handle('get-cursor-position', async (_event, { noteId, vaultId }) => { ... });
ipcMain.handle('set-cursor-position', async (_event, { noteId, position, vaultId }) => { ... });

// API Key Management
ipcMain.handle('store-api-key', async (_event, { provider, apiKey }) => { ... });
ipcMain.handle('get-api-key', async (_event, { provider }) => { ... });
ipcMain.handle('get-openrouter-credits', async () => { ... });

// Daily View & Inbox
ipcMain.handle('get-or-create-daily-note', async (_event, { date, vaultId }) => { ... });
ipcMain.handle('get-recent-unprocessed-notes', async (_event, { vaultId, limit }) => { ... });
ipcMain.handle('mark-note-as-processed', async (_event, { identifier, vaultId }) => { ... });
```

#### Event Flow Example (AI Streaming)

```
[Renderer] User sends message
    ↓ (IPC invoke)
[Main] sendMessageStream handler
    ↓ (AI Service)
[AI Service] Stream processing
    ↓ (Events)
[Main] Forward stream events
    ↓ (IPC send)
[Renderer] Update UI in real-time
```

### Thread Management

#### Service Threading

- **Main Thread**: UI operations and Electron window management
- **AI Service Thread**: Conversation processing and model communication
- **MCP Server Process**: Separate Node.js process for note operations
- **Background Tasks**: File system operations and search indexing

#### Concurrency Patterns

- **Async/Await**: Primary concurrency model throughout the application
- **Event Emitters**: AI Service uses EventEmitter for stream coordination
- **Promise Queuing**: Conversation management with ordered message processing
- **Debounced Operations**: Auto-save and search operations use debouncing

## External Integrations

### AI Provider Integration

#### Gateway Pattern

Uses `@ai-sdk/gateway` for unified AI provider access:

**Benefits**:

- **Provider Abstraction**: Single interface for multiple AI providers (OpenRouter, Anthropic, OpenAI)
- **Failover Support**: Can switch between providers programmatically
- **Consistent APIs**: Standardized interface regardless of provider
- **Advanced Features**: Streaming, tool calling, and caching support

#### Provider Configuration

```typescript
// OpenRouter (default)
const openRouterModel = gateway('openrouter/anthropic/claude-sonnet-4');

// Anthropic direct
const anthropicModel = anthropic('claude-sonnet-4');

// OpenAI direct
const openAIModel = openai('gpt-4');

const result = await generateText({ model, messages, tools });
```

### File System Integration

#### Workspace Management

- **Vault System**: Multiple workspace support through Flint Note API
- **File Watching**: Automatic detection of external file changes
- **Backup Strategy**: Automatic backup creation for critical operations
- **Cross-Platform Paths**: Consistent path handling across operating systems

#### Data Persistence

Flint employs a multi-layered data persistence strategy:

**Note Data** (via Flint Note API):

- **SQLite Database**: Note metadata, search indexes, and link graphs
- **Markdown Files**: Note content stored as standard markdown

**Application State** (file system storage):

- **JSON Configuration**: All app state persisted as structured JSON files
- **Hierarchical Organization**: Separate directories for settings vs vault-specific data
- **Atomic Operations**: Safe file writes with error recovery
- **Vault Isolation**: Automatic data separation between different workspaces

**Sensitive Data**:

- **OS Secure Storage**: API keys and credentials via platform keychain/credential manager
- **Encrypted Storage**: Fallback encrypted storage for systems without OS integration

**Performance Data**:

- **Cache Storage**: AI response caching and performance metrics
- **Usage Analytics**: Token consumption and cost tracking data

## Performance Architecture

### Caching Strategy

#### AI Response Caching

- **System Message Caching**: Cache stable system prompts for token savings
- **History Caching**: Cache conversation segments to reduce repeated token usage
- **Configurable Thresholds**: Adjustable cache parameters based on usage patterns
- **Performance Monitoring**: Real-time cache hit rates and optimization suggestions

#### Frontend Caching

- **Component State**: Svelte's reactive caching for UI components
- **Search Results**: Cache search results to avoid repeated backend calls
- **Note Content**: Intelligent caching of frequently accessed notes
- **Image Assets**: Standard web caching for UI resources

### Optimization Patterns

#### Lazy Loading

- **Component Loading**: Svelte components load on demand
- **Note Content**: Full note content loaded only when needed
- **Search Results**: Pagination and incremental loading
- **AI Models**: Model initialization on first use

#### Memory Management

- **Conversation Pruning**: Automatic cleanup of old conversation history
- **Cache Limits**: Configurable memory limits for various caches
- **Service Cleanup**: Proper cleanup of event listeners and resources
- **Background Processing**: Move heavy operations off main thread

## Security Architecture

### Credential Management

- **Secure Storage**: OS-level secure storage for API keys
- **No Plaintext Storage**: All sensitive data encrypted at rest
- **Key Rotation**: Support for updating API keys without restart
- **Provider Isolation**: Separate key management per AI provider

### Process Security

- **Context Isolation**: Renderer process cannot access Node.js APIs directly
- **Preload Security**: Limited API surface through secure preload bridge
- **File System Access**: Controlled access through main process only
- **Network Security**: All external requests go through main process

### Data Protection

- **Local Processing**: All note processing happens locally
- **Optional Cloud**: AI service calls are user-controlled
- **Backup Encryption**: Sensitive backups use encryption
- **Audit Logging**: Security-relevant operations are logged

## Deployment Architecture

### Application Packaging

- **Electron Builder**: Cross-platform application packaging
- **Auto-Update**: Built-in update mechanism for security patches
- **Code Signing**: Platform-specific code signing for security
- **Asset Optimization**: Minimized and optimized application bundles

### Distribution Strategy

- **GitHub Releases**: Primary distribution channel
- **Platform Packages**: Native packages for macOS, Windows, Linux
- **Dependency Bundling**: All Node.js dependencies bundled in application
- **Offline Capability**: Full functionality without internet (except AI features)

## Future Architecture Considerations

### Scalability Patterns

- **Plugin Architecture**: Extensible plugin system for custom note types
- **Service Workers**: Background processing for large operations
- **Database Scaling**: Potential migration to more robust database systems
- **Cloud Sync**: Optional cloud synchronization while maintaining local-first approach

### Integration Patterns

- **API Gateway**: Potential centralized API management layer
- **Webhook Support**: External system integration through webhooks
- **Export Systems**: Standardized export formats for interoperability
- **Third-Party Tools**: Integration with existing note-taking ecosystems

This architecture provides a robust foundation for a modern, AI-integrated note-taking application while maintaining flexibility for future enhancements and ensuring security and performance at scale.
