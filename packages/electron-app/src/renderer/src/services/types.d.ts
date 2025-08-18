import type { NoteInfo, Note, UpdateResult, DeleteNoteResult, NoteListItem, NoteTypeListItem, NoteMetadata } from '@flint-note/server';
import type { MoveNoteResult } from '@flint-note/server/dist/core/notes';
import type { SearchResult } from '@flint-note/server/dist/database/search-manager';
import type { CoreVaultInfo as VaultInfo, CoreNoteLinkRow as NoteLinkRow, CoreNoteTypeInfo as NoteTypeInfo } from '@flint-note/server/dist/api/types';
import type { ExternalLinkRow } from '@flint-note/server/dist/database/schema';
import type { MetadataFieldDefinition, MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';
import type { GetNoteTypeInfoResult } from '@flint-note/server/dist/server/types';
import type { NoteTypeDescription } from '@flint-note/server/dist/core/note-types';
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
    sendMessage(text: string, conversationId?: string, model?: string): Promise<ChatResponse>;
    sendMessageStream?(text: string, conversationId: string | undefined, onChunk: (chunk: string) => void, onComplete: (fullText: string) => void, onError: (error: string) => void, model?: string, onToolCall?: (toolCall: ToolCall) => void): void;
}
export interface NoteService {
    createNote(params: {
        type: string;
        identifier: string;
        content: string;
        vaultId?: string;
    }): Promise<NoteInfo>;
    getNote(params: {
        identifier: string;
        vaultId?: string;
    }): Promise<Note | null>;
    updateNote(params: {
        identifier: string;
        content: string;
        vaultId?: string;
        metadata?: NoteMetadata;
    }): Promise<UpdateResult>;
    deleteNote(params: {
        identifier: string;
        vaultId?: string;
    }): Promise<DeleteNoteResult>;
    renameNote(params: {
        identifier: string;
        newIdentifier: string;
        vaultId?: string;
    }): Promise<{
        success: boolean;
        notesUpdated?: number;
        linksUpdated?: number;
    }>;
    moveNote(params: {
        identifier: string;
        newType: string;
        vaultId?: string;
    }): Promise<MoveNoteResult>;
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
    listVaults(): Promise<VaultInfo[]>;
    getCurrentVault(): Promise<VaultInfo | null>;
    createVault(params: {
        name: string;
        path: string;
        description?: string;
    }): Promise<VaultInfo>;
    switchVault(params: {
        vaultId: string;
    }): Promise<void>;
    getNoteLinks(params: {
        identifier: string;
        vaultId?: string;
    }): Promise<{
        outgoing_internal: NoteLinkRow[];
        outgoing_external: ExternalLinkRow[];
        incoming: NoteLinkRow[];
    }>;
    getBacklinks(params: {
        identifier: string;
        vaultId?: string;
    }): Promise<NoteLinkRow[]>;
    findBrokenLinks(params: {
        vaultId?: string;
    }): Promise<NoteLinkRow[]>;
    isReady(): Promise<boolean>;
}
export interface PinnedNoteInfo {
    id: string;
    title: string;
    filename: string;
    pinnedAt: string;
    order: number;
}
export type { Note, NoteInfo, UpdateResult, DeleteNoteResult, NoteListItem, NoteTypeListItem, NoteMetadata, VaultInfo, NoteLinkRow, NoteTypeInfo, MetadataSchema };
