/**
 * Chat Service for AI Streaming with Tools
 *
 * This service manages AI chat conversations using the AI SDK's streamText()
 * directly. It handles tool execution in the renderer process and routes
 * API requests through the proxy server to keep API keys secure.
 */

import {
  streamText,
  stepCountIs,
  type CoreMessage,
  type ToolCallPart,
  type ToolResultPart
} from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createNoteTools } from './note-tools.svelte';
import { createEpubTools } from './epub-tools.svelte';
import { createPdfTools } from './pdf-tools.svelte';
import { createRoutineTools } from './routine-tools.svelte';
import {
  createConversation,
  addMessageToConversation,
  updateConversationMessage,
  getConversation,
  setActiveConversationId
} from './state.svelte';
import type { PersistedToolCall } from './types';

/**
 * Message format for chat UI
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  createdAt: Date;
}

/**
 * Tool call info for UI display
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
}

/**
 * Chat status
 */
export type ChatStatus = 'ready' | 'submitting' | 'streaming' | 'error';

const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

const SYSTEM_PROMPT = `You are a helpful AI assistant integrated into Flint, a note-taking application. You have access to tools that let you search, read, create, update, and archive notes, as well as read and search EPUB books.

When users ask about their notes:
- Use search_notes to find relevant notes by keywords
- Use get_note to read the full content of a specific note
- Use list_notes to see recent notes
- Use get_backlinks to find notes that link to a specific note

When users want to modify notes:
- Use create_note to make new notes
- Use update_note to change existing notes
- Use archive_note to remove notes (soft delete)

When users ask about their EPUB books:
- Use get_document_structure to see the table of contents and chapters of a book
- Use get_document_chunk to read specific chapters or sections
- Use search_document_text to find specific text within a book
- EPUB books are stored as notes with type "type-epub" - you can find them using list_notes or search_notes

When users ask about their PDF documents:
- Use get_pdf_structure to see the outline/bookmarks and page count
- Use get_pdf_chunk to read text from specific page ranges
- Use search_pdf_text to find specific text within a document
- PDF documents are stored as notes with type "type-pdf" - you can find them using list_notes or search_notes

When working with routines (recurring tasks with instructions):
- Use list_routines to see available routines, optionally filtering by status or type
- Use get_routine to read the full details of a routine including its instructions and materials
- Use create_routine to make new routines with optional recurring schedules
- Use update_routine to modify existing routines
- Use complete_routine to mark a routine as completed (records completion history)
- Use add_routine_material to attach supplementary materials (text, code, note references)
- Use remove_routine_material to remove materials from a routine
- Use delete_routine to archive a routine
- Routines can be "routine" type (recurring scheduled tasks) or "backlog" type (one-off tasks for later)
- When executing a routine, read its full details first to understand the instructions

When referencing notes in your responses, use wikilink format so users can click to open them:
- [[n-xxxxxxxx]] - links to a note by ID
- [[n-xxxxxxxx|Note Title]] - links to a note with display text

For example: "I found your note [[n-abc12345|Meeting Notes]] which discusses..."

Be concise and helpful. When showing note content, format it nicely. Always confirm before making changes to notes.`;

/**
 * Chat Service class that manages AI conversations with tool support
 */
export class ChatService {
  private proxyUrl: string;
  private _messages = $state<ChatMessage[]>([]);
  private _status = $state<ChatStatus>('ready');
  private _error = $state<Error | null>(null);
  private _conversationId = $state<string | null>(null);
  private abortController: AbortController | null = null;
  private currentAssistantMessageId: string | null = null;

  constructor(proxyPort: number) {
    this.proxyUrl = `http://127.0.0.1:${proxyPort}/api/chat/proxy`;
  }

  /**
   * Get current messages (reactive)
   */
  get messages(): ChatMessage[] {
    return this._messages;
  }

  /**
   * Get current status (reactive)
   */
  get status(): ChatStatus {
    return this._status;
  }

  /**
   * Get current error (reactive)
   */
  get error(): Error | null {
    return this._error;
  }

  /**
   * Check if currently loading
   */
  get isLoading(): boolean {
    return this._status === 'submitting' || this._status === 'streaming';
  }

  /**
   * Get current conversation ID (reactive)
   */
  get conversationId(): string | null {
    return this._conversationId;
  }

  /**
   * Load an existing conversation
   */
  loadConversation(conversationId: string): void {
    const conversation = getConversation(conversationId);
    if (!conversation) return;

    this._conversationId = conversationId;
    // Convert persisted messages to ChatMessage format
    this._messages = conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used for timestamp, not reactive state
      createdAt: new Date(m.createdAt)
    }));
    setActiveConversationId(conversationId);
    // Note: Don't bump to recent here - selecting an item shouldn't reorder it.
    // Bumping happens when there's actual activity (messages sent/received).
  }

  /**
   * Start a new conversation (clears current and creates new)
   */
  startNewConversation(): string {
    this.clearMessages();
    const id = createConversation();
    this._conversationId = id;
    setActiveConversationId(id);
    return id;
  }

  /**
   * Send a message and stream the response
   */
  async sendMessage(text: string): Promise<void> {
    if (!text.trim() || this.isLoading) return;

    // Clear any previous error
    this._error = null;

    // Ensure we have a conversation
    if (!this._conversationId) {
      this._conversationId = createConversation();
      setActiveConversationId(this._conversationId);
    }

    // Add user message and persist
    const userMessageId = addMessageToConversation(this._conversationId, {
      role: 'user',
      content: text.trim()
    });
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: text.trim(),
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used for timestamp, not reactive state
      createdAt: new Date()
    };
    this._messages = [...this._messages, userMessage];

    // Create assistant message placeholder and persist
    const assistantMessageId = addMessageToConversation(this._conversationId, {
      role: 'assistant',
      content: '',
      toolCalls: []
    });
    this.currentAssistantMessageId = assistantMessageId;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used for timestamp, not reactive state
      createdAt: new Date()
    };
    this._messages = [...this._messages, assistantMessage];

    this._status = 'submitting';

    try {
      // Create abort controller for this request
      this.abortController = new AbortController();

      // Build messages for API
      // Filter out empty assistant messages (like the placeholder we just added)
      const coreMessages: CoreMessage[] = this._messages
        .filter((m) => m.role !== 'assistant' || m.content || m.toolCalls?.length)
        .map((m) => {
          if (m.role === 'user') {
            return { role: 'user' as const, content: m.content };
          } else if (m.role === 'assistant') {
            // Include tool calls and results in assistant messages
            const parts: (
              | { type: 'text'; text: string }
              | ToolCallPart
              | ToolResultPart
            )[] = [];
            if (m.content) {
              parts.push({ type: 'text', text: m.content });
            }
            if (m.toolCalls) {
              for (const tc of m.toolCalls) {
                parts.push({
                  type: 'tool-call',
                  toolCallId: tc.id,
                  toolName: tc.name,
                  input: tc.args
                });
              }
            }
            return {
              role: 'assistant' as const,
              content: parts.length > 0 ? parts : m.content
            };
          } else {
            return { role: 'system' as const, content: m.content };
          }
        });

      // Create tools (note tools + EPUB tools + PDF tools + routine tools)
      const tools = {
        ...createNoteTools(),
        ...createEpubTools(),
        ...createPdfTools(),
        ...createRoutineTools()
      };

      // Create OpenRouter provider pointing to our proxy
      // The proxy will add the real API key
      const openrouter = createOpenRouter({
        baseURL: this.proxyUrl,
        apiKey: 'proxy-handled' // Dummy - real key added by proxy
      });

      // Stream the response
      const result = streamText({
        model: openrouter(DEFAULT_MODEL),
        system: SYSTEM_PROMPT,
        messages: coreMessages,
        tools,
        stopWhen: stepCountIs(5), // Allow up to 5 tool call rounds
        abortSignal: this.abortController.signal
      });

      this._status = 'streaming';

      // Process the stream
      for await (const event of result.fullStream) {
        switch (event.type) {
          case 'text-delta':
            // Append text to assistant message
            this.updateLastAssistantMessage((msg) => {
              msg.content += event.text;
            });
            break;

          case 'tool-call':
            // Add tool call to assistant message
            this.updateLastAssistantMessage((msg) => {
              if (!msg.toolCalls) msg.toolCalls = [];
              msg.toolCalls.push({
                id: event.toolCallId,
                name: event.toolName,
                args: event.input as Record<string, unknown>,
                status: 'running'
              });
            });
            break;

          case 'tool-result':
            // Update tool call with result
            this.updateLastAssistantMessage((msg) => {
              const toolCall = msg.toolCalls?.find((tc) => tc.id === event.toolCallId);
              if (toolCall) {
                toolCall.result = event.output;
                toolCall.status = 'completed';
              }
            });
            break;

          case 'error':
            throw event.error;
        }
      }

      this._status = 'ready';
    } catch (error) {
      // Don't report abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        this._status = 'ready';
        return;
      }

      this._error = error instanceof Error ? error : new Error('Unknown error');
      this._status = 'error';

      // Update assistant message to show error
      this.updateLastAssistantMessage((msg) => {
        if (!msg.content) {
          msg.content = 'Sorry, an error occurred while processing your request.';
        }
      });
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Cancel the current request
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Clear all messages and reset conversation
   */
  clearMessages(): void {
    this._messages = [];
    this._conversationId = null;
    this.currentAssistantMessageId = null;
    this._error = null;
    this._status = 'ready';
  }

  /**
   * Helper to update the last assistant message (also persists to Automerge)
   */
  private updateLastAssistantMessage(updater: (msg: ChatMessage) => void): void {
    const lastIndex = this._messages.length - 1;
    if (lastIndex >= 0 && this._messages[lastIndex].role === 'assistant') {
      // Create a new array to trigger reactivity
      const newMessages = [...this._messages];
      const msg = {
        ...newMessages[lastIndex],
        toolCalls: [...(newMessages[lastIndex].toolCalls || [])]
      };
      updater(msg);
      newMessages[lastIndex] = msg;
      this._messages = newMessages;

      // Persist to Automerge
      if (this._conversationId && this.currentAssistantMessageId) {
        updateConversationMessage(this._conversationId, this.currentAssistantMessageId, {
          content: msg.content,
          toolCalls: msg.toolCalls as PersistedToolCall[] | undefined
        });
      }
    }
  }
}

/**
 * Create a new chat service instance
 */
export function createChatService(proxyPort: number): ChatService {
  return new ChatService(proxyPort);
}
