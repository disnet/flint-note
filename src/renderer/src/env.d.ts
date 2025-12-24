/// <reference types="vite/client" />

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
      // Auto-updater operations
      checkForUpdates: () => Promise<{
        success: boolean;
        updateInfo?: unknown;
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
      getChangelog: (
        version: string,
        isCanary: boolean
      ) => Promise<{ success: boolean; changelog?: string; error?: string }>;

      // Auto-updater event listeners
      onUpdateChecking: (callback: () => void) => void;
      onUpdateAvailable: (
        callback: (info: {
          version: string;
          releaseDate?: string;
          releaseName?: string;
          releaseNotes?: string;
        }) => void
      ) => void;
      onUpdateNotAvailable: (callback: (info: { version: string }) => void) => void;
      onUpdateError: (
        callback: (error: { message: string; stack?: string }) => void
      ) => void;
      onUpdateDownloadProgress: (
        callback: (progress: {
          bytesPerSecond: number;
          percent: number;
          transferred: number;
          total: number;
        }) => void
      ) => void;
      onUpdateDownloaded: (
        callback: (info: {
          version: string;
          releaseDate?: string;
          releaseName?: string;
          releaseNotes?: string;
        }) => void
      ) => void;
      removeAllUpdateListeners: () => void;

      // Chat operations
      sendMessage: (params: {
        message: string;
        conversationId?: string;
        model?: string;
      }) => Promise<ChatResponse>;
      sendMessageStream: (
        params: {
          message: string;
          conversationId?: string;
          model?: string;
          requestId: string;
        },
        onStreamStart: (data: { requestId: string }) => void,
        onStreamChunk: (data: { requestId: string; chunk: string }) => void,
        onStreamEnd: (data: {
          requestId: string;
          fullText: string;
          stoppedAtLimit?: boolean;
          stepCount?: number;
          maxSteps?: number;
          canContinue?: boolean;
        }) => void,
        onStreamError: (data: { requestId: string; error: string }) => void,
        onStreamToolCall?: (data: { requestId: string; toolCall: ToolCallData }) => void,
        onStreamToolResult?: (data: {
          requestId: string;
          toolCall: ToolCallData;
        }) => void,
        onStreamStoppedAtLimit?: (data: {
          requestId: string;
          stepCount: number;
          maxSteps: number;
          canContinue: boolean;
        }) => void
      ) => void;
      clearConversation: () => Promise<unknown>;
      cancelMessageStream: (params: { requestId: string }) => Promise<unknown>;
      switchAiProvider: (params: {
        provider: 'openrouter' | 'anthropic';
        modelName: string;
      }) => Promise<{ success: boolean; error?: string }>;
      syncConversation: (params: {
        conversationId: string;
        messages: FrontendMessage[];
      }) => Promise<unknown>;
      setActiveConversation: (params: {
        conversationId: string;
        messages?: FrontendMessage[] | string;
      }) => Promise<unknown>;

      // File system operations
      showDirectoryPicker: () => Promise<string | null>;
      showItemInFolder: (params: { path: string }) => Promise<{
        success: boolean;
        error?: string;
      }>;

      // Secure storage operations
      secureStorageAvailable: () => Promise<boolean>;
      storeApiKey: (params: {
        provider: 'anthropic' | 'openrouter';
        key: string;
        orgId?: string;
      }) => Promise<unknown>;
      getApiKey: (params: {
        provider: 'anthropic' | 'openrouter';
      }) => Promise<{ key: string; orgId?: string }>;
      testApiKey: (params: { provider: 'anthropic' | 'openrouter' }) => Promise<boolean>;
      getAllApiKeys: () => Promise<{ openrouter: string; anthropic: string }>;
      clearApiKeys: () => Promise<unknown>;
      getOpenRouterCredits: () => Promise<{
        total_credits: number;
        used_credits: number;
        remaining_credits: number;
      } | null>;

      // Chat server operations
      getChatServerPort: () => Promise<number>;

      // Cache monitoring operations
      getCacheMetrics: () => Promise<unknown>;
      getCachePerformanceSnapshot: () => Promise<unknown>;
      getCacheConfig: () => Promise<unknown>;
      setCacheConfig: (config: Partial<CacheConfig>) => Promise<unknown>;
      getCachePerformanceReport: () => Promise<unknown>;
      getCacheHealthCheck: () => Promise<unknown>;
      optimizeCacheConfig: () => Promise<unknown>;
      resetCacheMetrics: () => Promise<unknown>;
      startPerformanceMonitoring: (intervalMinutes?: number) => Promise<unknown>;
      stopPerformanceMonitoring: () => Promise<unknown>;
      warmupSystemCache: () => Promise<unknown>;

      // Context usage monitoring
      getContextUsage: (params?: { conversationId?: string }) => Promise<ContextUsage>;
      canAcceptMessage: (params: {
        estimatedTokens: number;
        conversationId?: string;
      }) => Promise<{ canAccept: boolean; reason?: string }>;

      // Global settings storage operations
      loadAppSettings: () => Promise<unknown>;
      saveAppSettings: (settings: unknown) => Promise<unknown>;
      loadModelPreference: () => Promise<string | null>;
      saveModelPreference: (modelId: string) => Promise<void>;
      loadSidebarState: () => Promise<boolean>;
      saveSidebarState: (collapsed: boolean) => Promise<void>;

      // Cursor position management
      getCursorPosition: (params: {
        vaultId: string;
        noteId: string;
      }) => Promise<CursorPosition | null>;
      setCursorPosition: (params: {
        vaultId: string;
        noteId: string;
        position: CursorPosition;
      }) => Promise<void>;

      // Usage tracking
      onUsageRecorded: (callback: (usageData: unknown) => void) => void;
      removeUsageListener: () => void;

      // Vault operations
      clearVaultUIState: (params: { vaultId: string }) => Promise<void>;

      // Webpage archiving (returns HTML content for OPFS storage)
      archiveWebpage: (params: { url: string }) => Promise<{
        html: string;
        metadata: {
          url: string;
          title: string;
          siteName?: string;
          author?: string;
          excerpt?: string;
          fetchedAt: string;
          lang?: string;
          dir?: string;
        };
      }>;

      // Shell operations
      openExternal: (params: { url: string }) => Promise<void>;

      // Menu event listeners
      onMenuNavigate: (callback: (view: string) => void) => () => void;
      onMenuAction: (
        callback: (action: string, ...args: unknown[]) => void
      ) => () => void;

      // Update menu state
      setMenuActiveNote: (isActive: boolean) => void;
      setMenuActiveEpub: (isActive: boolean) => void;
      setMenuActivePdf: (isActive: boolean) => void;
      setMenuWorkspaces: (data: {
        workspaces: Array<{ id: string; name: string; icon: string }>;
        activeWorkspaceId: string;
      }) => void;

      // Trigger menu actions
      triggerMenuNavigate: (view: string) => void;
      triggerMenuAction: (action: string, ...args: unknown[]) => void;

      // Automerge sync operations
      automergeSync: {
        sendRepoMessage: (message: unknown) => Promise<void>;
        onRepoMessage: (callback: (message: unknown) => void) => void;
        removeRepoMessageListener: () => void;
        initVaultSync: (params: {
          vaultId: string;
          baseDirectory: string;
          docUrl: string;
        }) => Promise<{ success: boolean }>;
        disposeVaultSync: (params: { vaultId: string }) => Promise<void>;
        selectSyncDirectory: () => Promise<string | null>;
      };

      // Legacy vault migration operations
      legacyMigration: {
        detectLegacyVaults: (params: {
          existingVaults: Array<{ baseDirectory?: string }>;
        }) => Promise<
          Array<{
            path: string;
            name: string;
            noteCount: number;
            epubCount: number;
            lastModified: string;
            hasExistingMigration: boolean;
            syncDirectoryName: string;
          }>
        >;
        detectLegacyVaultAtPath: (params: {
          vaultPath: string;
          existingVaults: Array<{ baseDirectory?: string }>;
        }) => Promise<{
          path: string;
          name: string;
          noteCount: number;
          epubCount: number;
          lastModified: string;
          hasExistingMigration: boolean;
          syncDirectoryName: string;
        } | null>;
        getMigrationDocumentData: (params: { vaultPath: string }) => Promise<{
          document: unknown;
          epubFiles: Array<{
            noteId: string;
            fileData: Uint8Array;
            filePath: string;
            metadata: { title?: string; author?: string };
            readingState?: { currentCfi?: string; progress?: number };
          }>;
          pdfFiles: Array<{
            noteId: string;
            fileData: Uint8Array;
            filePath: string;
            metadata: { title?: string; author?: string };
            readingState?: { currentPage?: number; progress?: number };
          }>;
          webpageFiles: Array<{
            noteId: string;
            htmlContent: string;
            filePath: string;
            metadata: {
              title?: string;
              url?: string;
              siteName?: string;
              author?: string;
            };
          }>;
          errors: Array<{
            entity: string;
            entityId: string;
            message: string;
          }>;
        } | null>;
        onMigrationProgress: (
          callback: (progress: {
            phase: string;
            message: string;
            current: number;
            total: number;
            details?: {
              noteTypes?: number;
              notes?: number;
              workspaces?: number;
              reviewItems?: number;
              epubs?: number;
            };
          }) => void
        ) => void;
        removeMigrationListeners: () => void;
        browseForVault: () => Promise<string | null>;
      };
    };
  }
}
