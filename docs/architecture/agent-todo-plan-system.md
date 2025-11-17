# Agent Todo/Planning System Design

## Executive Summary

This document outlines the design for adding a **todo/planning system** to Flint's AI agent. Unlike the `AgentActivityWidget` (which provides user-facing transparency of tool calls), this system provides **agent-facing guidance** for complex, multi-step operations.

## Problem Statement

Flint's agent frequently handles complex, multi-step operations that span multiple turns:

- "Reorganize all meeting notes from Q4"
- "Create a project dashboard by analyzing all project notes"
- "Migrate all daily notes to a new format"

Without a planning system, the agent:

- Loses track of what it's done across turns
- Forgets steps in complex workflows
- Provides poor visibility into its progress
- Can't recover gracefully from errors mid-workflow

## Goals

1. **Agent Planning**: Help the agent break down complex tasks into steps
2. **Progress Tracking**: Track completion across multiple turns
3. **Recovery**: Enable recovery from errors or interruptions
4. **Transparency**: Show users the agent's plan and progress
5. **Guidance**: Keep the agent focused on the overall goal

## Non-Goals

- Replace the `AgentActivityWidget` (they serve different purposes)
- Track trivial single-tool operations
- Provide task management for users (this is agent-internal)

---

## Architecture

### 1. Core Components

#### TodoPlanService (Main Process)

Located: `src/main/todo-plan-service.ts`

```typescript
interface TodoItem {
  id: string;
  content: string; // Imperative: "Search for all meeting notes"
  activeForm: string; // Present continuous: "Searching for all meeting notes"
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created: Date;
  updated: Date;
  result?: unknown; // Optional result data
  error?: string; // Error message if failed
}

interface TodoPlan {
  id: string;
  conversationId: string;
  goal: string; // High-level goal: "Reorganize Q4 meeting notes"
  items: TodoItem[];
  status: 'active' | 'completed' | 'abandoned';
  created: Date;
  updated: Date;
}

class TodoPlanService {
  private activePlans: Map<string, TodoPlan> = new Map();

  // Create a new plan
  createPlan(conversationId: string, goal: string): TodoPlan;

  // Add items to a plan
  addTodos(planId: string, items: Array<{ content: string; activeForm: string }>): void;

  // Update todo status
  updateTodoStatus(
    planId: string,
    todoId: string,
    status: TodoItem['status'],
    result?: unknown,
    error?: string
  ): void;

  // Get current plan for conversation
  getActivePlan(conversationId: string): TodoPlan | null;

  // Complete or abandon plan
  completePlan(planId: string): void;
  abandonPlan(planId: string, reason: string): void;

  // Get plan summary for agent context
  getPlanContext(conversationId: string): string;
}
```

#### Todo Management Tool

Located: `src/main/tool-service.ts` (add to existing tools)

```typescript
const manageTodosTool = tool({
  description:
    'Manage a todo plan for complex multi-step operations. Use this when you need to:\n' +
    '1. Break down a complex task into multiple steps\n' +
    '2. Track progress across multiple turns\n' +
    '3. Show users your plan before executing\n\n' +
    'NOT needed for simple single-tool operations.',
  inputSchema: z.object({
    action: z.enum(['create', 'add', 'update', 'complete', 'get']),

    // For 'create' action
    goal: z.string().optional().describe('High-level goal (required for create)'),

    // For 'add' action
    todos: z
      .array(
        z.object({
          content: z.string().describe('Imperative form: "Create summary note"'),
          activeForm: z.string().describe('Present continuous: "Creating summary note"')
        })
      )
      .optional()
      .describe('Todos to add (required for add)'),

    // For 'update' action
    todoId: z.string().optional().describe('Todo ID to update (required for update)'),
    status: z
      .enum(['pending', 'in_progress', 'completed', 'failed'])
      .optional()
      .describe('New status (required for update)'),
    result: z.unknown().optional().describe('Result data (optional for update)'),
    error: z.string().optional().describe('Error message if failed (optional for update)')
  }),
  execute: async ({ action, goal, todos, todoId, status, result, error }) => {
    // Implementation delegates to TodoPlanService
  }
});
```

### 2. System Prompt Integration

Add to `src/main/system-prompt.md`:

```markdown
## Todo Planning System

For complex multi-step operations, use the `manage_todos` tool to track your progress:

### When to Use

- User requests involve 3+ distinct steps
- Operation spans multiple turns
- Complex workflows (migrations, bulk operations, analysis)
- Operations where showing the plan upfront would help user trust

### When NOT to Use

- Simple single-tool operations
- Straightforward CRUD operations
- Quick searches or retrievals

### Pattern

**Planning Phase:**
```

User: "Reorganize all my meeting notes from Q4"

Agent: Let me create a plan for this:
[Tool: manage_todos({ action: 'create', goal: 'Reorganize all Q4 meeting notes' })]
[Tool: manage_todos({
action: 'add',
todos: [
{ content: 'Search for all meeting notes from Q4 2024', activeForm: 'Searching for Q4 meeting notes' },
{ content: 'Analyze note structure and content', activeForm: 'Analyzing note structure' },
{ content: 'Create new organization scheme', activeForm: 'Creating organization scheme' },
{ content: 'Migrate notes to new structure', activeForm: 'Migrating notes' },
{ content: 'Verify migration completed successfully', activeForm: 'Verifying migration' }
]
})]

I've created a plan with 5 steps. Here's what I'll do:

1. Search for all meeting notes from Q4 2024
2. Analyze note structure and content
3. Create new organization scheme
4. Migrate notes to new structure
5. Verify migration completed successfully

Should I proceed?

```

**Execution Phase:**
```

User: "Yes, go ahead"

Agent: Starting step 1...
[Tool: manage_todos({ action: 'update', todoId: 'todo-1', status: 'in_progress' })]
[Tool: search_notes({ query: 'meeting', dateRange: { start: '2024-10-01', end: '2024-12-31' } })]
[Tool: manage_todos({
action: 'update',
todoId: 'todo-1',
status: 'completed',
result: { notesFound: 47 }
})]

Found 47 meeting notes from Q4. Moving to step 2...
[Tool: manage_todos({ action: 'update', todoId: 'todo-2', status: 'in_progress' })]
...

```

### Important Rules
1. **Always mark todos as in_progress BEFORE starting work** (not during)
2. **Mark completed IMMEDIATELY after finishing** (don't batch)
3. **Exactly ONE todo in_progress at a time** (not zero, not multiple)
4. **If a todo fails, mark it as failed with error message** (don't skip it)
5. **Get the current plan** before resuming work after errors or new turns

### Plan Context Injection

The system automatically injects plan context into your conversation when a plan is active:

```

<active-todo-plan>
Goal: Reorganize all Q4 meeting notes
Progress: 2/5 completed

Completed:
✅ Search for all meeting notes from Q4 2024 (found 47 notes)
✅ Analyze note structure and content

In Progress:
⏳ Create new organization scheme

Pending:
⏹ Migrate notes to new structure
⏹ Verify migration completed successfully
</active-todo-plan>

```

This context helps you:
- Remember what you've done
- Know what's next
- Resume after interruptions
- Provide status updates to users
```

---

## 3. Frontend Integration

### Todo Plan Store

Located: `src/renderer/src/stores/todoPlanStore.svelte.ts`

```typescript
import { type TodoPlan } from '../services/types';

class TodoPlanStore {
  private activePlan = $state<TodoPlan | null>(null);

  setActivePlan(plan: TodoPlan | null): void {
    this.activePlan = plan;
  }

  get currentPlan(): TodoPlan | null {
    return this.activePlan;
  }

  get hasPlan(): boolean {
    return this.activePlan !== null;
  }

  updateTodoStatus(
    todoId: string,
    status: string,
    result?: unknown,
    error?: string
  ): void {
    if (!this.activePlan) return;

    const todo = this.activePlan.items.find((t) => t.id === todoId);
    if (todo) {
      todo.status = status;
      todo.updated = new Date();
      if (result) todo.result = result;
      if (error) todo.error = error;
    }
  }
}

export const todoPlanStore = new TodoPlanStore();
```

### IPC Handlers

Located: `src/main/index.ts` and `src/preload/index.ts`

```typescript
// Main process IPC handlers
ipcMain.handle('todo-plan:create', async (_, conversationId: string, goal: string) => {
  return todoPlanService.createPlan(conversationId, goal);
});

ipcMain.handle(
  'todo-plan:add-todos',
  async (_, planId: string, todos: Array<{ content: string; activeForm: string }>) => {
    todoPlanService.addTodos(planId, todos);
    return todoPlanService.getActivePlan(planId);
  }
);

ipcMain.handle(
  'todo-plan:update-todo',
  async (
    _,
    planId: string,
    todoId: string,
    status: string,
    result?: unknown,
    error?: string
  ) => {
    todoPlanService.updateTodoStatus(planId, todoId, status, result, error);
    return todoPlanService.getActivePlan(planId);
  }
);

ipcMain.handle('todo-plan:get-active', async (_, conversationId: string) => {
  return todoPlanService.getActivePlan(conversationId);
});

// Preload API
contextBridge.exposeInMainWorld('api', {
  // ... existing API
  todoPlan: {
    create: (conversationId: string, goal: string) =>
      ipcRenderer.invoke('todo-plan:create', conversationId, goal),
    addTodos: (planId: string, todos: Array<{ content: string; activeForm: string }>) =>
      ipcRenderer.invoke('todo-plan:add-todos', planId, todos),
    updateTodo: (
      planId: string,
      todoId: string,
      status: string,
      result?: unknown,
      error?: string
    ) =>
      ipcRenderer.invoke('todo-plan:update-todo', planId, todoId, status, result, error),
    getActive: (conversationId: string) =>
      ipcRenderer.invoke('todo-plan:get-active', conversationId)
  }
});
```

### UI Component

Located: `src/renderer/src/components/TodoPlanWidget.svelte`

```svelte
<script lang="ts">
  import { todoPlanStore } from '../stores/todoPlanStore.svelte';

  let isExpanded = $state(true);

  const plan = $derived(todoPlanStore.currentPlan);
  const hasPlan = $derived(todoPlanStore.hasPlan);

  const completedCount = $derived.by(() => {
    if (!plan) return 0;
    return plan.items.filter((t) => t.status === 'completed').length;
  });

  const totalCount = $derived.by(() => {
    if (!plan) return 0;
    return plan.items.length;
  });

  const progressPercentage = $derived.by(() => {
    if (!plan || totalCount === 0) return 0;
    return (completedCount / totalCount) * 100;
  });

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'completed':
        return '✅';
      case 'in_progress':
        return '⏳';
      case 'failed':
        return '❌';
      case 'pending':
        return '⏹';
      default:
        return '•';
    }
  }
</script>

{#if hasPlan && plan}
  <div class="todo-plan-widget">
    <button class="plan-header" onclick={() => (isExpanded = !isExpanded)}>
      <div class="plan-info">
        <span class="plan-icon">📋</span>
        <span class="plan-goal">{plan.goal}</span>
        <span class="plan-progress">({completedCount}/{totalCount})</span>
      </div>
      <span class="expand-icon" class:rotated={isExpanded}>▼</span>
    </button>

    {#if isExpanded}
      <div class="plan-details">
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progressPercentage}%"></div>
        </div>

        <div class="todo-list">
          {#each plan.items as todo (todo.id)}
            <div
              class="todo-item"
              class:completed={todo.status === 'completed'}
              class:in-progress={todo.status === 'in_progress'}
              class:failed={todo.status === 'failed'}
            >
              <span class="todo-icon">{getStatusIcon(todo.status)}</span>
              <span class="todo-text">
                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
              </span>
              {#if todo.error}
                <div class="todo-error">{todo.error}</div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Similar styling to AgentActivityWidget for consistency */
  .todo-plan-widget {
    background: var(--todo-plan-bg, #f0f8ff);
    border: 2px solid var(--todo-plan-border, #4a90e2);
    border-radius: 8px;
    margin: 1rem 0;
  }

  .plan-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
  }

  .plan-goal {
    font-weight: 600;
    color: var(--todo-plan-goal-color, #2c5282);
  }

  .progress-bar {
    height: 4px;
    background: var(--progress-bg, #e0e0e0);
    border-radius: 2px;
    margin: 0.5rem 1rem;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--progress-fill, #4a90e2);
    transition: width 0.3s ease;
  }

  .todo-item {
    display: flex;
    align-items: baseline;
    padding: 0.5rem 1rem;
    gap: 0.5rem;
  }

  .todo-item.completed {
    opacity: 0.7;
    text-decoration: line-through;
  }

  .todo-item.in-progress {
    background: var(--todo-in-progress-bg, #fff9e6);
    font-weight: 500;
  }

  .todo-item.failed {
    background: var(--todo-failed-bg, #fff5f5);
  }

  .todo-error {
    color: var(--error-text, #c53030);
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
</style>
```

### Integration with Agent

Located: `src/renderer/src/components/Agent.svelte`

```svelte
<script lang="ts">
  import TodoPlanWidget from './TodoPlanWidget.svelte';
  import { todoPlanStore } from '../stores/todoPlanStore.svelte';

  // In the AI streaming handler, listen for todo plan updates
  async function handleStreamToolResult(toolCall: ToolCall) {
    if (toolCall.name === 'manage_todos') {
      // Refresh the active plan from backend
      const plan = await window.api?.todoPlan.getActive(currentConversationId);
      todoPlanStore.setActivePlan(plan);
    }
  }
</script>

<div class="chat-container">
  <!-- Existing chat UI -->

  <!-- Add TodoPlanWidget between messages and input -->
  <TodoPlanWidget />

  <!-- Existing message list and input -->
</div>
```

---

## 4. AI Service Integration

### Context Injection

Located: `src/main/ai-service.ts`

```typescript
private async getMessagesWithPlanContext(
  conversationId: string,
  messages: ModelMessage[]
): Promise<ModelMessage[]> {
  const planContext = this.todoPlanService.getPlanContext(conversationId);

  if (!planContext) {
    return messages;
  }

  // Inject plan context as a system message before the most recent user message
  const messagesWithContext = [...messages];
  const lastUserIndex = messagesWithContext.map(m => m.role).lastIndexOf('user');

  if (lastUserIndex >= 0) {
    messagesWithContext.splice(lastUserIndex, 0, {
      role: 'system',
      content: planContext
    });
  }

  return messagesWithContext;
}

// Update sendMessageStream to inject context
async sendMessageStream(...) {
  // ... existing setup ...

  const messages: ModelMessage[] = [systemMessage, ...cachedHistory];
  const messagesWithPlanContext = await this.getMessagesWithPlanContext(
    this.currentConversationId!,
    messages
  );

  const result = streamText({
    model: this.openrouter(this.currentModelName),
    messages: messagesWithPlanContext,  // Use messages with plan context
    tools,
    // ... rest of config
  });

  // ... rest of implementation
}
```

---

## 5. Persistence Strategy

### Option A: In-Memory (Phase 1)

For initial implementation, keep plans in memory:

```typescript
class TodoPlanService {
  private activePlans: Map<string, TodoPlan> = new Map();
  // Lost on app restart - acceptable for MVP
}
```

**Pros:**

- Simple to implement
- Fast
- No schema changes needed

**Cons:**

- Lost on app restart
- No plan history

### Option B: Database Persistence (Phase 2)

Add to conversation storage:

```typescript
// In conversation-storage-service.ts
interface StoredConversation {
  // ... existing fields
  activeTodoPlan?: TodoPlan;
  completedTodoPlans?: TodoPlan[];
}

// Save plan when conversation is saved
async saveConversation(conversation: Conversation): Promise<void> {
  const plan = this.todoPlanService.getActivePlan(conversation.id);
  conversation.activeTodoPlan = plan;
  // ... existing save logic
}

// Restore plan when conversation is loaded
async loadConversation(id: string): Promise<Conversation | null> {
  const conversation = await this.storage.get(id);
  if (conversation?.activeTodoPlan) {
    this.todoPlanService.restorePlan(conversation.activeTodoPlan);
  }
  return conversation;
}
```

**Pros:**

- Plans survive app restart
- Can analyze plan history
- Better UX for long-running tasks

**Cons:**

- More complex implementation
- Schema changes needed

---

## 6. Usage Examples

### Example 1: Bulk Migration

```
User: "Convert all my daily notes to use the new template format"

Agent: This is a complex operation. Let me create a plan:
[manage_todos: create plan "Convert all daily notes to new template"]
[manage_todos: add todos [
  "Get list of all daily notes",
  "Analyze current template format",
  "Load new template requirements",
  "Convert each note to new format",
  "Verify all notes converted successfully"
]]

I'll need to:
1. Get list of all daily notes
2. Analyze current template format
3. Load new template requirements
4. Convert each note to new format
5. Verify all notes converted successfully

I found 127 daily notes. This will take a few moments. Proceed?

User: "Yes"

Agent:
[manage_todos: update todo-1 to in_progress]
[search_notes: { noteType: 'daily' }]
[manage_todos: update todo-1 to completed, result: { count: 127 }]
✅ Step 1/5 complete: Found 127 daily notes

[manage_todos: update todo-2 to in_progress]
[get_note: first few notes]
[manage_todos: update todo-2 to completed]
✅ Step 2/5 complete: Analyzed current format

... continues through all steps ...
```

### Example 2: Analysis Task

```
User: "Analyze all my project notes and create a summary"

Agent:
[manage_todos: create "Analyze and summarize all project notes"]
[manage_todos: add todos [
  "Retrieve all project notes",
  "Extract key themes and patterns",
  "Identify active vs completed projects",
  "Calculate project statistics",
  "Create comprehensive summary note"
]]

I'll analyze your project notes in 5 steps. Ready?

User: "Go"

Agent: Working on this now...
[Updates status as it goes through each step]
```

### Example 3: Error Recovery

```
Agent:
[manage_todos: update todo-3 to in_progress]
[create_note: ...]
Error: Note type 'summary' does not exist

[manage_todos: update todo-3 to failed, error: "Note type 'summary' not found"]

❌ Step 3 failed: The 'summary' note type doesn't exist yet.

Should I:
1. Create the 'summary' note type first
2. Use a different note type
3. Abort the operation

User: "Create it first"

Agent:
[create_note_type: 'summary']
[manage_todos: update todo-3 to in_progress]  // Retry
[create_note: ...]
[manage_todos: update todo-3 to completed]

✅ Recovered! Created note type and completed step 3.
```

---

## 7. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

**Backend:**

- [x] Create `TodoPlanService` class
- [x] Add `manage_todos` tool to `ToolService`
- [x] Implement IPC handlers
- [x] Add plan context injection to `AIService`
- [x] Update system prompt with todo guidelines

**Frontend:**

- [ ] Create `todoPlanStore.svelte.ts`
- [ ] Add IPC bindings to preload
- [ ] Create basic `TodoPlanWidget.svelte`
- [ ] Integrate widget into `Agent.svelte`

**Testing:**

- [ ] Unit tests for `TodoPlanService`
- [ ] Integration test for todo tool
- [ ] Manual testing with multi-step scenarios

## Implementation Progress

### Completed (Phase 1 Backend)

1. **TodoPlanService** (`src/main/todo-plan-service.ts`)
   - Implemented full CRUD operations for todo plans
   - Plan lifecycle management (create, update, complete, abandon)
   - Context injection method for AI messages
   - Single in-progress todo enforcement
   - Result tracking and error handling

2. **ToolService Integration** (`src/main/tool-service.ts`)
   - Added `manage_todos` tool with full action support (create, add, update, complete, get)
   - Integrated TodoPlanService into ToolService
   - Added conversation ID tracking for proper plan association

3. **AIService Integration** (`src/main/ai-service.ts`)
   - Instantiated TodoPlanService in AIService
   - Implemented automatic plan context injection into AI messages
   - Added conversation ID synchronization with ToolService
   - Context injected before last user message to provide plan state

4. **IPC Handlers** (`src/main/index.ts`)
   - Added `todo-plan:get-active` handler for frontend access

5. **System Prompt** (`src/main/system-prompt.md`)
   - Added comprehensive todo planning guidelines
   - Included when-to-use and when-not-to-use guidance
   - Provided example pattern for create/add/update/complete workflow
   - Documented important rules (one in_progress, immediate completion marking, etc.)

### Remaining (Phase 1 Frontend)

6. **IPC Bindings** (`src/preload/index.ts`)
   - Add todoPlan API to preload exposedInMainWorld

7. **Todo Plan Store** (`src/renderer/src/stores/todoPlanStore.svelte.ts`)
   - Create reactive store for active plan state
   - Implement setActivePlan, currentPlan, hasPlan getters
   - Add updateTodoStatus helper

8. **TodoPlanWidget Component** (`src/renderer/src/components/TodoPlanWidget.svelte`)
   - Create widget UI with collapsible header
   - Progress bar visualization
   - Todo list with status icons
   - Error display for failed todos

9. **Agent Integration** (`src/renderer/src/components/Agent.svelte`)
   - Import and render TodoPlanWidget
   - Listen for manage_todos tool calls
   - Refresh plan from backend on tool use
   - Update store with latest plan state

10. **Linting and Type Checking**
    - Run `npm run format`
    - Run `npm run lint`
    - Run `npm run typecheck`
    - Fix any issues

### Phase 2: UX Polish (Week 2)

**UI Improvements:**

- [ ] Add animations for status changes
- [ ] Improve progress visualization
- [ ] Add collapsible completed items
- [ ] Better error display
- [ ] Mobile-responsive design

**Agent Behavior:**

- [ ] Fine-tune system prompt examples
- [ ] Test with various multi-step scenarios
- [ ] Gather initial user feedback
- [ ] Adjust prompting based on agent behavior

### Phase 3: Persistence & History (Week 3)

**Backend:**

- [ ] Add plan persistence to conversation storage
- [ ] Implement plan restoration on load
- [ ] Add plan history tracking
- [ ] Create plan analytics

**Frontend:**

- [ ] Add plan history view
- [ ] Show completed plans in conversation sidebar
- [ ] Add plan export/sharing

### Phase 4: Advanced Features (Future)

**Smart Planning:**

- [ ] Agent auto-suggests creating a plan for complex tasks
- [ ] Plan templates for common operations
- [ ] Plan estimation (time, number of API calls)

**Analytics:**

- [ ] Track plan completion rates
- [ ] Identify common failure points
- [ ] Optimize system prompts based on plan performance

**Collaboration:**

- [ ] Allow users to modify plans mid-execution
- [ ] User approval gates for destructive steps
- [ ] Plan branching (alternate approaches)

---

## 8. Key Design Decisions

### Why Not Auto-Create Plans?

**Decision:** Agent manually decides when to create plans (via system prompt guidance)

**Rationale:**

- Gives agent flexibility for simple tasks
- Avoids overhead for trivial operations
- Teaches agent to plan when appropriate
- Can evolve to auto-creation in Phase 4

**Alternative Considered:**

- Auto-create plan for any task with 3+ tool calls
- **Rejected:** Too rigid, creates noise for simple workflows

### Why Inject Context vs. Have Agent Query?

**Decision:** Automatically inject active plan context before each turn

**Rationale:**

- Agent always has current state without asking
- Reduces tool calls (no need for "get current plan")
- Ensures agent can't "forget" the plan exists
- Works seamlessly across conversation turns

**Alternative Considered:**

- Agent calls `manage_todos({ action: 'get' })` when needed
- **Rejected:** Agent might forget, wastes tokens on tool calls

### Why Single In-Progress Todo?

**Decision:** Enforce exactly ONE todo in_progress at a time

**Rationale:**

- Clear execution order for agent
- Better UX (users see current focus)
- Simpler error handling
- Matches agent's sequential nature

**Alternative Considered:**

- Allow parallel in_progress todos
- **Rejected:** Confusing UX, doesn't match agent capabilities

### Why Two Forms (content/activeForm)?

**Decision:** Require both imperative and present continuous forms

**Rationale:**

- Matches Claude Code's proven pattern
- Better UX (shows what's happening vs. what will happen)
- Forces clarity in planning
- Minimal overhead (usually just adding "-ing")

**Alternative Considered:**

- Single form, auto-convert to present tense
- **Rejected:** Linguistic complexity, potential errors

### Why Not Use Existing Message Stream?

**Decision:** Separate todo plan system from regular message flow

**Rationale:**

- Plans persist across turns
- Plans are structural, not conversational
- Easier to query plan state
- Keeps message history clean

**Alternative Considered:**

- Store plan as special messages in conversation
- **Rejected:** Pollutes conversation, harder to query

---

## 9. Integration with Existing Systems

### Relationship to AgentActivityWidget

**AgentActivityWidget:**

- Shows real-time tool execution
- Single turn focused
- Technical detail (tool names, args, results)
- Always visible during agent response

**TodoPlanWidget:**

- Shows multi-turn progress
- Task/goal focused
- High-level progress (steps, not tools)
- Persists between turns

**They Complement Each Other:**

```
[TodoPlanWidget showing: Step 2/5 - Analyzing note structure]
  ↓
[AgentActivityWidget showing: get_note, get_note, get_note running]
```

User sees both:

- **What** the agent is doing overall (TodoPlanWidget)
- **How** it's doing it technically (AgentActivityWidget)

### Relationship to Context Management

Todo plans consume context tokens. Key considerations:

**Plan Context Size:**

- Each todo: ~50-100 tokens
- Full plan (5 todos): ~250-500 tokens
- Negligible compared to 200k context window

**Optimization:**

- Inject only active plan (not completed ones)
- Truncate completed todos to just results
- Remove plan context when plan completes

**Example Context Injection:**

```typescript
// Compact format for completed todos
Completed:
✅ Search for Q4 meeting notes (47 notes)
✅ Analyze note structure

// Full format for active/pending
In Progress:
⏳ Create new organization scheme
  - Creating note type 'archived-meeting'
  - Defining metadata schema

Pending:
⏹ Migrate notes to new structure
⏹ Verify migration
```

### Relationship to Caching

Todo plan context benefits from prompt caching:

**Strategy:**

- System prompt + vault context (cached)
- Conversation history (optionally cached)
- **Active plan context** (NOT cached - changes frequently)
- Current user message

**Rationale:**

- Plan changes every turn (status updates)
- Caching would be ineffective
- Token cost is low anyway

---

## 10. Success Metrics

### Agent Behavior Metrics

**Planning Accuracy:**

- % of complex tasks where agent creates a plan
- False positive rate (plans for simple tasks)
- Plan completeness (all necessary steps included)

**Execution Adherence:**

- % of todos marked in_progress before work
- % of todos completed immediately after finishing
- Average number of in_progress todos (should be ~1.0)

**Error Handling:**

- % of failed todos that are retried
- % of failed todos marked with error messages
- Recovery rate after plan failures

### User Experience Metrics

**Transparency:**

- User satisfaction with plan visibility
- Clarity of progress indicators
- Usefulness of error messages

**Trust:**

- User confidence in agent's approach
- Frequency of plan abandonment
- User intervention rate (asking to change plan)

**Performance:**

- Average plan completion time
- Success rate for multi-step operations
- Comparison: with vs. without planning

### Target KPIs (After Phase 2)

- **90%+** of 5+ step tasks use planning
- **< 5%** of 1-2 step tasks use planning
- **95%+** proper status management (in_progress before work)
- **80%+** plan completion rate
- **70%+** users report improved transparency

---

## 11. Testing Strategy

### Unit Tests

**TodoPlanService Tests:**

```typescript
describe('TodoPlanService', () => {
  it('creates a new plan with unique ID');
  it('adds todos to existing plan');
  it('updates todo status');
  it('prevents multiple in_progress todos');
  it('generates correct plan context');
  it('handles plan completion');
  it('handles plan abandonment');
});
```

**Store Tests:**

```typescript
describe('TodoPlanStore', () => {
  it('updates plan state reactively');
  it('calculates progress correctly');
  it('handles missing plans gracefully');
});
```

### Integration Tests

**Tool Integration:**

```typescript
describe('manage_todos tool', () => {
  it('creates plan via tool call');
  it('adds todos via tool call');
  it('updates status via tool call');
  it('returns current plan state');
  it('validates input parameters');
});
```

**AI Service Integration:**

```typescript
describe('Plan Context Injection', () => {
  it('injects plan context before user message');
  it('omits context when no active plan');
  it('formats context correctly');
  it('updates context after each turn');
});
```

### End-to-End Tests

**User Scenarios:**

1. **Bulk Migration:**
   - Create plan for migration
   - Execute all steps
   - Handle errors gracefully
   - Complete successfully

2. **Multi-Turn Analysis:**
   - Create plan
   - Complete some steps
   - Resume after conversation pause
   - Verify context restoration

3. **Error Recovery:**
   - Create plan
   - Encounter error mid-execution
   - Mark todo as failed
   - Retry or skip
   - Continue to completion

### Manual Testing Checklist

- [ ] Create plan for simple task (should be rare)
- [ ] Create plan for complex task
- [ ] Execute plan without errors
- [ ] Execute plan with errors
- [ ] Resume plan after app restart (Phase 3)
- [ ] Abandon plan mid-execution
- [ ] Create multiple plans in different conversations
- [ ] Verify UI updates in real-time
- [ ] Test with long plans (10+ todos)
- [ ] Test context injection in messages

---

## 12. Open Questions & Decisions Needed

### Q1: How to Handle Plan Abandonment?

**Options:**

1. Explicit abandon action (agent calls abandon)
2. Auto-abandon on new plan creation
3. Auto-abandon after N turns of inactivity
4. User can manually abandon via UI

**Recommendation:** Hybrid approach

- Auto-abandon when new plan created
- Auto-abandon after 10 turns with no updates
- Add manual abandon button in Phase 2

### Q2: Should Users Be Able to Edit Plans?

**Options:**

1. Read-only (agent fully controls)
2. User can add/remove todos
3. User can reorder todos
4. User can modify todo text

**Recommendation:** Phase 1 = read-only, Phase 4 = add user editing

**Rationale:**

- Simpler initial implementation
- Agent maintains ownership
- Can add later based on user feedback

### Q3: How Granular Should Todos Be?

**Options:**

1. Very granular ("Get note 1", "Get note 2", ...)
2. High-level ("Retrieve all notes", "Analyze notes", ...)
3. Mixed granularity based on task

**Recommendation:** High-level with examples in system prompt

**Guidance in System Prompt:**

```
Good granularity:
✅ "Search for all Q4 meeting notes"
✅ "Analyze note structure and themes"
✅ "Create summary note with findings"

Too granular:
❌ "Search for notes"
❌ "Get first note"
❌ "Get second note"
❌ "Get third note"
...

Too broad:
❌ "Complete the entire reorganization"
```

### Q4: Should Plans Have Time Estimates?

**Options:**

1. No estimates (current design)
2. Agent provides estimates
3. System calculates based on history

**Recommendation:** No estimates in Phase 1

**Rationale:**

- Hard to estimate accurately
- Can add in Phase 4 with historical data
- Focus on progress tracking first

### Q5: How to Handle Very Long Plans?

**Scenario:** User asks to "analyze all 5000 notes"

**Options:**

1. Create 5000 todos (one per note)
2. Create high-level todos with progress in result
3. Chunk into batches

**Recommendation:** Option 2 - high-level with progress

**Example:**

```typescript
{
  content: 'Analyze all 5000 notes',
  activeForm: 'Analyzing notes',
  status: 'in_progress',
  result: {
    processed: 1234,
    total: 5000,
    progress: 0.247
  }
}
```

---

## 13. Comparison to Claude Code's TodoWrite

### Similarities

✅ Both help agent track multi-step tasks
✅ Both use imperative + active forms
✅ Both enforce single in_progress todo
✅ Both inject context automatically
✅ Both prevent agent from forgetting progress

### Differences

| Aspect             | Claude Code             | Flint                               |
| ------------------ | ----------------------- | ----------------------------------- |
| **Scope**          | General coding tasks    | Note management tasks               |
| **Persistence**    | Unknown                 | Planned (Phase 3)                   |
| **UI Location**    | Inline with messages    | Separate widget                     |
| **Tool Design**    | Single `TodoWrite` tool | Single `manage_todos` tool          |
| **Context Format** | Unknown                 | Markdown in system message          |
| **Plan Structure** | Flat list               | Flat list with optional result data |

### Lessons Learned from Claude Code

1. **Clear Rules:** Explicit rules in system prompt work
2. **Forcing Functions:** Requiring both forms improves planning
3. **Single In-Progress:** Prevents confusion and errors
4. **Auto Context:** Better than making agent query
5. **Simple Design:** Flat list is sufficient, no fancy hierarchy needed

---

## 14. Risk Mitigation

### Risk: Agent Doesn't Use Planning

**Mitigation:**

- Strong examples in system prompt
- Test and iterate on prompting
- Monitor usage in Phase 2
- Potentially add auto-suggestion in Phase 4

### Risk: Plans Create Too Much Noise

**Mitigation:**

- Clear guidelines on when to use
- Collapsible UI by default
- Option to hide completed plans
- Don't persist trivial plans

### Risk: Context Overhead

**Mitigation:**

- Compact context format
- Remove completed plans from context
- Monitor token usage
- Truncate old completed todos

### Risk: Breaking Changes to Conversations

**Mitigation:**

- In-memory first (no schema changes)
- Additive changes only for persistence
- Backward compatible conversation format
- Migration strategy for Phase 3

### Risk: Poor Agent Adherence to Status Updates

**Mitigation:**

- Explicit rules in system prompt
- Examples showing correct pattern
- Validation in tool (warn if skipping in_progress)
- Iterate based on observed behavior

---

## 15. Future Enhancements

### Plan Templates

Pre-defined plan templates for common operations:

```typescript
const PLAN_TEMPLATES = {
  bulk_migration: {
    name: 'Bulk Note Migration',
    steps: [
      'Identify notes to migrate',
      'Analyze current structure',
      'Prepare migration strategy',
      'Execute migration in batches',
      'Verify migration success'
    ]
  },
  content_analysis: {
    name: 'Content Analysis',
    steps: [
      'Retrieve relevant notes',
      'Extract key themes and patterns',
      'Perform statistical analysis',
      'Generate insights',
      'Create summary report'
    ]
  }
};
```

### Plan Branching

Allow plans to have alternate paths:

```
Plan: Reorganize meeting notes
1. ✅ Search for meeting notes
2. ⏳ Choose organization strategy
   → Option A: By date
   → Option B: By project
   → Option C: By participant
3. Pending: Execute reorganization
4. Pending: Verify
```

### Collaborative Planning

User can suggest modifications:

```
Agent: I'll create a plan with these 5 steps...
User: Can you add a step to back up the notes first?
Agent: Great idea! I'll add that as step 1.
[manage_todos: add todo at position 0]
```

### Plan Analytics Dashboard

Show aggregate statistics:

- Most common plan types
- Success rates by plan complexity
- Average completion time
- Failure points analysis

---

## 16. Migration & Rollout Plan

### Phase 1: Development (Week 1)

- Build core infrastructure
- Internal testing
- Iterate on system prompts

### Phase 2: Alpha (Week 2)

- Deploy to test users (5-10)
- Monitor usage patterns
- Gather qualitative feedback
- Fix critical bugs

### Phase 3: Beta (Week 3-4)

- Wider rollout (50+ users)
- Add persistence
- Collect metrics
- Refine UX

### Phase 4: GA (Week 5+)

- Full release
- Monitor KPIs
- Plan Phase 4 features
- Write user documentation

### Rollback Strategy

If planning system causes issues:

1. **Immediate:** Remove tool from system prompt
2. **Quick:** Add feature flag to disable planning
3. **Revert:** Roll back to previous version
4. **Data:** Plans stored separately, safe to remove

---

## Conclusion

A todo/planning system will significantly improve Flint's agent capabilities for complex, multi-step operations. By following Claude Code's proven pattern and adapting it for note management workflows, we can provide:

- **Better agent guidance** through complex tasks
- **Improved transparency** for users
- **Graceful error recovery** and resumption
- **Foundation for advanced features** like collaborative planning

The phased approach allows us to:

1. Start simple (in-memory, core features)
2. Validate with users (gather feedback)
3. Expand thoughtfully (persistence, analytics)
4. Innovate carefully (templates, branching)

**Recommended Next Step:** Approve this design and begin Phase 1 implementation.
