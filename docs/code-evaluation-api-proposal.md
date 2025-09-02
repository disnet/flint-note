# WebAssembly Code Evaluation API Proposal: Alternative to Multiple Tool Calls

## Executive Summary

This document proposes an alternative approach to LLM-note interactions using WebAssembly (WASM) sandboxing. Instead of providing 29+ discrete tools, we propose a single code evaluation tool powered by quickjs-emscripten that allows agents to write JavaScript programs with controlled access to the note API.

**Key advantage**: WebAssembly's built-in security model provides genuine sandboxing, making this approach suitable for production environments unlike Node.js VM-based solutions.

## Current Architecture Analysis

### Existing Tool Structure

The current system provides 29+ specialized tools:

**Core Note Operations (13 tools):**
- `create_note`, `get_note`, `get_notes`, `update_note`, `delete_note`
- `rename_note`, `move_note`, `list_notes_by_type`, `bulk_delete_notes`
- `search_notes`, `search_notes_advanced`, `search_notes_sql`
- `get_note_info`

**Note Type Operations (5 tools):**
- `create_note_type`, `list_note_types`, `get_note_type_info`
- `update_note_type`, `delete_note_type`

**Vault Operations (6 tools):**
- `get_current_vault`, `list_vaults`, `create_vault`
- `switch_vault`, `update_vault`, `remove_vault`

**Link Operations (5 tools):**
- `get_note_links`, `get_backlinks`, `find_broken_links`
- `search_by_links`, `migrate_links`

### Limitations of Current Approach

1. **Cognitive Overhead**: Agents must remember and coordinate many discrete tools
2. **Limited Composability**: Complex operations require chaining multiple tool calls
3. **Context Inefficiency**: Each tool call consumes significant context tokens
4. **Inflexible Workflows**: Predefined tool boundaries limit creative problem-solving
5. **State Management**: No way to maintain intermediate state across tool calls

## Proposed WebAssembly Code Evaluation API

### Core Concept

Replace 29+ discrete tools with a single `evaluate_note_code` tool that:
- Accepts JavaScript code as input
- Executes in a WebAssembly sandbox using quickjs-emscripten
- Provides controlled access to the FlintNote API
- Offers improved security through WASM's built-in isolation
- Supports modern JavaScript features (async/await, ES2023)

### API Interface

```typescript
interface WASMCodeEvaluationTool {
  name: 'evaluate_note_code';
  description: 'Execute JavaScript/TypeScript in secure WebAssembly sandbox';
  inputSchema: {
    code: string;                    // JavaScript/TypeScript code to execute
    language?: 'javascript' | 'typescript';  // Language (default: javascript)
    timeout?: number;                // Maximum execution time (default: 5000ms)
    memoryLimit?: number;            // Memory limit in MB (default: 128MB)
    allowedAPIs?: string[];          // Whitelisted API methods
    context?: object;                // Optional initial context variables
    enableFileSystem?: boolean;      // Enable virtual filesystem (default: false)
    enableNetwork?: boolean;         // Enable network access (default: false)
  };
}
```

### WebAssembly Security Model

Unlike Node.js VM, WebAssembly provides improved security through:
- **Memory Safety**: No buffer overflows or memory corruption
- **Sandboxed Execution**: Isolation from host system
- **Control Flow Integrity**: Protected call stacks prevent code injection
- **Capability-Based Security**: Explicit permission model for system access

### QuickJS-WASM Execution Environment

The code executes in a secure WebAssembly runtime with controlled access to:

```javascript
// Core note primitives available in execution context:
const notes = {
  // Async iterable of notes with optional filtering
  list: async function*(filters = {}) {
    // Returns: AsyncIterable<{id, type, title, created, updated, metadata}>
    // Filters: { type?, metadata?, limit?, offset? }
    // Usage: for await (const note of notes.list({type: 'meeting'})) { ... }
  },
  
  // Get full note by ID
  get: async (id) => {
    // Returns: {id, type, title, content, created, updated, metadata} | null
  },
  
  // Create or update note (upsert based on presence of id)
  save: async (note) => {
    // Input: {id?, type, title, content, metadata?}
    // Returns: {id, created, updated}
    // Create: omit id, Update: include existing id
  },
  
  // Delete note by ID
  delete: async (id) => {
    // Returns: boolean (success)
  }
};

// Minimal utility functions
const utils = {
  generateId: () => string,              // Generate unique note ID
  parseLinks: (content) => string[],     // Extract [[wiki-style]] links from content
  formatDate: (date) => string,          // Format date for display
  sanitizeTitle: (title) => string,      // Remove invalid characters from titles
};
```

### Core Primitive Benefits

**Everything builds on 4 operations:**
- `notes.list()` - Async iteration with filtering  
- `notes.get(id)` - Retrieve full note
- `notes.save(note)` - Create/update (upsert)
- `notes.delete(id)` - Remove note

**Complex operations become agent code:**
```javascript
// Search becomes iteration + filtering
async function search(query) {
  const results = [];
  for await (const note of notes.list()) {
    const full = await notes.get(note.id);
    if (full.content.includes(query)) results.push(full);
  }
  return results;
}

// Rename becomes get + save
async function rename(id, newTitle) {
  const note = await notes.get(id);
  return await notes.save({...note, title: newTitle});
}

// Move becomes get + save with new type
async function move(id, newType) {
  const note = await notes.get(id);
  return await notes.save({...note, type: newType});
}

// Link analysis becomes iteration + parsing
async function findBrokenLinks() {
  const allNoteIds = new Set();
  const brokenLinks = [];
  
  // Collect all note IDs
  for await (const note of notes.list()) {
    allNoteIds.add(note.id);
  }
  
  // Find broken links
  for await (const note of notes.list()) {
    const full = await notes.get(note.id);
    const links = utils.parseLinks(full.content);
    for (const link of links) {
      if (!allNoteIds.has(link)) {
        brokenLinks.push({noteId: note.id, brokenLink: link});
      }
    }
  }
  
  return brokenLinks;
}
```

### Example Usage Scenarios

#### 1. Simple Note Creation
```javascript
// Create new note using primitive API
const noteId = utils.generateId();
const result = await notes.save({
  type: 'meeting',
  title: 'Weekly Standup',
  content: `# Weekly Standup - ${utils.formatDate(new Date())}

## Agenda
- Sprint progress
- Blockers
- Next steps`,
  metadata: { 
    attendees: ['Alice', 'Bob', 'Charlie'],
    date: new Date().toISOString() 
  }
});

return { success: true, noteId: result.id };
```

#### 2. Complex Search and Analysis  
```javascript
// Multi-step analysis using primitive iteration
const recentMeetings = [];
const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

// Use async iteration to filter recent meetings
for await (const note of notes.list({type: 'meeting'})) {
  if (new Date(note.created) > cutoffDate) {
    recentMeetings.push(note);
  }
}

// Analyze attendee patterns
const attendeeStats = {};
for (const meeting of recentMeetings) {
  const fullNote = await notes.get(meeting.id);
  const attendees = fullNote.metadata?.attendees || [];
  attendees.forEach(attendee => {
    attendeeStats[attendee] = (attendeeStats[attendee] || 0) + 1;
  });
}

return {
  totalMeetings: recentMeetings.length,
  topAttendees: Object.entries(attendeeStats)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5),
  averageAttendeesPerMeeting: recentMeetings.reduce((sum, m) => 
    sum + (m.metadata?.attendees?.length || 0), 0) / recentMeetings.length
};
```

#### 3. Batch Operations with Error Handling
```javascript
// Batch update using primitive save operation
const results = [];

for await (const note of notes.list({type: 'project'})) {
  try {
    const fullNote = await notes.get(note.id);
    if (fullNote && fullNote.content.includes('TODO:')) {
      const updatedContent = fullNote.content.replace(
        /TODO:/g, 
        `UPDATED ${utils.formatDate(new Date())}:`
      );
      
      // Update using save with existing id
      await notes.save({
        ...fullNote,
        content: updatedContent
      });
      
      results.push({ id: note.id, success: true });
    }
  } catch (error) {
    results.push({ id: note.id, success: false, error: error.message });
  }
}

return { 
  processed: results.length, 
  successful: results.filter(r => r.success).length,
  details: results 
};
```

## WebAssembly Security Architecture

### Security Comparison: WASM vs Node.js VM

**WebAssembly Security**: Unlike Node.js VM, WASM provides better isolation:

- **Built-in Sandboxing**: WASM was designed for secure code execution
- **Memory Safety**: Linear memory model prevents buffer overflows and memory corruption
- **Limited Host Access**: Cannot access host system without explicit capabilities
- **Control Flow Integrity**: Protected call stacks prevent code injection attacks
- **Capability-Based Security**: Fine-grained permission model for system resources

**Node.js VM Security**: Has known limitations with documented escape vectors:
- Constructor chain exploits (`this.constructor.constructor`)
- Process access through exception handling
- Global object pollution attacks
- Official documentation warns: "not a security mechanism"

### QuickJS-Emscripten Implementation

```typescript
import { getQuickJS, shouldInterruptAfterDeadline } from 'quickjs-emscripten'

class WASMCodeEvaluator {
  private QuickJS: any;
  private noteApi: FlintNoteApi;
  
  async initialize() {
    this.QuickJS = await getQuickJS();
  }
  
  async evaluate(
    code: string, 
    options: {
      timeout?: number;        // Execution timeout (ms)
      memoryLimit?: number;    // Memory limit (bytes)  
      allowedAPIs?: string[];  // Whitelisted API methods
      enableNetwork?: boolean; // Enable fetch API
      context?: object;        // Custom context variables
    } = {}
  ) {
    if (!this.QuickJS) {
      await this.initialize();
    }
    
    // Create isolated JavaScript context
    const vm = this.QuickJS.newContext();
    
    try {
      // Inject secure note API proxy
      const safeAPI = this.createSecureAPIProxy(options.allowedAPIs);
      this.injectAPI(vm, safeAPI, options.context);
      
      // Configure execution limits
      const evalOptions = {
        // Memory limit (default 128MB)
        memoryLimitBytes: options.memoryLimit || 128 * 1024 * 1024,
        
        // Timeout interrupt (default 5 seconds)
        shouldInterrupt: options.timeout 
          ? shouldInterruptAfterDeadline(Date.now() + options.timeout)
          : shouldInterruptAfterDeadline(Date.now() + 5000)
      };
      
      // Execute JavaScript code in sandbox
      const result = vm.evalCode(`
        (async function() {
          ${code}
        })()
      `, evalOptions);
      
      // Handle successful execution
      if (result.error) {
        const error = vm.dump(result.error);
        result.error.dispose();
        throw new Error(`Execution error: ${error}`);
      }
      
      // Process async results
      if (result.value && vm.typeof(result.value) === 'object') {
        const promiseHandle = result.value;
        const promiseResult = await vm.resolvePromise(promiseHandle);
        promiseHandle.dispose();
        
        if (promiseResult.error) {
          const error = vm.dump(promiseResult.error);
          promiseResult.error.dispose();
          throw new Error(`Promise error: ${error}`);
        }
        
        const finalResult = vm.dump(promiseResult.value);
        promiseResult.value.dispose();
        return finalResult;
      }
      
      // Process sync results
      const finalResult = vm.dump(result.value);
      result.value.dispose();
      return finalResult;
      
    } catch (error) {
      // WASM isolation prevents security exploits even on errors
      throw new Error(`Code execution failed: ${error.message}`);
    } finally {
      // Always dispose context to prevent memory leaks
      vm.dispose();
    }
  }
  
  private injectAPI(vm: any, safeAPI: any, customContext?: object) {
    // Inject note API with proper error handling
    const notesHandle = vm.newObject();
    for (const [key, fn] of Object.entries(safeAPI.notes)) {
      notesHandle.setProp(key, vm.newFunction(key, fn));
    }
    vm.setProp(vm.global, 'notes', notesHandle);
    notesHandle.dispose();
    
    // Inject note types API
    const noteTypesHandle = vm.newObject();
    for (const [key, fn] of Object.entries(safeAPI.noteTypes)) {
      noteTypesHandle.setProp(key, vm.newFunction(key, fn));
    }
    vm.setProp(vm.global, 'noteTypes', noteTypesHandle);
    noteTypesHandle.dispose();
    
    // Inject vaults API
    const vaultsHandle = vm.newObject();
    for (const [key, fn] of Object.entries(safeAPI.vaults)) {
      vaultsHandle.setProp(key, vm.newFunction(key, fn));
    }
    vm.setProp(vm.global, 'vaults', vaultsHandle);
    vaultsHandle.dispose();
    
    // Inject utilities
    const utilsHandle = vm.newObject();
    for (const [key, fn] of Object.entries(safeAPI.utils)) {
      utilsHandle.setProp(key, vm.newFunction(key, fn));
    }
    vm.setProp(vm.global, 'utils', utilsHandle);
    utilsHandle.dispose();
    
    // Inject custom context variables
    if (customContext) {
      for (const [key, value] of Object.entries(customContext)) {
        const valueHandle = vm.newString(JSON.stringify(value));
        vm.setProp(vm.global, key, valueHandle);
        valueHandle.dispose();
      }
    }
    
    // Disable dangerous globals by default
    vm.setProp(vm.global, 'fetch', vm.undefined);
    vm.setProp(vm.global, 'require', vm.undefined);
    vm.setProp(vm.global, 'process', vm.undefined);
  }
  
  private createSecureAPIProxy(allowedAPIs?: string[]) {
    // Create permission-controlled API proxy
    const isAllowed = (apiPath: string) => 
      !allowedAPIs || allowedAPIs.includes(apiPath);
    
    return {
      notes: {
        list: isAllowed('notes.list') ? this.createAsyncIterator(this.noteApi.listNotes.bind(this.noteApi)) : null,
        get: isAllowed('notes.get') ? this.wrapAsync(this.noteApi.getNote.bind(this.noteApi)) : null,
        save: isAllowed('notes.save') ? this.wrapAsync(this.noteApi.saveNote.bind(this.noteApi)) : null,
        delete: isAllowed('notes.delete') ? this.wrapAsync(this.noteApi.deleteNote.bind(this.noteApi)) : null,
      },
      utils: {
        formatDate: (date: string) => new Date(date).toISOString(),
        generateId: () => Math.random().toString(36).substr(2, 9),
        sanitizeTitle: (title: string) => title.replace(/[^a-zA-Z0-9\s-]/g, '').trim(),
        parseLinks: (content: string) => content.match(/\[\[([^\]]+)\]\]/g)?.map(link => link.slice(2, -2)) || [],
      }
    };
  }
  
  private wrapAsync(fn: Function) {
    return async (...args: any[]) => {
      try {
        return await fn(...args);
      } catch (error) {
        throw new Error(`API Error: ${error.message}`);
      }
    };
  }
  
  private createAsyncIterator(fn: Function) {
    return async function*(filters = {}) {
      try {
        const results = await fn(filters);
        for (const result of results) {
          yield result;
        }
      } catch (error) {
        throw new Error(`Iterator Error: ${error.message}`);
      }
    };
  }
}
```

### Security Levels with quickjs-emscripten

#### Level 1: Full Trust (Internal Use)
```typescript
const evaluator = new WASMCodeEvaluator(noteApi);
await evaluator.initialize();

const result = await evaluator.evaluate(code, {
  // Full API access for internal operations
  timeout: 30000,           // 30 seconds
  memoryLimit: 256 * 1024 * 1024, // 256MB
});
```

#### Level 2: Limited Trust (Restricted APIs)  
```typescript
const result = await evaluator.evaluate(code, {
  allowedAPIs: [
    'notes.get', 'notes.list', 'notes.save'
  ],
  timeout: 10000,           // 10 seconds
  memoryLimit: 64 * 1024 * 1024,  // 64MB
  enableNetwork: false,
});
```

#### Level 3: Zero Trust (Maximum Security)
```typescript
const result = await evaluator.evaluate(code, {
  allowedAPIs: ['notes.get', 'notes.list'], // Read-only
  timeout: 2000,            // 2 seconds  
  memoryLimit: 32 * 1024 * 1024,  // 32MB
  enableNetwork: false,
});
```

### quickjs-emscripten Security Advantages

1. **Production Ready**: Mature WASM sandboxing suitable for production environments
2. **Fine-grained Control**: Explicit memory management and execution timeouts
3. **Isolation**: No host functionality exposed by default
4. **ES2023 Support**: Modern JavaScript features with full async/await support
5. **Memory Safety**: WASM prevents buffer overflows and memory corruption
6. **Cross-Platform**: Works in browsers, Node.js, Deno, Bun, and Cloudflare Workers
7. **Explicit Resource Management**: Manual disposal of handles prevents memory leaks
8. **Interrupt Support**: Can halt long-running scripts with precise timing control

### Security Best Practices

1. **API Whitelisting**: Start with minimal API surface and expand as needed
2. **Resource Limits**: Set conservative memory and timeout limits
3. **Network Isolation**: Disable network access unless explicitly required
4. **Comprehensive Logging**: Log all execution attempts and results
5. **Static Analysis**: Scan code for suspicious patterns before execution
6. **Monitoring**: Real-time detection of unusual execution patterns

## WebAssembly Implementation Roadmap

### Phase 1: quickjs-emscripten MVP (Weeks 1-2)
- [ ] Integrate `quickjs-emscripten` package
- [ ] Implement WASMCodeEvaluator class with proper handle disposal
- [ ] Create secure note API proxy with permission controls
- [ ] Add memory limits and timeout interrupt handling
- [ ] Build comprehensive test suite with security validation

### Phase 2: Security Hardening (Weeks 3-4)
- [ ] Implement API whitelisting system
- [ ] Add static code analysis for security scanning
- [ ] Create security level configurations (Full/Limited/Zero trust)
- [ ] Build execution monitoring and alerting
- [ ] Add comprehensive audit logging

### Phase 3: Production Features (Weeks 5-6)
- [ ] Add TypeScript execution support
- [ ] Implement execution result caching
- [ ] Create performance monitoring dashboard
- [ ] Add debugging and error reporting tools
- [ ] Build admin controls and policy management

### Phase 4: Advanced Capabilities (Weeks 7-8)
- [ ] Virtual filesystem support for complex operations
- [ ] Multi-tenant isolation for different users/contexts
- [ ] Code optimization and execution analytics
- [ ] Integration with existing tool infrastructure
- [ ] Comprehensive documentation and examples

### Phase 5: AI/LLM Integration (Weeks 9-10)
- [ ] Create specialized MCP server integration
- [ ] Build agent-friendly API documentation
- [ ] Add execution context persistence
- [ ] Implement smart error recovery
- [ ] Performance optimization for LLM workloads

## WebAssembly Benefits Analysis

### Agent/LLM Benefits
1. **Reduced Cognitive Load**: Single tool vs. 29+ specialized tools
2. **Better Composability**: Write sophisticated workflows in JavaScript
3. **Stateful Operations**: Maintain complex state across operations
4. **Flexible Problem Solving**: No predefined boundaries limit approaches
5. **Context Efficiency**: One comprehensive tool call vs. multiple sequential calls
6. **Language Familiarity**: Agents already understand JavaScript syntax
7. **Async/Await Support**: Modern JavaScript patterns for complex operations

### Security Benefits
1. **Production Ready**: WASM sandboxing suitable for production environments
2. **Better Isolation**: Improved security vs. VM module limitations
3. **Memory Safety**: No buffer overflows or memory corruption attacks
4. **Capability-Based Security**: Fine-grained control over system access
5. **Cross-Platform Consistency**: Same security model everywhere
6. **Performance**: Near-native execution speed with safety

### Development Benefits
1. **Simplified Architecture**: One secure tool vs. 29+ tool endpoints
2. **Reduced Maintenance**: Single WASM evaluator vs. multiple tool handlers
3. **Flexible API Evolution**: Add capabilities without new tool definitions
4. **Better Testing**: Test actual business logic, not tool orchestration
5. **TypeScript Support**: Strong typing for complex operations
6. **Comprehensive Logging**: Single execution context to monitor

### Operational Benefits
1. **Resource Efficiency**: WASM runtime manages memory and CPU efficiently
2. **Scalability**: Single evaluation endpoint vs. managing many tools
3. **Debugging**: Centralized execution with comprehensive error reporting
4. **Monitoring**: Single point of observability for all operations
5. **Caching**: Execution results can be cached and reused
6. **Performance**: Reduced network overhead and faster execution

## WASM Risks and Mitigations

### Risk: WASM Runtime Vulnerabilities
**Mitigation**: WASM's built-in security model significantly reduces attack surface compared to VM. Use established QuickJS-WASM packages with active maintenance.

### Risk: API Surface Exposure  
**Mitigation**: Implement strict API whitelisting, start with minimal permissions and expand gradually.

### Risk: Resource Exhaustion
**Mitigation**: WASM runtime enforces memory limits. Add timeout controls and execution monitoring.

### Risk: Complex Debugging
**Mitigation**: Comprehensive execution logging, stack trace preservation, and debugging tools built into QuickJS.

### Risk: Performance Overhead
**Mitigation**: WASM provides near-native performance. Profile and optimize hot paths, implement result caching.

### Risk: Ecosystem Maturity
**Mitigation**: QuickJS-WASM is production-ready with active community. Fallback to tool-based approach if needed.

## Alternative Approaches Considered

### 1. Node.js VM Module (Rejected)
Execute JavaScript using Node's vm.runInNewContext
- **Pros**: Native Node.js feature, familiar JavaScript execution
- **Cons**: ❌ **Fundamentally insecure**, well-known escape vectors, unsuitable for production

### 2. Docker Container Isolation
Execute code in isolated containers
- **Pros**: Strong isolation, full system security
- **Cons**: High overhead, complex setup, slow startup times

### 3. Domain-Specific Language (DSL)
Create custom query language for note operations
- **Pros**: Highly secure, optimized for note operations
- **Cons**: Learning curve, limited expressiveness, maintenance overhead

### 4. Template-Based Operations
Pre-built operation templates with parameters
- **Pros**: Very safe, easy to understand
- **Cons**: Inflexible, doesn't solve composability issues

### 5. GraphQL Interface
Expose note operations through GraphQL
- **Pros**: Powerful querying, strongly typed
- **Cons**: Complex setup, not programmable, still requires multiple calls

### 6. **WebAssembly + quickjs-emscripten (Selected)**
Execute JavaScript in WASM sandbox with explicit resource management
- **Pros**: Mature security model, production-ready, ES2023 support, cross-platform, fine-grained control
- **Cons**: Requires explicit handle disposal, WASM runtime setup

## Conclusion

The WebAssembly-based code evaluation API offers a practical alternative to the current multi-tool architecture. It addresses fundamental security limitations of JavaScript execution environments while providing agents with more flexible interaction patterns.

### Key Advantages

1. **Improved Security**: Better JavaScript execution environment suitable for production
2. **Performance**: Near-native speed with built-in safety
3. **Simplicity**: Single tool replaces 29+ specialized endpoints
4. **Flexibility**: Transforms agents from tool orchestrators into programmers
5. **Maturity**: Built on established WASM ecosystem

### Capabilities Enabled

This approach provides new agent capabilities:
- Complex multi-step operations in single tool calls
- Sophisticated data analysis and reporting
- Custom workflows tailored to specific use cases  
- Stateful operations maintaining context across steps
- Flexible problem-solving not constrained by tool boundaries

### Implementation Strategy

1. **Week 1-2**: Build WASM MVP with QuickJS integration
2. **Week 3-4**: Implement security hardening and API controls
3. **Week 5-6**: Add production features and monitoring
4. **Week 7-8**: Build advanced capabilities and optimization
5. **Week 9-10**: Perfect AI/LLM integration and deployment

## Next Steps

1. **Technical Validation**: Prototype quickjs-emscripten integration with basic note operations
2. **Security Implementation**: Design and implement comprehensive security controls
3. **Agent Testing**: Validate approach with real LLM workflows and use cases
4. **Performance Optimization**: Ensure execution speed meets production requirements
5. **Production Deployment**: Roll out with comprehensive monitoring and safeguards

## Expected Impact

This WebAssembly approach offers several improvements to the existing system:

- **Reduced Complexity**: Single tool interface vs. multiple discrete endpoints
- **Enhanced Capabilities**: Complex operations become more straightforward
- **Better Security**: WASM provides improved isolation over VM-based solutions
- **Unified Architecture**: Consistent interaction model across all operations
- **Programming Model**: Agents can write custom logic rather than orchestrate tools

The combination of WebAssembly security, quickjs-emscripten maturity, and JavaScript familiarity provides a practical path to enhanced agent capabilities while maintaining security requirements.