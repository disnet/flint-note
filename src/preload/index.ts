import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

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

  // File system operations
  showItemInFolder: (params: { path: string }) =>
    electronAPI.ipcRenderer.invoke('show-item-in-folder', params),
  showLogsInFolder: () => electronAPI.ipcRenderer.invoke('show-logs-in-folder'),
  showNoteInFolder: (params: { baseDirectory: string; noteTitle: string; noteTypeName: string }) =>
    electronAPI.ipcRenderer.invoke('show-note-in-folder', params),

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

  // Global settings storage operations
  loadAppSettings: () => electronAPI.ipcRenderer.invoke('load-app-settings'),
  saveAppSettings: (settings: unknown) =>
    electronAPI.ipcRenderer.invoke('save-app-settings', settings),
  loadModelPreference: () => electronAPI.ipcRenderer.invoke('load-model-preference'),
  saveModelPreference: (modelId: string) =>
    electronAPI.ipcRenderer.invoke('save-model-preference', modelId),

  // Font operations
  getSystemFonts: (): Promise<string[]> =>
    electronAPI.ipcRenderer.invoke('get-system-fonts'),

  // Vibrancy control (macOS only)
  refreshVibrancy: (): Promise<void> =>
    electronAPI.ipcRenderer.invoke('refresh-vibrancy'),

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

  // Window control operations (for Windows/Linux custom title bar)
  windowMinimize: (): void => {
    electronAPI.ipcRenderer.send('window-minimize');
  },
  windowMaximize: (): void => {
    electronAPI.ipcRenderer.send('window-maximize');
  },
  windowClose: (): void => {
    electronAPI.ipcRenderer.send('window-close');
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
    }) => electronAPI.ipcRenderer.send('automerge-repo-message', message),

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

    initVaultSync: (params: {
      vaultId: string;
      baseDirectory: string;
      docUrl: string;
      vaultName: string;
    }) => electronAPI.ipcRenderer.invoke('init-vault-sync', params),

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
    browseForVault: () => electronAPI.ipcRenderer.invoke('browse-for-vault'),

    // Read legacy vault paths from old app's config.yml
    readLegacyVaultPaths: (): Promise<
      {
        id: string;
        name: string;
        path: string;
        created?: string;
        last_accessed?: string;
        last_modified?: string;
      }[]
    > => electronAPI.ipcRenderer.invoke('read-legacy-vault-paths')
  },

  // Plain markdown directory import operations
  markdownImport: {
    // Detect if a directory contains markdown files
    detectMarkdownDirectory: (params: {
      dirPath: string;
    }): Promise<{
      path: string;
      name: string;
      fileCount: number;
      categories: string[];
    } | null> => electronAPI.ipcRenderer.invoke('detect-markdown-directory', params),

    // Get full import data with file contents
    getMarkdownImportData: (params: {
      dirPath: string;
    }): Promise<{
      directory: {
        path: string;
        name: string;
        fileCount: number;
        categories: string[];
      };
      files: Array<{
        relativePath: string;
        title: string;
        content: string;
        categoryName: string | null;
      }>;
    } | null> => electronAPI.ipcRenderer.invoke('get-markdown-import-data', params)
  },

  // Automerge vault import operations (for importing from .automerge directories)
  automergeImport: {
    // Detect if a directory contains an automerge vault
    detectAutomergeVault: (params: {
      dirPath: string;
    }): Promise<{
      path: string;
      name: string;
      docUrl: string;
      created: string;
      isValid: boolean;
      error?: string;
    } | null> => electronAPI.ipcRenderer.invoke('detect-automerge-vault', params)
  },

  // Startup command listener (for CLI arguments)
  onStartupCommand: (
    callback: (command: {
      type: 'open-vault' | 'import-directory';
      vaultName?: string;
      vaultId?: string;
      importPath?: string;
      customVaultName?: string;
    }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      command: {
        type: 'open-vault' | 'import-directory';
        vaultName?: string;
        vaultId?: string;
        importPath?: string;
        customVaultName?: string;
      }
    ): void => callback(command);
    electronAPI.ipcRenderer.on('startup-command', handler);
    return () => electronAPI.ipcRenderer.removeListener('startup-command', handler);
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
