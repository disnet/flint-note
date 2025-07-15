import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import type { LLMMessage } from '../shared/types';

// Custom APIs for renderer
const api = {
  llm: {
    generateResponse: (messages: LLMMessage[]) =>
      ipcRenderer.invoke('llm:generate-response', messages),
    streamResponse: (messages: LLMMessage[]) =>
      ipcRenderer.invoke('llm:stream-response', messages),
    streamResponseWithTools: (messages: LLMMessage[]) =>
      ipcRenderer.invoke('llm:stream-response-with-tools', messages),
    getFinalResponseAfterTools: (originalMessages: LLMMessage[], toolCallInfos: any[]) =>
      ipcRenderer.invoke(
        'llm:get-final-response-after-tools',
        originalMessages,
        toolCallInfos
      ),
    testConnection: () => ipcRenderer.invoke('llm:test-connection'),
    updateConfig: (config: unknown) => ipcRenderer.invoke('llm:update-config', config),
    getConfig: () => ipcRenderer.invoke('llm:get-config'),
    onStreamChunk: (callback: (chunk: string) => void) => {
      ipcRenderer.on('llm:stream-chunk', (_, chunk) => callback(chunk));
    },
    onStreamEnd: (callback: (fullResponse: string) => void) => {
      ipcRenderer.on('llm:stream-end', (_, fullResponse) => callback(fullResponse));
    },
    onStreamEndWithTools: (callback: (response: any) => void) => {
      ipcRenderer.on('llm:stream-end-with-tools', (_, response) => callback(response));
    },
    onStreamError: (callback: (error: string) => void) => {
      ipcRenderer.on('llm:stream-error', (_, error) => callback(error));
    },
    removeStreamListeners: () => {
      ipcRenderer.removeAllListeners('llm:stream-chunk');
      ipcRenderer.removeAllListeners('llm:stream-end');
      ipcRenderer.removeAllListeners('llm:stream-end-with-tools');
      ipcRenderer.removeAllListeners('llm:stream-error');
    }
  },
  mcp: {
    getTools: () => ipcRenderer.invoke('mcp:get-tools'),
    isEnabled: () => ipcRenderer.invoke('mcp:is-enabled'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('mcp:set-enabled', enabled),
    getStatus: () => ipcRenderer.invoke('mcp:get-status'),
    reconnect: () => ipcRenderer.invoke('mcp:reconnect'),
    testConnection: () => ipcRenderer.invoke('mcp:test-connection'),
    callTool: (toolCall: { name: string; arguments: Record<string, unknown> }) =>
      ipcRenderer.invoke('mcp:call-tool', toolCall),
    listResources: () => ipcRenderer.invoke('mcp:list-resources'),
    readResource: (uri: string) => ipcRenderer.invoke('mcp:read-resource', uri)
  },
  flintApi: {
    getNote: (identifier: string, vaultId?: string) =>
      ipcRenderer.invoke('flint-api:get-note', identifier, vaultId),
    updateNoteContent: (identifier: string, content: string, vaultId?: string) =>
      ipcRenderer.invoke('flint-api:update-note-content', identifier, content, vaultId),
    createSimpleNote: (
      type: string,
      identifier: string,
      content: string,
      vaultId?: string
    ) =>
      ipcRenderer.invoke(
        'flint-api:create-simple-note',
        type,
        identifier,
        content,
        vaultId
      ),
    searchNotes: (
      query: string,
      options?: {
        type_filter?: string;
        limit?: number;
        use_regex?: boolean;
        vaultId?: string;
        fields?: string[];
      }
    ) => ipcRenderer.invoke('flint-api:search-notes', query, options),
    searchNotesAdvanced: (options?: {
      query?: string;
      type?: string;
      metadata_filters?: Array<{
        key: string;
        value: string;
        operator?: string;
      }>;
      updated_within?: string;
      updated_before?: string;
      created_within?: string;
      created_before?: string;
      content_contains?: string;
      sort?: Array<{
        field: string;
        order: string;
      }>;
      limit?: number;
      offset?: number;
      vaultId?: string;
      fields?: string[];
    }) => ipcRenderer.invoke('flint-api:search-notes-advanced', options),
    getStatus: () => ipcRenderer.invoke('flint-api:get-status'),
    testConnection: () => ipcRenderer.invoke('flint-api:test-connection')
  },
  settings: {
    getPath: () => ipcRenderer.invoke('settings:get-path')
  },
  fileSystem: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('fs:write-file', filePath, content),
    watchFile: (filePath: string) => ipcRenderer.invoke('fs:watch-file', filePath),
    unwatchFile: (filePath: string) => ipcRenderer.invoke('fs:unwatch-file', filePath),
    onFileChange: (callback: (filePath: string, content: string) => void) => {
      ipcRenderer.on('fs:file-changed', (_, filePath, content) =>
        callback(filePath, content)
      );
    },
    removeFileListeners: () => {
      ipcRenderer.removeAllListeners('fs:file-changed');
    }
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
