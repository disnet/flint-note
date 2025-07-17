import { FlintNoteApi } from '@flint-note/server';
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
  ApiCreateVaultResult,
  ApiNoteLinkResponse,
  ApiBacklinksResponse,
  ApiBrokenLinksResponse,
  ApiTypesResource,
  ApiRecentResource,
  ApiStatsResource,
  ApiSearchResultType,
  ApiNoteListItem
} from '@flint-note/server';
import * as path from 'path';
import * as os from 'os';
import { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

export class NoteService {
  private api: FlintNoteApi;
  private isInitialized = false;

  constructor(workspacePath?: string) {
    // Use default workspace path if not provided
    const defaultWorkspacePath = workspacePath || path.join(os.homedir(), 'flint-notes');

    this.api = new FlintNoteApi({
      workspacePath: defaultWorkspacePath,
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
      console.log('FlintNote API initialized successfully');
    } catch (error) {
      console.error('Failed to initialize FlintNote API:', error);
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
    vaultId?: string
  ): Promise<ApiCreateResult> {
    this.ensureInitialized();
    return await this.api.createSimpleNote(type, identifier, content, vaultId);
  }

  async getNote(identifier: string, vaultId?: string): Promise<ApiNoteResult> {
    this.ensureInitialized();
    return await this.api.getNote(identifier, vaultId);
  }

  async updateNote(
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<ApiUpdateResult> {
    this.ensureInitialized();
    return await this.api.updateNoteContent(identifier, content, vaultId);
  }

  async deleteNote(identifier: string, vaultId?: string): Promise<ApiDeleteNoteResult> {
    this.ensureInitialized();
    return await this.api.deleteNote({
      identifier,
      vault_id: vaultId,
      confirm: true
    });
  }

  async renameNote(
    identifier: string,
    newIdentifier: string,
    vaultId?: string
  ): Promise<ApiRenameNoteResult> {
    this.ensureInitialized();
    // Note: FlintNote API expects new_title, not new_identifier
    // This is a simplified implementation - in practice you'd need the content_hash
    return await this.api.renameNote({
      identifier,
      new_title: newIdentifier,
      content_hash: '', // TODO: Get actual content hash
      vault_id: vaultId
    });
  }

  // Search operations
  async searchNotes(
    query: string,
    vaultId?: string,
    limit?: number
  ): Promise<ApiSearchResultType> {
    this.ensureInitialized();
    return await this.api.searchNotesByText(query, vaultId, limit);
  }

  async searchNotesAdvanced(params: {
    query: string;
    type?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    vaultId?: string;
  }): Promise<ApiSearchResultType> {
    this.ensureInitialized();
    return await this.api.searchNotesAdvanced({
      type: params.type,
      content_contains: params.query,
      created_before: params.dateTo,
      created_within: params.dateFrom,
      limit: params.limit,
      vault_id: params.vaultId
    });
  }

  // Note type operations
  async listNoteTypes(vaultId?: string): Promise<ApiNoteTypeListItem[]> {
    this.ensureInitialized();
    return await this.api.listNoteTypes({ vault_id: vaultId });
  }

  async createNoteType(params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId?: string;
  }): Promise<ApiCreateNoteTypeResult> {
    this.ensureInitialized();
    return await this.api.createNoteType({
      type_name: params.typeName,
      description: params.description,
      agent_instructions: params.agentInstructions,
      metadata_schema: params.metadataSchema as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      vault_id: params.vaultId
    });
  }

  async listNotesByType(
    type: string,
    vaultId?: string,
    limit?: number
  ): Promise<ApiNoteListItem[]> {
    this.ensureInitialized();
    return await this.api.listNotesByType({
      type,
      vault_id: vaultId,
      limit
    });
  }

  // Vault operations
  async listVaults(): Promise<ApiVaultListResponse> {
    this.ensureInitialized();
    return await this.api.listVaults();
  }

  async getCurrentVault(): Promise<ApiVaultInfo> {
    this.ensureInitialized();
    return await this.api.getCurrentVault();
  }

  async createVault(
    name: string,
    path: string,
    description?: string
  ): Promise<ApiCreateVaultResult> {
    this.ensureInitialized();
    return await this.api.createVault({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      path,
      description
    });
  }

  async switchVault(vaultId: string): Promise<ApiVaultOperationResult> {
    this.ensureInitialized();
    return await this.api.switchVault({ id: vaultId });
  }

  // Link operations
  async getNoteLinks(identifier: string, vaultId?: string): Promise<ApiNoteLinkResponse> {
    this.ensureInitialized();
    return await this.api.getNoteLinks(identifier, vaultId);
  }

  async getBacklinks(
    identifier: string,
    vaultId?: string
  ): Promise<ApiBacklinksResponse> {
    this.ensureInitialized();
    return await this.api.getBacklinks(identifier, vaultId);
  }

  async findBrokenLinks(vaultId?: string): Promise<ApiBrokenLinksResponse> {
    this.ensureInitialized();
    return await this.api.findBrokenLinks(vaultId);
  }

  // Resource operations (MCP-style access)
  async getTypesResource(): Promise<ApiTypesResource> {
    this.ensureInitialized();
    return await this.api.getTypesResource();
  }

  async getRecentResource(): Promise<ApiRecentResource> {
    this.ensureInitialized();
    return await this.api.getRecentResource();
  }

  async getStatsResource(): Promise<ApiStatsResource> {
    this.ensureInitialized();
    return await this.api.getStatsResource();
  }

  // Utility methods
  isReady(): boolean {
    return this.isInitialized;
  }
}
