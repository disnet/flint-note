# Custom Functions for Code Evaluator - Product Requirements Document

## Executive Summary

Extend the existing code evaluator system to enable AI agents to register, persist, and reuse custom functions across sessions. This addresses the common pattern where agents repeatedly perform similar multi-step operations (e.g., "create or update today's daily note") by allowing them to encapsulate these workflows as reusable, type-safe functions.

## Problem Statement

### Current Limitations

1. **Repetitive Code Patterns**: Agents frequently write similar multi-step API operations
2. **No Session Persistence**: Complex workflows must be recreated in each conversation
3. **Knowledge Transfer**: Agents cannot share or reuse successful patterns across sessions
4. **Performance Overhead**: Redundant code execution and compilation for common operations

### User Pain Points

- Agents waste time rewriting similar note management workflows
- Users must repeatedly explain common operations to agents
- No way to build up a library of proven agent workflows
- Advanced users have no visibility into agent automation patterns

## Solution Overview

### Core Concept

Enable agents to register custom TypeScript functions that:
- Are persisted per-vault in the existing settings structure
- Appear as first-class API methods in the system prompt
- Execute in the same secure WASM sandbox as regular code
- Can be managed through both agent code and UI interfaces

### Key Benefits

1. **Agent Efficiency**: Reusable functions reduce redundant code and improve response time
2. **User Experience**: Consistent, reliable automation for common workflows  
3. **Knowledge Building**: Accumulate a library of proven agent patterns over time
4. **Transparency**: Advanced users can inspect and modify agent automation

## Detailed Requirements

### 1. Function Registration API

#### Agent Tool Interface
Agents use a dedicated `register_custom_function` tool to create functions:

```typescript
// Tool definition
register_custom_function: {
  description: "Register a reusable custom function that can be called in future code evaluations",
  inputSchema: {
    name: string,           // Function name (valid TypeScript identifier)
    description: string,    // Human-readable description
    parameters: {           // Parameter definitions
      [paramName: string]: {
        type: string,       // TypeScript type (e.g., "string", "number", "Note[]")
        description?: string,
        optional?: boolean,
        default?: any
      }
    },
    returnType: string,     // Return type (e.g., "Note", "void", "Promise<Note[]>")
    code: string,          // Complete TypeScript function implementation
    tags?: string[]        // Optional organizational tags
  }
}
```

#### Usage Example
```typescript
// Agent registers a function using the dedicated tool
register_custom_function({
  name: 'createOrUpdateDailyNote',
  description: 'Creates or updates the daily note for the specified date',
  parameters: {
    date: { 
      type: 'string', 
      description: 'ISO date string', 
      optional: true 
    },
    content: { 
      type: 'string', 
      description: 'Additional content to append', 
      optional: true 
    }
  },
  returnType: 'Promise<Note>',
  tags: ['daily', 'notes'],
  code: `
    async function createOrUpdateDailyNote(date?: string, content?: string): Promise<Note> {
      const targetDate = date ? new Date(date) : new Date();
      const title = utils.formatDate(targetDate, 'YYYY-MM-DD');
      
      // Check if daily note exists
      const existing = await notes.search({ query: title, exact: true });
      
      if (existing.length > 0) {
        const note = await notes.get(existing[0].id);
        if (note && content) {
          await notes.update(note.id, {
            content: note.content + '\\n\\n' + content
          });
        }
        return note!;
      } else {
        return await notes.create({
          title,
          content: content || '# Daily Note\\n\\n',
          type_id: 'daily-note'
        });
      }
    }
  `
});

// Function is now available in future code evaluations under customFunctions namespace
const result = await evaluate_note_code({
  code: `
    async function main() {
      // Call the registered custom function via namespace
      const dailyNote = await customFunctions.createOrUpdateDailyNote('2024-01-15', 'Meeting notes');
      return dailyNote;
    }
  `
});
```

### 2. Data Storage Structure

#### Function Definition Schema
```typescript
interface CustomFunction {
  id: string;                    // Unique identifier
  name: string;                  // Function name (must be valid TypeScript identifier)
  description: string;           // Human-readable description
  parameters: Record<string, {   // Parameter definitions
    type: string;                // TypeScript type annotation
    description?: string;        // Parameter documentation
    optional?: boolean;          // Whether parameter is optional
    default?: any;               // Default value if optional
  }>;
  returnType: string;            // Return type annotation
  code: string;                  // Complete TypeScript function implementation
  tags: string[];                // Organizational tags
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: 'agent' | 'user'; // Source of creation
    usageCount: number;          // Times function has been called
    lastUsed?: Date;             // Last execution timestamp
    version: number;             // Function version for updates
  };
}
```

#### Storage Integration
- Store in existing vault settings structure: `vaultSettings.customFunctions`
- Follow existing JSON-based persistence patterns
- Implement automatic backup and versioning
- Support import/export for function sharing between vaults

### 3. Security & Validation

#### Function Definition Validation
- **Syntax Validation**: TypeScript compilation must succeed
- **Name Validation**: Function names must be valid identifiers, not conflict with built-in APIs
- **Code Analysis**: Static analysis to prevent obviously malicious patterns
- **Execution Limits**: Same timeout and resource limits as regular code evaluation

#### Runtime Security
- Execute custom functions in existing WASM sandbox
- Same API access controls as regular evaluator code
- No additional privileges or escape mechanisms
- Audit logging for custom function execution

### 4. System Prompt Integration

#### Dynamic Prompt Generation
The system prompt should include a dynamically generated section:

```
## Available Custom Functions

You have access to the following custom functions via the `customFunctions` namespace:

### customFunctions.createOrUpdateDailyNote(date?: string, content?: string): Promise<Note>
Creates or updates the daily note for the specified date.
Parameters:
- date (optional): ISO date string, defaults to today
- content (optional): Additional content to append

Usage: const note = await customFunctions.createOrUpdateDailyNote('2024-01-15', 'Meeting notes');

### customFunctions.[other registered functions...]
```

#### Type Definitions
Generate TypeScript definitions for the customFunctions namespace to enable IntelliSense and type checking:

```typescript
declare namespace customFunctions {
  function createOrUpdateDailyNote(date?: string, content?: string): Promise<Note>;
  // ... other registered functions
}
```

### 5. User Interface Requirements

#### Function Management View
Create a new settings section: **Settings > Advanced > Custom Functions**

**Function List View:**
- Table showing all registered functions with name, description, created date, usage count
- Search and filter by tags, creation source, usage frequency
- Sort by name, creation date, usage count, last used
- Quick actions: Edit, Test, Duplicate, Delete, Export

**Function Editor:**
- Code editor with TypeScript syntax highlighting and validation
- Parameter definition interface with type validation
- Test execution panel with parameter input and result display
- Validation feedback showing compilation errors and warnings
- Save/Cancel with confirmation for breaking changes

**Function Details:**
- Execution history and performance metrics
- Usage analytics (frequency, success rate, error patterns)
- Version history with diff view for changes
- Export to file or share with other vaults

#### Testing Interface
- Parameter input form with type-aware controls
- Real-time validation of parameter values
- Execution button with progress indication
- Result display with pretty-printed output
- Error display with stack traces and suggestions

## Implementation Architecture

### 1. Storage Layer (`src/server/core/custom-functions-store.ts`)
```typescript
class CustomFunctionsStore {
  async save(vaultId: string, functions: CustomFunction[]): Promise<void>
  async load(vaultId: string): Promise<CustomFunction[]>
  async backup(vaultId: string): Promise<string>
  async restore(vaultId: string, backup: string): Promise<void>
}
```

### 2. Validation Layer (`src/server/api/custom-functions-validator.ts`)
```typescript
class CustomFunctionValidator {
  async validateDefinition(func: CustomFunction): Promise<ValidationResult>
  async validateExecution(name: string, params: any): Promise<ValidationResult>
  private analyzeCodeSafety(code: string): SecurityAnalysis
}
```

### 3. Execution Layer (`src/server/api/custom-functions-executor.ts`)
```typescript
class CustomFunctionsExecutor {
  async createNamespaceObject(vaultId: string): Promise<any>
  async compileFunction(func: CustomFunction): Promise<CompiledFunction>
  private injectCustomFunctionsNamespace(vm: QuickJSContext, functions: CompiledFunction[]): void
}
```

### 4. API Integration (`src/server/api/custom-functions-api.ts`)
Add new tool alongside existing `evaluate_note_code`:
```typescript
// New tool definition in tool service
register_custom_function: {
  description: "Register a reusable custom function that can be called in future code evaluations",
  inputSchema: z.object({
    name: z.string(),
    description: z.string(), 
    parameters: z.record(z.object({
      type: z.string(),
      description: z.string().optional(),
      optional: z.boolean().optional(),
      default: z.any().optional()
    })),
    returnType: z.string(),
    code: z.string(),
    tags: z.array(z.string()).optional()
  })
}

// Management functions available within evaluate_note_code
customFunctions: {
  // Registered custom functions appear as methods on this namespace
  [functionName: string]: (...args: any[]) => Promise<any>,
  
  // Built-in management methods (prefixed to avoid conflicts)
  _list: () => Promise<CustomFunction[]>           // List registered functions  
  _remove: (name: string) => Promise<void>         // Remove a function
  _update: (name: string, changes: Partial<FunctionDefinition>) => Promise<CustomFunction>
}
```

### 5. UI Components (`src/renderer/src/components/custom-functions/`)
- `CustomFunctionsList.svelte` - Main management interface
- `CustomFunctionEditor.svelte` - Function creation/editing
- `CustomFunctionTester.svelte` - Testing interface
- `CustomFunctionDetails.svelte` - Function details and analytics

## Success Metrics

### Agent Experience Metrics
- **Function Reuse Rate**: % of agent sessions that use previously registered functions
- **Code Reduction**: Average lines of code saved per session through function reuse
- **Response Time Improvement**: Faster responses when using cached functions vs. writing new code

### User Adoption Metrics  
- **Function Creation Rate**: Number of custom functions registered per active vault
- **Function Usage Frequency**: Average calls per registered function per month
- **UI Engagement**: Time spent in custom functions management interface

### System Performance Metrics
- **Function Execution Time**: Performance of custom functions vs. equivalent inline code
- **Error Rates**: Compilation and runtime error rates for custom functions
- **Storage Efficiency**: Impact on vault settings file size and load times

## Risks and Mitigations

### Technical Risks
1. **Performance**: Large numbers of custom functions could slow system prompt generation
   - **Mitigation**: Lazy loading, function indexing, prompt caching
2. **Security**: Custom functions could introduce vulnerabilities
   - **Mitigation**: Same sandbox restrictions as regular code, static analysis
3. **Compatibility**: Function definitions could break with API changes
   - **Mitigation**: Version tracking, migration tooling, deprecation warnings

### User Experience Risks
1. **Complexity**: Advanced features might overwhelm basic users
   - **Mitigation**: Hide advanced features by default, progressive disclosure
2. **Function Conflicts**: Name collisions between user-created functions
   - **Mitigation**: Namespace validation, conflict detection, rename suggestions

## Future Enhancements

### Phase 2 Features
- **Function Sharing**: Import/export functions between vaults and users
- **Function Templates**: Common function patterns with guided creation
- **Performance Analytics**: Detailed execution metrics and optimization suggestions
- **Collaborative Functions**: Team-shared function libraries

### Integration Opportunities
- **AI-Powered Optimization**: Suggest function improvements based on usage patterns
- **Auto-Registration**: Detect repeated code patterns and suggest function creation
- **Function Marketplace**: Community sharing of useful function definitions

## Implementation Plan

### Phase 1: Core Infrastructure
1. Implement storage layer with vault-based persistence
2. Create validation and security framework
3. Extend code evaluator with custom function execution
4. Add basic API methods for function management

### Phase 2: Agent Integration  
1. Implement system prompt integration with dynamic function lists
2. Add type definition generation for custom functions
3. Create testing and debugging tools
4. Implement comprehensive error handling

### Phase 3: User Interface
1. Build function management UI components
2. Create function editor with validation
3. Implement testing interface
4. Add analytics and usage tracking

### Phase 4: Polish & Advanced Features
1. Add import/export capabilities
2. Implement function versioning and history
3. Create migration tools for API changes
4. Add performance monitoring and optimization

## Conclusion

Custom functions represent a natural evolution of the code evaluator system, transforming it from a powerful execution environment into a platform for building reusable agent automation. By maintaining the same security model while adding persistence and reusability, this feature will significantly enhance both agent capabilities and user control over automation workflows.

The proposed implementation leverages existing architectural patterns while introducing minimal complexity, ensuring the feature integrates seamlessly with current workflows while opening new possibilities for sophisticated agent interactions.