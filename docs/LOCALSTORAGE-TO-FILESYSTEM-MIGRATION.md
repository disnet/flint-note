# LocalStorage to File System Migration Plan

## Overview

This document outlines a comprehensive plan to migrate all localStorage-based persistence to the file system. This migration will improve data reliability, eliminate browser storage limitations, provide better backup capabilities, and align with the existing file-based storage patterns established by the pinned notes migration.

## Current LocalStorage Usage Analysis

Based on codebase analysis, the following stores currently use localStorage:

### 1. **temporaryTabsStore.svelte.ts**
- **Purpose**: Manages temporary tab state with auto-cleanup
- **Storage Key**: `temporaryTabs-{vaultId}`
- **Data**: TemporaryTab objects with noteId, title, timestamps, source, order
- **Vault-specific**: Yes
- **Complexity**: Medium (vault switching, cleanup logic)

### 2. **modelStore.svelte.ts**
- **Purpose**: Stores selected AI model preference
- **Storage Key**: `flint-selected-model`
- **Data**: Simple string (model ID)
- **Vault-specific**: No (global preference)
- **Complexity**: Low (single value)

### 3. **settingsStore.svelte.ts**
- **Purpose**: Application settings (non-sensitive only)
- **Storage Key**: `flint-settings`
- **Data**: AppSettings object (excluding API keys)
- **Vault-specific**: No (global preferences)
- **Complexity**: Medium (nested object, secure storage integration)

### 4. **slashCommandsStore.svelte.ts**
- **Purpose**: Custom slash commands with parameters
- **Storage Key**: `flint-slash-commands`
- **Data**: SlashCommand objects with parameter definitions
- **Vault-specific**: No (global commands)
- **Complexity**: Medium (complex data structure)

### 5. **unifiedChatStore.svelte.ts**
- **Purpose**: Chat conversations and message history
- **Storage Key**: `conversations-{vaultId}`
- **Data**: Large conversation objects with messages
- **Vault-specific**: Yes
- **Complexity**: High (large data, performance critical)

### 6. **sidebarState.svelte.ts**
- **Purpose**: UI sidebar collapsed/expanded state
- **Storage Key**: `sidebarState`
- **Data**: Simple boolean state
- **Vault-specific**: No (global UI preference)
- **Complexity**: Low (single boolean)

### 7. **navigationHistoryStore.svelte.ts**
- **Purpose**: Navigation history for back/forward functionality
- **Storage Key**: `navigation-history-{vaultId}`
- **Data**: NavigationEntry arrays with timestamps
- **Vault-specific**: Yes
- **Complexity**: Medium (ordered arrays, cleanup logic)

### 8. **activeNoteStore.svelte.ts**
- **Purpose**: Currently active note per vault
- **Storage Key**: `active-note-{vaultId}`
- **Data**: Active note ID string
- **Vault-specific**: Yes
- **Complexity**: Low (single value per vault)

## Migration Strategy

### File System Architecture

Following the pinned notes pattern, we'll create dedicated directories under `{userData}/`:

```
{userData}/
├── secure/                          # Existing secure storage
│   └── encrypted-data.bin
├── pinned-notes/                    # Existing file storage
│   ├── default.json
│   └── vault-{id}.json
├── settings/                        # NEW: Application settings
│   ├── app-settings.json           # Global app settings
│   ├── model-preferences.json     # Selected model
│   ├── sidebar-state.json         # UI preferences  
│   └── slash-commands.json        # Custom commands
├── vault-data/                     # NEW: Vault-specific data
│   ├── default/                   # Default vault data
│   │   ├── conversations.json     # Chat history
│   │   ├── temporary-tabs.json    # Temporary tabs
│   │   ├── navigation-history.json # Navigation history
│   │   └── active-note.json       # Active note
│   ├── vault-{id}/               # Specific vault data
│   │   ├── conversations.json
│   │   ├── temporary-tabs.json
│   │   ├── navigation-history.json
│   │   └── active-note.json
│   └── ...
```

### Migration Phases

## Phase 1: Infrastructure Setup

### 1.1 Create Base Storage Service

**File**: `src/main/storage-service.ts`

Create a generic file storage service that other services can extend:

```typescript
export class BaseStorageService {
  protected async ensureDirectory(dirPath: string): Promise<void>;
  protected async readJsonFile<T>(filePath: string, defaultValue: T): Promise<T>;
  protected async writeJsonFile<T>(filePath: string, data: T): Promise<void>;
  protected async deleteFile(filePath: string): Promise<void>;
  protected async listFiles(dirPath: string): Promise<string[]>;
}
```

### 1.2 Create Specialized Storage Services

**Global Settings Service** (`src/main/settings-storage-service.ts`):
- Manages `settings/` directory
- Handles app-settings.json, model-preferences.json, etc.
- Non-vault-specific data

**Vault Data Service** (`src/main/vault-data-storage-service.ts`):
- Manages `vault-data/{vaultId}/` directories
- Handles conversations.json, temporary-tabs.json, etc.
- Vault-specific data with automatic vault isolation

### 1.3 IPC Handler Registration

**File**: `src/main/index.ts`

Add comprehensive IPC handlers for all storage operations:

```typescript
// Global settings handlers
ipcMain.handle('load-app-settings', async () => { ... })
ipcMain.handle('save-app-settings', async (_event, settings: AppSettings) => { ... })
ipcMain.handle('load-model-preference', async () => { ... })
ipcMain.handle('save-model-preference', async (_event, modelId: string) => { ... })

// Vault-specific data handlers
ipcMain.handle('load-conversations', async (_event, params: { vaultId: string }) => { ... })
ipcMain.handle('save-conversations', async (_event, params: { vaultId: string, conversations: any }) => { ... })
ipcMain.handle('load-temporary-tabs', async (_event, params: { vaultId: string }) => { ... })
// ... etc for all vault-specific data
```

### 1.4 Preload Script Updates

**File**: `src/preload/index.ts`

Expose all storage operations to renderer:

```typescript
// Global settings
loadAppSettings: () => electronAPI.ipcRenderer.invoke('load-app-settings'),
saveAppSettings: (settings: AppSettings) => electronAPI.ipcRenderer.invoke('save-app-settings', settings),

// Vault-specific data  
loadConversations: (params: { vaultId: string }) => electronAPI.ipcRenderer.invoke('load-conversations', params),
saveConversations: (params: { vaultId: string, conversations: any }) => electronAPI.ipcRenderer.invoke('save-conversations', params),
// ... etc
```

## Phase 2: Store Migrations (Priority Order)

### 2.1 Low Complexity: Simple Global Preferences

**Priority 1: modelStore.svelte.ts**
- Simplest migration (single string value)
- No async initialization complexity
- Good test case for the infrastructure

**Priority 2: sidebarState.svelte.ts**
- Simple boolean state
- Global preference (no vault complexity)

### 2.2 Medium Complexity: Global Settings

**Priority 3: settingsStore.svelte.ts**
- Complex nested object but no vault switching
- Already has secure storage integration pattern
- Important for user preferences

**Priority 4: slashCommandsStore.svelte.ts**
- Complex data structure but global scope
- No vault switching complexity

### 2.3 High Complexity: Vault-Specific Data

**Priority 5: activeNoteStore.svelte.ts**
- Simple data but vault-specific
- Good test for vault switching logic

**Priority 6: navigationHistoryStore.svelte.ts**
- Medium complexity with vault switching
- Array management and cleanup logic

**Priority 7: temporaryTabsStore.svelte.ts**
- Complex state management with cleanup
- Vault switching and auto-cleanup logic

**Priority 8: unifiedChatStore.svelte.ts**
- Most complex - large data, performance critical
- Heavy vault switching usage
- Should be migrated last after all patterns are proven

## Phase 3: Async Initialization Pattern

### Standard Loading State Implementation

Each migrated store will implement consistent loading states:

```typescript
class MigratedStore {
  private state = $state<StoreState>(defaultState);
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
      // Load data from file system
      await this.loadFromFileSystem();
    } catch (error) {
      console.warn('Store initialization failed:', error);
      // Use default state
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  // All mutation methods must be async
  async updateData(...args): Promise<void> {
    await this.ensureInitialized();
    // Perform updates
    await this.saveToFileSystem();
  }
}
```

### Component Loading State Handling

Components will handle loading states consistently:

```typescript
// Component pattern
$effect(() => {
  if (someStore.loading) {
    // Show loading indicator
  } else if (someStore.initialized) {
    // Show actual data
  }
});

// Async operations
async function handleUserAction() {
  await someStore.ensureInitialized();
  await someStore.performAction();
}
```

## Phase 4: Data Migration Strategy

### Migration Approach Options

**Option 1: Clean Slate (Recommended)**
- Follow pinned notes pattern - no data migration
- Users start fresh with empty state
- Simplest implementation, no migration complexity
- Document clearly in release notes

**Option 2: One-Time Migration**
- Read localStorage data on first file system load
- Migrate to file system and remove localStorage entries
- More complex but preserves user data
- Risk of migration failures

**Option 3: Gradual Migration**
- Feature flag to enable file system storage
- Fallback to localStorage if file operations fail
- Most complex but safest approach

### Recommendation: Clean Slate

Based on the pinned notes migration success, recommend the clean slate approach:

1. **Benefits**:
   - Simple implementation
   - No migration complexity or failure points
   - Clean break from localStorage limitations
   - Easier testing and validation

2. **User Communication**:
   - Clear release notes about the change
   - List affected data types
   - Explain benefits (reliability, performance, backup capability)
   - Provide instructions for any important manual recreation

3. **Minimizing Impact**:
   - Most data is ephemeral or easily recreated
   - Critical data (notes, API keys) already persisted elsewhere
   - Settings can be reconfigured quickly

## Phase 5: Component Updates

### Async Method Handling

All components calling store mutation methods must be updated:

```typescript
// OLD (synchronous)
function handleAction() {
  someStore.updateSomething(value);
}

// NEW (async with loading state)
let actionInProgress = $state(false);

async function handleAction() {
  actionInProgress = true;
  try {
    await someStore.updateSomething(value);
  } catch (error) {
    console.error('Action failed:', error);
    // Show user-friendly error
  } finally {
    actionInProgress = false;
  }
}
```

### Loading State UI Updates

Components should show appropriate loading states:

```typescript
// Loading indicators for initialization
{#if someStore.loading}
  <div class="loading-skeleton" />
{:else if someStore.initialized}
  <!-- Actual content -->
{/if}

// Loading indicators for actions
<button disabled={actionInProgress}>
  {#if actionInProgress}
    <LoadingSpinner />
  {/if}
  Action
</button>
```

## Error Handling Strategy

### File Operation Error Handling

1. **Graceful Degradation**: Failed loads return default/empty state
2. **Retry Logic**: Implement exponential backoff for transient failures  
3. **User Feedback**: Clear error messages for persistent issues
4. **Logging**: Comprehensive error logging for debugging
5. **Fallback Options**: Consider temporary in-memory fallback for critical operations

### Error Recovery

```typescript
async loadData(): Promise<DataType> {
  try {
    return await this.fileStorageService.load();
  } catch (error) {
    console.warn('File storage load failed, using defaults:', error);
    return this.getDefaultData();
  }
}

async saveData(data: DataType): Promise<void> {
  try {
    await this.fileStorageService.save(data);
  } catch (error) {
    console.error('File storage save failed:', error);
    // Could implement retry logic here
    throw error; // Let component handle user feedback
  }
}
```

## Testing Strategy

### Unit Tests

1. **Storage Services**: File operations, error handling, directory creation
2. **Store Logic**: Async initialization, loading states, mutation methods
3. **Data Serialization**: JSON serialization/deserialization, data validation
4. **Error Scenarios**: File permission errors, disk full, corrupted data

### Integration Tests

1. **IPC Communication**: Main-renderer communication reliability
2. **Vault Switching**: Data isolation between vaults
3. **App Lifecycle**: Data persistence across app restarts
4. **Concurrent Operations**: Multiple stores accessing file system simultaneously

### Manual Testing

1. **Cross-Platform**: File system behavior on Windows, macOS, Linux
2. **Performance**: Large data sets, startup times, responsiveness
3. **Error Recovery**: Disk full scenarios, permission issues
4. **User Experience**: Loading states, error messages, data loss scenarios

## Performance Considerations

### File System Optimization

1. **Batch Operations**: Combine multiple changes into single write operations
2. **Debounced Saves**: Prevent excessive file writes during rapid changes
3. **Lazy Loading**: Only load data when actually needed
4. **Memory Management**: Clear unused data from memory after file writes

### Startup Performance

1. **Parallel Initialization**: Initialize multiple stores concurrently
2. **Progressive Loading**: Show UI before all stores are loaded
3. **Critical Path**: Load essential stores first, defer others
4. **Caching**: Cache frequently accessed data in memory

## Migration Timeline

### Phase 1: Infrastructure (Week 1)
- Base storage services
- IPC handlers and preload updates
- Testing infrastructure

### Phase 2a: Simple Stores (Week 2)  
- modelStore migration
- sidebarState migration
- Validate patterns and infrastructure

### Phase 2b: Medium Stores (Week 3)
- settingsStore migration  
- slashCommandsStore migration
- Component updates for async patterns

### Phase 2c: Complex Stores (Week 4-5)
- activeNoteStore migration
- navigationHistoryStore migration
- temporaryTabsStore migration

### Phase 2d: Critical Store (Week 6)
- unifiedChatStore migration
- Extensive testing and optimization
- Performance validation

### Phase 3: Testing & Polish (Week 7)
- Comprehensive testing
- Error handling validation
- Documentation updates
- User communication materials

## Success Metrics

1. **Reliability**: 100% data persistence across app restarts
2. **Performance**: No degradation in app startup time
3. **User Experience**: Smooth loading states, clear error messages
4. **System Stability**: No crashes or data corruption issues
5. **File System**: Proper cleanup, no orphaned files
6. **Cross-Platform**: Consistent behavior across all supported platforms

## Risk Mitigation

### High Priority Risks

1. **Data Loss**: Extensive testing, clear user communication, gradual rollout
2. **Performance Issues**: Performance testing, optimization, monitoring
3. **File System Permissions**: Error handling, fallback strategies, user guidance
4. **Complex Store Migration**: Start with simple stores, incremental approach

### Rollback Plan

1. **Individual Store Rollback**: Feature flags for each migrated store
2. **Quick Rollback**: Revert to localStorage versions if critical issues found
3. **Partial Rollback**: Some stores on file system, others on localStorage
4. **User Data Recovery**: Clear instructions for recovering from issues

## Long-Term Benefits

### Reliability Improvements
- Data survives browser cache clearing
- No localStorage size limitations  
- Better error handling and recovery
- Backup and sync capabilities

### Performance Improvements
- Reduced memory usage in renderer
- Better startup performance (parallel loading)
- More efficient large data handling
- Reduced blocking operations

### Development Benefits
- Consistent storage patterns
- Better debugging capabilities
- Easier testing and mocking
- Future extensibility for cloud sync

## Conclusion

This migration represents a significant architectural improvement that will enhance data reliability, eliminate browser storage limitations, and provide a foundation for future enhancements like cloud synchronization. The phased approach starting with simple stores will validate the infrastructure and patterns before tackling the most complex stores.

The clean slate approach, while requiring users to reconfigure some preferences, provides the cleanest and most reliable implementation while following the successful pattern established by the pinned notes migration.