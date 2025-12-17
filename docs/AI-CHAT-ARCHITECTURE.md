# AI Chat Agent Architecture

This document describes the architecture and approach used for the AI chat feature in Flint's Automerge version.

## Overview

The AI chat agent provides a conversational interface for users to interact with an AI assistant that can search, read, create, update, and archive notes. It uses a floating action button (FAB) that expands into a chat panel overlay.

### Key Technologies

- **AI SDK v5** (`ai` package) - Vercel's AI SDK for streaming responses and tool execution
- **OpenRouter** - Default AI provider (supports multiple models)
- **Electron Secure Storage** - System keychain for API key storage
- **Automerge** - CRDT-based note storage (tools execute directly against it)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Renderer Process (Svelte)                                                  │
│                                                                             │
│  ┌─────────────────────┐                                                    │
│  │ AutomergeChatFAB    │ ◄── Toggle button (bottom-right)                   │
│  └─────────────────────┘                                                    │
│            │                                                                │
│            ▼                                                                │
│  ┌─────────────────────┐                                                    │
│  │ AutomergeChatPanel  │                                                    │
│  │                     │                                                    │
│  │ • ChatService       │──┐                                                 │
│  │ • Tool UI display   │  │                                                 │
│  └─────────────────────┘  │                                                 │
│            │              │                                                 │
│            ▼              │                                                 │
│  ┌─────────────────────┐  │    HTTP POST              ┌──────────────────┐  │
│  │ ChatService         │  │    /api/chat/proxy/*      │ ChatServer       │  │
│  │                     │──┼──────────────────────────►│ (main process)   │  │
│  │ • streamText()      │  │                           │                  │  │
│  │ • Tool definitions  │  │◄──────────────────────────│ • Adds API key   │  │
│  │ • Tool execution    │  │    Proxied response       │ • Forwards to    │  │
│  └─────────────────────┘  │                           │   OpenRouter     │  │
│            │              │                           └────────┬─────────┘  │
│            ▼              │                                    │            │
│  ┌─────────────────────┐  │                                    ▼            │
│  │ Note Tools          │  │                           ┌──────────────────┐  │
│  │                     │◄─┘ (tool execution)          │ SecureStorage    │  │
│  │ • search_notes      │                              │ Service          │  │
│  │ • get_note          │                              │ (OS Keychain)    │  │
│  │ • create_note       │                              └──────────────────┘  │
│  │ • update_note       │                                                    │
│  │ • archive_note      │                                                    │
│  │ • list_notes        │                                                    │
│  │ • get_backlinks     │                                                    │
│  └─────────────────────┘                                                    │
│            │                                                                │
│            ▼                                                                │
│  ┌─────────────────────┐                                                    │
│  │ Automerge State     │ ◄── Direct access (no IPC)                         │
│  │ (IndexedDB)         │                                                    │
│  └─────────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Proxy Architecture

The chat system uses a **proxy pattern** to keep API keys secure while enabling direct tool execution in the renderer:

```
Renderer                          Main Process (Proxy)            OpenRouter
   │                                   │                              │
   │── POST /api/chat/proxy/* ───────►│                              │
   │   (messages, tools, NO api key)  │                              │
   │                                   │── adds API key header ─────►│
   │                                   │◄── streams response ────────│
   │◄── streams response ─────────────│                              │
   │                                   │                              │
   │ (tool called - execute locally)  │                              │
   │                                   │                              │
   │── POST /api/chat/proxy/* ───────►│ (with tool result)           │
   │   ...continues...                │                              │
```

**Benefits**:

- API key never leaves main process
- Renderer handles all AI logic: messages, tool definitions, tool execution
- Tools execute directly against Automerge (no IPC per tool call)
- Web version can use same code, just point to a cloud proxy instead of localhost

## Components

### Main Process

#### ChatServer (`src/main/chat-server.ts`)

HTTP proxy server that forwards requests to OpenRouter:

- **Endpoint**: `POST /api/chat/proxy/*` (handles any path under this prefix)
- **Binding**: `127.0.0.1` only (security)
- **Port**: Dynamically assigned (OS picks available port)

**Request Flow**:

1. Receive request body from renderer (messages, tools, model config)
2. Retrieve API key from secure storage
3. Add `Authorization: Bearer {apiKey}` header
4. Forward request to OpenRouter API
5. Stream response back to renderer

#### SecureStorageService (`src/main/secure-storage-service.ts`)

Existing service for secure API key storage using Electron's `safeStorage` API, which stores keys in the OS keychain (macOS Keychain, Windows Credential Manager, etc.).

### Renderer Process

#### ChatService (`src/renderer/src/lib/automerge/chat-service.svelte.ts`)

Manages AI chat conversations with tool support:

```typescript
import { streamText, stepCountIs } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createNoteTools } from './note-tools.svelte';

export class ChatService {
  private proxyUrl: string;
  private _messages = $state<ChatMessage[]>([]);
  private _status = $state<ChatStatus>('ready');

  async sendMessage(text: string) {
    const tools = createNoteTools();

    // Create provider that routes through proxy
    const openrouter = createOpenRouter({
      baseURL: this.proxyUrl,
      apiKey: 'proxy-handled' // Dummy - real key added by proxy
    });

    const result = streamText({
      model: openrouter('anthropic/claude-sonnet-4'),
      system: SYSTEM_PROMPT,
      messages: coreMessages,
      tools,
      stopWhen: stepCountIs(5) // Allow up to 5 tool call rounds
    });

    // Process stream events...
  }
}
```

**Features**:

- Reactive state using Svelte 5 runes (`$state`)
- Streaming text responses
- Multi-step tool execution (up to 5 rounds)
- Abort/cancel support

#### Note Tools (`src/renderer/src/lib/automerge/note-tools.svelte.ts`)

AI SDK tool definitions that execute directly against Automerge:

| Tool           | Description                              |
| -------------- | ---------------------------------------- |
| `search_notes` | Search notes by query string             |
| `get_note`     | Get a specific note by ID                |
| `list_notes`   | List notes (sorted by last updated)      |
| `create_note`  | Create a new note                        |
| `update_note`  | Update note title/content                |
| `archive_note` | Soft delete a note                       |
| `get_backlinks`| Get notes that link to a specific note   |

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { searchNotes, getNote, createNote, ... } from './state.svelte';

export function createNoteTools(): Record<string, Tool> {
  return {
    search_notes: tool({
      description: 'Search notes by query string...',
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().optional().default(10)
      }),
      execute: async ({ query, limit }) => {
        const results = searchNotes(query);
        return { success: true, notes: results.slice(0, limit) };
      }
    }),
    // ... other tools
  };
}
```

#### AutomergeChatFAB (`src/renderer/src/components/AutomergeChatFAB.svelte`)

Floating action button:

- Fixed position: bottom-right corner (24px from edges)
- z-index: 1000 (above content, below modals)
- Animated icon transition when panel opens
- Chat bubble icon (closed) / X icon (open)

#### AutomergeChatPanel (`src/renderer/src/components/AutomergeChatPanel.svelte`)

Chat interface using the ChatService:

```typescript
import { createChatService, type ChatService } from '../lib/automerge/chat-service.svelte';

let chatService = $state<ChatService | null>(null);

// Initialize when port is available
$effect(() => {
  if (port && isValid) {
    chatService = createChatService(port);
  }
});

// Reactive state
const messages = $derived(chatService?.messages ?? []);
const status = $derived(chatService?.status ?? 'ready');
const isLoading = $derived(chatService?.isLoading ?? false);
```

**Features**:

- Message list with auto-scroll
- User/assistant message bubbles
- Tool call indicators (shows when AI is using tools)
- Typing indicator during streaming
- API key missing state with settings link
- Error display

#### AutomergeAPIKeySettings (`src/renderer/src/components/AutomergeAPIKeySettings.svelte`)

API key configuration:

- Password input field
- Format validation (OpenRouter keys start with `sk-`)
- Auto-save with 1-second debounce
- Keychain security notice
- Link to OpenRouter dashboard

### Preload Bridge

The preload script exposes IPC methods:

```typescript
// Get chat server port
getChatServerPort: () => Promise<number>;

// Existing API key methods
storeApiKey: ({ provider, key }) => Promise<void>;
getApiKey: ({ provider }) => Promise<{ key: string }>;
testApiKey: ({ provider }) => Promise<boolean>;
```

## Data Flow

### Sending a Message with Tools

```
1. User types message in AutomergeChatPanel
2. Form submit calls chatService.sendMessage(text)
3. ChatService builds messages array and creates tools
4. streamText() sends POST to proxy (http://127.0.0.1:{port}/api/chat/proxy/...)
5. ChatServer adds API key and forwards to OpenRouter
6. AI streams response, may decide to call a tool
7. Tool execute() runs directly in renderer against Automerge
8. Tool result returned immediately (no IPC needed)
9. ChatService sends follow-up request with tool result
10. AI continues, streams final response
11. UI updates reactively as chunks arrive
```

### API Key Configuration

```
1. User enters key in AutomergeAPIKeySettings
2. Debounced save triggers after 1 second
3. IPC call to main process: storeApiKey()
4. SecureStorageService encrypts and stores in OS keychain
5. ChatServer retrieves key on each proxy request
```

## Security Considerations

1. **Localhost binding** - HTTP server only accepts connections from `127.0.0.1`
2. **No key exposure** - API keys retrieved server-side, never sent to renderer
3. **OS keychain** - Keys stored encrypted in system credential manager
4. **CSP configured** - Content Security Policy allows `http://localhost:*` and `http://127.0.0.1:*` for chat server connections
5. **Proxy pattern** - Renderer never sees the API key, only sends requests through local proxy

## Configuration

### Default Model

The default model is `anthropic/claude-haiku-4.5` (via OpenRouter). This can be changed in `chat-service.svelte.ts`:

```typescript
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
```

### System Prompt

The system prompt defines the assistant's behavior and available tools:

```typescript
const SYSTEM_PROMPT = `You are a helpful AI assistant integrated into Flint,
a note-taking application. You have access to tools that let you search,
read, create, update, and archive notes.

When users ask about their notes:
- Use search_notes to find relevant notes by keywords
- Use get_note to read the full content of a specific note
- Use list_notes to see recent notes
- Use get_backlinks to find notes that link to a specific note

When users want to modify notes:
- Use create_note to make new notes
- Use update_note to change existing notes
- Use archive_note to remove notes (soft delete)

Be concise and helpful. When showing note content, format it nicely.
Always confirm before making changes to notes.`;
```

## File Summary

| File                                                              | Purpose                              |
| ----------------------------------------------------------------- | ------------------------------------ |
| `src/main/chat-server.ts`                                         | HTTP proxy for OpenRouter API        |
| `src/main/index.ts`                                               | Server initialization, IPC handlers  |
| `src/preload/index.ts`                                            | IPC bridge for getChatServerPort     |
| `src/renderer/src/lib/automerge/chat-service.svelte.ts`           | Chat service with streaming & tools  |
| `src/renderer/src/lib/automerge/note-tools.svelte.ts`             | AI tool definitions for notes        |
| `src/renderer/src/components/AutomergeChatFAB.svelte`             | Floating action button               |
| `src/renderer/src/components/AutomergeChatPanel.svelte`           | Chat interface                       |
| `src/renderer/src/components/AutomergeAPIKeySettings.svelte`      | API key settings                     |
| `src/renderer/src/components/AutomergeMainView.svelte`            | Integration point                    |
| `src/renderer/index.html`                                         | CSP configuration                    |

## Future Enhancements

Potential improvements not yet implemented:

- **Context injection** - Automatically include relevant notes in conversation
- **Model selection** - UI to choose different models
- **Conversation persistence** - Save chat history to Automerge
- **Multiple conversations** - Support for chat threads
- **More tools** - Note type management, workspace switching, etc.
