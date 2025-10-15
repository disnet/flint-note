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
  CoreNoteTypeInfo as NoteTypeInfo,
  CreateVaultResult
} from '@/server/api/types';
import type { ExternalLinkRow } from '@/server/database/schema';
import type {
  MetadataFieldDefinition,
  MetadataSchema
} from '@/server/core/metadata-schema';
import { noteDocumentRegistry } from '../stores/noteDocumentRegistry.svelte';
import type { GetNoteTypeInfoResult } from '@/server/api/types';
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
  }

  private async handleNoteModifyingTool(toolCall: {
    name: string;
    arguments?: unknown;
  }): Promise<void> {
    // Handle tools that modify notes for UI refresh
    const noteModifyingTools = ['update_note', 'create_note', 'delete_note'];

    if (noteModifyingTools.includes(toolCall.name) && toolCall.arguments) {
      try {
        const args =
          typeof toolCall.arguments === 'string'
            ? JSON.parse(toolCall.arguments)
            : toolCall.arguments;

        let noteId: string | undefined;

        // Extract note ID based on tool type
        if (toolCall.name === 'update_note' || toolCall.name === 'delete_note') {
          noteId = args.id || args.identifier;
        } else if (toolCall.name === 'create_note') {
          // For create_note, use the title since that's what becomes the identifier
          noteId = args.title;
        }

        // Reload the affected note document if it's currently open
        if (noteId && noteDocumentRegistry.isOpen(noteId)) {
          await noteDocumentRegistry.reload(noteId);
        }
      } catch (err) {
        console.warn(
          'Failed to parse tool call arguments for note update notification:',
          err
        );
      }
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
    onToolCall?: (toolCall: any) => void,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onToolResult?: (toolCall: any) => void
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
              // Note: The message bus will automatically update the note cache when IPC events are published

              // Handle note-modifying tools for UI refresh
              this.handleNoteModifyingTool(data.toolCall);
            }
          }
        : (data) => {
            // Handle note-modifying tools for UI refresh
            if (data.requestId === requestId) {
              this.handleNoteModifyingTool(data.toolCall);
            }
          },
      onToolResult
        ? (data) => {
            // Handle tool result
            if (data.requestId === requestId) {
              onToolResult(data.toolCall);
            }
          }
        : undefined
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
    vaultId: string;
    type: string;
    identifier: string;
    content: string;
  }): Promise<NoteInfo> {
    const { vaultId, type, identifier, content } = params;
    try {
      return await window.api.createNote({ vaultId, type, identifier, content });
    } catch (error) {
      console.error('Failed to create note:', error);
      throw new Error('Failed to create note. Please try again.');
    }
  }

  async getNote(params: { vaultId: string; identifier: string }): Promise<Note | null> {
    const { identifier, vaultId } = params;
    try {
      return await window.api.getNote({ identifier, vaultId });
    } catch (error) {
      console.error('Failed to get note:', error);
      throw new Error('Failed to get note. Please try again.');
    }
  }

  async updateNote(params: {
    vaultId?: string;
    identifier: string;
    content: string;
    metadata?: NoteMetadata;
  }): Promise<UpdateResult> {
    const { vaultId, identifier, content, metadata } = params;
    try {
      return await window.api.updateNote({ vaultId, identifier, content, metadata });
    } catch (error) {
      console.error('Failed to update note:', error);
      throw new Error('Failed to update note. Please try again.');
    }
  }

  async deleteNote(params: {
    vaultId: string;
    identifier: string;
  }): Promise<DeleteNoteResult> {
    const { vaultId, identifier } = params;
    try {
      return await window.api.deleteNote({ vaultId, identifier });
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw new Error('Failed to delete note. Please try again.');
    }
  }

  async renameNote(params: {
    vaultId: string;
    identifier: string;
    newIdentifier: string;
  }): Promise<{
    success: boolean;
    notesUpdated?: number;
    linksUpdated?: number;
    new_id?: string;
  }> {
    const { vaultId, identifier, newIdentifier } = params;
    try {
      return await window.api.renameNote({ vaultId, identifier, newIdentifier });
    } catch (error) {
      console.error('Failed to rename note:', error);
      throw new Error('Failed to rename note. Please try again.');
    }
  }

  async moveNote(params: {
    vaultId: string;
    identifier: string;
    newType: string;
  }): Promise<MoveNoteResult> {
    const { vaultId, identifier, newType } = params;
    try {
      return await window.api.moveNote({ vaultId, identifier, newType });
    } catch (error) {
      console.error('Failed to move note:', error);
      throw new Error('Failed to move note. Please try again.');
    }
  }

  // Search operations
  async searchNotes(params: {
    vaultId: string;
    query: string;
    limit?: number;
  }): Promise<SearchResult[]> {
    const { vaultId, query, limit } = params;
    try {
      return await window.api.searchNotes({ vaultId, query, limit });
    } catch (error) {
      console.error('Failed to search notes:', error);
      throw new Error('Failed to search notes. Please try again.');
    }
  }

  async searchNotesAdvanced(params: {
    vaultId: string;
    query: string;
    type?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
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
    vaultId: string;
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
  }): Promise<NoteTypeInfo> {
    try {
      return await window.api.createNoteType(params);
    } catch (error) {
      console.error('Failed to create note type:', error);
      throw new Error('Failed to create note type. Please try again.');
    }
  }

  async getNoteTypeInfo(params: {
    vaultId: string;
    typeName: string;
  }): Promise<GetNoteTypeInfoResult> {
    try {
      return await window.api.getNoteTypeInfo(params);
    } catch (error) {
      console.error('Failed to get note type info:', error);
      throw new Error('Failed to get note type info. Please try again.');
    }
  }

  async updateNoteType(params: {
    vaultId: string;
    typeName: string;
    description?: string;
    instructions?: string[];
    metadataSchema?: MetadataFieldDefinition[];
  }): Promise<NoteTypeDescription> {
    try {
      return await window.api.updateNoteType(params);
    } catch (error) {
      console.error('Failed to update note type:', error);
      throw new Error('Failed to update note type. Please try again.');
    }
  }

  async listNotesByType(params: {
    vaultId: string;
    type: string;
    limit?: number;
  }): Promise<NoteListItem[]> {
    const { vaultId, type, limit } = params;
    try {
      return await window.api.listNotesByType({ vaultId, type, limit });
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
    templateId?: string;
  }): Promise<CreateVaultResult> {
    const { name, path, description, templateId } = params;
    try {
      return await window.api.createVault({ name, path, description, templateId });
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
  async getNoteLinks(params: { vaultId: string; identifier: string }): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }> {
    const { vaultId, identifier } = params;
    try {
      return await window.api.getNoteLinks({ vaultId, identifier });
    } catch (error) {
      console.error('Failed to get note links:', error);
      throw new Error('Failed to get note links. Please try again.');
    }
  }

  async getBacklinks(params: {
    vaultId: string;
    identifier: string;
  }): Promise<NoteLinkRow[]> {
    const { vaultId, identifier } = params;
    try {
      return await window.api.getBacklinks({ vaultId, identifier });
    } catch (error) {
      console.error('Failed to get backlinks:', error);
      throw new Error('Failed to get backlinks. Please try again.');
    }
  }

  async findBrokenLinks(params: { vaultId: string }): Promise<NoteLinkRow[]> {
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
