import { ElectronAPI } from '@electron-toolkit/preload';
import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem,
  NoteTypeListItem
} from '@flint-note/server';
import type { SearchResult } from '@flint-note/server/dist/database/search-manager';
import type {
  CoreVaultInfo as VaultInfo,
  CoreNoteLinkRow as NoteLinkRow,
  CoreNoteTypeInfo as NoteTypeInfo
} from '@flint-note/server/dist/api/types';
import type { ExternalLinkRow } from '@flint-note/server/dist/database/schema';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      // Chat operations
      sendMessage: (message: string) => Promise<string>;
      clearConversation: () => Promise<{ success: boolean; error?: string }>;

      // Note operations
      createNote: (params: {
        type: string;
        identifier: string;
        content: string;
        vaultId?: string;
      }) => Promise<NoteInfo>;
      getNote: (params: { identifier: string; vaultId?: string }) => Promise<Note | null>;
      updateNote: (params: {
        identifier: string;
        content: string;
        vaultId?: string;
      }) => Promise<UpdateResult>;
      deleteNote: (params: {
        identifier: string;
        vaultId?: string;
      }) => Promise<DeleteNoteResult>;
      renameNote: (params: {
        identifier: string;
        newIdentifier: string;
        vaultId?: string;
      }) => Promise<{ success: boolean; notesUpdated?: number; linksUpdated?: number }>;

      // Search operations
      searchNotes: (params: {
        query: string;
        vaultId?: string;
        limit?: number;
      }) => Promise<SearchResult[]>;
      searchNotesAdvanced: (params: {
        query: string;
        type?: string;
        tags?: string[];
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        vaultId?: string;
      }) => Promise<SearchResult[]>;

      // Note type operations
      listNoteTypes: () => Promise<NoteTypeListItem[]>;
      createNoteType: (params: {
        typeName: string;
        description: string;
        agentInstructions?: string[];
        metadataSchema?: MetadataSchema;
        vaultId?: string;
      }) => Promise<NoteTypeInfo>;
      listNotesByType: (params: {
        type: string;
        vaultId?: string;
        limit?: number;
      }) => Promise<NoteListItem[]>;

      // Vault operations
      listVaults: () => Promise<VaultInfo[]>;
      getCurrentVault: () => Promise<VaultInfo | null>;
      createVault: (params: {
        name: string;
        path: string;
        description?: string;
      }) => Promise<VaultInfo>;
      switchVault: (params: { vaultId: string }) => Promise<void>;

      // Link operations
      getNoteLinks: (params: { identifier: string; vaultId?: string }) => Promise<{
        outgoing_internal: NoteLinkRow[];
        outgoing_external: ExternalLinkRow[];
        incoming: NoteLinkRow[];
      }>;
      getBacklinks: (params: {
        identifier: string;
        vaultId?: string;
      }) => Promise<NoteLinkRow[]>;
      findBrokenLinks: (params: { vaultId?: string }) => Promise<NoteLinkRow[]>;

      // Service status
      noteServiceReady: () => Promise<boolean>;
    };
  }
}
