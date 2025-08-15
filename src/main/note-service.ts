import { FlintNoteApi } from '@flint-note/server';
import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem,
  NoteTypeListItem,
  NoteMetadata
} from '@flint-note/server';
import type { MoveNoteResult } from '@flint-note/server/dist/core/notes';
import type { SearchResult } from '@flint-note/server/dist/database/search-manager';
import type {
  CoreVaultInfo as VaultInfo,
  CoreNoteLinkRow as NoteLinkRow,
  CoreNoteTypeInfo as NoteTypeInfo
} from '@flint-note/server/dist/api/types';
import type { ExternalLinkRow } from '@flint-note/server/dist/database/schema';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';
import { logger } from './logger';

export class NoteService {
  private api: FlintNoteApi;
  private isInitialized = false;

  constructor() {
    // Use default workspace path if not provided

    this.api = new FlintNoteApi({
      throwOnError: false
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.api.initialize();
      this.isInitialized = true;
      logger.info('FlintNote API initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize FlintNote API', { error });
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('NoteService must be initialized before use');
    }
  }

  // Note CRUD operations
  async createNote(
    type: string,
    identifier: string,
    content: string,
    vaultId?: string,
    metadata?: NoteMetadata
  ): Promise<NoteInfo> {
    this.ensureInitialized();
    return await this.api.createNote({
      type,
      title: identifier,
      content,
      vaultId,
      metadata
    });
  }

  async getNote(identifier: string, vaultId?: string): Promise<Note | null> {
    this.ensureInitialized();
    return await this.api.getNote(identifier, vaultId);
  }

  async updateNote(
    identifier: string,
    content: string,
    vaultId?: string,
    metadata?: NoteMetadata
  ): Promise<UpdateResult> {
    this.ensureInitialized();
    // Get current note to obtain content hash
    const note = await this.api.getNote(identifier, vaultId);
    if (!note) {
      throw new Error('Note not found');
    }
    return await this.api.updateNote({
      identifier,
      content,
      metadata,
      contentHash: note.content_hash,
      vaultId
    });
  }

  async deleteNote(identifier: string, vaultId?: string): Promise<DeleteNoteResult> {
    this.ensureInitialized();
    return await this.api.deleteNote({
      identifier,
      confirm: true,
      vaultId
    });
  }

  async renameNote(
    identifier: string,
    newIdentifier: string,
    vaultId?: string
  ): Promise<{ success: boolean; notesUpdated?: number; linksUpdated?: number }> {
    this.ensureInitialized();
    // Get the note first to obtain content hash
    const note = await this.api.getNote(identifier, vaultId);
    if (!note) {
      throw new Error('Note not found');
    }

    return await this.api.renameNote({
      identifier,
      new_title: newIdentifier,
      content_hash: note.content_hash,
      vault_id: vaultId
    });
  }

  async moveNote(
    identifier: string,
    newType: string,
    vaultId?: string
  ): Promise<MoveNoteResult> {
    this.ensureInitialized();
    // Get the note first to obtain content hash
    const note = await this.api.getNote(identifier, vaultId);
    if (!note) {
      throw new Error('Note not found');
    }

    return await this.api.moveNote({
      identifier,
      new_type: newType,
      content_hash: note.content_hash,
      vault_id: vaultId
    });
  }

  // Search operations
  async searchNotes(
    query: string,
    vaultId?: string,
    limit?: number
  ): Promise<SearchResult[]> {
    this.ensureInitialized();
    return await this.api.searchNotesByText({
      query,
      limit,
      vaultId
    });
  }

  async searchNotesAdvanced(params: {
    query: string;
    type?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    vaultId?: string;
  }): Promise<SearchResult[]> {
    this.ensureInitialized();
    return await this.api.searchNotesAdvanced({
      content_contains: params.query,
      type: params.type,
      metadata_filters: params.tags
        ? [
            {
              key: 'tags',
              value: params.tags.join(','),
              operator: 'IN'
            }
          ]
        : undefined,
      created_within: params.dateFrom,
      created_before: params.dateTo,
      limit: params.limit,
      vault_id: params.vaultId
    });
  }

  // Note type operations
  async listNoteTypes(): Promise<NoteTypeListItem[]> {
    this.ensureInitialized();
    return await this.api.listNoteTypes();
  }

  async createNoteType(params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId?: string;
  }): Promise<NoteTypeInfo> {
    this.ensureInitialized();
    return await this.api.createNoteType({
      type_name: params.typeName,
      description: params.description,
      agent_instructions: params.agentInstructions,
      metadata_schema: params.metadataSchema,
      vault_id: params.vaultId
    });
  }

  async listNotesByType(
    type: string,
    vaultId?: string,
    limit?: number
  ): Promise<NoteListItem[]> {
    this.ensureInitialized();
    return await this.api.listNotes({
      typeName: type,
      limit,
      vaultId
    });
  }

  // Vault operations
  async listVaults(): Promise<VaultInfo[]> {
    this.ensureInitialized();
    const vaults = await this.api.listVaults();
    return vaults;
  }

  async getCurrentVault(): Promise<VaultInfo | null> {
    this.ensureInitialized();
    return await this.api.getCurrentVault();
  }

  async createVault(
    name: string,
    path: string,
    description?: string
  ): Promise<VaultInfo> {
    this.ensureInitialized();
    return await this.api.createVault({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      path,
      description
    });
  }

  async switchVault(vaultId: string): Promise<void> {
    this.ensureInitialized();
    return await this.api.switchVault({ id: vaultId });
  }

  // Link operations
  async getNoteLinks(
    identifier: string,
    vaultId?: string
  ): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }> {
    this.ensureInitialized();
    return await this.api.getNoteLinks(identifier, vaultId);
  }

  async getBacklinks(identifier: string, vaultId?: string): Promise<NoteLinkRow[]> {
    this.ensureInitialized();
    return await this.api.getBacklinks(identifier, vaultId);
  }

  async findBrokenLinks(vaultId?: string): Promise<NoteLinkRow[]> {
    this.ensureInitialized();
    return await this.api.findBrokenLinks(vaultId);
  }

  // Additional helper methods
  async getAllNotes(vaultId?: string): Promise<NoteListItem[]> {
    this.ensureInitialized();
    return await this.api.listNotes({
      vaultId
    });
  }

  // Utility methods
  isReady(): boolean {
    return this.isInitialized;
  }
}
