/// <reference types="vite/client" />

import type { ChatResponse } from './services/types';

// Legacy type stubs - these types were from the server but are no longer used in Automerge version
type MetadataFieldDefinition = unknown;
type MetadataSchema = unknown;
type NoteMetadata = unknown;
type Note = unknown;
type UpdateResult = unknown;
type CustomFunction = unknown;
type CustomFunctionParameter = unknown;
type ValidationResult = unknown;
type CustomFunctionExecutionResult = unknown;

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

interface TodoItem {
  id: string;
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created: Date;
  updated: Date;
  result?: unknown;
  error?: string;
}

interface TodoPlan {
  id: string;
  conversationId: string;
  goal: string;
  items: TodoItem[];
  status: 'active' | 'completed' | 'abandoned';
  created: Date;
  updated: Date;
}

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

      // Legacy note operations - these will throw errors at runtime
      createNote: (params: unknown) => Promise<unknown>;
      getNote: (params: unknown) => Promise<unknown>;
      updateNote: (params: unknown) => Promise<unknown>;
      deleteNote: (params: unknown) => Promise<unknown>;
      renameNote: (params: unknown) => Promise<unknown>;
      moveNote: (params: unknown) => Promise<unknown>;
      archiveNote: (params: unknown) => Promise<unknown>;
      unarchiveNote: (params: unknown) => Promise<unknown>;

      // Note suggestion operations (legacy)
      getNoteSuggestions: (params: unknown) => Promise<unknown>;
      generateNoteSuggestions: (params: unknown) => Promise<unknown>;
      dismissNoteSuggestion: (params: unknown) => Promise<unknown>;
      clearNoteSuggestions: (params: unknown) => Promise<unknown>;
      updateNoteSuggestionConfig: (params: unknown) => Promise<unknown>;
      updateNoteTypeDefaultReviewMode: (params: unknown) => Promise<unknown>;

      // Review operations (legacy - will throw errors)
      enableReview: (noteId: string) => Promise<{ success: boolean }>;
      disableReview: (noteId: string) => Promise<{ success: boolean }>;
      isReviewEnabled: (noteId: string) => Promise<{ enabled: boolean }>;
      getReviewStats: () => Promise<unknown>;
      getNotesForReview: () => Promise<unknown>;
      generateReviewPrompt: (noteId: string) => Promise<{
        success: boolean;
        prompt?: string;
        error?: string;
      }>;
      analyzeReviewResponse: (params: unknown) => Promise<unknown>;
      completeReview: (params: unknown) => Promise<unknown>;
      getReviewItem: (noteId: string) => Promise<unknown>;
      getAllReviewHistory: () => Promise<unknown>;
      getCurrentSession: () => Promise<{ sessionNumber: number }>;
      incrementSession: () => Promise<{ sessionNumber: number }>;
      isNewSessionAvailable: () => Promise<{ available: boolean }>;
      getNextSessionAvailableAt: () => Promise<{ nextAvailableAt: string | null }>;
      getReviewConfig: () => Promise<unknown>;
      updateReviewConfig: (params: unknown) => Promise<unknown>;
      reactivateNote: (noteId: string) => Promise<{ success: boolean }>;
      getRetiredItems: () => Promise<unknown>;

      // Search operations (legacy)
      searchNotes: (params: unknown) => Promise<unknown>;
      searchNotesAdvanced: (params: unknown) => Promise<unknown>;
      queryNotesForDataview: (params: unknown) => Promise<unknown>;

      // Note type operations (legacy)
      listNoteTypes: () => Promise<unknown>;
      createNoteType: (params: unknown) => Promise<unknown>;
      getNoteTypeInfo: (params: unknown) => Promise<unknown>;
      updateNoteType: (params: unknown) => Promise<unknown>;
      deleteNoteType: (params: unknown) => Promise<unknown>;
      listNotesByType: (params: unknown) => Promise<unknown>;

      // Vault operations (legacy)
      listVaults: () => Promise<unknown>;
      getCurrentVault: () => Promise<unknown>;
      createVault: (params: unknown) => Promise<unknown>;
      switchVault: (params: { vaultId: string }) => Promise<unknown>;
      removeVault: (params: { vaultId: string }) => Promise<unknown>;
      listTemplates: () => Promise<unknown>;
      reinitializeNoteService: () => Promise<unknown>;

      // File system operations
      showDirectoryPicker: () => Promise<unknown>;
      showItemInFolder: (params: { path: string }) => Promise<{
        success: boolean;
        error?: string;
      }>;

      // Link operations (legacy)
      getNoteLinks: (params: unknown) => Promise<unknown>;
      getBacklinks: (params: unknown) => Promise<unknown>;
      findBrokenLinks: (params: unknown) => Promise<unknown>;

      // Service status
      noteServiceReady: () => Promise<boolean>;

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

      // Pinned notes storage operations
      loadPinnedNotes: (params: { vaultId: string }) => Promise<unknown>;
      savePinnedNotes: (params: {
        vaultId: string;
        notes: unknown[];
      }) => Promise<unknown>;
      clearPinnedNotes: (params: { vaultId: string }) => Promise<unknown>;

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

      // Usage tracking
      onUsageRecorded: (callback: (usageData: unknown) => void) => void;
      removeUsageListener: () => void;

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

      // UI State management
      loadUIState: (params: {
        vaultId: string;
        stateKey: string;
      }) => Promise<unknown | null>;
      saveUIState: (params: {
        vaultId: string;
        stateKey: string;
        stateValue: unknown;
      }) => Promise<{ success: boolean }>;
      clearUIState: (params: { vaultId: string }) => Promise<{ success: boolean }>;

      // Custom functions operations (legacy)
      listCustomFunctions: (params?: unknown) => Promise<CustomFunction[]>;
      createCustomFunction: (params: unknown) => Promise<CustomFunction>;
      getCustomFunction: (params: unknown) => Promise<CustomFunction | null>;
      updateCustomFunction: (params: unknown) => Promise<CustomFunction>;
      deleteCustomFunction: (params: { id: string }) => Promise<{ success: boolean }>;
      validateCustomFunction: (params: unknown) => Promise<ValidationResult>;
      testCustomFunction: (params: unknown) => Promise<CustomFunctionExecutionResult>;
      getCustomFunctionStats: (params?: unknown) => Promise<unknown>;
      exportCustomFunctions: () => Promise<{ data: string; filename: string }>;
      importCustomFunctions: (params: {
        backupData: string;
      }) => Promise<{ imported: number; skipped: number; errors: string[] }>;
      getChangelog: (
        version: string,
        isCanary: boolean
      ) => Promise<{ success: boolean; changelog?: string; error?: string }>;

      // Todo plan operations
      todoPlan: {
        getActive: (params: { conversationId: string }) => Promise<TodoPlan | null>;
      };

      // Workflow operations (legacy)
      workflow: {
        create: (input: unknown) => Promise<unknown>;
        update: (input: unknown) => Promise<unknown>;
        delete: (workflowId: string) => Promise<void>;
        list: (input?: unknown) => Promise<unknown>;
        get: (input: unknown) => Promise<unknown>;
        complete: (input: unknown) => Promise<unknown>;
        addMaterial: (workflowId: string, material: unknown) => Promise<string>;
        removeMaterial: (materialId: string) => Promise<void>;
      };

      // Daily View operations (legacy)
      getOrCreateDailyNote: (params: unknown) => Promise<Note | null>;
      getWeekData: (params: unknown) => Promise<unknown>;
      getNotesByDate: (params: unknown) => Promise<unknown>;
      updateDailyNote: (params: unknown) => Promise<UpdateResult>;

      // Inbox operations (legacy)
      getRecentUnprocessedNotes: (params: unknown) => Promise<unknown>;
      getRecentProcessedNotes: (params: unknown) => Promise<unknown>;
      markNoteAsProcessed: (params: unknown) => Promise<{ success: boolean }>;
      unmarkNoteAsProcessed: (params: unknown) => Promise<{ success: boolean }>;

      // Database operations (legacy)
      rebuildDatabase: (
        params: unknown
      ) => Promise<{ success: boolean; noteCount: number }>;

      // Migration operations
      getMigrationMapping: () => Promise<Record<string, string> | null>;
      clearVaultUIState: (params: { vaultId: string }) => Promise<void>;

      // EPUB operations
      importEpub: () => Promise<{ filename: string; path: string } | null>;
      readEpubFile: (params: { relativePath: string }) => Promise<Uint8Array>;

      // PDF operations
      importPdf: () => Promise<{ filename: string; path: string; title?: string } | null>;
      readPdfFile: (params: { relativePath: string }) => Promise<Uint8Array>;

      // Combined file import
      importFile: () => Promise<Array<{
        type: 'pdf' | 'epub';
        filename: string;
        path: string;
        title?: string;
      }> | null>;
      importFileFromData: (params: {
        fileData: Uint8Array;
        filename: string;
      }) => Promise<{
        type: 'pdf' | 'epub';
        filename: string;
        path: string;
        title?: string;
      }>;

      // Webpage operations
      importWebpage: (params: { url: string }) => Promise<{
        slug: string;
        path: string;
        originalPath: string;
        title: string;
        siteName?: string;
        author?: string;
        excerpt?: string;
      } | null>;
      readWebpageFile: (params: { relativePath: string }) => Promise<string>;
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

      // Image operations
      importImage: (params: {
        fileData: Uint8Array;
        filename: string;
      }) => Promise<{ filename: string; path: string } | null>;
      readImageFile: (params: { relativePath: string }) => Promise<Uint8Array>;
      getImageAbsolutePath: (params: { relativePath: string }) => Promise<string>;

      // Event listeners
      onNoteEvent: (callback: (event: unknown) => void) => () => void;
      onWorkflowEvent: (callback: (event: unknown) => void) => () => void;
      onReviewEvent: (callback: (event: unknown) => void) => () => void;

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
