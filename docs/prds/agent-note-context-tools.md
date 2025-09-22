# PRD: Agent Note Context Tools with Event-Driven Architecture

## Executive Summary

Implement on-demand workspace context tools for the AI agent, leveraging the new centralized action dispatcher system to provide real-time workspace state access. This replaces the current static note context injection with dynamic, token-efficient tools that automatically stay synchronized with user navigation.

## Goals & Objectives

### Primary Goals

1. **Dynamic Context Access**: Enable AI agent to retrieve current workspace state on-demand
2. **Token Efficiency**: Reduce token usage by 60-80% through selective context retrieval
3. **Real-Time Synchronization**: Ensure context always reflects current UI state via event broadcasting
4. **Enhanced Scope**: Provide access to active note, pinned notes, and temporary tabs

### Success Metrics

- Average tokens per conversation reduced by 60-80%
- Tool response latency < 100ms for workspace context queries
- 100% accuracy in workspace state reflection
- Zero context staleness issues during user navigation

## Problem Statement

### Current Limitations

The existing static note context system has critical flaws:

1. **Static Context**: Note content captured once at message send, becomes stale as users navigate
2. **Token Waste**: Always includes full note content (up to 8000 chars) regardless of relevance
3. **Limited Scope**: Only includes initially active note, no access to pinned/temporary notes
4. **Poor UX**: Context becomes outdated during long conversations as users switch notes
5. **Performance Impact**: Large context injection affects response times

### Business Impact

- Users receive irrelevant responses when context is stale
- Increased API costs due to unnecessary token usage
- Poor AI assistance quality during multi-note workflows
- Limited AI awareness of user's workspace organization

## Solution Architecture

### Event-Driven Context System

Leveraging the centralized action dispatcher, workspace state is automatically synchronized to the main process, enabling instant tool access to current state.

```typescript
// Workspace state automatically maintained in main process
interface WorkspaceState {
  activeNote: {
    id: string;
    title: string;
    type: string;
    lastModified: Date;
  } | null;
  pinnedNotes: Array<{
    id: string;
    title: string;
    filename: string;
    pinnedAt: Date;
  }>;
  temporaryTabs: Array<{
    id: string;
    noteId: string;
    title: string;
    source: 'search' | 'wikilink' | 'navigation' | 'history';
    lastAccessed: Date;
  }>;
  currentVaultId: string | null;
  lastUpdated: Date;
}
```

### Tool Implementations

#### Tool 1: `get_workspace_context`

**Purpose**: Provides overview of current workspace state with optional content inclusion.

**Input Schema**:

```typescript
{
  includeContent?: boolean; // Default: false
  maxContentLength?: number; // Default: 2000 chars per note
  includeMetadata?: boolean; // Default: true
}
```

**Output Schema**:

```typescript
{
  success: boolean;
  data: {
    activeNote?: {
      id: string;
      title: string;
      type: string;
      content?: string; // Only if includeContent = true
      metadata?: NoteMetadata; // Only if includeMetadata = true
      lastModified: Date;
    };
    pinnedNotes: Array<{
      id: string;
      title: string;
      type: string;
      content?: string;
      metadata?: NoteMetadata;
      pinnedAt: Date;
    }>;
    temporaryTabs: Array<{
      id: string;
      noteId: string;
      title: string;
      type: string;
      content?: string;
      source: string;
      lastAccessed: Date;
    }>;
    vaultInfo: {
      id: string;
      name: string;
      path: string;
    };
    summary: {
      totalNotes: number;
      pinnedCount: number;
      temporaryTabsCount: number;
      lastActivity: Date;
    };
  };
  message: string;
}
```

**Implementation Strategy**:

- Read from synchronized workspace state (instant access)
- Fetch note content only when requested
- Apply content truncation with smart ellipsis
- Include contextual metadata for AI decision-making

#### Tool 2: `get_current_note`

**Purpose**: Retrieves complete details of the currently active note.

**Input Schema**:

```typescript
{
  includeMetadata?: boolean; // Default: true
  includeLinks?: boolean; // Default: false - include wikilinks and backlinks
  includeOutline?: boolean; // Default: false - include heading structure
  maxContentLength?: number; // Default: unlimited
}
```

**Output Schema**:

```typescript
{
  success: boolean;
  data?: {
    id: string;
    title: string;
    type: string;
    content: string;
    metadata?: {
      tags: string[];
      customFields: Record<string, any>;
      created: Date;
      lastModified: Date;
      wordCount: number;
      characterCount: number;
      noteType: {
        name: string;
        schema?: MetadataSchema;
      };
    };
    links?: {
      outgoing: Array<{ target: string; title: string; exists: boolean }>;
      incoming: Array<{ source: string; title: string; context: string }>;
    };
    outline?: Array<{
      level: number;
      title: string;
      line: number;
    }>;
  };
  error?: string;
  message: string;
}
```

**Implementation Strategy**:

- Fast path: Return immediately if no active note
- Leverage existing note service APIs
- Optional enrichment with links and structure
- Graceful degradation if note doesn't exist

#### Tool 3: `get_note_by_reference`

**Purpose**: Retrieves specific note by ID, title, or filename for contextual reference.

**Input Schema**:

```typescript
{
  reference: string; // Note ID, title, or filename
  includeContent?: boolean; // Default: true
  includeMetadata?: boolean; // Default: false
  maxContentLength?: number; // Default: 3000
}
```

**Use Cases**:

- Agent needs to reference a specific note mentioned in conversation
- Cross-referencing between notes in workspace
- Following up on pinned or temporary notes

## Technical Implementation

### Main Process Integration

```typescript
// Enhanced workspace state service with tool integration
export class WorkspaceStateService {
  private state: WorkspaceState;
  private noteService: NoteService;

  async getWorkspaceContext(
    options: GetWorkspaceContextOptions
  ): Promise<WorkspaceContextResult> {
    const baseState = this.getCurrentState();

    if (options.includeContent) {
      // Batch fetch note content for efficiency
      const noteIds = [
        ...(baseState.activeNote ? [baseState.activeNote.id] : []),
        ...baseState.pinnedNotes.map((n) => n.id),
        ...baseState.temporaryTabs.map((t) => t.noteId)
      ];

      const noteContents = await this.batchFetchNoteContent(
        noteIds,
        options.maxContentLength
      );
      return this.enrichStateWithContent(baseState, noteContents);
    }

    return { success: true, data: baseState, message: 'Workspace context retrieved' };
  }

  async getCurrentNote(options: GetCurrentNoteOptions): Promise<CurrentNoteResult> {
    if (!this.state.activeNote) {
      return {
        success: false,
        error: 'No note currently active',
        message: 'Open a note to use this tool'
      };
    }

    const note = await this.noteService.getNote({
      identifier: this.state.activeNote.id,
      vaultId: this.state.currentVaultId
    });

    if (!note) {
      return {
        success: false,
        error: 'Active note not found',
        message: 'The active note may have been deleted'
      };
    }

    return this.buildCurrentNoteResponse(note, options);
  }

  private async batchFetchNoteContent(
    noteIds: string[],
    maxLength?: number
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    // Batch fetch for efficiency
    const notes = await Promise.allSettled(
      noteIds.map((id) =>
        this.noteService.getNote({ identifier: id, vaultId: this.state.currentVaultId })
      )
    );

    notes.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        let content = result.value.content;
        if (maxLength && content.length > maxLength) {
          content = this.smartTruncate(content, maxLength);
        }
        results.set(noteIds[index], content);
      }
    });

    return results;
  }

  private smartTruncate(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;

    // Try to break at paragraph or sentence boundaries
    const truncated = content.substring(0, maxLength);
    const lastParagraph = truncated.lastIndexOf('\n\n');
    const lastSentence = truncated.lastIndexOf('. ');

    if (lastParagraph > maxLength * 0.7) {
      return truncated.substring(0, lastParagraph) + '\n\n[Content truncated...]';
    } else if (lastSentence > maxLength * 0.7) {
      return truncated.substring(0, lastSentence + 1) + ' [Content truncated...]';
    } else {
      return truncated + '... [Content truncated]';
    }
  }
}
```

### Event Broadcasting Integration

```typescript
// Automatic workspace state synchronization
class WorkspaceEventHandler {
  constructor(private workspaceStateService: WorkspaceStateService) {
    // Listen for workspace actions from renderer
    ipcMain.on('workspace-action', this.handleWorkspaceAction.bind(this));
  }

  private handleWorkspaceAction(event: any, action: Action): void {
    // Update workspace state based on UI actions
    this.workspaceStateService.handleWorkspaceAction(action);

    // Emit state change event for debugging/monitoring
    this.emitStateChange(action.type);
  }

  private emitStateChange(actionType: string): void {
    // Optional: emit events for monitoring/debugging
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔄 Workspace state updated via ${actionType}`);
    }
  }
}
```

### Tool Service Integration

```typescript
// Add to existing ToolService class
export class ToolService {
  private workspaceStateService: WorkspaceStateService;

  getTools() {
    return [
      // ... existing tools
      this.getWorkspaceContextTool,
      this.getCurrentNoteTool,
      this.getNoteByReferenceTool
    ];
  }

  private getWorkspaceContextTool = {
    name: 'get_workspace_context',
    description:
      'Get current workspace state including active note, pinned notes, and temporary tabs',
    schema: {
      type: 'object',
      properties: {
        includeContent: {
          type: 'boolean',
          description: 'Whether to include note content',
          default: false
        },
        maxContentLength: {
          type: 'number',
          description: 'Maximum content length per note in characters',
          default: 2000,
          minimum: 100,
          maximum: 10000
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Whether to include note metadata',
          default: true
        }
      },
      additionalProperties: false
    },
    handler: async (args: GetWorkspaceContextOptions) => {
      return await this.workspaceStateService.getWorkspaceContext(args);
    }
  };

  private getCurrentNoteTool = {
    name: 'get_current_note',
    description: 'Get the complete content and details of the currently active note',
    schema: {
      type: 'object',
      properties: {
        includeMetadata: {
          type: 'boolean',
          description: 'Whether to include detailed metadata',
          default: true
        },
        includeLinks: {
          type: 'boolean',
          description: 'Whether to include wikilinks and backlinks',
          default: false
        },
        includeOutline: {
          type: 'boolean',
          description: 'Whether to include heading structure outline',
          default: false
        },
        maxContentLength: {
          type: 'number',
          description: 'Maximum content length (unlimited if not specified)',
          minimum: 100
        }
      },
      additionalProperties: false
    },
    handler: async (args: GetCurrentNoteOptions) => {
      return await this.workspaceStateService.getCurrentNote(args);
    }
  };

  private getNoteByReferenceTool = {
    name: 'get_note_by_reference',
    description: 'Retrieve a specific note by ID, title, or filename',
    schema: {
      type: 'object',
      properties: {
        reference: {
          type: 'string',
          description: 'Note ID, title, or filename to retrieve'
        },
        includeContent: {
          type: 'boolean',
          description: 'Whether to include note content',
          default: true
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Whether to include metadata',
          default: false
        },
        maxContentLength: {
          type: 'number',
          description: 'Maximum content length in characters',
          default: 3000,
          minimum: 100,
          maximum: 10000
        }
      },
      required: ['reference'],
      additionalProperties: false
    },
    handler: async (args: GetNoteByReferenceOptions) => {
      return await this.workspaceStateService.getNoteByReference(args);
    }
  };
}
```

## Frontend Simplification

### Remove Static Context System

```typescript
// Updated handleSendMessage in App.svelte - simplified
async function handleSendMessage(text: string): Promise<void> {
  // No more noteContext parameter or static injection
  const newMessage: Message = {
    id: generateUniqueId(),
    text: text, // Store original text only
    sender: 'user',
    timestamp: new Date()
  };
  await unifiedChatStore.addMessage(newMessage);

  // Send message without context - agent uses tools as needed
  const response = await chatService.sendMessageStream(
    text,
    unifiedChatStore.activeThreadId || undefined,
    onChunk,
    onComplete,
    onError,
    modelStore.selectedModel,
    onToolCall
    // No systemMessageForAI parameter
  );
}
```

### Simplified MessageInput Component

```typescript
// Updated MessageInput.svelte - remove context toggle
<script lang="ts">
  interface Props {
    onSend: (text: string) => void; // Simplified interface
  }

  let { onSend }: Props = $props();

  async function handleSubmit() {
    if (text.trim()) {
      onSend(text.trim()); // No context fetching
      inputText = '';
    }
  }
</script>

<!-- Remove note context toggle UI entirely -->
<div class="message-input">
  <div class="editor-container">
    <!-- Editor content -->
  </div>
  <!-- No more context controls -->
</div>
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

1. **Implement WorkspaceStateService**
   - Create state management service in main process
   - Add event handling for workspace actions
   - Implement basic state synchronization

2. **Create tool definitions**
   - Add tool schemas and handlers to ToolService
   - Implement `get_workspace_context` with basic functionality
   - Add `get_current_note` tool

### Phase 2: Enhanced Tools (Week 2)

1. **Add advanced tool features**
   - Implement content truncation and smart ellipsis
   - Add batch note fetching for efficiency
   - Create `get_note_by_reference` tool

2. **Frontend cleanup**
   - Remove static context injection from App.svelte
   - Simplify MessageInput component
   - Remove note context toggle UI

### Phase 3: Optimization (Week 3)

1. **Performance improvements**
   - Implement note content caching
   - Add batch processing for multiple tool calls
   - Optimize state synchronization

2. **Enhanced features**
   - Add note outline extraction
   - Implement link analysis for notes
   - Add workspace summary generation

### Phase 4: Testing & Polish (Week 4)

1. **Comprehensive testing**
   - Unit tests for workspace state service
   - Integration tests for tool functionality
   - Performance testing for large workspaces

2. **User experience refinements**
   - Error handling improvements
   - Tool response optimization
   - Documentation and help text

## Testing Strategy

### Unit Testing

```typescript
describe('WorkspaceStateService', () => {
  let service: WorkspaceStateService;

  beforeEach(() => {
    service = new WorkspaceStateService(mockNoteService);
  });

  it('should return current workspace context', async () => {
    // Set up workspace state
    await service.handleWorkspaceAction({
      type: 'ACTIVE_NOTE_SET',
      payload: { note: mockNote }
    });

    const result = await service.getWorkspaceContext({});

    expect(result.success).toBe(true);
    expect(result.data.activeNote?.id).toBe(mockNote.id);
  });

  it('should include content when requested', async () => {
    const result = await service.getWorkspaceContext({ includeContent: true });

    expect(result.data.activeNote?.content).toBeDefined();
  });

  it('should handle no active note gracefully', async () => {
    const result = await service.getCurrentNote({});

    expect(result.success).toBe(false);
    expect(result.error).toBe('No note currently active');
  });
});
```

### Integration Testing

```typescript
describe('Agent Context Tools Integration', () => {
  it('should provide real-time workspace state to agent', async () => {
    // Simulate user navigation via actions
    await actionDispatcher.dispatch(createSetActiveNoteAction(mockNote));
    await actionDispatcher.dispatch(createPinNoteAction(mockPinnedNote));

    // Agent calls workspace context tool
    const result = await toolService.executeWorkspaceContextTool({});

    expect(result.data.activeNote.id).toBe(mockNote.id);
    expect(result.data.pinnedNotes).toHaveLength(1);
  });

  it('should handle note content efficiently', async () => {
    const start = Date.now();
    const result = await toolService.executeWorkspaceContextTool({
      includeContent: true
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100); // 100ms performance target
    expect(result.data.activeNote.content).toBeDefined();
  });
});
```

## Success Metrics & KPIs

### Performance Metrics

- [ ] Tool response time < 100ms for workspace context queries
- [ ] Tool response time < 200ms for content-inclusive queries
- [ ] State synchronization latency < 50ms from UI action to main process
- [ ] Memory usage increase < 10MB for workspace state management

### Token Efficiency Metrics

- [ ] Average conversation token count reduced by 60-80%
- [ ] Context relevance score > 90% (measured via user feedback)
- [ ] Reduced API costs measurable in production usage

### Reliability Metrics

- [ ] Zero context staleness incidents during user navigation
- [ ] 100% workspace state accuracy in tool responses
- [ ] < 0.1% tool failure rate under normal usage conditions

### User Experience Metrics

- [ ] AI response relevance improved (measured via user ratings)
- [ ] Conversation flow uninterrupted by context issues
- [ ] No degradation in AI assistance quality despite reduced static context

## Risk Assessment & Mitigation

### High Risk: Tool Performance Impact

**Risk**: Tool calls add latency to AI responses
**Mitigation**:

- Aggressive caching of workspace state
- Batch processing for multiple tool calls
- Asynchronous state updates with eventual consistency

### Medium Risk: Context Accuracy During Rapid Navigation

**Risk**: State synchronization lag during fast user navigation
**Mitigation**:

- Debounced state updates for rapid actions
- Optimistic UI updates with rollback capability
- Performance monitoring and alerting

### Low Risk: Agent Over-reliance on Tools

**Risk**: Agent makes excessive tool calls, degrading performance
**Mitigation**:

- Tool usage monitoring and optimization suggestions
- Intelligent caching to reduce redundant calls
- Agent prompt engineering to encourage efficient tool usage

## Future Enhancements

### Advanced Context Tools

- `search_workspace`: Full-text search across workspace with ranking
- `get_related_notes`: Semantic similarity search for related content
- `get_note_diff`: Track changes in notes during conversation
- `get_workspace_summary`: High-level overview of workspace organization

### AI Memory Integration

- Persistent context memory across conversations
- Workspace structure learning and optimization
- Proactive context suggestion based on usage patterns

### Collaborative Features

- Multi-user workspace state synchronization
- Shared context in team environments
- Context access permissions and privacy controls

This PRD establishes a comprehensive foundation for implementing intelligent, event-driven workspace context tools that will significantly enhance AI assistance quality while improving performance and token efficiency.
