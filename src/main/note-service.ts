import { FlintNoteApi } from '../server/api';
import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem
} from '../server/core/notes';
import type { NoteTypeListItem } from '../server/core/note-types';
import type { NoteMetadata } from '../server/types';
import type { GetNoteTypeInfoArgs } from '../server/api/types.js';
import type { MoveNoteResult } from '../server/core/notes';
import type { SearchResult } from '../server/database/search-manager';
import type {
  CoreVaultInfo as VaultInfo,
  CoreNoteLinkRow as NoteLinkRow,
  CoreNoteTypeInfo as NoteTypeInfo
} from '../server/api/types';
import type { ExternalLinkRow } from '../server/database/schema';
import type {
  MetadataFieldDefinition,
  MetadataSchema
} from '../server/core/metadata-schema';
import { logger } from './logger';
import { GetNoteTypeInfoResult } from '../server/api/types.js';
import { NoteTypeDescription } from '../server/core/note-types';
import { getCurrentVaultPath } from '../server/utils/global-config.js';

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
      // Get the current vault path for initialization
      const currentVaultPath = await getCurrentVaultPath();
      if (currentVaultPath) {
        // Reinitialize API with workspace path if we have a current vault
        this.api = new FlintNoteApi({
          workspacePath: currentVaultPath,
          throwOnError: false
        });
      }

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

  private ensureVaultOpsAvailable(): void {
    // Vault operations only need the API object to exist, not full initialization
    // because they work with the global config, not workspace-specific data
  }

  // Note CRUD operations
  async createNote(
    type: string,
    identifier: string,
    content: string,
    vaultId: string,
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

  async getNote(identifier: string, vaultId: string): Promise<Note | null> {
    this.ensureInitialized();
    return await this.api.getNote(vaultId, identifier);
  }

  async updateNote(
    identifier: string,
    content: string,
    vaultId: string,
    metadata?: NoteMetadata
  ): Promise<UpdateResult> {
    this.ensureInitialized();
    // Get current note to obtain content hash
    const note = await this.api.getNote(vaultId, identifier);
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

  async deleteNote(identifier: string, vaultId: string): Promise<DeleteNoteResult> {
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
    vaultId: string
  ): Promise<{
    success: boolean;
    notesUpdated?: number;
    linksUpdated?: number;
    new_id?: string;
  }> {
    this.ensureInitialized();
    // Get the note first to obtain content hash
    const note = await this.api.getNote(vaultId, identifier);
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
    vaultId: string
  ): Promise<MoveNoteResult> {
    this.ensureInitialized();
    // Get the note first to obtain content hash
    const note = await this.api.getNote(vaultId, identifier);
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
    vaultId: string,
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
    vaultId: string;
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
  async listNoteTypes(vaultId: string): Promise<NoteTypeListItem[]> {
    this.ensureInitialized();
    return await this.api.listNoteTypes({ vault_id: vaultId });
  }

  async createNoteType(params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId: string;
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

  async getNoteTypeInfo(args: GetNoteTypeInfoArgs): Promise<GetNoteTypeInfoResult> {
    this.ensureInitialized();
    return await this.api.getNoteTypeInfo(args);
  }

  async updateNoteType(params: {
    typeName: string;
    description?: string;
    instructions?: string[];
    metadataSchema?: MetadataFieldDefinition[];
    vaultId: string;
  }): Promise<NoteTypeDescription> {
    this.ensureInitialized();
    // For now, just return what the API gives us
    return await this.api.updateNoteType({
      type_name: params.typeName,
      description: params.description,
      instructions: params.instructions,
      metadata_schema: params.metadataSchema,
      vault_id: params.vaultId
    });
  }

  async listNotesByType(
    type: string,
    vaultId: string,
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
    this.ensureVaultOpsAvailable();
    const vaults = await this.api.listVaults();
    return vaults;
  }

  async getCurrentVault(): Promise<VaultInfo | null> {
    this.ensureVaultOpsAvailable();
    return await this.api.getCurrentVault();
  }

  async createVault(
    name: string,
    path: string,
    description?: string
  ): Promise<VaultInfo> {
    this.ensureVaultOpsAvailable();
    return await this.api.createVault({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      path,
      description
    });
  }

  async switchVault(vaultId: string): Promise<void> {
    this.ensureVaultOpsAvailable();
    return await this.api.switchVault({ id: vaultId });
  }

  async removeVault(vaultId: string): Promise<void> {
    this.ensureVaultOpsAvailable();
    return await this.api.removeVault({ id: vaultId });
  }

  // Link operations
  async getNoteLinks(
    identifier: string,
    vaultId: string
  ): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }> {
    this.ensureInitialized();
    return await this.api.getNoteLinks(vaultId, identifier);
  }

  async getBacklinks(identifier: string, vaultId: string): Promise<NoteLinkRow[]> {
    this.ensureInitialized();
    return await this.api.getBacklinks(vaultId, identifier);
  }

  async findBrokenLinks(vaultId: string): Promise<NoteLinkRow[]> {
    this.ensureInitialized();
    return await this.api.findBrokenLinks(vaultId);
  }

  // Additional helper methods
  async getAllNotes(vaultId: string): Promise<NoteListItem[]> {
    this.ensureInitialized();
    return await this.api.listNotes({
      vaultId
    });
  }

  // Ensure default note type exists in a specific vault
  async ensureDefaultNoteType(vaultId: string): Promise<void> {
    this.ensureInitialized();

    try {
      logger.info(`Ensuring default 'note' type exists in vault: ${vaultId}`);

      // Check if 'note' type already exists
      const noteTypes = await this.api.listNoteTypes({ vault_id: vaultId });
      const hasNoteType = noteTypes.some((type) => type.name === 'note');

      if (!hasNoteType) {
        // Create the default 'note' type
        await this.api.createNoteType({
          type_name: 'note',
          description: 'General purpose note for unspecified content',
          agent_instructions: [
            'This is a general purpose note with no specific structure requirements.',
            "Use for any content that doesn't fit into other specific note types."
          ],
          metadata_schema: {
            fields: [
              {
                name: 'tags',
                type: 'array',
                required: false,
                description: 'Optional tags for categorizing the note'
              },
              {
                name: 'created_by',
                type: 'string',
                required: false,
                description: 'Optional field indicating who created the note'
              }
            ]
          },
          vault_id: vaultId
        });
        logger.info(`Created default 'note' type in vault: ${vaultId}`);
      } else {
        logger.debug(`Default 'note' type already exists in vault: ${vaultId}`);
      }
    } catch (error) {
      logger.error(`Failed to ensure default note type in vault ${vaultId}:`, { error });
    }
  }

  // Utility methods
  isReady(): boolean {
    return this.isInitialized;
  }
}
