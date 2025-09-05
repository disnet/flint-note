# Code Evaluator Architecture Overview

## Executive Summary

The code evaluator system provides AI agents with a single TypeScript-enabled tool that replaces 32+ discrete FlintNote API methods. Built on a secure WebAssembly foundation using quickjs-emscripten, it offers compile-time type checking, comprehensive error feedback, and full access to the FlintNote API through a unified programming interface. The system has been extended with custom functions capabilities, allowing AI agents to register, persist, and reuse workflow automation functions across sessions.

**Current Status**: ✅ **PRODUCTION READY** - Complete implementation with TypeScript support, comprehensive API coverage, security hardening, and custom functions extension.

## System Architecture

### High-Level Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI Agent Layer                          │
│  • evaluate_note_code (TypeScript required)                     │
│  • register_custom_function, test_custom_function               │
│  • list_custom_functions, validate_custom_function              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    Tool Service Layer                           │
│  • Input validation with Zod schemas                            │
│  • Vault ID resolution                                          │
│  • Error formatting and response handling                       │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│              Enhanced Evaluate Note Code Layer                  │
│  • Request orchestration                                        │
│  • Vault context management                                     │
│  • Error aggregation and formatting                             │
│  • Custom functions integration                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│             Enhanced WASM Code Evaluator                        │
│  • TypeScript compilation phase                                 │
│  • Custom functions code prepending                             │
│  • JavaScript execution phase                                   │
│  • Result composition and error mapping                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
     ┌────────────────────┼────────────────────┬─────────────────┐
     │                    │                    │                 │
     ▼                    ▼                    ▼                 ▼
┌─────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐
│ TypeScript  │  │ Base WASM       │  │ FlintNote API   │  │ Custom      │
│ Compiler    │  │ Code Evaluator  │  │ Integration     │  │ Functions   │
│             │  │                 │  │                 │  │ System      │
│ • Type      │  │ • QuickJS WASM  │  │ • 39 API        │  │             │
│   checking  │  │   sandbox       │  │   methods       │  │ • Storage   │
│ • Error     │  │ • Promise       │  │ • Async         │  │ • Validation│
│   reporting │  │   handling      │  │   operations    │  │ • Execution │
│ • Code      │  │ • Security      │  │ • Type          │  │ • Namespace │
│   emission  │  │   controls      │  │   definitions   │  │   injection │
└─────────────┘  └─────────────────┘  └─────────────────┘  └─────────────┘
```

## Implementation Stack

### 1. Tool Service Layer (`src/main/tool-service.ts`)

**Purpose**: Exposes code evaluation and custom functions management tools to AI systems

**Key Features**:

- Primary tool: `evaluate_note_code` for TypeScript code execution
- Custom functions tools: 4 additional tools for function management
- TypeScript-only code acceptance (JavaScript rejected)
- Integration with note service for vault management
- Structured error response formatting

**Tool Interfaces**:

```typescript
// Primary code evaluation tool
evaluate_note_code: {
  description: "Execute TypeScript code in secure WebAssembly sandbox...",
  inputSchema: {
    code: string,        // TypeScript code required
    typesOnly?: boolean  // Debug mode for type-only checking
  }
}

// Custom functions management tools
register_custom_function: {
  description: "Register a reusable custom function...",
  inputSchema: {
    name: string,
    description: string,
    parameters: Record<string, ParameterDefinition>,
    returnType: string,
    code: string,
    tags?: string[]
  }
}

test_custom_function: {
  description: "Test a custom function with parameters...",
  inputSchema: {
    name: string,
    parameters?: Record<string, any>
  }
}

list_custom_functions: {
  description: "List all registered custom functions..."
}

validate_custom_function: {
  description: "Validate a custom function definition...",
  inputSchema: { /* same as register */ }
}
```

### 2. Enhanced Evaluate Note Code (`src/main/enhanced-evaluate-note-code.ts`)

**Purpose**: Orchestrates code evaluation requests and manages application context

**Key Responsibilities**:

- **Vault Resolution**: Automatically resolves current vault or accepts explicit vault ID
- **Error Handling**: Catches and formats errors at the application level
- **Result Transformation**: Converts internal evaluation results to tool response format
- **Diagnostic Formatting**: Processes TypeScript diagnostics for agent consumption

**Core Logic**:

```typescript
async execute({ code, typesOnly }) {
  // 1. Resolve vault context
  const vaultId = await this.resolveVaultId();

  // 2. Execute evaluation
  const result = await this.wasmEvaluator.evaluate({
    code, vaultId, typesOnly, timeout: 10000
  });

  // 3. Format response with compilation info
  return this.formatResponse(result);
}
```

### 3. Enhanced WASM Code Evaluator (`src/server/api/enhanced-wasm-code-evaluator.ts`)

**Purpose**: Coordinates TypeScript compilation with WebAssembly execution, including custom functions integration

**Execution Pipeline**:

1. **Custom Functions Preparation Phase**
   - Load registered custom functions for current vault
   - Generate `customFunctions` namespace code
   - Prepend namespace code to user's TypeScript code

2. **TypeScript Compilation Phase**
   - Strict type checking with comprehensive FlintNote API types
   - Custom functions type definitions included
   - Detailed error reporting with line/column precision
   - JavaScript code emission for successful compilation

3. **Types-Only Mode** (Optional)
   - Early return with compilation results
   - No code execution for debugging workflows

4. **JavaScript Execution Phase**
   - Delegates to base WASM evaluator with enhanced code
   - Executes compiled JavaScript with custom functions in secure sandbox

5. **Result Composition**
   - Combines compilation and execution results
   - Enhanced error context with suggestions
   - Custom function usage tracking and analytics

**Error Enhancement Logic**:

```typescript
private getExecutionErrorSuggestion(errorType: string, errorMessage: string): string {
  if (errorType === 'timeout') return 'Consider reducing complexity...';
  if (errorType === 'api' && errorMessage.includes('hash')) {
    return 'Content hash mismatch. Fetch latest version...';
  }
  // ... contextual suggestions based on error patterns
}
```

### 4. TypeScript Compiler (`src/server/api/typescript-compiler.ts`)

**Purpose**: Provides in-memory TypeScript compilation with FlintNote API types

**Architecture**:

- **Virtual File System**: In-memory TypeScript compiler host
- **Strict Type Checking**: Enforced strict mode with comprehensive checks
- **FlintNote API Types**: Complete type definitions for all 39 API methods
- **Enhanced Diagnostics**: Error messages with suggestions and context

**Compilation Process**:

```typescript
async compile(sourceCode: string): Promise<CompilationResult> {
  // 1. Create virtual file system with API types
  const compilerHost = this.createVirtualHost(sourceCode);

  // 2. Create TypeScript program for type checking
  const program = ts.createProgram([fileName], strictOptions, compilerHost);

  // 3. Collect semantic and syntactic diagnostics
  const diagnostics = this.gatherDiagnostics(program);

  // 4. Emit JavaScript if no errors
  const transpileResult = ts.transpileModule(sourceCode, options);

  return { success, diagnostics, compiledJavaScript, sourceMap };
}
```

### 5. Base WASM Code Evaluator (`src/server/api/wasm-code-evaluator.ts`)

**Purpose**: Secure JavaScript execution in WebAssembly sandbox

**Core Capabilities**:

- **QuickJS-WASM Integration**: Production-ready WebAssembly JavaScript runtime
- **Async Operation Management**: Promise proxy pattern for real async API calls
- **Security Controls**: API whitelisting, dangerous global blocking, timeout protection
- **Resource Management**: Memory limits, handle disposal, lifecycle management

**Promise Proxy Architecture**:

```typescript
class AsyncOperationRegistry {
  // Tracks all pending async operations
  // Enables concurrent Promise.all operations
  // Provides timeout and cleanup management
}

class PromiseProxyFactory {
  // Creates QuickJS promises that proxy to host promises
  // Maintains VM lifecycle until operations complete
  // Handles error propagation and result marshaling
}
```

### 6. Custom Functions System

**Purpose**: Enables AI agents to register, persist, and reuse TypeScript functions across sessions

**Core Components**:

**6.1 Custom Functions Store** (`src/server/core/custom-functions-store.ts`)
- Vault-scoped JSON persistence in `.flint-note/custom-functions.json`
- Full CRUD operations with automatic conflict detection
- Usage tracking and analytics with metadata
- Search and filtering by name, tags, description
- Import/export functionality for function sharing

**6.2 Validation Framework** (`src/server/api/custom-functions-validator.ts`)
- TypeScript syntax validation using existing compiler infrastructure
- Security analysis detecting dangerous patterns (eval, require, imports)
- Function name validation with reserved keyword detection
- Parameter and return type validation
- Performance analysis and code complexity warnings

**6.3 Execution Integration** (`src/server/api/custom-functions-executor.ts`)
- Code prepending approach for WASM sandbox integration
- Dynamic TypeScript namespace generation
- Custom function compilation and caching
- Usage tracking and performance monitoring

**Custom Functions Namespace**:

```typescript
// Generated automatically and prepended to user code
const customFunctions = {
  // User-registered functions appear here
  createDailyNote: async function(date?: string): Promise<Note> {
    // User's function implementation
  },

  formatMessage: function(message: string, prefix?: string): string {
    // Another user function
  }
};

// User's code can then call:
async function main() {
  const note = await customFunctions.createDailyNote('2025-01-15');
  return customFunctions.formatMessage(`Created note: ${note.title}`);
}
```

**AI Agent Integration**:
- Dynamic system prompt generation with custom function documentation
- Type definitions automatically generated for IntelliSense support
- 4 management tools integrated into AI service
- Enhanced error handling with custom function context

### 7. FlintNote API Integration

**Complete API Surface** (39 methods across 6 categories):

**Core Notes API** (8 methods):

- `notes.create()`, `notes.get()`, `notes.update()`, `notes.delete()`
- `notes.list()`, `notes.rename()`, `notes.move()`, `notes.search()`

**Note Types API** (5 methods):

- `noteTypes.create()`, `noteTypes.list()`, `noteTypes.get()`
- `noteTypes.update()`, `noteTypes.delete()`

**Vaults API** (6 methods):

- `vaults.getCurrent()`, `vaults.list()`, `vaults.create()`
- `vaults.switch()`, `vaults.update()`, `vaults.remove()`

**Links API** (5 methods):

- `links.getForNote()`, `links.getBacklinks()`, `links.findBroken()`
- `links.searchBy()`, `links.migrate()`

**Hierarchy API** (7 methods):

- `hierarchy.addSubnote()`, `hierarchy.removeSubnote()`, `hierarchy.reorder()`
- `hierarchy.getPath()`, `hierarchy.getDescendants()`, `hierarchy.getChildren()`, `hierarchy.getParents()`

**Relationships API** (4 methods):

- `relationships.get()`, `relationships.getRelated()`, `relationships.findPath()`, `relationships.getClusteringCoefficient()`

**Utilities** (4 functions):

- `utils.generateId()`, `utils.parseLinks()`, `utils.formatDate()`, `utils.sanitizeTitle()`

## Security Model

### WebAssembly Isolation Benefits

**Memory Safety**:

- Linear memory model prevents buffer overflows
- No direct host memory access
- Controlled memory allocation and deallocation

**Execution Isolation**:

- Sandboxed execution environment
- No access to host filesystem, network, or processes
- Capability-based security model

**API Access Control**:

- Explicit API method whitelisting
- Controlled injection of global objects
- Dangerous globals blocked (`fetch`, `require`, `process`, `global`)

### Security Controls Implementation

```typescript
private injectSecureAPI(vm: QuickJSContext, vaultId: string, allowedAPIs?: string[]) {
  // 1. Create API proxies with permission checking
  const secureAPI = this.createAPIProxy(allowedAPIs);

  // 2. Inject whitelisted API objects
  this.injectAPIObject(vm, 'notes', secureAPI.notes);
  this.injectAPIObject(vm, 'noteTypes', secureAPI.noteTypes);
  // ... other APIs

  // 3. Block dangerous globals
  vm.setProp(vm.global, 'fetch', vm.undefined);
  vm.setProp(vm.global, 'require', vm.undefined);
  vm.setProp(vm.global, 'process', vm.undefined);

  // 4. Set execution limits
  vm.runtime.setInterruptHandler(() => this.checkTimeout());
}
```

## Agent Experience

### TypeScript-First Development

**Strict Type Enforcement**:

```typescript
// ❌ JavaScript rejected with compilation errors
function main() {
  return notes.get('id');
}

// ✅ TypeScript required with proper types
async function main(): Promise<Note | null> {
  const note = await notes.get('some-id');
  return note;
}
```

**Comprehensive Error Feedback**:

```typescript
// Agent receives detailed error context:
{
  "success": false,
  "compilation": {
    "errors": [{
      "code": 2322,
      "message": "Type 'string | undefined' is not assignable to type 'string'",
      "line": 3,
      "column": 18,
      "source": "  return note.title;",
      "suggestion": "Add null check: return note?.title || '';"
    }]
  },
  "message": "TypeScript Error [2322]: ..."
}
```

### Types-Only Debug Mode

Agents can check types without execution:

```typescript
{
  "code": "async function main() { /* complex code */ }",
  "typesOnly": true  // Fast feedback without execution risk
}
```

### Complete API Access Pattern with Custom Functions

```typescript
async function main(): Promise<AnalysisResult> {
  // All 39 API methods available with full type safety
  const notes = await notes.list({ limit: 100 });
  const vault = await vaults.getCurrent();
  const noteTypes = await noteTypes.list();

  // Custom functions available via customFunctions namespace
  const dailyNote = await customFunctions.createOrUpdateDailyNote();

  // Complex multi-step operations in single execution
  for (const noteInfo of notes) {
    const note = await notes.get(noteInfo.id);
    if (note) {
      const links = await links.getForNote(note.id);
      const related = await relationships.getRelated({ note_id: note.id });

      // Use custom functions for reusable workflows
      const summary = await customFunctions.generateNoteSummary(note);
      const tags = customFunctions.extractTags(note.content);

      // Process note with full context
    }
  }

  return analysisResults;
}
```

### Custom Functions Management

**Registration Example**:
```typescript
// Agent registers a reusable function
await register_custom_function({
  name: 'extractTags',
  description: 'Extract hashtags from note content',
  parameters: {
    content: { type: 'string', description: 'Note content to analyze' }
  },
  returnType: 'string[]',
  code: `
    function extractTags(content: string): string[] {
      const tagRegex = /#[a-zA-Z0-9_-]+/g;
      return content.match(tagRegex) || [];
    }
  `,
  tags: ['utility', 'parsing']
});

// Function is now available in subsequent evaluations
const tags = customFunctions.extractTags('#work #important Some note content');
// Returns: ['#work', '#important']
```

**Testing and Validation**:
```typescript
// Test function before use
await test_custom_function({
  name: 'extractTags',
  parameters: { content: '#test This is test content #demo' }
});
// Returns: { success: true, result: ['#test', '#demo'] }

// List all available functions
const functions = await list_custom_functions();
// Returns array of CustomFunction objects with metadata
```

## Performance Characteristics

### Compilation Performance

- **TypeScript compilation**: ~50-200ms for typical agent code
- **Type checking overhead**: ~10-30ms additional per evaluation
- **Memory usage**: ~10-50MB for TypeScript compiler instances

### Execution Performance

- **WASM startup**: ~5-15ms for QuickJS context creation
- **API calls**: ~1-10ms per API method invocation
- **Memory efficiency**: ~2-20MB for typical execution contexts

### Scaling Characteristics

- **Concurrent operations**: Supports Promise.all with multiple simultaneous API calls
- **Memory management**: Automatic handle disposal and cleanup
- **Timeout protection**: Configurable execution limits (default 10 seconds)

## Testing Architecture

### Comprehensive Test Coverage

**Unit Tests**:

- `enhanced-wasm-code-evaluator.test.ts`: TypeScript compilation and execution
- `evaluate-note-code.test.ts`: Application layer integration
- `wasm-code-evaluator.test.ts`: Base WASM functionality
- `typescript-compiler.test.ts`: Type checking and error reporting

**Integration Tests**:

- Full API surface validation (39 methods)
- Async operation handling and Promise.all support
- Error handling and recovery scenarios
- Security control enforcement

**Test Infrastructure**:

- `TestApiSetup`: Isolated test environments with temporary databases
- Real SQLite instances for authentic API behavior
- Automatic cleanup and resource management

## Operational Benefits

### For AI Agents

1. **Unified Interface**: Single evaluation tool replaces 32+ discrete methods
2. **Custom Functions**: Persistent, reusable workflow automation across sessions
3. **Type Safety**: Compile-time error detection and prevention for all code
4. **Rich Feedback**: Detailed error context with actionable suggestions
5. **Flexible Programming**: Complex multi-step operations in single execution
6. **Learning Support**: Type system guides correct API usage patterns
7. **Workflow Reuse**: Build libraries of proven automation patterns
8. **Enhanced Productivity**: Avoid rewriting similar multi-step operations

### For System Architecture

1. **Reduced Complexity**: Single secure endpoint vs. multiple method handlers
2. **Better Security**: WASM isolation with custom functions sandboxing
3. **Improved Performance**: Reduced IPC overhead and cached function execution
4. **Enhanced Monitoring**: Single execution point for comprehensive observability
5. **Simplified Maintenance**: Unified codebase with consistent patterns
6. **Extensible Design**: Custom functions extend capabilities without core changes
7. **Persistent State**: Session-independent function persistence and reuse

### For Development Workflow

1. **Faster Debugging**: Precise error locations and comprehensive context
2. **Better Testing**: Type safety reduces need for extensive runtime validation
3. **API Evolution**: Type system makes API changes more manageable
4. **Documentation**: Type definitions serve as living API contracts
5. **Quality Assurance**: Compile-time validation ensures code correctness

## Implementation Differences from Original Plans

### Key Deviations from Proposal Documents

**1. TypeScript Integration Method**:

- **Planned**: Optional TypeScript support with JavaScript fallback
- **Implemented**: TypeScript-required, JavaScript explicitly rejected
- **Rationale**: Stricter approach provides better agent experience and error prevention

**2. Error Handling Approach**:

- **Planned**: Basic error messages with minimal context
- **Implemented**: Comprehensive error context with suggestions and diagnostic details
- **Rationale**: Better debugging experience for AI agents

**3. API Surface Coverage**:

- **Planned**: Gradual API expansion from 8 to 32+ methods
- **Implemented**: Complete 39-method API surface from launch
- **Rationale**: Full functionality available immediately without phased rollout

**4. Compilation Strategy**:

- **Planned**: Full TypeScript program analysis with virtual file system
- **Implemented**: Hybrid approach using transpileModule for JavaScript emission
- **Rationale**: Better performance while maintaining type safety

**5. Testing Approach**:

- **Planned**: Mock-based testing for initial development
- **Implemented**: Real API integration testing with temporary databases
- **Rationale**: Higher confidence in production behavior

## Conclusion

The implemented code evaluator architecture successfully provides AI agents with a powerful, type-safe programming interface that replaces the complexity of managing 32+ discrete tools. Built on secure WebAssembly foundations with comprehensive TypeScript support, it enables sophisticated agent workflows while maintaining production-grade security and performance characteristics.

**Enhanced with Custom Functions**: The system has been extended with comprehensive custom functions capabilities, enabling AI agents to register, persist, and reuse TypeScript workflow automation functions across sessions. This addresses the common pattern where agents repeatedly perform similar multi-step operations by allowing them to build libraries of reusable, type-safe functions.

**Current Status**: The backend implementation is 100% complete with:
- ✅ 98 tests passing with comprehensive coverage including end-to-end integration
- ✅ Secure storage layer with vault-scoped persistence
- ✅ Complete validation framework with TypeScript compilation and security analysis
- ✅ WASM execution integration using code prepending approach
- ✅ Full AI agent integration with 4 management tools
- ✅ Dynamic system prompt generation and type definitions
- ❌ User interface layer (pending Phase 3 implementation)

The system's layered architecture allows for clear separation of concerns, comprehensive testing, and maintainable evolution while providing agents with immediate feedback and learning support through the TypeScript type system, enhanced error reporting, and persistent workflow automation capabilities.
