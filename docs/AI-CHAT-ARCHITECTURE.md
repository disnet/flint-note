# AI Chat Agent Architecture

This document describes the architecture and approach used for the AI chat feature in Flint's Automerge version.

## Overview

The AI chat agent provides a conversational interface for users to interact with an AI assistant. It uses a floating action button (FAB) that expands into a chat panel overlay.

### Key Technologies

- **AI SDK v5** (`ai` package) - Vercel's AI SDK for streaming responses
- **@ai-sdk/svelte** - Svelte integration providing the `Chat` class
- **OpenRouter** - Default AI provider (supports multiple models)
- **Electron Secure Storage** - System keychain for API key storage

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Renderer Process (Svelte)                                              │
│                                                                         │
│  ┌─────────────────────┐                                                │
│  │ AutomergeChatFAB    │ ◄── Toggle button (bottom-right)               │
│  └─────────────────────┘                                                │
│            │                                                            │
│            ▼                                                            │
│  ┌─────────────────────┐       HTTP POST            ┌────────────────┐  │
│  │ AutomergeChatPanel  │ ─────────────────────────► │ ChatServer     │  │
│  │                     │   /api/chat                │ (main process) │  │
│  │ • Chat class        │                            │                │  │
│  │ • TextStreamTransport│ ◄─────────────────────────│ • streamText() │  │
│  └─────────────────────┘   SSE text stream          │ • OpenRouter   │  │
│                                                     └───────┬────────┘  │
│                                                             │           │
│  ┌─────────────────────┐       IPC                          │           │
│  │ AutomergeAPIKey     │ ◄──────────────────────────────────┤           │
│  │ Settings            │   store/get API key                │           │
│  └─────────────────────┘                                    ▼           │
│                                                     ┌────────────────┐  │
│                                                     │SecureStorage   │  │
│                                                     │Service         │  │
│                                                     │(OS Keychain)   │  │
│                                                     └────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Why HTTP Server?

The AI SDK's `Chat` class communicates via HTTP fetch requests to stream responses. We run a local HTTP server in the Electron main process because:

1. **CORS restrictions** - Browser security prevents direct API calls to external services
2. **API key security** - Keys stay in the main process, never exposed to renderer
3. **AI SDK compatibility** - The `TextStreamChatTransport` expects an HTTP endpoint

The server binds exclusively to `127.0.0.1` (localhost) for security.

## Components

### Main Process

#### ChatServer (`src/main/chat-server.ts`)

HTTP server handling AI chat requests:

- **Endpoint**: `POST /api/chat`
- **Binding**: `127.0.0.1` only (security)
- **Port**: Dynamically assigned (OS picks available port)

**Request Flow**:
1. Receive messages in UIMessage format (from Chat class)
2. Convert to ModelMessage format (for AI SDK)
3. Prepend system prompt
4. Stream response via OpenRouter using `streamText()`
5. Return as text stream

**Message Format Conversion**:
```typescript
// UIMessage (from Chat class)
{ role: "user", parts: [{ type: "text", text: "Hello" }] }

// ModelMessage (for streamText)
{ role: "user", content: "Hello" }
```

#### SecureStorageService (`src/main/secure-storage-service.ts`)

Existing service for secure API key storage using Electron's `safeStorage` API, which stores keys in the OS keychain (macOS Keychain, Windows Credential Manager, etc.).

### Renderer Process

#### AutomergeChatFAB (`src/renderer/src/components/AutomergeChatFAB.svelte`)

Floating action button:
- Fixed position: bottom-right corner (24px from edges)
- z-index: 1000 (above content, below modals)
- Animated icon transition when panel opens
- Chat bubble icon (closed) / X icon (open)

#### AutomergeChatPanel (`src/renderer/src/components/AutomergeChatPanel.svelte`)

Chat interface using AI SDK's `Chat` class:

```typescript
import { Chat, type UIMessage } from '@ai-sdk/svelte';
import { TextStreamChatTransport } from 'ai';

// Initialize transport with local server
const transport = new TextStreamChatTransport({
  api: `http://localhost:${port}/api/chat`
});

// Create Chat instance
const chat = new Chat({ transport });

// Reactive state from Chat
const messages = $derived(chat?.messages ?? []);
const status = $derived(chat?.status ?? 'ready');
const isLoading = $derived(status === 'submitted' || status === 'streaming');
```

**Features**:
- Message list with auto-scroll
- User/assistant message bubbles (reuses `ConversationMessage` component)
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
getChatServerPort: () => Promise<number>

// Existing API key methods
storeApiKey: ({ provider, key }) => Promise<void>
getApiKey: ({ provider }) => Promise<{ key: string }>
testApiKey: ({ provider }) => Promise<boolean>
```

## Data Flow

### Sending a Message

```
1. User types message in AutomergeChatPanel
2. Form submit calls chat.sendMessage({ text })
3. Chat class sends POST to http://localhost:{port}/api/chat
4. ChatServer receives request with UIMessage[]
5. Converts to ModelMessage[] format
6. Calls streamText() with OpenRouter provider
7. Streams text response back to Chat class
8. Chat updates messages array (reactive)
9. UI re-renders with new message
```

### API Key Configuration

```
1. User enters key in AutomergeAPIKeySettings
2. Debounced save triggers after 1 second
3. IPC call to main process: storeApiKey()
4. SecureStorageService encrypts and stores in OS keychain
5. ChatServer retrieves key on each request
```

## Security Considerations

1. **Localhost binding** - HTTP server only accepts connections from `127.0.0.1`
2. **No key exposure** - API keys retrieved server-side, never sent to renderer
3. **OS keychain** - Keys stored encrypted in system credential manager
4. **CSP configured** - Content Security Policy allows `http://localhost:*` and `http://127.0.0.1:*` for chat server connections

## Configuration

### Default Model

The default model is `anthropic/claude-haiku-4.5` (via OpenRouter). This can be changed in `chat-server.ts`:

```typescript
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
```

### System Prompt

The system prompt defines the assistant's behavior:

```typescript
const SYSTEM_PROMPT = `You are a helpful AI assistant integrated into Flint,
a note-taking application. You help users with:
- Answering questions about their notes and knowledge
- Brainstorming and generating ideas
- Writing assistance and editing
- General questions and problem-solving

Be concise, helpful, and friendly. When relevant, suggest how users
might organize their thoughts into notes.`;
```

## File Summary

| File | Purpose |
|------|---------|
| `src/main/chat-server.ts` | HTTP server for AI streaming |
| `src/main/index.ts` | Server initialization, IPC handlers |
| `src/preload/index.ts` | IPC bridge for getChatServerPort |
| `src/renderer/src/components/AutomergeChatFAB.svelte` | Floating action button |
| `src/renderer/src/components/AutomergeChatPanel.svelte` | Chat interface |
| `src/renderer/src/components/AutomergeAPIKeySettings.svelte` | API key settings |
| `src/renderer/src/components/AutomergeMainView.svelte` | Integration point |
| `src/renderer/index.html` | CSP configuration |

## Future Enhancements

Potential improvements not yet implemented:

- **Tool use** - Allow AI to interact with notes (search, create, edit)
- **Context injection** - Include relevant notes in conversation
- **Model selection** - UI to choose different models
- **Conversation persistence** - Save chat history
- **Multiple conversations** - Support for chat threads
