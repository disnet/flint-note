import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem,
  NoteTypeListItem
} from '@flint-note/server/dist/api';
import type { NoteTypeInfo } from '@flint-note/server/dist/core/note-types';
import type { SearchResult } from '@flint-note/server/dist/database/search-manager';
import type { VaultInfo } from '@flint-note/server/dist/utils/global-config';
import type {
  NoteLinkRow,
  ExternalLinkRow
} from '@flint-note/server/dist/database/schema';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  error?: string;
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
  toolCalls?: ToolCall[];
}

export interface ChatResponse {
  text: string;
  toolCalls?: ToolCall[];
  hasToolCalls?: boolean;
  followUpResponse?: {
    text: string;
  };
}

export interface ChatService {
  sendMessage(text: string): Promise<ChatResponse>;
}

export interface NoteService {
  // Note operations
  createNote(
    type: string,
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<NoteInfo>;
  getNote(identifier: string, vaultId?: string): Promise<Note | null>;
  updateNote(
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<UpdateResult>;
  deleteNote(identifier: string, vaultId?: string): Promise<DeleteNoteResult>;
  renameNote(
    identifier: string,
    newIdentifier: string,
    vaultId?: string
  ): Promise<{ success: boolean; notesUpdated?: number; linksUpdated?: number }>;

  // Search operations
  searchNotes(query: string, vaultId?: string, limit?: number): Promise<SearchResult[]>;
  searchNotesAdvanced(params: {
    query: string;
    type?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    vaultId?: string;
  }): Promise<SearchResult[]>;

  // Note type operations
  listNoteTypes(vaultId?: string): Promise<NoteTypeListItem[]>;
  createNoteType(params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId?: string;
  }): Promise<NoteTypeInfo>;
  listNotesByType(
    type: string,
    vaultId?: string,
    limit?: number
  ): Promise<NoteListItem[]>;

  // Vault operations
  listVaults(): Promise<VaultInfo[]>;
  getCurrentVault(): Promise<VaultInfo | null>;
  createVault(name: string, path: string, description?: string): Promise<VaultInfo>;
  switchVault(vaultId: string): Promise<void>;

  // Link operations
  getNoteLinks(
    identifier: string,
    vaultId?: string
  ): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }>;
  getBacklinks(identifier: string, vaultId?: string): Promise<NoteLinkRow[]>;
  findBrokenLinks(vaultId?: string): Promise<NoteLinkRow[]>;

  // Service status
  isReady(): Promise<boolean>;
}
