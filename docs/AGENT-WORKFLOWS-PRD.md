# Agent Workflows - Product Requirements Document

**Document Status:** Draft
**Created:** 2025-10-20
**Author:** System Design
**Version:** 1.0

---

## Executive Summary

Agent Workflows enable collaborative workflow management between AI agents and users across conversation threads. Workflows are persistent data records containing instructions, context, and supplementary materials that agents can reference and execute. The system supports both one-time and recurring workflows, allowing users to define tasks that agents proactively manage over time.

**Core Value Proposition:** Enable users to teach agents persistent workflows that execute consistently across sessions, reducing repetitive instructions and enabling proactive assistance.

**Key Example:** A user creates a "Weekly Summary" workflow that runs every Sunday. The workflow contains detailed instructions for synthesizing the week's daily notes into a structured weekly note. Every Sunday, agents across all conversation threads are aware this workflow is due and can proactively offer to execute it.

---

## Goals and Non-Goals

### Goals

1. **Persistent Agent Knowledge:** Workflows provide durable context that survives across conversation threads
2. **Proactive Agent Behavior:** Agents can suggest workflows at appropriate times (due dates, recurring schedules)
3. **Collaborative Management:** Both users (via UI) and agents (via tools) can create and manage workflows
4. **Flexible Execution:** Workflows can be executed on-demand or on recurring schedules
5. **Rich Context:** Supplementary materials provide agents with examples, templates, and reference data
6. **Minimal Prompt Bloat:** Workflow awareness doesn't significantly increase token usage in system prompts

### Non-Goals

1. **Complex Scheduling:** No cron-like syntax or timezone-aware scheduling (initial version)
2. **Workflow Dependencies:** No "workflow A must complete before workflow B" logic (can be added later)
3. **External System Integration:** No calendar, email, or third-party task system sync
4. **Multi-user Collaboration:** Workflows are scoped to a vault, not shared across users
5. **Advanced Analytics:** No workflow completion statistics or performance tracking (v1)

---

## User Stories

### Core Workflows

**US-1: Create Recurring Workflow**
As a user, I want to create a weekly workflow for summarizing my notes, so that the agent can automatically perform this task every week.

**US-2: Agent Proactive Suggestion**
As a user, I want the agent to proactively notice when workflows are due and offer to execute them, so I don't have to remember routine tasks.

**US-3: Execute Workflow On-Demand**
As a user, I want to manually trigger a workflow execution even when it's not due, so I can run tasks whenever needed.

**US-4: View Workflow List**
As a user, I want to see all my active workflows in one place, so I can understand what automated tasks exist in my vault.

**US-5: Workflow with Supplementary Materials**
As a user, I want to attach templates, examples, and reference notes to a workflow, so the agent has everything needed to execute it correctly.

**US-6: Agent Creates Workflow**
As a user, I want to ask the agent to "set up a weekly review workflow" in natural language, and have it create the workflow with appropriate structure.

**US-7: Mark Workflow Complete**
As a user, I want the agent to mark a workflow as completed when executed, so I can track when recurring workflows last ran.

**US-8: Edit Workflow**
As a user, I want to update workflow instructions after trying them once, so I can refine tasks over time.

**US-9: Quick Workflow Execution from UI**
As a user, I want to click a workflow in the UI and have it send an execution message to the agent, so I can easily trigger tasks.

**US-10: Archive Completed Workflows**
As a user, I want to archive one-time workflows after completion, so my active workflow list stays focused.

**US-11: Transparent Backlog Discovery**
As a user, I want the agent to silently record issues it discovers while doing other work (broken links, inconsistencies, etc.) in a backlog, so I'm not interrupted but can review them later.

---

## Functional Requirements

### FR-1: Workflow Data Model

Each workflow must contain:

- **id** (string, immutable): Unique identifier in format `w-xxxxxxxx`
- **name** (string, 1-20 chars): Short, memorable name (e.g., "Weekly Summary"). Must be unique per vault.
- **purpose** (string, max 100 chars): One-sentence description of what the workflow accomplishes
- **description** (string, unlimited): Detailed step-by-step instructions for execution
- **status** (enum): `active`, `paused`, `completed`, `archived`
- **type** (enum): `workflow`, `backlog` (default: `workflow`)
- **vault_id** (string): Which vault this workflow belongs to
- **created_at** (datetime): When workflow was created
- **updated_at** (datetime): Last modification time

Optional fields:
- **recurring_spec** (object): Schedule information for recurring workflows
- **due_date** (datetime): One-time due date for non-recurring workflows
- **last_completed** (datetime): Most recent completion timestamp
- **supplementary_materials** (array): Attached context, templates, code snippets

**Workflow Type Semantics:**
- **workflow**: Intentional, structured workflows (weekly summaries, meeting prep, etc.). Primary use case. Shows in main workflow list.
- **backlog**: Items discovered opportunistically during other work (broken links, cleanup opportunities, agent suggestions). Shows in separate backlog view for later review.

### FR-2: Recurring Workflow Specification

Recurring workflows must support:

```typescript
interface RecurringSpec {
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;      // 0-6 for weekly (0=Sunday)
  dayOfMonth?: number;     // 1-31 for monthly
  time?: string;           // Optional "HH:MM" for specific time
}
```

**Scheduling Logic:**
- **Daily:** Workflow is due if 24+ hours have passed since last completion
- **Weekly:** Workflow is due if 7+ days have passed AND current day matches `dayOfWeek`
- **Monthly:** Workflow is due if 30+ days have passed AND current day matches `dayOfMonth`

### FR-3: Supplementary Materials

Workflows can include multiple supplementary materials:

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
- Total materials per workflow: 500KB max
- Note references: No limit (loaded on-demand)

### FR-4: Workflow Completion Tracking

Each workflow completion must be recorded:

```typescript
interface WorkflowCompletion {
  id: string;
  workflow_id: string;
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

For recurring workflows:
- Completion is recorded in history
- `last_completed` timestamp is updated
- Status remains `active` for future occurrences

For one-time workflows:
- Completion is recorded
- Status changes to `completed`
- Workflow can be manually re-activated or archived

### FR-5: System Prompt Injection

**Tier 1: Workflow Index (Always Injected)**

Lightweight summary added to vault context:

```markdown
## Available Workflows

### Due Now
- **Weekly Summary**: Summarize week's daily notes into weekly note (due every Sunday)
- **Meeting Prep**: Review today's meetings and create prep notes (due daily at 8am)

### Active Workflows
- **Project Setup**: Create complete structure for new project (on-demand)
- **Monthly Archive**: Archive completed items and organize vault (due 1st of month)

### Paused Workflows (2)
[Not listed in context to save tokens]

### Backlog Items (5)
[Not listed in context to save tokens - user can review separately]
```

**Token Budget:** Max 500 tokens for workflow index

**Agent Behavior Guidelines:**

When you discover issues during other work (broken links, inconsistencies, potential improvements, cleanup opportunities):
- Create workflows with `type='backlog'`
- Do NOT interrupt the user or mention these discoveries
- Silently record them for later review
- Continue with your primary task

The user can review backlog items later in a dedicated UI section.

**Tier 2: Workflow Details (Loaded On-Demand)**

Full workflow details only loaded when agent uses `get_workflow` tool:
- Complete description
- Supplementary materials
- Completion history (if requested)

### FR-6: Agent Tools

The following tools must be available to agents:

**create_workflow**
- Create new workflow with all fields
- Validate name length, purpose length
- Validate name is unique within vault (case-insensitive)
- Generate unique ID
- Return workflow ID and confirmation

**update_workflow**
- Modify any workflow field except `id`, `created_at`, `vault_id`
- Require workflow ID
- Validate name is unique within vault if changing name (case-insensitive)
- Support partial updates
- Return updated workflow

**delete_workflow**
- Soft delete (mark as `archived`)
- Require confirmation for workflows with completion history
- Return success confirmation

**list_workflows**
- Filter by status, recurring, due date
- Sort by due date, created date, name
- Return lightweight workflow list (name, purpose, status, due info)

**get_workflow**
- Retrieve full workflow details
- Optionally include supplementary materials
- Optionally include completion history
- Return complete workflow object

**complete_workflow**
- Mark workflow as completed
- Record completion in history
- Update `last_completed` timestamp
- Optionally attach notes and output note ID
- Handle recurring vs one-time logic
- Return completion record

**add_workflow_material**
- Add supplementary material to existing workflow
- Validate size limits
- Support all material types
- Return material ID

**remove_workflow_material**
- Remove supplementary material by ID
- Require confirmation
- Return success confirmation

### FR-7: UI Requirements

**Workflow Management View**

Primary interface for viewing and managing all workflows:

- **Tabs:**
  - **Workflows** (default): Shows `type='workflow'` workflows
  - **Backlog**: Shows `type='backlog'` workflows with count badge

- **List View:** Display workflows grouped by status
  - Columns: Name, Purpose, Type (recurring/one-time), Last Completed, Due Date/Schedule
  - Filters: Status (active/paused/completed/archived), Type (recurring/one-time)
  - Sort: Due date, created date, name, last completed
  - Search: Filter by name or purpose text

- **Workflow Detail Panel:** Show full workflow when selected
  - Display all fields including description
  - Show completion history (last 10 completions)
  - Show supplementary materials (expandable)
  - Actions: Edit, Execute, Pause/Resume, Archive, Delete
  - Backlog-specific actions: Promote to Workflow, Dismiss

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

Quick access to relevant workflows when starting new conversation:

- **Section 1: Workflows Due Now**
  - Show workflows that are currently due
  - Display: Name, purpose, last completed time
  - Click to send "Execute workflow: {name}" message to agent

- **Section 2: Upcoming Workflows**
  - Show workflows due in next 7 days
  - Display: Name, purpose, due date/schedule

- **Section 3: On-Demand Workflows**
  - Show active non-recurring workflows
  - Display: Name, purpose
  - Click to execute

- **View All Workflows** button → Opens Workflow Management View

**In-Conversation Workflow Indicators**

During conversation, show when agent mentions workflows:

- Highlight workflow names as clickable chips
- Tooltip shows workflow purpose on hover
- Click opens workflow detail panel

### FR-8: Workflow Execution Flow

**User-Initiated Execution:**

1. User clicks workflow in UI or says "do the weekly summary workflow"
2. UI/agent identifies workflow by name or ID
3. Agent calls `get_workflow` with `includeSupplementaryMaterials: true`
4. Agent follows description step-by-step
5. Agent calls `complete_workflow` when finished
6. Agent reports outcome to user

**Agent-Initiated Execution:**

1. Agent checks workflow index in system prompt
2. Agent notices workflow is due based on current date/time
3. Agent proactively suggests: "I notice your {workflow name} workflow is due. Would you like me to {purpose}?"
4. If user agrees, proceed with execution flow
5. If user declines, agent doesn't repeat suggestion for 24 hours

**Execution with Supplementary Materials:**

1. Agent loads workflow with materials
2. For `note_reference` type materials, agent loads referenced notes
3. For `text`/`code` materials, agent includes directly in context
4. Agent uses materials as templates, examples, or reference during execution

### FR-9: Error Handling

**Workflow Not Found:**
- Return clear error message with workflow ID
- Suggest using `list_workflows` to find available workflows

**Duplicate Workflow Name:**
- Return clear error when creating/updating workflow with name that already exists in vault
- Error message format: "A workflow named '{name}' already exists in this vault"
- Suggest choosing a different name or updating the existing workflow

**Invalid Recurring Spec:**
- Validate dayOfWeek (0-6), dayOfMonth (1-31)
- Validate frequency enum
- Return validation errors before saving

**Supplementary Material Too Large:**
- Reject materials >50KB with clear error
- Show current size and limit in error message

**Workflow Execution Failure:**
- Agent should report failure to user
- Do NOT mark workflow as completed
- Optionally create failure note in completion history

**Circular Workflow References:**
- If workflow description references itself, warn but allow
- If supplementary materials create infinite loop, prevent

### FR-10: Data Migration and Versioning

**Initial Migration:**
- Create `workflows` table
- Create `workflow_supplementary_materials` table
- Create `workflow_completion_history` table
- Create indexes
- Add version marker to migration system

**Backwards Compatibility:**
- Gracefully handle missing workflow tables (no workflows exist yet)
- Agent tools return empty lists if feature not enabled
- UI shows "coming soon" state if backend version too old

**Future Schema Changes:**
- Use migration system already in place
- Version workflow data structure
- Support migration of workflow format changes

---

## Technical Design

### Database Schema

```sql
-- Core workflows table
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,              -- w-xxxxxxxx format
  name TEXT NOT NULL,               -- 1-20 chars, unique per vault (case-insensitive)
  purpose TEXT NOT NULL,            -- Max 100 chars
  description TEXT NOT NULL,        -- Unlimited markdown
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  type TEXT NOT NULL DEFAULT 'workflow'
    CHECK (type IN ('workflow', 'backlog')),
  vault_id TEXT NOT NULL,

  -- Scheduling
  recurring_spec TEXT,              -- JSON: {frequency, dayOfWeek?, dayOfMonth?, time?}
  due_date DATETIME,                -- For one-time workflows
  last_completed DATETIME,          -- Most recent completion

  -- Metadata
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,

  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

-- Unique constraint on name per vault (case-insensitive)
CREATE UNIQUE INDEX idx_workflows_vault_name_unique ON workflows(vault_id, LOWER(name));

-- Indexes for common queries
CREATE INDEX idx_workflows_vault_status ON workflows(vault_id, status);
CREATE INDEX idx_workflows_vault_type ON workflows(vault_id, type);
CREATE INDEX idx_workflows_due_date ON workflows(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_workflows_last_completed ON workflows(last_completed) WHERE last_completed IS NOT NULL;
CREATE INDEX idx_workflows_vault_recurring ON workflows(vault_id, recurring_spec) WHERE recurring_spec IS NOT NULL;

-- Supplementary materials
CREATE TABLE workflow_supplementary_materials (
  id TEXT PRIMARY KEY,              -- Material ID
  workflow_id TEXT NOT NULL,
  material_type TEXT NOT NULL
    CHECK (material_type IN ('text', 'code', 'note_reference')),
  content TEXT,                     -- For text/code types
  note_id TEXT,                     -- For note_reference type
  metadata TEXT,                    -- JSON: {language?, description?, template_type?}
  position INTEGER NOT NULL DEFAULT 0,  -- Display order
  created_at DATETIME NOT NULL,

  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
);

CREATE INDEX idx_workflow_materials_workflow ON workflow_supplementary_materials(workflow_id, position);

-- Completion history
CREATE TABLE workflow_completion_history (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  completed_at DATETIME NOT NULL,
  conversation_id TEXT,
  notes TEXT,                       -- Agent's notes about execution
  output_note_id TEXT,              -- Note created as result
  metadata TEXT,                    -- JSON: {duration_ms?, tool_calls_count?}

  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (output_note_id) REFERENCES notes(id) ON DELETE SET NULL
);

CREATE INDEX idx_workflow_completion_workflow ON workflow_completion_history(workflow_id, completed_at DESC);
CREATE INDEX idx_workflow_completion_conversation ON workflow_completion_history(conversation_id);
```

### TypeScript Interfaces

```typescript
// Core workflow interface
interface Workflow {
  id: string;                       // w-xxxxxxxx
  name: string;                     // Max 20 chars
  purpose: string;                  // Max 100 chars
  description: string;              // Markdown
  status: WorkflowStatus;
  type: WorkflowType;
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
  completionHistory?: WorkflowCompletion[];
}

type WorkflowStatus = 'active' | 'paused' | 'completed' | 'archived';
type WorkflowType = 'workflow' | 'backlog';

interface RecurringSpec {
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;               // 0-6 (0=Sunday)
  dayOfMonth?: number;              // 1-31
  time?: string;                    // "HH:MM" format
}

interface SupplementaryMaterial {
  id: string;
  workflowId: string;
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

interface WorkflowCompletion {
  id: string;
  workflowId: string;
  completedAt: string;
  conversationId?: string;
  notes?: string;
  outputNoteId?: string;
  metadata?: {
    durationMs?: number;
    toolCallsCount?: number;
  };
}

// Lightweight workflow list item
interface WorkflowListItem {
  id: string;
  name: string;
  purpose: string;
  status: WorkflowStatus;
  type: WorkflowType;
  isRecurring: boolean;
  dueInfo?: {
    type: 'overdue' | 'due_now' | 'upcoming' | 'scheduled';
    dueDate?: string;
    recurringSchedule?: string;     // Human-readable: "Every Sunday"
  };
  lastCompleted?: string;
}

// Tool input/output types
interface CreateWorkflowInput {
  name: string;
  purpose: string;
  description: string;
  status?: WorkflowStatus;
  type?: WorkflowType;  // Default: 'workflow'
  recurringSpec?: RecurringSpec;
  dueDate?: string;
  supplementaryMaterials?: Array<{
    type: 'text' | 'code' | 'note_reference';
    content?: string;
    noteId?: string;
    metadata?: Record<string, unknown>;
  }>;
}

interface UpdateWorkflowInput {
  workflowId: string;
  name?: string;
  purpose?: string;
  description?: string;
  status?: WorkflowStatus;
  type?: WorkflowType;
  recurringSpec?: RecurringSpec | null;
  dueDate?: string | null;
}

interface CompleteWorkflowInput {
  workflowId: string;
  notes?: string;
  outputNoteId?: string;
  metadata?: {
    durationMs?: number;
    toolCallsCount?: number;
  };
}

interface ListWorkflowsInput {
  status?: WorkflowStatus | 'all';
  type?: WorkflowType | 'all';      // Filter by workflow type
  dueSoon?: boolean;                // Workflows due in next 7 days
  recurringOnly?: boolean;
  overdueOnly?: boolean;
  includeArchived?: boolean;
  sortBy?: 'dueDate' | 'created' | 'name' | 'lastCompleted';
  sortOrder?: 'asc' | 'desc';
}

interface GetWorkflowInput {
  workflowId: string;
  includeSupplementaryMaterials?: boolean;
  includeCompletionHistory?: boolean;
  completionHistoryLimit?: number;  // Default 10
}
```

### API Layer

**WorkflowManager Class:**

```typescript
class WorkflowManager {
  private db: DatabaseConnection;
  private workspace: Workspace;

  // Core CRUD
  async createWorkflow(vaultId: string, input: CreateWorkflowInput): Promise<Workflow>
  async getWorkflow(workflowId: string, options?: GetWorkflowInput): Promise<Workflow | null>
  async updateWorkflow(workflowId: string, input: UpdateWorkflowInput): Promise<Workflow>
  async deleteWorkflow(workflowId: string): Promise<void>  // Soft delete
  async listWorkflows(vaultId: string, input?: ListWorkflowsInput): Promise<WorkflowListItem[]>

  // Supplementary materials
  async addSupplementaryMaterial(workflowId: string, material: SupplementaryMaterial): Promise<string>
  async removeSupplementaryMaterial(materialId: string): Promise<void>
  async getSupplementaryMaterials(workflowId: string): Promise<SupplementaryMaterial[]>

  // Completion tracking
  async completeWorkflow(input: CompleteWorkflowInput): Promise<WorkflowCompletion>
  async getCompletionHistory(workflowId: string, limit?: number): Promise<WorkflowCompletion[]>

  // Scheduling helpers
  async getWorkflowsDueNow(vaultId: string): Promise<WorkflowListItem[]>
  async getUpcomingWorkflows(vaultId: string, daysAhead: number): Promise<WorkflowListItem[]>
  isWorkflowDue(workflow: Workflow, now?: Date): boolean

  // System prompt generation
  async getWorkflowContextForPrompt(vaultId: string): Promise<string>
}
```

**ToolService Integration:**

Add workflow tools to existing ToolService:

```typescript
// In ToolService.getTools()
const workflowTools = this.getWorkflowTools();
return {
  ...existingTools,
  ...workflowTools
};

private getWorkflowTools(): Record<string, Tool> {
  return {
    create_workflow: tool({
      description: 'Create a new workflow that persists across conversations',
      inputSchema: createWorkflowSchema,
      execute: async (input) => {
        const workflowManager = this.getWorkflowManager();
        const vault = await this.noteService.getCurrentVault();
        const workflow = await workflowManager.createWorkflow(vault.id, input);
        return {
          success: true,
          data: { workflowId: workflow.id, name: workflow.name },
          message: `Created workflow "${workflow.name}"`
        };
      }
    }),

    update_workflow: tool({ /* ... */ }),
    delete_workflow: tool({ /* ... */ }),
    list_workflows: tool({ /* ... */ }),
    get_workflow: tool({ /* ... */ }),
    complete_workflow: tool({ /* ... */ }),
    add_workflow_material: tool({ /* ... */ }),
    remove_workflow_material: tool({ /* ... */ })
  };
}
```

### System Prompt Integration

**In AIService.getVaultContext():**

```typescript
async getVaultContext(): Promise<string> {
  let context = await this.getBaseVaultContext();  // Existing logic

  // Add workflow context
  if (this.workflowManager) {
    const vault = await this.noteService.getCurrentVault();
    const workflowContext = await this.workflowManager.getWorkflowContextForPrompt(vault.id);

    if (workflowContext) {
      context += '\n\n' + workflowContext;
    }
  }

  return context;
}
```

**WorkflowManager.getWorkflowContextForPrompt():**

```typescript
async getWorkflowContextForPrompt(vaultId: string): Promise<string> {
  const dueNow = await this.getWorkflowsDueNow(vaultId);
  const upcoming = await this.getUpcomingWorkflows(vaultId, 7);
  const active = await this.listWorkflows(vaultId, {
    status: 'active',
    includeArchived: false
  });

  let context = '## Available Workflows\n\n';

  // Due now - highest priority
  if (dueNow.length > 0) {
    context += '### Due Now\n';
    for (const workflow of dueNow) {
      const schedule = workflow.dueInfo?.recurringSchedule || 'one-time workflow';
      context += `- **${workflow.name}**: ${workflow.purpose} (${schedule})\n`;
    }
    context += '\n';
  }

  // Upcoming in next 7 days
  if (upcoming.length > 0) {
    context += '### Upcoming (Next 7 Days)\n';
    for (const workflow of upcoming.slice(0, 5)) {  // Max 5 to save tokens
      context += `- **${workflow.name}**: ${workflow.purpose}\n`;
    }
    context += '\n';
  }

  // Other active on-demand workflows
  const onDemand = active.filter(w =>
    !w.isRecurring &&
    !dueNow.some(d => d.id === w.id) &&
    !upcoming.some(u => u.id === w.id)
  );

  if (onDemand.length > 0) {
    context += '### On-Demand Workflows\n';
    for (const workflow of onDemand.slice(0, 5)) {  // Max 5 to save tokens
      context += `- **${workflow.name}**: ${workflow.purpose}\n`;
    }
    context += '\n';
  }

  // Add tool hint
  context += '*Use `get_workflow` to load full details and `complete_workflow` when finished.*\n';

  return context;
}
```

### UI Components (Svelte 5)

**WorkflowManagementView.svelte:**

```svelte
<script lang="ts">
  import { workflowStore } from '../stores/workflow-store.svelte';
  import WorkflowList from './WorkflowList.svelte';
  import WorkflowDetail from './WorkflowDetail.svelte';
  import WorkflowForm from './WorkflowForm.svelte';

  let selectedWorkflowId = $state<string | null>(null);
  let showCreateForm = $state(false);
  let statusFilter = $state<WorkflowStatus | 'all'>('active');

  const filteredWorkflows = $derived(
    workflowStore.workflows.filter(w =>
      statusFilter === 'all' || w.status === statusFilter
    )
  );

  async function handleCreateWorkflow(workflowData: CreateWorkflowInput) {
    await workflowStore.createWorkflow(workflowData);
    showCreateForm = false;
  }

  async function handleExecuteWorkflow(workflowId: string) {
    // Send message to agent to execute workflow
    const workflow = workflowStore.getWorkflowById(workflowId);
    if (workflow) {
      await window.api.sendMessage(`Execute workflow: ${workflow.name}`);
    }
  }
</script>

<div class="workflow-management">
  <header>
    <h1>Workflows</h1>
    <button onclick={() => showCreateForm = true}>Create Workflow</button>
  </header>

  <div class="filters">
    <select bind:value={statusFilter}>
      <option value="all">All Workflows</option>
      <option value="active">Active</option>
      <option value="paused">Paused</option>
      <option value="completed">Completed</option>
      <option value="archived">Archived</option>
    </select>
  </div>

  <div class="content">
    <WorkflowList
      workflows={filteredWorkflows}
      selectedId={selectedWorkflowId}
      onSelect={(id) => selectedWorkflowId = id}
      onExecute={handleExecuteWorkflow}
    />

    {#if selectedWorkflowId}
      <WorkflowDetail
        workflowId={selectedWorkflowId}
        onClose={() => selectedWorkflowId = null}
        onExecute={handleExecuteWorkflow}
      />
    {/if}
  </div>

  {#if showCreateForm}
    <WorkflowForm
      onSubmit={handleCreateWorkflow}
      onCancel={() => showCreateForm = false}
    />
  {/if}
</div>
```

**ConversationStartWorkflowPanel.svelte:**

```svelte
<script lang="ts">
  import { workflowStore } from '../stores/workflow-store.svelte';

  const dueNow = $derived(workflowStore.workflowsDueNow);
  const upcoming = $derived(workflowStore.upcomingWorkflows);
  const onDemand = $derived(workflowStore.onDemandWorkflows);

  async function executeWorkflow(workflowId: string) {
    const workflow = workflowStore.getWorkflowById(workflowId);
    if (workflow) {
      await window.api.sendMessage(`Execute workflow: ${workflow.name}`);
    }
  }
</script>

<div class="conversation-start-workflows">
  {#if dueNow.length > 0}
    <section class="due-now">
      <h3>Workflows Due Now</h3>
      {#each dueNow as workflow}
        <button class="workflow-card due" onclick={() => executeWorkflow(workflow.id)}>
          <div class="workflow-name">{workflow.name}</div>
          <div class="workflow-purpose">{workflow.purpose}</div>
          {#if workflow.lastCompleted}
            <div class="last-completed">
              Last: {formatRelativeTime(workflow.lastCompleted)}
            </div>
          {/if}
        </button>
      {/each}
    </section>
  {/if}

  {#if upcoming.length > 0}
    <section class="upcoming">
      <h3>Upcoming Workflows</h3>
      {#each upcoming as workflow}
        <button class="workflow-card" onclick={() => executeWorkflow(workflow.id)}>
          <div class="workflow-name">{workflow.name}</div>
          <div class="workflow-purpose">{workflow.purpose}</div>
          <div class="due-date">{formatDueDate(workflow.dueInfo)}</div>
        </button>
      {/each}
    </section>
  {/if}

  {#if onDemand.length > 0}
    <section class="on-demand">
      <h3>On-Demand Workflows</h3>
      {#each onDemand.slice(0, 3) as workflow}
        <button class="workflow-card" onclick={() => executeWorkflow(workflow.id)}>
          <div class="workflow-name">{workflow.name}</div>
          <div class="workflow-purpose">{workflow.purpose}</div>
        </button>
      {/each}
    </section>
  {/if}

  <a href="/workflows" class="view-all">View All Workflows →</a>
</div>
```

**workflow-store.svelte.ts:**

```typescript
import { type Workflow, type WorkflowListItem } from '../types/workflow';

class WorkflowStore {
  workflows = $state<WorkflowListItem[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  workflowsDueNow = $derived(
    this.workflows.filter(w => w.dueInfo?.type === 'due_now')
  );

  upcomingWorkflows = $derived(
    this.workflows.filter(w => w.dueInfo?.type === 'upcoming')
  );

  onDemandWorkflows = $derived(
    this.workflows.filter(w => !w.isRecurring && !w.dueInfo)
  );

  async loadWorkflows() {
    this.loading = true;
    try {
      const result = await window.api.listWorkflows({ status: 'active' });
      this.workflows = result.workflows;
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  async createWorkflow(input: CreateWorkflowInput) {
    const result = await window.api.createWorkflow(input);
    await this.loadWorkflows();  // Refresh list
    return result.workflowId;
  }

  getWorkflowById(id: string): WorkflowListItem | undefined {
    return this.workflows.find(w => w.id === id);
  }

  // ... other methods
}

export const workflowStore = new WorkflowStore();
```

### IPC API

**In preload script:**

```typescript
// Add to contextBridge.exposeInMainWorld
api: {
  // ... existing methods

  // Workflow management
  createWorkflow: (input: CreateWorkflowInput) => ipcRenderer.invoke('workflow:create', input),
  updateWorkflow: (workflowId: string, input: UpdateWorkflowInput) =>
    ipcRenderer.invoke('workflow:update', workflowId, input),
  deleteWorkflow: (workflowId: string) => ipcRenderer.invoke('workflow:delete', workflowId),
  listWorkflows: (input?: ListWorkflowsInput) => ipcRenderer.invoke('workflow:list', input),
  getWorkflow: (workflowId: string, options?: GetWorkflowInput) =>
    ipcRenderer.invoke('workflow:get', workflowId, options),
  completeWorkflow: (input: CompleteWorkflowInput) =>
    ipcRenderer.invoke('workflow:complete', input),
  addWorkflowMaterial: (workflowId: string, material: SupplementaryMaterial) =>
    ipcRenderer.invoke('workflow:add-material', workflowId, material),
  removeWorkflowMaterial: (materialId: string) =>
    ipcRenderer.invoke('workflow:remove-material', materialId),
}
```

**In main process:**

```typescript
// Register IPC handlers
ipcMain.handle('workflow:create', async (event, input: CreateWorkflowInput) => {
  const workflowManager = getWorkflowManager();
  const vault = await noteService.getCurrentVault();
  return await workflowManager.createWorkflow(vault.id, input);
});

ipcMain.handle('workflow:list', async (event, input?: ListWorkflowsInput) => {
  const workflowManager = getWorkflowManager();
  const vault = await noteService.getCurrentVault();
  return await workflowManager.listWorkflows(vault.id, input);
});

// ... other handlers
```

---

## Implementation Plan

### Phase 1: Core Infrastructure

**Milestone 1.1: Database & Data Layer**
- [ ] Create migration script for workflow tables
- [ ] Implement WorkflowManager class with CRUD methods
- [ ] Write unit tests for WorkflowManager
- [ ] Add workflow ID generation (w-xxxxxxxx format)
- [ ] Implement recurring workflow scheduling logic
- [ ] Test migration on existing vault

**Milestone 1.2: Agent Tools**
- [ ] Define Zod schemas for all tool inputs
- [ ] Implement create_workflow, update_workflow, delete_workflow tools
- [ ] Implement list_workflows, get_workflow tools
- [ ] Implement complete_workflow tool
- [ ] Add workflow tools to ToolService
- [ ] Write integration tests for tools

**Milestone 1.3: System Prompt Integration**
- [ ] Implement getWorkflowContextForPrompt()
- [ ] Add workflow context to AIService.getVaultContext()
- [ ] Test token usage with 10, 50, 100 workflows
- [ ] Optimize prompt format to minimize tokens
- [ ] Test cache hit rates with workflow context

**Success Criteria:**
- Agent can create, list, and complete workflows
- Workflow context appears in system prompt
- Token budget stays under 500 tokens for workflow index

### Phase 2: Supplementary Materials

**Milestone 2.1: Material Storage**
- [ ] Implement add/remove material database operations
- [ ] Implement material loading in get_workflow tool
- [ ] Add size validation (50KB per material, 500KB total)
- [ ] Support note_reference type with lazy loading
- [ ] Write tests for material operations

**Milestone 2.2: Agent Tool Integration**
- [ ] Implement add_workflow_material tool
- [ ] Implement remove_workflow_material tool
- [ ] Test loading materials during workflow execution
- [ ] Verify note references resolve correctly

**Success Criteria:**
- Agent can attach and load supplementary materials
- Note references load on-demand
- Size limits enforced

### Phase 3: UI Components

**Milestone 3.1: Workflow Management View**
- [ ] Create WorkflowManagementView component
- [ ] Create WorkflowList component with filtering
- [ ] Create WorkflowDetail component
- [ ] Create WorkflowForm for create/edit
- [ ] Implement workflow-store.svelte.ts
- [ ] Add IPC handlers in main process
- [ ] Add routing to workflow management view

**Milestone 3.2: Conversation Start Integration**
- [ ] Create ConversationStartWorkflowPanel component
- [ ] Integrate with conversation start flow
- [ ] Implement click-to-execute functionality
- [ ] Test workflow visibility logic

**Milestone 3.3: Polish & UX**
- [ ] Add loading states
- [ ] Add error handling and user feedback
- [ ] Add confirmation dialogs for delete
- [ ] Add keyboard shortcuts
- [ ] Test responsive layout
- [ ] Add empty states

**Success Criteria:**
- Users can create/edit/delete workflows via UI
- Users can execute workflows by clicking
- UI updates when agent completes workflows

### Phase 4: Completion Tracking & History

**Milestone 4.1: Completion Recording**
- [ ] Implement completion history storage
- [ ] Update complete_workflow to record history
- [ ] Handle recurring vs one-time completion logic
- [ ] Test completion with metadata

**Milestone 4.2: History Display**
- [ ] Add completion history to WorkflowDetail component
- [ ] Show last completed time in workflow lists
- [ ] Add completion statistics (total, average frequency)
- [ ] Test history with many completions

**Success Criteria:**
- All workflow completions are recorded
- Users can view completion history
- Recurring workflows reset properly

### Phase 5: Testing & Documentation

**Milestone 5.1: Testing**
- [ ] Write unit tests for WorkflowManager (80% coverage)
- [ ] Write integration tests for agent tools
- [ ] Write E2E tests for UI workflows
- [ ] Test with multiple vaults
- [ ] Test migration from existing vault
- [ ] Performance test with 100+ workflows

**Milestone 5.2: Documentation**
- [ ] Update ARCHITECTURE.md with workflow system
- [ ] Create WORKFLOW-SYSTEM.md user guide
- [ ] Add JSDoc comments to all public APIs
- [ ] Create example workflows for onboarding
- [ ] Update system prompt docs

**Success Criteria:**
- All tests passing
- Documentation complete
- Example workflows ready for users

### Phase 6: Beta Release & Iteration

**Milestone 6.1: Beta Testing**
- [ ] Deploy to beta users
- [ ] Monitor workflow creation patterns
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
- Beta users create >5 workflows each
- <10% token overhead from workflow system
- Positive feedback on agent proactiveness

---

## Success Metrics

### Usage Metrics

- **Workflows Created:** Target 10+ workflows per active user after 1 month
- **Recurring Workflows:** >50% of workflows should be recurring
- **Workflow Executions:** Average 2+ executions per recurring workflow per period
- **Agent vs User Creation:** Target 30% agent-created workflows (shows discoverability)

### Performance Metrics

- **Token Usage:** Workflow context <500 tokens in system prompt
- **Cache Hit Rate:** >80% for workflow-inclusive prompts
- **Query Performance:** Workflow list queries <50ms
- **UI Responsiveness:** Workflow view loads <200ms

### Quality Metrics

- **Workflow Completion Rate:** >70% of one-time workflows marked complete
- **Recurring Adherence:** >60% of recurring workflows executed on schedule
- **Material Usage:** >40% of workflows include supplementary materials
- **Workflow Updates:** >30% of workflows updated after creation (shows refinement)

### User Satisfaction

- **Feature Adoption:** >50% of active users create at least 1 workflow
- **Repeat Usage:** >70% of workflow creators use feature weekly
- **Agent Proactiveness:** Positive feedback on workflow suggestions
- **Friction Points:** Identify and address top 3 pain points

---

## Open Questions

### Product Questions

1. **Agent Proactiveness Tuning:** How often should agents suggest due workflows without being annoying?
   - Option A: Suggest once per conversation if workflow is due
   - Option B: Suggest once per day per workflow
   - Option C: User-configurable per workflow ("remind me" vs "don't remind")

2. **Workflow Ownership:** Should workflows support multiple vaults or stay vault-scoped?
   - Current design: Vault-scoped
   - Alternative: System-wide workflows that work across vaults

3. **Workflow Templates:** Should we support workflow templates for common patterns?
   - Example: "Weekly Review Template" → instantiate with specific parameters
   - Adds complexity but improves discoverability

4. **Workflow Dependencies:** Should workflows be able to reference other workflows?
   - Example: "Monthly Archive" depends on "Weekly Reviews" being complete
   - Adds significant complexity

5. **Time Zones:** Should recurring workflows be timezone-aware?
   - Current design: No (runs based on system time)
   - Alternative: Store timezone with workflow, adjust for user's current location

### Technical Questions

6. **Material Loading Strategy:** Should note references be loaded eagerly or lazily?
   - Current design: Lazy (only when includeSupplementaryMaterials: true)
   - Alternative: Eager loading with caching

7. **Completion History Limits:** How many completions to keep?
   - Option A: Keep all (could grow indefinitely)
   - Option B: Keep last 100 per workflow
   - Option C: User-configurable retention policy

8. **Workflow Export/Import:** Should workflows be exportable/importable?
   - Use case: Share workflow definitions between users
   - Format: JSON, YAML, or custom format?

9. **Workflow Versioning:** Should we track versions of workflow descriptions?
   - Use case: Understand how instructions evolved
   - Implementation: Snapshot description on each update

10. **Performance at Scale:** What happens with 1000+ workflows?
    - Do we need pagination in UI?
    - Should system prompt only include subset?
    - What are query optimization requirements?

### Design Questions

11. **Workflow Naming Conflicts:** ~~Can multiple workflows have the same name?~~
    - **RESOLVED:** Enforce unique names per vault (case-insensitive)
    - Rationale: Improves clarity when referencing workflows by name in conversation and reduces confusion in UI

12. **Status Transitions:** What state transitions are allowed?
    - Can completed → active (to reactivate)?
    - Can archived → active (to restore)?
    - Should we track state transition history?

13. **Bulk Operations:** Should users be able to bulk-edit workflows?
    - Example: Archive all completed workflows
    - Example: Pause all recurring workflows temporarily

14. **Workflow Search:** Should workflows be searchable by description content?
    - Adds FTS index for workflows
    - Increases complexity but improves discoverability

15. **Notifications:** Should system send notifications for due workflows?
    - In-app notifications?
    - System notifications?
    - Email reminders?

---

## Future Enhancements (Post-V1)

### Extended Workflow Types
Beyond the initial two-type system (`workflow` and `backlog`), consider adding more granular types:

```typescript
type WorkflowType =
  | 'workflow'      // V1: Intentional, structured workflows
  | 'backlog'       // V1: Discovered items and suggestions
  | 'maintenance'   // Future: Cleanup, housekeeping, optimization
  | 'suggestion';   // Future: Agent-proposed, awaiting user approval
```

**Benefits:**
- `maintenance`: Separate cleanup workflows from discovered issues
- `suggestion`: Agent can propose workflows requiring explicit user approval before becoming active
- Better organization and filtering in UI

**Implementation:**
- Update CHECK constraint in database
- Add UI sections for each type
- System prompt guidance for when to use each type

### Workflow Dependencies
- Define "depends on" relationships between workflows
- Block execution until dependencies complete
- Visualize dependency graph

### Workflow Templates
- Save workflows as templates
- Instantiate templates with parameters
- Share templates between users/vaults

### Advanced Scheduling
- Cron-like syntax for complex schedules
- "Every 2nd Monday" or "Last Friday of month"
- Timezone-aware scheduling

### Workflow Analytics
- Completion rate dashboards
- Time-to-complete tracking
- Workflow effectiveness metrics

### Collaborative Workflows
- Assign workflows to specific agents/users
- Workflow handoff between conversations
- Shared workflow pools for teams

### Workflow Chains
- Define multi-step workflows as sequences
- Automatic progression to next workflow
- Conditional branching ("if X then workflow A, else workflow B")

### Integration APIs
- Webhook triggers for workflow completion
- External system integration (Zapier, etc.)
- Calendar sync for recurring workflows

### Smart Suggestions
- Agent suggests new workflows based on patterns
- "You've done X three times, should I create a workflow?"
- Learn from user behavior

---

## Appendix A: Example Workflows

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

### Example 6: Fix Broken Links (Backlog - Discovered)

```json
{
  "name": "Fix Broken Links",
  "purpose": "Repair 5 broken note references found in daily notes",
  "type": "backlog",
  "description": "Discovered broken links while summarizing daily notes:\n\n1. Oct 15 daily note:\n   - Link to 'Project Alpha Planning' note (deleted)\n   - Should link to 'Project Alpha/Overview' instead\n\n2. Oct 17 daily note:\n   - Two links to 'Meeting Notes - Q3 Review' (moved)\n   - Now located at 'Archive/2024/Q3/Meeting Notes'\n\n3. Oct 19 daily note:\n   - Link to 'Team Contact Info' (renamed)\n   - New name: 'Team Directory'\n\nFix all references or archive old links with context notes.",
  "supplementaryMaterials": [
    {
      "type": "note_reference",
      "noteId": "n-daily-2024-10-15",
      "metadata": {
        "description": "Daily note with first broken link"
      }
    },
    {
      "type": "note_reference",
      "noteId": "n-daily-2024-10-17",
      "metadata": {
        "description": "Daily note with moved meeting notes links"
      }
    },
    {
      "type": "note_reference",
      "noteId": "n-daily-2024-10-19",
      "metadata": {
        "description": "Daily note with renamed contact info link"
      }
    }
  ]
}
```

**Note:** This task was created silently while the agent was summarizing weekly notes. The user wasn't interrupted but can review and handle it later from the backlog view.

---

## Appendix B: Workflow Tool Schemas

### create_workflow Schema

```typescript
const createWorkflowSchema = z.object({
  name: z.string()
    .min(1)
    .max(20)
    .describe('Short workflow name (1-20 characters, e.g., "Weekly Summary")'),

  purpose: z.string()
    .min(1)
    .max(100)
    .describe('One-sentence description of what this workflow accomplishes'),

  description: z.string()
    .min(1)
    .describe('Detailed step-by-step instructions for executing this workflow'),

  status: z.enum(['active', 'paused', 'completed', 'archived'])
    .optional()
    .default('active')
    .describe('Initial workflow status'),

  type: z.enum(['workflow', 'backlog'])
    .optional()
    .default('workflow')
    .describe('Workflow type: "workflow" for intentional workflows, "backlog" for discovered items'),

  recurringSpec: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly'])
      .describe('How often this workflow should recur'),
    dayOfWeek: z.number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .describe('Day of week for weekly workflows (0=Sunday, 6=Saturday)'),
    dayOfMonth: z.number()
      .int()
      .min(1)
      .max(31)
      .optional()
      .describe('Day of month for monthly workflows (1-31)'),
    time: z.string()
      .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
      .optional()
      .describe('Time in HH:MM format (24-hour)')
  }).optional()
    .describe('Recurring schedule specification'),

  dueDate: z.string()
    .datetime()
    .optional()
    .describe('Due date for one-time workflows (ISO 8601 format)'),

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
    .describe('Supplementary materials to help execute workflow')
});
```

### list_workflows Schema

```typescript
const listWorkflowsSchema = z.object({
  status: z.enum(['active', 'paused', 'completed', 'archived', 'all'])
    .optional()
    .default('active')
    .describe('Filter by workflow status'),

  type: z.enum(['workflow', 'backlog', 'all'])
    .optional()
    .default('all')
    .describe('Filter by workflow type'),

  dueSoon: z.boolean()
    .optional()
    .describe('Only show workflows due in next 7 days'),

  recurringOnly: z.boolean()
    .optional()
    .describe('Only show recurring workflows'),

  overdueOnly: z.boolean()
    .optional()
    .describe('Only show overdue workflows'),

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

### complete_workflow Schema

```typescript
const completeWorkflowSchema = z.object({
  workflowId: z.string()
    .describe('ID of workflow to mark as completed'),

  notes: z.string()
    .optional()
    .describe('Optional notes about this execution'),

  outputNoteId: z.string()
    .optional()
    .describe('ID of note created as result of workflow (if applicable)'),

  metadata: z.object({
    durationMs: z.number()
      .int()
      .optional()
      .describe('Time taken to execute workflow in milliseconds'),
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

### Get Workflows Due Now

```sql
-- Find workflows that should be executed now
SELECT
  w.id,
  w.name,
  w.purpose,
  w.status,
  w.recurring_spec,
  w.last_completed
FROM workflows w
WHERE w.vault_id = ?
  AND w.status = 'active'
  AND (
    -- One-time workflows with due date in past
    (w.recurring_spec IS NULL AND w.due_date IS NOT NULL AND w.due_date <= datetime('now'))
    OR
    -- Recurring workflows that haven't been completed recently enough
    (w.recurring_spec IS NOT NULL AND (
      -- Daily: last completed >24h ago
      (json_extract(w.recurring_spec, '$.frequency') = 'daily'
       AND (w.last_completed IS NULL OR datetime(w.last_completed, '+1 day') <= datetime('now')))
      OR
      -- Weekly: last completed >7d ago AND today is the scheduled day
      (json_extract(w.recurring_spec, '$.frequency') = 'weekly'
       AND (w.last_completed IS NULL OR datetime(w.last_completed, '+7 days') <= datetime('now'))
       AND CAST(strftime('%w', 'now') AS INTEGER) = json_extract(w.recurring_spec, '$.dayOfWeek'))
      OR
      -- Monthly: last completed >30d ago AND today is the scheduled day
      (json_extract(w.recurring_spec, '$.frequency') = 'monthly'
       AND (w.last_completed IS NULL OR datetime(w.last_completed, '+30 days') <= datetime('now'))
       AND CAST(strftime('%d', 'now') AS INTEGER) = json_extract(w.recurring_spec, '$.dayOfMonth'))
    ))
  )
ORDER BY
  CASE
    WHEN w.due_date IS NOT NULL THEN w.due_date
    ELSE w.last_completed
  END ASC;
```

### Get Workflow with Materials

```sql
-- Get full workflow details including supplementary materials
SELECT
  w.*,
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
FROM workflows w
LEFT JOIN workflow_supplementary_materials m ON m.workflow_id = w.id
WHERE w.id = ?
GROUP BY w.id;
```

### Record Workflow Completion

```sql
-- Insert completion record
INSERT INTO workflow_completion_history (
  id,
  workflow_id,
  completed_at,
  conversation_id,
  notes,
  output_note_id,
  metadata
) VALUES (?, ?, datetime('now'), ?, ?, ?, ?);

-- Update workflow's last_completed timestamp
UPDATE workflows
SET
  last_completed = datetime('now'),
  updated_at = datetime('now'),
  status = CASE
    WHEN recurring_spec IS NOT NULL THEN 'active'  -- Keep recurring workflows active
    ELSE 'completed'  -- Mark one-time workflows as completed
  END
WHERE id = ?;
```

### Get Completion History

```sql
-- Get recent completions for a workflow
SELECT
  ch.*,
  n.title as output_note_title,
  n.path as output_note_path
FROM workflow_completion_history ch
LEFT JOIN notes n ON n.id = ch.output_note_id
WHERE ch.workflow_id = ?
ORDER BY ch.completed_at DESC
LIMIT ?;
```

---

## Appendix D: Migration Script

```typescript
// Migration: 001_create_workflows_tables.ts

import { Database } from 'better-sqlite3';

export async function up(db: Database): Promise<void> {
  // Create workflows table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK(length(name) >= 1 AND length(name) <= 20),
      purpose TEXT NOT NULL CHECK(length(purpose) >= 1 AND length(purpose) <= 100),
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'archived')),
      type TEXT NOT NULL DEFAULT 'workflow'
        CHECK (type IN ('workflow', 'backlog')),
      vault_id TEXT NOT NULL,
      recurring_spec TEXT,
      due_date DATETIME,
      last_completed DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
    )
  `);

  // Create unique constraint on name per vault (case-insensitive)
  db.exec(`
    CREATE UNIQUE INDEX idx_workflows_vault_name_unique
      ON workflows(vault_id, LOWER(name));
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX idx_workflows_vault_status
      ON workflows(vault_id, status);

    CREATE INDEX idx_workflows_vault_type
      ON workflows(vault_id, type);

    CREATE INDEX idx_workflows_due_date
      ON workflows(due_date)
      WHERE due_date IS NOT NULL;

    CREATE INDEX idx_workflows_last_completed
      ON workflows(last_completed)
      WHERE last_completed IS NOT NULL;

    CREATE INDEX idx_workflows_vault_recurring
      ON workflows(vault_id, recurring_spec)
      WHERE recurring_spec IS NOT NULL;
  `);

  // Create supplementary materials table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_supplementary_materials (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      material_type TEXT NOT NULL
        CHECK (material_type IN ('text', 'code', 'note_reference')),
      content TEXT,
      note_id TEXT,
      metadata TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE INDEX idx_workflow_materials_workflow
      ON workflow_supplementary_materials(workflow_id, position);
  `);

  // Create completion history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_completion_history (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      conversation_id TEXT,
      notes TEXT,
      output_note_id TEXT,
      metadata TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (output_note_id) REFERENCES notes(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE INDEX idx_workflow_completion_workflow
      ON workflow_completion_history(workflow_id, completed_at DESC);

    CREATE INDEX idx_workflow_completion_conversation
      ON workflow_completion_history(conversation_id);
  `);

  // Create trigger to update updated_at
  db.exec(`
    CREATE TRIGGER update_workflows_timestamp
    AFTER UPDATE ON workflows
    FOR EACH ROW
    BEGIN
      UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  console.log('✓ Workflows tables created successfully');
}

export async function down(db: Database): Promise<void> {
  db.exec('DROP TRIGGER IF EXISTS update_workflows_timestamp');
  db.exec('DROP TABLE IF EXISTS workflow_completion_history');
  db.exec('DROP TABLE IF EXISTS workflow_supplementary_materials');
  db.exec('DROP TABLE IF EXISTS workflows');

  console.log('✓ Workflows tables dropped successfully');
}
```

---

**END OF DOCUMENT**
