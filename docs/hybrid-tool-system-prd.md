# Hybrid Tool System PRD
## Basic Tools + Code Evaluator Integration

### Executive Summary

**Problem**: While the code evaluator provides powerful TypeScript-based automation, it creates friction for simple operations that comprise 80% of AI agent interactions. Agents must write TypeScript for basic CRUD operations like retrieving or updating a single note.

**Solution**: Introduce 7 structured basic tools for common operations while preserving the code evaluator for complex workflows. This hybrid approach provides the simplicity agents need for everyday tasks and the power they need for advanced automation.

**Impact**: Reduces complexity for basic operations while maintaining full flexibility for complex workflows, improving agent productivity and developer experience.

---

## Problem Statement

### Current State Analysis

**Code Evaluator Strengths:**
- Powerful TypeScript-based programming interface
- Secure WebAssembly execution environment
- Complete FlintNote API access (39 methods)
- Custom functions for workflow automation
- Excellent for complex multi-step operations

**Current Pain Points:**
- TypeScript requirement for simple operations
- Compilation overhead for basic CRUD
- Steep learning curve for basic note access
- Over-engineering simple agent tasks

### User Journey Analysis

**80% of agent interactions are basic operations:**
```
Agent: "Get note ABC123"
Current: Must write TypeScript function with async/await, types, error handling
Desired: Single tool call: get_note({ id: "ABC123" })
```

**20% of interactions are complex workflows:**
```
Agent: "Analyze note relationships across 100 notes"
Current: Perfect use case for code evaluator
Desired: Continue using code evaluator (no change)
```

---

## Solution Overview

### Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Agent Layer                          │
└─┬─────────────────────────────────┬─────────────────────────┘
  │                                 │
  ▼                                 ▼
┌─────────────────────────┐ ┌─────────────────────────────────┐
│    Basic Tools (80%)    │ │   Code Evaluator (20%)         │
│                         │ │                                 │
│ • get_note             │ │ • Multi-step workflows          │
│ • create_note          │ │ • Bulk operations               │
│ • update_note          │ │ • Custom functions              │
│ • list_notes           │ │ • Complex analysis              │
│ • search_notes         │ │ • Relationship mapping          │
│ • get_vault_info       │ │ • Performance-critical ops     │
│ • delete_note          │ │                                 │
└─────────────────────────┘ └─────────────────────────────────┘
  │                                 │
  └─────────────┬───────────────────┘
                ▼
    ┌─────────────────────────┐
    │   Shared FlintNote API  │
    │   • Same methods        │
    │   • Same types          │
    │   • Same error handling │
    └─────────────────────────┘
```

### Design Principles

1. **Clear Responsibility Division**: Basic tools for simple operations, code evaluator for complex workflows
2. **Shared Foundation**: Both systems use identical underlying APIs and types
3. **Easy Escalation**: Clear path from basic tools to code evaluator for complex needs
4. **Consistent Experience**: Same error handling and response patterns
5. **Performance Optimization**: Basic tools skip TypeScript compilation overhead

---

## Tool Specifications

### 1. get_note
**Purpose**: Retrieve a specific note by ID
```typescript
{
  description: "Get a specific note by ID",
  inputSchema: {
    id: string  // Note ID
  },
  returns: Note | null,
  errors: ["NOTE_NOT_FOUND", "INVALID_ID", "VAULT_ACCESS_ERROR"]
}
```

### 2. create_note
**Purpose**: Create a new note with optional hierarchy placement
```typescript
{
  description: "Create a new note",
  inputSchema: {
    title: string,
    content?: string,
    noteType?: string,
    parentId?: string,  // For hierarchy placement
    metadata?: Record<string, any>
  },
  returns: Note,
  errors: ["INVALID_TITLE", "PARENT_NOT_FOUND", "VAULT_ACCESS_ERROR"]
}
```

### 3. update_note
**Purpose**: Update existing note properties
```typescript
{
  description: "Update an existing note",
  inputSchema: {
    id: string,
    title?: string,
    content?: string,
    metadata?: Record<string, any>
  },
  returns: Note,
  errors: ["NOTE_NOT_FOUND", "INVALID_UPDATE", "VAULT_ACCESS_ERROR"]
}
```

### 4. list_notes
**Purpose**: List notes with basic filtering and pagination
```typescript
{
  description: "List notes with basic filtering",
  inputSchema: {
    limit?: number,      // Default: 50, Max: 200
    offset?: number,     // Default: 0
    noteType?: string,   // Filter by note type
    parentId?: string,   // Filter by parent (hierarchy)
    includeContent?: boolean  // Default: false for performance
  },
  returns: Note[] | NoteInfo[],
  errors: ["INVALID_LIMIT", "VAULT_ACCESS_ERROR"]
}
```

### 5. search_notes
**Purpose**: Full-text search across note titles and content
```typescript
{
  description: "Search notes by title and content",
  inputSchema: {
    query: string,       // Search query
    limit?: number,      // Default: 20, Max: 100
    noteType?: string    // Filter by note type
  },
  returns: Note[],
  errors: ["INVALID_QUERY", "VAULT_ACCESS_ERROR"]
}
```

### 6. get_vault_info
**Purpose**: Get current vault context and metadata
```typescript
{
  description: "Get current vault information",
  inputSchema: {},
  returns: Vault,
  errors: ["NO_ACTIVE_VAULT", "VAULT_ACCESS_ERROR"]
}
```

### 7. delete_note
**Purpose**: Delete a note with confirmation
```typescript
{
  description: "Delete a note",
  inputSchema: {
    id: string
  },
  returns: { success: boolean },
  errors: ["NOTE_NOT_FOUND", "DELETE_FAILED", "VAULT_ACCESS_ERROR"]
}
```

---

## Technical Requirements

### Implementation Architecture

**Tool Service Layer Extensions** (`src/main/tool-service.ts`)
- Add 7 new tool definitions alongside existing `evaluate_note_code`
- Use same Zod validation patterns as code evaluator tools
- Consistent error response formatting

**Direct API Integration**
- Bypass TypeScript compilation for basic tools
- Direct calls to FlintNote API methods from `enhanced-evaluate-note-code.ts`
- Reuse existing vault resolution and error handling logic

**Shared Type Definitions**
- Use identical `Note`, `Vault`, `NoteInfo` interfaces
- Consistent error response format with code evaluator
- Same success/failure response patterns

### Performance Characteristics

**Basic Tools Performance:**
- Response time: 1-10ms (vs 50-200ms for code evaluator)
- Memory usage: <1MB (vs 10-50MB for TypeScript compilation)
- No compilation overhead
- Direct API method invocation

**Error Handling:**
- Same error message format as code evaluator
- Consistent error codes and descriptions
- Detailed context for troubleshooting

### Security Considerations

**Same Security Model:**
- Vault-scoped access control
- No additional security surface
- Reuse existing authentication and authorization
- Same audit trail as code evaluator

---

## Implementation Plan

### Phase 1: Core CRUD Tools
**Deliverables:**
- `get_note`, `create_note`, `update_note`, `list_notes`
- Tool service integration
- Basic testing coverage

**Success Criteria:**
- All 4 tools functional with proper error handling
- Performance benchmarks meet targets (<10ms response)
- Integration tests passing

### Phase 2: Discovery and Management
**Deliverables:**
- `search_notes`, `get_vault_info`, `delete_note`
- Complete tool set documentation
- Comprehensive test coverage

**Success Criteria:**
- All 7 tools complete and tested
- Documentation updated
- Performance validation complete

### Phase 3: Integration and Optimization
**Deliverables:**
- Agent workflow optimization
- Performance tuning
- Usage analytics integration

**Success Criteria:**
- Agent productivity improvements measurable
- No performance regressions in code evaluator
- Both systems working harmoniously

---

## Success Metrics

### Performance Metrics
- **Basic tool response time**: <10ms (vs current 50-200ms)
- **Agent task completion time**: 50% reduction for basic operations
- **Memory usage**: <1MB per basic tool operation
- **Error rate**: <1% for valid operations

### Usage Metrics
- **Tool adoption**: 80% of simple operations use basic tools within 30 days
- **Code evaluator usage**: Complex operations continue using code evaluator
- **Agent productivity**: Measured by tasks completed per session

### Quality Metrics
- **Error consistency**: Same error patterns across both systems
- **Type safety**: No type-related runtime errors
- **API coverage**: 100% compatibility with existing FlintNote API patterns

---

## Risk Analysis

### Technical Risks

**Risk**: Inconsistency between basic tools and code evaluator
- **Mitigation**: Shared underlying API layer and types
- **Contingency**: Automated integration tests validate consistency

**Risk**: Performance regression in code evaluator
- **Mitigation**: Separate execution paths, no shared resources
- **Contingency**: Performance monitoring and rollback plan

### User Experience Risks

**Risk**: Confusion about when to use which system
- **Mitigation**: Clear documentation and usage guidelines
- **Contingency**: Agent training and examples

**Risk**: Feature gap between systems
- **Mitigation**: Basic tools cover 80% use case analysis
- **Contingency**: Easy escalation path to code evaluator

---

## Future Considerations

### Potential Extensions
- Additional basic tools based on usage analytics
- Tool composition for common multi-step patterns
- Performance optimization based on usage patterns

### Integration Opportunities
- Enhanced error suggestions pointing to appropriate tool
- Automatic tool selection based on operation complexity
- Workflow templates combining both systems

---

## Conclusion

The hybrid tool system addresses the core tension between simplicity and power in AI agent interactions. By providing structured tools for common operations while preserving the code evaluator for complex workflows, we optimize for both agent productivity and system capability.

This approach maintains all existing functionality while dramatically improving the experience for the majority of agent interactions, creating a more intuitive and efficient development environment.