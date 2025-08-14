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

interface CacheConfig {
  enableSystemMessageCaching: boolean;
  enableHistoryCaching: boolean;
  minimumCacheTokens: number;
  historySegmentSize: number;
}

interface CacheMetrics {
  totalRequests: number;
  systemMessageCacheHits: number;
  systemMessageCacheMisses: number;
  historyCacheHits: number;
  historyCacheMisses: number;
  totalTokensSaved: number;
  totalCacheableTokens: number;
  averageConversationLength: number;
  lastResetTime: Date;
}

interface CachePerformanceSnapshot {
  systemMessageCacheHitRate: number;
  historyCacheHitRate: number;
  overallCacheEfficiency: number;
  tokenSavingsRate: number;
  recommendedOptimizations: string[];
}

interface UsageMetadata {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

interface ThreadUsageData {
  conversationId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  timestamp: Date;
}

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
  private cacheConfig: CacheConfig = {
    enableSystemMessageCaching: true,
    enableHistoryCaching: false, // Start with system message caching only
    minimumCacheTokens: 1024,
    historySegmentSize: 4
  };
  private cacheMetrics: CacheMetrics = {
    totalRequests: 0,
    systemMessageCacheHits: 0,
    systemMessageCacheMisses: 0,
    historyCacheHits: 0,
    historyCacheMisses: 0,
    totalTokensSaved: 0,
    totalCacheableTokens: 0,
    averageConversationLength: 0,
    lastResetTime: new Date()
  };
  private performanceMonitoringInterval?: NodeJS.Timeout;

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

  private estimateTokens(content: string | ModelMessage[]): number {
    if (typeof content === 'string') {
      // Rough estimate: 1 token ≈ 3-4 characters
      return Math.ceil(content.length / 3.5);
    }

    // For message arrays, estimate tokens for all content
    let totalLength = 0;
    for (const msg of content) {
      if (typeof msg.content === 'string') {
        totalLength += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            totalLength += part.text.length;
          }
        }
      }
    }
    return Math.ceil(totalLength / 3.5);
  }

  private isAnthropicModel(): boolean {
    return this.currentModelName.startsWith('anthropic/');
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

  private async getSystemMessageWithCaching(): Promise<ModelMessage> {
    const content = await this.getSystemMessage();

    // Only apply caching for Anthropic models and if caching is enabled
    if (
      this.cacheConfig.enableSystemMessageCaching &&
      this.isAnthropicModel() &&
      this.estimateTokens(content) >= this.cacheConfig.minimumCacheTokens
    ) {
      // For AI SDK, we need to use the proper format for cache control
      return {
        role: 'system',
        content,
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' }
          }
        }
      } as ModelMessage;
    }

    // Fallback to regular system message for non-Anthropic models or when caching is disabled
    return { role: 'system', content };
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

  /**
   * Creates a cached message segment from multiple messages.
   * Combines messages into a single cached message for token efficiency.
   */
  private createCachedMessageSegment(messages: ModelMessage[]): ModelMessage {
    // Combine all messages into a single text content for caching
    const combinedContent = messages
      .map((msg) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const content =
          typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .map((part) =>
                    typeof part === 'string'
                      ? part
                      : part.type === 'text'
                        ? part.text
                        : '[non-text content]'
                  )
                  .join('')
              : '[complex content]';
        return `${role}: ${content}`;
      })
      .join('\n\n');

    return {
      role: 'user', // Use 'user' role for the cached segment
      content: combinedContent,
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral' }
        }
      }
    };
  }

  /**
   * Prepares conversation messages with caching applied to stable segments.
   * Caches older messages while keeping recent messages uncached for flexibility.
   */
  private prepareCachedMessages(history: ModelMessage[]): ModelMessage[] {
    // Only apply caching if enabled and using Anthropic models
    if (!this.cacheConfig.enableHistoryCaching || !this.isAnthropicModel()) {
      return history;
    }

    // Need sufficient messages to benefit from caching (more than segment size * 1.5)
    const minMessagesForCaching = Math.ceil(this.cacheConfig.historySegmentSize * 1.5);
    if (history.length <= minMessagesForCaching) {
      return history;
    }

    // Split into stable (older) and recent messages
    const stableMessageCount = history.length - this.cacheConfig.historySegmentSize;
    const stableMessages = history.slice(0, stableMessageCount);
    const recentMessages = history.slice(stableMessageCount);

    // Only cache stable portion if it meets minimum token requirements
    const stableTokens = this.estimateTokens(
      stableMessages
        .map((msg) =>
          typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        )
        .join(' ')
    );

    if (stableTokens >= this.cacheConfig.minimumCacheTokens) {
      const cachedSegment = this.createCachedMessageSegment(stableMessages);
      return [cachedSegment, ...recentMessages];
    }

    // Return original history if stable portion doesn't meet caching requirements
    return history;
  }

  setCacheConfig(config: Partial<CacheConfig>): void {
    // Validate configuration
    const validatedConfig = this.validateCacheConfig({ ...this.cacheConfig, ...config });
    this.cacheConfig = validatedConfig;
    logger.info('Updated cache configuration', {
      config: this.cacheConfig,
      validationApplied: JSON.stringify(config) !== JSON.stringify(validatedConfig)
    });
  }

  getCacheConfig(): CacheConfig {
    return { ...this.cacheConfig };
  }

  /**
   * Validates and optimizes cache configuration settings
   */
  private validateCacheConfig(config: CacheConfig): CacheConfig {
    const optimized = { ...config };

    // Ensure minimum cache tokens is reasonable
    if (optimized.minimumCacheTokens < 256) {
      logger.warn('Minimum cache tokens too low, adjusting to 256');
      optimized.minimumCacheTokens = 256;
    }
    if (optimized.minimumCacheTokens > 4096) {
      logger.warn(
        'Minimum cache tokens very high, consider lowering for better hit rates'
      );
    }

    // Ensure history segment size is reasonable
    if (optimized.historySegmentSize < 2) {
      logger.warn('History segment size too small, adjusting to 2');
      optimized.historySegmentSize = 2;
    }
    if (optimized.historySegmentSize > 8) {
      logger.warn('History segment size large, may reduce caching efficiency');
    }

    return optimized;
  }

  /**
   * Records cache performance metrics for monitoring
   */
  private recordCacheMetrics(
    systemCacheUsed: boolean,
    historyCacheUsed: boolean,
    conversationLength: number,
    estimatedTokensSaved: number,
    totalTokens: number,
    providerMetadata?: { anthropic?: Record<string, unknown> }
  ): void {
    this.cacheMetrics.totalRequests++;

    // Update conversation length average
    this.cacheMetrics.averageConversationLength =
      (this.cacheMetrics.averageConversationLength *
        (this.cacheMetrics.totalRequests - 1) +
        conversationLength) /
      this.cacheMetrics.totalRequests;

    // Record system message cache performance
    if (this.cacheConfig.enableSystemMessageCaching) {
      if (systemCacheUsed) {
        this.cacheMetrics.systemMessageCacheHits++;
      } else {
        this.cacheMetrics.systemMessageCacheMisses++;
      }
    }

    // Record history cache performance
    if (this.cacheConfig.enableHistoryCaching) {
      if (historyCacheUsed) {
        this.cacheMetrics.historyCacheHits++;
      } else {
        this.cacheMetrics.historyCacheMisses++;
      }
    }

    // Update token savings
    this.cacheMetrics.totalTokensSaved += estimatedTokensSaved;
    this.cacheMetrics.totalCacheableTokens += totalTokens;

    // Log detailed metrics if provider metadata available
    if (providerMetadata?.anthropic) {
      logger.info('Detailed cache performance', {
        conversationId: this.currentConversationId,
        systemCacheUsed,
        historyCacheUsed,
        conversationLength,
        estimatedTokensSaved,
        totalTokens,
        cacheMetrics: this.cacheMetrics,
        providerMetadata: providerMetadata.anthropic
      });
    }
  }

  /**
   * Calculate cost for a model based on usage
   * @returns Cost in micro-cents (millionths of a dollar) for precise arithmetic
   */
  private calculateModelCost(model: string, usage: UsageMetadata): number {
    // Define pricing per model (in USD per 1M tokens)
    const pricing: Record<
      string,
      { input: number; output: number; cacheRead: number; cacheWrite: number }
    > = {
      'anthropic/claude-sonnet-4': {
        input: 3.0,
        output: 15.0,
        cacheRead: 0.3,
        cacheWrite: 3.75
      },
      'anthropic/claude-3.5-haiku': {
        input: 0.8,
        output: 4.0,
        cacheRead: 0.08,
        cacheWrite: 1.0
      },
      // Fallback for unknown models - use Sonnet 4 pricing
      default: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 }
    };

    const rates = pricing[model] || pricing['default'];

    const inputCost = (usage.inputTokens * rates.input) / 1_000_000;
    const outputCost = (usage.outputTokens * rates.output) / 1_000_000;
    const cacheReadCost =
      ((usage.cacheReadInputTokens || 0) * rates.cacheRead) / 1_000_000;
    const cacheWriteCost =
      ((usage.cacheCreationInputTokens || 0) * rates.cacheWrite) / 1_000_000;

    const totalCostDollars = inputCost + outputCost + cacheReadCost + cacheWriteCost;
    const totalCostMicroCents = Math.round(totalCostDollars * 1_000_000);

    // Log cost breakdown for debugging
    logger.info('Cost calculation breakdown', {
      model,
      originalUsage: usage,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens
      },
      costs: {
        inputCost: inputCost,
        outputCost: outputCost,
        cacheReadCost: cacheReadCost,
        cacheWriteCost: cacheWriteCost,
        totalCostDollars: totalCostDollars,
        totalCostMicroCents: totalCostMicroCents,
        displayCost: `$${totalCostDollars.toFixed(6)}`
      }
    });

    // Return cost in micro-cents (millionths of a dollar) for better precision
    // This gives us 6 decimal places while maintaining integer arithmetic
    return totalCostMicroCents;
  }

  /**
   * Record usage and cost data for a conversation
   */
  private recordUsageAndCost(
    result: { providerMetadata?: { anthropic?: { usage?: UsageMetadata } } },
    conversationId: string,
    modelName: string
  ): ThreadUsageData | null {
    const usage = result.providerMetadata?.anthropic?.usage as UsageMetadata;
    if (!usage) return null;

    const cost = this.calculateModelCost(modelName, usage);

    // For display purposes, show total input tokens (non-cached + cached)
    // but the cost calculation handles them separately
    const totalInputTokens =
      (usage.inputTokens || 0) +
      (usage.cacheCreationInputTokens || 0) +
      (usage.cacheReadInputTokens || 0);

    return {
      conversationId,
      modelName,
      inputTokens: totalInputTokens,
      outputTokens: usage.outputTokens || 0,
      cachedTokens:
        (usage.cacheCreationInputTokens || 0) + (usage.cacheReadInputTokens || 0),
      cost,
      timestamp: new Date()
    };
  }

  /**
   * Gets current cache performance metrics
   */
  getCacheMetrics(): CacheMetrics {
    return { ...this.cacheMetrics };
  }

  /**
   * Gets cache performance snapshot with calculated rates and recommendations
   */
  getCachePerformanceSnapshot(): CachePerformanceSnapshot {
    const metrics = this.cacheMetrics;
    const recommendations: string[] = [];

    // Calculate hit rates
    const totalSystemRequests =
      metrics.systemMessageCacheHits + metrics.systemMessageCacheMisses;
    const systemHitRate =
      totalSystemRequests > 0 ? metrics.systemMessageCacheHits / totalSystemRequests : 0;

    const totalHistoryRequests = metrics.historyCacheHits + metrics.historyCacheMisses;
    const historyHitRate =
      totalHistoryRequests > 0 ? metrics.historyCacheHits / totalHistoryRequests : 0;

    // Calculate overall efficiency
    const totalCacheableRequests = totalSystemRequests + totalHistoryRequests;
    const totalCacheHits = metrics.systemMessageCacheHits + metrics.historyCacheHits;
    const overallEfficiency =
      totalCacheableRequests > 0 ? totalCacheHits / totalCacheableRequests : 0;

    // Calculate token savings rate
    const tokenSavingsRate =
      metrics.totalCacheableTokens > 0
        ? metrics.totalTokensSaved / metrics.totalCacheableTokens
        : 0;

    // Generate recommendations
    if (systemHitRate < 0.6 && this.cacheConfig.enableSystemMessageCaching) {
      recommendations.push(
        'System message cache hit rate is low. Consider reviewing system message content or token threshold.'
      );
    }

    if (historyHitRate < 0.4 && this.cacheConfig.enableHistoryCaching) {
      recommendations.push(
        'History cache hit rate is low. Consider lowering minimumCacheTokens or reducing historySegmentSize.'
      );
    }

    if (!this.cacheConfig.enableHistoryCaching && metrics.averageConversationLength > 8) {
      recommendations.push(
        'Average conversation length suggests enabling history caching could provide significant benefits.'
      );
    }

    if (
      tokenSavingsRate < 0.2 &&
      (this.cacheConfig.enableSystemMessageCaching ||
        this.cacheConfig.enableHistoryCaching)
    ) {
      recommendations.push(
        'Token savings rate is low. Consider optimizing cache thresholds or reviewing conversation patterns.'
      );
    }

    if (this.cacheConfig.minimumCacheTokens > 2048 && historyHitRate < 0.3) {
      recommendations.push(
        'Consider lowering minimumCacheTokens to increase history cache hit rate.'
      );
    }

    return {
      systemMessageCacheHitRate: systemHitRate,
      historyCacheHitRate: historyHitRate,
      overallCacheEfficiency: overallEfficiency,
      tokenSavingsRate: tokenSavingsRate,
      recommendedOptimizations: recommendations
    };
  }

  /**
   * Resets cache metrics for fresh tracking period
   */
  resetCacheMetrics(): void {
    this.cacheMetrics = {
      totalRequests: 0,
      systemMessageCacheHits: 0,
      systemMessageCacheMisses: 0,
      historyCacheHits: 0,
      historyCacheMisses: 0,
      totalTokensSaved: 0,
      totalCacheableTokens: 0,
      averageConversationLength: 0,
      lastResetTime: new Date()
    };
    logger.info('Cache metrics reset');
  }

  /**
   * Automatically optimizes cache configuration based on current metrics
   */
  optimizeCacheConfig(): CacheConfig {
    const performance = this.getCachePerformanceSnapshot();
    const currentConfig = { ...this.cacheConfig };
    let optimized = false;

    // Optimize based on conversation patterns
    if (
      this.cacheMetrics.averageConversationLength > 10 &&
      !currentConfig.enableHistoryCaching
    ) {
      currentConfig.enableHistoryCaching = true;
      optimized = true;
      logger.info('Auto-enabled history caching based on conversation length patterns');
    }

    // Optimize token threshold based on hit rates
    if (
      performance.historyCacheHitRate < 0.3 &&
      currentConfig.minimumCacheTokens > 1024
    ) {
      currentConfig.minimumCacheTokens = Math.max(
        512,
        currentConfig.minimumCacheTokens * 0.75
      );
      optimized = true;
      logger.info('Lowered minimum cache tokens to improve hit rate', {
        newThreshold: currentConfig.minimumCacheTokens
      });
    }

    // Optimize history segment size based on efficiency
    if (performance.historyCacheHitRate > 0.8 && currentConfig.historySegmentSize > 2) {
      currentConfig.historySegmentSize = Math.max(
        2,
        currentConfig.historySegmentSize - 1
      );
      optimized = true;
      logger.info('Reduced history segment size for more aggressive caching', {
        newSegmentSize: currentConfig.historySegmentSize
      });
    }

    if (optimized) {
      this.setCacheConfig(currentConfig);
      logger.info('Cache configuration automatically optimized', {
        before: this.cacheConfig,
        after: currentConfig,
        performance
      });
    } else {
      logger.info('Cache configuration already optimal', { performance });
    }

    return currentConfig;
  }

  /**
   * Generates a comprehensive cache performance report
   */
  getCachePerformanceReport(): string {
    const performance = this.getCachePerformanceSnapshot();
    const metrics = this.getCacheMetrics();
    const config = this.getCacheConfig();

    const report = `
=== AI Service Cache Performance Report ===
Generated: ${new Date().toISOString()}
Tracking Period: ${metrics.lastResetTime.toISOString()} - ${new Date().toISOString()}

--- Configuration ---
System Message Caching: ${config.enableSystemMessageCaching ? 'ENABLED' : 'DISABLED'}
History Caching: ${config.enableHistoryCaching ? 'ENABLED' : 'DISABLED'}
Minimum Cache Tokens: ${config.minimumCacheTokens}
History Segment Size: ${config.historySegmentSize}

--- Performance Metrics ---
Total Requests: ${metrics.totalRequests}
Average Conversation Length: ${metrics.averageConversationLength.toFixed(1)} messages

System Message Caching:
  - Hit Rate: ${(performance.systemMessageCacheHitRate * 100).toFixed(1)}%
  - Hits: ${metrics.systemMessageCacheHits}
  - Misses: ${metrics.systemMessageCacheMisses}

History Caching:
  - Hit Rate: ${(performance.historyCacheHitRate * 100).toFixed(1)}%
  - Hits: ${metrics.historyCacheHits}
  - Misses: ${metrics.historyCacheMisses}

Token Efficiency:
  - Overall Cache Efficiency: ${(performance.overallCacheEfficiency * 100).toFixed(1)}%
  - Token Savings Rate: ${(performance.tokenSavingsRate * 100).toFixed(1)}%
  - Total Tokens Saved: ${metrics.totalTokensSaved.toLocaleString()}
  - Total Cacheable Tokens: ${metrics.totalCacheableTokens.toLocaleString()}

--- Optimization Recommendations ---
${
  performance.recommendedOptimizations.length > 0
    ? performance.recommendedOptimizations.map((rec) => `• ${rec}`).join('\n')
    : '• Configuration appears optimal for current usage patterns'
}

--- Status ---
${
  performance.overallCacheEfficiency > 0.7
    ? '✅ Excellent cache performance'
    : performance.overallCacheEfficiency > 0.5
      ? '⚠️  Good cache performance, room for improvement'
      : performance.overallCacheEfficiency > 0.3
        ? '🔧 Moderate cache performance, optimization recommended'
        : '❌ Poor cache performance, review configuration'
}
`;

    return report.trim();
  }

  /**
   * Logs a summary of cache performance at INFO level
   */
  logCachePerformanceSummary(): void {
    const performance = this.getCachePerformanceSnapshot();
    const metrics = this.getCacheMetrics();

    logger.info('Cache Performance Summary', {
      totalRequests: metrics.totalRequests,
      systemCacheHitRate: `${(performance.systemMessageCacheHitRate * 100).toFixed(1)}%`,
      historyCacheHitRate: `${(performance.historyCacheHitRate * 100).toFixed(1)}%`,
      overallEfficiency: `${(performance.overallCacheEfficiency * 100).toFixed(1)}%`,
      tokenSavingsRate: `${(performance.tokenSavingsRate * 100).toFixed(1)}%`,
      totalTokensSaved: metrics.totalTokensSaved,
      averageConversationLength: metrics.averageConversationLength.toFixed(1),
      recommendationsCount: performance.recommendedOptimizations.length,
      config: this.cacheConfig
    });
  }

  /**
   * Starts periodic cache performance monitoring
   */
  startPerformanceMonitoring(intervalMinutes: number = 30): void {
    if (this.performanceMonitoringInterval) {
      clearInterval(this.performanceMonitoringInterval);
    }

    this.performanceMonitoringInterval = setInterval(
      () => {
        this.logCachePerformanceSummary();

        // Auto-optimize if performance is poor
        const performance = this.getCachePerformanceSnapshot();
        if (
          performance.overallCacheEfficiency < 0.3 &&
          this.cacheMetrics.totalRequests > 10
        ) {
          logger.info('Auto-optimizing cache configuration due to poor performance');
          this.optimizeCacheConfig();
        }
      },
      intervalMinutes * 60 * 1000
    );

    logger.info('Started cache performance monitoring', { intervalMinutes });
  }

  /**
   * Stops periodic cache performance monitoring
   */
  stopPerformanceMonitoring(): void {
    if (this.performanceMonitoringInterval) {
      clearInterval(this.performanceMonitoringInterval);
      this.performanceMonitoringInterval = undefined;
      logger.info('Stopped cache performance monitoring');
    }
  }

  /**
   * Warms up the system message cache by pre-loading it
   */
  async warmupSystemMessageCache(): Promise<void> {
    if (!this.cacheConfig.enableSystemMessageCaching || !this.isAnthropicModel()) {
      logger.info(
        'System message cache warmup skipped - not enabled or not Anthropic model'
      );
      return;
    }

    try {
      // Pre-load system message to warm cache
      await this.getSystemMessageWithCaching();
      logger.info('System message cache warmed up successfully');
    } catch (error) {
      logger.error('Failed to warm up system message cache', { error });
    }
  }

  /**
   * Provides cache health check with actionable insights
   */
  getCacheHealthCheck(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
    score: number;
  } {
    const performance = this.getCachePerformanceSnapshot();
    const metrics = this.getCacheMetrics();
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check if caching is being used at all
    if (
      !this.cacheConfig.enableSystemMessageCaching &&
      !this.cacheConfig.enableHistoryCaching
    ) {
      issues.push('No caching enabled');
      recommendations.push('Enable system message caching for immediate benefits');
      score -= 50;
    }

    // Check system message cache performance
    if (this.cacheConfig.enableSystemMessageCaching) {
      if (performance.systemMessageCacheHitRate < 0.5) {
        issues.push('Low system message cache hit rate');
        recommendations.push('Review system message content stability');
        score -= 20;
      }
    }

    // Check history cache performance
    if (this.cacheConfig.enableHistoryCaching) {
      if (performance.historyCacheHitRate < 0.3) {
        issues.push('Low history cache hit rate');
        recommendations.push('Consider lowering minimumCacheTokens threshold');
        score -= 15;
      }
    } else if (metrics.averageConversationLength > 8) {
      issues.push('Long conversations without history caching');
      recommendations.push('Enable history caching for better token efficiency');
      score -= 25;
    }

    // Check token efficiency
    if (performance.tokenSavingsRate < 0.15) {
      issues.push('Low token savings rate');
      recommendations.push('Optimize cache configuration for better efficiency');
      score -= 10;
    }

    // Check configuration sanity
    if (this.cacheConfig.minimumCacheTokens > 3000) {
      issues.push('Very high minimum cache token threshold');
      recommendations.push('Consider lowering minimumCacheTokens for better hit rates');
      score -= 5;
    }

    if (this.cacheConfig.historySegmentSize > 6) {
      issues.push('Large history segment size reducing cache efficiency');
      recommendations.push('Consider reducing historySegmentSize for more caching');
      score -= 5;
    }

    const status: 'healthy' | 'warning' | 'critical' =
      score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical';

    return {
      status,
      issues,
      recommendations,
      score: Math.max(0, score)
    };
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
      const systemMessage = await this.getSystemMessageWithCaching();
      const conversationHistory = this.getConversationMessages(
        this.currentConversationId!
      );
      const cachedHistory = this.prepareCachedMessages(conversationHistory);

      const messages: ModelMessage[] = [systemMessage, ...cachedHistory];

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

      // Record and log cache performance metrics
      const conversationLength = this.getConversationMessages(
        this.currentConversationId!
      ).length;
      const systemCacheUsed =
        this.cacheConfig.enableSystemMessageCaching && this.isAnthropicModel();
      const historyCacheUsed =
        this.cacheConfig.enableHistoryCaching &&
        this.isAnthropicModel() &&
        conversationLength > Math.ceil(this.cacheConfig.historySegmentSize * 1.5);

      // Estimate token savings (rough calculation)
      const estimatedSystemTokens = systemCacheUsed
        ? this.estimateTokens(await this.getSystemMessage())
        : 0;
      const estimatedHistoryTokens = historyCacheUsed
        ? this.estimateTokens(
            cachedHistory
              .slice(0, -this.cacheConfig.historySegmentSize)
              .map((msg) =>
                typeof msg.content === 'string'
                  ? msg.content
                  : JSON.stringify(msg.content)
              )
              .join(' ')
          )
        : 0;
      const estimatedTokensSaved = estimatedSystemTokens + estimatedHistoryTokens;
      const totalTokens = this.estimateTokens(
        messages
          .map((msg) =>
            typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          )
          .join(' ')
      );

      this.recordCacheMetrics(
        systemCacheUsed,
        historyCacheUsed,
        conversationLength,
        estimatedTokensSaved,
        totalTokens,
        result.providerMetadata
      );

      // Record usage and cost data
      const usageData = this.recordUsageAndCost(
        result,
        this.currentConversationId!,
        this.currentModelName
      );

      if (usageData) {
        // Emit usage data for the frontend
        this.emit('usage-recorded', usageData);
      }

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
      // Use node directly instead of npx for better reliability in built apps
      const serverPath = join(
        __dirname,
        '../../node_modules/@flint-note/server/dist/index.js'
      );
      this.mcpClient = await createMCPClient({
        transport: new StdioMCPTransport({
          command: 'node',
          args: [serverPath]
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
      const systemMessage = await this.getSystemMessageWithCaching();
      const conversationHistory = this.getConversationMessages(
        this.currentConversationId!
      );
      const cachedHistory = this.prepareCachedMessages(conversationHistory);

      const messages: ModelMessage[] = [systemMessage, ...cachedHistory];

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

        // Record and log cache performance metrics for streaming
        const conversationLength = this.getConversationMessages(
          this.currentConversationId!
        ).length;
        const systemCacheUsed =
          this.cacheConfig.enableSystemMessageCaching && this.isAnthropicModel();
        const historyCacheUsed =
          this.cacheConfig.enableHistoryCaching &&
          this.isAnthropicModel() &&
          conversationLength > Math.ceil(this.cacheConfig.historySegmentSize * 1.5);

        // Estimate token savings for streaming (rough calculation)
        const estimatedSystemTokens = systemCacheUsed
          ? this.estimateTokens(await this.getSystemMessage())
          : 0;
        const estimatedHistoryTokens = historyCacheUsed
          ? this.estimateTokens(
              cachedHistory
                .slice(0, -this.cacheConfig.historySegmentSize)
                .map((msg) =>
                  typeof msg.content === 'string'
                    ? msg.content
                    : JSON.stringify(msg.content)
                )
                .join(' ')
            )
          : 0;
        const estimatedTokensSaved = estimatedSystemTokens + estimatedHistoryTokens;
        const totalTokens = this.estimateTokens(
          messages
            .map((msg) =>
              typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
            )
            .join(' ')
        );

        this.recordCacheMetrics(
          systemCacheUsed,
          historyCacheUsed,
          conversationLength,
          estimatedTokensSaved,
          totalTokens,
          undefined // Streaming doesn't provide providerMetadata in the same way
        );

        // For streaming, we'll estimate usage since providerMetadata isn't available
        // This is less accurate but provides some cost tracking
        const estimatedInputTokens = this.estimateTokens(
          messages
            .map((msg) =>
              typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
            )
            .join(' ')
        );
        const estimatedOutputTokens = this.estimateTokens(fullText);

        const streamingUsageData: ThreadUsageData = {
          conversationId: this.currentConversationId!,
          modelName: this.currentModelName,
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          cachedTokens: estimatedTokensSaved,
          cost: this.calculateModelCost(this.currentModelName, {
            inputTokens: estimatedInputTokens,
            outputTokens: estimatedOutputTokens,
            cacheCreationInputTokens: systemCacheUsed ? estimatedSystemTokens : 0,
            cacheReadInputTokens: historyCacheUsed ? estimatedHistoryTokens : 0
          }),
          timestamp: new Date()
        };

        // Emit estimated usage data for streaming
        this.emit('usage-recorded', streamingUsageData);

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
