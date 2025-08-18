import type { NoteInfo, Note, UpdateResult, DeleteNoteResult, NoteListItem, NoteTypeListItem, NoteMetadata, GetNoteTypeInfoArgs } from '@flint-note/server';
import type { MoveNoteResult } from '@flint-note/server/dist/core/notes';
import type { SearchResult } from '@flint-note/server/dist/database/search-manager';
import type { CoreVaultInfo as VaultInfo, CoreNoteLinkRow as NoteLinkRow, CoreNoteTypeInfo as NoteTypeInfo } from '@flint-note/server/dist/api/types';
import type { ExternalLinkRow } from '@flint-note/server/dist/database/schema';
import type { MetadataFieldDefinition, MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';
import { GetNoteTypeInfoResult } from '@flint-note/server/dist/server/types';
import { NoteTypeDescription } from '@flint-note/server/dist/core/note-types';
export declare class NoteService {
    private api;
    private isInitialized;
    constructor();
    initialize(): Promise<void>;
    private ensureInitialized;
    createNote(type: string, identifier: string, content: string, vaultId?: string, metadata?: NoteMetadata): Promise<NoteInfo>;
    getNote(identifier: string, vaultId?: string): Promise<Note | null>;
    updateNote(identifier: string, content: string, vaultId?: string, metadata?: NoteMetadata): Promise<UpdateResult>;
    deleteNote(identifier: string, vaultId?: string): Promise<DeleteNoteResult>;
    renameNote(identifier: string, newIdentifier: string, vaultId?: string): Promise<{
        success: boolean;
        notesUpdated?: number;
        linksUpdated?: number;
    }>;
    moveNote(identifier: string, newType: string, vaultId?: string): Promise<MoveNoteResult>;
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
    listNoteTypes(): Promise<NoteTypeListItem[]>;
    createNoteType(params: {
        typeName: string;
        description: string;
        agentInstructions?: string[];
        metadataSchema?: MetadataSchema;
        vaultId?: string;
    }): Promise<NoteTypeInfo>;
    getNoteTypeInfo(args: GetNoteTypeInfoArgs): Promise<GetNoteTypeInfoResult>;
    updateNoteType(params: {
        typeName: string;
        description?: string;
        instructions?: string[];
        metadataSchema?: MetadataFieldDefinition[];
        vaultId?: string;
    }): Promise<NoteTypeDescription>;
    listNotesByType(type: string, vaultId?: string, limit?: number): Promise<NoteListItem[]>;
    listVaults(): Promise<VaultInfo[]>;
    getCurrentVault(): Promise<VaultInfo | null>;
    createVault(name: string, path: string, description?: string): Promise<VaultInfo>;
    switchVault(vaultId: string): Promise<void>;
    getNoteLinks(identifier: string, vaultId?: string): Promise<{
        outgoing_internal: NoteLinkRow[];
        outgoing_external: ExternalLinkRow[];
        incoming: NoteLinkRow[];
    }>;
    getBacklinks(identifier: string, vaultId?: string): Promise<NoteLinkRow[]>;
    findBrokenLinks(vaultId?: string): Promise<NoteLinkRow[]>;
    getAllNotes(vaultId?: string): Promise<NoteListItem[]>;
    ensureDefaultNoteType(): Promise<void>;
    isReady(): boolean;
}
