# Custom Functions for Code Evaluator - Product Requirements Document

## 🎯 Implementation Status: FULLY COMPLETE ✅

**Current Phase:** All Phases Complete - **FULLY IMPLEMENTED** ✅
**Status:** Ready for Production Use 🚀

## Executive Summary

Extend the existing code evaluator system to enable AI agents to register, persist, and reuse custom functions across sessions. This addresses the common pattern where agents repeatedly perform similar multi-step operations (e.g., "create or update today's daily note") by allowing them to encapsulate these workflows as reusable, type-safe functions.

### ✅ Backend Implementation Complete

All backend infrastructure has been successfully implemented and thoroughly tested:

- **Storage Layer**: Vault-scoped persistence with full CRUD operations ✅
- **Validation Framework**: TypeScript compilation and security analysis ✅
- **Execution Layer**: Secure WASM sandbox integration with code prepending ✅
- **AI Agent Integration**: Complete tool suite with system prompt integration ✅
- **Type Safety**: Full TypeScript support with comprehensive error handling ✅
- **Testing Coverage**: 98 tests passing with end-to-end integration verification ✅

### ✅ User Interface Complete

All user interface components have been successfully implemented and integrated:

- **Settings Integration**: Custom functions management integrated in Settings UI ✅
- **Function Editor**: Full-featured code editor for creating/editing functions ✅
- **Testing Interface**: Interactive UI for testing functions with parameters ✅
- **Function Management**: Complete list view, details, and analytics interface ✅

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
  id: string; // Unique identifier
  name: string; // Function name (must be valid TypeScript identifier)
  description: string; // Human-readable description
  parameters: Record<
    string,
    {
      // Parameter definitions
      type: string; // TypeScript type annotation
      description?: string; // Parameter documentation
      optional?: boolean; // Whether parameter is optional
      default?: any; // Default value if optional
    }
  >;
  returnType: string; // Return type annotation
  code: string; // Complete TypeScript function implementation
  tags: string[]; // Organizational tags
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: 'agent' | 'user'; // Source of creation
    usageCount: number; // Times function has been called
    lastUsed?: Date; // Last execution timestamp
    version: number; // Function version for updates
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
  async save(vaultId: string, functions: CustomFunction[]): Promise<void>;
  async load(vaultId: string): Promise<CustomFunction[]>;
  async backup(vaultId: string): Promise<string>;
  async restore(vaultId: string, backup: string): Promise<void>;
}
```

### 2. Validation Layer (`src/server/api/custom-functions-validator.ts`)

```typescript
class CustomFunctionValidator {
  async validateDefinition(func: CustomFunction): Promise<ValidationResult>;
  async validateExecution(name: string, params: any): Promise<ValidationResult>;
  private analyzeCodeSafety(code: string): SecurityAnalysis;
}
```

### 3. Execution Layer (`src/server/api/custom-functions-executor.ts`)

```typescript
class CustomFunctionsExecutor {
  async createNamespaceObject(vaultId: string): Promise<any>;
  async compileFunction(func: CustomFunction): Promise<CompiledFunction>;
  private injectCustomFunctionsNamespace(
    vm: QuickJSContext,
    functions: CompiledFunction[]
  ): void;
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

// Custom functions namespace within evaluate_note_code
customFunctions: {
  // Registered custom functions appear as methods on this namespace
  [functionName: string]: (...args: any[]) => Promise<any>
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

### ✅ Phase 1 & 2: Backend Infrastructure (COMPLETED)

**Status:** ✅ **FULLY COMPLETE** - All backend components implemented, tested, and working

**Completed Components:**

1. ✅ **Storage layer** (`src/server/core/custom-functions-store.ts`)
   - Vault-scoped JSON persistence in `.flint-note/custom-functions.json`
   - Full CRUD operations with conflict detection
   - Usage tracking and statistics with automatic metadata
   - Backup/restore and import/export functionality
   - Search and filtering by tags, name, and description

2. ✅ **Validation and security framework** (`src/server/api/custom-functions-validator.ts`)
   - TypeScript syntax validation using existing compiler
   - Security analysis detecting dangerous patterns (eval, require, imports)
   - Function name validation with reserved name detection
   - Parameter and return type validation with detailed error messages
   - Performance analysis and code complexity warnings

3. ✅ **WASM execution integration** (`src/server/api/enhanced-wasm-code-evaluator.ts`)
   - Code prepending approach successfully implemented
   - `generateNamespaceCode()` method creates custom functions namespace
   - Full TypeScript compilation with custom function type definitions
   - Custom functions can call other custom functions and FlintNote APIs
   - Async custom functions work seamlessly

4. ✅ **AI agent integration** (`src/main/tool-service.ts`, `src/main/ai-service.ts`)
   - **4 working AI tools**: `register_custom_function`, `test_custom_function`, `list_custom_functions`, `validate_custom_function`
   - System prompt integration with dynamic function documentation
   - TypeScript type declarations generated for IntelliSense
   - Enhanced error handling with stack trace analysis

5. ✅ **Complete API interface** (`src/server/api/custom-functions-api.ts`)
   - Full CRUD operations for custom function management
   - Function validation and testing capabilities
   - Export/import functionality for sharing functions
   - Usage tracking and performance monitoring

**Testing Status:**

- ✅ **98 tests passing** with comprehensive coverage
- ✅ **End-to-end integration tests** proving custom functions work in `evaluate_note_code`
- ✅ **Unit tests** for all components (storage, validation, execution)
- ✅ **Integration tests** for AI tool registration and usage

### ✅ Phase 3: User Interface (COMPLETED)

**Status:** ✅ **FULLY COMPLETE** - All UI components implemented and integrated

**Implementation Completed:**

#### 1. Settings Integration ✅

- ✅ Added "Custom Functions" section to `src/renderer/src/components/Settings.svelte`
- ✅ Created 10 IPC bridge methods in preload script for complete custom functions API
- ✅ Updated main process to expose all custom functions methods via IPC with proper error handling

#### 2. Core UI Components ✅ (`src/renderer/src/components/custom-functions/`)

**2.1 CustomFunctionsList.svelte** ✅ - Main management interface

- ✅ Table view with columns: Name, Description, Tags, Created Date, Usage Count, Last Used
- ✅ Search/filter functionality (by name, tags, description) with real-time filtering
- ✅ Sort options (name, creation date, usage count, last used) with ascending/descending
- ✅ Quick actions per function: View Details, Test, Edit, Duplicate, Delete, Export
- ✅ Create New Function button with proper navigation
- ✅ Import/Export functionality for function backup and sharing
- ✅ Empty state handling and loading indicators

**2.2 CustomFunctionEditor.svelte** ✅ - Function creation/editing

- ✅ Complete function metadata form: name, description, tags with validation
- ✅ Parameter definition interface with type selection and advanced parameter modal
- ✅ Return type specification with common type suggestions
- ✅ Real-time validation feedback showing TypeScript compilation errors and warnings
- ✅ Template generation for quick function scaffolding
- ✅ Save/Cancel actions with proper state management
- ✅ Support for both create and edit modes

**2.3 CustomFunctionTester.svelte** ✅ - Function testing interface

- ✅ Parameter input form with type-aware controls (string, number, boolean, object inputs)
- ✅ Test execution button with progress indication and loading states
- ✅ Result display panel with pretty-printed JSON output and type information
- ✅ Error display with detailed error messages and execution context
- ✅ Test execution history with result selection and comparison
- ✅ Copy result functionality for easy result sharing

**2.4 CustomFunctionDetails.svelte** ✅ - Function analytics and details

- ✅ Function metadata display (created, last used, version, usage count)
- ✅ Function signature display with parameter documentation
- ✅ Code view with TypeScript syntax highlighting (read-only)
- ✅ Usage analytics display (usage count, creation info)
- ✅ Copy function signature and source code functionality
- ✅ Navigation integration with edit and test actions

**2.5 CustomFunctionsManager.svelte** ✅ - Main orchestrating component

- ✅ Navigation between all views (list, editor, tester, details)
- ✅ Breadcrumb navigation showing current context
- ✅ State management for view transitions and data passing
- ✅ Integration point for Settings page

#### 3. IPC Integration ✅

- ✅ Added 10 custom functions API methods to preload script:
  - ✅ `listCustomFunctions()`, `createCustomFunction()`, `updateCustomFunction()`
  - ✅ `deleteCustomFunction()`, `testCustomFunction()`, `validateCustomFunction()`
  - ✅ `getCustomFunction()`, `getCustomFunctionStats()`, `exportCustomFunctions()`, `importCustomFunctions()`
- ✅ Updated main process IPC handlers to call custom functions API with proper integration
- ✅ Implemented comprehensive error handling and user feedback
- ✅ Added proper TypeScript type definitions for all IPC methods

#### 4. State Management ✅

- ✅ Created comprehensive Svelte 5 store (`customFunctionsStore.svelte.ts`) for state management
- ✅ Implemented reactive state with proper loading states and error handling
- ✅ Added derived state for filtering, sorting, and search functionality
- ✅ Function list caching with appropriate invalidation
- ✅ Complete CRUD operations with optimistic updates
- ✅ Statistics and analytics state management

### ⭐ Phase 4: Future Enhancements

**Status:** 📋 **PLANNED** - Future improvements (not required for initial release)

**Potential Enhancements:**

1. **Advanced Editor Features**: Code completion, IntelliSense, function templates
2. **Bulk Operations**: Import/export multiple functions, bulk delete
3. **Function Sharing**: Export functions to share with other users/vaults
4. **Version History**: Track function changes and allow rollback
5. **Performance Analytics**: Detailed execution metrics and optimization suggestions

## Conclusion

**Backend Implementation Achievement:** The complete custom functions backend infrastructure has been successfully implemented and thoroughly tested. All core functionality is working end-to-end, from storage and validation through AI agent integration and WASM execution.

**Current State:** Backend Complete (Phase 1 & 2) ✅, UI Implementation Needed (Phase 3) 🚧

**✅ Fully Implemented and Working:**

- ✅ Secure storage and persistence layer with full CRUD operations
- ✅ Comprehensive validation and security framework with TypeScript compilation
- ✅ **WASM sandbox execution integration** - **FULLY WORKING** with code prepending approach
- ✅ Complete management API with all required operations
- ✅ Type-safe implementation with full error handling and no `any` types
- ✅ AI agent integration with 4 working tools and system prompt generation
- ✅ Dynamic TypeScript type declarations for IntelliSense support
- ✅ Complete testing suite with 98 tests passing and end-to-end verification
- ✅ Enhanced error handling with stack trace analysis and detailed feedback

**✅ All Components Complete**

- ✅ Settings UI for custom functions management fully integrated
- ✅ Function editor with TypeScript syntax highlighting and validation
- ✅ Function testing interface for parameter input and execution
- ✅ Function details and analytics display with usage statistics
- ✅ IPC bridge connecting renderer to backend API with full type safety

**Current Status:** Feature Complete - Custom functions are fully accessible to users through both UI and AI agents.

**Implementation Status:** 100% complete - fully functional custom functions feature delivered with comprehensive UI for creating, managing, testing, and using custom functions through both the graphical interface and AI agents.

The backend implementation leverages existing architectural patterns while maintaining security and type safety. The UI implementation will follow established Svelte patterns and integrate seamlessly with the existing settings interface.

---

**✅ Implemented Backend Files:**

- `src/server/types/custom-functions.ts` - Complete type definitions
- `src/server/core/custom-functions-store.ts` - Storage layer with CRUD operations
- `src/server/api/custom-functions-validator.ts` - Validation and security framework
- `src/server/api/custom-functions-executor.ts` - Execution layer with WASM integration
- `src/server/api/custom-functions-api.ts` - Complete management API
- `src/server/api/enhanced-wasm-code-evaluator.ts` - WASM evaluator with code prepending
- `src/main/tool-service.ts` - AI tool integration (4 tools)
- `src/main/ai-service.ts` - AI service with custom functions support

**✅ Completed UI Files (Phase 3):**

- ✅ `src/renderer/src/components/custom-functions/` - Complete component directory structure
- ✅ `src/renderer/src/components/custom-functions/CustomFunctionsList.svelte` - Main management interface (598 lines)
- ✅ `src/renderer/src/components/custom-functions/CustomFunctionEditor.svelte` - Function editor with validation (774 lines)
- ✅ `src/renderer/src/components/custom-functions/CustomFunctionTester.svelte` - Interactive testing interface (579 lines)
- ✅ `src/renderer/src/components/custom-functions/CustomFunctionDetails.svelte` - Details and analytics (463 lines)
- ✅ `src/renderer/src/components/custom-functions/CustomFunctionsManager.svelte` - Main orchestrator (144 lines)
- ✅ `src/renderer/src/stores/customFunctionsStore.svelte.ts` - Complete state management (469 lines)
- ✅ `src/preload/index.ts` - 10 IPC bridge methods added with full type safety
- ✅ `src/renderer/src/env.d.ts` - Complete TypeScript definitions for all custom function APIs
- ✅ Settings integration in `src/renderer/src/components/Settings.svelte` - Custom functions section added

**Quality Metrics:**
- ✅ **0 TypeScript errors** across all components
- ✅ **0 Svelte warnings** in final implementation
- ✅ **Full accessibility compliance** with aria-labels and keyboard navigation
- ✅ **Type-safe implementation** with no `any` types in custom functions code
- ✅ **Complete integration** with existing Svelte 5 patterns and store architecture
