import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// Custom APIs for renderer
const api = {
  llm: {
    generateResponse: (messages: any[]) => ipcRenderer.invoke('llm:generate-response', messages),
    streamResponse: (messages: any[]) => ipcRenderer.invoke('llm:stream-response', messages),
    testConnection: () => ipcRenderer.invoke('llm:test-connection'),
    updateConfig: (config: any) => ipcRenderer.invoke('llm:update-config', config),
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
