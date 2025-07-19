import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

// Custom APIs for renderer
const api = {
  // Chat operations
  sendMessage: (message: string) =>
    electronAPI.ipcRenderer.invoke('send-message', message),
  clearConversation: () => electronAPI.ipcRenderer.invoke('clear-conversation'),

  // Note operations
  createNote: (type: string, identifier: string, content: string, vaultId?: string) =>
    electronAPI.ipcRenderer.invoke('create-note', type, identifier, content, vaultId),
  getNote: (identifier: string, vaultId?: string) =>
    electronAPI.ipcRenderer.invoke('get-note', identifier, vaultId),
  updateNote: (identifier: string, content: string, vaultId?: string) =>
    electronAPI.ipcRenderer.invoke('update-note', identifier, content, vaultId),
  deleteNote: (identifier: string, vaultId?: string) =>
    electronAPI.ipcRenderer.invoke('delete-note', identifier, vaultId),
  renameNote: (identifier: string, newIdentifier: string, vaultId?: string) =>
    electronAPI.ipcRenderer.invoke('rename-note', identifier, newIdentifier, vaultId),

  // Search operations
  searchNotes: (query: string, vaultId?: string, limit?: number) =>
    electronAPI.ipcRenderer.invoke('search-notes', query, vaultId, limit),
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
  listNoteTypes: (vaultId?: string) =>
    electronAPI.ipcRenderer.invoke('list-note-types', vaultId),
  createNoteType: (params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId?: string;
  }) => electronAPI.ipcRenderer.invoke('create-note-type', params),
  listNotesByType: (type: string, vaultId?: string, limit?: number) =>
    electronAPI.ipcRenderer.invoke('list-notes-by-type', type, vaultId, limit),

  // Vault operations
  listVaults: () => electronAPI.ipcRenderer.invoke('list-vaults'),
  getCurrentVault: () => electronAPI.ipcRenderer.invoke('get-current-vault'),
  createVault: (name: string, path: string, description?: string) =>
    electronAPI.ipcRenderer.invoke('create-vault', name, path, description),
  switchVault: (vaultId: string) =>
    electronAPI.ipcRenderer.invoke('switch-vault', vaultId),

  // Link operations
  getNoteLinks: (identifier: string, vaultId?: string) =>
    electronAPI.ipcRenderer.invoke('get-note-links', identifier, vaultId),
  getBacklinks: (identifier: string, vaultId?: string) =>
    electronAPI.ipcRenderer.invoke('get-backlinks', identifier, vaultId),
  findBrokenLinks: (vaultId?: string) =>
    electronAPI.ipcRenderer.invoke('find-broken-links', vaultId),

  // Service status
  noteServiceReady: () => electronAPI.ipcRenderer.invoke('note-service-ready')
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
