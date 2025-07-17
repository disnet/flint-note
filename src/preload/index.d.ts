import { ElectronAPI } from '@electron-toolkit/preload';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      // Chat operations
      sendMessage: (message: string) => Promise<string>;
      clearConversation: () => Promise<{ success: boolean; error?: string }>;

      // Note operations
      createNote: (
        type: string,
        identifier: string,
        content: string,
        vaultId?: string
      ) => Promise<any>;
      getNote: (identifier: string, vaultId?: string) => Promise<any>;
      updateNote: (identifier: string, content: string, vaultId?: string) => Promise<any>;
      deleteNote: (identifier: string, vaultId?: string) => Promise<any>;
      renameNote: (
        identifier: string,
        newIdentifier: string,
        vaultId?: string
      ) => Promise<any>;

      // Search operations
      searchNotes: (query: string, vaultId?: string, limit?: number) => Promise<any>;
      searchNotesAdvanced: (params: {
        query: string;
        type?: string;
        tags?: string[];
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        vaultId?: string;
      }) => Promise<any>;

      // Note type operations
      listNoteTypes: (vaultId?: string) => Promise<any>;
      createNoteType: (params: {
        typeName: string;
        description: string;
        agentInstructions?: string[];
        metadataSchema?: any;
        vaultId?: string;
      }) => Promise<any>;
      listNotesByType: (type: string, vaultId?: string, limit?: number) => Promise<any>;

      // Vault operations
      listVaults: () => Promise<any>;
      getCurrentVault: () => Promise<any>;
      createVault: (name: string, path: string, description?: string) => Promise<any>;
      switchVault: (vaultId: string) => Promise<any>;

      // Link operations
      getNoteLinks: (identifier: string, vaultId?: string) => Promise<any>;
      getBacklinks: (identifier: string, vaultId?: string) => Promise<any>;
      findBrokenLinks: (vaultId?: string) => Promise<any>;

      // Resource operations (MCP-style)
      getTypesResource: () => Promise<any>;
      getRecentResource: () => Promise<any>;
      getStatsResource: () => Promise<any>;

      // Service status
      noteServiceReady: () => Promise<boolean>;
    };
  }
}
