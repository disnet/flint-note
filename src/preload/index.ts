import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';
import { NoteMetadata } from '@flint-note/server';

// Custom APIs for renderer
const api = {
  // Chat operations
  sendMessage: (message: string) =>
    electronAPI.ipcRenderer.invoke('send-message', message),
  clearConversation: () => electronAPI.ipcRenderer.invoke('clear-conversation'),

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
  listNotesByType: (params: { type: string; vaultId?: string; limit?: number }) =>
    electronAPI.ipcRenderer.invoke('list-notes-by-type', params),

  // Vault operations
  listVaults: () => electronAPI.ipcRenderer.invoke('list-vaults'),
  getCurrentVault: () => electronAPI.ipcRenderer.invoke('get-current-vault'),
  createVault: (params: { name: string; path: string; description?: string }) =>
    electronAPI.ipcRenderer.invoke('create-vault', params),
  switchVault: (params: { vaultId: string }) =>
    electronAPI.ipcRenderer.invoke('switch-vault', params),

  // Link operations
  getNoteLinks: (params: { identifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('get-note-links', params),
  getBacklinks: (params: { identifier: string; vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('get-backlinks', params),
  findBrokenLinks: (params: { vaultId?: string }) =>
    electronAPI.ipcRenderer.invoke('find-broken-links', params),

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
