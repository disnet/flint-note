import { ElectronAPI } from '@electron-toolkit/preload';
import type {
  ApiCreateResult,
  ApiNoteResult,
  ApiUpdateResult,
  ApiDeleteNoteResult,
  ApiRenameNoteResult,
  ApiNoteTypeListItem,
  ApiCreateNoteTypeResult,
  ApiVaultListResponse,
  ApiVaultInfo,
  ApiVaultOperationResult,
  ApiNoteLinkResponse,
  ApiBacklinksResponse,
  ApiBrokenLinksResponse,
  ApiTypesResource,
  ApiRecentResource,
  ApiStatsResource,
  ApiSearchResultType,
  ApiNoteListItem
} from '@flint-note/server';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

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
      ) => Promise<ApiCreateResult>;
      getNote: (identifier: string, vaultId?: string) => Promise<ApiNoteResult>;
      updateNote: (
        identifier: string,
        content: string,
        vaultId?: string
      ) => Promise<ApiUpdateResult>;
      deleteNote: (identifier: string, vaultId?: string) => Promise<ApiDeleteNoteResult>;
      renameNote: (
        identifier: string,
        newIdentifier: string,
        vaultId?: string
      ) => Promise<ApiRenameNoteResult>;

      // Search operations
      searchNotes: (
        query: string,
        vaultId?: string,
        limit?: number
      ) => Promise<ApiSearchResultType>;
      searchNotesAdvanced: (params: {
        query: string;
        type?: string;
        tags?: string[];
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        vaultId?: string;
      }) => Promise<ApiSearchResultType>;

      // Note type operations
      listNoteTypes: (vaultId?: string) => Promise<ApiNoteTypeListItem[]>;
      createNoteType: (params: {
        typeName: string;
        description: string;
        agentInstructions?: string[];
        metadataSchema?: MetadataSchema;
        vaultId?: string;
      }) => Promise<ApiCreateNoteTypeResult>;
      listNotesByType: (
        type: string,
        vaultId?: string,
        limit?: number
      ) => Promise<ApiNoteListItem[]>;

      // Vault operations
      listVaults: () => Promise<ApiVaultListResponse>;
      getCurrentVault: () => Promise<ApiVaultInfo>;
      createVault: (
        name: string,
        path: string,
        description?: string
      ) => Promise<ApiVaultOperationResult>;
      switchVault: (vaultId: string) => Promise<ApiVaultOperationResult>;

      // Link operations
      getNoteLinks: (
        identifier: string,
        vaultId?: string
      ) => Promise<ApiNoteLinkResponse>;
      getBacklinks: (
        identifier: string,
        vaultId?: string
      ) => Promise<ApiBacklinksResponse>;
      findBrokenLinks: (vaultId?: string) => Promise<ApiBrokenLinksResponse>;

      // Resource operations (MCP-style)
      getTypesResource: () => Promise<ApiTypesResource>;
      getRecentResource: () => Promise<ApiRecentResource>;
      getStatsResource: () => Promise<ApiStatsResource>;

      // Service status
      noteServiceReady: () => Promise<boolean>;
    };
  }
}
