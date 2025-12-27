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
  type ToolCallPart,
  type ToolResultPart,
  type ModelMessage
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
  getConversation
} from './state.svelte';
import { clone } from './utils';
import type { PersistedToolCall } from './types';
import { DEFAULT_MODEL } from '../../config/models';

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
export type ChatStatus =
  | 'ready'
  | 'submitting'
  | 'streaming'
  | 'error'
  | 'awaiting_continue';

/**
 * Maximum number of tool call rounds before prompting user to continue
 */
export const TOOL_CALL_STEP_LIMIT = 30;

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
/**
 * Marker inserted between text segments when tool calls occur.
 * Used to visually separate pre-tool and post-tool content in the UI.
 */
export const TOOL_BREAK_MARKER = '\n\n<!-- tool-break -->\n\n';

export class ChatService {
  private proxyUrl: string;
  private _messages = $state<ChatMessage[]>([]);
  private _status = $state<ChatStatus>('ready');
  private _error = $state<Error | null>(null);
  private _conversationId = $state<string | null>(null);
  private abortController: AbortController | null = null;
  private currentAssistantMessageId: string | null = null;
  // Track if we've had tool calls in the current message (to know when to insert breaks)
  private hasHadToolCalls = false;
  private hasTextAfterTools = false;
  // Track if stopped at step limit
  private _stoppedAtLimit = $state<boolean>(false);

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
   * Check if stopped at limit (reactive)
   */
  get stoppedAtLimit(): boolean {
    return this._stoppedAtLimit;
  }

  /**
   * Load an existing conversation
   */
  async loadConversation(conversationId: string): Promise<void> {
    const conversation = await getConversation(conversationId);
    if (!conversation) return;

    this._conversationId = conversationId;
    // Convert persisted messages to ChatMessage format
    // Note: m.content might be an Automerge Text object, so convert to string
    this._messages = conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: String(m.content ?? ''),
      toolCalls: m.toolCalls,
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used for timestamp, not reactive state
      createdAt: new Date(m.createdAt)
    }));
    // Note: Don't update activeItem here - the panel manages its own conversation
    // independently from the main view. Don't bump to recent here either -
    // selecting an item shouldn't reorder it.
  }

  /**
   * Start a new conversation (clears current and creates new)
   */
  async startNewConversation(): Promise<string> {
    this.clearMessages();
    const id = await createConversation({ addToRecent: false });
    this._conversationId = id;
    // Note: Don't update activeItem or recent list - panel manages its own conversation
    return id;
  }

  /**
   * Send a message and stream the response
   * @param text The message text to send
   * @param model Optional model ID to use (defaults to DEFAULT_MODEL)
   */
  async sendMessage(text: string, model?: string): Promise<void> {
    if (!text.trim() || this.isLoading) return;

    // Clear any previous error and reset step tracking
    this._error = null;
    this._stoppedAtLimit = false;

    // Ensure we have a conversation
    if (!this._conversationId) {
      this._conversationId = await createConversation({ addToRecent: false });
    }

    // Add user message and persist
    const userMessageId = await addMessageToConversation(this._conversationId, {
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
    const assistantMessageId = await addMessageToConversation(this._conversationId, {
      role: 'assistant',
      content: '',
      toolCalls: []
    });
    this.currentAssistantMessageId = assistantMessageId;
    // Reset tool tracking for new message
    this.hasHadToolCalls = false;
    this.hasTextAfterTools = false;
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
      const coreMessages: ModelMessage[] = [];
      for (const m of this._messages) {
        // Skip empty assistant messages
        if (m.role === 'assistant' && !m.content && !m.toolCalls?.length) {
          continue;
        }

        if (m.role === 'user') {
          coreMessages.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant') {
          // Build assistant message with tool calls
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
          coreMessages.push({
            role: 'assistant',
            content: parts.length > 0 ? parts : m.content
          });

          // If there are tool calls with results, add a tool message
          const toolResults = m.toolCalls?.filter((tc) => tc.result !== undefined) ?? [];
          if (toolResults.length > 0) {
            coreMessages.push({
              role: 'tool',
              content: toolResults.map((tc) => ({
                type: 'tool-result',
                toolCallId: tc.id,
                toolName: tc.name,
                output:
                  typeof tc.result === 'string'
                    ? { type: 'text' as const, value: tc.result }
                    : { type: 'json' as const, value: tc.result }
              }))
            } as ModelMessage);
          }
        } else {
          coreMessages.push({ role: 'system', content: m.content });
        }
      }

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
        model: openrouter(model || DEFAULT_MODEL),
        system: SYSTEM_PROMPT,
        messages: coreMessages,
        tools,
        stopWhen: stepCountIs(TOOL_CALL_STEP_LIMIT), // Allow up to TOOL_CALL_STEP_LIMIT tool call rounds
        abortSignal: this.abortController.signal
      });

      this._status = 'streaming';

      // Process the stream
      for await (const event of result.fullStream) {
        switch (event.type) {
          case 'text-delta':
            // If we've had tool calls and this is new text after them, insert a break marker
            if (this.hasHadToolCalls && !this.hasTextAfterTools) {
              this.hasTextAfterTools = true;
              this.updateLastAssistantMessage((msg) => {
                // Only insert marker if there was content before the tools
                if (msg.content.trim()) {
                  msg.content += TOOL_BREAK_MARKER;
                }
              });
            }
            // Append text to assistant message
            this.updateLastAssistantMessage((msg) => {
              msg.content += event.text;
            });
            break;

          case 'tool-call':
            // Mark that we've seen tool calls
            this.hasHadToolCalls = true;
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
            // Clone the output to ensure it's plain JSON (no proxies or reactive metadata)
            this.updateLastAssistantMessage((msg) => {
              const toolCall = msg.toolCalls?.find((tc) => tc.id === event.toolCallId);
              if (toolCall) {
                toolCall.result = clone(event.output);
                toolCall.status = 'completed';
              }
            });
            break;

          case 'error':
            throw event.error;
        }
      }

      // Check if stopped because agent wanted to continue but hit limit
      const finishReason = await result.finishReason;
      if (finishReason === 'tool-calls') {
        this._stoppedAtLimit = true;
        this._status = 'awaiting_continue';
      } else {
        this._status = 'ready';
      }
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
   * Continue the conversation after hitting the step limit
   * @param model Optional model ID to use (defaults to DEFAULT_MODEL)
   */
  async continueConversation(model?: string): Promise<void> {
    if (this._status !== 'awaiting_continue' || !this._conversationId) return;

    // Reset step tracking for another round
    this._stoppedAtLimit = false;
    this._error = null;

    // Create assistant message placeholder and persist
    const assistantMessageId = await addMessageToConversation(this._conversationId, {
      role: 'assistant',
      content: '',
      toolCalls: []
    });
    this.currentAssistantMessageId = assistantMessageId;
    // Reset tool tracking for new message
    this.hasHadToolCalls = false;
    this.hasTextAfterTools = false;
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

      // Build messages for API (includes all previous messages with tool calls/results)
      const coreMessages: ModelMessage[] = [];
      for (const m of this._messages) {
        // Skip empty assistant messages
        if (m.role === 'assistant' && !m.content && !m.toolCalls?.length) {
          continue;
        }

        if (m.role === 'user') {
          coreMessages.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant') {
          // Build assistant message with tool calls
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
          coreMessages.push({
            role: 'assistant',
            content: parts.length > 0 ? parts : m.content
          });

          // If there are tool calls with results, add a tool message
          const toolResults = m.toolCalls?.filter((tc) => tc.result !== undefined) ?? [];
          if (toolResults.length > 0) {
            coreMessages.push({
              role: 'tool',
              content: toolResults.map((tc) => ({
                type: 'tool-result',
                toolCallId: tc.id,
                toolName: tc.name,
                output:
                  typeof tc.result === 'string'
                    ? { type: 'text' as const, value: tc.result }
                    : { type: 'json' as const, value: tc.result }
              }))
            } as ModelMessage);
          }
        } else {
          coreMessages.push({ role: 'system', content: m.content });
        }
      }

      // Create tools
      const tools = {
        ...createNoteTools(),
        ...createEpubTools(),
        ...createPdfTools(),
        ...createRoutineTools()
      };

      // Create OpenRouter provider
      const openrouter = createOpenRouter({
        baseURL: this.proxyUrl,
        apiKey: 'proxy-handled'
      });

      // Stream the response
      const result = streamText({
        model: openrouter(model || DEFAULT_MODEL),
        system: SYSTEM_PROMPT,
        messages: coreMessages,
        tools,
        stopWhen: stepCountIs(TOOL_CALL_STEP_LIMIT),
        abortSignal: this.abortController.signal
      });

      this._status = 'streaming';

      // Process the stream
      for await (const event of result.fullStream) {
        switch (event.type) {
          case 'text-delta':
            if (this.hasHadToolCalls && !this.hasTextAfterTools) {
              this.hasTextAfterTools = true;
              this.updateLastAssistantMessage((msg) => {
                if (msg.content.trim()) {
                  msg.content += TOOL_BREAK_MARKER;
                }
              });
            }
            this.updateLastAssistantMessage((msg) => {
              msg.content += event.text;
            });
            break;

          case 'tool-call':
            this.hasHadToolCalls = true;
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
            // Clone the output to ensure it's plain JSON (no proxies or reactive metadata)
            this.updateLastAssistantMessage((msg) => {
              const toolCall = msg.toolCalls?.find((tc) => tc.id === event.toolCallId);
              if (toolCall) {
                toolCall.result = clone(event.output);
                toolCall.status = 'completed';
              }
            });
            break;

          case 'error':
            throw event.error;
        }
      }

      // Check if stopped because agent wanted to continue but hit limit
      const finishReason = await result.finishReason;
      if (finishReason === 'tool-calls') {
        this._stoppedAtLimit = true;
        this._status = 'awaiting_continue';
      } else {
        this._status = 'ready';
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this._status = 'ready';
        return;
      }

      this._error = error instanceof Error ? error : new Error('Unknown error');
      this._status = 'error';

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
   * Clear all messages and reset conversation
   */
  clearMessages(): void {
    this._messages = [];
    this._conversationId = null;
    this.currentAssistantMessageId = null;
    this._error = null;
    this._status = 'ready';
    this._stoppedAtLimit = false;
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

      // Persist to OPFS (fire-and-forget during streaming)
      if (this._conversationId && this.currentAssistantMessageId) {
        void updateConversationMessage(
          this._conversationId,
          this.currentAssistantMessageId,
          {
            content: msg.content,
            toolCalls: msg.toolCalls as PersistedToolCall[] | undefined
          }
        );
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
