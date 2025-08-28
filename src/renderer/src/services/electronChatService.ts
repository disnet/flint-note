import type { ChatService, NoteService, ChatResponse, Message } from './types';
import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem
} from '@/server/core/notes';
import type { NoteTypeListItem } from '@/server/core/note-types';
import type { NoteMetadata } from '@/server/types';
import type { MoveNoteResult } from '@/server/core/notes';
import type { SearchResult } from '@/server/database/search-manager';
import type {
  CoreVaultInfo as VaultInfo,
  CoreNoteLinkRow as NoteLinkRow,
  CoreNoteTypeInfo as NoteTypeInfo
} from '@/server/api/types';
import type { ExternalLinkRow } from '@/server/database/schema';
import type {
  MetadataFieldDefinition,
  MetadataSchema
} from '@/server/core/metadata-schema';
import { notesStore } from './noteStore.svelte';
import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';
import type { GetNoteTypeInfoResult } from '@/server/server/types';
import type { NoteTypeDescription } from '@/server/core/note-types';

// Cache monitoring interfaces
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

interface CacheHealthCheck {
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations: string[];
  score: number;
}

export class ElectronChatService implements ChatService, NoteService {
  constructor() {
    // Set up usage tracking
    this.initializeUsageTracking();
  }

  private initializeUsageTracking(): void {
    // Set up listener for usage data
    if (window.api?.onUsageRecorded) {
      window.api.onUsageRecorded(async (usageData: unknown) => {
        // Type guard to ensure usageData has the expected shape
        if (
          typeof usageData === 'object' &&
          usageData !== null &&
          'conversationId' in usageData &&
          'modelName' in usageData &&
          'inputTokens' in usageData &&
          'outputTokens' in usageData &&
          'cachedTokens' in usageData &&
          'cost' in usageData &&
          'timestamp' in usageData
        ) {
          const data = usageData as {
            conversationId: string;
            modelName: string;
            inputTokens: number;
            outputTokens: number;
            cachedTokens: number;
            cost: number;
            timestamp: string;
          };

          // Record usage in the unified chat store
          await unifiedChatStore.recordThreadUsage(data.conversationId, {
            modelName: data.modelName,
            inputTokens: data.inputTokens,
            outputTokens: data.outputTokens,
            cachedTokens: data.cachedTokens,
            cost: data.cost,
            timestamp: new Date(data.timestamp)
          });
        }
      });
    }
  }
  async sendMessage(
    text: string,
    conversationId?: string,
    model?: string
  ): Promise<ChatResponse> {
    try {
      const response = await window.api.sendMessage({
        message: text,
        conversationId,
        model
      });

      // Handle both old string format and new object format
      if (typeof response === 'string') {
        return { text: response };
      }

      return response;
    } catch (error) {
      console.error('Failed to send message via Electron API:', error);
      throw new Error('Failed to send message. Please try again.');
    }
  }

  sendMessageStream(
    text: string,
    conversationId: string | undefined,
    onChunk: (chunk: string) => void,
    onComplete: (fullText: string) => void,
    onError: (error: string) => void,
    model?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onToolCall?: (toolCall: any) => void
  ): void {
    const requestId = crypto.randomUUID();

    window.api.sendMessageStream(
      { message: text, conversationId, model, requestId },
      (data) => {
        // Stream started
        console.log('Stream started:', data.requestId);
      },
      (data) => {
        // Handle text chunk
        if (data.requestId === requestId) {
          onChunk(data.chunk);
        }
      },
      (data) => {
        // Stream ended
        if (data.requestId === requestId) {
          onComplete(data.fullText);
        }
      },
      (data) => {
        // Stream error
        if (data.requestId === requestId) {
          onError(data.error);
        }
      },
      onToolCall
        ? (data) => {
            // Handle tool call
            if (data.requestId === requestId) {
              onToolCall(data.toolCall);
              // Trigger notes store refresh for any tool call
              notesStore.handleToolCall({ name: data.toolCall.name });
            }
          }
        : (data) => {
            // Even if no onToolCall callback, still handle notes store refresh
            if (data.requestId === requestId) {
              notesStore.handleToolCall({ name: data.toolCall.name });
            }
          }
    );
  }

  // Conversation sync operations
  async syncConversation(
    conversationId: string,
    messages: Message[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      return await window.api.syncConversation({ conversationId, messages });
    } catch (error) {
      console.error('Failed to sync conversation:', error);
      return { success: false, error: 'Failed to sync conversation' };
    }
  }

  async setActiveConversation(
    conversationId: string,
    messages?: Message[] | string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // First attempt with messages
      if (messages && messages.length > 0) {
        try {
          return await window.api.setActiveConversation({ conversationId, messages });
        } catch {
          // Fallback: try with empty messages array
          return await window.api.setActiveConversation({ conversationId, messages: [] });
        }
      } else {
        return await window.api.setActiveConversation({
          conversationId,
          messages: messages || []
        });
      }
    } catch (error) {
      console.error('Failed to set active conversation:', error);
      return { success: false, error: 'Failed to set active conversation' };
    }
  }

  // Note operations
  async createNote(params: {
    type: string;
    identifier: string;
    content: string;
    vaultId?: string;
  }): Promise<NoteInfo> {
    const { type, identifier, content, vaultId } = params;
    try {
      return await window.api.createNote({ type, identifier, content, vaultId });
    } catch (error) {
      console.error('Failed to create note:', error);
      throw new Error('Failed to create note. Please try again.');
    }
  }

  async getNote(params: { identifier: string; vaultId?: string }): Promise<Note | null> {
    const { identifier, vaultId } = params;
    try {
      return await window.api.getNote({ identifier, vaultId });
    } catch (error) {
      console.error('Failed to get note:', error);
      throw new Error('Failed to get note. Please try again.');
    }
  }

  async updateNote(params: {
    identifier: string;
    content: string;
    vaultId?: string;
    metadata?: NoteMetadata;
  }): Promise<UpdateResult> {
    const { identifier, content, vaultId } = params;
    try {
      return await window.api.updateNote({ identifier, content, vaultId });
    } catch (error) {
      console.error('Failed to update note:', error);
      throw new Error('Failed to update note. Please try again.');
    }
  }

  async deleteNote(params: {
    identifier: string;
    vaultId?: string;
  }): Promise<DeleteNoteResult> {
    const { identifier, vaultId } = params;
    try {
      return await window.api.deleteNote({ identifier, vaultId });
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw new Error('Failed to delete note. Please try again.');
    }
  }

  async renameNote(params: {
    identifier: string;
    newIdentifier: string;
    vaultId?: string;
  }): Promise<{ success: boolean; notesUpdated?: number; linksUpdated?: number }> {
    const { identifier, newIdentifier, vaultId } = params;
    try {
      return await window.api.renameNote({ identifier, newIdentifier, vaultId });
    } catch (error) {
      console.error('Failed to rename note:', error);
      throw new Error('Failed to rename note. Please try again.');
    }
  }

  async moveNote(params: {
    identifier: string;
    newType: string;
    vaultId?: string;
  }): Promise<MoveNoteResult> {
    const { identifier, newType, vaultId } = params;
    try {
      return await window.api.moveNote({ identifier, newType, vaultId });
    } catch (error) {
      console.error('Failed to move note:', error);
      throw new Error('Failed to move note. Please try again.');
    }
  }

  // Search operations
  async searchNotes(params: {
    query: string;
    vaultId?: string;
    limit?: number;
  }): Promise<SearchResult[]> {
    const { query, vaultId, limit } = params;
    try {
      return await window.api.searchNotes({ query, vaultId, limit });
    } catch (error) {
      console.error('Failed to search notes:', error);
      throw new Error('Failed to search notes. Please try again.');
    }
  }

  async searchNotesAdvanced(params: {
    query: string;
    type?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    vaultId?: string;
  }): Promise<SearchResult[]> {
    try {
      return await window.api.searchNotesAdvanced(params);
    } catch (error) {
      console.error('Failed to search notes:', error);
      throw new Error('Failed to search notes. Please try again.');
    }
  }

  // Note type operations
  async listNoteTypes(): Promise<NoteTypeListItem[]> {
    try {
      return await window.api.listNoteTypes();
    } catch (error) {
      console.error('Failed to list note types:', error);
      throw new Error('Failed to list note types. Please try again.');
    }
  }

  async createNoteType(params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId?: string;
  }): Promise<NoteTypeInfo> {
    try {
      return await window.api.createNoteType(params);
    } catch (error) {
      console.error('Failed to create note type:', error);
      throw new Error('Failed to create note type. Please try again.');
    }
  }

  async getNoteTypeInfo(params: {
    typeName: string;
    vaultId?: string;
  }): Promise<GetNoteTypeInfoResult> {
    try {
      return await window.api.getNoteTypeInfo(params);
    } catch (error) {
      console.error('Failed to get note type info:', error);
      throw new Error('Failed to get note type info. Please try again.');
    }
  }

  async updateNoteType(params: {
    typeName: string;
    description?: string;
    instructions?: string[];
    metadataSchema?: MetadataFieldDefinition[];
    vaultId?: string;
  }): Promise<NoteTypeDescription> {
    try {
      return await window.api.updateNoteType(params);
    } catch (error) {
      console.error('Failed to update note type:', error);
      throw new Error('Failed to update note type. Please try again.');
    }
  }

  async listNotesByType(params: {
    type: string;
    vaultId?: string;
    limit?: number;
  }): Promise<NoteListItem[]> {
    const { type, vaultId, limit } = params;
    try {
      return await window.api.listNotesByType({ type, vaultId, limit });
    } catch (error) {
      console.error('Failed to list notes by type:', error);
      throw new Error('Failed to list notes by type. Please try again.');
    }
  }

  // Vault operations
  async listVaults(): Promise<VaultInfo[]> {
    try {
      return await window.api.listVaults();
    } catch (error) {
      console.error('Failed to list vaults:', error);
      throw new Error('Failed to list vaults. Please try again.');
    }
  }

  async getCurrentVault(): Promise<VaultInfo | null> {
    try {
      return await window.api.getCurrentVault();
    } catch (error) {
      console.error('Failed to get current vault:', error);
      throw new Error('Failed to get current vault. Please try again.');
    }
  }

  async createVault(params: {
    name: string;
    path: string;
    description?: string;
  }): Promise<VaultInfo> {
    const { name, path, description } = params;
    try {
      return await window.api.createVault({ name, path, description });
    } catch (error) {
      console.error('Failed to create vault:', error);
      throw new Error('Failed to create vault. Please try again.');
    }
  }

  async switchVault(params: { vaultId: string }): Promise<void> {
    const { vaultId } = params;
    try {
      return await window.api.switchVault({ vaultId });
    } catch (error) {
      console.error('Failed to switch vault:', error);
      throw new Error('Failed to switch vault. Please try again.');
    }
  }

  async removeVault(params: { vaultId: string }): Promise<void> {
    const { vaultId } = params;
    try {
      return await window.api.removeVault({ vaultId });
    } catch (error) {
      console.error('Failed to remove vault:', error);
      throw new Error('Failed to remove vault. Please try again.');
    }
  }

  // Link operations
  async getNoteLinks(params: { identifier: string; vaultId?: string }): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }> {
    const { identifier, vaultId } = params;
    try {
      return await window.api.getNoteLinks({ identifier, vaultId });
    } catch (error) {
      console.error('Failed to get note links:', error);
      throw new Error('Failed to get note links. Please try again.');
    }
  }

  async getBacklinks(params: {
    identifier: string;
    vaultId?: string;
  }): Promise<NoteLinkRow[]> {
    const { identifier, vaultId } = params;
    try {
      return await window.api.getBacklinks({ identifier, vaultId });
    } catch (error) {
      console.error('Failed to get backlinks:', error);
      throw new Error('Failed to get backlinks. Please try again.');
    }
  }

  async findBrokenLinks(params: { vaultId?: string }): Promise<NoteLinkRow[]> {
    const { vaultId } = params;
    try {
      return await window.api.findBrokenLinks({ vaultId });
    } catch (error) {
      console.error('Failed to find broken links:', error);
      throw new Error('Failed to find broken links. Please try again.');
    }
  }

  // Service status
  async isReady(): Promise<boolean> {
    try {
      return await window.api.noteServiceReady();
    } catch (error) {
      console.error('Failed to check note service status:', error);
      return false;
    }
  }

  // Cache monitoring methods
  async getCacheMetrics(): Promise<CacheMetrics> {
    try {
      return await window.api.getCacheMetrics();
    } catch (error) {
      console.error('Failed to get cache metrics:', error);
      throw new Error('Failed to get cache metrics. Please try again.');
    }
  }

  async getCachePerformanceSnapshot(): Promise<CachePerformanceSnapshot> {
    try {
      return await window.api.getCachePerformanceSnapshot();
    } catch (error) {
      console.error('Failed to get cache performance snapshot:', error);
      throw new Error('Failed to get cache performance snapshot. Please try again.');
    }
  }

  async getCacheConfig(): Promise<CacheConfig> {
    try {
      return await window.api.getCacheConfig();
    } catch (error) {
      console.error('Failed to get cache configuration:', error);
      throw new Error('Failed to get cache configuration. Please try again.');
    }
  }

  async setCacheConfig(config: Partial<CacheConfig>): Promise<CacheConfig> {
    try {
      return await window.api.setCacheConfig(config);
    } catch (error) {
      console.error('Failed to set cache configuration:', error);
      throw new Error('Failed to set cache configuration. Please try again.');
    }
  }

  async getCachePerformanceReport(): Promise<string> {
    try {
      return await window.api.getCachePerformanceReport();
    } catch (error) {
      console.error('Failed to get cache performance report:', error);
      throw new Error('Failed to get cache performance report. Please try again.');
    }
  }

  async getCacheHealthCheck(): Promise<CacheHealthCheck> {
    try {
      return await window.api.getCacheHealthCheck();
    } catch (error) {
      console.error('Failed to get cache health check:', error);
      throw new Error('Failed to get cache health check. Please try again.');
    }
  }

  async optimizeCacheConfig(): Promise<CacheConfig> {
    try {
      return await window.api.optimizeCacheConfig();
    } catch (error) {
      console.error('Failed to optimize cache configuration:', error);
      throw new Error('Failed to optimize cache configuration. Please try again.');
    }
  }

  async resetCacheMetrics(): Promise<{ success: boolean }> {
    try {
      return await window.api.resetCacheMetrics();
    } catch (error) {
      console.error('Failed to reset cache metrics:', error);
      throw new Error('Failed to reset cache metrics. Please try again.');
    }
  }

  async startPerformanceMonitoring(
    intervalMinutes: number = 30
  ): Promise<{ success: boolean }> {
    try {
      return await window.api.startPerformanceMonitoring(intervalMinutes);
    } catch (error) {
      console.error('Failed to start performance monitoring:', error);
      throw new Error('Failed to start performance monitoring. Please try again.');
    }
  }

  async stopPerformanceMonitoring(): Promise<{ success: boolean }> {
    try {
      return await window.api.stopPerformanceMonitoring();
    } catch (error) {
      console.error('Failed to stop performance monitoring:', error);
      throw new Error('Failed to stop performance monitoring. Please try again.');
    }
  }

  async warmupSystemCache(): Promise<{ success: boolean }> {
    try {
      return await window.api.warmupSystemCache();
    } catch (error) {
      console.error('Failed to warmup system cache:', error);
      throw new Error('Failed to warmup system cache. Please try again.');
    }
  }
}
