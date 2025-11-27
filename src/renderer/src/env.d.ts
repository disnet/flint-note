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
      clearConversation: () => Promise<any>;
      cancelMessageStream: (params: { requestId: string }) => Promise<any>;
      switchAiProvider: (params: {
        provider: 'openrouter' | 'anthropic';
        modelName: string;
      }) => Promise<{ success: boolean; error?: string }>;
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
        kind?: 'markdown' | 'epub' | string;
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
        silent?: boolean;
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
      archiveNote: (params: {
        identifier: string;
        vaultId?: string;
      }) => Promise<{ id: string; archived: boolean; timestamp: string }>;
      unarchiveNote: (params: {
        identifier: string;
        vaultId?: string;
      }) => Promise<{ id: string; archived: boolean; timestamp: string }>;

      // Note suggestion operations
      getNoteSuggestions: (params: { noteId: string; vaultId?: string }) => Promise<any>;
      generateNoteSuggestions: (params: {
        noteId: string;
        vaultId?: string;
      }) => Promise<any>;
      dismissNoteSuggestion: (params: {
        noteId: string;
        suggestionId: string;
        vaultId?: string;
      }) => Promise<any>;
      clearNoteSuggestions: (params: {
        noteId: string;
        vaultId?: string;
      }) => Promise<any>;
      updateNoteSuggestionConfig: (params: {
        noteType: string;
        config: {
          enabled: boolean;
          prompt_guidance: string;
          suggestion_types?: string[];
        };
        vaultId?: string;
      }) => Promise<any>;
      updateNoteTypeDefaultReviewMode: (params: {
        noteType: string;
        defaultReviewMode: boolean;
        vaultId?: string;
      }) => Promise<any>;

      // Note lifecycle tracking (for file watcher)
      // Phase 3: Removed noteOpened, noteClosed, and expectNoteWrite

      // Review operations (spaced repetition)
      enableReview: (noteId: string) => Promise<{ success: boolean }>;
      disableReview: (noteId: string) => Promise<{ success: boolean }>;
      isReviewEnabled: (noteId: string) => Promise<{ enabled: boolean }>;
      getReviewStats: () => Promise<{
        dueThisSession: number;
        totalEnabled: number;
        retired: number;
        currentSessionNumber: number;
      }>;
      getNotesForReview: () => Promise<
        Array<{
          id: string;
          title: string;
          content: string | null;
          reviewItem: {
            reviewCount: number;
            nextSessionNumber: number;
            currentInterval: number;
          };
        }>
      >;
      generateReviewPrompt: (noteId: string) => Promise<{
        success: boolean;
        prompt?: string;
        error?: string;
      }>;
      analyzeReviewResponse: (params: {
        noteId: string;
        prompt: string;
        userResponse: string;
      }) => Promise<{
        success: boolean;
        feedback?: {
          feedback: string;
          suggestedLinks?: string[];
        };
        error?: string;
      }>;
      completeReview: (params: {
        noteId: string;
        rating: 1 | 2 | 3 | 4;
        userResponse?: string;
        prompt?: string;
        feedback?: string;
      }) => Promise<{
        nextSessionNumber: number;
        nextReviewDate: string;
        reviewCount: number;
        retired: boolean;
      }>;
      getReviewItem: (
        noteId: string
      ) => Promise<import('./types/review').ReviewItem | null>;
      getAllReviewHistory: () => Promise<import('./types/review').ReviewItem[]>;
      getCurrentSession: () => Promise<{ sessionNumber: number }>;
      incrementSession: () => Promise<{ sessionNumber: number }>;
      isNewSessionAvailable: () => Promise<{ available: boolean }>;
      getNextSessionAvailableAt: () => Promise<{ nextAvailableAt: string | null }>;
      getReviewConfig: () => Promise<{
        sessionSize: number;
        sessionsPerWeek: number;
        maxIntervalSessions: number;
        minIntervalDays: number;
      }>;
      updateReviewConfig: (params: {
        sessionSize?: number;
        sessionsPerWeek?: number;
        maxIntervalSessions?: number;
        minIntervalDays?: number;
      }) => Promise<{
        sessionSize: number;
        sessionsPerWeek: number;
        maxIntervalSessions: number;
        minIntervalDays: number;
      }>;
      reactivateNote: (noteId: string) => Promise<{ success: boolean }>;
      getRetiredItems: () => Promise<import('./types/review').ReviewItem[]>;
      // FileWriteQueue now handles all internal write tracking

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
      deleteNoteType: (params: {
        typeName: string;
        action: 'error' | 'migrate' | 'delete';
        targetType?: string;
        vaultId?: string;
      }) => Promise<any>;
      listNotesByType: (params: {
        type: string;
        vaultId?: string;
        limit?: number;
        includeArchived?: boolean;
      }) => Promise<any>;

      // Vault operations
      listVaults: () => Promise<any>;
      getCurrentVault: () => Promise<any>;
      createVault: (params: {
        name: string;
        path: string;
        description?: string;
        templateId?: string;
      }) => Promise<any>;
      switchVault: (params: { vaultId: string }) => Promise<any>;
      removeVault: (params: { vaultId: string }) => Promise<any>;
      listTemplates: () => Promise<
        Array<{ id: string; name: string; description: string; icon?: string }>
      >;
      reinitializeNoteService: () => Promise<{
        success: boolean;
        status?: {
          isInitialized: boolean;
          hasVaults: boolean;
          canPerformNoteOperations: boolean;
        };
        error?: string;
      }>;

      // File system operations
      showDirectoryPicker: () => Promise<any>;
      showItemInFolder: (params: { path: string }) => Promise<{
        success: boolean;
        error?: string;
      }>;

      // Link operations
      getNoteLinks: (params: { identifier: string; vaultId?: string }) => Promise<any>;
      getBacklinks: (params: { identifier: string; vaultId?: string }) => Promise<any>;
      findBrokenLinks: (params: { vaultId?: string }) => Promise<any>;

      // Service status
      noteServiceReady: () => Promise<any>;

      // Secure storage operations
      secureStorageAvailable: () => Promise<any>;
      storeApiKey: (params: {
        provider: 'anthropic' | 'openrouter';
        key: string;
        orgId?: string;
      }) => Promise<any>;
      getApiKey: (params: { provider: 'anthropic' | 'openrouter' }) => Promise<any>;
      testApiKey: (params: { provider: 'anthropic' | 'openrouter' }) => Promise<any>;
      getAllApiKeys: () => Promise<any>;
      clearApiKeys: () => Promise<any>;
      getOpenRouterCredits: () => Promise<{
        total_credits: number;
        used_credits: number;
        remaining_credits: number;
      } | null>;

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

      // Context usage monitoring operations
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
      getChangelog: (
        version: string,
        isCanaray: boolean
      ) => Promise<{ success: boolean; changelog?: string; error?: string }>;

      // Todo plan operations
      todoPlan: {
        getActive: (params: { conversationId: string }) => Promise<TodoPlan | null>;
      };

      // Workflow operations
      workflow: {
        create: (input: unknown) => Promise<any>;
        update: (input: unknown) => Promise<any>;
        delete: (workflowId: string) => Promise<void>;
        list: (input?: unknown) => Promise<any>;
        get: (input: unknown) => Promise<any>;
        complete: (input: unknown) => Promise<any>;
        addMaterial: (workflowId: string, material: unknown) => Promise<string>;
        removeMaterial: (materialId: string) => Promise<void>;
      };

      // Daily View operations
      getOrCreateDailyNote: (params: {
        date: string;
        vaultId: string;
      }) => Promise<Note | null>;
      getWeekData: (params: { startDate: string; vaultId: string }) => Promise<{
        startDate: string;
        endDate: string;
        days: Array<{
          date: string;
          dailyNote: Note | null;
          createdNotes: Array<{ id: string; title: string; type: string }>;
          modifiedNotes: Array<{ id: string; title: string; type: string }>;
          totalActivity: number;
        }>;
      }>;
      getNotesByDate: (params: { date: string; vaultId: string }) => Promise<{
        created: Array<{ id: string; title: string; type: string; created: string }>;
        modified: Array<{ id: string; title: string; type: string; updated: string }>;
      }>;
      updateDailyNote: (params: {
        date: string;
        content: string;
        vaultId: string;
      }) => Promise<UpdateResult>;

      // Inbox operations
      getRecentUnprocessedNotes: (params: {
        vaultId: string;
        daysBack?: number;
      }) => Promise<Array<{ id: string; title: string; type: string; created: string }>>;
      getRecentProcessedNotes: (params: {
        vaultId: string;
        daysBack?: number;
      }) => Promise<Array<{ id: string; title: string; type: string; created: string }>>;
      markNoteAsProcessed: (params: {
        noteId: string;
        vaultId: string;
      }) => Promise<{ success: boolean }>;
      unmarkNoteAsProcessed: (params: {
        noteId: string;
        vaultId: string;
      }) => Promise<{ success: boolean }>;

      // Database operations
      rebuildDatabase: (params: {
        vaultId?: string;
      }) => Promise<{ success: boolean; noteCount: number }>;

      // Migration operations
      getMigrationMapping: () => Promise<Record<string, string> | null>;
      clearVaultUIState: (params: { vaultId: string }) => Promise<void>;

      // EPUB operations
      importEpub: () => Promise<{ filename: string; path: string } | null>;
      readEpubFile: (params: { relativePath: string }) => Promise<Uint8Array>;

      // Event listener for note events from main process
      onNoteEvent: (callback: (event: unknown) => void) => () => void;

      // Event listener for workflow events from main process
      onWorkflowEvent: (callback: (event: unknown) => void) => () => void;

      // Event listener for review events from main process
      onReviewEvent: (callback: (event: unknown) => void) => () => void;

      // Menu event listeners
      onMenuNavigate: (callback: (view: string) => void) => () => void;
      onMenuAction: (
        callback: (action: string, ...args: unknown[]) => void
      ) => () => void;

      // Update menu state
      setMenuActiveNote: (isActive: boolean) => void;
      setMenuActiveEpub: (isActive: boolean) => void;
      setMenuWorkspaces: (data: {
        workspaces: Array<{ id: string; name: string; icon: string }>;
        activeWorkspaceId: string;
      }) => void;

      // Trigger menu actions from custom title bar menu (Windows/Linux)
      triggerMenuNavigate: (view: string) => void;
      triggerMenuAction: (action: string, ...args: unknown[]) => void;
    };
  }
}
