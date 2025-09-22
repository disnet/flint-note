/// <reference types="vite/client" />

import type {
  MetadataFieldDefinition,
  MetadataSchema
} from '../server/core/metadata-schema';
import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem
} from '../server/core/notes';
import type { NoteTypeListItem } from '../server/core/note-types';
import type { NoteMetadata } from '../server/types';
import type { MoveNoteResult } from '../server/core/notes';
import type {
  CustomFunction,
  CustomFunctionParameter,
  ValidationResult,
  CustomFunctionExecutionResult
} from '../server/types/custom-functions';
import type { SearchResult } from '../server/database/search-manager';
import type {
  CoreVaultInfo as VaultInfo,
  CoreNoteLinkRow as NoteLinkRow,
  CoreNoteTypeInfo as NoteTypeInfo
} from '../server/api/types';
import type { ExternalLinkRow } from '../server/database/schema';
import type { ChatResponse } from './services/types';

interface FrontendMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date | string;
  toolCalls?: unknown[];
}

interface CacheConfig {
  enableSystemMessageCaching: boolean;
  enableHistoryCaching: boolean;
  minimumCacheTokens: number;
  historySegmentSize: number;
}

type ToolCallData = {
  toolCallId: string;
  name: string;
  arguments: unknown;
  result: string | undefined;
  error: string | undefined;
};

interface CursorPosition {
  noteId: string;
  position: number;
  selectionStart?: number;
  selectionEnd?: number;
  lastUpdated: string;
}

declare global {
  interface Window {
    electron: import('@electron-toolkit/preload').ElectronAPI;
    api: {
      // Chat operations
      sendMessage: (params: {
        message: string;
        conversationId?: string;
        model?: string;
      }) => Promise<any>;
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
      clearConversation: () => Promise<any>;
      syncConversation: (params: {
        conversationId: string;
        messages: FrontendMessage[];
      }) => Promise<any>;
      setActiveConversation: (params: {
        conversationId: string;
        messages?: FrontendMessage[] | string;
      }) => Promise<any>;

      // Note operations
      createNote: (params: {
        type: string;
        identifier: string;
        content: string;
        vaultId?: string;
      }) => Promise<any>;
      getNote: (params: { identifier: string; vaultId?: string }) => Promise<any>;
      updateNote: (params: {
        identifier: string;
        content: string;
        vaultId?: string;
        metadata?: NoteMetadata;
      }) => Promise<any>;
      deleteNote: (params: { identifier: string; vaultId?: string }) => Promise<any>;
      renameNote: (params: {
        identifier: string;
        newIdentifier: string;
        vaultId?: string;
      }) => Promise<any>;
      moveNote: (params: {
        identifier: string;
        newType: string;
        vaultId?: string;
      }) => Promise<any>;

      // Search operations
      searchNotes: (params: {
        query: string;
        vaultId?: string;
        limit?: number;
      }) => Promise<any>;
      searchNotesAdvanced: (params: {
        query: string;
        type?: string;
        tags?: string[];
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        vaultId?: string;
      }) => Promise<any>;

      // Note type operations
      listNoteTypes: () => Promise<any>;
      createNoteType: (params: {
        typeName: string;
        description: string;
        agentInstructions?: string[];
        metadataSchema?: MetadataSchema;
        vaultId?: string;
      }) => Promise<any>;
      getNoteTypeInfo: (params: { typeName: string; vaultId?: string }) => Promise<any>;
      updateNoteType: (params: {
        typeName: string;
        description?: string;
        instructions?: string[];
        metadataSchema?: MetadataFieldDefinition[];
        vaultId?: string;
      }) => Promise<any>;
      listNotesByType: (params: {
        type: string;
        vaultId?: string;
        limit?: number;
      }) => Promise<any>;

      // Vault operations
      listVaults: () => Promise<any>;
      getCurrentVault: () => Promise<any>;
      createVault: (params: {
        name: string;
        path: string;
        description?: string;
      }) => Promise<any>;
      switchVault: (params: { vaultId: string }) => Promise<any>;
      removeVault: (params: { vaultId: string }) => Promise<any>;

      // File system operations
      showDirectoryPicker: () => Promise<any>;

      // Link operations
      getNoteLinks: (params: { identifier: string; vaultId?: string }) => Promise<any>;
      getBacklinks: (params: { identifier: string; vaultId?: string }) => Promise<any>;
      findBrokenLinks: (params: { vaultId?: string }) => Promise<any>;

      // Service status
      noteServiceReady: () => Promise<any>;

      // Secure storage operations
      secureStorageAvailable: () => Promise<any>;
      storeApiKey: (params: {
        provider: 'anthropic' | 'openai' | 'openrouter';
        key: string;
        orgId?: string;
      }) => Promise<any>;
      getApiKey: (params: {
        provider: 'anthropic' | 'openai' | 'openrouter';
      }) => Promise<any>;
      testApiKey: (params: {
        provider: 'anthropic' | 'openai' | 'openrouter';
      }) => Promise<any>;
      getAllApiKeys: () => Promise<any>;
      clearApiKeys: () => Promise<any>;

      // Pinned notes storage operations
      loadPinnedNotes: (params: { vaultId: string }) => Promise<any>;
      savePinnedNotes: (params: { vaultId: string; notes: unknown[] }) => Promise<any>;
      clearPinnedNotes: (params: { vaultId: string }) => Promise<any>;

      // Cache monitoring operations
      getCacheMetrics: () => Promise<any>;
      getCachePerformanceSnapshot: () => Promise<any>;
      getCacheConfig: () => Promise<any>;
      setCacheConfig: (config: Partial<CacheConfig>) => Promise<any>;
      getCachePerformanceReport: () => Promise<any>;
      getCacheHealthCheck: () => Promise<any>;
      optimizeCacheConfig: () => Promise<any>;
      resetCacheMetrics: () => Promise<any>;
      startPerformanceMonitoring: (intervalMinutes?: number) => Promise<any>;
      stopPerformanceMonitoring: () => Promise<any>;
      warmupSystemCache: () => Promise<any>;

      // Usage tracking
      onUsageRecorded: (callback: (usageData: unknown) => void) => void;
      removeUsageListener: () => void;

      // Auto-updater operations
      checkForUpdates: () => Promise<{
        success: boolean;
        updateInfo?: any;
        error?: string;
      }>;
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      installUpdate: () => Promise<{ success: boolean; error?: string }>;
      getAppVersion: () => Promise<{ version: string; channel: string }>;
      getUpdateConfig: () => Promise<{
        autoDownload: boolean;
        autoInstallOnAppQuit: boolean;
        allowPrerelease: boolean;
        allowDowngrade: boolean;
        currentVersion?: string;
      }>;
      setUpdateConfig: (config: {
        autoDownload?: boolean;
        autoInstallOnAppQuit?: boolean;
        allowPrerelease?: boolean;
        allowDowngrade?: boolean;
      }) => Promise<{ success: boolean; error?: string }>;

      // Auto-updater event listeners
      onUpdateChecking: (callback: () => void) => void;
      onUpdateAvailable: (callback: (info: {
        version: string;
        releaseDate?: string;
        releaseName?: string;
        releaseNotes?: string;
      }) => void) => void;
      onUpdateNotAvailable: (callback: (info: { version: string }) => void) => void;
      onUpdateError: (callback: (error: { message: string; stack?: string }) => void) => void;
      onUpdateDownloadProgress: (callback: (progress: {
        bytesPerSecond: number;
        percent: number;
        transferred: number;
        total: number;
      }) => void) => void;
      onUpdateDownloaded: (callback: (info: {
        version: string;
        releaseDate?: string;
        releaseName?: string;
        releaseNotes?: string;
      }) => void) => void;
      removeAllUpdateListeners: () => void;

      // Global settings storage operations
      loadAppSettings: () => Promise<unknown>;
      saveAppSettings: (settings: unknown) => Promise<unknown>;
      loadModelPreference: () => Promise<string | null>;
      saveModelPreference: (modelId: string) => Promise<void>;
      loadSidebarState: () => Promise<boolean>;
      saveSidebarState: (collapsed: boolean) => Promise<void>;
      loadSlashCommands: () => Promise<unknown>;
      saveSlashCommands: (commands: unknown) => Promise<void>;

      // Vault-specific data storage operations
      loadConversations: (params: { vaultId: string }) => Promise<unknown>;
      saveConversations: (params: {
        vaultId: string;
        conversations: unknown;
      }) => Promise<void>;
      loadTemporaryTabs: (params: { vaultId: string }) => Promise<unknown>;
      saveTemporaryTabs: (params: { vaultId: string; tabs: unknown }) => Promise<void>;
      loadNavigationHistory: (params: { vaultId: string }) => Promise<unknown>;
      saveNavigationHistory: (params: {
        vaultId: string;
        history: unknown;
      }) => Promise<void>;
      loadActiveNote: (params: { vaultId: string }) => Promise<string | null>;
      saveActiveNote: (params: {
        vaultId: string;
        noteId: string | null;
      }) => Promise<void>;

      // Cursor position management
      loadCursorPositions: (params: {
        vaultId: string;
      }) => Promise<Record<string, CursorPosition>>;
      saveCursorPositions: (params: {
        vaultId: string;
        positions: Record<string, CursorPosition>;
      }) => Promise<void>;
      getCursorPosition: (params: {
        vaultId: string;
        noteId: string;
      }) => Promise<CursorPosition | null>;
      setCursorPosition: (params: {
        vaultId: string;
        noteId: string;
        position: CursorPosition;
      }) => Promise<void>;

      // Custom functions operations
      listCustomFunctions: (params?: {
        tags?: string[];
        searchQuery?: string;
      }) => Promise<CustomFunction[]>;
      createCustomFunction: (params: {
        name: string;
        description: string;
        parameters: Record<string, CustomFunctionParameter>;
        returnType: string;
        code: string;
        tags?: string[];
      }) => Promise<CustomFunction>;
      getCustomFunction: (params: {
        id?: string;
        name?: string;
      }) => Promise<CustomFunction | null>;
      updateCustomFunction: (params: {
        id: string;
        name?: string;
        description?: string;
        parameters?: Record<string, CustomFunctionParameter>;
        returnType?: string;
        code?: string;
        tags?: string[];
      }) => Promise<CustomFunction>;
      deleteCustomFunction: (params: { id: string }) => Promise<{ success: boolean }>;
      validateCustomFunction: (params: {
        name: string;
        description: string;
        parameters: Record<string, CustomFunctionParameter>;
        returnType: string;
        code: string;
        tags?: string[];
      }) => Promise<ValidationResult>;
      testCustomFunction: (params: {
        functionId: string;
        parameters: Record<string, unknown>;
      }) => Promise<CustomFunctionExecutionResult>;
      getCustomFunctionStats: (params?: { functionId?: string }) => Promise<{
        totalFunctions: number;
        totalUsage: number;
        averageUsage: number;
        mostUsedFunction?: string;
        functionStats?: {
          id: string;
          name: string;
          usageCount: number;
          lastUsed?: string;
        };
      }>;
      exportCustomFunctions: () => Promise<{ data: string; filename: string }>;
      importCustomFunctions: (params: {
        backupData: string;
      }) => Promise<{ imported: number; skipped: number; errors: string[] }>;
    };
  }
}
