import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { MetadataFieldDefinition, MetadataSchema } from '../server/core/metadata-schema';
import type { CursorPosition } from '../main/vault-data-storage-service';

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

import type { NoteMetadata } from '../server/types';

export type ToolCallData = {
  toolCallId: string;
  name: string;
  arguments: unknown;
  result: string | undefined;
  error: string | undefined;
};

// Custom APIs for renderer
const api = {
  // Auto-updater operations
  checkForUpdates: () => electronAPI.ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => electronAPI.ipcRenderer.invoke('download-update'),
  installUpdate: () => electronAPI.ipcRenderer.invoke('install-update'),
  getAppVersion: () => electronAPI.ipcRenderer.invoke('get-app-version'),
  getUpdateConfig: () => electronAPI.ipcRenderer.invoke('get-update-config'),
  setUpdateConfig: (config: {
    autoDownload?: boolean;
    autoInstallOnAppQuit?: boolean;
    allowPrerelease?: boolean;
    allowDowngrade?: boolean;
  }) => electronAPI.ipcRenderer.invoke('set-update-config', config),
  getChangelog: (version: string, isCanary: boolean) =>
    electronAPI.ipcRenderer.invoke('get-changelog', version, isCanary),

  // Auto-updater event listeners
  onUpdateChecking: (callback: () => void) =>
    electronAPI.ipcRenderer.on('update-checking', callback),
  onUpdateAvailable: (
    callback: (info: {
      version: string;
      releaseDate?: string;
      releaseName?: string;
      releaseNotes?: string;
    }) => void
  ) => electronAPI.ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) =>
    electronAPI.ipcRenderer.on('update-not-available', (_event, info) => callback(info)),
  onUpdateError: (callback: (error: { message: string; stack?: string }) => void) =>
    electronAPI.ipcRenderer.on('update-error', (_event, error) => callback(error)),
  onUpdateDownloadProgress: (
    callback: (progress: {
      bytesPerSecond: number;
      percent: number;
      transferred: number;
      total: number;
    }) => void
  ) =>
    electronAPI.ipcRenderer.on('update-download-progress', (_event, progress) =>
      callback(progress)
    ),
  onUpdateDownloaded: (
    callback: (info: {
      version: string;
      releaseDate?: string;
      releaseName?: string;
      releaseNotes?: string;
    }) => void
  ) => electronAPI.ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),

  // Clean up event listeners
  removeAllUpdateListeners: () => {
    electronAPI.ipcRenderer.removeAllListeners('update-checking');
    electronAPI.ipcRenderer.removeAllListeners('update-available');
    electronAPI.ipcRenderer.removeAllListeners('update-not-available');
    electronAPI.ipcRenderer.removeAllListeners('update-error');
    electronAPI.ipcRenderer.removeAllListeners('update-download-progress');
    electronAPI.ipcRenderer.removeAllListeners('update-downloaded');
  },
  // Chat operations
  sendMessage: (params: { message: string; conversationId?: string; model?: string }) =>
    electronAPI.ipcRenderer.invoke('send-message', params),
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
    onStreamToolResult?: (data: { requestId: string; toolCall: ToolCallData }) => void,
    onStreamStoppedAtLimit?: (data: {
      requestId: string;
      stepCount: number;
      maxSteps: number;
      canContinue: boolean;
    }) => void
  ) => {
    // Set up event listeners
    electronAPI.ipcRenderer.on('ai-stream-start', (_event, data) => onStreamStart(data));
    electronAPI.ipcRenderer.on('ai-stream-chunk', (_event, data) => onStreamChunk(data));
    if (onStreamToolCall) {
      electronAPI.ipcRenderer.on('ai-stream-tool-call', (_event, data) =>
        onStreamToolCall(data)
      );
    }
    if (onStreamToolResult) {
      electronAPI.ipcRenderer.on('ai-stream-tool-result', (_event, data) =>
        onStreamToolResult(data)
      );
    }
    electronAPI.ipcRenderer.on('ai-stream-end', (_event, data) => {
      // Check if the stream ended due to hitting the tool call limit
      if (onStreamStoppedAtLimit && data.stoppedAtLimit) {
        onStreamStoppedAtLimit({
          requestId: data.requestId,
          stepCount: data.stepCount!,
          maxSteps: data.maxSteps!,
          canContinue: data.canContinue!
        });
      }
      onStreamEnd(data);
      // Clean up listeners
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-start');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-chunk');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-tool-call');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-tool-result');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-end');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-error');
    });
    electronAPI.ipcRenderer.on('ai-stream-error', (_event, data) => {
      onStreamError(data);
      // Clean up listeners
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-start');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-chunk');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-tool-call');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-tool-result');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-end');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-error');
    });

    // Send the streaming request
    electronAPI.ipcRenderer.send('send-message-stream', params);
  },
  clearConversation: () => electronAPI.ipcRenderer.invoke('clear-conversation'),
  cancelMessageStream: (params: { requestId: string }) =>
    electronAPI.ipcRenderer.invoke('cancel-message-stream', params),
  switchAiProvider: (params: {
    provider: 'openrouter' | 'anthropic';
    modelName: string;
  }) => electronAPI.ipcRenderer.invoke('switch-ai-provider', params),
  syncConversation: (params: { conversationId: string; messages: FrontendMessage[] }) =>
    electronAPI.ipcRenderer.invoke('sync-conversation', params),
  setActiveConversation: (params: {
    conversationId: string;
    messages?: FrontendMessage[] | string;
  }) => electronAPI.ipcRenderer.invoke('set-active-conversation', params),

  // Note operations
  createNote: (params: {
    type: string;
    kind?: 'markdown' | 'epub' | string;
    identifier: string;
    content: string;
    vaultId?: string;
    metadata?: NoteMetadata;
  }) => electronAPI.ipcRenderer.invoke('create-note', params),
  getNote: (params: { identifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('get-note', params),
  updateNote: (params: {
    identifier: string;
    content: string;
    vaultId?: string;
    metadata?: NoteMetadata;
    silent?: boolean;
  }) => electronAPI.ipcRenderer.invoke('update-note', params),
  deleteNote: (params: { identifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('delete-note', params),
  renameNote: (params: { identifier: string; newIdentifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('rename-note', params),
  moveNote: (params: { identifier: string; newType: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('move-note', params),
  archiveNote: (params: { identifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('archive-note', params),
  unarchiveNote: (params: { identifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('unarchive-note', params),

  // Note suggestions operations
  getNoteSuggestions: (params: { noteId: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('note:getSuggestions', params),
  generateNoteSuggestions: (params: { noteId: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('note:generateSuggestions', params),
  dismissNoteSuggestion: (params: {
    noteId: string;
    suggestionId: string;
    vaultId?: string;
  }) => electronAPI.ipcRenderer.invoke('note:dismissSuggestion', params),
  clearNoteSuggestions: (params: { noteId: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('note:clearSuggestions', params),
  updateNoteSuggestionConfig: (params: {
    noteType: string;
    config: {
      enabled: boolean;
      prompt_guidance: string;
      suggestion_types?: string[];
    };
    vaultId?: string;
  }) => electronAPI.ipcRenderer.invoke('note:updateSuggestionConfig', params),
  updateNoteTypeDefaultReviewMode: (params: {
    noteType: string;
    defaultReviewMode: boolean;
    vaultId?: string;
  }) => electronAPI.ipcRenderer.invoke('note:updateDefaultReviewMode', params),

  // Note lifecycle tracking (for file watcher)
  // Phase 3: Removed noteOpened, noteClosed, and expectNoteWrite
  // FileWriteQueue now handles all internal write tracking

  // Review operations (spaced repetition)
  enableReview: (noteId: string) =>
    electronAPI.ipcRenderer.invoke('enable-review', noteId),
  disableReview: (noteId: string) =>
    electronAPI.ipcRenderer.invoke('disable-review', noteId),
  isReviewEnabled: (noteId: string) =>
    electronAPI.ipcRenderer.invoke('is-review-enabled', noteId),
  getReviewStats: () => electronAPI.ipcRenderer.invoke('get-review-stats'),
  getNotesForReview: () => electronAPI.ipcRenderer.invoke('get-notes-for-review'),
  generateReviewPrompt: (noteId: string) =>
    electronAPI.ipcRenderer.invoke('generate-review-prompt', noteId),
  analyzeReviewResponse: (params: {
    noteId: string;
    prompt: string;
    userResponse: string;
  }) => electronAPI.ipcRenderer.invoke('analyze-review-response', params),
  completeReview: (params: {
    noteId: string;
    rating: 1 | 2 | 3 | 4;
    userResponse?: string;
    prompt?: string;
    feedback?: string;
  }) => electronAPI.ipcRenderer.invoke('complete-review', params),
  getReviewItem: (noteId: string) =>
    electronAPI.ipcRenderer.invoke('get-review-item', noteId),
  getAllReviewHistory: () => electronAPI.ipcRenderer.invoke('get-all-review-history'),
  getCurrentSession: () => electronAPI.ipcRenderer.invoke('get-current-session'),
  incrementSession: () => electronAPI.ipcRenderer.invoke('increment-session'),
  isNewSessionAvailable: () => electronAPI.ipcRenderer.invoke('is-new-session-available'),
  getNextSessionAvailableAt: () =>
    electronAPI.ipcRenderer.invoke('get-next-session-available-at'),
  getReviewConfig: () => electronAPI.ipcRenderer.invoke('get-review-config'),
  updateReviewConfig: (params: {
    sessionSize?: number;
    sessionsPerWeek?: number;
    maxIntervalSessions?: number;
    minIntervalDays?: number;
  }) => electronAPI.ipcRenderer.invoke('update-review-config', params),
  reactivateNote: (noteId: string) =>
    electronAPI.ipcRenderer.invoke('reactivate-note', noteId),
  getRetiredItems: () => electronAPI.ipcRenderer.invoke('get-retired-items'),

  // Search operations
  searchNotes: (params: { query: string; vaultId?: string; limit?: number }) =>
    electronAPI.ipcRenderer.invoke('search-notes', params),
  searchNotesAdvanced: (params: {
    query: string;
    type?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    vaultId?: string;
  }) => electronAPI.ipcRenderer.invoke('search-notes-advanced', params),

  // Note type operations
  listNoteTypes: () => electronAPI.ipcRenderer.invoke('list-note-types'),
  createNoteType: (params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId?: string;
  }) => electronAPI.ipcRenderer.invoke('create-note-type', params),
  getNoteTypeInfo: (params: { typeName: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('get-note-type-info', params),
  updateNoteType: (params: {
    typeName: string;
    description?: string;
    instructions?: string[];
    metadataSchema?: MetadataFieldDefinition[];
    vaultId?: string;
  }) => electronAPI.ipcRenderer.invoke('update-note-type', params),
  deleteNoteType: (params: {
    typeName: string;
    action: 'error' | 'migrate' | 'delete';
    targetType?: string;
    vaultId?: string;
  }) => electronAPI.ipcRenderer.invoke('delete-note-type', params),
  listNotesByType: (params: {
    type: string;
    vaultId?: string;
    limit?: number;
    includeArchived?: boolean;
  }) => electronAPI.ipcRenderer.invoke('list-notes-by-type', params),

  // Vault operations
  listVaults: () => electronAPI.ipcRenderer.invoke('list-vaults'),
  getCurrentVault: () => electronAPI.ipcRenderer.invoke('get-current-vault'),
  createVault: (params: {
    name: string;
    path: string;
    description?: string;
    templateId?: string;
  }) => electronAPI.ipcRenderer.invoke('create-vault', params),
  switchVault: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('switch-vault', params),
  removeVault: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('remove-vault', params),
  listTemplates: () => electronAPI.ipcRenderer.invoke('list-templates'),
  reinitializeNoteService: () =>
    electronAPI.ipcRenderer.invoke('reinitialize-note-service'),

  // File system operations
  showDirectoryPicker: () => electronAPI.ipcRenderer.invoke('show-directory-picker'),
  showItemInFolder: (params: { path: string }) =>
    electronAPI.ipcRenderer.invoke('show-item-in-folder', params),

  // Link operations
  getNoteLinks: (params: { identifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('get-note-links', params),
  getBacklinks: (params: { identifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('get-backlinks', params),
  findBrokenLinks: (params: { vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('find-broken-links', params),

  // Service status
  noteServiceReady: () => electronAPI.ipcRenderer.invoke('note-service-ready'),

  // Secure storage operations
  secureStorageAvailable: () =>
    electronAPI.ipcRenderer.invoke('secure-storage-available'),
  storeApiKey: (params: {
    provider: 'anthropic' | 'openrouter';
    key: string;
    orgId?: string;
  }) => electronAPI.ipcRenderer.invoke('store-api-key', params),
  getApiKey: (params: { provider: 'anthropic' | 'openrouter' }) =>
    electronAPI.ipcRenderer.invoke('get-api-key', params),
  testApiKey: (params: { provider: 'anthropic' | 'openrouter' }) =>
    electronAPI.ipcRenderer.invoke('test-api-key', params),
  getAllApiKeys: () => electronAPI.ipcRenderer.invoke('get-all-api-keys'),
  clearApiKeys: () => electronAPI.ipcRenderer.invoke('clear-api-keys'),
  getOpenRouterCredits: (): Promise<{
    total_credits: number;
    used_credits: number;
    remaining_credits: number;
  } | null> => electronAPI.ipcRenderer.invoke('get-openrouter-credits'),

  // Cache monitoring operations
  getCacheMetrics: () => electronAPI.ipcRenderer.invoke('get-cache-metrics'),
  getCachePerformanceSnapshot: () =>
    electronAPI.ipcRenderer.invoke('get-cache-performance-snapshot'),
  getCacheConfig: () => electronAPI.ipcRenderer.invoke('get-cache-config'),
  setCacheConfig: (config: Partial<CacheConfig>) =>
    electronAPI.ipcRenderer.invoke('set-cache-config', config),
  getCachePerformanceReport: () =>
    electronAPI.ipcRenderer.invoke('get-cache-performance-report'),
  getCacheHealthCheck: () => electronAPI.ipcRenderer.invoke('get-cache-health-check'),
  optimizeCacheConfig: () => electronAPI.ipcRenderer.invoke('optimize-cache-config'),
  resetCacheMetrics: () => electronAPI.ipcRenderer.invoke('reset-cache-metrics'),
  startPerformanceMonitoring: (intervalMinutes?: number) =>
    electronAPI.ipcRenderer.invoke('start-performance-monitoring', intervalMinutes),
  stopPerformanceMonitoring: () =>
    electronAPI.ipcRenderer.invoke('stop-performance-monitoring'),
  warmupSystemCache: () => electronAPI.ipcRenderer.invoke('warmup-system-cache'),

  // Context usage monitoring operations
  getContextUsage: (params?: { conversationId?: string }): Promise<ContextUsage> =>
    electronAPI.ipcRenderer.invoke('get-context-usage', params),
  canAcceptMessage: (params: {
    estimatedTokens: number;
    conversationId?: string;
  }): Promise<{ canAccept: boolean; reason?: string }> =>
    electronAPI.ipcRenderer.invoke('can-accept-message', params),

  // Global settings storage operations
  loadAppSettings: () => electronAPI.ipcRenderer.invoke('load-app-settings'),
  saveAppSettings: (settings: unknown) =>
    electronAPI.ipcRenderer.invoke('save-app-settings', settings),
  loadModelPreference: () => electronAPI.ipcRenderer.invoke('load-model-preference'),
  saveModelPreference: (modelId: string) =>
    electronAPI.ipcRenderer.invoke('save-model-preference', modelId),
  loadSidebarState: () => electronAPI.ipcRenderer.invoke('load-sidebar-state'),
  saveSidebarState: (collapsed: boolean) =>
    electronAPI.ipcRenderer.invoke('save-sidebar-state', collapsed),

  // Cursor position management
  getCursorPosition: (params: { vaultId: string; noteId: string }) =>
    electronAPI.ipcRenderer.invoke('get-cursor-position', params),
  setCursorPosition: (params: {
    vaultId: string;
    noteId: string;
    position: CursorPosition;
  }) => electronAPI.ipcRenderer.invoke('set-cursor-position', params),

  // UI State management
  loadUIState: (params: { vaultId: string; stateKey: string }) =>
    electronAPI.ipcRenderer.invoke('load-ui-state', params),
  saveUIState: (params: { vaultId: string; stateKey: string; stateValue: unknown }) =>
    electronAPI.ipcRenderer.invoke('save-ui-state', params),
  clearUIState: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('clear-ui-state', params.vaultId),

  // Usage tracking
  onUsageRecorded: (callback: (usageData: unknown) => void) => {
    electronAPI.ipcRenderer.on('ai-usage-recorded', (_event, data) => callback(data));
  },

  removeUsageListener: () => {
    electronAPI.ipcRenderer.removeAllListeners('ai-usage-recorded');
  },

  // Custom functions operations
  listCustomFunctions: (params?: { tags?: string[]; searchQuery?: string }) =>
    electronAPI.ipcRenderer.invoke('list-custom-functions', params),
  createCustomFunction: (params: {
    name: string;
    description: string;
    parameters: Record<
      string,
      {
        type: string;
        description?: string;
        optional?: boolean;
        default?: unknown;
      }
    >;
    returnType: string;
    code: string;
    tags?: string[];
  }) => electronAPI.ipcRenderer.invoke('create-custom-function', params),
  getCustomFunction: (params: { id?: string; name?: string }) =>
    electronAPI.ipcRenderer.invoke('get-custom-function', params),
  updateCustomFunction: (params: {
    id: string;
    name?: string;
    description?: string;
    parameters?: Record<
      string,
      {
        type: string;
        description?: string;
        optional?: boolean;
        default?: unknown;
      }
    >;
    returnType?: string;
    code?: string;
    tags?: string[];
  }) => electronAPI.ipcRenderer.invoke('update-custom-function', params),
  deleteCustomFunction: (params: { id: string }) =>
    electronAPI.ipcRenderer.invoke('delete-custom-function', params),
  validateCustomFunction: (params: {
    name: string;
    description: string;
    parameters: Record<
      string,
      {
        type: string;
        description?: string;
        optional?: boolean;
        default?: unknown;
      }
    >;
    returnType: string;
    code: string;
    tags?: string[];
  }) => electronAPI.ipcRenderer.invoke('validate-custom-function', params),
  testCustomFunction: (params: {
    functionId: string;
    parameters: Record<string, unknown>;
  }) => electronAPI.ipcRenderer.invoke('test-custom-function', params),
  getCustomFunctionStats: (params?: { functionId?: string }) =>
    electronAPI.ipcRenderer.invoke('get-custom-function-stats', params),
  exportCustomFunctions: () => electronAPI.ipcRenderer.invoke('export-custom-functions'),
  importCustomFunctions: (params: { backupData: string }) =>
    electronAPI.ipcRenderer.invoke('import-custom-functions', params),

  // Todo plan operations
  todoPlan: {
    getActive: (params: { conversationId: string }): Promise<TodoPlan | null> =>
      electronAPI.ipcRenderer.invoke('todo-plan:get-active', params)
  },

  // Workflow operations
  workflow: {
    create: (input: unknown) => electronAPI.ipcRenderer.invoke('workflow:create', input),
    update: (input: unknown) => electronAPI.ipcRenderer.invoke('workflow:update', input),
    delete: (workflowId: string) =>
      electronAPI.ipcRenderer.invoke('workflow:delete', workflowId),
    list: (input?: unknown) => electronAPI.ipcRenderer.invoke('workflow:list', input),
    get: (input: unknown) => electronAPI.ipcRenderer.invoke('workflow:get', input),
    complete: (input: unknown) =>
      electronAPI.ipcRenderer.invoke('workflow:complete', input),
    addMaterial: (workflowId: string, material: unknown) =>
      electronAPI.ipcRenderer.invoke('workflow:add-material', workflowId, material),
    removeMaterial: (materialId: string) =>
      electronAPI.ipcRenderer.invoke('workflow:remove-material', materialId)
  },

  // Daily View operations
  getOrCreateDailyNote: (params: { date: string; vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('get-or-create-daily-note', params),
  getWeekData: (params: { startDate: string; vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('get-week-data', params),
  getNotesByDate: (params: { date: string; vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('get-notes-by-date', params),
  updateDailyNote: (params: { date: string; content: string; vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('update-daily-note', params),

  // Inbox operations
  getRecentUnprocessedNotes: (params: { vaultId: string; daysBack?: number }) =>
    electronAPI.ipcRenderer.invoke('get-recent-unprocessed-notes', params),
  getRecentProcessedNotes: (params: { vaultId: string; daysBack?: number }) =>
    electronAPI.ipcRenderer.invoke('get-recent-processed-notes', params),
  markNoteAsProcessed: (params: { noteId: string; vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('mark-note-as-processed', params),
  unmarkNoteAsProcessed: (params: { noteId: string; vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('unmark-note-as-processed', params),

  // Database operations
  rebuildDatabase: (params: { vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('rebuild-database', params),
  getMigrationMapping: () => electronAPI.ipcRenderer.invoke('get-migration-mapping'),
  clearVaultUIState: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('clear-vault-ui-state', params),

  // EPUB operations
  importEpub: (): Promise<{ filename: string; path: string } | null> =>
    electronAPI.ipcRenderer.invoke('import-epub'),
  readEpubFile: (params: { relativePath: string }): Promise<Uint8Array> =>
    electronAPI.ipcRenderer.invoke('read-epub-file', params),

  // PDF operations
  importPdf: (): Promise<{ filename: string; path: string; title?: string } | null> =>
    electronAPI.ipcRenderer.invoke('import-pdf'),
  readPdfFile: (params: { relativePath: string }): Promise<Uint8Array> =>
    electronAPI.ipcRenderer.invoke('read-pdf-file', params),

  // Webpage operations
  importWebpage: (params: {
    url: string;
  }): Promise<{
    slug: string;
    path: string;
    originalPath: string;
    title: string;
    siteName?: string;
    author?: string;
    excerpt?: string;
  } | null> => electronAPI.ipcRenderer.invoke('import-webpage', params),
  readWebpageFile: (params: { relativePath: string }): Promise<string> =>
    electronAPI.ipcRenderer.invoke('read-webpage-file', params),

  // Shell operations
  openExternal: (params: { url: string }): Promise<void> =>
    electronAPI.ipcRenderer.invoke('open-external', params),

  // Image operations
  importImage: (params: {
    fileData: Uint8Array;
    filename: string;
  }): Promise<{ filename: string; path: string } | null> =>
    electronAPI.ipcRenderer.invoke('import-image', params),
  readImageFile: (params: { relativePath: string }): Promise<Uint8Array> =>
    electronAPI.ipcRenderer.invoke('read-image-file', params),
  getImageAbsolutePath: (params: { relativePath: string }): Promise<string> =>
    electronAPI.ipcRenderer.invoke('get-image-absolute-path', params),

  // Event listener for note events from main process
  onNoteEvent: (callback: (event: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, noteEvent: unknown): void =>
      callback(noteEvent);
    electronAPI.ipcRenderer.on('note-event', handler);
    return () => electronAPI.ipcRenderer.removeListener('note-event', handler);
  },

  // Event listener for workflow events from main process
  onWorkflowEvent: (callback: (event: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workflowEvent: unknown): void =>
      callback(workflowEvent);
    electronAPI.ipcRenderer.on('workflow-event', handler);
    return () => electronAPI.ipcRenderer.removeListener('workflow-event', handler);
  },

  // Event listener for review events from main process
  onReviewEvent: (callback: (event: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, reviewEvent: unknown): void =>
      callback(reviewEvent);
    electronAPI.ipcRenderer.on('review-event', handler);
    return () => electronAPI.ipcRenderer.removeListener('review-event', handler);
  },

  // Menu event listeners
  onMenuNavigate: (callback: (view: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, view: string): void =>
      callback(view);
    electronAPI.ipcRenderer.on('menu-navigate', handler);
    return () => electronAPI.ipcRenderer.removeListener('menu-navigate', handler);
  },

  onMenuAction: (
    callback: (action: string, ...args: unknown[]) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      action: string,
      ...args: unknown[]
    ): void => callback(action, ...args);
    electronAPI.ipcRenderer.on('menu-action', handler);
    return () => electronAPI.ipcRenderer.removeListener('menu-action', handler);
  },

  // Update menu state for active note
  setMenuActiveNote: (isActive: boolean): void => {
    electronAPI.ipcRenderer.send('menu-set-active-note', isActive);
  },

  // Update menu state for active epub (enables reader navigation shortcuts)
  setMenuActiveEpub: (isActive: boolean): void => {
    electronAPI.ipcRenderer.send('menu-set-active-epub', isActive);
  },

  // Update menu state for active pdf (enables reader navigation shortcuts)
  setMenuActivePdf: (isActive: boolean): void => {
    electronAPI.ipcRenderer.send('menu-set-active-pdf', isActive);
  },

  // Update menu state for workspaces (enables/disables delete, shows workspace list)
  setMenuWorkspaces: (data: {
    workspaces: Array<{ id: string; name: string; icon: string }>;
    activeWorkspaceId: string;
  }): void => {
    electronAPI.ipcRenderer.send('menu-set-workspaces', data);
  },

  // Trigger menu actions from custom title bar menu (Windows/Linux)
  triggerMenuNavigate: (view: string): void => {
    electronAPI.ipcRenderer.send('menu-trigger-navigate', view);
  },

  triggerMenuAction: (action: string, ...args: unknown[]): void => {
    electronAPI.ipcRenderer.send('menu-trigger-action', action, ...args);
  }
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
