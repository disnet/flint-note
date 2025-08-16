import { ElectronAPI } from '@electron-toolkit/preload';
import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem,
  NoteTypeListItem
} from '@flint-note/server';
import type { MoveNoteResult } from '@flint-note/server/dist/core/notes';
import type { SearchResult } from '@flint-note/server/dist/database/search-manager';
import type {
  CoreVaultInfo as VaultInfo,
  CoreNoteLinkRow as NoteLinkRow,
  CoreNoteTypeInfo as NoteTypeInfo
} from '@flint-note/server/dist/api/types';
import type { ExternalLinkRow } from '@flint-note/server/dist/database/schema';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';
import type { GetNoteTypeInfoResult } from '@flint-note/server/dist/server/types';

// Cache monitoring types
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

interface FrontendMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date | string;
  toolCalls?: unknown[];
}

export type ToolCallData = {
  toolCallId: string;
  name: string;
  arguments: unknown;
  result: string | undefined;
  error: string | undefined;
};

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      // Chat operations
      sendMessage: (message: {
        message: string;
        conversationId?: string;
        model?: string;
      }) => Promise<string>;
      sendMessageStream: (
        params: {
          message: string;
          conversationId?: string;
          model?: string;
          requestId: string;
        },
        onStreamStart: (data: { requestId: string }) => void,
        onStreamChunk: (data: { requestId: string; chunk: string }) => void,
        onStreamEnd: (data: { requestId: string; fullText: string }) => void,
        onStreamError: (data: { requestId: string; error: string }) => void,
        onStreamToolCall?: (data: { requestId: string; toolCall: ToolCallData }) => void
      ) => void;
      clearConversation: () => Promise<{ success: boolean; error?: string }>;
      syncConversation: (params: {
        conversationId: string;
        messages: FrontendMessage[];
      }) => Promise<{ success: boolean; error?: string }>;
      setActiveConversation: (params: {
        conversationId: string;
        messages?: FrontendMessage[] | string;
      }) => Promise<{ success: boolean; error?: string }>;

      // Note operations
      createNote: (params: {
        type: string;
        identifier: string;
        content: string;
        vaultId?: string;
      }) => Promise<NoteInfo>;
      getNote: (params: { identifier: string; vaultId?: string }) => Promise<Note | null>;
      updateNote: (params: {
        identifier: string;
        content: string;
        vaultId?: string;
      }) => Promise<UpdateResult>;
      deleteNote: (params: {
        identifier: string;
        vaultId?: string;
      }) => Promise<DeleteNoteResult>;
      renameNote: (params: {
        identifier: string;
        newIdentifier: string;
        vaultId?: string;
      }) => Promise<{ success: boolean; notesUpdated?: number; linksUpdated?: number }>;
      moveNote: (params: {
        identifier: string;
        newType: string;
        vaultId?: string;
      }) => Promise<MoveNoteResult>;

      // Search operations
      searchNotes: (params: {
        query: string;
        vaultId?: string;
        limit?: number;
      }) => Promise<SearchResult[]>;
      searchNotesAdvanced: (params: {
        query: string;
        type?: string;
        tags?: string[];
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        vaultId?: string;
      }) => Promise<SearchResult[]>;

      // Note type operations
      listNoteTypes: () => Promise<NoteTypeListItem[]>;
      createNoteType: (params: {
        typeName: string;
        description: string;
        agentInstructions?: string[];
        metadataSchema?: MetadataSchema;
        vaultId?: string;
      }) => Promise<NoteTypeInfo>;
      getNoteTypeInfo: (params: {
        typeName: string;
        vaultId?: string;
      }) => Promise<GetNoteTypeInfoResult>;
      listNotesByType: (params: {
        type: string;
        vaultId?: string;
        limit?: number;
      }) => Promise<NoteListItem[]>;

      // Vault operations
      listVaults: () => Promise<VaultInfo[]>;
      getCurrentVault: () => Promise<VaultInfo | null>;
      createVault: (params: {
        name: string;
        path: string;
        description?: string;
      }) => Promise<VaultInfo>;
      switchVault: (params: { vaultId: string }) => Promise<void>;

      // Link operations
      getNoteLinks: (params: { identifier: string; vaultId?: string }) => Promise<{
        outgoing_internal: NoteLinkRow[];
        outgoing_external: ExternalLinkRow[];
        incoming: NoteLinkRow[];
      }>;
      getBacklinks: (params: {
        identifier: string;
        vaultId?: string;
      }) => Promise<NoteLinkRow[]>;
      findBrokenLinks: (params: { vaultId?: string }) => Promise<NoteLinkRow[]>;

      // Service status
      noteServiceReady: () => Promise<boolean>;

      // Secure storage operations
      secureStorageAvailable: () => Promise<boolean>;
      storeApiKey: (params: {
        provider: 'anthropic' | 'openai' | 'gateway';
        key: string;
        orgId?: string;
      }) => Promise<void>;
      getApiKey: (params: {
        provider: 'anthropic' | 'openai' | 'gateway';
      }) => Promise<{ key: string; orgId?: string }>;
      testApiKey: (params: {
        provider: 'anthropic' | 'openai' | 'gateway';
      }) => Promise<boolean>;
      getAllApiKeys: () => Promise<{
        anthropic: string;
        openai: string;
        openaiOrgId: string;
        gateway: string;
      }>;
      clearApiKeys: () => Promise<void>;

      // Cache monitoring operations
      getCacheMetrics: () => Promise<CacheMetrics>;
      getCachePerformanceSnapshot: () => Promise<CachePerformanceSnapshot>;
      getCacheConfig: () => Promise<CacheConfig>;
      setCacheConfig: (config: Partial<CacheConfig>) => Promise<CacheConfig>;
      getCachePerformanceReport: () => Promise<string>;
      getCacheHealthCheck: () => Promise<CacheHealthCheck>;
      optimizeCacheConfig: () => Promise<CacheConfig>;
      resetCacheMetrics: () => Promise<{ success: boolean }>;
      startPerformanceMonitoring: (
        intervalMinutes?: number
      ) => Promise<{ success: boolean }>;
      stopPerformanceMonitoring: () => Promise<{ success: boolean }>;
      warmupSystemCache: () => Promise<{ success: boolean }>;

      // Usage tracking
      onUsageRecorded: (callback: (usageData: unknown) => void) => void;
      removeUsageListener: () => void;
    };
  }
}
