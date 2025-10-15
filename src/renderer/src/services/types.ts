import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem
} from '@/server/core/notes';
import type { NoteTypeListItem } from '@/server/core/note-types';
import type { NoteMetadata } from '@/server/types';
import type { MoveNoteResult } from '@/server/core/notes';
import type { SearchResult } from '@/server/database/search-manager';
import type {
  CoreVaultInfo as VaultInfo,
  CoreNoteLinkRow as NoteLinkRow,
  CoreNoteTypeInfo as NoteTypeInfo,
  CreateVaultResult
} from '@/server/api/types';
import type { ExternalLinkRow } from '@/server/database/schema';
import type {
  MetadataFieldDefinition,
  MetadataSchema
} from '@/server/core/metadata-schema';
import type { GetNoteTypeInfoResult } from '@/server/api/types';
import type { NoteTypeDescription } from '@/server/core/note-types';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown> | null | undefined;
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
  sendMessage(
    text: string,
    conversationId?: string,
    model?: string
  ): Promise<ChatResponse>;
  sendMessageStream?(
    text: string,
    conversationId: string | undefined,
    onChunk: (chunk: string) => void,
    onComplete: (fullText: string) => void,
    onError: (error: string) => void,
    model?: string,
    onToolCall?: (toolCall: ToolCall) => void,
    onToolResult?: (toolCall: ToolCall) => void
  ): void;
}

export interface NoteService {
  // Note operations
  createNote(params: {
    type: string;
    identifier: string;
    content: string;
    vaultId?: string;
  }): Promise<NoteInfo>;
  getNote(params: { identifier: string; vaultId?: string }): Promise<Note | null>;
  updateNote(params: {
    identifier: string;
    content: string;
    vaultId?: string;
    metadata?: NoteMetadata;
  }): Promise<UpdateResult>;
  deleteNote(params: { identifier: string; vaultId?: string }): Promise<DeleteNoteResult>;
  renameNote(params: {
    identifier: string;
    newIdentifier: string;
    vaultId?: string;
  }): Promise<{
    success: boolean;
    notesUpdated?: number;
    linksUpdated?: number;
    new_id?: string;
  }>;
  moveNote(params: {
    identifier: string;
    newType: string;
    vaultId?: string;
  }): Promise<MoveNoteResult>;

  // Search operations
  searchNotes(params: {
    query: string;
    vaultId?: string;
    limit?: number;
  }): Promise<SearchResult[]>;
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
  listNoteTypes(): Promise<NoteTypeListItem[]>;
  createNoteType(params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId?: string;
  }): Promise<NoteTypeInfo>;
  getNoteTypeInfo(params: {
    typeName: string;
    vaultId?: string;
  }): Promise<GetNoteTypeInfoResult>;
  updateNoteType(params: {
    typeName: string;
    description?: string;
    instructions?: string[];
    metadataSchema?: MetadataFieldDefinition[];
    vaultId?: string;
  }): Promise<NoteTypeDescription>;
  listNotesByType(params: {
    type: string;
    vaultId?: string;
    limit?: number;
  }): Promise<NoteListItem[]>;

  // Vault operations
  listVaults(): Promise<VaultInfo[]>;
  getCurrentVault(): Promise<VaultInfo | null>;
  createVault(params: {
    name: string;
    path: string;
    description?: string;
    templateId?: string;
  }): Promise<CreateVaultResult>;
  switchVault(params: { vaultId: string }): Promise<void>;
  removeVault(params: { vaultId: string }): Promise<void>;

  // Link operations
  getNoteLinks(params: { identifier: string; vaultId?: string }): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }>;
  getBacklinks(params: { identifier: string; vaultId?: string }): Promise<NoteLinkRow[]>;
  findBrokenLinks(params: { vaultId?: string }): Promise<NoteLinkRow[]>;

  // Service status
  isReady(): Promise<boolean>;
}

export interface PinnedNoteInfo {
  id: string;
  pinnedAt: string;
  order: number;
}

// Re-export types from @flint-note/server
export type {
  Note,
  NoteInfo,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem,
  NoteTypeListItem,
  NoteMetadata,
  VaultInfo,
  NoteLinkRow,
  NoteTypeInfo,
  MetadataSchema
};
