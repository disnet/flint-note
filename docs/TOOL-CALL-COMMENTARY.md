# Tool Call Commentary Handling

This document describes how agent tool calls and their associated commentary are captured, stored, and displayed in the chat panel.

## Overview

When an AI agent uses tools (like searching notes, reading content, etc.), it typically generates explanatory text before each tool call. This "commentary" describes what the agent is about to do. We capture this commentary and associate it with each tool call, allowing us to:

1. Display only the final response in the conversation
2. Show tool activity inline with each message via an expandable widget

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

### Deferred Content Accumulation

To avoid the "flickering" issue where commentary briefly appears then disappears, we use deferred content accumulation:

1. Text from `text-delta` events is buffered in `pendingStepText`
2. If a `tool-call` event arrives, the buffered text becomes commentary (NOT added to message content)
3. If `finish-step` arrives without tool calls, the buffered text is the final response (added to message content)

This ensures only final response text ends up in `message.content`, while commentary is stored separately on each tool call.

### Commentary Capture Flow

In `chat-service.svelte.ts`:

```typescript
// Track text buffers
private currentStepText = '';
private pendingStepText = '';
private currentStepHasToolCalls = false;

for await (const event of result.fullStream) {
  switch (event.type) {
    case 'start-step':
      // Reset at beginning of each step
      this.currentStepText = '';
      this.pendingStepText = '';
      this.currentStepHasToolCalls = false;
      this.updateLastAssistantMessage((msg) => {
        msg.toolActivity = { isActive: true };
      });
      break;

    case 'text-delta':
      // Buffer text - don't add to content yet
      this.currentStepText += event.text;
      this.pendingStepText += event.text;
      break;

    case 'tool-call':
      // This step has tool calls - buffered text is commentary
      this.currentStepHasToolCalls = true;
      this.updateLastAssistantMessage((msg) => {
        msg.toolCalls.push({
          id: event.toolCallId,
          name: event.toolName,
          args: event.input,
          status: 'running',
          commentary: this.pendingStepText.trim() || undefined
        });
        msg.toolActivity = { isActive: true, currentStep: event.toolName };
      });
      this.pendingStepText = '';
      break;

    case 'finish-step':
      // If no tool calls, add buffered text to content (it's final response)
      if (!this.currentStepHasToolCalls && this.pendingStepText.trim()) {
        this.updateLastAssistantMessage((msg) => {
          msg.content += this.pendingStepText;
        });
      }
      this.pendingStepText = '';
      break;
  }
}

// Clear tool activity after streaming completes
this.updateLastAssistantMessage((msg) => {
  msg.toolActivity = { isActive: false };
});
```

### Data Model

**ChatMessage interface** (`chat-service.svelte.ts`):

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // Final response only (no commentary)
  toolCalls?: ToolCall[];
  createdAt: Date;
  toolActivity?: ToolActivity; // For inline widget display during streaming
}

interface ToolActivity {
  isActive: boolean;
  currentStep?: string; // Current tool name
}
```

**ToolCall interface**:

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

### Display Logic

**Inline Tool Widget** (`InlineToolWidget.svelte`):

Each assistant message with tool calls gets its own inline widget that shows:

- **Thinking state**: Pulsing "Thinking..." when no tool calls yet
- **Working state**: Spinner + current tool name during execution
- **Complete state**: Checkmark + "Used N tools" summary

Clicking expands in-place to show all tool calls with:

- Tool name and status icon
- Commentary (the reasoning text that preceded the tool call)
- Expandable details: arguments, result, errors
- Copy button for JSON

**Conversation Layout**:

```
[User message]
[InlineToolWidget - collapsed or expanded]
[Agent final response]
```

**Backward Compatibility**:

For old messages that may have commentary embedded in content, `getMessageText()` still attempts to strip it out:

```typescript
function getMessageText(message: ChatMessage): string {
  if (!message.content) return '';

  // Fallback for old messages that have commentary in content
  if (hasToolCalls(message) && message.toolCalls) {
    let displayContent = message.content;
    for (const tc of message.toolCalls) {
      if (tc.commentary && displayContent.includes(tc.commentary)) {
        displayContent = displayContent.replace(tc.commentary, '');
      }
    }
    return displayContent.trim();
  }

  return message.content;
}
```

## Component Structure

```
ChatPanel.svelte
└── ConversationContainer
    └── messages-list
        └── for each assistant message:
            ├── InlineToolWidget (if has tool calls or toolActivity.isActive)
            │   └── (click to expand in-place)
            │       └── [tool items with commentary, args, results]
            └── ConversationMessage (final response)
```

## Data Flow

```
1. User sends message
2. AI streams response with deferred content accumulation
   ├── start-step → reset buffers, set toolActivity.isActive = true
   ├── text-delta → buffer in pendingStepText (NOT added to content)
   ├── tool-call → move buffer to commentary, track in toolActivity
   ├── tool-result → update tool status
   ├── finish-step → if no tool calls, add buffer to content
   └── (repeat for each step)
3. After streaming: clear toolActivity
4. Message stored with:
   ├── content: final response only (no commentary)
   └── toolCalls: [{...commentary}, {...commentary}, ...]
5. Display:
   ├── InlineToolWidget: shows tool calls with commentary
   └── ConversationMessage: shows content (final response)
```

## Backward Compatibility

Older conversations may have:

- Tool calls without the `commentary` field → Widget shows tool name only
- Commentary embedded in `message.content` → Fallback filtering strips it out
- No `toolActivity` field → Treated as inactive (complete state)

## Files

- `src/renderer/src/lib/automerge/chat-service.svelte.ts` - Streaming and commentary capture
- `src/renderer/src/lib/automerge/types.ts` - PersistedToolCall type
- `src/renderer/src/components/ChatPanel.svelte` - Main panel with inline widget rendering
- `src/renderer/src/components/InlineToolWidget.svelte` - Inline expandable widget per message
