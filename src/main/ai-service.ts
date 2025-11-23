import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, ModelMessage, stepCountIs, Tool } from 'ai';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SecureStorageService } from './secure-storage-service';
import { logger } from './logger';
import { NoteService } from './note-service';
import { ToolService } from './tool-service';
import { WorkflowService } from './workflow-service';
import { CustomFunctionsApi } from '../server/api/custom-functions-api.js';
import { TodoPlanService } from './todo-plan-service';
import { REVIEW_AGENT_SYSTEM_PROMPT } from './review-agent-prompt';

export type AIProvider = 'openrouter' | 'anthropic';
type ProviderClient =
  | ReturnType<typeof createOpenRouter>
  | ReturnType<typeof createAnthropic>;

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

interface ContextUsage {
  conversationId: string;
  systemPromptTokens: number;
  conversationHistoryTokens: number;
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  warningLevel: 'none' | 'warning' | 'critical' | 'full';
  estimatedMessagesRemaining: number;
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
  private currentProvider: AIProvider;
  private conversationHistories: Map<string, ModelMessage[]> = new Map();
  private currentConversationId: string | null = null;
  private providerClient: ProviderClient;
  private systemPrompt: string;
  private reviewPrompt: string;
  private noteService: NoteService | null;
  private workflowService: WorkflowService | null;
  private toolService: ToolService;
  private customFunctionsApi: CustomFunctionsApi;
  private todoPlanService: TodoPlanService;
  private readonly maxConversationHistory = 20;
  private readonly maxConversations = 100;
  private activeAbortControllers: Map<string, AbortController> = new Map();
  private inReviewMode: boolean = false;
  private currentReviewNoteId: string | null = null;
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

  constructor(
    providerClient: ProviderClient,
    provider: AIProvider,
    noteService: NoteService | null,
    workspaceRoot?: string,
    workflowService?: WorkflowService | null
  ) {
    super();
    this.currentProvider = provider;
    this.currentModelName = 'anthropic/claude-haiku-4.5'; // Default for OpenRouter
    this.systemPrompt = this.loadSystemPrompt();
    this.reviewPrompt = this.loadReviewPrompt();
    logger.info('AI Service constructed', {
      provider: this.currentProvider,
      model: this.currentModelName
    });
    this.providerClient = providerClient;
    this.noteService = noteService;
    this.workflowService = workflowService || null;
    this.todoPlanService = new TodoPlanService();
    this.toolService = new ToolService(
      noteService,
      workspaceRoot,
      this.todoPlanService,
      this.workflowService || undefined
    );
    this.customFunctionsApi = new CustomFunctionsApi(workspaceRoot || process.cwd());
  }

  /**
   * Create a provider client based on the provider type
   */
  private static createProviderClient(
    provider: AIProvider,
    apiKey?: string
  ): ProviderClient {
    switch (provider) {
      case 'openrouter':
        return createOpenRouter({ apiKey });
      case 'anthropic':
        return createAnthropic({ apiKey });
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Refresh the provider client with new API key
   * Called when API keys are updated to ensure the service uses the latest credentials
   */
  async refreshApiKey(secureStorage: SecureStorageService): Promise<void> {
    try {
      const { key } = await secureStorage.getApiKey(this.currentProvider);
      this.providerClient = AIService.createProviderClient(this.currentProvider, key);
      logger.info('AI Service API key refreshed successfully', {
        provider: this.currentProvider
      });
    } catch (error) {
      logger.error('Failed to refresh AI Service API key', { error });
      throw error;
    }
  }

  /**
   * Switch to a different provider
   * Updates both the provider client and the current model
   */
  async switchProvider(
    provider: AIProvider,
    modelName: string,
    secureStorage: SecureStorageService
  ): Promise<void> {
    try {
      const { key } = await secureStorage.getApiKey(provider);
      this.currentProvider = provider;
      this.providerClient = AIService.createProviderClient(provider, key);
      this.currentModelName = modelName;
      logger.info('Switched AI provider', {
        provider: this.currentProvider,
        model: this.currentModelName
      });
    } catch (error) {
      logger.error('Failed to switch AI provider', { error });
      throw error;
    }
  }

  /**
   * Check if a valid API key is available for the current provider
   * Returns true if we have a valid API key, false otherwise
   */
  async hasValidApiKey(secureStorage: SecureStorageService): Promise<boolean> {
    try {
      const { key } = await secureStorage.getApiKey(this.currentProvider);
      return !!(key && key.trim() !== '');
    } catch (error) {
      logger.warn('Failed to check API key availability', { error });
      return false;
    }
  }

  /**
   * Ensure API key is loaded before making AI requests
   * This method should be called before any AI operations to ensure we have a valid key
   */
  async ensureApiKeyLoaded(secureStorage: SecureStorageService): Promise<boolean> {
    try {
      const hasKey = await this.hasValidApiKey(secureStorage);
      if (!hasKey) {
        logger.info('No valid API key found, cannot proceed with AI operations', {
          provider: this.currentProvider
        });
        return false;
      }

      // Refresh the key to make sure it's loaded in the provider client
      await this.refreshApiKey(secureStorage);
      return true;
    } catch (error) {
      logger.error('Failed to ensure API key is loaded', { error });
      return false;
    }
  }

  static async of(
    _secureStorage: SecureStorageService,
    noteService: NoteService | null = null,
    workspaceRoot?: string,
    workflowService?: WorkflowService | null,
    provider: AIProvider = 'openrouter'
  ): Promise<AIService> {
    // Initialize with undefined API key to avoid triggering keychain access on startup
    // secureStorage will be passed to lazy loading methods when needed
    const providerClient = AIService.createProviderClient(provider, undefined);
    return new AIService(
      providerClient,
      provider,
      noteService,
      workspaceRoot,
      workflowService
    );
  }

  /**
   * Get the current provider
   */
  getCurrentProvider(): AIProvider {
    return this.currentProvider;
  }

  /**
   * Get the current model name
   */
  getCurrentModel(): string {
    return this.currentModelName;
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

When responding be sure to format references to notes using ID-only wikilinks. For example, [[n-12345678]] (where n-12345678 is the note's ID). The UI will automatically display the note's current title.

Use these tools to help users manage their notes effectively and answer their questions.`;
    }
  }

  private loadReviewPrompt(): string {
    return REVIEW_AGENT_SYSTEM_PROMPT;
  }

  /**
   * Detect if a message is starting a review session
   * Format: "Review note: {noteId}"
   */
  private detectReviewMode(message: string): { isReview: boolean; noteId?: string } {
    const reviewMatch = message.match(/^Review note:\s*(.+)$/i);
    if (reviewMatch) {
      return {
        isReview: true,
        noteId: reviewMatch[1].trim()
      };
    }
    return { isReview: false };
  }

  /**
   * Enter review mode for a specific note
   */
  private enterReviewMode(noteId: string): void {
    this.inReviewMode = true;
    this.currentReviewNoteId = noteId;
    logger.info('Entered review mode', { noteId });
  }

  /**
   * Get appropriate tools based on current mode (review vs normal)
   */
  private getAppropriateTools(): Record<string, Tool> | undefined {
    if (this.inReviewMode) {
      return this.toolService.getReviewTools();
    }
    return this.toolService.getTools();
  }

  public estimateTokens(content: string | ModelMessage[]): number {
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
          } else if (part.type === 'reasoning') {
            // Reasoning text from models that support chain-of-thought
            totalLength += part.text.length;
          } else if (part.type === 'tool-call') {
            // Account for tool call overhead: tool name + arguments
            totalLength += part.toolName.length;
            totalLength += JSON.stringify(part.input || {}).length;
          } else if (part.type === 'tool-result') {
            // Account for tool result overhead: tool name + result content
            totalLength += part.toolName.length;
            // Tool results can be strings or objects
            const outputStr =
              typeof part.output === 'string'
                ? part.output
                : JSON.stringify(part.output || '');
            totalLength += outputStr.length;
          } else if (part.type === 'image') {
            // Images: estimate based on typical token cost
            // Claude vision models charge ~1.3k tokens per image for base64
            totalLength += 1300 * 3.5; // Convert to character estimate
          } else if (part.type === 'file') {
            // Files can be text or binary data
            // For base64 strings or buffers, estimate size
            if (typeof part.data === 'string') {
              // Likely a base64 string or URL
              totalLength += part.data.length;
            } else if (part.data instanceof URL) {
              // URL reference - minimal token cost
              totalLength += part.data.toString().length;
            }
            // Add filename if present
            if (part.filename) {
              totalLength += part.filename.length;
            }
          }
        }
      }
    }
    return Math.ceil(totalLength / 3.5);
  }

  /**
   * Check if the current model supports Anthropic-specific features (like prompt caching)
   * Returns true for:
   * - Direct Anthropic provider
   * - OpenRouter using Anthropic models
   */
  private isAnthropicModel(): boolean {
    return (
      this.currentProvider === 'anthropic' ||
      (this.currentProvider === 'openrouter' &&
        this.currentModelName.startsWith('anthropic/'))
    );
  }

  /**
   * Get Tier 2 vault context (compact listing of note types and custom functions)
   * This is designed to be cached efficiently per vault
   */
  private async getVaultContext(): Promise<string> {
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
      try {
        // Get current vault to retrieve note types
        const currentVault = await this.noteService.getCurrentVault();
        if (currentVault) {
          const noteTypes = await this.noteService.listNoteTypes(currentVault.id);
          if (noteTypes.length > 0) {
            noteTypeInfo = `\n## Available Note Types\n\n`;
            noteTypeInfo += `Your vault has ${noteTypes.length} note type(s):\n`;
            noteTypeInfo += noteTypes
              .map((nt) => `- **${nt.name}**: ${nt.purpose || 'No description'}`)
              .join('\n');
            noteTypeInfo += `\n\nNote: Full agent instructions for each type will be provided when relevant.\n`;
          }
        }
      } catch (error) {
        logger.warn('Failed to load note types for system message:', { error });
        // Continue without note type info if vault access fails
      }
    }

    // Add compact custom functions listing to system prompt
    let customFunctionsInfo = '';
    try {
      customFunctionsInfo = await this.customFunctionsApi.getCompactSystemPromptSection();
    } catch (error) {
      logger.warn('Failed to load custom functions for system message:', { error });
      // Continue without custom functions info if loading fails
    }

    // Add workflow context to system prompt
    let workflowInfo = '';
    if (this.workflowService && this.workflowService.isReady()) {
      try {
        workflowInfo = await this.workflowService.getWorkflowContextForPrompt();
        if (workflowInfo) {
          workflowInfo = '\n' + workflowInfo;
        }
      } catch (error) {
        logger.warn('Failed to load workflow context for system message:', { error });
        // Continue without workflow info if loading fails
      }
    }

    return contextualInfo + noteTypeInfo + customFunctionsInfo + workflowInfo;
  }

  /**
   * Get complete system message (Tier 1 + Tier 2)
   * In review mode, returns review prompt + note context instead
   */
  private async getSystemMessage(): Promise<string> {
    if (this.inReviewMode && this.currentReviewNoteId) {
      // In review mode, get the note content and use review prompt
      let noteContext = '';
      try {
        if (this.noteService) {
          const flintApi = this.noteService.getFlintNoteApi();
          const currentVault = await this.noteService.getCurrentVault();
          if (currentVault) {
            const note = await flintApi.getNote(
              currentVault.id,
              this.currentReviewNoteId
            );
            noteContext = `\n\n# Note to Review\n\nTitle: ${note.title}\nID: ${note.id}\nType: ${note.type}\n\nContent:\n${note.content}`;
          }
        }
      } catch (error) {
        logger.error('Failed to load note for review', {
          error,
          noteId: this.currentReviewNoteId
        });
      }
      return this.reviewPrompt + noteContext;
    }

    // Normal mode - return standard system prompt with vault context
    const vaultContext = await this.getVaultContext();
    return this.systemPrompt + vaultContext;
  }

  /**
   * Get the TodoPlanService instance
   */
  getTodoPlanService(): TodoPlanService {
    return this.todoPlanService;
  }

  /**
   * Get plan context for the current conversation
   */
  private getPlanContext(): string | null {
    if (!this.currentConversationId) {
      return null;
    }
    return this.todoPlanService.getPlanContext(this.currentConversationId);
  }

  /**
   * Inject plan context into messages if there's an active plan
   */
  private getMessagesWithPlanContext(messages: ModelMessage[]): ModelMessage[] {
    const planContext = this.getPlanContext();

    if (!planContext) {
      return messages;
    }

    // Inject plan context as a user message before the last user message
    const messagesWithContext = [...messages];

    // Find the last user message index
    let lastUserIndex = -1;
    for (let i = messagesWithContext.length - 1; i >= 0; i--) {
      if (messagesWithContext[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex >= 0) {
      // Insert plan context before the last user message
      messagesWithContext.splice(lastUserIndex, 0, {
        role: 'user',
        content: planContext
      });
    }

    return messagesWithContext;
  }

  private async getSystemMessageWithCaching(): Promise<ModelMessage> {
    const content = await this.getSystemMessage();
    console.log('System message:', content);

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

    // Always sync messages when provided to ensure context is properly restored
    if (messagesArray.length > 0) {
      this.syncConversationFromFrontend(conversationId, messagesArray);
    } else if (!this.conversationHistories.has(conversationId)) {
      // Create empty conversation only if no messages provided and no history exists
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

  private isApiKeyError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const errorObj = error as Record<string, unknown>;

    // Check for OpenRouter authentication errors
    if (
      errorObj.name === 'AI_APIKeyError' ||
      errorObj.name === 'APIKeyError' ||
      errorObj.name === 'OpenRouterError'
    ) {
      return true;
    }

    // Check error message for authentication-related text
    const errorMessage = typeof errorObj.message === 'string' ? errorObj.message : '';
    const authErrorKeywords = [
      'No authentication provided',
      'OpenRouter authentication failed',
      'authentication failed',
      'API key',
      'Invalid API key',
      'openrouter authentication'
    ];

    for (const keyword of authErrorKeywords) {
      if (errorMessage.includes(keyword)) {
        return true;
      }
    }

    // Check for nested cause errors (like in the error you provided)
    if (errorObj.cause && typeof errorObj.cause === 'object') {
      return this.isApiKeyError(errorObj.cause);
    }

    return false;
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

      // Detect review mode from message
      const reviewDetection = this.detectReviewMode(userMessage);
      if (reviewDetection.isReview && reviewDetection.noteId) {
        this.enterReviewMode(reviewDetection.noteId);
      }

      // Get conversation history
      const currentHistory = this.getConversationMessages(this.currentConversationId!);

      // Add user message to conversation history
      currentHistory.push({ role: 'user', content: userMessage });

      // Update conversation history with length management
      this.setConversationHistory(this.currentConversationId!, currentHistory);

      // Set the conversation ID in tool service so tools can access it
      this.toolService.setCurrentConversationId(this.currentConversationId!);

      // Prepare messages for the model
      const systemMessage = await this.getSystemMessageWithCaching();
      const conversationHistory = this.getConversationMessages(
        this.currentConversationId!
      );
      const cachedHistory = this.prepareCachedMessages(conversationHistory);

      let messages: ModelMessage[] = [systemMessage, ...cachedHistory];

      // Inject plan context if there's an active plan
      messages = this.getMessagesWithPlanContext(messages);

      const tools = this.getAppropriateTools();
      const result = await generateText({
        model: this.providerClient(this.currentModelName),
        messages,
        tools,
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

      // Add assistant response to conversation history
      const updatedHistory = this.getConversationMessages(this.currentConversationId!);
      updatedHistory.push(...result.response.messages);
      this.setConversationHistory(this.currentConversationId!, updatedHistory);

      return { text: result.text };
    } catch (error) {
      logger.error('AI Service Error', { error });

      // Check if this is an API key authentication error
      if (this.isApiKeyError(error)) {
        return {
          text: "⚠️ **API Key Required**\n\nIt looks like you haven't set up your OpenRouter API key yet. To use the AI assistant:\n\n1. Click the **Settings** button (⚙️) in the sidebar\n2. Go to **🔑 API Keys** section\n3. Add your OpenRouter API key\n\nOnce configured, you'll be able to chat with the AI assistant!"
        };
      }

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

  /**
   * Get context usage information for a conversation
   */
  async getContextUsage(conversationId?: string): Promise<ContextUsage> {
    const targetConversationId = conversationId || this.currentConversationId;
    if (!targetConversationId) {
      return {
        conversationId: 'none',
        systemPromptTokens: 0,
        conversationHistoryTokens: 0,
        totalTokens: 0,
        maxTokens: 200000,
        percentage: 0,
        warningLevel: 'none',
        estimatedMessagesRemaining: 999
      };
    }

    // Get system prompt tokens
    const systemMessage = await this.getSystemMessage();
    const systemPromptTokens = this.estimateTokens(systemMessage);

    // Get conversation history tokens
    const history = this.getConversationMessages(targetConversationId);
    const conversationHistoryTokens = this.estimateTokens(history);

    // Calculate total
    const totalTokens = systemPromptTokens + conversationHistoryTokens;

    // Get max tokens for current model (default to 200k for Claude models)
    const maxTokens = 200000;

    // Calculate percentage
    const percentage = (totalTokens / maxTokens) * 100;

    // Determine warning level
    let warningLevel: 'none' | 'warning' | 'critical' | 'full' = 'none';
    if (percentage >= 95) {
      warningLevel = 'full';
    } else if (percentage >= 80) {
      warningLevel = 'critical';
    } else if (percentage >= 70) {
      warningLevel = 'warning';
    }

    // Estimate messages remaining
    const averageTokensPerMessage =
      history.length > 0 ? conversationHistoryTokens / history.length : 500;
    const remainingTokens = maxTokens - totalTokens;
    const estimatedMessagesRemaining = Math.floor(
      remainingTokens / averageTokensPerMessage
    );

    return {
      conversationId: targetConversationId,
      systemPromptTokens,
      conversationHistoryTokens,
      totalTokens,
      maxTokens,
      percentage,
      warningLevel,
      estimatedMessagesRemaining: Math.max(0, estimatedMessagesRemaining)
    };
  }

  /**
   * Check if a message with estimated tokens can fit in the context
   */
  async canAcceptMessage(
    estimatedTokens: number,
    conversationId?: string
  ): Promise<{ canAccept: boolean; reason?: string }> {
    const usage = await this.getContextUsage(conversationId);

    // Reserve 30% of context window for response and tool outputs
    const safeMaxTokens = usage.maxTokens * 0.7;

    if (usage.totalTokens + estimatedTokens > safeMaxTokens) {
      return {
        canAccept: false,
        reason: `Message would exceed safe context limit (${Math.round(safeMaxTokens)} tokens). Current usage: ${usage.totalTokens} tokens.`
      };
    }

    return { canAccept: true };
  }

  /**
   * Cancel an active streaming request
   */
  cancelStream(requestId: string): boolean {
    const abortController = this.activeAbortControllers.get(requestId);
    if (abortController) {
      abortController.abort();
      this.activeAbortControllers.delete(requestId);
      logger.info('Cancelled streaming request', { requestId });
      return true;
    }
    logger.warn('No active streaming request found to cancel', { requestId });
    return false;
  }

  async sendMessageStream(
    userMessage: string,
    requestId: string,
    conversationId?: string,
    modelName?: string
  ): Promise<void> {
    // Create an abort controller for this request
    const abortController = new AbortController();
    this.activeAbortControllers.set(requestId, abortController);

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

      // Detect review mode from message
      const reviewDetection = this.detectReviewMode(userMessage);
      if (reviewDetection.isReview && reviewDetection.noteId) {
        this.enterReviewMode(reviewDetection.noteId);
      }

      // Get conversation history
      const currentHistory = this.getConversationMessages(this.currentConversationId!);

      // Add user message to conversation history
      currentHistory.push({ role: 'user', content: userMessage });

      // Update conversation history with length management
      this.setConversationHistory(this.currentConversationId!, currentHistory);

      // Set the conversation ID in tool service so tools can access it
      this.toolService.setCurrentConversationId(this.currentConversationId!);

      // Prepare messages for the model
      const systemMessage = await this.getSystemMessageWithCaching();
      const conversationHistory = this.getConversationMessages(
        this.currentConversationId!
      );
      const cachedHistory = this.prepareCachedMessages(conversationHistory);

      let messages: ModelMessage[] = [systemMessage, ...cachedHistory];

      // Inject plan context if there's an active plan
      messages = this.getMessagesWithPlanContext(messages);

      this.emit('stream-start', { requestId });

      const tools = this.getAppropriateTools();

      try {
        const result = streamText({
          model: this.providerClient(this.currentModelName),
          messages,
          tools,
          stopWhen: stepCountIs(20), // Allow up to 20 steps for multi-turn tool calling
          abortSignal: abortController.signal
        });

        let fullText = '';
        let finalFinishReason: string | undefined;
        let stepIndex = 0; // Current step index (0-based)

        // Use fullStream to get real-time tool call events as they happen
        for await (const event of result.fullStream) {
          if (event.type === 'text-delta') {
            // Handle text streaming
            fullText += event.text;
            this.emit('stream-chunk', { requestId, chunk: event.text });
          } else if (event.type === 'tool-call') {
            // Handle tool calls as they arrive (before execution)
            // Include stepIndex so frontend can group tool calls by step
            const toolCallData = {
              id: event.toolCallId,
              name: event.toolName,
              arguments: event.input || {},
              result: undefined,
              error: undefined,
              stepIndex // Add step index to group tool calls
            };
            this.emit('stream-tool-call', { requestId, toolCall: toolCallData });
          } else if (event.type === 'tool-result') {
            // Update tool call with result when it completes
            // Note: Frontend should match by toolCallId and update
            const toolCallData = {
              id: event.toolCallId,
              name: event.toolName,
              arguments: {},
              result: event.output,
              error: undefined,
              stepIndex // Include step index for consistency
            };
            this.emit('stream-tool-result', { requestId, toolCall: toolCallData });
          } else if (event.type === 'finish-step') {
            // Step completed - increment for next step
            stepIndex++;
            logger.info('Step finished', {
              requestId,
              stepIndex,
              finishReason: event.finishReason
            });
          } else if (event.type === 'finish') {
            // Final finish event with overall finishReason
            finalFinishReason = event.finishReason;
            logger.info('Stream finished', {
              requestId,
              finishReason: event.finishReason,
              totalUsage: event.totalUsage
            });
          }
        }

        logger.info('Stream completed', { requestId, finalFinishReason, stepIndex });

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

        // Check if we hit the tool call limit
        // When stopWhen condition (stepCountIs) is triggered, we get:
        // - finishReason of 'tool-calls' (stopped after executing tools)
        // - stepIndex equals or exceeds our limit (since we increment after each step)
        const maxSteps = 20; // Same as stepCountIs(20)
        const stoppedAtLimit =
          stepIndex >= maxSteps && finalFinishReason === 'tool-calls';

        if (stoppedAtLimit) {
          logger.info('Tool call limit reached', {
            requestId,
            stepIndex,
            maxSteps,
            finalFinishReason
          });
        }

        this.emit('stream-end', {
          requestId,
          fullText,
          stoppedAtLimit,
          stepCount: stoppedAtLimit ? stepIndex : undefined,
          maxSteps: stoppedAtLimit ? maxSteps : undefined,
          canContinue: stoppedAtLimit ? true : undefined
        });

        // Clean up abort controller
        this.activeAbortControllers.delete(requestId);
      } catch (streamError: unknown) {
        // Clean up abort controller on error
        this.activeAbortControllers.delete(requestId);

        // Check if this was an abort
        if (
          streamError &&
          typeof streamError === 'object' &&
          'name' in streamError &&
          streamError.name === 'AbortError'
        ) {
          logger.info('Stream aborted by user', { requestId });
          this.emit('stream-error', { requestId, error: 'Request cancelled by user' });
          return;
        }
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
      // Clean up abort controller
      this.activeAbortControllers.delete(requestId);

      logger.error('AI Service Streaming Error', { error });

      // Check if this was an abort
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'AbortError'
      ) {
        logger.info('Stream aborted by user', { requestId });
        this.emit('stream-error', { requestId, error: 'Request cancelled by user' });
        return;
      }

      // Check if this is an API key authentication error
      if (this.isApiKeyError(error)) {
        const apiKeyErrorMessage =
          "⚠️ **API Key Required**\n\nIt looks like you haven't set up your OpenRouter API key yet. To use the AI assistant:\n\n1. Click the **Settings** button (⚙️) in the sidebar\n2. Go to **🔑 API Keys** section\n3. Add your OpenRouter API key\n\nOnce configured, you'll be able to chat with the AI assistant!";
        this.emit('stream-chunk', { requestId, chunk: apiKeyErrorMessage });
        this.emit('stream-end', { requestId, fullText: apiKeyErrorMessage });
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.emit('stream-error', { requestId, error: errorMessage });
    }
  }

  /**
   * Generate suggestions for a note
   */
  async generateNoteSuggestions(
    noteContent: string,
    noteType: string,
    noteTypeDescription: { purpose?: string; agentInstructions?: string },
    promptGuidance: string,
    metadata?: Record<string, unknown>
  ): Promise<
    Array<{
      id: string;
      type: string;
      text: string;
      priority?: 'high' | 'medium' | 'low';
      data?: Record<string, unknown>;
      reasoning?: string;
      lineNumber?: number;
    }>
  > {
    try {
      // Format metadata for the prompt
      const metadataSection = metadata
        ? `\n\nNote Metadata:\n${JSON.stringify(metadata, null, 2)}`
        : '';

      // Add line numbers to note content
      const numberedContent = noteContent
        .split('\n')
        .map((line, index) => `${index + 1}: ${line}`)
        .join('\n');

      const systemPrompt = `You are analyzing a note of type "${noteType}".

${noteTypeDescription.purpose ? `Note Type Purpose: ${noteTypeDescription.purpose}` : ''}

${noteTypeDescription.agentInstructions ? `Agent Instructions for this note type:\n${noteTypeDescription.agentInstructions}` : ''}

${promptGuidance}

The note content is provided with line numbers. When making suggestions that relate to a specific line or section,
include the line number using the "lineNumber" field. For general suggestions that don't relate to a specific line,
omit the lineNumber field.

Analyze the note and provide specific, actionable suggestions as a JSON array.
Each suggestion should have: id, type, text, priority (optional), data (optional), reasoning (optional), lineNumber (optional).

Return ONLY a valid JSON array with no additional text or markdown formatting.`;

      const userMessage = `${numberedContent}${metadataSection}`;

      const response = await generateText({
        model: this.providerClient(this.currentModelName),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      });

      // Parse the response
      let suggestions;
      try {
        // Try to parse as JSON directly
        suggestions = JSON.parse(response.text);
      } catch {
        // If that fails, try to extract JSON from markdown code blocks
        const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[1]);
        } else {
          // Try to find JSON array in the text
          const arrayMatch = response.text.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            suggestions = JSON.parse(arrayMatch[0]);
          } else {
            throw new Error('Could not parse suggestions from AI response');
          }
        }
      }

      // Validate that we got an array
      if (!Array.isArray(suggestions)) {
        throw new Error('AI response was not a valid array');
      }

      // Ensure each suggestion has an id
      suggestions = suggestions.map((s, index) => ({
        ...s,
        id: s.id || `suggestion-${Date.now()}-${index}`
      }));

      return suggestions;
    } catch (error) {
      logger.error('Failed to generate note suggestions', { error });
      throw error;
    }
  }

  /**
   * Select relevant review history entries using smart selection:
   * - All reviews with rating 1 (Need more time - to focus on struggle areas)
   * - Last 3-5 reviews with ratings 2-3 (to build on understanding)
   * Returns up to 7 most relevant entries
   */
  private selectRelevantHistory(
    history: Array<{
      date: string;
      rating: 1 | 2 | 3 | 4;
      sessionNumber: number;
      response?: string;
      prompt?: string;
    }>
  ): Array<{
    date: string;
    rating: 1 | 2 | 3 | 4;
    sessionNumber: number;
    response?: string;
    prompt?: string;
  }> {
    // Separate by rating: 1 = struggled, 2-3 = productive, 4 = retired
    const struggled = history.filter((entry) => entry.rating === 1);
    const productive = history.filter((entry) => entry.rating >= 2 && entry.rating <= 3);

    // Take all struggled reviews + last 3-5 productive reviews
    const recentProductive = productive.slice(-5);

    // Combine and sort by date (most recent last)
    const selected = [...struggled, ...recentProductive].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Limit to 7 entries to avoid context bloat
    return selected.slice(-7);
  }

  /**
   * Format review history for agent context
   */
  private formatReviewHistory(
    history: Array<{
      date: string;
      rating: 1 | 2 | 3 | 4;
      sessionNumber: number;
      response?: string;
      prompt?: string;
    }>
  ): string {
    if (history.length === 0) {
      return 'This is the first review for this note.';
    }

    const ratingLabels: Record<number, string> = {
      1: 'Need more time',
      2: 'Productive',
      3: 'Already familiar',
      4: 'Fully processed'
    };

    const entries = history
      .map((entry, index) => {
        const date = new Date(entry.date).toLocaleDateString();
        const outcome = ratingLabels[entry.rating] || 'Unknown';
        const prompt = entry.prompt ? `\nChallenge: ${entry.prompt}` : '';
        const response = entry.response
          ? `\nUser Response: ${entry.response.substring(0, 200)}${entry.response.length > 200 ? '...' : ''}`
          : '';

        return `Review ${index + 1} (${date}) - ${outcome}${prompt}${response}`;
      })
      .join('\n\n');

    return `# Previous Review History\n\n${entries}`;
  }

  /**
   * Generate a review prompt for a specific note
   * Uses the review agent with tools to create a contextual review challenge
   */
  async generateReviewPrompt(
    noteId: string
  ): Promise<{ prompt: string; error?: string }> {
    logger.info('generateReviewPrompt called', { noteId });

    try {
      if (!this.noteService) {
        throw new Error('Note service not available');
      }

      const flintApi = this.noteService.getFlintNoteApi();
      const currentVault = await this.noteService.getCurrentVault();
      if (!currentVault) {
        throw new Error('No active vault');
      }

      // Get the note content
      const note = await flintApi.getNote(currentVault.id, noteId);
      logger.info('Retrieved note for review prompt generation', {
        noteId,
        noteTitle: note.title,
        contentLength: note.content?.length || 0
      });

      // Get review history for this note
      const reviewItem = await flintApi.getReviewItem({
        noteId,
        vaultId: currentVault.id
      });
      const reviewHistory = reviewItem ? reviewItem.reviewHistory : [];

      // Select and format relevant history
      const relevantHistory = this.selectRelevantHistory(reviewHistory);
      const formattedHistory = this.formatReviewHistory(relevantHistory);

      logger.info('Review history retrieved', {
        noteId,
        totalHistoryCount: reviewHistory.length,
        relevantHistoryCount: relevantHistory.length
      });

      // Build minimal context - agent will fetch full content via tools to avoid context window issues
      const noteContext = `# Note to Review

Title: ${note.title}
ID: ${note.id}
Type: ${note.type}

The note has ${note.content?.length || 0} characters of content. Use the get_note_full tool to retrieve the full content.

${formattedHistory}`;

      // Use review tools to allow agent to fetch additional context
      const tools = this.toolService.getReviewTools();

      // Ask the agent to generate a review prompt using streamText for proper tool handling
      // Enhanced system prompt with review history guidance
      const minimalSystemPrompt = `You generate review prompts for notes using spaced repetition principles.

After using get_note_full to read the note, create a challenging question that tests understanding.

IMPORTANT - Use the review history provided to:
1. **Avoid repetition**: Don't ask questions similar to previous challenges
2. **Focus on struggle areas**: If the user failed previous reviews, target those concepts
3. **Build progressively**: Reference or extend what was covered in earlier reviews
4. **Track progress**: Consider how their understanding has evolved

If this is the first review, create a foundational question. If there's history showing failed reviews, focus on those weak areas with a different approach.

You can include thinking/context before the question if helpful, but MUST wrap your final question in <question> tags.

Example output:
I see this is the third review. Previous challenges focused on theory, but the user struggled. Let me create a practical application question instead.

<question>
How would you apply the concept of elaborative encoding to improve retention when learning a new programming language?
</question>

The <question> tags are REQUIRED.`;

      const userMessage =
        noteContext +
        '\n\nUse get_note_full to read the note content, explore connections with other tools if helpful, then output a review prompt question.';

      // Log request details before sending
      logger.info('Review prompt generation - request details', {
        noteId,
        systemPromptLength: minimalSystemPrompt.length,
        userMessageLength: userMessage.length,
        toolCount: tools ? Object.keys(tools).length : 0,
        toolNames: tools ? Object.keys(tools) : [],
        toolDefinitionsSize: tools ? JSON.stringify(tools).length : 0
      });

      const result = streamText({
        model: this.providerClient(this.currentModelName),
        messages: [
          {
            role: 'system',
            content: minimalSystemPrompt
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        tools,
        stopWhen: stepCountIs(10), // Allow up to 10 steps for tool calling
        abortSignal: AbortSignal.timeout(30000) // 30 second timeout for tool calls
      });

      // Collect the final text from the stream
      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      // Wait for completion to get metadata
      const finalResult = await result;

      // Log the raw response from the agent
      logger.info('Review prompt generation - raw response', {
        noteId,
        rawText: fullText,
        textLength: fullText.length,
        finishReason: finalResult.finishReason,
        usage: finalResult.usage
      });

      // Extract the question from <question> tags
      let prompt = fullText.trim();

      // Try to extract content from <question> tags
      const questionMatch = prompt.match(/<question>\s*([\s\S]*?)\s*<\/question>/i);
      if (questionMatch) {
        prompt = questionMatch[1].trim();
        logger.info('Extracted question from tags', {
          noteId,
          originalLength: fullText.length,
          extractedLength: prompt.length
        });
      } else {
        logger.warn('No <question> tags found in response, using full text', {
          noteId,
          responsePreview: fullText.substring(0, 200)
        });
      }

      logger.info('Review prompt generation - final result', {
        noteId,
        finalPrompt: prompt,
        promptLength: prompt.length
      });

      return { prompt: prompt.trim() };
    } catch (error) {
      logger.error('Failed to generate review prompt', { error, noteId });

      // Provide a fallback simple prompt if agent fails
      const fallbackPrompt =
        'Explain the main concepts in this note in your own words. What are the key ideas and how do they relate to each other?';

      return {
        prompt: fallbackPrompt,
        error: 'Agent timed out or failed, using simple fallback prompt'
      };
    }
  }

  /**
   * Analyze a user's review response and provide feedback
   * Uses the review agent to evaluate understanding and suggest connections
   */
  async analyzeReviewResponse(
    noteId: string,
    prompt: string,
    userResponse: string
  ): Promise<{ feedback: string; suggestedLinks?: string[]; error?: string }> {
    logger.info('analyzeReviewResponse called', {
      noteId,
      promptLength: prompt.length,
      userResponseLength: userResponse.length
    });

    try {
      if (!this.noteService) {
        throw new Error('Note service not available');
      }

      const flintApi = this.noteService.getFlintNoteApi();
      const currentVault = await this.noteService.getCurrentVault();
      if (!currentVault) {
        throw new Error('No active vault');
      }

      // Get the note content for context
      const note = await flintApi.getNote(currentVault.id, noteId);
      logger.info('Retrieved note for feedback generation', {
        noteId,
        noteTitle: note.title
      });

      // Build minimal context - agent will fetch full content via tools to avoid context window issues
      const noteContext = `# Note Being Reviewed

Title: ${note.title}
ID: ${note.id}

The note has ${note.content?.length || 0} characters. Use get_note_full if you need the full content.

---

# Review Prompt That Was Asked

${prompt}

---

# User's Response

${userResponse}`;

      // Use review tools to allow agent to suggest connections
      const tools = this.toolService.getReviewTools();

      // Ask the agent to analyze the response using streamText for proper tool handling
      // Use a minimal system prompt to avoid context window issues
      const minimalFeedbackPrompt = `Analyze a user's review response.

You can include thinking before your feedback if helpful, but MUST wrap your final feedback in <feedback> tags.

Your feedback should:
1. Acknowledge what they got right
2. Point out gaps or areas to expand
3. Suggest connections to other notes (use [[note-id]] wikilinks)
4. Be encouraging and supportive

Example output:
I'll analyze their understanding of the concept...

<feedback>
Great explanation! You correctly identified the key mechanism. To deepen your understanding, consider how this connects to [[related-concept]]. Could you explore the implications for real-world applications?
</feedback>

The <feedback> tags are REQUIRED.`;

      const result = streamText({
        model: this.providerClient(this.currentModelName),
        messages: [
          {
            role: 'system',
            content: minimalFeedbackPrompt
          },
          {
            role: 'user',
            content: noteContext
          }
        ],
        tools,
        stopWhen: stepCountIs(10), // Allow up to 10 steps for tool calling
        abortSignal: AbortSignal.timeout(30000) // 30 second timeout for tool calls
      });

      // Collect the final text from the stream
      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      // Wait for completion to get metadata
      const finalResult = await result;

      // Log the raw response
      logger.info('Review feedback - raw response', {
        noteId,
        rawText: fullText,
        textLength: fullText.length,
        finishReason: finalResult.finishReason,
        usage: finalResult.usage
      });

      // Extract the feedback from <feedback> tags
      let feedback = fullText.trim();

      // Try to extract content from <feedback> tags
      const feedbackMatch = feedback.match(/<feedback>\s*([\s\S]*?)\s*<\/feedback>/i);
      if (feedbackMatch) {
        feedback = feedbackMatch[1].trim();
        logger.info('Extracted feedback from tags', {
          noteId,
          originalLength: fullText.length,
          extractedLength: feedback.length
        });
      } else {
        logger.warn('No <feedback> tags found in response, using full text', {
          noteId,
          responsePreview: fullText.substring(0, 200)
        });
      }

      // Extract wikilinks from the feedback to identify suggested links
      const wikilinkPattern = /\[\[([^\]]+)\]\]/g;
      const suggestedLinks: string[] = [];
      let match;
      while ((match = wikilinkPattern.exec(feedback)) !== null) {
        suggestedLinks.push(match[1]);
      }

      logger.info('Review feedback - final result', {
        noteId,
        feedbackLength: feedback.length,
        suggestedLinksCount: suggestedLinks.length
      });

      return {
        feedback: feedback.trim(),
        suggestedLinks: suggestedLinks.length > 0 ? suggestedLinks : undefined
      };
    } catch (error) {
      logger.error('Failed to analyze review response', { error, noteId });

      // Provide fallback feedback if agent fails
      const fallbackFeedback =
        'Thank you for your response. Your explanation shows engagement with the material. Consider reviewing the note content to deepen your understanding.';

      return {
        feedback: fallbackFeedback,
        error: 'Agent timed out or failed, using simple fallback feedback'
      };
    }
  }
}
