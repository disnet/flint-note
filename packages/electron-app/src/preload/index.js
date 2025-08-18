import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
// Custom APIs for renderer
const api = {
    // Chat operations
    sendMessage: (params) => electronAPI.ipcRenderer.invoke('send-message', params),
    sendMessageStream: (params, onStreamStart, onStreamChunk, onStreamEnd, onStreamError, onStreamToolCall) => {
        // Set up event listeners
        electronAPI.ipcRenderer.on('ai-stream-start', (_event, data) => onStreamStart(data));
        electronAPI.ipcRenderer.on('ai-stream-chunk', (_event, data) => onStreamChunk(data));
        if (onStreamToolCall) {
            electronAPI.ipcRenderer.on('ai-stream-tool-call', (_event, data) => onStreamToolCall(data));
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
    syncConversation: (params) => electronAPI.ipcRenderer.invoke('sync-conversation', params),
    setActiveConversation: (params) => electronAPI.ipcRenderer.invoke('set-active-conversation', params),
    // Note operations
    createNote: (params) => electronAPI.ipcRenderer.invoke('create-note', params),
    getNote: (params) => electronAPI.ipcRenderer.invoke('get-note', params),
    updateNote: (params) => electronAPI.ipcRenderer.invoke('update-note', params),
    deleteNote: (params) => electronAPI.ipcRenderer.invoke('delete-note', params),
    renameNote: (params) => electronAPI.ipcRenderer.invoke('rename-note', params),
    moveNote: (params) => electronAPI.ipcRenderer.invoke('move-note', params),
    // Search operations
    searchNotes: (params) => electronAPI.ipcRenderer.invoke('search-notes', params),
    searchNotesAdvanced: (params) => electronAPI.ipcRenderer.invoke('search-notes-advanced', params),
    // Note type operations
    listNoteTypes: () => electronAPI.ipcRenderer.invoke('list-note-types'),
    createNoteType: (params) => electronAPI.ipcRenderer.invoke('create-note-type', params),
    getNoteTypeInfo: (params) => electronAPI.ipcRenderer.invoke('get-note-type-info', params),
    updateNoteType: (params) => electronAPI.ipcRenderer.invoke('update-note-type', params),
    listNotesByType: (params) => electronAPI.ipcRenderer.invoke('list-notes-by-type', params),
    // Vault operations
    listVaults: () => electronAPI.ipcRenderer.invoke('list-vaults'),
    getCurrentVault: () => electronAPI.ipcRenderer.invoke('get-current-vault'),
    createVault: (params) => electronAPI.ipcRenderer.invoke('create-vault', params),
    switchVault: (params) => electronAPI.ipcRenderer.invoke('switch-vault', params),
    // Link operations
    getNoteLinks: (params) => electronAPI.ipcRenderer.invoke('get-note-links', params),
    getBacklinks: (params) => electronAPI.ipcRenderer.invoke('get-backlinks', params),
    findBrokenLinks: (params) => electronAPI.ipcRenderer.invoke('find-broken-links', params),
    // Service status
    noteServiceReady: () => electronAPI.ipcRenderer.invoke('note-service-ready'),
    // Secure storage operations
    secureStorageAvailable: () => electronAPI.ipcRenderer.invoke('secure-storage-available'),
    storeApiKey: (params) => electronAPI.ipcRenderer.invoke('store-api-key', params),
    getApiKey: (params) => electronAPI.ipcRenderer.invoke('get-api-key', params),
    testApiKey: (params) => electronAPI.ipcRenderer.invoke('test-api-key', params),
    getAllApiKeys: () => electronAPI.ipcRenderer.invoke('get-all-api-keys'),
    clearApiKeys: () => electronAPI.ipcRenderer.invoke('clear-api-keys'),
    // Cache monitoring operations
    getCacheMetrics: () => electronAPI.ipcRenderer.invoke('get-cache-metrics'),
    getCachePerformanceSnapshot: () => electronAPI.ipcRenderer.invoke('get-cache-performance-snapshot'),
    getCacheConfig: () => electronAPI.ipcRenderer.invoke('get-cache-config'),
    setCacheConfig: (config) => electronAPI.ipcRenderer.invoke('set-cache-config', config),
    getCachePerformanceReport: () => electronAPI.ipcRenderer.invoke('get-cache-performance-report'),
    getCacheHealthCheck: () => electronAPI.ipcRenderer.invoke('get-cache-health-check'),
    optimizeCacheConfig: () => electronAPI.ipcRenderer.invoke('optimize-cache-config'),
    resetCacheMetrics: () => electronAPI.ipcRenderer.invoke('reset-cache-metrics'),
    startPerformanceMonitoring: (intervalMinutes) => electronAPI.ipcRenderer.invoke('start-performance-monitoring', intervalMinutes),
    stopPerformanceMonitoring: () => electronAPI.ipcRenderer.invoke('stop-performance-monitoring'),
    warmupSystemCache: () => electronAPI.ipcRenderer.invoke('warmup-system-cache'),
    // Usage tracking
    onUsageRecorded: (callback) => {
        electronAPI.ipcRenderer.on('ai-usage-recorded', (_event, data) => callback(data));
    },
    removeUsageListener: () => {
        electronAPI.ipcRenderer.removeAllListeners('ai-usage-recorded');
    }
};
// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI);
        contextBridge.exposeInMainWorld('api', api);
    }
    catch (error) {
        console.error(error);
    }
}
else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI;
    // @ts-ignore (define in dts)
    window.api = api;
}
