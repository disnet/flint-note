# Workflows and Tools Architecture

## Overview

This document describes the workflow automation and tool systems in Flint, which enable AI agents to perform complex, multi-step operations and access user-defined custom functionality.

## System Components

### Workflow Service

**Location:** `src/main/workflow-service.ts`

The Workflow Service provides high-level workflow execution and management capabilities.

#### Architecture

```typescript
class WorkflowService {
  private noteService: NoteService;
  private aiService: AIService;

  // Workflow execution
  async executeWorkflow(
    workflowId: string,
    context: WorkflowContext
  ): Promise<WorkflowResult>;

  // Workflow management
  async createWorkflow(definition: WorkflowDefinition): Promise<Workflow>;
  async listWorkflows(): Promise<Workflow[]>;
  async deleteWorkflow(id: string): Promise<void>;
}
```

#### Workflow Definition Structure

```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
  context?: Record<string, any>;
}

interface WorkflowStep {
  id: string;
  type: StepType;
  action: string;
  params: Record<string, any>;
  onSuccess?: string; // Next step ID
  onError?: string; // Error handler step ID
}

type StepType =
  | 'search' // Search for notes
  | 'filter' // Filter results
  | 'ai-process' // AI processing
  | 'create-note' // Create new note
  | 'update-note' // Update existing note
  | 'custom-function' // Execute custom function
  | 'conditional' // Conditional branching
  | 'loop'; // Iteration

interface WorkflowTrigger {
  type: 'schedule' | 'event' | 'manual';
  config: Record<string, any>;
}
```

#### Workflow Execution Flow

```
┌─────────────────────────────────────────────┐
│          Workflow Execution                 │
├─────────────────────────────────────────────┤
│ 1. Load workflow definition                │
│ 2. Initialize context                       │
│ 3. For each step:                           │
│    a. Validate prerequisites                │
│    b. Execute step action                   │
│    c. Store results in context              │
│    d. Handle errors if any                  │
│    e. Determine next step                   │
│ 4. Return final result                      │
└─────────────────────────────────────────────┘
```

#### Example Workflows

**Daily Review Workflow:**

```typescript
{
  id: 'daily-review',
  name: 'Daily Review',
  description: 'Summarize today\'s activities',
  steps: [
    {
      id: 'search-today',
      type: 'search',
      action: 'searchNotes',
      params: {
        query: 'created:today',
        limit: 100
      },
      onSuccess: 'filter-relevant'
    },
    {
      id: 'filter-relevant',
      type: 'filter',
      action: 'filterByType',
      params: {
        types: ['meeting', 'task', 'general']
      },
      onSuccess: 'ai-summarize'
    },
    {
      id: 'ai-summarize',
      type: 'ai-process',
      action: 'summarize',
      params: {
        instruction: 'Create a concise summary of today\'s notes, ' +
                    'highlighting key accomplishments and action items'
      },
      onSuccess: 'create-summary'
    },
    {
      id: 'create-summary',
      type: 'create-note',
      action: 'createNote',
      params: {
        type: 'daily-summary',
        title: 'Daily Summary {date}',
        template: 'daily-summary'
      }
    }
  ],
  triggers: [
    {
      type: 'schedule',
      config: {
        cron: '0 17 * * *' // 5 PM daily
      }
    }
  ]
}
```

#### Frontend Integration

**Store:** `src/renderer/src/stores/workflowStore.svelte.ts`

```typescript
class WorkflowStore {
  private workflows = $state<Workflow[]>([]);
  private activeWorkflow = $state<string | null>(null);
  private executionStatus = $state<WorkflowExecutionStatus | null>(null);

  async loadWorkflows(): Promise<void>;
  async executeWorkflow(id: string): Promise<void>;
  async createWorkflow(definition: WorkflowDefinition): Promise<void>;

  get currentExecution() {
    return this.executionStatus;
  }
}
```

**UI Component:** `src/renderer/src/components/ConversationStartWorkflowPanel.svelte`

Provides visual workflow selection and execution interface at the start of AI conversations.

---

### Tool Service

**Location:** `src/main/tool-service.ts`

The Tool Service orchestrates AI agent tools, including custom functions, workflow execution, and todo/plan management.

#### Architecture

```typescript
class ToolService {
  private todoPlanService: TodoPlanService | null = null;
  private workflowService: WorkflowService | null = null;
  private customFunctions: Map<string, CustomFunction> = new Map();

  // Initialization
  async initialize(
    todoPlanService: TodoPlanService,
    workflowService: WorkflowService
  ): Promise<void>;

  // Custom function management
  async registerCustomFunction(fn: CustomFunction): Promise<void>;
  async executeCustomFunction(name: string, args: any[]): Promise<any>;

  // Tool availability for AI
  getAvailableTools(): ToolDefinition[];
}
```

#### Tool Categories

**Built-in Tools:**

- Note operations (via MCP)
- Search operations
- Link management
- Vault operations

**Extended Tools:**

- Workflow execution
- Custom function calls
- Todo/plan management
- Code evaluation

#### Custom Function Execution

Custom functions are executed in a secure sandbox to prevent malicious code:

```typescript
interface CustomFunction {
  name: string;
  description: string;
  parameters: FunctionParameter[];
  code: string;
  returnType: string;
}

interface FunctionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
}
```

**Execution Flow:**

```
┌─────────────────────────────────────────────┐
│      Custom Function Execution              │
├─────────────────────────────────────────────┤
│ 1. Validate function exists                │
│ 2. Validate parameters                      │
│ 3. Create sandbox environment               │
│ 4. Inject function context                  │
│    - Note API (read-only)                   │
│    - Utility functions                      │
│    - Limited global scope                   │
│ 5. Execute function with timeout            │
│ 6. Validate return value                    │
│ 7. Clean up sandbox                         │
│ 8. Return result or error                   │
└─────────────────────────────────────────────┘
```

**Sandbox Security:**

- QuickJS WebAssembly runtime
- No file system access
- No network access
- Limited memory (10 MB default)
- Timeout protection (5 seconds default)
- Isolated global scope

**Example Custom Function:**

```javascript
/**
 * Calculate total word count across multiple notes
 * @param {string[]} noteIds - Array of note identifiers
 * @returns {object} Word count statistics
 */
function calculateTotalWords(noteIds) {
  let totalWords = 0;
  let noteCounts = [];

  for (const id of noteIds) {
    const note = api.getNote(id);
    if (note) {
      const words = note.content.split(/\s+/).length;
      totalWords += words;
      noteCounts.push({
        noteId: id,
        title: note.title,
        words: words
      });
    }
  }

  return {
    total: totalWords,
    average: totalWords / noteIds.length,
    notes: noteCounts
  };
}
```

**Frontend Store:** `src/renderer/src/stores/customFunctionsStore.svelte.ts`

```typescript
class CustomFunctionsStore {
  private functions = $state<CustomFunction[]>([]);

  async loadFunctions(): Promise<void>;
  async saveFunction(fn: CustomFunction): Promise<void>;
  async deleteFunction(name: string): Promise<void>;
  async testFunction(name: string, args: any[]): Promise<any>;
}
```

---

### Todo Plan Service

**Location:** `src/main/todo-plan-service.ts`

Manages AI agent task planning and tracking.

#### Architecture

```typescript
class TodoPlanService {
  private plans: Map<string, TodoPlan> = new Map();

  async createPlan(conversationId: string): Promise<TodoPlan>;
  async addTask(planId: string, task: TodoTask): Promise<void>;
  async updateTaskStatus(
    planId: string,
    taskId: string,
    status: TaskStatus
  ): Promise<void>;
  async getPlan(conversationId: string): Promise<TodoPlan | null>;
}

interface TodoPlan {
  id: string;
  conversationId: string;
  tasks: TodoTask[];
  created: string;
  updated: string;
}

interface TodoTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  toolCall?: string; // Associated tool call ID
  result?: any; // Task result
  error?: string; // Error message if failed
  created: string;
  completed?: string;
}
```

#### Task Lifecycle

```
┌─────────────────────────────────────────────┐
│           Task Lifecycle                    │
├─────────────────────────────────────────────┤
│                                             │
│   pending → in_progress → completed         │
│                    ↓                        │
│                  failed                     │
│                                             │
└─────────────────────────────────────────────┘
```

#### Integration with AI

When AI uses tools, tasks are automatically created and tracked:

```typescript
// AI makes a tool call
aiService.on('tool-call', (toolCall) => {
  const task = todoPlanService.addTask(conversationId, {
    description: toolCall.description,
    toolCall: toolCall.id,
    status: 'in_progress'
  });
});

// Tool call completes
aiService.on('tool-result', (result) => {
  todoPlanService.updateTaskStatus(
    conversationId,
    result.taskId,
    result.success ? 'completed' : 'failed'
  );
});
```

#### Frontend Display

Tasks are displayed in the AI assistant with visual status indicators:

```
Tasks (3):
[✓] Create project note
[⟳] Search for related notes
[○] Generate summary
```

**Store:** `src/renderer/src/stores/todoPlanStore.svelte.ts`

---

## Code Evaluation System

**Location:** `src/main/enhanced-evaluate-note-code.ts`

Provides secure JavaScript evaluation for code blocks in notes and custom functions.

### Architecture

```typescript
async function evaluateNoteCode(
  code: string,
  context: EvaluationContext,
  options: EvaluationOptions
): Promise<EvaluationResult>;

interface EvaluationContext {
  noteId?: string;
  noteContent?: string;
  metadata?: Record<string, any>;
  customData?: Record<string, any>;
}

interface EvaluationOptions {
  timeout?: number; // Milliseconds (default: 5000)
  memoryLimit?: number; // Bytes (default: 10MB)
  allowedAPIs?: string[]; // Whitelist of allowed functions
}

interface EvaluationResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  memoryUsed: number;
}
```

### Sandbox Environment

The evaluation runs in a QuickJS sandbox with restricted capabilities:

**Allowed:**

- Pure JavaScript operations
- Math operations
- String manipulation
- Array/Object operations
- JSON parsing
- Limited note API (read-only)

**Blocked:**

- File system access
- Network requests
- Process operations
- Native module loading
- Global object modification
- setTimeout/setInterval

**Available Context API:**

```javascript
// Inside sandbox
const api = {
  // Read note data
  getNote(id) {
    /* ... */
  },

  // Search notes (limited)
  searchNotes(query, limit) {
    /* ... */
  },

  // Utility functions
  parseYAML(text) {
    /* ... */
  },
  formatDate(date) {
    /* ... */
  }

  // No write operations allowed
};
```

### Use Cases

**1. Data Transformation**

```javascript
// In a note
const data = [1, 2, 3, 4, 5];
const result = data.map((x) => x * 2).reduce((a, b) => a + b, 0);
// result: 30
```

**2. Note Statistics**

```javascript
function analyzeNote(noteId) {
  const note = api.getNote(noteId);
  const words = note.content.split(/\s+/).length;
  const paragraphs = note.content.split(/\n\n/).length;
  const links = (note.content.match(/\[\[.*?\]\]/g) || []).length;

  return { words, paragraphs, links };
}
```

**3. Custom Reports**

```javascript
function generateWeeklyReport() {
  const notes = api.searchNotes('created:>-7d', 100);
  const byType = notes.reduce((acc, note) => {
    acc[note.type] = (acc[note.type] || 0) + 1;
    return acc;
  }, {});

  return {
    total: notes.length,
    byType,
    mostActive: Object.keys(byType).sort((a, b) => byType[b] - byType[a])[0]
  };
}
```

---

## Integration Patterns

### Workflow + Custom Functions

Workflows can call custom functions for complex logic:

```typescript
{
  id: 'analyze-project',
  steps: [
    {
      type: 'search',
      action: 'searchNotes',
      params: { query: 'type:project' }
    },
    {
      type: 'custom-function',
      action: 'analyzeProjectHealth',
      params: {
        notes: '{{previousStep.results}}'
      }
    },
    {
      type: 'create-note',
      action: 'createNote',
      params: {
        type: 'report',
        content: '{{previousStep.result.report}}'
      }
    }
  ]
}
```

### AI + Workflows

AI can trigger workflows based on user intent:

```
User: "Run my weekly review workflow"

AI: [Executes workflow via tool call]
    [Tracks progress as tasks]
    [Returns results]
```

### AI + Custom Functions

AI can call custom functions as tools:

```
User: "Calculate the reading time for all my project notes"

AI: [Searches for project notes]
    [Calls custom calculateReadingTime function]
    [Presents results]
```

---

## Performance Considerations

### Workflow Execution

- **Parallel Steps:** Steps can run in parallel when independent
- **Caching:** Results cached within execution context
- **Timeout:** Overall workflow timeout prevents infinite loops
- **Error Recovery:** Failed steps can trigger alternate paths

### Custom Function Execution

- **Compilation Cache:** Compiled functions cached in memory
- **Timeout:** 5-second default timeout per execution
- **Memory Limit:** 10 MB default memory limit
- **Concurrent Limits:** Max 5 concurrent executions

### Code Evaluation

- **Sandbox Reuse:** QuickJS runtime reused when possible
- **Warm Start:** Keep sandbox warm for frequent evaluations
- **Result Caching:** Deterministic functions can be cached

---

## Security Model

### Principle of Least Privilege

Each system operates with minimal permissions:

- **Workflows:** Can read/write notes, cannot access file system
- **Custom Functions:** Read-only note access, no file/network
- **Code Evaluation:** Completely isolated, no persistent state

### Input Validation

All inputs validated before execution:

```typescript
// Workflow step validation
function validateWorkflowStep(step: WorkflowStep): ValidationResult {
  if (!VALID_STEP_TYPES.includes(step.type)) {
    return { valid: false, error: 'Invalid step type' };
  }

  if (!step.action || typeof step.action !== 'string') {
    return { valid: false, error: 'Invalid action' };
  }

  // Parameter validation based on step type
  // ...

  return { valid: true };
}
```

### Error Handling

Comprehensive error handling prevents system compromise:

```typescript
try {
  const result = await executeWorkflow(workflowId, context);
  return { success: true, result };
} catch (error) {
  logger.error('Workflow execution failed', { workflowId, error });
  return {
    success: false,
    error: sanitizeError(error) // Never expose internal details
  };
}
```

---

## Future Enhancements

### Planned Features

**Workflow Builder UI:**

- Visual workflow designer
- Drag-and-drop step composition
- Real-time validation
- Template marketplace

**Advanced Custom Functions:**

- npm package imports (sandboxed)
- TypeScript support
- Debugging interface
- Performance profiling

**Enhanced Tool System:**

- Custom MCP servers
- External API integrations (with user approval)
- Shared tool library
- Tool versioning

**Improved Execution:**

- Distributed workflow execution
- Workflow scheduling
- Event-driven triggers
- Webhook support

---

## Developer Guide

### Creating a Workflow

```typescript
const workflow: WorkflowDefinition = {
  id: 'my-workflow',
  name: 'My Custom Workflow',
  description: 'Does something useful',
  steps: [
    // Define steps
  ]
};

await window.api?.createWorkflow(workflow);
```

### Creating a Custom Function

```typescript
const customFn: CustomFunction = {
  name: 'myFunction',
  description: 'Calculates something',
  parameters: [
    {
      name: 'input',
      type: 'string',
      description: 'Input value',
      required: true
    }
  ],
  code: `
    function myFunction(input) {
      // Implementation
      return result;
    }
  `,
  returnType: 'object'
};

await window.api?.registerCustomFunction(customFn);
```

### Testing

Both workflows and custom functions should be thoroughly tested:

```typescript
// tests/workflows/my-workflow.test.ts
describe('MyWorkflow', () => {
  it('should execute successfully', async () => {
    const result = await workflowService.executeWorkflow('my-workflow', {
      // test context
    });

    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toBe(3);
  });
});
```

---

## References

- **Workflow Service:** `src/main/workflow-service.ts`
- **Tool Service:** `src/main/tool-service.ts`
- **Todo Plan Service:** `src/main/todo-plan-service.ts`
- **Code Evaluation:** `src/main/enhanced-evaluate-note-code.ts`
- **Custom Functions Store:** `src/renderer/src/stores/customFunctionsStore.svelte.ts`
- **Workflow Store:** `src/renderer/src/stores/workflowStore.svelte.ts`

For UI integration, see [DESIGN.md](./DESIGN.md).

For API details, see [FLINT-NOTE-API.md](./FLINT-NOTE-API.md).
