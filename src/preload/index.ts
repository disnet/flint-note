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
    onStreamEnd: (data: { requestId: string; fullText: string }) => void,
    onStreamError: (data: { requestId: string; error: string }) => void,
    onStreamToolCall?: (data: { requestId: string; toolCall: ToolCallData }) => void
  ) => {
    // Set up event listeners
    electronAPI.ipcRenderer.on('ai-stream-start', (_event, data) => onStreamStart(data));
    electronAPI.ipcRenderer.on('ai-stream-chunk', (_event, data) => onStreamChunk(data));
    if (onStreamToolCall) {
      electronAPI.ipcRenderer.on('ai-stream-tool-call', (_event, data) =>
        onStreamToolCall(data)
      );
    }
    electronAPI.ipcRenderer.on('ai-stream-end', (_event, data) => {
      onStreamEnd(data);
      // Clean up listeners
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-start');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-chunk');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-tool-call');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-end');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-error');
    });
    electronAPI.ipcRenderer.on('ai-stream-error', (_event, data) => {
      onStreamError(data);
      // Clean up listeners
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-start');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-chunk');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-tool-call');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-end');
      electronAPI.ipcRenderer.removeAllListeners('ai-stream-error');
    });

    // Send the streaming request
    electronAPI.ipcRenderer.send('send-message-stream', params);
  },
  clearConversation: () => electronAPI.ipcRenderer.invoke('clear-conversation'),
  syncConversation: (params: { conversationId: string; messages: FrontendMessage[] }) =>
    electronAPI.ipcRenderer.invoke('sync-conversation', params),
  setActiveConversation: (params: {
    conversationId: string;
    messages?: FrontendMessage[] | string;
  }) => electronAPI.ipcRenderer.invoke('set-active-conversation', params),

  // Note operations
  createNote: (params: {
    type: string;
    identifier: string;
    content: string;
    vaultId?: string;
  }) => electronAPI.ipcRenderer.invoke('create-note', params),
  getNote: (params: { identifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('get-note', params),
  updateNote: (params: {
    identifier: string;
    content: string;
    vaultId?: string;
    metadata?: NoteMetadata;
  }) => electronAPI.ipcRenderer.invoke('update-note', params),
  deleteNote: (params: { identifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('delete-note', params),
  renameNote: (params: { identifier: string; newIdentifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('rename-note', params),
  moveNote: (params: { identifier: string; newType: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('move-note', params),

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
  listNotesByType: (params: { type: string; vaultId?: string; limit?: number }) =>
    electronAPI.ipcRenderer.invoke('list-notes-by-type', params),

  // Vault operations
  listVaults: () => electronAPI.ipcRenderer.invoke('list-vaults'),
  getCurrentVault: () => electronAPI.ipcRenderer.invoke('get-current-vault'),
  createVault: (params: { name: string; path: string; description?: string }) =>
    electronAPI.ipcRenderer.invoke('create-vault', params),
  switchVault: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('switch-vault', params),
  removeVault: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('remove-vault', params),

  // File system operations
  showDirectoryPicker: () => electronAPI.ipcRenderer.invoke('show-directory-picker'),

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
    provider: 'anthropic' | 'openai' | 'openrouter';
    key: string;
    orgId?: string;
  }) => electronAPI.ipcRenderer.invoke('store-api-key', params),
  getApiKey: (params: { provider: 'anthropic' | 'openai' | 'openrouter' }) =>
    electronAPI.ipcRenderer.invoke('get-api-key', params),
  testApiKey: (params: { provider: 'anthropic' | 'openai' | 'openrouter' }) =>
    electronAPI.ipcRenderer.invoke('test-api-key', params),
  getAllApiKeys: () => electronAPI.ipcRenderer.invoke('get-all-api-keys'),
  clearApiKeys: () => electronAPI.ipcRenderer.invoke('clear-api-keys'),

  // Pinned notes storage operations
  loadPinnedNotes: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('load-pinned-notes', params),
  savePinnedNotes: (params: { vaultId: string; notes: unknown[] }) =>
    electronAPI.ipcRenderer.invoke('save-pinned-notes', params),
  clearPinnedNotes: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('clear-pinned-notes', params),

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
  loadSlashCommands: () => electronAPI.ipcRenderer.invoke('load-slash-commands'),
  saveSlashCommands: (commands: unknown) =>
    electronAPI.ipcRenderer.invoke('save-slash-commands', commands),

  // Vault-specific data storage operations
  loadConversations: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('load-conversations', params),
  saveConversations: (params: { vaultId: string; conversations: unknown }) =>
    electronAPI.ipcRenderer.invoke('save-conversations', params),
  loadTemporaryTabs: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('load-temporary-tabs', params),
  saveTemporaryTabs: (params: { vaultId: string; tabs: unknown }) =>
    electronAPI.ipcRenderer.invoke('save-temporary-tabs', params),
  loadNavigationHistory: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('load-navigation-history', params),
  saveNavigationHistory: (params: { vaultId: string; history: unknown }) =>
    electronAPI.ipcRenderer.invoke('save-navigation-history', params),
  loadActiveNote: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('load-active-note', params),
  saveActiveNote: (params: { vaultId: string; noteId: string | null }) =>
    electronAPI.ipcRenderer.invoke('save-active-note', params),

  // Cursor position management
  loadCursorPositions: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('load-cursor-positions', params),
  saveCursorPositions: (params: {
    vaultId: string;
    positions: Record<string, CursorPosition>;
  }) => electronAPI.ipcRenderer.invoke('save-cursor-positions', params),
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
    electronAPI.ipcRenderer.invoke('import-custom-functions', params)
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
