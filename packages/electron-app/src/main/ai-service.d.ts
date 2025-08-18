import { type GatewayProvider } from '@ai-sdk/gateway';
import { ModelMessage } from 'ai';
import { EventEmitter } from 'events';
import { SecureStorageService } from './secure-storage-service';
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
interface FrontendMessage {
    id: string;
    text: string;
    sender: 'user' | 'agent';
    timestamp: Date | string;
    toolCalls?: unknown[];
}
export declare class AIService extends EventEmitter {
    private currentModelName;
    private conversationHistories;
    private currentConversationId;
    private gateway;
    private systemPrompt;
    private noteService;
    private toolService;
    private readonly maxConversationHistory;
    private readonly maxConversations;
    private cacheConfig;
    private cacheMetrics;
    private performanceMonitoringInterval?;
    constructor(gateway: GatewayProvider, noteService: NoteService | null);
    static of(secureStorage: SecureStorageService, noteService?: NoteService | null): Promise<AIService>;
    private switchModel;
    private loadSystemPrompt;
    private estimateTokens;
    private isAnthropicModel;
    private getSystemMessage;
    private getSystemMessageWithCaching;
    private getConversationMessages;
    private setConversationHistory;
    /**
     * Creates a cached message segment from multiple messages.
     * Combines messages into a single cached message for token efficiency.
     */
    private createCachedMessageSegment;
    /**
     * Prepares conversation messages with caching applied to stable segments.
     * Caches older messages while keeping recent messages uncached for flexibility.
     */
    private prepareCachedMessages;
    setCacheConfig(config: Partial<CacheConfig>): void;
    getCacheConfig(): CacheConfig;
    /**
     * Validates and optimizes cache configuration settings
     */
    private validateCacheConfig;
    /**
     * Records cache performance metrics for monitoring
     */
    private recordCacheMetrics;
    /**
     * Calculate cost for a model based on usage
     * @returns Cost in micro-cents (millionths of a dollar) for precise arithmetic
     */
    private calculateModelCost;
    /**
     * Record usage and cost data for a conversation
     */
    private recordUsageAndCost;
    /**
     * Gets current cache performance metrics
     */
    getCacheMetrics(): CacheMetrics;
    /**
     * Gets cache performance snapshot with calculated rates and recommendations
     */
    getCachePerformanceSnapshot(): CachePerformanceSnapshot;
    /**
     * Resets cache metrics for fresh tracking period
     */
    resetCacheMetrics(): void;
    /**
     * Automatically optimizes cache configuration based on current metrics
     */
    optimizeCacheConfig(): CacheConfig;
    /**
     * Generates a comprehensive cache performance report
     */
    getCachePerformanceReport(): string;
    /**
     * Logs a summary of cache performance at INFO level
     */
    logCachePerformanceSummary(): void;
    /**
     * Starts periodic cache performance monitoring
     */
    startPerformanceMonitoring(intervalMinutes?: number): void;
    /**
     * Stops periodic cache performance monitoring
     */
    stopPerformanceMonitoring(): void;
    /**
     * Warms up the system message cache by pre-loading it
     */
    warmupSystemMessageCache(): Promise<void>;
    /**
     * Provides cache health check with actionable insights
     */
    getCacheHealthCheck(): {
        status: 'healthy' | 'warning' | 'critical';
        issues: string[];
        recommendations: string[];
        score: number;
    };
    setActiveConversation(conversationId: string): void;
    setActiveConversationWithSync(conversationId: string, frontendMessages?: FrontendMessage[] | string): void;
    createConversation(conversationId?: string): string;
    deleteConversation(conversationId: string): boolean;
    getActiveConversationHistory(): ModelMessage[];
    clearAllConversations(): void;
    restoreConversationHistory(conversationId: string, messages: ModelMessage[]): void;
    syncConversationFromFrontend(conversationId: string, frontendMessages: FrontendMessage[]): void;
    private generateConversationId;
    private pruneOldConversations;
    sendMessage(userMessage: string, conversationId?: string, modelName?: string): Promise<{
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
    }>;
    clearConversation(): void;
    getConversationHistory(): Array<ModelMessage>;
    sendMessageStream(userMessage: string, requestId: string, conversationId?: string, modelName?: string): Promise<void>;
}
export {};
