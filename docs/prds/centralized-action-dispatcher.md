# PRD: Centralized Action Dispatcher with Event Broadcasting

## Executive Summary

Refactor the Flint UI state management to use a centralized action dispatcher pattern while maintaining existing store architecture and Svelte 5 reactivity. This enables consistent event broadcasting to the Electron main process for the new on-demand workspace context tools.

## Goals & Objectives

### Primary Goals
1. **Standardize State Updates**: All state changes flow through predictable action patterns
2. **Enable Event Broadcasting**: Automatically broadcast workspace changes to main process for AI tool context
3. **Maintain Developer Experience**: Keep existing Svelte 5 runes and familiar patterns
4. **Gradual Migration**: Allow incremental refactoring without breaking existing functionality

### Success Metrics
- All workspace state changes broadcast to main process within 50ms
- Zero performance regression in UI responsiveness
- 100% backward compatibility during migration
- Reduced state management complexity (measured by cyclomatic complexity)

## Current State Analysis

### Existing Store Architecture
```typescript
// Current pattern (activeNoteStore example)
class ActiveNoteStore {
  private state = $state<ActiveNoteState>(defaultState);
  
  async setActiveNote(note: NoteMetadata | null): Promise<void> {
    this.state.activeNote = note;
    await this.saveToStorage();
  }
}

// Usage in components
activeNoteStore.setActiveNote(selectedNote);
```

### Key Stores to Migrate
- `activeNoteStore` - Current active note tracking
- `temporaryTabsStore` - Recent notes/tabs management  
- `pinnedNotesStore` - Pinned notes management
- `unifiedChatStore` - Chat threads and conversation state
- `sidebarState` - UI layout state
- `navigationHistoryStore` - Back/forward navigation

## Solution Architecture

### Core Action System

```typescript
// Action definition
interface Action {
  type: string;
  payload?: any;
  meta?: {
    vaultId?: string;
    broadcast?: boolean;
    source?: string; // Which store/component triggered the action
    timestamp?: Date;
  };
}

// Store interface all stores must implement
interface ActionableStore<TState> {
  readonly state: TState;
  dispatch(action: Action): Promise<void>;
  getActionHandlers(): Record<string, (state: TState, action: Action) => TState | Promise<TState>>;
}

// Central dispatcher
class ActionDispatcher {
  private stores = new Map<string, ActionableStore<any>>();
  private middleware: Middleware[] = [];
  private isDispatching = false;

  register<T>(name: string, store: ActionableStore<T>) {
    this.stores.set(name, store);
  }

  use(middleware: Middleware) {
    this.middleware.push(middleware);
  }

  async dispatch(action: Action): Promise<void> {
    if (this.isDispatching) {
      throw new Error('Cannot dispatch action while dispatching');
    }

    this.isDispatching = true;
    
    try {
      // Apply middleware (logging, validation, etc.)
      let processedAction = action;
      for (const middleware of this.middleware) {
        processedAction = await middleware(processedAction, this);
      }

      // Add metadata
      processedAction.meta = {
        ...processedAction.meta,
        timestamp: new Date()
      };

      // Dispatch to all registered stores
      await Promise.all(
        Array.from(this.stores.values()).map(store => 
          store.dispatch(processedAction)
        )
      );

      // Broadcast to main process if requested
      if (processedAction.meta?.broadcast) {
        await window.api?.emitWorkspaceAction(processedAction);
      }

    } finally {
      this.isDispatching = false;
    }
  }
}

// Global instance
export const actionDispatcher = new ActionDispatcher();
```

### Middleware System

```typescript
type Middleware = (action: Action, dispatcher: ActionDispatcher) => Promise<Action>;

// Logging middleware
export const loggingMiddleware: Middleware = async (action) => {
  console.group(`🎯 Action: ${action.type}`);
  console.log('Payload:', action.payload);
  console.log('Meta:', action.meta);
  console.groupEnd();
  return action;
};

// Broadcasting middleware
export const broadcastMiddleware: Middleware = async (action) => {
  // Auto-broadcast workspace-related actions
  if (isWorkspaceAction(action.type)) {
    return {
      ...action,
      meta: { ...action.meta, broadcast: true }
    };
  }
  return action;
};

// Validation middleware
export const validationMiddleware: Middleware = async (action) => {
  if (!action.type) {
    throw new Error('Action must have a type');
  }
  return action;
};

function isWorkspaceAction(type: string): boolean {
  return [
    'ACTIVE_NOTE_CHANGED',
    'NOTE_PINNED',
    'NOTE_UNPINNED', 
    'TEMPORARY_TAB_ADDED',
    'TEMPORARY_TAB_REMOVED',
    'VAULT_SWITCHED'
  ].includes(type);
}
```

### Action Definitions

```typescript
// Workspace actions
export const WorkspaceActions = {
  // Active note actions
  SET_ACTIVE_NOTE: 'ACTIVE_NOTE_SET',
  CLEAR_ACTIVE_NOTE: 'ACTIVE_NOTE_CLEARED',
  
  // Pinned notes actions
  PIN_NOTE: 'NOTE_PINNED',
  UNPIN_NOTE: 'NOTE_UNPINNED',
  REORDER_PINNED_NOTES: 'PINNED_NOTES_REORDERED',
  
  // Temporary tabs actions
  ADD_TEMPORARY_TAB: 'TEMPORARY_TAB_ADDED',
  REMOVE_TEMPORARY_TAB: 'TEMPORARY_TAB_REMOVED',
  REORDER_TEMPORARY_TABS: 'TEMPORARY_TABS_REORDERED',
  CLEAR_TEMPORARY_TABS: 'TEMPORARY_TABS_CLEARED',
  
  // Vault actions
  SWITCH_VAULT: 'VAULT_SWITCHED',
  
  // Navigation actions
  NAVIGATE_TO_NOTE: 'NAVIGATE_TO_NOTE',
  NAVIGATE_BACK: 'NAVIGATE_BACK',
  NAVIGATE_FORWARD: 'NAVIGATE_FORWARD',
} as const;

// Action creators
export const createSetActiveNoteAction = (note: NoteMetadata | null): Action => ({
  type: WorkspaceActions.SET_ACTIVE_NOTE,
  payload: { note },
  meta: { broadcast: true }
});

export const createPinNoteAction = (note: { id: string; title: string; filename: string }): Action => ({
  type: WorkspaceActions.PIN_NOTE,
  payload: { note },
  meta: { broadcast: true }
});

export const createAddTemporaryTabAction = (
  noteId: string, 
  title: string, 
  source: 'search' | 'wikilink' | 'navigation' | 'history'
): Action => ({
  type: WorkspaceActions.ADD_TEMPORARY_TAB,
  payload: { noteId, title, source },
  meta: { broadcast: true }
});
```

### Refactored Store Pattern

```typescript
import { actionDispatcher } from './action-system';
import { WorkspaceActions } from './actions';
import type { ActionableStore } from './action-system';

interface ActiveNoteState {
  currentVaultId: string | null;
  activeNote: NoteMetadata | null;
}

const defaultState: ActiveNoteState = {
  currentVaultId: null,
  activeNote: null
};

class ActiveNoteStoreV2 implements ActionableStore<ActiveNoteState> {
  private _state = $state<ActiveNoteState>(defaultState);
  private isLoading = $state(true);
  private isInitialized = $state(false);

  constructor() {
    // Register with dispatcher
    actionDispatcher.register('activeNote', this);
    this.initialize();
  }

  get state(): ActiveNoteState {
    return this._state;
  }

  get activeNote(): NoteMetadata | null {
    return this._state.activeNote;
  }

  // Action handlers - pure functions that return new state
  getActionHandlers() {
    return {
      [WorkspaceActions.SET_ACTIVE_NOTE]: this.handleSetActiveNote.bind(this),
      [WorkspaceActions.CLEAR_ACTIVE_NOTE]: this.handleClearActiveNote.bind(this),
      [WorkspaceActions.SWITCH_VAULT]: this.handleVaultSwitch.bind(this),
    };
  }

  // Dispatch wrapper for external API
  async setActiveNote(note: NoteMetadata | null): Promise<void> {
    await actionDispatcher.dispatch({
      type: WorkspaceActions.SET_ACTIVE_NOTE,
      payload: { note },
      meta: { source: 'activeNoteStore' }
    });
  }

  async clearActiveNote(): Promise<void> {
    await actionDispatcher.dispatch({
      type: WorkspaceActions.CLEAR_ACTIVE_NOTE,
      meta: { source: 'activeNoteStore' }
    });
  }

  // Action handlers - these update state
  private async handleSetActiveNote(state: ActiveNoteState, action: Action): Promise<ActiveNoteState> {
    const newState = { ...state, activeNote: action.payload.note };
    this._state = newState;
    await this.saveToStorage();
    return newState;
  }

  private async handleClearActiveNote(state: ActiveNoteState, action: Action): Promise<ActiveNoteState> {
    const newState = { ...state, activeNote: null };
    this._state = newState;
    await this.saveToStorage();
    return newState;
  }

  private async handleVaultSwitch(state: ActiveNoteState, action: Action): Promise<ActiveNoteState> {
    const newState = { ...state, currentVaultId: action.payload.vaultId, activeNote: null };
    this._state = newState;
    await this.saveToStorage();
    return newState;
  }

  // Central dispatch implementation
  async dispatch(action: Action): Promise<void> {
    const handlers = this.getActionHandlers();
    const handler = handlers[action.type];
    
    if (handler) {
      await handler(this._state, action);
    }
  }

  // ... existing storage methods unchanged
}

export const activeNoteStore = new ActiveNoteStoreV2();
```

### Component Integration

```typescript
<script lang="ts">
  import { actionDispatcher } from '../stores/action-system';
  import { createSetActiveNoteAction, createPinNoteAction } from '../stores/actions';
  import { activeNoteStore } from '../stores/activeNoteStore.svelte';

  // Reactive access to state (unchanged)
  const activeNote = $derived(activeNoteStore.activeNote);

  // Action dispatching instead of direct method calls
  async function handleNoteSelect(note: NoteMetadata) {
    // Old way:
    // await activeNoteStore.setActiveNote(note);
    
    // New way:
    await actionDispatcher.dispatch(createSetActiveNoteAction(note));
  }

  async function handlePinNote(note: NoteMetadata) {
    await actionDispatcher.dispatch(createPinNoteAction({
      id: note.id,
      title: note.title,
      filename: note.filename
    }));
  }
</script>

<!-- Template unchanged - still uses reactive state -->
{#if activeNote}
  <h1>{activeNote.title}</h1>
{/if}
```

## Main Process Integration

### Workspace State Service

```typescript
interface WorkspaceState {
  activeNote: {
    id: string;
    title: string;
    type: string;
  } | null;
  pinnedNotes: Array<{
    id: string;
    title: string;
    filename: string;
  }>;
  temporaryTabs: Array<{
    id: string;
    noteId: string;
    title: string;
    source: string;
  }>;
  currentVaultId: string | null;
  lastUpdated: Date;
}

export class WorkspaceStateService {
  private state: WorkspaceState = {
    activeNote: null,
    pinnedNotes: [],
    temporaryTabs: [],
    currentVaultId: null,
    lastUpdated: new Date()
  };

  private listeners: Array<(state: WorkspaceState) => void> = [];

  getCurrentState(): WorkspaceState {
    return { ...this.state };
  }

  handleWorkspaceAction(action: any): void {
    let stateChanged = false;

    switch (action.type) {
      case 'ACTIVE_NOTE_SET':
        this.state.activeNote = action.payload.note ? {
          id: action.payload.note.id,
          title: action.payload.note.title,
          type: action.payload.note.type
        } : null;
        stateChanged = true;
        break;

      case 'NOTE_PINNED':
        if (!this.state.pinnedNotes.find(n => n.id === action.payload.note.id)) {
          this.state.pinnedNotes.push(action.payload.note);
          stateChanged = true;
        }
        break;

      case 'TEMPORARY_TAB_ADDED':
        const existingTab = this.state.temporaryTabs.find(t => t.noteId === action.payload.noteId);
        if (!existingTab) {
          this.state.temporaryTabs.push({
            id: `tab-${Date.now()}`,
            noteId: action.payload.noteId,
            title: action.payload.title,
            source: action.payload.source
          });
          stateChanged = true;
        }
        break;
    }

    if (stateChanged) {
      this.state.lastUpdated = new Date();
      this.notifyListeners();
    }
  }

  subscribe(listener: (state: WorkspaceState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }
}
```

### Updated Tool Service Integration

```typescript
// Add to existing tool-service.ts

private getWorkspaceContextTool = {
  name: 'get_workspace_context',
  description: 'Get current workspace context including active note, pinned notes, and temporary tabs',
  schema: {
    type: 'object',
    properties: {
      includeContent: {
        type: 'boolean',
        description: 'Whether to include note content or just metadata',
        default: false
      }
    },
    additionalProperties: false
  },
  handler: async (args: { includeContent?: boolean }) => {
    const workspaceState = this.workspaceStateService.getCurrentState();
    
    if (args.includeContent && workspaceState.activeNote) {
      // Fetch note content if requested
      const noteContent = await this.noteService.getNote({
        identifier: workspaceState.activeNote.id,
        vaultId: workspaceState.currentVaultId || 'default'
      });
      
      return {
        success: true,
        data: {
          ...workspaceState,
          activeNote: {
            ...workspaceState.activeNote,
            content: noteContent?.content
          }
        }
      };
    }

    return {
      success: true,
      data: workspaceState
    };
  }
};
```

## Implementation Plan

### Phase 1: Foundation (Week 1)
1. **Create core action system**
   - Implement `ActionDispatcher` class
   - Create middleware system  
   - Add action definitions
   - Set up IPC broadcasting

2. **Set up main process integration**
   - Implement `WorkspaceStateService`
   - Add IPC handlers for workspace actions
   - Create basic workspace context tool

### Phase 2: Store Migration (Weeks 2-3)
1. **Migrate high-impact stores first**
   - `activeNoteStore` - most critical for tools
   - `pinnedNotesStore` - frequently used
   - `temporaryTabsStore` - complex coordination logic

2. **Update components gradually**
   - Replace direct store method calls with action dispatches
   - Maintain backward compatibility during transition
   - Add action creators for common operations

### Phase 3: Advanced Features (Week 4)
1. **Add sophisticated middleware**
   - Persistence middleware for auto-saving
   - Undo/redo middleware
   - Performance monitoring

2. **Enhanced tool integration**
   - `getCurrentNoteTool` implementation
   - Advanced workspace querying
   - Note relationship context

### Phase 4: Optimization & Polish (Week 5)
1. **Performance optimization**
   - Batch action processing
   - Debounced broadcasting
   - Memory usage optimization

2. **Developer experience**
   - DevTools integration
   - Action debugging UI
   - Migration utilities

## Migration Strategy

### Backward Compatibility
During migration, stores will support both old and new APIs:

```typescript
class MigratingStore {
  // New action-based API
  async dispatch(action: Action): Promise<void> {
    // ... handle action
  }
  
  // Legacy API - delegates to actions
  async setActiveNote(note: NoteMetadata | null): Promise<void> {
    console.warn('setActiveNote is deprecated, use actions instead');
    return this.dispatch({
      type: 'ACTIVE_NOTE_SET',
      payload: { note }
    });
  }
}
```

### Component Update Pattern
```typescript
<script lang="ts">
  // Phase 1: Add action dispatcher alongside existing store
  import { actionDispatcher } from '../stores/action-system';
  import { activeNoteStore } from '../stores/activeNoteStore.svelte';

  // Phase 2: Gradually replace direct calls
  async function handleNoteSelect(note: NoteMetadata) {
    // Use actions for new features
    await actionDispatcher.dispatch(createSetActiveNoteAction(note));
    
    // Keep existing calls for stability
    // await activeNoteStore.setActiveNote(note);
  }
</script>
```

## Testing Strategy

### Unit Testing
```typescript
describe('ActionDispatcher', () => {
  let dispatcher: ActionDispatcher;
  let mockStore: ActionableStore<any>;

  beforeEach(() => {
    dispatcher = new ActionDispatcher();
    mockStore = createMockStore();
    dispatcher.register('test', mockStore);
  });

  it('should dispatch actions to registered stores', async () => {
    const action = { type: 'TEST_ACTION', payload: { data: 'test' } };
    
    await dispatcher.dispatch(action);
    
    expect(mockStore.dispatch).toHaveBeenCalledWith(action);
  });

  it('should broadcast workspace actions to main process', async () => {
    const workspaceAction = { 
      type: 'ACTIVE_NOTE_SET', 
      payload: { note: mockNote },
      meta: { broadcast: true }
    };
    
    await dispatcher.dispatch(workspaceAction);
    
    expect(window.api?.emitWorkspaceAction).toHaveBeenCalledWith(workspaceAction);
  });
});
```

### Integration Testing
```typescript
describe('Workspace Context Integration', () => {
  it('should provide current workspace state to tools', async () => {
    // Set up workspace state via actions
    await actionDispatcher.dispatch(createSetActiveNoteAction(mockNote));
    await actionDispatcher.dispatch(createPinNoteAction(mockPinnedNote));
    
    // Query workspace context tool
    const result = await toolService.executeWorkspaceContextTool({});
    
    expect(result.data.activeNote.id).toBe(mockNote.id);
    expect(result.data.pinnedNotes).toHaveLength(1);
  });
});
```

## Risk Assessment & Mitigation

### High Risk: Breaking Changes During Migration
**Mitigation**: 
- Maintain dual APIs during transition
- Comprehensive testing at each phase
- Feature flags for new action system

### Medium Risk: Performance Regression
**Mitigation**:
- Benchmark current performance
- Implement batching for high-frequency actions
- Monitor bundle size impact

### Low Risk: Developer Adoption
**Mitigation**:
- Clear migration guides
- Incremental adoption possible
- Maintain familiar patterns where possible

## Success Criteria

### Technical Metrics
- [ ] All workspace state changes broadcast to main process within 50ms
- [ ] Zero breaking changes to existing component APIs during migration
- [ ] Bundle size increase < 15KB
- [ ] Action dispatch overhead < 1ms average

### Functional Metrics  
- [ ] Workspace context tools return accurate real-time state
- [ ] UI responsiveness maintained or improved
- [ ] State coordination bugs eliminated (no more manual sync issues)

### Developer Experience
- [ ] Clear action patterns for all state changes
- [ ] Debugging capabilities improved with action logs
- [ ] New feature development simplified with standardized state patterns

This architecture provides a solid foundation for both the immediate workspace context tool needs and future state management requirements, while maintaining Svelte 5's reactive advantages and providing a smooth migration path.