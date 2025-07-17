import type {
  ApiBacklinksResponse,
  ApiBrokenLinksResponse,
  ApiCreateNoteTypeResult,
  ApiCreateResult,
  ApiDeleteNoteResult,
  ApiNoteLinkResponse,
  ApiNoteListItem,
  ApiNoteResult,
  ApiNoteTypeListItem,
  ApiRecentResource,
  ApiRenameNoteResult,
  ApiSearchResultType,
  ApiStatsResource,
  ApiTypesResource,
  ApiUpdateResult,
  ApiVaultInfo,
  ApiVaultListResponse,
  ApiVaultOperationResult
} from '@flint-note/server';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

export interface ChatService {
  sendMessage(text: string): Promise<string>;
}

export interface NoteService {
  // Note operations
  createNote(
    type: string,
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<ApiCreateResult>;
  getNote(identifier: string, vaultId?: string): Promise<ApiNoteResult>;
  updateNote(
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<ApiUpdateResult>;
  deleteNote(identifier: string, vaultId?: string): Promise<ApiDeleteNoteResult>;
  renameNote(
    identifier: string,
    newIdentifier: string,
    vaultId?: string
  ): Promise<ApiRenameNoteResult>;

  // Search operations
  searchNotes(
    query: string,
    vaultId?: string,
    limit?: number
  ): Promise<ApiSearchResultType>;
  searchNotesAdvanced(params: {
    query: string;
    type?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    vaultId?: string;
  }): Promise<ApiSearchResultType>;

  // Note type operations
  listNoteTypes(vaultId?: string): Promise<ApiNoteTypeListItem[]>;
  createNoteType(params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId?: string;
  }): Promise<ApiCreateNoteTypeResult>;
  listNotesByType(
    type: string,
    vaultId?: string,
    limit?: number
  ): Promise<ApiNoteListItem[]>;

  // Vault operations
  listVaults(): Promise<ApiVaultListResponse>;
  getCurrentVault(): Promise<ApiVaultInfo>;
  createVault(
    name: string,
    path: string,
    description?: string
  ): Promise<ApiVaultOperationResult>;
  switchVault(vaultId: string): Promise<ApiVaultOperationResult>;

  // Link operations
  getNoteLinks(identifier: string, vaultId?: string): Promise<ApiNoteLinkResponse>;
  getBacklinks(identifier: string, vaultId?: string): Promise<ApiBacklinksResponse>;
  findBrokenLinks(vaultId?: string): Promise<ApiBrokenLinksResponse>;

  // Resource operations (MCP-style)
  getTypesResource(): Promise<ApiTypesResource>;
  getRecentResource(): Promise<ApiRecentResource>;
  getStatsResource(): Promise<ApiStatsResource>;

  // Service status
  isReady(): Promise<boolean>;
}
