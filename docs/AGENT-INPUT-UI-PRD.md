# Agent Input UI - Product Requirements Document

## Overview

This PRD defines a system for allowing AI agents to request and gather structured input from users during workflow execution and conversational interactions. The system enables agents to pause execution, present custom UI elements (buttons, selections, forms), and resume with user-provided data.

## Motivation

Currently, agents in Flint operate autonomously without the ability to request user input during execution. This limits their usefulness for:

- **Confirmations**: Getting approval before destructive actions (delete, archive, modify)
- **Selections**: Choosing from multiple valid options (which notes to include, which categories to use)
- **Data gathering**: Collecting additional information needed to complete a task (tags, titles, descriptions)
- **Disambiguation**: Resolving ambiguous requests (multiple notes with same name, unclear references)

By adding structured input capabilities, agents can:
1. Make safer decisions with explicit user approval
2. Handle ambiguous scenarios gracefully
3. Gather context dynamically instead of requiring everything upfront
4. Provide better user control and transparency

## Goals

### Primary Goals
- ✅ Enable agents to request structured input during execution via tool calls
- ✅ Provide rich UI components for different input types (confirm, select, text, etc.)
- ✅ Support both ad-hoc chat interactions and pre-declared workflow inputs
- ✅ Maintain conversation flow and context after input is provided
- ✅ Ensure input requests are cancelable and have reasonable timeouts

### Secondary Goals
- ✅ Support conditional inputs (show input B only if input A has specific value)
- ✅ Provide validation and error handling for user inputs
- ✅ Allow workflows to declare required inputs upfront
- ✅ Track input requests in conversation history for context

### Non-Goals
- ❌ Real-time collaboration (multiple users providing input simultaneously)
- ❌ Complex form builders or visual form designers
- ❌ Integration with external form systems (Google Forms, Typeform, etc.)
- ❌ File uploads or media selection (future enhancement)
- ❌ Complex validation logic (regex patterns only, no custom validators initially)

## User Scenarios

### Scenario 1: Confirmation Before Destructive Action

**Context**: User asks agent to "clean up old notes"

**Flow**:
```
User: "Clean up my old notes from last year"

Agent: "I found 47 notes from 2024 that haven't been modified in 6+ months.
       Would you like me to archive them?"

[UI shows confirm dialog with preview of notes]

User: [Clicks "Yes, archive"]

Agent: "Archiving 47 notes... Done. Created backup note with list of
       archived notes at notes/backup-2025-01-15.md"
```

### Scenario 2: Multi-Select from Options

**Context**: User wants to export specific categories

**Flow**:
```
User: "Export my notes to markdown"

Agent: "I can export notes from the following categories.
       Which would you like to include?"

[UI shows checkbox list]:
☑ Work (234 notes)
☑ Personal (156 notes)
☐ Archive (892 notes)
☑ Projects (67 notes)

User: [Selects Work, Personal, Projects]

Agent: "Exporting 457 notes from 3 categories...
       Created export at ~/Documents/flint-export-2025-01-15/"
```

### Scenario 3: Text Input for Missing Information

**Context**: Agent needs a title for a generated note

**Flow**:
```
User: "Summarize my meeting notes from today"

Agent: "I've created a summary of 3 meeting notes.
       What title should I use for the summary note?"

[UI shows text input with suggestion]:
Default: "Meeting Summary - January 15, 2025"

User: [Types "Q1 Planning Meeting Summary"]

Agent: "Created note: 'Q1 Planning Meeting Summary'
       at notes/summaries/q1-planning-meeting-summary.md"
```

### Scenario 4: Workflow with Pre-Declared Inputs

**Context**: Weekly review workflow that needs user preferences

**Flow**:
```
User: "Run workflow: weekly-review"

[Before execution starts, UI shows input form]:

Weekly Review Inputs:
━━━━━━━━━━━━━━━━━━━━━
📋 Which areas should I focus on?
☑ Completed tasks
☑ Upcoming deadlines
☐ Unprocessed notes
☑ Project progress

📊 Include statistics?
⚪ Yes, detailed
⦿ Yes, summary only
⚪ No

[User fills form and clicks "Start Review"]

Agent: "Starting weekly review with focus on completed tasks,
       upcoming deadlines, and project progress..."
```

### Scenario 5: Disambiguation

**Context**: Multiple notes match a reference

**Flow**:
```
User: "Update the design document"

Agent: "I found 3 notes matching 'design document':
       Which one should I update?"

[UI shows radio selection]:
⚪ App Design Document (updated 2 days ago)
⚪ Database Design Document (updated 1 week ago)
⚪ Design Document Template (updated 3 months ago)

User: [Selects "App Design Document"]

Agent: "Updating App Design Document..."
```

## Technical Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ AgentInputModal.svelte (Modal dialogs)              │   │
│  │ AgentInputInline.svelte (Inline chat inputs)        │   │
│  │ WorkflowInputForm.svelte (Pre-execution forms)      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ▲ │
                            │ │ IPC Events
                            │ │ - ai-request-input
                            │ └── submit-agent-input
                            │
┌─────────────────────────────────────────────────────────────┐
│                    Main Process Layer                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ InputRequestManager (Manages pending requests)      │   │
│  │ - createInputRequest()                              │   │
│  │ - resolveInputRequest()                             │   │
│  │ - timeoutInputRequest()                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                            ▲                                 │
│                            │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ToolService (request_user_input tool)               │   │
│  │ - Calls InputRequestManager                         │   │
│  │ - Returns Promise that resolves with user response  │   │
│  └─────────────────────────────────────────────────────┘   │
│                            ▲                                 │
│                            │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ AIService (Orchestrates agent execution)            │   │
│  │ - Detects input tool calls                          │   │
│  │ - Pauses stream until input received                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### 1. Agent Requests Input (Tool-Based)

```typescript
// Agent calls tool during execution
{
  "tool": "request_user_input",
  "arguments": {
    "prompt": "Should I archive these notes?",
    "inputType": "confirm",
    "description": "47 notes will be moved to archive folder"
  }
}
```

#### 2. Tool Execution Creates Request

```typescript
// ToolService.execute('request_user_input')
const requestId = generateId('input-req');
const request: InputRequest = {
  requestId,
  conversationId,
  timestamp: new Date().toISOString(),
  config: toolArgs,
  status: 'pending'
};

// Store request and create promise
const promise = new Promise((resolve, reject) => {
  inputRequestManager.register(requestId, resolve, reject);
});

// Emit to renderer
window.webContents.send('ai-request-input', request);

// Wait for user response (blocks tool execution)
const response = await promise;
return response;
```

#### 3. UI Renders Input Component

```typescript
// Renderer receives event
window.api.onAgentInputRequest((request) => {
  // Show modal or inline component based on config
  const modal = new AgentInputModal({
    target: document.body,
    props: {
      config: request.config,
      onSubmit: async (value) => {
        await window.api.submitAgentInput(request.requestId, {
          value,
          canceled: false
        });
        modal.$destroy();
      },
      onCancel: async () => {
        await window.api.submitAgentInput(request.requestId, {
          value: null,
          canceled: true
        });
        modal.$destroy();
      }
    }
  });
});
```

#### 4. User Response Returns to Tool

```typescript
// Main process receives response
ipcMain.handle('submit-agent-input', (event, requestId, response) => {
  inputRequestManager.resolve(requestId, response);
  return { success: true };
});

// Tool execution resumes
// AIService continues with tool result
{
  "tool": "request_user_input",
  "result": {
    "value": true,
    "canceled": false,
    "timestamp": "2025-01-15T10:30:00Z"
  }
}

// Agent continues execution
"User confirmed. Archiving 47 notes..."
```

### Workflow Pre-Declared Inputs

For workflows that know their inputs upfront:

```typescript
// Workflow definition includes inputs
interface Workflow {
  // ... existing fields
  inputRequirements?: AgentInputConfig[];
}

// Example workflow with inputs
{
  id: "w-weekly-review",
  name: "weekly-review",
  inputRequirements: [
    {
      id: "focus_areas",
      prompt: "Which areas should I focus on?",
      inputType: "multiselect",
      options: [
        { value: "completed", label: "Completed tasks" },
        { value: "upcoming", label: "Upcoming deadlines" },
        { value: "unprocessed", label: "Unprocessed notes" },
        { value: "projects", label: "Project progress" }
      ],
      defaultValue: ["completed", "upcoming"],
      validation: { required: true }
    },
    {
      id: "include_stats",
      prompt: "Include statistics?",
      inputType: "select",
      options: [
        { value: "detailed", label: "Yes, detailed" },
        { value: "summary", label: "Yes, summary only" },
        { value: "none", label: "No" }
      ],
      defaultValue: "summary"
    }
  ]
}

// When workflow executes
async function executeWorkflow(workflowId: string) {
  const workflow = await workflowService.get(workflowId);

  let userInputs = {};

  // Gather inputs if declared
  if (workflow.inputRequirements?.length) {
    // Show input form to user
    userInputs = await showWorkflowInputForm(workflow.inputRequirements);
  }

  // Add inputs to agent context
  const systemMessage = `
You are executing the workflow: ${workflow.name}

Purpose: ${workflow.purpose}

${workflow.description}

${workflow.inputRequirements ? `
User provided the following inputs:
${JSON.stringify(userInputs, null, 2)}

Use these inputs to guide your execution.
` : ''}

${workflow.supplementaryMaterials ? `
Supplementary materials:
${formatMaterials(workflow.supplementaryMaterials)}
` : ''}
`;

  // Start agent with context
  await aiService.streamText({
    conversationId: generateId('conv'),
    messages: [{ role: 'system', content: systemMessage }],
    onChunk: handleStreamChunk,
    // ...
  });
}
```

## Input Types Specification

### 1. Confirm (Boolean)

**Use case**: Yes/No questions, confirmations, approvals

```typescript
{
  inputType: 'confirm',
  prompt: 'Delete 5 notes?',
  description: 'This action cannot be undone',
  defaultValue: false,
  cancelable: true
}
```

**UI**:
```
┌─────────────────────────────────┐
│  Delete 5 notes?                │
│  This action cannot be undone   │
│                                 │
│  [Yes, delete]  [Cancel]        │
└─────────────────────────────────┘
```

**Return value**: `{ value: true }` or `{ value: false, canceled: true }`

### 2. Select (Single Choice)

**Use case**: Choose one option from a list

```typescript
{
  inputType: 'select',
  prompt: 'Which note should I update?',
  options: [
    {
      value: 'note-1',
      label: 'App Design Document',
      description: 'Updated 2 days ago'
    },
    {
      value: 'note-2',
      label: 'Database Design',
      description: 'Updated 1 week ago'
    }
  ],
  validation: { required: true }
}
```

**UI**:
```
┌─────────────────────────────────┐
│  Which note should I update?    │
│                                 │
│  ⦿ App Design Document          │
│    Updated 2 days ago           │
│                                 │
│  ⚪ Database Design              │
│    Updated 1 week ago           │
│                                 │
│  [Submit]                       │
└─────────────────────────────────┘
```

**Return value**: `{ value: 'note-1' }`

### 3. Multi-Select (Multiple Choices)

**Use case**: Choose multiple options from a list

```typescript
{
  inputType: 'multiselect',
  prompt: 'Select categories to export',
  options: [
    { value: 'work', label: 'Work (234 notes)' },
    { value: 'personal', label: 'Personal (156 notes)' },
    { value: 'archive', label: 'Archive (892 notes)' }
  ],
  defaultValue: ['work', 'personal'],
  validation: {
    required: true,
    min: 1  // At least one selection
  }
}
```

**UI**:
```
┌─────────────────────────────────┐
│  Select categories to export    │
│                                 │
│  ☑ Work (234 notes)             │
│  ☑ Personal (156 notes)         │
│  ☐ Archive (892 notes)          │
│                                 │
│  [Submit]                       │
└─────────────────────────────────┘
```

**Return value**: `{ value: ['work', 'personal'] }`

### 4. Text (Single Line)

**Use case**: Short text input (titles, names, tags)

```typescript
{
  inputType: 'text',
  prompt: 'Enter note title',
  placeholder: 'My Note Title',
  defaultValue: 'Meeting Summary',
  validation: {
    required: true,
    minLength: 1,
    maxLength: 100,
    pattern: '^[a-zA-Z0-9\\s\\-_]+$'
  },
  helpText: 'Alphanumeric characters, spaces, dashes, and underscores only'
}
```

**UI**:
```
┌─────────────────────────────────┐
│  Enter note title               │
│                                 │
│  [Meeting Summary________]      │
│                                 │
│  ℹ️ Alphanumeric characters,    │
│    spaces, dashes, and          │
│    underscores only             │
│                                 │
│  [Submit]                       │
└─────────────────────────────────┘
```

**Return value**: `{ value: 'Meeting Summary' }`

### 5. Textarea (Multi-Line)

**Use case**: Longer text input (descriptions, notes, content)

```typescript
{
  inputType: 'textarea',
  prompt: 'Add notes about this archive',
  placeholder: 'Enter additional context...',
  validation: {
    maxLength: 1000
  },
  helpText: 'Optional notes for future reference'
}
```

**UI**:
```
┌─────────────────────────────────┐
│  Add notes about this archive   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ Enter additional        │   │
│  │ context...              │   │
│  │                         │   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
│  ℹ️ Optional notes for future   │
│    reference                    │
│                                 │
│  [Submit]  [Skip]               │
└─────────────────────────────────┘
```

**Return value**: `{ value: 'Archived old meeting notes from Q4 2024' }`

### 6. Number

**Use case**: Numeric input with constraints

```typescript
{
  inputType: 'number',
  prompt: 'How many days to look back?',
  defaultValue: 7,
  validation: {
    required: true,
    min: 1,
    max: 365
  },
  helpText: 'Between 1 and 365 days'
}
```

**UI**:
```
┌─────────────────────────────────┐
│  How many days to look back?    │
│                                 │
│  [ - ]  [ 7 ]  [ + ]            │
│                                 │
│  ℹ️ Between 1 and 365 days      │
│                                 │
│  [Submit]                       │
└─────────────────────────────────┘
```

**Return value**: `{ value: 7 }`

### 7. Date

**Use case**: Date selection

```typescript
{
  inputType: 'date',
  prompt: 'Select due date',
  defaultValue: '2025-01-20',
  validation: {
    required: true,
    min: '2025-01-01',  // Minimum date
    max: '2025-12-31'   // Maximum date
  }
}
```

**UI**:
```
┌─────────────────────────────────┐
│  Select due date                │
│                                 │
│  [📅 January 20, 2025  ▼]       │
│                                 │
│  [Submit]                       │
└─────────────────────────────────┘
```

**Return value**: `{ value: '2025-01-20' }`

### 8. Slider (Range)

**Use case**: Selecting value from a range

```typescript
{
  inputType: 'slider',
  prompt: 'Set priority level',
  validation: {
    min: 1,
    max: 5
  },
  defaultValue: 3,
  options: [
    { value: '1', label: 'Low' },
    { value: '3', label: 'Medium' },
    { value: '5', label: 'High' }
  ]
}
```

**UI**:
```
┌─────────────────────────────────┐
│  Set priority level             │
│                                 │
│  Low    ●─────────   High       │
│         │         │              │
│         1    3    5              │
│                                 │
│  Current: 3 (Medium)            │
│                                 │
│  [Submit]                       │
└─────────────────────────────────┘
```

**Return value**: `{ value: 3 }`

## API Specification

### Tool Definition

```typescript
// Tool: request_user_input
{
  name: 'request_user_input',
  description: `Request input from the user with custom UI elements.

  Use this tool when you need:
  - User confirmation before proceeding
  - Selection from multiple options
  - Additional information to complete a task
  - Resolution of ambiguous references

  The execution will pause until the user responds or the request times out.`,

  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Question or prompt to display to the user'
      },
      description: {
        type: 'string',
        description: 'Additional context or explanation (optional)'
      },
      inputType: {
        type: 'string',
        enum: ['confirm', 'select', 'multiselect', 'text', 'textarea',
               'number', 'date', 'slider'],
        description: 'Type of input to request'
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['value', 'label']
        },
        description: 'Options for select/multiselect/slider (required for those types)'
      },
      defaultValue: {
        description: 'Default value for the input'
      },
      validation: {
        type: 'object',
        properties: {
          required: { type: 'boolean' },
          min: { type: 'number' },
          max: { type: 'number' },
          minLength: { type: 'number' },
          maxLength: { type: 'number' },
          pattern: { type: 'string' }
        }
      },
      placeholder: {
        type: 'string',
        description: 'Placeholder text for text/textarea inputs'
      },
      helpText: {
        type: 'string',
        description: 'Help text to display below the input'
      },
      cancelable: {
        type: 'boolean',
        default: true,
        description: 'Whether the user can cancel this input request'
      },
      timeout: {
        type: 'number',
        default: 300000,
        description: 'Timeout in milliseconds (default: 5 minutes)'
      }
    },
    required: ['prompt', 'inputType']
  }
}
```

### IPC Events

```typescript
// Main → Renderer: Request input from user
interface InputRequestEvent {
  channel: 'ai-request-input';
  payload: {
    requestId: string;           // Unique request identifier
    conversationId: string;      // Associated conversation
    timestamp: string;           // ISO datetime
    config: AgentInputConfig;    // Input configuration
  }
}

// Renderer → Main: Submit user response
interface InputResponseEvent {
  channel: 'submit-agent-input';
  payload: {
    requestId: string;
    response: {
      value: any;                // User's input value
      canceled: boolean;         // Whether user canceled
      timestamp: string;         // ISO datetime
    }
  };
  returns: {
    success: boolean;
    error?: string;
  }
}
```

### Workflow Schema Extension

```typescript
// Extend existing Workflow interface
interface Workflow {
  // ... existing fields (id, name, purpose, description, etc.)

  // NEW: Input requirements
  inputRequirements?: AgentInputConfig[];
}

// Example workflow with inputs
const weeklyReviewWorkflow: Workflow = {
  id: 'w-weekly-review',
  name: 'weekly-review',
  purpose: 'Review weekly progress and plan ahead',
  description: 'Analyzes completed tasks, upcoming deadlines, and project status',
  status: 'active',
  type: 'workflow',
  vaultId: 'default',

  inputRequirements: [
    {
      id: 'focus_areas',
      prompt: 'Which areas should I review?',
      inputType: 'multiselect',
      options: [
        { value: 'completed', label: 'Completed tasks' },
        { value: 'upcoming', label: 'Upcoming deadlines' },
        { value: 'unprocessed', label: 'Unprocessed notes' },
        { value: 'projects', label: 'Project progress' }
      ],
      defaultValue: ['completed', 'upcoming'],
      validation: { required: true }
    },
    {
      id: 'include_stats',
      prompt: 'Include statistics?',
      inputType: 'select',
      options: [
        { value: 'detailed', label: 'Yes, detailed' },
        { value: 'summary', label: 'Yes, summary only' },
        { value: 'none', label: 'No' }
      ],
      defaultValue: 'summary'
    }
  ],

  createdAt: '2025-01-15T10:00:00Z',
  updatedAt: '2025-01-15T10:00:00Z'
};
```

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Basic infrastructure and confirm input type

**Tasks**:
1. Create type definitions (`src/server/types/agent-input.ts`)
2. Implement `InputRequestManager` in main process
3. Add IPC channels for input requests/responses
4. Create basic `AgentInputModal.svelte` component
5. Implement `request_user_input` tool with confirm type only
6. Add preload API methods

**Deliverables**:
- ✅ Agents can request confirmation (Yes/No)
- ✅ UI shows modal dialog with buttons
- ✅ Tool execution pauses and resumes correctly

### Phase 2: Core Input Types (Week 2)

**Goal**: Support select, multiselect, text inputs

**Tasks**:
1. Extend `AgentInputModal` with select UI (radio buttons)
2. Add multiselect UI (checkboxes)
3. Add text input UI with validation
4. Implement validation logic (required, min/max, pattern)
5. Add error handling and display
6. Enhance tool to support all input types

**Deliverables**:
- ✅ Select (single choice) working
- ✅ Multi-select (multiple choices) working
- ✅ Text input with basic validation

### Phase 3: Advanced Input Types (Week 3)

**Goal**: Add textarea, number, date, slider

**Tasks**:
1. Implement textarea component
2. Add number input with increment/decrement
3. Integrate date picker component
4. Create slider/range component
5. Add help text and placeholder support
6. Implement conditional inputs (showIf/showWhen)

**Deliverables**:
- ✅ All 8 input types functional
- ✅ Validation working for all types
- ✅ Help text and placeholders

### Phase 4: Workflow Integration (Week 4)

**Goal**: Pre-declared inputs for workflows

**Tasks**:
1. Extend Workflow schema with `inputRequirements`
2. Create `WorkflowInputForm.svelte` component
3. Implement input gathering before workflow execution
4. Add inputs to agent system message context
5. Update workflow creation UI to support input definitions
6. Add migration for existing workflows

**Deliverables**:
- ✅ Workflows can declare required inputs
- ✅ Input form shows before workflow starts
- ✅ Agent receives inputs as context

### Phase 5: Polish & Testing (Week 5)

**Goal**: Production-ready quality

**Tasks**:
1. Add comprehensive test coverage
2. Implement timeout handling (5 minute default)
3. Add request cancellation
4. Improve error messages
5. Add loading states and animations
6. Write user documentation
7. Performance testing and optimization

**Deliverables**:
- ✅ Full test coverage
- ✅ Timeout and cancellation working
- ✅ Polished UI with animations
- ✅ Documentation complete

## UI/UX Specifications

### Modal Design

```
┌─────────────────────────────────────────────────┐
│  Agent Input Request                      [✕]   │
├─────────────────────────────────────────────────┤
│                                                 │
│  🤖 The agent needs your input                  │
│                                                 │
│  {PROMPT TEXT - larger font}                    │
│                                                 │
│  {DESCRIPTION TEXT - smaller, muted}            │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │                                         │   │
│  │  [INPUT COMPONENT - varies by type]     │   │
│  │                                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  {HELP TEXT - small, muted}                     │
│                                                 │
│  {ERROR MESSAGE - red, if validation fails}     │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ [Cancel]              [Submit] ←primary │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Inline Design (Alternative)

For less critical inputs, display inline within chat:

```
[Agent message bubble]
I found 3 notes matching "design". Which one?

┌─────────────────────────────────────┐
│ Select a note:                      │
│ ⦿ App Design Doc (2 days ago)       │
│ ⚪ Database Design (1 week ago)      │
│ ⚪ Design Template (3 months ago)    │
│                                     │
│ [Submit]                            │
└─────────────────────────────────────┘

[User response appears here after submit]
```

### Visual States

**Pending** (waiting for input):
- Modal visible
- Dim background overlay
- Agent activity widget shows "Waiting for user input..."
- Submit button enabled when valid

**Submitting** (processing response):
- Submit button shows spinner
- Input fields disabled
- "Submitting..." text

**Completed** (input received):
- Modal closes with fade animation
- Agent activity widget shows "Received user input"
- Agent continues execution

**Canceled**:
- Modal closes immediately
- Agent receives canceled: true
- Agent can handle gracefully or abort

**Timed out**:
- Modal shows "Request timed out"
- Auto-closes after 3 seconds
- Agent receives timeout error

### Accessibility

- ✅ Full keyboard navigation (Tab, Enter, Escape)
- ✅ Screen reader support (ARIA labels)
- ✅ Focus management (trap focus in modal)
- ✅ Clear error announcements
- ✅ Sufficient color contrast (WCAG AA)

## Error Handling

### Timeout Errors

```typescript
// After 5 minutes (default)
{
  error: 'INPUT_TIMEOUT',
  message: 'User did not respond within 5 minutes',
  requestId: 'input-req-abc123'
}
```

Agent can:
- Retry with simpler prompt
- Proceed with default value
- Cancel operation
- Ask via different method

### Cancellation

```typescript
// User clicks Cancel or closes modal
{
  value: null,
  canceled: true,
  timestamp: '2025-01-15T10:35:00Z'
}
```

Agent should:
- Acknowledge cancellation
- Explain what won't happen
- Offer alternatives if appropriate

### Validation Errors

```typescript
// Client-side validation before submit
{
  valid: false,
  errors: [
    {
      field: 'value',
      message: 'Must be at least 1 character',
      rule: 'minLength'
    }
  ]
}
```

UI shows:
- Error message below input
- Red border on input field
- Submit button disabled
- Error icon with accessible label

### Network/IPC Errors

If IPC communication fails:
- Show error in modal: "Connection error. Please try again."
- Provide retry button
- Log error for debugging
- Don't lose user's input (keep in form)

## Testing Strategy

### Unit Tests

```typescript
// Test InputRequestManager
describe('InputRequestManager', () => {
  it('creates requests with unique IDs', () => {});
  it('resolves promise when response received', () => {});
  it('rejects promise on timeout', () => {});
  it('handles concurrent requests', () => {});
});

// Test AgentInputModal component
describe('AgentInputModal', () => {
  it('renders confirm type correctly', () => {});
  it('validates required fields', () => {});
  it('calls onSubmit with correct value', () => {});
  it('handles keyboard shortcuts', () => {});
});

// Test tool execution
describe('request_user_input tool', () => {
  it('pauses execution until response', () => {});
  it('returns user value', () => {});
  it('handles cancellation', () => {});
  it('times out after configured duration', () => {});
});
```

### Integration Tests

```typescript
// Test end-to-end flow
describe('Agent Input Flow', () => {
  it('agent requests input → UI shows → user responds → agent continues', async () => {
    // Start agent with task requiring input
    const agent = await startAgent('Delete old notes');

    // Wait for input request
    const request = await waitForInputRequest();
    expect(request.config.inputType).toBe('confirm');

    // Simulate user response
    await submitInput(request.requestId, { value: true });

    // Verify agent continued
    const result = await agent.complete();
    expect(result.notesDeleted).toBeGreaterThan(0);
  });
});
```

### E2E Tests

```typescript
// Test with real UI interaction
test('User confirms note deletion via modal', async ({ page }) => {
  // Send message to agent
  await page.fill('[data-testid="message-input"]', 'Delete old notes');
  await page.click('[data-testid="send-button"]');

  // Wait for modal to appear
  await page.waitForSelector('[data-testid="agent-input-modal"]');

  // Verify prompt
  expect(await page.textContent('.modal-prompt')).toContain('Delete');

  // Click confirm
  await page.click('[data-testid="confirm-button"]');

  // Verify modal closes
  await page.waitForSelector('[data-testid="agent-input-modal"]', {
    state: 'hidden'
  });

  // Verify agent completed action
  await page.waitForSelector(':text("Deleted 47 notes")');
});
```

## Security Considerations

### Input Validation

- ✅ Validate all inputs on client side
- ✅ Re-validate on server side before tool execution
- ✅ Sanitize text inputs to prevent XSS
- ✅ Enforce length limits (prevent memory issues)
- ✅ Validate option values (only allow declared options)

### Resource Limits

- ✅ Maximum 5 concurrent input requests per conversation
- ✅ Timeout after 5 minutes (configurable)
- ✅ Rate limit: Max 20 input requests per conversation
- ✅ Size limits: Max 10KB per input value

### Permission Model

- ✅ Input requests only allowed during active agent execution
- ✅ Input responses must match pending request ID
- ✅ Expired requests rejected (after timeout)
- ✅ Only renderer that initiated conversation can respond

## Performance Considerations

### Response Time
- Modal should appear within 100ms of input request
- User interactions should feel instant (<50ms)
- Submission should complete within 200ms

### Memory
- Clean up resolved requests from memory
- Limit stored request history (last 50)
- Don't store large input values in memory indefinitely

### Scalability
- Support multiple concurrent conversations with input requests
- Each conversation can have independent pending inputs
- UI efficiently updates only relevant components

## Future Enhancements (Post-V1)

### Advanced Input Types
- **File upload**: Let agent request file selection
- **Image selection**: Choose from note attachments
- **Note picker**: Visual note selection with preview
- **Rich text**: Formatted text input with markdown
- **Color picker**: Select colors for categorization
- **Tags input**: Tag selection with autocomplete

### Enhanced UX
- **Inline editing**: Show inputs directly in chat
- **Input history**: Remember previous responses
- **Smart defaults**: Suggest values based on context
- **Bulk operations**: Handle multiple inputs at once
- **Preview mode**: Show what will happen before confirming

### Workflow Features
- **Input dependencies**: Input B depends on Input A value
- **Dynamic inputs**: Agent adds inputs during execution
- **Input templates**: Reusable input configurations
- **Input validation functions**: Custom validation logic

### Analytics
- **Track input response times**
- **Monitor cancellation rates**
- **Analyze which input types are most used**
- **Measure impact on task completion rates**

## Success Metrics

### Quantitative
- **Adoption**: 70%+ of agents use input requests within first month
- **Completion rate**: >90% of input requests receive response (not canceled/timed out)
- **Response time**: Median user response time <30 seconds
- **Error rate**: <5% validation errors or failed submissions

### Qualitative
- **User satisfaction**: Positive feedback on control and transparency
- **Agent capability**: Agents can handle previously impossible tasks
- **Safety**: Fewer accidental destructive actions
- **Trust**: Users feel more confident letting agents act autonomously

## Documentation Requirements

### User Documentation
1. **Guide**: "Working with Agent Inputs"
   - When agents will ask for input
   - How to respond to different input types
   - What happens if you cancel or timeout

2. **Workflow Guide**: "Adding Inputs to Workflows"
   - How to declare required inputs
   - Input type reference
   - Validation options

### Developer Documentation
1. **API Reference**: Tool parameters and return values
2. **Component Reference**: Props and events for UI components
3. **Integration Guide**: How to add input support to custom tools
4. **Migration Guide**: Updating existing agents/workflows

## Questions & Decisions

### Open Questions
- Should we show input requests in the chat history?
- How to handle multiple pending input requests (queue vs parallel)?
- Should workflows be able to modify input requirements dynamically?
- What's the UX for input requests during recurring workflow execution?

### Design Decisions Made
- ✅ Tool-based approach (not markdown parsing)
- ✅ Modal dialogs for critical inputs, inline for simple ones
- ✅ 5-minute default timeout (configurable)
- ✅ Support both ad-hoc and pre-declared inputs
- ✅ Client-side validation with server-side re-validation

## Appendix

### Related Documents
- `docs/AGENT-WORKFLOWS-PRD.md` - Workflow system specification
- `docs/ARCHITECTURE.md` - Electron architecture overview
- `docs/DESIGN.md` - UI design guidelines

### References
- Vercel AI SDK: https://sdk.vercel.ai/docs
- Electron IPC: https://www.electronjs.org/docs/latest/api/ipc-main
- Svelte 5 Runes: https://svelte-5-preview.vercel.app/docs/runes

---

**Document Version**: 1.0
**Last Updated**: 2025-01-15
**Status**: Draft for Review
