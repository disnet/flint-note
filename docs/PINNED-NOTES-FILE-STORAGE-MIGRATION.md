# Pinned Notes File Storage Migration Plan

## Overview

This document outlines the plan to switch pinned notes storage from localStorage to JSON files stored in the filesystem within the standard user data directory. This switch will provide better data persistence, cross-session reliability, and align with the application's existing file-based storage patterns.

**Important Note**: This switch will **not preserve existing pinned notes** stored in localStorage. Users will need to re-pin their notes after the migration. This decision simplifies the implementation and reduces complexity while providing a clean slate for the new storage system.

## Current Implementation Analysis

### Current Architecture

The pinned notes are currently managed by the `PinnedNotesStore` class in `src/renderer/src/services/pinnedStore.svelte.ts`:

- **Storage Method**: localStorage with keys formatted as `flint-pinned-notes-{vaultId}`
- **Data Structure**: `PinnedNoteInfo[]` containing id, title, filename, pinnedAt, and order properties
- **Vault Support**: Each vault maintains its own pinned notes collection
- **Operations**: Pin/unpin, reorder, migrate notes without order, and cross-vault functionality

### Current Data Flow

1. Renderer process stores/retrieves data directly to/from localStorage
2. No main process involvement in pinned notes persistence
3. Synchronous operations within the renderer process
4. Vault-specific storage with fallback to 'default' vault

## Migration Strategy

### Target Architecture

**Main Process Service**: Create a new `PinnedNotesStorageService` in `src/main/` that handles file operations
**File Location**: `{userData}/pinned-notes/` directory structure
**File Naming**: `{vaultId}.json` files (e.g., `vault-123.json`, `default.json`)
**IPC Communication**: Async methods exposed through preload script

### Implementation Plan

#### Phase 1: Main Process Service Creation

**File**: `src/main/pinned-notes-storage-service.ts`

Create a service class that:
- Manages JSON files in `{userData}/pinned-notes/` directory
- Provides async methods: `load()`, `save()`, `migrate()`, and `clear()`
- Handles file system errors gracefully with fallback to empty arrays
- Creates directory structure if it doesn't exist
- Follows the same patterns as `SecureStorageService`

Key Methods:
```typescript
class PinnedNotesStorageService {
  async loadPinnedNotes(vaultId: string): Promise<PinnedNoteInfo[]>
  async savePinnedNotes(vaultId: string, notes: PinnedNoteInfo[]): Promise<void>
  async clearPinnedNotes(vaultId: string): Promise<void>
  async listVaultFiles(): Promise<string[]>
}
```

#### Phase 2: IPC Handler Registration

**File**: `src/main/index.ts`

Add IPC handlers for pinned notes operations:
```typescript
ipcMain.handle('load-pinned-notes', async (_event, params: { vaultId: string }) => { ... })
ipcMain.handle('save-pinned-notes', async (_event, params: { vaultId: string, notes: PinnedNoteInfo[] }) => { ... })
ipcMain.handle('clear-pinned-notes', async (_event, params: { vaultId: string }) => { ... })
```

#### Phase 3: Preload Script Updates

**File**: `src/preload/index.ts`

Expose new IPC methods to renderer:
```typescript
// Pinned notes storage operations
loadPinnedNotes: (params: { vaultId: string }) => electronAPI.ipcRenderer.invoke('load-pinned-notes', params),
savePinnedNotes: (params: { vaultId: string, notes: PinnedNoteInfo[] }) => electronAPI.ipcRenderer.invoke('save-pinned-notes', params),
clearPinnedNotes: (params: { vaultId: string }) => electronAPI.ipcRenderer.invoke('clear-pinned-notes', params)
```

#### Phase 4: Renderer Service Migration

**File**: `src/renderer/src/services/pinnedStore.svelte.ts`

Transform the PinnedNotesStore class to:
- Replace `loadFromStorage()` with async `window.api.loadPinnedNotes()`
- Replace `saveToStorage()` with async `window.api.savePinnedNotes()`
- Remove all localStorage-related methods (`loadFromLocalStorage`, `saveToLocalStorage`, etc.)
- **Critical Change**: Make `initializeVault()` and `refreshForVault()` properly async throughout
- Update reactive patterns to handle async initialization state
- Start with empty pinned notes state (ignoring any existing localStorage data)

### Async Initialization Challenge

**Current Issue**: The current implementation has synchronous assumptions:
1. `constructor()` calls `initializeVault()` but doesn't await it
2. `initializeVault()` calls `loadFromStorage()` synchronously (currently localStorage)
3. Components use `pinnedNotesStore.notes` immediately and expect data to be available
4. `$effect()` in components reactively depend on `pinnedNotesStore.notes` being populated

**Solution**: Implement loading state pattern to handle async initialization:

Key Changes:
```typescript
class PinnedNotesStore {
  private state = $state<PinnedNotesState>(defaultState);
  private currentVaultId: string | null = null;
  private isLoading = $state(true); // Add loading state
  private isInitialized = $state(false); // Add initialization state

  constructor() {
    // Don't await in constructor - let it initialize in background
    this.initializeVault();
  }

  get notes(): PinnedNoteInfo[] {
    // Only return notes if initialized
    if (!this.isInitialized) return [];
    return [...this.state.notes].sort((a, b) => a.order - b.order);
  }

  get loading(): boolean {
    return this.isLoading;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  private async loadFromStorage(vaultId?: string): Promise<PinnedNoteInfo[]> {
    try {
      const vault = vaultId || this.currentVaultId || 'default';
      return await window.api.loadPinnedNotes({ vaultId: vault });
    } catch (error) {
      console.warn('Failed to load pinned notes from file storage:', error);
      return []; // Return empty array on error
    }
  }

  private async saveToStorage(vaultId?: string): Promise<void> {
    try {
      const vault = vaultId || this.currentVaultId || 'default';
      await window.api.savePinnedNotes({ vaultId: vault, notes: this.state.notes });
    } catch (error) {
      console.warn('Failed to save pinned notes to file storage:', error);
      throw error; // Let calling code handle the error
    }
  }

  private async initializeVault(): Promise<void> {
    this.isLoading = true;
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.currentVaultId = vault?.id || 'default';
      const notes = await this.loadFromStorage(); // Now properly async
      this.state.notes = notes;
    } catch (error) {
      console.warn('Failed to initialize vault for pinned notes:', error);
      this.currentVaultId = 'default';
      const notes = await this.loadFromStorage(); // Now properly async
      this.state.notes = notes;
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
    }
  }

  async refreshForVault(vaultId?: string): Promise<void> {
    this.isLoading = true;
    try {
      if (vaultId) {
        this.currentVaultId = vaultId;
      } else {
        const service = getChatService();
        const vault = await service.getCurrentVault();
        this.currentVaultId = vault?.id || 'default';
      }
      const notes = await this.loadFromStorage(); // Now properly async
      this.state.notes = notes;
    } catch (error) {
      console.warn('Failed to refresh vault for pinned notes:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Update all mutation methods to be async since they call saveToStorage
  async pinNote(id: string, title: string, filename: string): Promise<void> {
    if (this.state.notes.some((note) => note.id === id)) {
      return; // Already pinned
    }

    const pinnedNote: PinnedNoteInfo = {
      id,
      title,
      filename,
      pinnedAt: new Date().toISOString(),
      order: this.state.notes.length
    };

    this.state.notes = [...this.state.notes, pinnedNote];
    await this.saveToStorage(); // Now async

    // Remove from temporary tabs when pinned
    temporaryTabsStore.removeTabsByNoteIds([id]);
  }

  async unpinNote(noteId: string): Promise<void> {
    const noteToUnpin = this.state.notes.find((note) => note.id === noteId);
    this.state.notes = this.state.notes.filter((note) => note.id !== noteId);
    
    // Reassign order values
    this.state.notes.forEach((note, index) => {
      note.order = index;
    });
    
    await this.saveToStorage(); // Now async

    // Add to temporary tabs when unpinned
    if (noteToUnpin) {
      temporaryTabsStore.addTab(noteToUnpin.id, noteToUnpin.title, 'navigation');
    }
  }

  async reorderNotes(sourceIndex: number, targetIndex: number): Promise<void> {
    // ... existing reorder logic ...
    await this.saveToStorage(); // Now async
    // ... existing animation logic ...
  }
}
```

### Component Updates Required

**Component Changes**: All components that call pinned note mutation methods must be updated to handle async operations:

**Files to Update**:
- `src/renderer/src/components/PinnedView.svelte` - `handleUnpin()` function
- `src/renderer/src/components/NoteEditor.svelte` - Pin/unpin actions  
- `src/renderer/src/components/PinnedNotes.svelte` - Drag and drop reordering
- Any other components that call `pinNote()`, `unpinNote()`, `reorderNotes()`, etc.

**Component Pattern Changes**:
```typescript
// OLD (synchronous)
function handleUnpin(noteId: string, event: Event): void {
  event.stopPropagation();
  pinnedNotesStore.unpinNote(noteId);
}

// NEW (async with loading state)
let isUnpinning = $state(false);

async function handleUnpin(noteId: string, event: Event): Promise<void> {
  event.stopPropagation();
  isUnpinning = true;
  try {
    await pinnedNotesStore.unpinNote(noteId);
  } catch (error) {
    console.error('Failed to unpin note:', error);
    // Optionally show user-facing error
  } finally {
    isUnpinning = false;
  }
}
```

**Loading States in Components**:
```typescript
// Components should show loading states
$effect(() => {
  if (pinnedNotesStore.loading) {
    // Show skeleton/spinner for pinned notes section
  }
});
```

#### Phase 5: Cleanup and Testing

**Cleanup Process**:
1. Remove all localStorage-related methods from `PinnedNotesStore`
2. Remove localStorage key constants (`PINNED_NOTES_KEY_PREFIX`)
3. Remove the `migrateNotesWithoutOrder()` method (no longer needed)
4. Update all component methods that interact with pinned notes to be async
5. Add loading state handling in UI components

**Error Handling**:
- File operation errors return empty arrays (graceful degradation)
- Clear error messages in console for debugging
- No fallback to localStorage - clean break from old system
- Async method failures should be handled gracefully in components

## File Structure

### Directory Layout
```
{userData}/
├── secure/                          # Existing secure storage
│   └── encrypted-data.bin
└── pinned-notes/                    # New pinned notes directory
    ├── default.json                 # Default vault pinned notes
    ├── vault-abc123.json           # Vault-specific pinned notes
    └── vault-def456.json           # Additional vault pinned notes
```

### JSON File Format
```json
{
  "version": "1.0.0",
  "vaultId": "vault-abc123",
  "lastUpdated": "2024-03-15T10:30:00.000Z",
  "notes": [
    {
      "id": "note-123",
      "title": "My Important Note",
      "filename": "important-note.md",
      "pinnedAt": "2024-03-15T09:15:00.000Z",
      "order": 0
    }
  ]
}
```

## Benefits

### Reliability
- Data persists across browser sessions and app updates
- No localStorage size limitations or browser clearing issues
- Better error handling and recovery options

### Performance
- Reduced memory usage in renderer process
- Async operations don't block UI updates
- File system operations handled in main process

### Maintenance
- Centralized data management following app patterns
- Easier backup and synchronization capabilities
- Better debugging and data inspection capabilities

### Architecture Consistency
- Aligns with existing secure storage patterns
- Follows established IPC communication patterns
- Maintains separation of concerns between main and renderer processes

## Risks and Mitigations

### Data Loss Impact
**Impact**: Users will lose their existing pinned notes after migration
**Mitigation**:
- Document this clearly in release notes and migration documentation
- Consider showing a one-time notification to users about the change
- Provide clear instructions on how to re-pin important notes

### Performance Impact
**Risk**: Async operations might affect UI responsiveness
**Mitigation**:
- Use reactive Svelte patterns to handle async state updates
- Implement loading states for better user experience
- Batch operations where possible to reduce IPC calls

### File System Permissions
**Risk**: File access might be restricted on some systems
**Mitigation**:
- Graceful error handling with empty arrays as fallback
- User-friendly error messages explaining permission issues
- Use Electron's userData directory which should always be writable

## Testing Strategy

### Unit Tests
- File operations in main process service
- JSON serialization/deserialization
- Error handling scenarios
- Async state management in PinnedNotesStore
- Loading state transitions

### Integration Tests
- Vault switching with file-based storage
- IPC communication reliability
- File creation and reading across app restarts
- Component async method calls
- Loading states in UI during async operations

### Manual Testing
- Cross-platform file system behavior
- Empty state handling when no pinned notes exist
- Error recovery scenarios
- UI responsiveness during async operations
- Loading indicators and error states

## Rollback Plan

If critical issues are discovered post-migration:
1. **Immediate**: Revert code changes to restore localStorage-based implementation
2. **Short-term**: Feature flag to toggle between file storage and localStorage
3. **Long-term**: Fix file storage issues while maintaining localStorage as backup option

## Success Metrics

- **File operations** work reliably across all supported platforms
- **Performance improvement** in app startup time (no localStorage parsing)
- **Cross-session persistence** reliability of 100%
- **User satisfaction** with the new clean slate approach
- **System stability** with no crashes related to file operations

## Post-Migration Considerations

### Future Enhancements
- Cloud synchronization support for pinned notes across devices
- Export/import functionality for backup purposes
- Advanced pinned notes features (categories, smart pinning, etc.)

### Maintenance Tasks
- Periodic cleanup of orphaned pinned notes files
- Performance monitoring of file operations
- Documentation updates for new storage architecture

### User Communication
- Clear release notes explaining the change
- Documentation about re-pinning notes after update
- FAQ addressing common questions about the migration
