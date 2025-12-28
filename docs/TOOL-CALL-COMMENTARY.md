# Tool Call Commentary Handling

This document describes how agent tool calls and their associated commentary are captured, stored, and displayed in the chat panel.

## Overview

When an AI agent uses tools (like searching notes, reading content, etc.), it typically generates explanatory text before each tool call. This "commentary" describes what the agent is about to do. We capture this commentary and associate it with each tool call, allowing us to:

1. Display only the final response in the conversation
2. Show tool activity with commentary in a separate widget

## Architecture

### AI SDK Step Model

The Vercel AI SDK organizes streaming responses into "steps". Each step represents a unit of agent activity:

```
Step 0 (initial):
  - Text: "I'll search for your notes..."
  - Tool call: search_notes

Step 1 (tool-result):
  - Text: "Found 3 notes. Let me read the first one..."
  - Tool call: get_note

Step 2 (tool-result):
  - Text: "Here's what I found: [final response]"
  - No tool calls (finish)
```

The `fullStream` from `streamText()` emits events including:

- `start-step`: Beginning of a new step
- `text-delta`: Incremental text content
- `tool-call`: A tool is being invoked
- `tool-result`: A tool returned results
- `finish-step`: End of a step

### Commentary Capture Flow

In `chat-service.svelte.ts`:

```typescript
// Track text in the current step
private currentStepText = '';

for await (const event of result.fullStream) {
  switch (event.type) {
    case 'start-step':
      // Reset at beginning of each step
      this.currentStepText = '';
      break;

    case 'text-delta':
      // Accumulate text in current step
      this.currentStepText += event.text;
      // Also append to message content
      this.updateLastAssistantMessage((msg) => {
        msg.content += event.text;
      });
      break;

    case 'tool-call':
      // Capture commentary and attach to tool call
      this.updateLastAssistantMessage((msg) => {
        msg.toolCalls.push({
          id: event.toolCallId,
          name: event.toolName,
          args: event.input,
          status: 'running',
          commentary: this.currentStepText.trim() || undefined
        });
      });
      // Clear so next tool call doesn't duplicate
      this.currentStepText = '';
      break;
    // ...
  }
}
```

### Data Model

**ToolCall interface** (`chat-service.svelte.ts`):

```typescript
interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
  commentary?: string; // Text that preceded this tool call
}
```

**PersistedToolCall** (`types.ts`):

```typescript
interface PersistedToolCall {
  // ... same fields including commentary
  commentary?: string;
}
```

### Display Logic

**Conversation View** (`ChatPanel.svelte`):

For messages with tool calls, we strip out commentary to show only the final response:

```typescript
function getMessageText(message: ChatMessage): string {
  if (!message.content) return '';

  if (hasToolCalls(message) && message.toolCalls) {
    let displayContent = message.content;
    for (const tc of message.toolCalls) {
      if (tc.commentary) {
        displayContent = displayContent.replace(tc.commentary, '');
      }
    }
    return displayContent.trim();
  }

  return message.content;
}
```

**Tool Widget** (`ToolWidget.svelte`):

Shows current tool activity at the bottom of the chat panel:

- Running state: spinner + tool name
- Idle state: checkmark + count of tool calls
- Click to expand overlay

**Tool Overlay** (`ToolOverlay.svelte`):

Expandable popup showing all tool calls with:

- Tool name
- Commentary (the text that preceded the tool call)
- Expandable details: arguments, result, errors
- Copy button for JSON

## Component Structure

```
ChatPanel.svelte
├── ConversationContainer
│   ├── [messages] - Shows final responses only
│   └── [controls]
│       ├── ToolWidget - Compact status indicator
│       │   └── (click) → ToolOverlay
│       └── [input form]
│
└── ToolOverlay - Popup with full tool history
    └── [tool items with commentary]
```

## Data Flow

```
1. User sends message
2. AI streams response
   ├── start-step → reset currentStepText
   ├── text-delta → accumulate in currentStepText + message.content
   ├── tool-call → save currentStepText as commentary, clear it
   ├── tool-result → update tool status
   └── (repeat for each step)
3. Message stored with:
   ├── content: all text (commentary + final response)
   └── toolCalls: [{...commentary}, {...commentary}, ...]
4. Display:
   ├── Conversation: content - commentary = final response
   └── Widget/Overlay: tool calls with commentary
```

## Backward Compatibility

Older conversations may have tool calls without the `commentary` field. The UI handles this gracefully:

- Tool overlay shows tool name without commentary
- Message content displays as-is (may include commentary inline)

## Files

- `src/renderer/src/lib/automerge/chat-service.svelte.ts` - Streaming and commentary capture
- `src/renderer/src/lib/automerge/types.ts` - PersistedToolCall type
- `src/renderer/src/components/ChatPanel.svelte` - Main panel with aggregation
- `src/renderer/src/components/ToolWidget.svelte` - Compact status widget
- `src/renderer/src/components/ToolOverlay.svelte` - Full tool history popup
