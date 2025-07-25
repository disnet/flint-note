import { createGateway, type GatewayProvider } from '@ai-sdk/gateway';
import { generateText, streamText, ModelMessage, stepCountIs } from 'ai';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from 'ai/mcp-stdio';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { SecureStorageService } from './secure-storage-service';

export class AIService extends EventEmitter {
  private currentModelName: string;
  private conversationHistory: ModelMessage[] = [];
  private mcpClient: unknown;
  private gateway: GatewayProvider;

  constructor(gateway: GatewayProvider) {
    super();
    this.currentModelName = 'openai/gpt-4o-mini';
    this.initializeFlintMcpServer();
    this.gateway = gateway;
  }

  static async of(secureStorage: SecureStorageService): Promise<AIService> {
    const gateway = createGateway({
      apiKey: (await secureStorage.getApiKey('gateway')).key
    });
    return new AIService(gateway);
  }

  private switchModel(modelName: string): void {
    if (modelName !== this.currentModelName) {
      console.log(`Switching model from ${this.currentModelName} to ${modelName}`);
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
          vault_id: z.string().optional().describe('Optional vault ID to operate on')
        })
      },
      get_note: {
        inputSchema: z.object({
          identifier: z
            .string()
            .describe('Note identifier in format "type/filename" or full path'),
          vault_id: z.string().optional().describe('Optional vault ID to operate on'),
          fields: z
            .array(z.string())
            .optional()
            .describe('Optional array of field names to include (supports dot notation)')
        })
      },
      get_notes: {
        inputSchema: z.object({
          identifiers: z.array(z.string()).describe('Array of note identifiers'),
          vault_id: z.string().optional().describe('Optional vault ID to operate on'),
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
          vault_id: z.string().optional().describe('Optional vault ID to operate on')
        })
      },
      delete_note: {
        inputSchema: z.object({
          identifier: z.string().describe('Note identifier (type/filename format)'),
          confirm: z
            .boolean()
            .optional()
            .describe('Explicit confirmation required for deletion'),
          vault_id: z.string().optional().describe('Optional vault ID to operate on')
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
          vault_id: z.string().optional().describe('Optional vault ID to operate on'),
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
          vault_id: z.string().optional().describe('Optional vault ID to operate on'),
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
      list_note_types: {
        inputSchema: z.object({
          vault_id: z.string().optional().describe('Optional vault ID to operate on')
        })
      },
      get_note_type_info: {
        inputSchema: z.object({
          type_name: z.string().describe('Name of the note type to get information for'),
          vault_id: z.string().optional().describe('Optional vault ID to operate on')
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
          vault_id: z.string().optional().describe('Optional vault ID to operate on')
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

  async sendMessage(
    userMessage: string,
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

      // Add user message to conversation history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Keep conversation history manageable (last 10 exchanges)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Prepare messages for the model
      const systemMessage = `You are an AI assistant for Flint, a note-taking application. You help users manage their notes, answer questions, and provide assistance with organizing their knowledge. Be helpful, concise, and focused on note-taking and knowledge management tasks.

You have access to comprehensive note management tools including:
- Creating, reading, updating, and deleting notes
- Searching through note content and metadata
- Managing note types and vaults
- Handling note links and relationships
- Advanced search capabilities with SQL queries

When responding be sure to format references to notes in wikilinks syntax. For example, [[Note Title]] or [[daily/2023-09-25|September 25th, 2023]]


Use these tools to help users manage their notes effectively and answer their questions.`;

      const messages: ModelMessage[] = [
        { role: 'system', content: systemMessage },
        ...this.conversationHistory
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
          console.log(step);
        }
      });
      this.conversationHistory.push(...result.response.messages);
      return { text: result.text };
    } catch (error) {
      console.error('AI Service Error:', error);

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
    this.conversationHistory = [];
  }

  getConversationHistory(): Array<ModelMessage> {
    return [...this.conversationHistory];
  }

  private async initializeFlintMcpServer(): Promise<void> {
    try {
      this.mcpClient = await createMCPClient({
        transport: new StdioMCPTransport({
          command: 'npx',
          args: ['@flint-note/server']
        })
      });
      console.log('Flint MCP server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Flint MCP server:', error);
    }
  }

  async sendMessageStream(
    userMessage: string,
    requestId: string,
    modelName?: string
  ): Promise<void> {
    try {
      // Switch model if specified
      if (modelName) {
        this.switchModel(modelName);
      }

      // Add user message to conversation history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      // Keep conversation history manageable (last 10 exchanges)
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Prepare messages for the model
      const systemMessage = `You are an AI assistant for Flint, a note-taking application. You help users manage their notes, answer questions, and provide assistance with organizing their knowledge. Be helpful, concise, and focused on note-taking and knowledge management tasks.

You have access to comprehensive note management tools including:
- Creating, reading, updating, and deleting notes
- Searching through note content and metadata
- Managing note types and vaults
- Handling note links and relationships
- Advanced search capabilities with SQL queries

When responding be sure to format references to notes in wikilinks syntax. For example, [[daily/2023-09-25]] or [[daily/2023-09-25|September 25th, 2023]]

When using tools, always provide helpful explanatory text before and after tool calls to give context and summarize results for the user.

Use these tools to help users manage their notes effectively and answer their questions.`;

      const messages: ModelMessage[] = [
        { role: 'system', content: systemMessage },
        ...this.conversationHistory
      ];

      this.emit('stream-start', { requestId });

      // @ts-ignore: mcpClient types not exported yet
      const mcpTools = this.mcpClient
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (this.mcpClient as any).tools({
            schemas: this.getFlintToolSchemas()
          })
        : {};

      const result = streamText({
        model: this.gateway(this.currentModelName),
        messages,
        tools: mcpTools as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        stopWhen: stepCountIs(5), // Allow up to 5 steps for multi-turn tool calling
        onStepFinish: (step) => {
          // Handle tool calls from step content (AI SDK might put them in different places)
          const toolCalls =
            step.toolCalls ||
            (step.content
              ? step.content.filter((item) => item.type === 'tool-call')
              : []);

          if (toolCalls && toolCalls.length > 0) {
            toolCalls.forEach((toolCall) => {
              const toolCallData = {
                id: toolCall.toolCallId,
                name: toolCall.toolName,
                arguments: toolCall.input || {},
                result: step.toolResults?.find(
                  (r) => r.toolCallId === toolCall.toolCallId
                )?.output,
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
      this.conversationHistory.push({ role: 'assistant', content: fullText });

      this.emit('stream-end', { requestId, fullText });
    } catch (error) {
      console.error('AI Service Streaming Error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.emit('stream-error', { requestId, error: errorMessage });
    }
  }
}
