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

- **Multi-Provider Support**: Integrates with Anthropic, OpenAI, and gateway providers
- **Conversation Management**: Maintains conversation history with automatic pruning
- **Prompt Caching**: Advanced caching strategies for system messages and conversation history
- **Streaming Support**: Real-time message streaming with tool call handling
- **Cost Tracking**: Precise token usage and cost calculation in micro-cents
- **Performance Monitoring**: Cache hit rates, token savings, and optimization recommendations

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
├── pinned-notes/                    # Pinned note preferences
│   ├── default.json
│   └── vault-{id}.json
├── settings/                        # Global application settings
│   ├── app-settings.json           # Main app preferences (includes sidebar state)
│   ├── model-preferences.json      # AI model selection
│   └── slash-commands.json         # Custom slash commands
├── vault-data/                      # Vault-specific data
│   ├── default/                    # Default vault data
│   │   ├── conversations.json      # AI chat history
│   │   ├── temporary-tabs.json     # Arc-style tab management
│   │   ├── navigation-history.json # Navigation history
│   │   └── active-note.json        # Currently active note
│   ├── vault-{id}/                 # Specific vault data
│   │   ├── conversations.json
│   │   ├── temporary-tabs.json
│   │   ├── navigation-history.json
│   │   └── active-note.json
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

- **Global Preferences**: App settings, model selection, slash commands
- **UI State**: Sidebar configuration and layout preferences
- **Non-Vault Data**: Settings that persist across all vaults

#### Vault Data Storage Service (`src/main/vault-data-storage-service.ts`)

Manages vault-specific data with automatic isolation:

**Features**:

- **Vault Isolation**: Automatic data separation per vault ID
- **Chat History**: Conversation management with cost tracking
- **Navigation State**: Tab management and navigation history
- **Active State**: Currently selected notes per vault

#### Secure Storage Service (`src/main/secure-storage-service.ts`)

Manages sensitive data like API keys:

**Features**:

- **Platform Integration**: Uses OS-level secure storage (Keychain on macOS, etc.)
- **Provider Support**: Manages keys for Anthropic, OpenAI, and gateway providers
- **Key Testing**: Validates API keys before storage
- **Fallback Handling**: Graceful degradation when secure storage is unavailable

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
    ├── AIAssistant.svelte
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
- `sidebarState.svelte.ts` - UI layout and sidebar visibility → `settings/app-settings.json`
- `temporaryTabsStore.svelte.ts` - Arc-style tab management → `vault-data/{vaultId}/temporary-tabs.json`
- `unifiedChatStore.svelte.ts` - AI conversation state → `vault-data/{vaultId}/conversations.json`
- `activeNoteStore.svelte.ts` - Active note per vault → `vault-data/{vaultId}/active-note.json`
- `navigationHistoryStore.svelte.ts` - Navigation history → `vault-data/{vaultId}/navigation-history.json`
- `slashCommandsStore.svelte.ts` - Custom slash commands → `settings/slash-commands.json`

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

## Communication Patterns

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

**Storage IPC Handlers**:

```typescript
// Global Settings
ipcMain.handle('load-app-settings', async () => { ... });
ipcMain.handle('save-app-settings', async (_event, settings) => { ... });
ipcMain.handle('load-model-preference', async () => { ... });
ipcMain.handle('save-model-preference', async (_event, modelId) => { ... });
ipcMain.handle('load-slash-commands', async () => { ... });
ipcMain.handle('save-slash-commands', async (_event, commands) => { ... });

// Vault-Specific Data
ipcMain.handle('load-conversations', async (_event, { vaultId }) => { ... });
ipcMain.handle('save-conversations', async (_event, { vaultId, conversations }) => { ... });
ipcMain.handle('load-temporary-tabs', async (_event, { vaultId }) => { ... });
ipcMain.handle('save-temporary-tabs', async (_event, { vaultId, tabs }) => { ... });
ipcMain.handle('load-active-note', async (_event, { vaultId }) => { ... });
ipcMain.handle('save-active-note', async (_event, { vaultId, noteId }) => { ... });
ipcMain.handle('load-navigation-history', async (_event, { vaultId }) => { ... });
ipcMain.handle('save-navigation-history', async (_event, { vaultId, history }) => { ... });
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

- **Provider Abstraction**: Single interface for multiple AI providers
- **Failover Support**: Can switch between providers programmatically
- **Consistent APIs**: Standardized interface regardless of provider
- **Advanced Features**: Streaming, tool calling, and caching support

#### Provider Configuration

```typescript
const gateway = createGateway({
  apiKey: await secureStorage.getApiKey('gateway')
});

// Model usage
const model = gateway('anthropic/claude-sonnet-4');
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
