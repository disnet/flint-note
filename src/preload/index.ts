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
    testConnection: () => ipcRenderer.invoke('llm:test-connection'),
    updateConfig: (config: unknown) => ipcRenderer.invoke('llm:update-config', config),
    getConfig: () => ipcRenderer.invoke('llm:get-config'),
    onStreamChunk: (callback: (chunk: string) => void) => {
      ipcRenderer.on('llm:stream-chunk', (_, chunk) => callback(chunk));
    },
    onStreamEnd: (callback: (fullResponse: string) => void) => {
      ipcRenderer.on('llm:stream-end', (_, fullResponse) => callback(fullResponse));
    },
    onStreamError: (callback: (error: string) => void) => {
      ipcRenderer.on('llm:stream-error', (_, error) => callback(error));
    },
    removeStreamListeners: () => {
      ipcRenderer.removeAllListeners('llm:stream-chunk');
      ipcRenderer.removeAllListeners('llm:stream-end');
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
      ipcRenderer.invoke('mcp:call-tool', toolCall)
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
