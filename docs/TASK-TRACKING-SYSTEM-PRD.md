# Task Tracking System - Product Requirements Document

**Document Status:** Draft
**Created:** 2025-10-20
**Author:** System Design
**Version:** 1.0

---

## Executive Summary

The Task Tracking System enables collaborative task management between AI agents and users across conversation threads. Tasks are persistent data records containing instructions, context, and supplementary materials that agents can reference and execute. The system supports both one-time and recurring tasks, allowing users to define workflows that agents proactively manage over time.

**Core Value Proposition:** Enable users to teach agents persistent workflows that execute consistently across sessions, reducing repetitive instructions and enabling proactive assistance.

**Key Example:** A user creates a "Weekly Summary" task that runs every Sunday. The task contains detailed instructions for synthesizing the week's daily notes into a structured weekly note. Every Sunday, agents across all conversation threads are aware this task is due and can proactively offer to execute it.

---

## Goals and Non-Goals

### Goals

1. **Persistent Agent Knowledge:** Tasks provide durable context that survives across conversation threads
2. **Proactive Agent Behavior:** Agents can suggest tasks at appropriate times (due dates, recurring schedules)
3. **Collaborative Management:** Both users (via UI) and agents (via tools) can create and manage tasks
4. **Flexible Execution:** Tasks can be executed on-demand or on recurring schedules
5. **Rich Context:** Supplementary materials provide agents with examples, templates, and reference data
6. **Minimal Prompt Bloat:** Task awareness doesn't significantly increase token usage in system prompts

### Non-Goals

1. **Complex Scheduling:** No cron-like syntax or timezone-aware scheduling (initial version)
2. **Task Dependencies:** No "task A must complete before task B" logic (can be added later)
3. **External System Integration:** No calendar, email, or third-party task system sync
4. **Multi-user Collaboration:** Tasks are scoped to a vault, not shared across users
5. **Advanced Analytics:** No task completion statistics or performance tracking (v1)

---

## User Stories

### Core Workflows

**US-1: Create Recurring Task**
As a user, I want to create a weekly task for summarizing my notes, so that the agent can automatically perform this workflow every week.

**US-2: Agent Proactive Suggestion**
As a user, I want the agent to proactively notice when tasks are due and offer to execute them, so I don't have to remember routine workflows.

**US-3: Execute Task On-Demand**
As a user, I want to manually trigger a task execution even when it's not due, so I can run workflows whenever needed.

**US-4: View Task List**
As a user, I want to see all my active tasks in one place, so I can understand what automated workflows exist in my vault.

**US-5: Task with Supplementary Materials**
As a user, I want to attach templates, examples, and reference notes to a task, so the agent has everything needed to execute it correctly.

**US-6: Agent Creates Task**
As a user, I want to ask the agent to "set up a weekly review task" in natural language, and have it create the task with appropriate structure.

**US-7: Mark Task Complete**
As a user, I want the agent to mark a task as completed when executed, so I can track when recurring tasks last ran.

**US-8: Edit Task**
As a user, I want to update task instructions after trying them once, so I can refine workflows over time.

**US-9: Quick Task Execution from UI**
As a user, I want to click a task in the UI and have it send an execution message to the agent, so I can easily trigger workflows.

**US-10: Archive Completed Tasks**
As a user, I want to archive one-time tasks after completion, so my active task list stays focused.

---

## Functional Requirements

### FR-1: Task Data Model

Each task must contain:

- **id** (string, immutable): Unique identifier in format `t-xxxxxxxx`
- **name** (string, 1-20 chars): Short, memorable name (e.g., "Weekly Summary")
- **purpose** (string, max 100 chars): One-sentence description of what the task accomplishes
- **description** (string, unlimited): Detailed step-by-step instructions for execution
- **status** (enum): `active`, `paused`, `completed`, `archived`
- **vault_id** (string): Which vault this task belongs to
- **created_at** (datetime): When task was created
- **updated_at** (datetime): Last modification time

Optional fields:
- **recurring_spec** (object): Schedule information for recurring tasks
- **due_date** (datetime): One-time due date for non-recurring tasks
- **last_completed** (datetime): Most recent completion timestamp
- **supplementary_materials** (array): Attached context, templates, code snippets

### FR-2: Recurring Task Specification

Recurring tasks must support:

```typescript
interface RecurringSpec {
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;      // 0-6 for weekly (0=Sunday)
  dayOfMonth?: number;     // 1-31 for monthly
  time?: string;           // Optional "HH:MM" for specific time
}
```

**Scheduling Logic:**
- **Daily:** Task is due if 24+ hours have passed since last completion
- **Weekly:** Task is due if 7+ days have passed AND current day matches `dayOfWeek`
- **Monthly:** Task is due if 30+ days have passed AND current day matches `dayOfMonth`

### FR-3: Supplementary Materials

Tasks can include multiple supplementary materials:

```typescript
interface SupplementaryMaterial {
  id: string;
  type: 'text' | 'code' | 'note_reference';
  content: string;              // For text/code types
  note_id?: string;             // For note_reference type
  metadata?: {
    language?: string;          // For code type
    description?: string;
    template_type?: string;
  };
}
```

**Storage limits:**
- Individual material: 50KB max
- Total materials per task: 500KB max
- Note references: No limit (loaded on-demand)

### FR-4: Task Completion Tracking

Each task completion must be recorded:

```typescript
interface TaskCompletion {
  id: string;
  task_id: string;
  completed_at: datetime;
  conversation_id?: string;     // Which conversation executed it
  notes?: string;               // Agent's notes about execution
  output_note_id?: string;      // ID of note created (if applicable)
  metadata?: {
    duration_ms?: number;
    tool_calls_count?: number;
  };
}
```

For recurring tasks:
- Completion is recorded in history
- `last_completed` timestamp is updated
- Status remains `active` for future occurrences

For one-time tasks:
- Completion is recorded
- Status changes to `completed`
- Task can be manually re-activated or archived

### FR-5: System Prompt Injection

**Tier 1: Task Index (Always Injected)**

Lightweight summary added to vault context:

```markdown
## Available Tasks

### Due Now
- **Weekly Summary**: Summarize week's daily notes into weekly note (due every Sunday)
- **Meeting Prep**: Review today's meetings and create prep notes (due daily at 8am)

### Active Tasks
- **Project Setup**: Create complete structure for new project (on-demand)
- **Monthly Archive**: Archive completed items and organize vault (due 1st of month)

### Paused Tasks (2)
[Not listed in context to save tokens]
```

**Token Budget:** Max 500 tokens for task index

**Tier 2: Task Details (Loaded On-Demand)**

Full task details only loaded when agent uses `get_task` tool:
- Complete description
- Supplementary materials
- Completion history (if requested)

### FR-6: Agent Tools

The following tools must be available to agents:

**create_task**
- Create new task with all fields
- Validate name length, purpose length
- Generate unique ID
- Return task ID and confirmation

**update_task**
- Modify any task field except `id`, `created_at`, `vault_id`
- Require task ID
- Support partial updates
- Return updated task

**delete_task**
- Soft delete (mark as `archived`)
- Require confirmation for tasks with completion history
- Return success confirmation

**list_tasks**
- Filter by status, recurring, due date
- Sort by due date, created date, name
- Return lightweight task list (name, purpose, status, due info)

**get_task**
- Retrieve full task details
- Optionally include supplementary materials
- Optionally include completion history
- Return complete task object

**complete_task**
- Mark task as completed
- Record completion in history
- Update `last_completed` timestamp
- Optionally attach notes and output note ID
- Handle recurring vs one-time logic
- Return completion record

**add_task_material**
- Add supplementary material to existing task
- Validate size limits
- Support all material types
- Return material ID

**remove_task_material**
- Remove supplementary material by ID
- Require confirmation
- Return success confirmation

### FR-7: UI Requirements

**Task Management View**

Primary interface for viewing and managing all tasks:

- **List View:** Display tasks grouped by status
  - Columns: Name, Purpose, Type (recurring/one-time), Last Completed, Due Date/Schedule
  - Filters: Status (active/paused/completed/archived), Type (recurring/one-time)
  - Sort: Due date, created date, name, last completed
  - Search: Filter by name or purpose text

- **Task Detail Panel:** Show full task when selected
  - Display all fields including description
  - Show completion history (last 10 completions)
  - Show supplementary materials (expandable)
  - Actions: Edit, Execute, Pause/Resume, Archive, Delete

- **Create/Edit Form:**
  - Name input (max 20 chars, real-time validation)
  - Purpose input (max 100 chars, real-time validation)
  - Description textarea (markdown editor)
  - Status dropdown
  - Recurring toggle with schedule picker
  - Due date picker (for non-recurring)
  - Supplementary materials section:
    - Add text block
    - Add code snippet with language selector
    - Add note reference with autocomplete
  - Save/Cancel buttons

**Conversation Start View**

Quick access to relevant tasks when starting new conversation:

- **Section 1: Tasks Due Now**
  - Show tasks that are currently due
  - Display: Name, purpose, last completed time
  - Click to send "Execute task: {name}" message to agent

- **Section 2: Upcoming Tasks**
  - Show tasks due in next 7 days
  - Display: Name, purpose, due date/schedule

- **Section 3: On-Demand Tasks**
  - Show active non-recurring tasks
  - Display: Name, purpose
  - Click to execute

- **View All Tasks** button → Opens Task Management View

**In-Conversation Task Indicators**

During conversation, show when agent mentions tasks:

- Highlight task names as clickable chips
- Tooltip shows task purpose on hover
- Click opens task detail panel

### FR-8: Task Execution Flow

**User-Initiated Execution:**

1. User clicks task in UI or says "do the weekly summary task"
2. UI/agent identifies task by name or ID
3. Agent calls `get_task` with `includeSupplementaryMaterials: true`
4. Agent follows description step-by-step
5. Agent calls `complete_task` when finished
6. Agent reports outcome to user

**Agent-Initiated Execution:**

1. Agent checks task index in system prompt
2. Agent notices task is due based on current date/time
3. Agent proactively suggests: "I notice your {task name} task is due. Would you like me to {purpose}?"
4. If user agrees, proceed with execution flow
5. If user declines, agent doesn't repeat suggestion for 24 hours

**Execution with Supplementary Materials:**

1. Agent loads task with materials
2. For `note_reference` type materials, agent loads referenced notes
3. For `text`/`code` materials, agent includes directly in context
4. Agent uses materials as templates, examples, or reference during execution

### FR-9: Error Handling

**Task Not Found:**
- Return clear error message with task ID
- Suggest using `list_tasks` to find available tasks

**Invalid Recurring Spec:**
- Validate dayOfWeek (0-6), dayOfMonth (1-31)
- Validate frequency enum
- Return validation errors before saving

**Supplementary Material Too Large:**
- Reject materials >50KB with clear error
- Show current size and limit in error message

**Task Execution Failure:**
- Agent should report failure to user
- Do NOT mark task as completed
- Optionally create failure note in completion history

**Circular Task References:**
- If task description references itself, warn but allow
- If supplementary materials create infinite loop, prevent

### FR-10: Data Migration and Versioning

**Initial Migration:**
- Create `tasks` table
- Create `task_supplementary_materials` table
- Create `task_completion_history` table
- Create indexes
- Add version marker to migration system

**Backwards Compatibility:**
- Gracefully handle missing task tables (no tasks exist yet)
- Agent tools return empty lists if feature not enabled
- UI shows "coming soon" state if backend version too old

**Future Schema Changes:**
- Use migration system already in place
- Version task data structure
- Support migration of task format changes

---

## Technical Design

### Database Schema

```sql
-- Core tasks table
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,              -- t-xxxxxxxx format
  name TEXT NOT NULL,               -- 1-20 chars
  purpose TEXT NOT NULL,            -- Max 100 chars
  description TEXT NOT NULL,        -- Unlimited markdown
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  vault_id TEXT NOT NULL,

  -- Scheduling
  recurring_spec TEXT,              -- JSON: {frequency, dayOfWeek?, dayOfMonth?, time?}
  due_date DATETIME,                -- For one-time tasks
  last_completed DATETIME,          -- Most recent completion

  -- Metadata
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,

  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX idx_tasks_vault_status ON tasks(vault_id, status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_last_completed ON tasks(last_completed) WHERE last_completed IS NOT NULL;
CREATE INDEX idx_tasks_vault_recurring ON tasks(vault_id, recurring_spec) WHERE recurring_spec IS NOT NULL;

-- Supplementary materials
CREATE TABLE task_supplementary_materials (
  id TEXT PRIMARY KEY,              -- Material ID
  task_id TEXT NOT NULL,
  material_type TEXT NOT NULL
    CHECK (material_type IN ('text', 'code', 'note_reference')),
  content TEXT,                     -- For text/code types
  note_id TEXT,                     -- For note_reference type
  metadata TEXT,                    -- JSON: {language?, description?, template_type?}
  position INTEGER NOT NULL DEFAULT 0,  -- Display order
  created_at DATETIME NOT NULL,

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
);

CREATE INDEX idx_task_materials_task ON task_supplementary_materials(task_id, position);

-- Completion history
CREATE TABLE task_completion_history (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  completed_at DATETIME NOT NULL,
  conversation_id TEXT,
  notes TEXT,                       -- Agent's notes about execution
  output_note_id TEXT,              -- Note created as result
  metadata TEXT,                    -- JSON: {duration_ms?, tool_calls_count?}

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (output_note_id) REFERENCES notes(id) ON DELETE SET NULL
);

CREATE INDEX idx_task_completion_task ON task_completion_history(task_id, completed_at DESC);
CREATE INDEX idx_task_completion_conversation ON task_completion_history(conversation_id);
```

### TypeScript Interfaces

```typescript
// Core task interface
interface Task {
  id: string;                       // t-xxxxxxxx
  name: string;                     // Max 20 chars
  purpose: string;                  // Max 100 chars
  description: string;              // Markdown
  status: TaskStatus;
  vaultId: string;

  // Scheduling
  recurringSpec?: RecurringSpec;
  dueDate?: string;                 // ISO datetime
  lastCompleted?: string;           // ISO datetime

  // Metadata
  createdAt: string;
  updatedAt: string;

  // Lazy-loaded
  supplementaryMaterials?: SupplementaryMaterial[];
  completionHistory?: TaskCompletion[];
}

type TaskStatus = 'active' | 'paused' | 'completed' | 'archived';

interface RecurringSpec {
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;               // 0-6 (0=Sunday)
  dayOfMonth?: number;              // 1-31
  time?: string;                    // "HH:MM" format
}

interface SupplementaryMaterial {
  id: string;
  taskId: string;
  materialType: 'text' | 'code' | 'note_reference';
  content?: string;                 // For text/code
  noteId?: string;                  // For note_reference
  metadata?: {
    language?: string;              // For code
    description?: string;
    templateType?: string;
  };
  position: number;
  createdAt: string;
}

interface TaskCompletion {
  id: string;
  taskId: string;
  completedAt: string;
  conversationId?: string;
  notes?: string;
  outputNoteId?: string;
  metadata?: {
    durationMs?: number;
    toolCallsCount?: number;
  };
}

// Lightweight task list item
interface TaskListItem {
  id: string;
  name: string;
  purpose: string;
  status: TaskStatus;
  isRecurring: boolean;
  dueInfo?: {
    type: 'overdue' | 'due_now' | 'upcoming' | 'scheduled';
    dueDate?: string;
    recurringSchedule?: string;     // Human-readable: "Every Sunday"
  };
  lastCompleted?: string;
}

// Tool input/output types
interface CreateTaskInput {
  name: string;
  purpose: string;
  description: string;
  status?: TaskStatus;
  recurringSpec?: RecurringSpec;
  dueDate?: string;
  supplementaryMaterials?: Array<{
    type: 'text' | 'code' | 'note_reference';
    content?: string;
    noteId?: string;
    metadata?: Record<string, unknown>;
  }>;
}

interface UpdateTaskInput {
  taskId: string;
  name?: string;
  purpose?: string;
  description?: string;
  status?: TaskStatus;
  recurringSpec?: RecurringSpec | null;
  dueDate?: string | null;
}

interface CompleteTaskInput {
  taskId: string;
  notes?: string;
  outputNoteId?: string;
  metadata?: {
    durationMs?: number;
    toolCallsCount?: number;
  };
}

interface ListTasksInput {
  status?: TaskStatus | 'all';
  dueSoon?: boolean;                // Tasks due in next 7 days
  recurringOnly?: boolean;
  overdueOnly?: boolean;
  includeArchived?: boolean;
  sortBy?: 'dueDate' | 'created' | 'name' | 'lastCompleted';
  sortOrder?: 'asc' | 'desc';
}

interface GetTaskInput {
  taskId: string;
  includeSupplementaryMaterials?: boolean;
  includeCompletionHistory?: boolean;
  completionHistoryLimit?: number;  // Default 10
}
```

### API Layer

**TaskManager Class:**

```typescript
class TaskManager {
  private db: DatabaseConnection;
  private workspace: Workspace;

  // Core CRUD
  async createTask(vaultId: string, input: CreateTaskInput): Promise<Task>
  async getTask(taskId: string, options?: GetTaskInput): Promise<Task | null>
  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task>
  async deleteTask(taskId: string): Promise<void>  // Soft delete
  async listTasks(vaultId: string, input?: ListTasksInput): Promise<TaskListItem[]>

  // Supplementary materials
  async addSupplementaryMaterial(taskId: string, material: SupplementaryMaterial): Promise<string>
  async removeSupplementaryMaterial(materialId: string): Promise<void>
  async getSupplementaryMaterials(taskId: string): Promise<SupplementaryMaterial[]>

  // Completion tracking
  async completeTask(input: CompleteTaskInput): Promise<TaskCompletion>
  async getCompletionHistory(taskId: string, limit?: number): Promise<TaskCompletion[]>

  // Scheduling helpers
  async getTasksDueNow(vaultId: string): Promise<TaskListItem[]>
  async getUpcomingTasks(vaultId: string, daysAhead: number): Promise<TaskListItem[]>
  isTaskDue(task: Task, now?: Date): boolean

  // System prompt generation
  async getTaskContextForPrompt(vaultId: string): Promise<string>
}
```

**ToolService Integration:**

Add task tools to existing ToolService:

```typescript
// In ToolService.getTools()
const taskTools = this.getTaskTools();
return {
  ...existingTools,
  ...taskTools
};

private getTaskTools(): Record<string, Tool> {
  return {
    create_task: tool({
      description: 'Create a new task that persists across conversations',
      inputSchema: createTaskSchema,
      execute: async (input) => {
        const taskManager = this.getTaskManager();
        const vault = await this.noteService.getCurrentVault();
        const task = await taskManager.createTask(vault.id, input);
        return {
          success: true,
          data: { taskId: task.id, name: task.name },
          message: `Created task "${task.name}"`
        };
      }
    }),

    update_task: tool({ /* ... */ }),
    delete_task: tool({ /* ... */ }),
    list_tasks: tool({ /* ... */ }),
    get_task: tool({ /* ... */ }),
    complete_task: tool({ /* ... */ }),
    add_task_material: tool({ /* ... */ }),
    remove_task_material: tool({ /* ... */ })
  };
}
```

### System Prompt Integration

**In AIService.getVaultContext():**

```typescript
async getVaultContext(): Promise<string> {
  let context = await this.getBaseVaultContext();  // Existing logic

  // Add task context
  if (this.taskManager) {
    const vault = await this.noteService.getCurrentVault();
    const taskContext = await this.taskManager.getTaskContextForPrompt(vault.id);

    if (taskContext) {
      context += '\n\n' + taskContext;
    }
  }

  return context;
}
```

**TaskManager.getTaskContextForPrompt():**

```typescript
async getTaskContextForPrompt(vaultId: string): Promise<string> {
  const dueNow = await this.getTasksDueNow(vaultId);
  const upcoming = await this.getUpcomingTasks(vaultId, 7);
  const active = await this.listTasks(vaultId, {
    status: 'active',
    includeArchived: false
  });

  let context = '## Available Tasks\n\n';

  // Due now - highest priority
  if (dueNow.length > 0) {
    context += '### Due Now\n';
    for (const task of dueNow) {
      const schedule = task.dueInfo?.recurringSchedule || 'one-time task';
      context += `- **${task.name}**: ${task.purpose} (${schedule})\n`;
    }
    context += '\n';
  }

  // Upcoming in next 7 days
  if (upcoming.length > 0) {
    context += '### Upcoming (Next 7 Days)\n';
    for (const task of upcoming.slice(0, 5)) {  // Max 5 to save tokens
      context += `- **${task.name}**: ${task.purpose}\n`;
    }
    context += '\n';
  }

  // Other active on-demand tasks
  const onDemand = active.filter(t =>
    !t.isRecurring &&
    !dueNow.some(d => d.id === t.id) &&
    !upcoming.some(u => u.id === t.id)
  );

  if (onDemand.length > 0) {
    context += '### On-Demand Tasks\n';
    for (const task of onDemand.slice(0, 5)) {  // Max 5 to save tokens
      context += `- **${task.name}**: ${task.purpose}\n`;
    }
    context += '\n';
  }

  // Add tool hint
  context += '*Use `get_task` to load full details and `complete_task` when finished.*\n';

  return context;
}
```

### UI Components (Svelte 5)

**TaskManagementView.svelte:**

```svelte
<script lang="ts">
  import { taskStore } from '../stores/task-store.svelte';
  import TaskList from './TaskList.svelte';
  import TaskDetail from './TaskDetail.svelte';
  import TaskForm from './TaskForm.svelte';

  let selectedTaskId = $state<string | null>(null);
  let showCreateForm = $state(false);
  let statusFilter = $state<TaskStatus | 'all'>('active');

  const filteredTasks = $derived(
    taskStore.tasks.filter(t =>
      statusFilter === 'all' || t.status === statusFilter
    )
  );

  async function handleCreateTask(taskData: CreateTaskInput) {
    await taskStore.createTask(taskData);
    showCreateForm = false;
  }

  async function handleExecuteTask(taskId: string) {
    // Send message to agent to execute task
    const task = taskStore.getTaskById(taskId);
    if (task) {
      await window.api.sendMessage(`Execute task: ${task.name}`);
    }
  }
</script>

<div class="task-management">
  <header>
    <h1>Tasks</h1>
    <button onclick={() => showCreateForm = true}>Create Task</button>
  </header>

  <div class="filters">
    <select bind:value={statusFilter}>
      <option value="all">All Tasks</option>
      <option value="active">Active</option>
      <option value="paused">Paused</option>
      <option value="completed">Completed</option>
      <option value="archived">Archived</option>
    </select>
  </div>

  <div class="content">
    <TaskList
      tasks={filteredTasks}
      selectedId={selectedTaskId}
      onSelect={(id) => selectedTaskId = id}
      onExecute={handleExecuteTask}
    />

    {#if selectedTaskId}
      <TaskDetail
        taskId={selectedTaskId}
        onClose={() => selectedTaskId = null}
        onExecute={handleExecuteTask}
      />
    {/if}
  </div>

  {#if showCreateForm}
    <TaskForm
      onSubmit={handleCreateTask}
      onCancel={() => showCreateForm = false}
    />
  {/if}
</div>
```

**ConversationStartTaskPanel.svelte:**

```svelte
<script lang="ts">
  import { taskStore } from '../stores/task-store.svelte';

  const dueNow = $derived(taskStore.tasksDueNow);
  const upcoming = $derived(taskStore.upcomingTasks);
  const onDemand = $derived(taskStore.onDemandTasks);

  async function executeTask(taskId: string) {
    const task = taskStore.getTaskById(taskId);
    if (task) {
      await window.api.sendMessage(`Execute task: ${task.name}`);
    }
  }
</script>

<div class="conversation-start-tasks">
  {#if dueNow.length > 0}
    <section class="due-now">
      <h3>Tasks Due Now</h3>
      {#each dueNow as task}
        <button class="task-card due" onclick={() => executeTask(task.id)}>
          <div class="task-name">{task.name}</div>
          <div class="task-purpose">{task.purpose}</div>
          {#if task.lastCompleted}
            <div class="last-completed">
              Last: {formatRelativeTime(task.lastCompleted)}
            </div>
          {/if}
        </button>
      {/each}
    </section>
  {/if}

  {#if upcoming.length > 0}
    <section class="upcoming">
      <h3>Upcoming Tasks</h3>
      {#each upcoming as task}
        <button class="task-card" onclick={() => executeTask(task.id)}>
          <div class="task-name">{task.name}</div>
          <div class="task-purpose">{task.purpose}</div>
          <div class="due-date">{formatDueDate(task.dueInfo)}</div>
        </button>
      {/each}
    </section>
  {/if}

  {#if onDemand.length > 0}
    <section class="on-demand">
      <h3>On-Demand Tasks</h3>
      {#each onDemand.slice(0, 3) as task}
        <button class="task-card" onclick={() => executeTask(task.id)}>
          <div class="task-name">{task.name}</div>
          <div class="task-purpose">{task.purpose}</div>
        </button>
      {/each}
    </section>
  {/if}

  <a href="/tasks" class="view-all">View All Tasks →</a>
</div>
```

**task-store.svelte.ts:**

```typescript
import { type Task, type TaskListItem } from '../types/task';

class TaskStore {
  tasks = $state<TaskListItem[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  tasksDueNow = $derived(
    this.tasks.filter(t => t.dueInfo?.type === 'due_now')
  );

  upcomingTasks = $derived(
    this.tasks.filter(t => t.dueInfo?.type === 'upcoming')
  );

  onDemandTasks = $derived(
    this.tasks.filter(t => !t.isRecurring && !t.dueInfo)
  );

  async loadTasks() {
    this.loading = true;
    try {
      const result = await window.api.listTasks({ status: 'active' });
      this.tasks = result.tasks;
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  async createTask(input: CreateTaskInput) {
    const result = await window.api.createTask(input);
    await this.loadTasks();  // Refresh list
    return result.taskId;
  }

  getTaskById(id: string): TaskListItem | undefined {
    return this.tasks.find(t => t.id === id);
  }

  // ... other methods
}

export const taskStore = new TaskStore();
```

### IPC API

**In preload script:**

```typescript
// Add to contextBridge.exposeInMainWorld
api: {
  // ... existing methods

  // Task management
  createTask: (input: CreateTaskInput) => ipcRenderer.invoke('task:create', input),
  updateTask: (taskId: string, input: UpdateTaskInput) =>
    ipcRenderer.invoke('task:update', taskId, input),
  deleteTask: (taskId: string) => ipcRenderer.invoke('task:delete', taskId),
  listTasks: (input?: ListTasksInput) => ipcRenderer.invoke('task:list', input),
  getTask: (taskId: string, options?: GetTaskInput) =>
    ipcRenderer.invoke('task:get', taskId, options),
  completeTask: (input: CompleteTaskInput) =>
    ipcRenderer.invoke('task:complete', input),
  addTaskMaterial: (taskId: string, material: SupplementaryMaterial) =>
    ipcRenderer.invoke('task:add-material', taskId, material),
  removeTaskMaterial: (materialId: string) =>
    ipcRenderer.invoke('task:remove-material', materialId),
}
```

**In main process:**

```typescript
// Register IPC handlers
ipcMain.handle('task:create', async (event, input: CreateTaskInput) => {
  const taskManager = getTaskManager();
  const vault = await noteService.getCurrentVault();
  return await taskManager.createTask(vault.id, input);
});

ipcMain.handle('task:list', async (event, input?: ListTasksInput) => {
  const taskManager = getTaskManager();
  const vault = await noteService.getCurrentVault();
  return await taskManager.listTasks(vault.id, input);
});

// ... other handlers
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

**Milestone 1.1: Database & Data Layer**
- [ ] Create migration script for task tables
- [ ] Implement TaskManager class with CRUD methods
- [ ] Write unit tests for TaskManager
- [ ] Add task ID generation (t-xxxxxxxx format)
- [ ] Implement recurring task scheduling logic
- [ ] Test migration on existing vault

**Milestone 1.2: Agent Tools**
- [ ] Define Zod schemas for all tool inputs
- [ ] Implement create_task, update_task, delete_task tools
- [ ] Implement list_tasks, get_task tools
- [ ] Implement complete_task tool
- [ ] Add task tools to ToolService
- [ ] Write integration tests for tools

**Milestone 1.3: System Prompt Integration**
- [ ] Implement getTaskContextForPrompt()
- [ ] Add task context to AIService.getVaultContext()
- [ ] Test token usage with 10, 50, 100 tasks
- [ ] Optimize prompt format to minimize tokens
- [ ] Test cache hit rates with task context

**Success Criteria:**
- Agent can create, list, and complete tasks
- Task context appears in system prompt
- Token budget stays under 500 tokens for task index

### Phase 2: Supplementary Materials (Week 3)

**Milestone 2.1: Material Storage**
- [ ] Implement add/remove material database operations
- [ ] Implement material loading in get_task tool
- [ ] Add size validation (50KB per material, 500KB total)
- [ ] Support note_reference type with lazy loading
- [ ] Write tests for material operations

**Milestone 2.2: Agent Tool Integration**
- [ ] Implement add_task_material tool
- [ ] Implement remove_task_material tool
- [ ] Test loading materials during task execution
- [ ] Verify note references resolve correctly

**Success Criteria:**
- Agent can attach and load supplementary materials
- Note references load on-demand
- Size limits enforced

### Phase 3: UI Components (Week 4-5)

**Milestone 3.1: Task Management View**
- [ ] Create TaskManagementView component
- [ ] Create TaskList component with filtering
- [ ] Create TaskDetail component
- [ ] Create TaskForm for create/edit
- [ ] Implement task-store.svelte.ts
- [ ] Add IPC handlers in main process
- [ ] Add routing to task management view

**Milestone 3.2: Conversation Start Integration**
- [ ] Create ConversationStartTaskPanel component
- [ ] Integrate with conversation start flow
- [ ] Implement click-to-execute functionality
- [ ] Test task visibility logic

**Milestone 3.3: Polish & UX**
- [ ] Add loading states
- [ ] Add error handling and user feedback
- [ ] Add confirmation dialogs for delete
- [ ] Add keyboard shortcuts
- [ ] Test responsive layout
- [ ] Add empty states

**Success Criteria:**
- Users can create/edit/delete tasks via UI
- Users can execute tasks by clicking
- UI updates when agent completes tasks

### Phase 4: Completion Tracking & History (Week 6)

**Milestone 4.1: Completion Recording**
- [ ] Implement completion history storage
- [ ] Update complete_task to record history
- [ ] Handle recurring vs one-time completion logic
- [ ] Test completion with metadata

**Milestone 4.2: History Display**
- [ ] Add completion history to TaskDetail component
- [ ] Show last completed time in task lists
- [ ] Add completion statistics (total, average frequency)
- [ ] Test history with many completions

**Success Criteria:**
- All task completions are recorded
- Users can view completion history
- Recurring tasks reset properly

### Phase 5: Testing & Documentation (Week 7)

**Milestone 5.1: Testing**
- [ ] Write unit tests for TaskManager (80% coverage)
- [ ] Write integration tests for agent tools
- [ ] Write E2E tests for UI workflows
- [ ] Test with multiple vaults
- [ ] Test migration from existing vault
- [ ] Performance test with 100+ tasks

**Milestone 5.2: Documentation**
- [ ] Update ARCHITECTURE.md with task system
- [ ] Create TASK-SYSTEM.md user guide
- [ ] Add JSDoc comments to all public APIs
- [ ] Create example tasks for onboarding
- [ ] Update system prompt docs

**Success Criteria:**
- All tests passing
- Documentation complete
- Example tasks ready for users

### Phase 6: Beta Release & Iteration (Week 8+)

**Milestone 6.1: Beta Testing**
- [ ] Deploy to beta users
- [ ] Monitor task creation patterns
- [ ] Collect feedback on agent proactiveness
- [ ] Track token usage in production
- [ ] Identify top use cases

**Milestone 6.2: Refinement**
- [ ] Adjust system prompt based on token usage
- [ ] Tune agent proactiveness settings
- [ ] Add most-requested features
- [ ] Fix bugs from beta feedback
- [ ] Optimize database queries

**Success Criteria:**
- Beta users create >5 tasks each
- <10% token overhead from task system
- Positive feedback on agent proactiveness

---

## Success Metrics

### Usage Metrics

- **Tasks Created:** Target 10+ tasks per active user after 1 month
- **Recurring Tasks:** >50% of tasks should be recurring
- **Task Executions:** Average 2+ executions per recurring task per period
- **Agent vs User Creation:** Target 30% agent-created tasks (shows discoverability)

### Performance Metrics

- **Token Usage:** Task context <500 tokens in system prompt
- **Cache Hit Rate:** >80% for task-inclusive prompts
- **Query Performance:** Task list queries <50ms
- **UI Responsiveness:** Task view loads <200ms

### Quality Metrics

- **Task Completion Rate:** >70% of one-time tasks marked complete
- **Recurring Adherence:** >60% of recurring tasks executed on schedule
- **Material Usage:** >40% of tasks include supplementary materials
- **Task Updates:** >30% of tasks updated after creation (shows refinement)

### User Satisfaction

- **Feature Adoption:** >50% of active users create at least 1 task
- **Repeat Usage:** >70% of task creators use feature weekly
- **Agent Proactiveness:** Positive feedback on task suggestions
- **Friction Points:** Identify and address top 3 pain points

---

## Open Questions

### Product Questions

1. **Agent Proactiveness Tuning:** How often should agents suggest due tasks without being annoying?
   - Option A: Suggest once per conversation if task is due
   - Option B: Suggest once per day per task
   - Option C: User-configurable per task ("remind me" vs "don't remind")

2. **Task Ownership:** Should tasks support multiple vaults or stay vault-scoped?
   - Current design: Vault-scoped
   - Alternative: System-wide tasks that work across vaults

3. **Task Templates:** Should we support task templates for common workflows?
   - Example: "Weekly Review Template" → instantiate with specific parameters
   - Adds complexity but improves discoverability

4. **Task Dependencies:** Should tasks be able to reference other tasks?
   - Example: "Monthly Archive" depends on "Weekly Reviews" being complete
   - Adds significant complexity

5. **Time Zones:** Should recurring tasks be timezone-aware?
   - Current design: No (runs based on system time)
   - Alternative: Store timezone with task, adjust for user's current location

### Technical Questions

6. **Material Loading Strategy:** Should note references be loaded eagerly or lazily?
   - Current design: Lazy (only when includeSupplementaryMaterials: true)
   - Alternative: Eager loading with caching

7. **Completion History Limits:** How many completions to keep?
   - Option A: Keep all (could grow indefinitely)
   - Option B: Keep last 100 per task
   - Option C: User-configurable retention policy

8. **Task Export/Import:** Should tasks be exportable/importable?
   - Use case: Share task definitions between users
   - Format: JSON, YAML, or custom format?

9. **Task Versioning:** Should we track versions of task descriptions?
   - Use case: Understand how instructions evolved
   - Implementation: Snapshot description on each update

10. **Performance at Scale:** What happens with 1000+ tasks?
    - Do we need pagination in UI?
    - Should system prompt only include subset?
    - What are query optimization requirements?

### Design Questions

11. **Task Naming Conflicts:** Can multiple tasks have the same name?
    - Current design: Yes (ID is unique, name is not)
    - Alternative: Enforce unique names per vault

12. **Status Transitions:** What state transitions are allowed?
    - Can completed → active (to reactivate)?
    - Can archived → active (to restore)?
    - Should we track state transition history?

13. **Bulk Operations:** Should users be able to bulk-edit tasks?
    - Example: Archive all completed tasks
    - Example: Pause all recurring tasks temporarily

14. **Task Search:** Should tasks be searchable by description content?
    - Adds FTS index for tasks
    - Increases complexity but improves discoverability

15. **Notifications:** Should system send notifications for due tasks?
    - In-app notifications?
    - System notifications?
    - Email reminders?

---

## Future Enhancements (Post-V1)

### Task Dependencies
- Define "depends on" relationships between tasks
- Block execution until dependencies complete
- Visualize dependency graph

### Task Templates
- Save tasks as templates
- Instantiate templates with parameters
- Share templates between users/vaults

### Advanced Scheduling
- Cron-like syntax for complex schedules
- "Every 2nd Monday" or "Last Friday of month"
- Timezone-aware scheduling

### Task Analytics
- Completion rate dashboards
- Time-to-complete tracking
- Task effectiveness metrics

### Collaborative Tasks
- Assign tasks to specific agents/users
- Task handoff between conversations
- Shared task pools for teams

### Task Chains
- Define multi-step workflows as task sequences
- Automatic progression to next task
- Conditional branching ("if X then task A, else task B")

### Integration APIs
- Webhook triggers for task completion
- External system integration (Zapier, etc.)
- Calendar sync for recurring tasks

### Smart Suggestions
- Agent suggests new tasks based on patterns
- "You've done X three times, should I create a task?"
- Learn from user behavior

---

## Appendix A: Example Tasks

### Example 1: Weekly Summary (Recurring)

```json
{
  "name": "Weekly Summary",
  "purpose": "Summarize week's daily notes into weekly note",
  "description": "1. Search for all daily notes from current week (Monday-Sunday)\n2. Extract key themes and events from each day\n3. Create weekly note with sections:\n   - Overview\n   - Key Themes  \n   - Accomplishments\n   - Challenges\n   - Next Week Planning\n4. Focus on patterns and insights, not just listing events\n5. Link to relevant daily notes for context",
  "recurringSpec": {
    "frequency": "weekly",
    "dayOfWeek": 0,
    "time": "18:00"
  },
  "supplementaryMaterials": [
    {
      "type": "text",
      "content": "# Weekly Note Template\n\n## Week of [Date Range]\n\n### Overview\n[2-3 sentence summary]\n\n### Key Themes\n- Theme 1\n- Theme 2\n\n### Accomplishments\n- Achievement 1\n- Achievement 2\n\n### Challenges\n- Challenge 1\n- Challenge 2\n\n### Next Week\n- Priority 1\n- Priority 2",
      "metadata": {
        "description": "Standard weekly note template"
      }
    }
  ]
}
```

### Example 2: Meeting Prep (Recurring Daily)

```json
{
  "name": "Meeting Prep",
  "purpose": "Review today's calendar and prepare meeting notes",
  "description": "1. Check daily note for scheduled meetings\n2. For each meeting:\n   - Search for related project/context notes\n   - Create meeting note with pre-populated agenda\n   - Add background links to relevant previous meetings\n   - Flag action items from last meeting with same attendees\n3. Add all meeting notes to today's daily note",
  "recurringSpec": {
    "frequency": "daily",
    "time": "08:00"
  },
  "supplementaryMaterials": [
    {
      "type": "note_reference",
      "noteId": "n-meeting-template",
      "metadata": {
        "description": "Meeting note template with standard sections"
      }
    }
  ]
}
```

### Example 3: Project Setup (On-Demand)

```json
{
  "name": "Project Setup",
  "purpose": "Create complete structure for new project",
  "description": "1. Create project note with metadata:\n   - status: \"planning\"\n   - timeline: ask user for start/end dates\n   - stakeholders: ask user\n2. Create related notes:\n   - Goals note\n   - Risks note\n   - Decisions log\n   - Resources note\n3. Set up hierarchy: project → goals, risks, decisions, resources\n4. Link to relevant existing context notes\n5. Create recurring task for weekly status updates\n6. Add project to active projects index note",
  "supplementaryMaterials": [
    {
      "type": "code",
      "content": "{\n  \"status\": \"planning\",\n  \"timeline\": {\n    \"start\": \"YYYY-MM-DD\",\n    \"end\": \"YYYY-MM-DD\"\n  },\n  \"stakeholders\": [],\n  \"priority\": \"medium\"\n}",
      "metadata": {
        "language": "json",
        "description": "Project metadata schema example"
      }
    },
    {
      "type": "note_reference",
      "noteId": "n-project-template",
      "metadata": {
        "description": "Project note template"
      }
    }
  ]
}
```

### Example 4: Monthly Archive (Recurring)

```json
{
  "name": "Monthly Archive",
  "purpose": "Archive completed items and organize vault",
  "description": "1. Find all notes with status=\"completed\" or status=\"done\"\n2. Move to archive folder with year/month structure\n3. Update monthly index note with:\n   - Key highlights from month\n   - Statistics: notes created, projects completed, top tags\n   - Links to archived projects\n4. Identify orphaned notes (no links in/out) for review\n5. Create next month's planning note with template",
  "recurringSpec": {
    "frequency": "monthly",
    "dayOfMonth": 1,
    "time": "09:00"
  },
  "supplementaryMaterials": [
    {
      "type": "text",
      "content": "Archive structure:\n/archive/\n  /2025/\n    /01-january/\n      /projects/\n      /meetings/\n      /daily/\n    /02-february/\n      ...",
      "metadata": {
        "description": "Archive folder structure"
      }
    }
  ]
}
```

### Example 5: Learning Review (Recurring)

```json
{
  "name": "Learning Review",
  "purpose": "Consolidate month's learning into key concepts",
  "description": "1. Find all notes tagged \"TIL\" or \"learning\" from past month\n2. Categorize by domain (technical, business, personal, etc.)\n3. Identify patterns and interconnections\n4. Create concept map linking related learnings\n5. Identify knowledge gaps to explore next month\n6. Generate monthly learning summary note with:\n   - Top 5 insights\n   - Connections between concepts\n   - Questions for deeper exploration",
  "recurringSpec": {
    "frequency": "monthly",
    "dayOfMonth": 28,
    "time": "19:00"
  }
}
```

---

## Appendix B: Task Tool Schemas

### create_task Schema

```typescript
const createTaskSchema = z.object({
  name: z.string()
    .min(1)
    .max(20)
    .describe('Short task name (1-20 characters, e.g., "Weekly Summary")'),

  purpose: z.string()
    .min(1)
    .max(100)
    .describe('One-sentence description of what this task accomplishes'),

  description: z.string()
    .min(1)
    .describe('Detailed step-by-step instructions for executing this task'),

  status: z.enum(['active', 'paused', 'completed', 'archived'])
    .optional()
    .default('active')
    .describe('Initial task status'),

  recurringSpec: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly'])
      .describe('How often this task should recur'),
    dayOfWeek: z.number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .describe('Day of week for weekly tasks (0=Sunday, 6=Saturday)'),
    dayOfMonth: z.number()
      .int()
      .min(1)
      .max(31)
      .optional()
      .describe('Day of month for monthly tasks (1-31)'),
    time: z.string()
      .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
      .optional()
      .describe('Time in HH:MM format (24-hour)')
  }).optional()
    .describe('Recurring schedule specification'),

  dueDate: z.string()
    .datetime()
    .optional()
    .describe('Due date for one-time tasks (ISO 8601 format)'),

  supplementaryMaterials: z.array(
    z.object({
      type: z.enum(['text', 'code', 'note_reference'])
        .describe('Type of supplementary material'),
      content: z.string()
        .optional()
        .describe('Material content (for text/code types)'),
      noteId: z.string()
        .optional()
        .describe('Note ID to reference (for note_reference type)'),
      metadata: z.record(z.unknown())
        .optional()
        .describe('Additional metadata (language for code, description, etc.)')
    })
  ).optional()
    .describe('Supplementary materials to help execute task')
});
```

### list_tasks Schema

```typescript
const listTasksSchema = z.object({
  status: z.enum(['active', 'paused', 'completed', 'archived', 'all'])
    .optional()
    .default('active')
    .describe('Filter by task status'),

  dueSoon: z.boolean()
    .optional()
    .describe('Only show tasks due in next 7 days'),

  recurringOnly: z.boolean()
    .optional()
    .describe('Only show recurring tasks'),

  overdueOnly: z.boolean()
    .optional()
    .describe('Only show overdue tasks'),

  sortBy: z.enum(['dueDate', 'created', 'name', 'lastCompleted'])
    .optional()
    .default('dueDate')
    .describe('Field to sort by'),

  sortOrder: z.enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe('Sort direction')
});
```

### complete_task Schema

```typescript
const completeTaskSchema = z.object({
  taskId: z.string()
    .describe('ID of task to mark as completed'),

  notes: z.string()
    .optional()
    .describe('Optional notes about this execution'),

  outputNoteId: z.string()
    .optional()
    .describe('ID of note created as result of task (if applicable)'),

  metadata: z.object({
    durationMs: z.number()
      .int()
      .optional()
      .describe('Time taken to execute task in milliseconds'),
    toolCallsCount: z.number()
      .int()
      .optional()
      .describe('Number of tool calls used during execution')
  }).optional()
    .describe('Execution metadata for tracking')
});
```

---

## Appendix C: Database Queries

### Get Tasks Due Now

```sql
-- Find tasks that should be executed now
SELECT
  t.id,
  t.name,
  t.purpose,
  t.status,
  t.recurring_spec,
  t.last_completed
FROM tasks t
WHERE t.vault_id = ?
  AND t.status = 'active'
  AND (
    -- One-time tasks with due date in past
    (t.recurring_spec IS NULL AND t.due_date IS NOT NULL AND t.due_date <= datetime('now'))
    OR
    -- Recurring tasks that haven't been completed recently enough
    (t.recurring_spec IS NOT NULL AND (
      -- Daily: last completed >24h ago
      (json_extract(t.recurring_spec, '$.frequency') = 'daily'
       AND (t.last_completed IS NULL OR datetime(t.last_completed, '+1 day') <= datetime('now')))
      OR
      -- Weekly: last completed >7d ago AND today is the scheduled day
      (json_extract(t.recurring_spec, '$.frequency') = 'weekly'
       AND (t.last_completed IS NULL OR datetime(t.last_completed, '+7 days') <= datetime('now'))
       AND CAST(strftime('%w', 'now') AS INTEGER) = json_extract(t.recurring_spec, '$.dayOfWeek'))
      OR
      -- Monthly: last completed >30d ago AND today is the scheduled day
      (json_extract(t.recurring_spec, '$.frequency') = 'monthly'
       AND (t.last_completed IS NULL OR datetime(t.last_completed, '+30 days') <= datetime('now'))
       AND CAST(strftime('%d', 'now') AS INTEGER) = json_extract(t.recurring_spec, '$.dayOfMonth'))
    ))
  )
ORDER BY
  CASE
    WHEN t.due_date IS NOT NULL THEN t.due_date
    ELSE t.last_completed
  END ASC;
```

### Get Task with Materials

```sql
-- Get full task details including supplementary materials
SELECT
  t.*,
  json_group_array(
    json_object(
      'id', m.id,
      'materialType', m.material_type,
      'content', m.content,
      'noteId', m.note_id,
      'metadata', json(m.metadata),
      'position', m.position
    )
  ) as supplementary_materials
FROM tasks t
LEFT JOIN task_supplementary_materials m ON m.task_id = t.id
WHERE t.id = ?
GROUP BY t.id;
```

### Record Task Completion

```sql
-- Insert completion record
INSERT INTO task_completion_history (
  id,
  task_id,
  completed_at,
  conversation_id,
  notes,
  output_note_id,
  metadata
) VALUES (?, ?, datetime('now'), ?, ?, ?, ?);

-- Update task's last_completed timestamp
UPDATE tasks
SET
  last_completed = datetime('now'),
  updated_at = datetime('now'),
  status = CASE
    WHEN recurring_spec IS NOT NULL THEN 'active'  -- Keep recurring tasks active
    ELSE 'completed'  -- Mark one-time tasks as completed
  END
WHERE id = ?;
```

### Get Completion History

```sql
-- Get recent completions for a task
SELECT
  ch.*,
  n.title as output_note_title,
  n.path as output_note_path
FROM task_completion_history ch
LEFT JOIN notes n ON n.id = ch.output_note_id
WHERE ch.task_id = ?
ORDER BY ch.completed_at DESC
LIMIT ?;
```

---

## Appendix D: Migration Script

```typescript
// Migration: 001_create_tasks_tables.ts

import { Database } from 'better-sqlite3';

export async function up(db: Database): Promise<void> {
  // Create tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(name) >= 1 AND length(name) <= 20),
      purpose TEXT NOT NULL CHECK(length(purpose) >= 1 AND length(purpose) <= 100),
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'archived')),
      vault_id TEXT NOT NULL,
      recurring_spec TEXT,
      due_date DATETIME,
      last_completed DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX idx_tasks_vault_status
      ON tasks(vault_id, status);

    CREATE INDEX idx_tasks_due_date
      ON tasks(due_date)
      WHERE due_date IS NOT NULL;

    CREATE INDEX idx_tasks_last_completed
      ON tasks(last_completed)
      WHERE last_completed IS NOT NULL;

    CREATE INDEX idx_tasks_vault_recurring
      ON tasks(vault_id, recurring_spec)
      WHERE recurring_spec IS NOT NULL;
  `);

  // Create supplementary materials table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_supplementary_materials (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      material_type TEXT NOT NULL
        CHECK (material_type IN ('text', 'code', 'note_reference')),
      content TEXT,
      note_id TEXT,
      metadata TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE INDEX idx_task_materials_task
      ON task_supplementary_materials(task_id, position);
  `);

  // Create completion history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_completion_history (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      conversation_id TEXT,
      notes TEXT,
      output_note_id TEXT,
      metadata TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (output_note_id) REFERENCES notes(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE INDEX idx_task_completion_task
      ON task_completion_history(task_id, completed_at DESC);

    CREATE INDEX idx_task_completion_conversation
      ON task_completion_history(conversation_id);
  `);

  // Create trigger to update updated_at
  db.exec(`
    CREATE TRIGGER update_tasks_timestamp
    AFTER UPDATE ON tasks
    FOR EACH ROW
    BEGIN
      UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  console.log('✓ Tasks tables created successfully');
}

export async function down(db: Database): Promise<void> {
  db.exec('DROP TRIGGER IF EXISTS update_tasks_timestamp');
  db.exec('DROP TABLE IF EXISTS task_completion_history');
  db.exec('DROP TABLE IF EXISTS task_supplementary_materials');
  db.exec('DROP TABLE IF EXISTS tasks');

  console.log('✓ Tasks tables dropped successfully');
}
```

---

**END OF DOCUMENT**
