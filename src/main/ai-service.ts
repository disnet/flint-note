import { createGateway, type GatewayProvider } from '@ai-sdk/gateway';
import { generateText, streamText, ModelMessage, stepCountIs } from 'ai';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from 'ai/mcp-stdio';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SecureStorageService } from './secure-storage-service';
import { logger } from './logger';
import { NoteService } from './note-service';

interface FrontendMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date | string;
  toolCalls?: unknown[];
}

export class AIService extends EventEmitter {
  private currentModelName: string;
  private conversationHistories: Map<string, ModelMessage[]> = new Map();
  private currentConversationId: string | null = null;
  private mcpClient: unknown;
  private gateway: GatewayProvider;
  private systemPrompt: string;
  private noteService: NoteService | null;
  private readonly maxConversationHistory = 20;
  private readonly maxConversations = 100;

  constructor(gateway: GatewayProvider, noteService: NoteService | null) {
    super();
    this.currentModelName = 'openai/gpt-4o-mini';
    this.systemPrompt = this.loadSystemPrompt();
    logger.info('AI Service constructed', { model: this.currentModelName });
    this.initializeFlintMcpServer();
    this.gateway = gateway;
    this.noteService = noteService;
  }

  static async of(
    secureStorage: SecureStorageService,
    noteService: NoteService | null = null
  ): Promise<AIService> {
    const gateway = createGateway({
      apiKey: (await secureStorage.getApiKey('gateway')).key
    });
    return new AIService(gateway, noteService);
  }

  private switchModel(modelName: string): void {
    if (modelName !== this.currentModelName) {
      logger.info('Switching AI model', {
        from: this.currentModelName,
        to: modelName
      });
      this.currentModelName = modelName;
    }
  }

  private getFlintToolSchemas(): Record<string, { inputSchema: z.ZodTypeAny }> {
    return {
      // Note Management Tools
      create_note: {
        inputSchema: z.object({
          type: z
            .string()
            .optional()
            .describe('Note type (must exist) - for single note creation'),
          title: z
            .string()
            .optional()
            .describe('Title of the note - for single note creation'),
          content: z
            .string()
            .optional()
            .describe(
              'Content of the note in markdown format - for single note creation'
            ),
          metadata: z
            .record(z.any())
            .optional()
            .describe('Additional metadata fields for the note'),
          notes: z
            .array(
              z.object({
                type: z.string().describe('Note type (must exist)'),
                title: z.string().describe('Title of the note'),
                content: z.string().describe('Content of the note in markdown format'),
                metadata: z
                  .record(z.any())
                  .optional()
                  .describe('Additional metadata fields for the note')
              })
            )
            .optional()
            .describe('Array of notes to create - for batch creation'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on')
        })
      },
      get_note: {
        inputSchema: z.object({
          identifier: z
            .string()
            .describe('Note identifier in format "type/filename" or full path'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on'),
          fields: z
            .array(z.string())
            .optional()
            .describe('Optional array of field names to include (supports dot notation)')
        })
      },
      get_notes: {
        inputSchema: z.object({
          identifiers: z.array(z.string()).describe('Array of note identifiers'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on'),
          fields: z
            .array(z.string())
            .optional()
            .describe('Optional array of field names to include')
        })
      },
      update_note: {
        inputSchema: z.object({
          identifier: z.string().describe('Note identifier'),
          content: z.string().optional().describe('New content for the note'),
          content_hash: z.string().describe('Content hash for optimistic locking'),
          metadata: z.record(z.any()).optional().describe('Metadata fields to update'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on')
        })
      },
      delete_note: {
        inputSchema: z.object({
          identifier: z.string().describe('Note identifier (type/filename format)'),
          confirm: z
            .boolean()
            .optional()
            .describe('Explicit confirmation required for deletion'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on')
        })
      },
      rename_note: {
        inputSchema: z.object({
          identifier: z.string().describe('Note identifier'),
          new_title: z.string().describe('New display title for the note'),
          content_hash: z.string().describe('Content hash for optimistic locking'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on')
        })
      },
      move_note: {
        inputSchema: z.object({
          identifier: z
            .string()
            .describe('Current note identifier in type/filename format'),
          new_type: z.string().describe('Target note type to move the note to'),
          content_hash: z
            .string()
            .describe('Content hash for optimistic locking to prevent conflicts'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on')
        })
      },
      // list_notes_by_type: {
      //   inputSchema: z.object({
      //     type: z.string().describe('Note type to list'),
      //     limit: z
      //       .number()
      //       .optional()
      //       .describe('Maximum number of results (default: 50)'),
      //     vault_id: z.string().optional().describe('Optional vault ID to operate on')
      //   })
      // },
      // get_note_info: {
      //   inputSchema: z.object({
      //     title_or_filename: z.string().describe('Note title or filename to look up'),
      //     type: z.string().optional().describe('Optional: note type to narrow search'),
      //     vault_id: z.string().optional().describe('Optional vault ID to operate on')
      //   })
      // },

      // Search Tools
      search_notes: {
        inputSchema: z.object({
          query: z
            .string()
            .optional()
            .describe('Search query or regex pattern (empty returns all notes)'),
          type_filter: z.string().optional().describe('Optional filter by note type'),
          limit: z
            .number()
            .optional()
            .describe('Maximum number of results (default: 10)'),
          use_regex: z
            .boolean()
            .optional()
            .describe('Enable regex pattern matching (default: false)'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on'),
          fields: z
            .array(z.string())
            .optional()
            .describe('Optional array of field names to include')
        })
      },
      search_notes_advanced: {
        inputSchema: z.object({
          type: z.string().optional().describe('Filter by note type'),
          metadata_filters: z
            .array(
              z.object({
                key: z.string().describe('Metadata key to filter on'),
                value: z.string().describe('Value to match'),
                operator: z
                  .string()
                  .optional()
                  .describe(
                    "Comparison operator: '=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'"
                  )
              })
            )
            .optional()
            .describe('Array of metadata filters'),
          updated_within: z
            .string()
            .optional()
            .describe('Find notes updated within time period (e.g., "7d", "1w", "2m")'),
          updated_before: z
            .string()
            .optional()
            .describe('Find notes updated before time period'),
          created_within: z
            .string()
            .optional()
            .describe('Find notes created within time period'),
          created_before: z
            .string()
            .optional()
            .describe('Find notes created before time period'),
          content_contains: z.string().optional().describe('Search within note content'),
          sort: z
            .array(
              z.object({
                field: z
                  .string()
                  .describe("Field: 'title', 'type', 'created', 'updated', 'size'"),
                order: z.string().describe("Order: 'asc', 'desc'")
              })
            )
            .optional()
            .describe('Sort order for results'),
          limit: z
            .number()
            .optional()
            .describe('Maximum number of results (default: 50)'),
          offset: z
            .number()
            .optional()
            .describe('Number of results to skip (default: 0)'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on'),
          fields: z
            .array(z.string())
            .optional()
            .describe('Optional array of field names to include')
        })
      },
      // search_notes_sql: {
      //   inputSchema: z.object({
      //     query: z.string().describe('SQL SELECT query (only SELECT queries allowed)'),
      //     params: z
      //       .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      //       .optional()
      //       .describe('Optional parameters for parameterized queries'),
      //     limit: z
      //       .number()
      //       .optional()
      //       .describe('Maximum number of results (default: 1000)'),
      //     timeout: z
      //       .number()
      //       .optional()
      //       .describe('Query timeout in milliseconds (default: 30000)'),
      //     vault_id: z.string().optional().describe('Optional vault ID to operate on'),
      //     fields: z
      //       .array(z.string())
      //       .optional()
      //       .describe('Optional array of field names to include')
      //   })
      // },

      // Note Type Management Tools
      create_note_type: {
        inputSchema: z.object({
          type_name: z.string().describe('Name of the note type (filesystem-safe)'),
          description: z
            .string()
            .describe('Description of the note type purpose and usage'),
          agent_instructions: z
            .array(z.string())
            .optional()
            .describe('Optional custom agent instructions for this note type'),
          metadata_schema: z
            .object({
              fields: z
                .array(
                  z.object({
                    name: z.string().describe('Name of the metadata field'),
                    type: z
                      .string()
                      .describe(
                        "Type: 'string', 'number', 'boolean', 'date', 'array', 'select'"
                      ),
                    description: z
                      .string()
                      .optional()
                      .describe('Optional description of the field'),
                    required: z
                      .boolean()
                      .optional()
                      .describe('Whether this field is required'),
                    constraints: z
                      .record(z.any())
                      .optional()
                      .describe('Optional field constraints (min, max, options, etc.)'),
                    default: z
                      .any()
                      .optional()
                      .describe('Optional default value for the field')
                  })
                )
                .optional()
                .describe('Array of metadata field definitions'),
              version: z.string().optional().describe('Optional schema version')
            })
            .optional()
            .describe('Optional metadata schema definition'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on')
        })
      },
      list_note_types: {
        inputSchema: z.object({
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on')
        })
      },
      get_note_type_info: {
        inputSchema: z.object({
          type_name: z.string().describe('Name of the note type to get information for'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on')
        })
      },
      update_note_type: {
        inputSchema: z.object({
          type_name: z.string().describe('Name of the note type to update'),
          instructions: z
            .string()
            .optional()
            .describe('New agent instructions for the note type'),
          description: z
            .string()
            .optional()
            .describe('New description for the note type'),
          metadata_schema: z
            .array(
              z.object({
                name: z.string().describe('Name of the metadata field'),
                type: z
                  .string()
                  .describe(
                    "Type: 'string', 'number', 'boolean', 'date', 'array', 'select'"
                  ),
                description: z
                  .string()
                  .optional()
                  .describe('Optional description of the field'),
                required: z
                  .boolean()
                  .optional()
                  .describe('Whether this field is required'),
                constraints: z
                  .record(z.any())
                  .optional()
                  .describe('Optional field constraints (min, max, options, etc.)'),
                default: z
                  .any()
                  .optional()
                  .describe('Optional default value for the field')
              })
            )
            .optional()
            .describe('Array of metadata field definitions'),
          content_hash: z.string().describe('Content hash for optimistic locking'),
          vault_id: z
            .string()
            .nullable()
            .optional()
            .describe('Optional vault ID to operate on')
        })
      },
      delete_note_type: {
        inputSchema: z.object({
          type_name: z.string().describe('Name of the note type to delete'),
          action: z.string().describe("Action: 'error', 'migrate', or 'delete'"),
          target_type: z
            .string()
            .optional()
            .describe('Target note type for migration (required when action is migrate)'),
          confirm: z
            .boolean()
            .optional()
            .describe('Explicit confirmation required for deletion')
        })
      },

      // Vault Management Tools
      get_current_vault: {
        inputSchema: z.object({})
      },
      list_vaults: {
        inputSchema: z.object({})
      },

      // Link Management Tools
      get_note_links: {
        inputSchema: z.object({
          identifier: z.string().describe('Note identifier (type/filename format)')
        })
      },
      get_backlinks: {
        inputSchema: z.object({
          identifier: z.string().describe('Note identifier (type/filename format)')
        })
      },
      find_broken_links: {
        inputSchema: z.object({})
      }
    };
  }

  private loadSystemPrompt(): string {
    try {
      // Try multiple possible locations for the prompt file
      const possiblePaths = [
        join(__dirname, 'system-prompt.md'),
        join(__dirname, '..', '..', 'src', 'main', 'system-prompt.md'),
        join(process.cwd(), 'src', 'main', 'system-prompt.md')
      ];

      for (const promptPath of possiblePaths) {
        try {
          return readFileSync(promptPath, 'utf-8').trim();
        } catch {
          // Continue to next path
        }
      }

      throw new Error('System prompt file not found in any expected location');
    } catch (error) {
      logger.error('Failed to load system prompt file', { error });
      // Fallback to inline prompt
      return `You are an AI assistant for Flint, a note-taking application. You help users manage their notes, answer questions, and provide assistance with organizing their knowledge. Be helpful, concise, and focused on note-taking and knowledge management tasks.

You have access to comprehensive note management tools including:
- Creating, reading, updating, and deleting notes
- Searching through note content and metadata
- Managing note types and vaults
- Handling note links and relationships
- Advanced search capabilities with SQL queries

When responding be sure to format references to notes in wikilinks syntax. For example, [[Note Title]] or [[daily/2023-09-25|September 25th, 2023]]

Use these tools to help users manage their notes effectively and answer their questions.`;
    }
  }

  private async getSystemMessage(): Promise<string> {
    const today = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const contextualInfo =
      `\n\n## Current Context\n\n` +
      `- **Today's Date**: ${today} (${dayOfWeek})\n` +
      `- **Timezone**: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n`;

    let noteTypeInfo = '';
    if (this.noteService) {
      const noteTypes = await this.noteService.listNoteTypes();
      noteTypeInfo = `## User's Current Note Types

  ${noteTypes
    .map(
      (nt) => `### ${nt.name}

  #### purpose
  ${nt.purpose}
  `
    )
    .join('\n')}`;
    }

    return this.systemPrompt + contextualInfo + noteTypeInfo;
  }

  private getConversationMessages(conversationId: string): ModelMessage[] {
    return this.conversationHistories.get(conversationId) || [];
  }

  private setConversationHistory(conversationId: string, history: ModelMessage[]): void {
    // Keep conversation history manageable
    if (history.length > this.maxConversationHistory) {
      history = history.slice(-this.maxConversationHistory);
    }
    this.conversationHistories.set(conversationId, history);
  }

  setActiveConversation(conversationId: string): void {
    this.currentConversationId = conversationId;

    // Create conversation if it doesn't exist
    if (!this.conversationHistories.has(conversationId)) {
      this.conversationHistories.set(conversationId, []);
      logger.info('Created new conversation', { conversationId });
    }

    logger.info('Switched active conversation', { conversationId });
  }

  setActiveConversationWithSync(
    conversationId: string,
    frontendMessages?: FrontendMessage[] | string
  ): void {
    this.currentConversationId = conversationId;

    // Handle messages that might be sent as JSON string or array
    let messagesArray: FrontendMessage[] = [];

    if (frontendMessages) {
      if (typeof frontendMessages === 'string') {
        try {
          messagesArray = JSON.parse(frontendMessages);
        } catch (parseError) {
          logger.warn('Failed to parse messages JSON string', { error: parseError });
          messagesArray = [];
        }
      } else if (Array.isArray(frontendMessages)) {
        messagesArray = frontendMessages;
      }
    }

    // If we have messages and no backend history, sync them
    if (messagesArray.length > 0 && !this.conversationHistories.has(conversationId)) {
      this.syncConversationFromFrontend(conversationId, messagesArray);
    } else if (!this.conversationHistories.has(conversationId)) {
      // Create empty conversation if it doesn't exist
      this.conversationHistories.set(conversationId, []);
      logger.info('Created new conversation', { conversationId });
    }

    logger.info('Switched active conversation with sync', {
      conversationId,
      syncedMessages: messagesArray.length
    });
  }

  createConversation(conversationId?: string): string {
    const id = conversationId || this.generateConversationId();

    // Clean up old conversations if we have too many
    if (this.conversationHistories.size >= this.maxConversations) {
      this.pruneOldConversations();
    }

    this.conversationHistories.set(id, []);
    this.currentConversationId = id;

    logger.info('Created new conversation', { conversationId: id });
    return id;
  }

  deleteConversation(conversationId: string): boolean {
    const existed = this.conversationHistories.delete(conversationId);

    if (this.currentConversationId === conversationId) {
      this.currentConversationId = null;
    }

    if (existed) {
      logger.info('Deleted conversation', { conversationId });
    }

    return existed;
  }

  getActiveConversationHistory(): ModelMessage[] {
    if (!this.currentConversationId) {
      return [];
    }
    return this.getConversationMessages(this.currentConversationId);
  }

  clearAllConversations(): void {
    this.conversationHistories.clear();
    this.currentConversationId = null;
    logger.info('Cleared all conversations');
  }

  restoreConversationHistory(conversationId: string, messages: ModelMessage[]): void {
    // Filter out system messages if they exist in the stored conversation
    const filteredMessages = messages.filter((msg) => msg.role !== 'system');

    // Apply length management
    let managedMessages = filteredMessages;
    if (managedMessages.length > this.maxConversationHistory) {
      managedMessages = managedMessages.slice(-this.maxConversationHistory);
    }

    this.conversationHistories.set(conversationId, managedMessages);
    logger.info('Restored conversation history', {
      conversationId,
      messageCount: managedMessages.length
    });
  }

  syncConversationFromFrontend(
    conversationId: string,
    frontendMessages: FrontendMessage[]
  ): void {
    // Convert frontend message format to AI service format
    const aiMessages: ModelMessage[] = frontendMessages
      .filter((msg) => msg.sender === 'user' || msg.sender === 'agent')
      .map((msg) => ({
        role: msg.sender === 'user' ? ('user' as const) : ('assistant' as const),
        content: msg.text || ''
      }))
      .filter((msg) => msg.content.trim() !== ''); // Remove empty messages

    this.restoreConversationHistory(conversationId, aiMessages);
  }

  private generateConversationId(): string {
    return `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private pruneOldConversations(): void {
    // Remove oldest conversations if we exceed the limit
    // Since Map maintains insertion order, we can remove the first entries
    const entries = Array.from(this.conversationHistories.entries());
    const toRemove = entries.slice(0, entries.length - this.maxConversations + 10); // Remove more than needed to avoid frequent pruning

    for (const [conversationId] of toRemove) {
      this.conversationHistories.delete(conversationId);
      logger.info('Pruned old conversation', { conversationId });
    }
  }

  async sendMessage(
    userMessage: string,
    conversationId?: string,
    modelName?: string
  ): Promise<{
    text: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      result?: string;
      error?: string;
    }>;
    hasToolCalls?: boolean;
    followUpResponse?: {
      text: string;
    };
  }> {
    try {
      // Switch model if specified
      if (modelName) {
        this.switchModel(modelName);
      }

      // Ensure we have an active conversation
      if (conversationId) {
        this.setActiveConversation(conversationId);
      } else if (!this.currentConversationId) {
        this.createConversation();
      }

      // Get conversation history
      const currentHistory = this.getConversationMessages(this.currentConversationId!);

      // Add user message to conversation history
      currentHistory.push({ role: 'user', content: userMessage });

      // Update conversation history with length management
      this.setConversationHistory(this.currentConversationId!, currentHistory);

      // Prepare messages for the model
      const systemMessage = await this.getSystemMessage();

      const messages: ModelMessage[] = [
        { role: 'system', content: systemMessage },
        ...this.getConversationMessages(this.currentConversationId!)
      ];

      // @ts-ignore: mcpClient types not exported yet
      const mcpTools = this.mcpClient
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (this.mcpClient as any).tools({
            schemas: this.getFlintToolSchemas()
          })
        : {};
      const result = await generateText({
        model: this.gateway(this.currentModelName),
        messages,
        tools: mcpTools as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        onStepFinish: (step) => {
          logger.info('AI step finished', { step });
        }
      });

      // Add assistant response to conversation history
      const updatedHistory = this.getConversationMessages(this.currentConversationId!);
      updatedHistory.push(...result.response.messages);
      this.setConversationHistory(this.currentConversationId!, updatedHistory);

      return { text: result.text };
    } catch (error) {
      logger.error('AI Service Error', { error });

      // Fallback to mock response if AI service fails
      const fallbackResponses = [
        "I'm sorry, I'm having trouble connecting to the AI service right now. Please try again later.",
        "It seems there's a temporary issue with my AI capabilities. Your message was received, but I can't process it at the moment.",
        "I'm experiencing some technical difficulties. Please check your API configuration and try again."
      ];

      return {
        text: fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)]
      };
    }
  }

  clearConversation(): void {
    if (this.currentConversationId) {
      this.conversationHistories.set(this.currentConversationId, []);
      logger.info('Cleared current conversation', {
        conversationId: this.currentConversationId
      });
    }
  }

  getConversationHistory(): Array<ModelMessage> {
    return [...this.getActiveConversationHistory()];
  }

  private async initializeFlintMcpServer(): Promise<void> {
    try {
      this.mcpClient = await createMCPClient({
        transport: new StdioMCPTransport({
          command: 'npx',
          args: ['@flint-note/server']
        })
      });
      logger.info('Flint MCP server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Flint MCP server', { error });
    }
  }

  async sendMessageStream(
    userMessage: string,
    requestId: string,
    conversationId?: string,
    modelName?: string
  ): Promise<void> {
    try {
      // Switch model if specified
      if (modelName) {
        this.switchModel(modelName);
      }

      // Ensure we have an active conversation
      if (conversationId) {
        this.setActiveConversation(conversationId);
      } else if (!this.currentConversationId) {
        this.createConversation();
      }

      // Get conversation history
      const currentHistory = this.getConversationMessages(this.currentConversationId!);

      // Add user message to conversation history
      currentHistory.push({ role: 'user', content: userMessage });

      // Update conversation history with length management
      this.setConversationHistory(this.currentConversationId!, currentHistory);

      // Prepare messages for the model
      const systemMessage = await this.getSystemMessage();

      const messages: ModelMessage[] = [
        { role: 'system', content: systemMessage },
        ...this.getConversationMessages(this.currentConversationId!)
      ];

      this.emit('stream-start', { requestId });

      // @ts-ignore: mcpClient types not exported yet
      const mcpTools = this.mcpClient
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (this.mcpClient as any).tools({
            schemas: this.getFlintToolSchemas()
          })
        : {};

      try {
        const result = streamText({
          model: this.gateway(this.currentModelName),
          messages,
          tools: mcpTools as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          stopWhen: stepCountIs(10), // Allow up to 5 steps for multi-turn tool calling
          onStepFinish: (step) => {
            // Handle tool calls from step content (AI SDK might put them in different places)
            const toolCalls =
              step.toolCalls ||
              (step.content
                ? step.content.filter((item) => item.type === 'tool-call')
                : []);

            if (toolCalls && toolCalls.length > 0) {
              toolCalls.forEach((toolCall) => {
                const toolResults = step.toolResults || [];
                const toolResult = toolResults.find(
                  (r) => r.toolCallId === toolCall.toolCallId
                );

                const toolCallData = {
                  id: toolCall.toolCallId,
                  name: toolCall.toolName,
                  arguments: toolCall.input || {},
                  result: toolResult?.output,
                  error: undefined
                };
                this.emit('stream-tool-call', { requestId, toolCall: toolCallData });
              });
            }
          }
        });

        let fullText = '';

        // Handle text streaming
        for await (const textChunk of result.textStream) {
          fullText += textChunk;
          this.emit('stream-chunk', { requestId, chunk: textChunk });
        }

        // Add assistant response to conversation history
        const finalHistory = this.getConversationMessages(this.currentConversationId!);
        finalHistory.push({ role: 'assistant', content: fullText });
        this.setConversationHistory(this.currentConversationId!, finalHistory);

        this.emit('stream-end', { requestId, fullText });
      } catch (streamError: unknown) {
        // Handle tool input validation errors specifically
        if (
          streamError &&
          typeof streamError === 'object' &&
          'name' in streamError &&
          (streamError.name === 'AI_InvalidToolInputError' ||
            streamError.name === 'InvalidToolInputError')
        ) {
          const errorObj = streamError as {
            name: string;
            message: string;
            toolName?: string;
            toolInput?: string;
          };

          logger.error('Tool input validation error', {
            error: streamError,
            toolName: errorObj.toolName,
            toolInput: errorObj.toolInput,
            requestId
          });

          // Send error information back to the agent by adding it to conversation and continuing
          const errorMessage = `I encountered an error with the tool call "${errorObj.toolName}": ${errorObj.message}. Let me correct this and try again.`;

          // Add error as assistant message so the agent can see it and correct
          const errorHistory = this.getConversationMessages(this.currentConversationId!);
          errorHistory.push({
            role: 'assistant',
            content: errorMessage
          });
          this.setConversationHistory(this.currentConversationId!, errorHistory);

          // Emit the error message as a chunk so it appears in the UI
          this.emit('stream-chunk', { requestId, chunk: errorMessage });
          this.emit('stream-end', { requestId, fullText: errorMessage });

          // Don't throw - let the conversation continue
          return;
        }

        // Re-throw other types of errors
        throw streamError;
      }
    } catch (error) {
      logger.error('AI Service Streaming Error', { error });
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.emit('stream-error', { requestId, error: errorMessage });
    }
  }
}
