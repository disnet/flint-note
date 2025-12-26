import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
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

  // File system operations
  showDirectoryPicker: () => electronAPI.ipcRenderer.invoke('show-directory-picker'),
  showItemInFolder: (params: { path: string }) =>
    electronAPI.ipcRenderer.invoke('show-item-in-folder', params),

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

  // Chat server port (for useChat integration)
  getChatServerPort: (): Promise<number> =>
    electronAPI.ipcRenderer.invoke('get-chat-server-port'),

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

  // Usage tracking
  onUsageRecorded: (callback: (usageData: unknown) => void) => {
    electronAPI.ipcRenderer.on('ai-usage-recorded', (_event, data) => callback(data));
  },

  removeUsageListener: () => {
    electronAPI.ipcRenderer.removeAllListeners('ai-usage-recorded');
  },

  // Vault operations
  clearVaultUIState: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('clear-vault-ui-state', params),

  // Archive webpage for Automerge (returns HTML content for OPFS storage)
  archiveWebpage: (params: {
    url: string;
  }): Promise<{
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
  }> => electronAPI.ipcRenderer.invoke('archive-webpage', params),

  // Shell operations
  openExternal: (params: { url: string }): Promise<void> =>
    electronAPI.ipcRenderer.invoke('open-external', params),

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
  },

  // Automerge sync operations
  automergeSync: {
    sendRepoMessage: (message: {
      type: string;
      peerId?: string;
      peerMetadata?: Record<string, unknown>;
      data?: {
        senderId: string;
        targetId: string;
        type: string;
        documentId?: string;
        data?: number[];
      };
    }) => electronAPI.ipcRenderer.invoke('automerge-repo-message', message),

    onRepoMessage: (
      callback: (message: {
        type: string;
        peerId?: string;
        peerMetadata?: Record<string, unknown>;
        data?: {
          senderId: string;
          targetId: string;
          type: string;
          documentId?: string;
          data?: number[];
        };
      }) => void
    ) => {
      electronAPI.ipcRenderer.on('automerge-repo-message', (_event, message) =>
        callback(message)
      );
    },

    removeRepoMessageListener: () => {
      electronAPI.ipcRenderer.removeAllListeners('automerge-repo-message');
    },

    initVaultSync: (params: { vaultId: string; baseDirectory: string; docUrl: string }) =>
      electronAPI.ipcRenderer.invoke('init-vault-sync', params),

    disposeVaultSync: (params: { vaultId: string }) =>
      electronAPI.ipcRenderer.invoke('dispose-vault-sync', params),

    selectSyncDirectory: () => electronAPI.ipcRenderer.invoke('select-sync-directory'),

    // Binary file sync operations (PDFs, EPUBs, web archives, images)
    writeFileToFilesystem: (params: {
      fileType: 'pdf' | 'epub' | 'webpage' | 'image';
      hash: string;
      data: Uint8Array;
      extension?: string; // Required for images
      metadata?: Record<string, unknown>; // For webpages
      baseDirectory?: string; // Optional: for use during migration when vault doesn't exist yet
    }): Promise<void> =>
      electronAPI.ipcRenderer.invoke('write-file-to-filesystem', params),

    fileExistsOnFilesystem: (params: {
      fileType: 'pdf' | 'epub' | 'webpage' | 'image';
      hash: string;
      extension?: string; // Required for images
    }): Promise<boolean> =>
      electronAPI.ipcRenderer.invoke('file-exists-on-filesystem', params),

    listFilesInFilesystem: (params: {
      fileType: 'pdf' | 'epub' | 'webpage' | 'image';
    }): Promise<Array<{ hash: string; extension?: string; size: number }>> =>
      electronAPI.ipcRenderer.invoke('list-files-in-filesystem', params),

    readFileFromFilesystem: (params: {
      fileType: 'pdf' | 'epub' | 'webpage' | 'image';
      hash: string;
      extension?: string; // Required for images
    }): Promise<{
      data: Uint8Array;
      metadata?: Record<string, unknown>;
    } | null> => electronAPI.ipcRenderer.invoke('read-file-from-filesystem', params),

    onFileAddedFromFilesystem: (
      callback: (data: {
        fileType: 'pdf' | 'epub' | 'webpage' | 'image';
        hash: string;
        extension?: string;
        data: Uint8Array;
        metadata?: Record<string, unknown>;
      }) => void
    ) => {
      electronAPI.ipcRenderer.on('file-added-from-filesystem', (_event, data) =>
        callback(data)
      );
    },

    removeFileAddedListener: () => {
      electronAPI.ipcRenderer.removeAllListeners('file-added-from-filesystem');
    }
  },

  // Legacy vault migration operations
  legacyMigration: {
    // Detect legacy vaults in common locations
    detectLegacyVaults: (params: { existingVaults: Array<{ baseDirectory?: string }> }) =>
      electronAPI.ipcRenderer.invoke('detect-legacy-vaults', params),

    // Detect a legacy vault at a specific path
    detectLegacyVaultAtPath: (params: {
      vaultPath: string;
      existingVaults: Array<{ baseDirectory?: string }>;
    }) => electronAPI.ipcRenderer.invoke('detect-legacy-vault-at-path', params),

    // Get document data for migration (called after initial migration setup)
    getMigrationDocumentData: (params: {
      vaultPath: string;
    }): Promise<{
      document: unknown;
      epubFiles: {
        noteId: string;
        fileData: Uint8Array;
        filePath: string;
        metadata: { title?: string; author?: string };
        readingState?: { currentCfi?: string; progress?: number };
      }[];
      pdfFiles: {
        noteId: string;
        fileData: Uint8Array;
        filePath: string;
        metadata: { title?: string; author?: string };
        readingState?: { currentPage?: number; progress?: number };
      }[];
      webpageFiles: {
        noteId: string;
        htmlContent: string;
        filePath: string;
        metadata: { title?: string; url?: string; siteName?: string; author?: string };
      }[];
      imageFiles: {
        filename: string;
        relativePath: string;
        fileData: Uint8Array;
        extension: string;
      }[];
      errors: { entity: string; entityId: string; message: string }[];
    } | null> => electronAPI.ipcRenderer.invoke('get-migration-document-data', params),

    // Listen for migration progress updates
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
    ) => {
      electronAPI.ipcRenderer.on('migration-progress', (_event, progress) =>
        callback(progress)
      );
    },

    // Remove migration progress listener
    removeMigrationListeners: () => {
      electronAPI.ipcRenderer.removeAllListeners('migration-progress');
    },

    // Browse for a vault directory
    browseForVault: () => electronAPI.ipcRenderer.invoke('browse-for-vault')
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
