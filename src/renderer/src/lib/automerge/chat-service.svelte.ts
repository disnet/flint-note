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
import { createNoteTypeTools } from './notetype-tools.svelte';
import { createEpubTools } from './epub-tools.svelte';
import { createPdfTools } from './pdf-tools.svelte';
import { createRoutineTools } from './routine-tools.svelte';
import { createDeckTools } from './deck-tools.svelte';
import {
  createConversation,
  addMessageToConversation,
  updateConversationMessage,
  getConversation,
  getNoteTypesContextForPrompt
} from './state.svelte';
import { clone } from './utils';
import type { PersistedToolCall } from './types';
import { DEFAULT_MODEL } from '../../config/models';

/**
 * Tool activity state for inline widget display during streaming
 */
export interface ToolActivity {
  /** Whether tools are currently being used */
  isActive: boolean;
  /** Current step name (tool being executed) */
  currentStep?: string;
}

/**
 * Message format for chat UI
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  createdAt: Date;
  /** Tool activity state for inline widget display during streaming */
  toolActivity?: ToolActivity;
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
  /** Commentary text that preceded this tool call (captured from step) */
  commentary?: string;
}

/**
 * Aggregated tool call with message context for widget display
 */
export interface AggregatedToolCall extends ToolCall {
  messageId: string;
  timestamp: Date;
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

const BASE_SYSTEM_PROMPT = `You are an AI assistant for Flint, an intelligent note-taking system designed for natural conversation-based knowledge management. Help users capture, organize, and discover knowledge through intuitive conversation. Be proactive, direct, and substantive.

## Note Operations

When users ask about their notes:
- Use search_notes to find relevant notes - returns context snippets around matches, not full content
- Use get_note to read the full content of a specific note by ID (use this after search_notes if you need complete context)
- Use list_notes to see recent notes with content previews, optionally filtered by type
- Use get_backlinks to find notes that link to a specific note

**Search workflow:** search_notes returns snippets showing where query matches occur. If you need the full note content to answer a question or make edits, follow up with get_note using the note ID from search results.

When users want to modify notes:
- Use create_note to make new notes
- Use update_note to change existing notes (title, content, or properties)
- Use change_note_type to convert a note to a different type
- Use archive_note to remove notes (soft delete, can be recovered)
- Before creating a note of a specific type, use get_note_type to understand the type's properties and purpose

## Note Type Operations

- Use list_note_types to see all available note types with their purposes
- Use get_note_type to get detailed info about a type including its property schema
- Use create_note_type, update_note_type, archive_note_type to manage custom types
- System types (default, daily, epub, pdf, webpage, deck) cannot be modified or archived

## Document Tools (EPUB/PDF)

**Important: Documents can be very large (books can exceed 200k tokens). Always follow this pattern:**

1. **Get structure first** - Call get_document_structure (EPUB) or get_pdf_structure (PDF) to see the table of contents/outline
2. **Request specific chunks** - Use get_document_chunk or get_pdf_chunk with specific chapter/page references
3. **Search when needed** - Use search_document_text or search_pdf_text to find specific passages without loading everything

EPUB chunk references:
- \`{ type: "chapter", index: N }\` - Get a specific chapter by index
- \`{ type: "token_chunk", index: N }\` - For flat books without chapters

PDF chunk references:
- \`{ type: "page", pageNumber: N }\` - Get a specific page
- \`{ type: "pages", start: N, end: M }\` - Get a range of pages

EPUB/PDF notes can be found using list_notes or search_notes with type "type-epub" or "type-pdf".

## Routine Operations

Routines are persistent tasks with instructions that survive across conversations.

- Use list_routines to see available routines, filter by status or type
- Use get_routine to read full details including instructions and materials
- Use create_routine to make new routines with optional recurring schedules
- Use update_routine to modify existing routines
- Use complete_routine to mark as completed (records completion history)
- Use add_routine_material / remove_routine_material to manage supplementary materials
- Use delete_routine to archive a routine

Routine types:
- "routine" - Recurring scheduled tasks (weekly reviews, daily standups)
- "backlog" - One-off tasks for later

**Backlog pattern:** When you discover issues during other work (broken links, inconsistencies, cleanup opportunities), silently create a backlog routine to track it. Do NOT interrupt the user - continue with your primary task and let them review backlog items later.

## Deck Operations

Decks are saved filtered views of notes - like database queries that users can revisit. Use decks to help users organize and browse their notes by specific criteria.

- Use list_decks to see all saved decks
- Use get_deck to view a deck's full configuration (views, filters, columns, sort)
- Use create_deck to make new decks with custom filters
- Use update_deck to modify deck configuration
- Use archive_deck to remove a deck
- Use run_deck_query to execute a deck's query and preview matching notes

**Deck concepts:**
- **Views**: Each deck can have multiple named views (like tabs), each with its own filters
- **Filters**: Conditions that notes must match. System fields for filtering:
  - \`type\` - matches by type NAME (e.g., "Movies", "Meeting Notes")
  - \`title\` - note title
  - \`created\` - creation date (ISO format)
  - \`updated\` - last updated date (ISO format)
  - \`archived\` - archived status (boolean)
  - Custom properties: use \`props.\` prefix (e.g., "props.status", "props.priority")
- **Operators**: =, !=, >, <, >=, <=, LIKE (pattern match), IN, NOT IN, BETWEEN
- **Columns**: Which fields to display (title, type, created, updated, or props.* for custom properties)
- **Sort**: Field and order (asc/desc) for result ordering (e.g., "updated", "title", "props.priority")

**When to create decks:**
- User wants to track notes matching certain criteria (e.g., "all meeting notes from this month")
- User needs a reusable query they'll check regularly
- User wants to organize notes by custom properties (e.g., "tasks by priority")

**Example deck creation:**
\`\`\`
create_deck({
  title: "Recent Project Notes",
  views: [{
    name: "This Week",
    filters: [
      { field: "type", value: "Project" },
      { field: "updated", operator: ">=", value: "2024-01-01" }
    ],
    sort: { field: "updated", order: "desc" }
  }]
})
\`\`\`

**Before creating decks with property filters:**
- Use \`get_note_type\` to check what properties are available for the target type
- Filter field names must exactly match property names defined on the note type
- System fields (type, title, created, updated, archived) are always available
- If filtering by multiple types, ensure the property exists on ALL filtered types

## Communication Style

**Wikilink format:** Always use ID-only format when referencing notes:
- Correct: \`[[n-xxxxxxxx]]\` - The UI automatically displays the current note title
- Do NOT use display text like \`[[n-xxxxxxxx|Title]]\` - it's redundant and can become stale

Example: "I found your note [[n-abc12345]] which discusses the meeting agenda."

**Be direct and substantive:**
- Focus on ideas and connections rather than praising the user
- Make genuine connections without overstating their significance
- Offer constructive engagement without artificial enthusiasm

**Confirm before changes:** Always confirm before creating, updating, or archiving notes.`;

/**
 * Build the complete system prompt with dynamic context sections.
 * Includes note types available in the vault for AI context.
 */
function buildSystemPrompt(): string {
  const noteTypesContext = getNoteTypesContextForPrompt();

  return `${BASE_SYSTEM_PROMPT}

${noteTypesContext}`;
}

/**
 * Build a date/time context message to inform the AI of the current time.
 * Returns a formatted string with the current date, time, and timezone.
 */
function buildDateTimeContext(): string {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  return `Current date and time: ${formattedDate}, ${formattedTime} (${timezone})`;
}

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
  // Track text in the current step (for associating with tool calls)
  private currentStepText = '';
  // Buffer for pending step text - only added to content when step finishes without tool calls
  private pendingStepText = '';
  // Track if current step has tool calls (to decide whether to add buffered text to content)
  private currentStepHasToolCalls = false;
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
    // Reset step tracking for new message
    this.currentStepText = '';
    this.pendingStepText = '';
    this.currentStepHasToolCalls = false;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used for timestamp, not reactive state
      createdAt: new Date(),
      // Start with tool activity active (will show "Thinking...")
      toolActivity: { isActive: true }
    };
    this._messages = [...this._messages, assistantMessage];

    this._status = 'submitting';

    try {
      // Create abort controller for this request
      this.abortController = new AbortController();

      // Build messages for API
      // Start with date/time context, then filter out empty assistant messages
      const coreMessages: ModelMessage[] = [
        { role: 'system', content: buildDateTimeContext() }
      ];
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

      // Create tools (note tools + note type tools + EPUB tools + PDF tools + routine tools + deck tools)
      const tools = {
        ...createNoteTools(),
        ...createNoteTypeTools(),
        ...createEpubTools(),
        ...createPdfTools(),
        ...createRoutineTools(),
        ...createDeckTools()
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
        system: buildSystemPrompt(),
        messages: coreMessages,
        tools,
        stopWhen: stepCountIs(TOOL_CALL_STEP_LIMIT), // Allow up to TOOL_CALL_STEP_LIMIT tool call rounds
        abortSignal: this.abortController.signal
      });

      this._status = 'streaming';

      // Process the stream with deferred content accumulation
      // Text is buffered until we know if it's tool commentary or final response
      for await (const event of result.fullStream) {
        switch (event.type) {
          case 'start-step':
            // Reset step tracking at the beginning of each step
            this.currentStepText = '';
            this.pendingStepText = '';
            this.currentStepHasToolCalls = false;
            // Mark tool activity as active
            this.updateLastAssistantMessage((msg) => {
              msg.toolActivity = { isActive: true };
            });
            break;

          case 'text-delta':
            // Buffer text - don't add to content yet
            // We'll add it to content only if this step has no tool calls
            this.currentStepText += event.text;
            this.pendingStepText += event.text;
            break;

          case 'tool-call': {
            // This step has tool calls - the buffered text is commentary
            this.currentStepHasToolCalls = true;

            // Check if the tool call is invalid (e.g., Zod validation failed)
            // The AI SDK marks invalid tool calls with invalid: true and includes error details
            const toolCallEvent = event as typeof event & {
              invalid?: boolean;
              error?: { name?: string; cause?: { cause?: { message?: string } } };
            };
            const isInvalid = toolCallEvent.invalid === true;
            let errorMessage: string | undefined;
            if (isInvalid && toolCallEvent.error) {
              // Extract error message from nested structure
              // error.cause.cause.message contains the Zod error details
              const zodMessage = toolCallEvent.error.cause?.cause?.message;
              if (zodMessage) {
                try {
                  // Parse Zod error JSON to get a cleaner message
                  const zodErrors = JSON.parse(zodMessage);
                  if (Array.isArray(zodErrors) && zodErrors.length > 0) {
                    errorMessage = zodErrors
                      .map(
                        (e: { path?: string[]; message?: string }) =>
                          `${e.path?.join('.') || 'input'}: ${e.message || 'invalid'}`
                      )
                      .join('; ');
                  }
                } catch {
                  errorMessage = zodMessage;
                }
              }
              if (!errorMessage) {
                errorMessage = toolCallEvent.error.name || 'Tool input validation failed';
              }
            }

            // Add tool call with the preceding commentary from this step
            this.updateLastAssistantMessage((msg) => {
              if (!msg.toolCalls) msg.toolCalls = [];
              msg.toolCalls.push({
                id: event.toolCallId,
                name: event.toolName,
                args: event.input as Record<string, unknown>,
                status: isInvalid ? 'error' : 'running',
                commentary: this.pendingStepText.trim() || undefined,
                error: errorMessage
              });
              // Update tool activity with current tool name
              msg.toolActivity = {
                isActive: true,
                currentStep: event.toolName
              };
            });
            // Clear pending text - it's now attached to the tool call as commentary
            this.pendingStepText = '';
            this.currentStepText = '';
            break;
          }

          case 'tool-result':
            // Update tool call with result
            // Clone the output to ensure it's plain JSON (no proxies or reactive metadata)
            this.updateLastAssistantMessage((msg) => {
              const toolCall = msg.toolCalls?.find((tc) => tc.id === event.toolCallId);
              if (toolCall) {
                const clonedOutput = clone(event.output);
                toolCall.result = clonedOutput;

                // Detect error results in various formats
                let isError = false;
                let errorMessage: string | undefined;

                // Check if output is a string that looks like an error
                if (typeof clonedOutput === 'string') {
                  // String output might be an error message
                  const lower = clonedOutput.toLowerCase();
                  if (
                    lower.includes('error') ||
                    lower.includes('invalid') ||
                    lower.includes('failed')
                  ) {
                    isError = true;
                    errorMessage = clonedOutput;
                  }
                } else if (clonedOutput && typeof clonedOutput === 'object') {
                  const output = clonedOutput as Record<string, unknown>;
                  // Our tools return { success: false, error: "..." }
                  if (output.success === false && typeof output.error === 'string') {
                    isError = true;
                    errorMessage = output.error;
                  }
                  // AI SDK validation errors may have isError flag
                  else if (output.isError === true) {
                    isError = true;
                    errorMessage =
                      typeof output.error === 'string'
                        ? output.error
                        : typeof output.message === 'string'
                          ? output.message
                          : 'Tool execution failed';
                  }
                  // Check for { error: "..." } without success field
                  else if (
                    typeof output.error === 'string' &&
                    output.success === undefined
                  ) {
                    isError = true;
                    errorMessage = output.error;
                  }
                }

                if (isError) {
                  toolCall.status = 'error';
                  toolCall.error = errorMessage;
                } else {
                  toolCall.status = 'completed';
                }
              }
            });
            break;

          case 'finish-step':
            // Step finished - if no tool calls, add buffered text to content
            if (!this.currentStepHasToolCalls && this.pendingStepText.trim()) {
              this.updateLastAssistantMessage((msg) => {
                msg.content += this.pendingStepText;
              });
            }
            this.pendingStepText = '';
            break;

          case 'error':
            throw event.error;
        }
      }

      // Clear tool activity after streaming completes and mark any stuck tools as errors
      this.updateLastAssistantMessage((msg) => {
        msg.toolActivity = { isActive: false };
        // Mark any tools still in 'running' status as errors (no result was received)
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            if (tc.status === 'running') {
              tc.status = 'error';
              tc.error = 'Tool did not return a result';
            }
          }
        }
      });

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
        // Clear tool activity on abort
        this.updateLastAssistantMessage((msg) => {
          msg.toolActivity = { isActive: false };
        });
        return;
      }

      this._error = error instanceof Error ? error : new Error('Unknown error');
      this._status = 'error';

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update assistant message to show error and mark any running tools as failed
      this.updateLastAssistantMessage((msg) => {
        // Clear tool activity
        msg.toolActivity = { isActive: false };

        // Mark any running tool calls as error
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            if (tc.status === 'running') {
              tc.status = 'error';
              tc.error = errorMessage;
            }
          }
        }

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
    // Reset step tracking for new message
    this.currentStepText = '';
    this.pendingStepText = '';
    this.currentStepHasToolCalls = false;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used for timestamp, not reactive state
      createdAt: new Date(),
      // Start with tool activity active (will show "Thinking...")
      toolActivity: { isActive: true }
    };
    this._messages = [...this._messages, assistantMessage];

    this._status = 'submitting';

    try {
      // Create abort controller for this request
      this.abortController = new AbortController();

      // Build messages for API (includes all previous messages with tool calls/results)
      // Start with date/time context
      const coreMessages: ModelMessage[] = [
        { role: 'system', content: buildDateTimeContext() }
      ];
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
        ...createRoutineTools(),
        ...createDeckTools()
      };

      // Create OpenRouter provider
      const openrouter = createOpenRouter({
        baseURL: this.proxyUrl,
        apiKey: 'proxy-handled'
      });

      // Stream the response
      const result = streamText({
        model: openrouter(model || DEFAULT_MODEL),
        system: buildSystemPrompt(),
        messages: coreMessages,
        tools,
        stopWhen: stepCountIs(TOOL_CALL_STEP_LIMIT),
        abortSignal: this.abortController.signal
      });

      this._status = 'streaming';

      // Process the stream with deferred content accumulation
      for await (const event of result.fullStream) {
        switch (event.type) {
          case 'start-step':
            // Reset step tracking at the beginning of each step
            this.currentStepText = '';
            this.pendingStepText = '';
            this.currentStepHasToolCalls = false;
            // Mark tool activity as active
            this.updateLastAssistantMessage((msg) => {
              msg.toolActivity = { isActive: true };
            });
            break;

          case 'text-delta':
            // Buffer text - don't add to content yet
            this.currentStepText += event.text;
            this.pendingStepText += event.text;
            break;

          case 'tool-call': {
            // This step has tool calls - the buffered text is commentary
            this.currentStepHasToolCalls = true;

            // Check if the tool call is invalid (e.g., Zod validation failed)
            const toolCallEvent = event as typeof event & {
              invalid?: boolean;
              error?: { name?: string; cause?: { cause?: { message?: string } } };
            };
            const isInvalid = toolCallEvent.invalid === true;
            let errorMessage: string | undefined;
            if (isInvalid && toolCallEvent.error) {
              const zodMessage = toolCallEvent.error.cause?.cause?.message;
              if (zodMessage) {
                try {
                  const zodErrors = JSON.parse(zodMessage);
                  if (Array.isArray(zodErrors) && zodErrors.length > 0) {
                    errorMessage = zodErrors
                      .map(
                        (e: { path?: string[]; message?: string }) =>
                          `${e.path?.join('.') || 'input'}: ${e.message || 'invalid'}`
                      )
                      .join('; ');
                  }
                } catch {
                  errorMessage = zodMessage;
                }
              }
              if (!errorMessage) {
                errorMessage = toolCallEvent.error.name || 'Tool input validation failed';
              }
            }

            this.updateLastAssistantMessage((msg) => {
              if (!msg.toolCalls) msg.toolCalls = [];
              msg.toolCalls.push({
                id: event.toolCallId,
                name: event.toolName,
                args: event.input as Record<string, unknown>,
                status: isInvalid ? 'error' : 'running',
                commentary: this.pendingStepText.trim() || undefined,
                error: errorMessage
              });
              msg.toolActivity = {
                isActive: true,
                currentStep: event.toolName
              };
            });
            this.pendingStepText = '';
            this.currentStepText = '';
            break;
          }

          case 'tool-result':
            // Clone the output to ensure it's plain JSON (no proxies or reactive metadata)
            this.updateLastAssistantMessage((msg) => {
              const toolCall = msg.toolCalls?.find((tc) => tc.id === event.toolCallId);
              if (toolCall) {
                const clonedOutput = clone(event.output);
                toolCall.result = clonedOutput;

                // Detect error results in various formats
                let isError = false;
                let errorMessage: string | undefined;

                // Check if output is a string that looks like an error
                if (typeof clonedOutput === 'string') {
                  // String output might be an error message
                  const lower = clonedOutput.toLowerCase();
                  if (
                    lower.includes('error') ||
                    lower.includes('invalid') ||
                    lower.includes('failed')
                  ) {
                    isError = true;
                    errorMessage = clonedOutput;
                  }
                } else if (clonedOutput && typeof clonedOutput === 'object') {
                  const output = clonedOutput as Record<string, unknown>;
                  // Our tools return { success: false, error: "..." }
                  if (output.success === false && typeof output.error === 'string') {
                    isError = true;
                    errorMessage = output.error;
                  }
                  // AI SDK validation errors may have isError flag
                  else if (output.isError === true) {
                    isError = true;
                    errorMessage =
                      typeof output.error === 'string'
                        ? output.error
                        : typeof output.message === 'string'
                          ? output.message
                          : 'Tool execution failed';
                  }
                  // Check for { error: "..." } without success field
                  else if (
                    typeof output.error === 'string' &&
                    output.success === undefined
                  ) {
                    isError = true;
                    errorMessage = output.error;
                  }
                }

                if (isError) {
                  toolCall.status = 'error';
                  toolCall.error = errorMessage;
                } else {
                  toolCall.status = 'completed';
                }
              }
            });
            break;

          case 'finish-step':
            // Step finished - if no tool calls, add buffered text to content
            if (!this.currentStepHasToolCalls && this.pendingStepText.trim()) {
              this.updateLastAssistantMessage((msg) => {
                msg.content += this.pendingStepText;
              });
            }
            this.pendingStepText = '';
            break;

          case 'error':
            throw event.error;
        }
      }

      // Clear tool activity after streaming completes and mark any stuck tools as errors
      this.updateLastAssistantMessage((msg) => {
        msg.toolActivity = { isActive: false };
        // Mark any tools still in 'running' status as errors (no result was received)
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            if (tc.status === 'running') {
              tc.status = 'error';
              tc.error = 'Tool did not return a result';
            }
          }
        }
      });

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
        // Clear tool activity on abort
        this.updateLastAssistantMessage((msg) => {
          msg.toolActivity = { isActive: false };
        });
        return;
      }

      this._error = error instanceof Error ? error : new Error('Unknown error');
      this._status = 'error';

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update assistant message to show error and mark any running tools as failed
      this.updateLastAssistantMessage((msg) => {
        // Clear tool activity
        msg.toolActivity = { isActive: false };

        // Mark any running tool calls as error
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            if (tc.status === 'running') {
              tc.status = 'error';
              tc.error = errorMessage;
            }
          }
        }

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
