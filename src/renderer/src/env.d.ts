/// <reference types="vite/client" />

declare global {
  interface Window {
    electron: import('@electron-toolkit/preload').ElectronAPI;
    api: {
      // Auto-updater operations
      checkForUpdates: () => Promise<{
        success: boolean;
        updateInfo?: unknown;
        error?: string;
      }>;
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      installUpdate: () => Promise<{ success: boolean; error?: string }>;
      getAppVersion: () => Promise<{ version: string; channel: string }>;
      getUpdateConfig: () => Promise<{
        autoDownload: boolean;
        autoInstallOnAppQuit: boolean;
        allowPrerelease: boolean;
        allowDowngrade: boolean;
        currentVersion?: string;
      }>;
      setUpdateConfig: (config: {
        autoDownload?: boolean;
        autoInstallOnAppQuit?: boolean;
        allowPrerelease?: boolean;
        allowDowngrade?: boolean;
      }) => Promise<{ success: boolean; error?: string }>;
      getChangelog: (
        version: string,
        isCanary: boolean
      ) => Promise<{ success: boolean; changelog?: string; error?: string }>;

      // Auto-updater event listeners
      onUpdateChecking: (callback: () => void) => void;
      onUpdateAvailable: (
        callback: (info: {
          version: string;
          releaseDate?: string;
          releaseName?: string;
          releaseNotes?: string;
        }) => void
      ) => void;
      onUpdateNotAvailable: (callback: (info: { version: string }) => void) => void;
      onUpdateError: (
        callback: (error: { message: string; stack?: string }) => void
      ) => void;
      onUpdateDownloadProgress: (
        callback: (progress: {
          bytesPerSecond: number;
          percent: number;
          transferred: number;
          total: number;
        }) => void
      ) => void;
      onUpdateDownloaded: (
        callback: (info: {
          version: string;
          releaseDate?: string;
          releaseName?: string;
          releaseNotes?: string;
        }) => void
      ) => void;
      removeAllUpdateListeners: () => void;

      // File system operations
      showItemInFolder: (params: { path: string }) => Promise<{
        success: boolean;
        error?: string;
      }>;
      showLogsInFolder: () => Promise<{
        success: boolean;
        error?: string;
      }>;
      showNoteInFolder: (params: {
        baseDirectory: string;
        noteTitle: string;
        noteTypeName: string;
      }) => Promise<{
        success: boolean;
        error?: string;
      }>;

      // Secure storage operations
      secureStorageAvailable: () => Promise<boolean>;
      storeApiKey: (params: {
        provider: 'anthropic' | 'openrouter';
        key: string;
        orgId?: string;
      }) => Promise<unknown>;
      getApiKey: (params: {
        provider: 'anthropic' | 'openrouter';
      }) => Promise<{ key: string; orgId?: string }>;
      testApiKey: (params: { provider: 'anthropic' | 'openrouter' }) => Promise<boolean>;
      getAllApiKeys: () => Promise<{ openrouter: string; anthropic: string }>;
      clearApiKeys: () => Promise<unknown>;
      getOpenRouterCredits: () => Promise<{
        total_credits: number;
        used_credits: number;
        remaining_credits: number;
      } | null>;

      // Chat server operations
      getChatServerPort: () => Promise<number>;

      // Global settings storage operations
      loadAppSettings: () => Promise<unknown>;
      saveAppSettings: (settings: unknown) => Promise<unknown>;
      loadModelPreference: () => Promise<string | null>;
      saveModelPreference: (modelId: string) => Promise<void>;

      // Font operations
      getSystemFonts: () => Promise<string[]>;

      // Vibrancy control (macOS only)
      refreshVibrancy: () => Promise<void>;

      // Webpage archiving (returns HTML content for OPFS storage)
      archiveWebpage: (params: { url: string }) => Promise<{
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
      }>;

      // Shell operations
      openExternal: (params: { url: string }) => Promise<void>;

      // Menu event listeners
      onMenuNavigate: (callback: (view: string) => void) => () => void;
      onMenuAction: (
        callback: (action: string, ...args: unknown[]) => void
      ) => () => void;

      // Update menu state
      setMenuActiveNote: (isActive: boolean) => void;
      setMenuActiveEpub: (isActive: boolean) => void;
      setMenuActivePdf: (isActive: boolean) => void;
      setMenuFileSyncEnabled: (isEnabled: boolean) => void;
      setMenuWorkspaces: (data: {
        workspaces: Array<{ id: string; name: string; icon: string }>;
        activeWorkspaceId: string;
      }) => void;

      // Trigger menu actions
      triggerMenuNavigate: (view: string) => void;
      triggerMenuAction: (action: string, ...args: unknown[]) => void;

      // Window control operations (Windows/Linux)
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;

      // Automerge sync operations
      automergeSync: {
        sendRepoMessage: (message: unknown) => Promise<void>;
        onRepoMessage: (callback: (message: unknown) => void) => void;
        removeRepoMessageListener: () => void;
        initVaultSync: (params: {
          vaultId: string;
          baseDirectory: string;
          docUrl: string;
          vaultName: string;
        }) => Promise<{ success: boolean }>;
        disposeVaultSync: (params: { vaultId: string }) => Promise<void>;
        selectSyncDirectory: () => Promise<string | null>;

        // Binary file sync operations (PDFs, EPUBs, web archives, images)
        writeFileToFilesystem: (params: {
          fileType: 'pdf' | 'epub' | 'webpage' | 'image';
          hash: string;
          data: Uint8Array;
          extension?: string;
          metadata?: Record<string, unknown>;
          baseDirectory?: string; // Optional: for use during migration when vault doesn't exist yet
        }) => Promise<void>;
        fileExistsOnFilesystem: (params: {
          fileType: 'pdf' | 'epub' | 'webpage' | 'image';
          hash: string;
          extension?: string;
        }) => Promise<boolean>;
        listFilesInFilesystem: (params: {
          fileType: 'pdf' | 'epub' | 'webpage' | 'image';
        }) => Promise<Array<{ hash: string; extension?: string; size: number }>>;
        readFileFromFilesystem: (params: {
          fileType: 'pdf' | 'epub' | 'webpage' | 'image';
          hash: string;
          extension?: string;
        }) => Promise<{
          data: Uint8Array;
          metadata?: Record<string, unknown>;
        } | null>;
        onFileAddedFromFilesystem: (
          callback: (data: {
            fileType: 'pdf' | 'epub' | 'webpage' | 'image';
            hash: string;
            extension?: string;
            data: Uint8Array;
            metadata?: Record<string, unknown>;
          }) => void
        ) => void;
        removeFileAddedListener: () => void;
      };

      // Legacy vault migration operations
      legacyMigration: {
        detectLegacyVaults: (params: {
          existingVaults: Array<{ baseDirectory?: string }>;
        }) => Promise<
          Array<{
            path: string;
            name: string;
            noteCount: number;
            epubCount: number;
            lastModified: string;
            hasExistingMigration: boolean;
            syncDirectoryName: string;
          }>
        >;
        detectLegacyVaultAtPath: (params: {
          vaultPath: string;
          existingVaults: Array<{ baseDirectory?: string }>;
        }) => Promise<{
          path: string;
          name: string;
          noteCount: number;
          epubCount: number;
          lastModified: string;
          hasExistingMigration: boolean;
          syncDirectoryName: string;
        } | null>;
        getMigrationDocumentData: (params: { vaultPath: string }) => Promise<{
          document: unknown;
          epubFiles: Array<{
            noteId: string;
            fileData: Uint8Array;
            filePath: string;
            metadata: { title?: string; author?: string };
            readingState?: { currentCfi?: string; progress?: number };
          }>;
          pdfFiles: Array<{
            noteId: string;
            fileData: Uint8Array;
            filePath: string;
            metadata: { title?: string; author?: string };
            readingState?: { currentPage?: number; progress?: number };
          }>;
          webpageFiles: Array<{
            noteId: string;
            htmlContent: string;
            filePath: string;
            metadata: {
              title?: string;
              url?: string;
              siteName?: string;
              author?: string;
            };
          }>;
          imageFiles: Array<{
            filename: string;
            relativePath: string;
            fileData: Uint8Array;
            extension: string;
          }>;
          errors: Array<{
            entity: string;
            entityId: string;
            message: string;
          }>;
        } | null>;
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
        ) => void;
        removeMigrationListeners: () => void;
        browseForVault: () => Promise<string | null>;
        readLegacyVaultPaths: () => Promise<
          Array<{
            id: string;
            name: string;
            path: string;
            created?: string;
            last_accessed?: string;
            last_modified?: string;
          }>
        >;
      };

      // Plain markdown directory import operations
      markdownImport: {
        detectMarkdownDirectory: (params: { dirPath: string }) => Promise<{
          path: string;
          name: string;
          fileCount: number;
          categories: string[];
        } | null>;
        getMarkdownImportData: (params: { dirPath: string }) => Promise<{
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
        } | null>;
      };

      // Automerge vault import operations (from .automerge directories)
      automergeImport: {
        detectAutomergeVault: (params: { dirPath: string }) => Promise<{
          path: string;
          name: string;
          docUrl: string;
          created: string;
          isValid: boolean;
          error?: string;
        } | null>;
      };

      // Startup command listener (for CLI arguments)
      onStartupCommand: (
        callback: (command: {
          type: 'open-vault' | 'import-directory';
          vaultName?: string;
          vaultId?: string;
          importPath?: string;
          customVaultName?: string;
        }) => void
      ) => () => void;
    };
  }
}

export {};
