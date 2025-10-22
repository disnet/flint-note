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

## Design Philosophy: Structured Messages vs Tool Calls

This system uses a **structured message approach** instead of custom tool calls, which provides significant advantages:

### Why Structured Messages?

**Simplicity**
- No custom tool infrastructure needed
- No Promise-based blocking mechanisms
- No IPC events or request managers
- No timeout/cancellation infrastructure
- Frontend simply parses agent messages and renders UI

**Natural Conversation Flow**
- Input requests appear naturally in message stream
- Responses are just messages in the conversation
- Conversation history automatically includes all context
- Agent sees full interaction history without special handling

**Works Better with Streaming**
- Tags detected in real-time as agent streams response
- No need to pause/resume streaming
- UI can render immediately when tag appears
- More responsive user experience

**Easier to Implement**
- ~70% less code than tool-based approach
- No main process integration needed
- All logic in renderer/frontend
- Easier to test and debug

**More Flexible**
- Frontend fully controls UI rendering
- Easy to add new input types (just update parser)
- Can evolve format without breaking tool contracts
- Agent learns format through system prompt (no code changes)

### Trade-offs

**Advantages of Structured Messages:**
- ✅ Simpler implementation
- ✅ Natural conversation flow
- ✅ Better streaming support
- ✅ Easier debugging
- ✅ Frontend has full control

**Advantages of Tool Calls:**
- ⚠️ More "proper" AI SDK pattern
- ⚠️ Explicit blocking/waiting semantics
- ⚠️ Better type safety (tool schemas)

For our use case, the structured message approach is clearly superior. The agent doesn't need to "wait" for input in the traditional sense—it simply emits a message and receives a response, just like any conversation.

## Goals

### Primary Goals
- ✅ Enable agents to request structured input during execution via structured messages
- ✅ Provide rich UI components for different input types (confirm, select, text, etc.)
- ✅ Support both ad-hoc chat interactions and pre-declared workflow inputs
- ✅ Maintain conversation flow and context after input is provided
- ✅ Keep implementation simple with no special tool infrastructure

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
│  │                                                      │   │
│  │ MessageStreamParser (Detects <input-request> tags)  │   │
│  │ - Parses agent message stream                       │   │
│  │ - Extracts input request configurations             │   │
│  │ - Triggers UI component rendering                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Direct rendering
                            │ No IPC needed
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Conversation Flow                         │
│                                                              │
│  1. Agent streams message with embedded <input-request>     │
│  2. Frontend detects tag and renders UI component           │
│  3. User provides input                                     │
│  4. Frontend sends formatted response as next message       │
│  5. Agent receives response and continues naturally         │
│                                                              │
│  No special infrastructure, IPC, or tool handling needed!   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### 1. Agent Outputs Structured Input Request

The agent emits a special XML-like tag in its message stream:

```markdown
I found 47 notes from 2024 that haven't been modified in 6+ months.

<input-request id="confirm-archive">
{
  "type": "confirm",
  "prompt": "Would you like me to archive these notes?",
  "description": "This will move 47 notes to the archive folder",
  "confirmText": "Yes, archive them",
  "cancelText": "No, keep them"
}
</input-request>
```

The agent is taught to use this format through system prompt instructions.

#### 2. Frontend Parses Stream and Detects Request

```typescript
// MessageStreamParser processes agent response chunks
class MessageStreamParser {
  parseChunk(chunk: string) {
    // Detect <input-request> tags in stream
    const match = chunk.match(/<input-request id="([^"]+)">([\s\S]*?)<\/input-request>/);

    if (match) {
      const [fullMatch, requestId, jsonContent] = match;
      const config = JSON.parse(jsonContent);

      // Remove tag from visible message
      const visibleText = chunk.replace(fullMatch, '');

      // Trigger UI rendering
      this.showInputUI(requestId, config);

      return visibleText;
    }

    return chunk;
  }
}
```

#### 3. UI Renders Input Component

```typescript
// Frontend shows appropriate UI component
function showInputUI(requestId: string, config: InputConfig) {
  const modal = new AgentInputModal({
    target: document.body,
    props: {
      config,
      onSubmit: (value) => {
        // Send response back to agent as next message
        sendResponseToAgent(requestId, value, false);
        modal.$destroy();
      },
      onCancel: () => {
        // Send cancellation as next message
        sendResponseToAgent(requestId, null, true);
        modal.$destroy();
      }
    }
  });
}
```

#### 4. User Response Sent as Message

```typescript
// Format user's response as a message to the agent
function sendResponseToAgent(requestId: string, value: any, canceled: boolean) {
  const responseMessage = canceled
    ? `<input-response id="${requestId}">CANCELED</input-response>`
    : `<input-response id="${requestId}">${JSON.stringify(value)}</input-response>`;

  // Send as regular user message in conversation
  conversationService.sendMessage({
    role: 'user',
    content: responseMessage
  });
}
```

Example response sent to agent:
```
<input-response id="confirm-archive">true</input-response>
```

#### 5. Agent Receives Response and Continues

The agent receives the response as a normal message and continues:

```markdown
Great! I'll archive those 47 notes now.

[Archives notes...]

Done! I've archived 47 notes to the archive folder and created a
backup log at notes/backup-2025-01-15.md.
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

### Message Format Specification

#### Input Request Format

```xml
<input-request id="unique-request-id">
{
  "type": "confirm" | "select" | "multiselect" | "text" | "textarea" | "number" | "date" | "slider",
  "prompt": "Question to ask the user",
  "description": "Optional additional context",
  "options": [                    // Required for select, multiselect, slider
    {
      "value": "option-value",
      "label": "Display label",
      "description": "Optional description"
    }
  ],
  "defaultValue": any,            // Optional default value
  "validation": {                 // Optional validation rules
    "required": boolean,
    "min": number,
    "max": number,
    "minLength": number,
    "maxLength": number,
    "pattern": "regex-string"
  },
  "placeholder": "Placeholder text",  // For text/textarea
  "helpText": "Help message",         // Optional guidance
  "confirmText": "Custom confirm button text",  // Optional
  "cancelText": "Custom cancel button text"     // Optional
}
</input-request>
```

#### Input Response Format

```xml
<input-response id="unique-request-id">VALUE</input-response>
```

Or for cancellation:
```xml
<input-response id="unique-request-id">CANCELED</input-response>
```

Where `VALUE` is:
- For confirm: `true` or `false`
- For select: The selected option value (string)
- For multiselect: JSON array of selected values
- For text/textarea: The text content (string)
- For number/slider: The numeric value
- For date: ISO date string (YYYY-MM-DD)

### System Prompt Instructions

The agent's system prompt should include these instructions:

```markdown
## Requesting User Input

When you need user input during task execution, use the following format:

<input-request id="unique-id">
{
  "type": "confirm|select|multiselect|text|textarea|number|date|slider",
  "prompt": "Your question to the user",
  "description": "Optional context"
}
</input-request>

Examples:

**Confirmation:**
<input-request id="confirm-1">
{
  "type": "confirm",
  "prompt": "Should I archive these 47 notes?",
  "description": "This action will move them to the archive folder"
}
</input-request>

**Selection:**
<input-request id="select-1">
{
  "type": "select",
  "prompt": "Which note should I update?",
  "options": [
    {"value": "note-1", "label": "Design Doc (updated 2 days ago)"},
    {"value": "note-2", "label": "Architecture Doc (updated 1 week ago)"}
  ]
}
</input-request>

**Text Input:**
<input-request id="text-1">
{
  "type": "text",
  "prompt": "What title should I use for this note?",
  "placeholder": "Enter note title",
  "validation": {"required": true, "maxLength": 100}
}
</input-request>

The user's response will be sent back to you as:
<input-response id="your-request-id">VALUE</input-response>

If the user cancels, you'll receive:
<input-response id="your-request-id">CANCELED</input-response>

After receiving the response, continue with your task naturally.
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

### Phase 1: Message Parsing & Confirm Type (Week 1)

**Goal**: Basic message parsing and confirm input type

**Tasks**:
1. Create type definitions (`src/renderer/src/types/agent-input.ts`)
2. Implement `MessageStreamParser` utility class
3. Add detection for `<input-request>` tags in streaming responses
4. Create basic `AgentInputModal.svelte` component
5. Implement confirm type UI (Yes/No buttons)
6. Add system prompt instructions to agent context
7. Format and send `<input-response>` messages

**Deliverables**:
- ✅ Agent can output `<input-request>` tags
- ✅ Frontend detects tags in stream
- ✅ Modal shows for confirm inputs
- ✅ Response sent back as message

### Phase 2: Core Input Types (Week 2)

**Goal**: Support select, multiselect, text inputs

**Tasks**:
1. Extend `AgentInputModal` with select UI (radio buttons)
2. Add multiselect UI (checkboxes)
3. Add text input UI with validation
4. Implement validation logic (required, min/max, pattern)
5. Add error handling and display
6. Update message parser to handle all types

**Deliverables**:
- ✅ Select (single choice) working
- ✅ Multi-select (multiple choices) working
- ✅ Text input with basic validation
- ✅ All inputs format responses correctly

### Phase 3: Advanced Input Types (Week 3)

**Goal**: Add textarea, number, date, slider

**Tasks**:
1. Implement textarea component
2. Add number input with increment/decrement
3. Integrate date picker component
4. Create slider/range component
5. Add help text and placeholder support
6. Implement inline input option (alternative to modal)

**Deliverables**:
- ✅ All 8 input types functional
- ✅ Validation working for all types
- ✅ Help text and placeholders
- ✅ Inline display option available

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
- ✅ Same input format used for workflows and ad-hoc

### Phase 5: Polish & Testing (Week 5)

**Goal**: Production-ready quality

**Tasks**:
1. Add comprehensive test coverage
2. Handle edge cases (malformed tags, invalid JSON, etc.)
3. Add request cancellation UI
4. Improve error messages
5. Add loading states and animations
6. Write user documentation
7. Performance testing and optimization

**Deliverables**:
- ✅ Full test coverage
- ✅ Robust parsing and error handling
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

### Parsing Errors

If the `<input-request>` tag contains invalid JSON:
- Log error to console
- Show fallback message to user: "The agent sent a malformed input request"
- Optionally display the raw content for debugging
- Don't crash the UI

```typescript
try {
  const config = JSON.parse(jsonContent);
  showInputUI(requestId, config);
} catch (error) {
  console.error('Failed to parse input request:', error);
  showErrorMessage('Invalid input request format');
}
```

### Cancellation

When user clicks Cancel or closes modal:

```xml
<input-response id="request-id">CANCELED</input-response>
```

The agent's system prompt teaches it to handle cancellation gracefully:
- Acknowledge the cancellation
- Explain what won't happen
- Offer alternatives if appropriate

Example agent response:
```
Understood. I won't archive those notes. Let me know if you'd like me to:
- Archive only specific notes
- Review the notes first
- Do something else with them
```

### Validation Errors

Client-side validation before submit:

```typescript
interface ValidationError {
  field: string;
  message: string;
  rule: 'required' | 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern';
}
```

UI shows:
- Error message below input
- Red border on input field
- Submit button disabled
- Error icon with accessible label

### Message Sending Errors

If sending the response message fails:
- Show error in modal: "Failed to send response. Please try again."
- Provide retry button
- Log error for debugging
- Don't lose user's input (keep in form)
- Consider sending via conversation service retry mechanism

## Testing Strategy

### Unit Tests

```typescript
// Test MessageStreamParser
describe('MessageStreamParser', () => {
  it('detects <input-request> tags in stream', () => {});
  it('parses JSON content correctly', () => {});
  it('handles malformed JSON gracefully', () => {});
  it('extracts request ID from tag', () => {});
  it('removes tag from visible message', () => {});
  it('handles multiple tags in same message', () => {});
});

// Test AgentInputModal component
describe('AgentInputModal', () => {
  it('renders confirm type correctly', () => {});
  it('renders select with radio buttons', () => {});
  it('renders multiselect with checkboxes', () => {});
  it('validates required fields', () => {});
  it('calls onSubmit with correct value', () => {});
  it('formats response message correctly', () => {});
  it('handles keyboard shortcuts', () => {});
});

// Test response formatting
describe('formatInputResponse', () => {
  it('formats confirm response as true/false', () => {});
  it('formats select response as value string', () => {});
  it('formats multiselect as JSON array', () => {});
  it('formats cancellation as CANCELED', () => {});
});
```

### Integration Tests

```typescript
// Test end-to-end flow
describe('Agent Input Flow', () => {
  it('agent outputs tag → parser detects → UI shows → user responds', async () => {
    // Simulate agent streaming a message with input request
    const agentMessage = `
      I found 47 old notes.
      <input-request id="confirm-1">
      {"type": "confirm", "prompt": "Archive them?"}
      </input-request>
    `;

    // Parse the message
    const parser = new MessageStreamParser();
    const result = parser.parseChunk(agentMessage);

    // Verify tag was detected and removed from visible text
    expect(result.inputRequests).toHaveLength(1);
    expect(result.inputRequests[0].id).toBe('confirm-1');
    expect(result.visibleText).not.toContain('<input-request>');

    // Simulate user response
    const response = formatInputResponse('confirm-1', true);
    expect(response).toBe('<input-response id="confirm-1">true</input-response>');

    // Send response as message to agent
    await conversationService.sendMessage({
      role: 'user',
      content: response
    });
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

- ✅ Validate all inputs on client side before sending
- ✅ Sanitize text inputs to prevent XSS in displayed messages
- ✅ Enforce length limits (prevent memory issues)
- ✅ Validate option values (only allow declared options)
- ✅ Escape HTML in user-provided values

### Parsing Security

- ✅ Use safe JSON parsing (try/catch)
- ✅ Validate input request structure before rendering UI
- ✅ Limit max size of JSON content (10KB)
- ✅ Prevent arbitrary code execution via JSON
- ✅ Don't use `eval()` or `Function()` on parsed content

### Resource Limits

- ✅ Maximum 10 input requests per message (prevent spam)
- ✅ Size limits: Max 10KB per input value
- ✅ Rate limit: Max 50 input requests per conversation
- ✅ Timeout modals after 10 minutes of inactivity

### Message Integrity

- ✅ Input responses include request ID for matching
- ✅ Response format is controlled by frontend (agent can't spoof)
- ✅ Validate request IDs match expected pattern
- ✅ Prevent injection attacks via request IDs (alphanumeric only)

## Performance Considerations

### Parsing Performance
- Stream parsing should add minimal overhead (<10ms per chunk)
- Use efficient regex for tag detection
- Parse JSON only when tag is detected
- Don't re-parse entire message on each chunk

### Response Time
- Modal should appear immediately when tag is detected
- User interactions should feel instant (<50ms)
- Message sending should complete within 200ms

### Memory
- Don't store full message history with embedded tags
- Clean up modal components when closed
- Limit number of simultaneous modals (max 3)
- Remove input request tags from stored conversation history

### Scalability
- Support multiple concurrent conversations with input requests
- Each conversation can have independent pending inputs
- UI efficiently updates only relevant components
- Parsing scales linearly with message size

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
- Should we show input request/response tags in chat history (for context) or hide them?
- How to handle multiple pending input requests (queue vs parallel modals)?
- Should workflows be able to modify input requirements dynamically?
- What's the UX for input requests during recurring workflow execution?
- Should the agent see the input request tags in conversation history or just the responses?
- How to handle partial tag detection (tag split across stream chunks)?

### Design Decisions Made
- ✅ **Structured message approach** (not tool calls) - Simpler implementation
- ✅ XML-like tags with JSON content for easy parsing
- ✅ Modal dialogs for critical inputs, inline for simple ones
- ✅ Response sent as regular message in conversation flow
- ✅ Support both ad-hoc and pre-declared inputs
- ✅ Client-side validation only (no server-side needed)
- ✅ Frontend fully controls response format (agent can't manipulate)

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

**Document Version**: 2.0
**Last Updated**: 2025-10-22
**Status**: Updated - Structured Message Approach
**Major Changes**:
- Replaced tool-based approach with structured messages
- Removed IPC infrastructure requirements
- Simplified implementation by ~70%
- Added system prompt instructions for agents
