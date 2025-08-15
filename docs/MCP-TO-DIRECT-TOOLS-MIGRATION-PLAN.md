# MCP to Direct Tools Migration Plan

## Overview

This plan outlines the migration from the current MCP (Model Context Protocol) server architecture to a simpler approach where tools are directly defined using the AI SDK and call the Flint Note API directly.

## Current Architecture

```
AI Service → MCP Client → Separate MCP Server Process → @flint-note/server → Flint Note API
```

## Target Architecture

```
AI Service → Direct AI SDK Tools → Note Service → Flint Note API
```

## Benefits of Migration

1. **Simplified Process Management**: Eliminates the need to spawn and manage a separate MCP server process
2. **Reduced Complexity**: Direct tool calls are simpler than MCP protocol communication
3. **Better Error Handling**: Direct function calls provide clearer error propagation
4. **Performance**: Eliminates IPC overhead between processes
5. **Debugging**: Easier to debug direct function calls vs. MCP protocol messages
6. **Consistency**: Uses the same Note Service that the rest of the app uses

## Migration Strategy

### Phase 1: Create Direct Tool Definitions

#### Tool Categories to Migrate

1. **Note Management Tools** (7 tools)
   - `create_note`: Create single or multiple notes
   - `get_note`: Retrieve a single note by identifier
   - `get_notes`: Retrieve multiple notes by identifiers
   - `update_note`: Update note content and metadata
   - `delete_note`: Delete a note with confirmation
   - `rename_note`: Rename a note and update links
   - `move_note`: Move a note to a different type

2. **Search Tools** (2 tools)
   - `search_notes`: Basic text search with filters
   - `search_notes_advanced`: Advanced search with metadata filters, date ranges, sorting

3. **Note Type Management Tools** (5 tools)
   - `create_note_type`: Create new note types with metadata schemas
   - `list_note_types`: List all available note types
   - `get_note_type_info`: Get detailed info about a note type
   - `update_note_type`: Update note type configuration
   - `delete_note_type`: Delete note type with migration options

4. **Vault Management Tools** (2 tools)
   - `get_current_vault`: Get current active vault information
   - `list_vaults`: List all available vaults

5. **Link Management Tools** (3 tools)
   - `get_note_links`: Get outgoing and incoming links for a note
   - `get_backlinks`: Get backlinks pointing to a note
   - `find_broken_links`: Find all broken wikilinks in the vault

#### Tool Implementation Pattern

Each tool will follow this pattern:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const createNoteTool = tool({
  description: 'Create a new note with specified content and metadata',
  inputSchema: z.object({
    type: z.string().describe('Note type (must exist)'),
    title: z.string().describe('Title of the note'),
    content: z.string().describe('Content of the note in markdown format'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata fields'),
    vault_id: z.string().nullable().optional().describe('Optional vault ID')
  }),
  execute: async ({ type, title, content, metadata, vault_id }) => {
    try {
      const result = await noteService.createNote(type, title, content, vault_id);
      return {
        success: true,
        noteId: result.id,
        message: `Created note "${title}" of type "${type}"`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Failed to create note: ${error.message}`
      };
    }
  }
});
```

### Phase 2: Update AI Service Architecture

#### Current MCP Integration Points to Replace

1. **MCP Client Initialization** (`src/main/ai-service.ts:99`)

   ```typescript
   // REMOVE: initializeFlintMcpServer()
   // REMOVE: mcpClient property and related code
   ```

2. **Tool Schema Definition** (`src/main/ai-service.ts:124-544`)

   ```typescript
   // REMOVE: getFlintToolSchemas() method
   // REPLACE WITH: Direct tool definitions
   ```

3. **Tool Usage in Generation** (`src/main/ai-service.ts:1515-1520, 1681-1686`)
   ```typescript
   // REMOVE: mcpClient.tools() calls
   // REPLACE WITH: Direct tools object
   ```

#### New Tool Service Architecture

Create a new `ToolService` class that:

1. Contains all tool definitions
2. Provides a `getTools()` method that returns AI SDK tool objects
3. Handles error mapping and response formatting consistently
4. Manages tool execution context and logging

```typescript
class ToolService {
  constructor(private noteService: NoteService) {}

  getTools() {
    return {
      create_note: this.createNoteTool,
      get_note: this.getNoteTool
      // ... all other tools
    };
  }

  private createNoteTool = tool({
    /* definition */
  });
  // ... other tool definitions
}
```

### Phase 3: Update AI Service Methods

#### Changes to `sendMessage()` and `sendMessageStream()`

Replace MCP tool integration:

```typescript
// BEFORE (MCP):
const mcpTools = this.mcpClient
  ? await (this.mcpClient as any).tools({
      schemas: this.getFlintToolSchemas()
    })
  : {};

const result = await generateText({
  model: this.gateway(this.currentModelName),
  messages,
  tools: mcpTools as any
  // ...
});

// AFTER (Direct Tools):
const tools = this.toolService.getTools();

const result = await generateText({
  model: this.gateway(this.currentModelName),
  messages,
  tools
  // ...
});
```

#### Constructor Changes

```typescript
// BEFORE:
constructor(gateway: GatewayProvider, noteService: NoteService | null) {
  // ...
  this.initializeFlintMcpServer();
  // ...
}

// AFTER:
constructor(gateway: GatewayProvider, noteService: NoteService | null) {
  // ...
  this.toolService = new ToolService(noteService);
  // ...
}
```

### Phase 4: Error Handling and Response Consistency

#### Standardized Error Responses

All tools should return consistent error responses:

```typescript
interface ToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  message: string;
}
```

#### Error Mapping Strategy

1. **Note Not Found**: Map to user-friendly messages
2. **Validation Errors**: Provide specific field error details
3. **Permission Errors**: Clear permission requirement messages
4. **System Errors**: Graceful degradation messages

### Phase 5: Testing Strategy

#### Unit Tests

- Test each tool individually with mock Note Service
- Test error conditions and edge cases
- Validate tool input schemas

#### Integration Tests

- Test tool execution through AI Service
- Test conversation flows with tool calls
- Test error propagation and recovery

#### Manual Testing

- Create notes through AI assistant
- Search and retrieve notes
- Update and delete operations
- Test all vault and link operations

### Phase 6: Cleanup and Documentation

#### Code Removal

1. Remove MCP client imports and dependencies
2. Remove `initializeFlintMcpServer()` method
3. Remove `getFlintToolSchemas()` method
4. Clean up unused MCP-related properties

#### Package Dependencies

- Remove MCP-related dependencies from package.json
- Update dependency tree

#### Documentation Updates

- Update ARCHITECTURE.md to reflect new tool architecture
- Add tool documentation with examples
- Update development guides

## Implementation Checklist

### Core Implementation

- [ ] Create ToolService class with all tool definitions
- [ ] Update AI Service constructor to use ToolService
- [ ] Replace MCP tool usage in sendMessage()
- [ ] Replace MCP tool usage in sendMessageStream()
- [ ] Remove MCP client initialization
- [ ] Update error handling for direct tool calls

### Tool Implementations (19 tools total)

- [ ] create_note (handles both single and batch creation)
- [ ] get_note
- [ ] get_notes
- [ ] update_note
- [ ] delete_note
- [ ] rename_note
- [ ] move_note
- [ ] search_notes
- [ ] search_notes_advanced
- [ ] create_note_type
- [ ] list_note_types
- [ ] get_note_type_info
- [ ] update_note_type
- [ ] delete_note_type
- [ ] get_current_vault
- [ ] list_vaults
- [ ] get_note_links
- [ ] get_backlinks
- [ ] find_broken_links

### Testing & Validation

- [ ] Unit tests for all tools
- [ ] Integration tests for AI Service
- [ ] Manual testing of core workflows
- [ ] Performance testing vs. MCP approach
- [ ] Error handling validation

### Cleanup & Documentation

- [ ] Remove MCP dependencies and code
- [ ] Update architecture documentation
- [ ] Update CLAUDE.md with new development info
- [ ] Create migration notes for future reference

## Risk Mitigation

### Potential Issues

1. **Tool Schema Mismatches**: Current MCP schemas might not translate exactly to AI SDK format
2. **Error Handling Changes**: Different error propagation patterns between MCP and direct calls
3. **Performance Differences**: Direct calls might have different performance characteristics

### Mitigation Strategies

1. **Gradual Migration**: Implement and test tools incrementally
2. **Feature Flags**: Add configuration to switch between MCP and direct tools during testing
3. **Comprehensive Testing**: Test all tool combinations and edge cases
4. **Rollback Plan**: Keep MCP code temporarily for quick rollback if needed

## Success Criteria

1. **Functional Parity**: All current MCP tool functionality works identically with direct tools
2. **Performance**: No significant performance regression (ideally improvement)
3. **Reliability**: Improved error handling and debugging capabilities
4. **Maintainability**: Simpler codebase without MCP complexity
5. **Development Experience**: Easier to add new tools and debug issues

## Timeline Estimate

- **Phase 1-2 (Core Implementation)**: 2-3 days
- **Phase 3-4 (Integration & Testing)**: 2-3 days
- **Phase 5-6 (Testing & Cleanup)**: 1-2 days

**Total Estimated Time**: 5-8 days

This migration will significantly simplify the architecture while maintaining all current functionality and improving the development experience for future enhancements.
