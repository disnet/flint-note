/**
 * Public API for FlintNote - Direct programmatic access without MCP protocol
 */

import type { ServerConfig } from '../server/types.js';
import { FlintNoteServer } from '../server.js';
import type {
  ApiNoteInfo,
  ApiNoteListItem,
  ApiCreateResult,
  ApiUpdateResult,
  ApiDeleteNoteResult,
  ApiRenameNoteResult,
  ApiBulkDeleteResult,
  ApiNoteTypeInfo,
  ApiNoteTypeListItem,
  ApiCreateNoteTypeResult,
  ApiUpdateNoteTypeResult,
  ApiDeleteNoteTypeResult,
  ApiSearchResultType,
  ApiVaultInfo,
  ApiVaultListResponse,
  ApiCreateVaultResult,
  ApiVaultOperationResult,
  ApiNoteLinkResponse,
  ApiBacklinksResponse,
  ApiBrokenLinksResponse,
  ApiLinkSearchResponse,
  ApiMigrateLinksResult,
  ApiTypesResource,
  ApiRecentResource,
  ApiStatsResource,
  ApiNoteResult,
  ApiMultipleNotesResult
} from './types.js';

/**
 * Utility function to unwrap MCP response format and return the actual data
 */
function unwrapMcpResponse<T>(mcpResponse: unknown): T {
  if (mcpResponse && typeof mcpResponse === 'object' && mcpResponse !== null) {
    const response = mcpResponse as { content?: unknown[] };
    if (response.content && Array.isArray(response.content)) {
      const firstContent = response.content[0] as { type?: string; text?: string };
      if (firstContent && firstContent.type === 'text' && firstContent.text) {
        try {
          return JSON.parse(firstContent.text) as T;
        } catch (_error) {
          // If JSON parsing fails, return the text as-is
          return firstContent.text as T;
        }
      }
    }
  }
  // If it doesn't match the expected MCP format, return as-is
  return mcpResponse as T;
}
import type {
  CreateNoteArgs,
  GetNotesArgs,
  UpdateNoteArgs,
  DeleteNoteArgs,
  RenameNoteArgs,
  GetNoteInfoArgs,
  ListNotesByTypeArgs,
  BulkDeleteNotesArgs,
  CreateNoteTypeArgs,
  ListNoteTypesArgs,
  UpdateNoteTypeArgs,
  GetNoteTypeInfoArgs,
  DeleteNoteTypeArgs,
  SearchNotesArgs,
  SearchNotesAdvancedArgs,
  SearchNotesSqlArgs,
  CreateVaultArgs,
  SwitchVaultArgs,
  RemoveVaultArgs,
  UpdateVaultArgs
} from '../server/types.js';

export interface FlintNoteApiConfig extends ServerConfig {
  // Additional API-specific configuration can be added here
  [key: string]: unknown;
}

export class FlintNoteApi {
  private server: FlintNoteServer;
  private initialized = false;

  constructor(config: FlintNoteApiConfig) {
    this.server = new FlintNoteServer(config);
  }

  /**
   * Initialize the API. Must be called before using any other methods.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.server.initialize();
    this.initialized = true;
  }

  /**
   * Ensure the API is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'FlintNoteApi must be initialized before use. Call initialize() first.'
      );
    }
  }

  // Note Operations

  /**
   * Create a new note
   */
  async createNote(args: CreateNoteArgs): Promise<ApiCreateResult> {
    this.ensureInitialized();
    const response = await this.server.noteHandlers.handleCreateNote(args);
    return unwrapMcpResponse<ApiCreateResult>(response);
  }

  /**
   * Get a note by identifier
   */
  async getNote(identifier: string, vaultId?: string): Promise<ApiNoteResult> {
    this.ensureInitialized();
    const response = await this.server.noteHandlers.handleGetNote({
      identifier,
      vault_id: vaultId
    });
    return unwrapMcpResponse<ApiNoteResult>(response);
  }

  /**
   * Get multiple notes
   */
  async getNotes(args: GetNotesArgs): Promise<ApiMultipleNotesResult> {
    this.ensureInitialized();
    const response = await this.server.noteHandlers.handleGetNotes(args);
    return unwrapMcpResponse<ApiMultipleNotesResult>(response);
  }

  /**
   * Update a note
   */
  async updateNote(args: UpdateNoteArgs): Promise<ApiUpdateResult> {
    this.ensureInitialized();
    const response = await this.server.noteHandlers.handleUpdateNote(args);
    return unwrapMcpResponse<ApiUpdateResult>(response);
  }

  /**
   * Delete a note
   */
  async deleteNote(args: DeleteNoteArgs): Promise<ApiDeleteNoteResult> {
    this.ensureInitialized();
    const response = await this.server.noteHandlers.handleDeleteNote(args);
    return unwrapMcpResponse<ApiDeleteNoteResult>(response);
  }

  /**
   * Rename a note
   */
  async renameNote(args: RenameNoteArgs): Promise<ApiRenameNoteResult> {
    this.ensureInitialized();
    const response = await this.server.noteHandlers.handleRenameNote(args);
    return unwrapMcpResponse<ApiRenameNoteResult>(response);
  }

  /**
   * Get note information
   */
  async getNoteInfo(args: GetNoteInfoArgs): Promise<ApiNoteInfo> {
    this.ensureInitialized();
    const response = await this.server.noteHandlers.handleGetNoteInfo(args);
    return unwrapMcpResponse<ApiNoteInfo>(response);
  }

  /**
   * List notes by type
   */
  async listNotesByType(args: ListNotesByTypeArgs): Promise<ApiNoteListItem[]> {
    this.ensureInitialized();
    const response = await this.server.noteHandlers.handleListNotesByType(args);
    return unwrapMcpResponse<ApiNoteListItem[]>(response);
  }

  /**
   * Bulk delete notes
   */
  async bulkDeleteNotes(args: BulkDeleteNotesArgs): Promise<ApiBulkDeleteResult> {
    this.ensureInitialized();
    const response = await this.server.noteHandlers.handleBulkDeleteNotes(args);
    return unwrapMcpResponse<ApiBulkDeleteResult>(response);
  }

  // Note Type Operations

  /**
   * Create a new note type
   */
  async createNoteType(args: CreateNoteTypeArgs): Promise<ApiCreateNoteTypeResult> {
    this.ensureInitialized();
    const response = await this.server.noteTypeHandlers.handleCreateNoteType(args);
    return unwrapMcpResponse<ApiCreateNoteTypeResult>(response);
  }

  /**
   * List all note types
   */
  async listNoteTypes(args: ListNoteTypesArgs = {}): Promise<ApiNoteTypeListItem[]> {
    this.ensureInitialized();
    const response = await this.server.noteTypeHandlers.handleListNoteTypes(args);
    return unwrapMcpResponse<ApiNoteTypeListItem[]>(response);
  }

  /**
   * Update a note type
   */
  async updateNoteType(args: UpdateNoteTypeArgs): Promise<ApiUpdateNoteTypeResult> {
    this.ensureInitialized();
    const response = await this.server.noteTypeHandlers.handleUpdateNoteType(args);
    return unwrapMcpResponse<ApiUpdateNoteTypeResult>(response);
  }

  /**
   * Get note type information
   */
  async getNoteTypeInfo(args: GetNoteTypeInfoArgs): Promise<ApiNoteTypeInfo> {
    this.ensureInitialized();
    const response = await this.server.noteTypeHandlers.handleGetNoteTypeInfo(args);
    return unwrapMcpResponse<ApiNoteTypeInfo>(response);
  }

  /**
   * Delete a note type
   */
  async deleteNoteType(args: DeleteNoteTypeArgs): Promise<ApiDeleteNoteTypeResult> {
    this.ensureInitialized();
    const response = await this.server.noteTypeHandlers.handleDeleteNoteType(args);
    return unwrapMcpResponse<ApiDeleteNoteTypeResult>(response);
  }

  // Search Operations

  /**
   * Search notes
   */
  async searchNotes(args: SearchNotesArgs): Promise<ApiSearchResultType> {
    this.ensureInitialized();
    const response = await this.server.searchHandlers.handleSearchNotes(args);
    return unwrapMcpResponse<ApiSearchResultType>(response);
  }

  /**
   * Advanced search notes
   */
  async searchNotesAdvanced(args: SearchNotesAdvancedArgs): Promise<ApiSearchResultType> {
    this.ensureInitialized();
    const response = await this.server.searchHandlers.handleSearchNotesAdvanced(args);
    return unwrapMcpResponse<ApiSearchResultType>(response);
  }

  /**
   * Search notes using SQL
   */
  async searchNotesSQL(args: SearchNotesSqlArgs): Promise<ApiSearchResultType> {
    this.ensureInitialized();
    const response = await this.server.searchHandlers.handleSearchNotesSQL(args);
    return unwrapMcpResponse<ApiSearchResultType>(response);
  }

  // Vault Operations

  /**
   * List all vaults
   */
  async listVaults(): Promise<ApiVaultListResponse> {
    this.ensureInitialized();
    const response = await this.server.vaultHandlers.handleListVaults();
    return unwrapMcpResponse<ApiVaultListResponse>(response);
  }

  /**
   * Create a new vault
   */
  async createVault(args: CreateVaultArgs): Promise<ApiCreateVaultResult> {
    this.ensureInitialized();
    const response = await this.server.vaultHandlers.handleCreateVault(args);
    return unwrapMcpResponse<ApiCreateVaultResult>(response);
  }

  /**
   * Switch to a different vault
   */
  async switchVault(args: SwitchVaultArgs): Promise<ApiVaultOperationResult> {
    this.ensureInitialized();
    const response = await this.server.vaultHandlers.handleSwitchVault(args);
    return unwrapMcpResponse<ApiVaultOperationResult>(response);
  }

  /**
   * Remove a vault
   */
  async removeVault(args: RemoveVaultArgs): Promise<ApiVaultOperationResult> {
    this.ensureInitialized();
    const response = await this.server.vaultHandlers.handleRemoveVault(args);
    return unwrapMcpResponse<ApiVaultOperationResult>(response);
  }

  /**
   * Get current vault information
   */
  async getCurrentVault(): Promise<ApiVaultInfo> {
    this.ensureInitialized();
    const response = await this.server.vaultHandlers.handleGetCurrentVault();
    return unwrapMcpResponse<ApiVaultInfo>(response);
  }

  /**
   * Update vault information
   */
  async updateVault(args: UpdateVaultArgs): Promise<ApiVaultOperationResult> {
    this.ensureInitialized();
    const response = await this.server.vaultHandlers.handleUpdateVault(args);
    return unwrapMcpResponse<ApiVaultOperationResult>(response);
  }

  // Link Operations

  /**
   * Get note links
   */
  async getNoteLinks(identifier: string, vaultId?: string): Promise<ApiNoteLinkResponse> {
    this.ensureInitialized();
    const response = await this.server.linkHandlers.handleGetNoteLinks({
      identifier,
      vault_id: vaultId
    });
    return unwrapMcpResponse<ApiNoteLinkResponse>(response);
  }

  /**
   * Get backlinks for a note
   */
  async getBacklinks(
    identifier: string,
    vaultId?: string
  ): Promise<ApiBacklinksResponse> {
    this.ensureInitialized();
    const response = await this.server.linkHandlers.handleGetBacklinks({
      identifier,
      vault_id: vaultId
    });
    return unwrapMcpResponse<ApiBacklinksResponse>(response);
  }

  /**
   * Find broken links
   */
  async findBrokenLinks(vaultId?: string): Promise<ApiBrokenLinksResponse> {
    this.ensureInitialized();
    const response = await this.server.linkHandlers.handleFindBrokenLinks({
      vault_id: vaultId
    });
    return unwrapMcpResponse<ApiBrokenLinksResponse>(response);
  }

  /**
   * Search by links
   */
  async searchByLinks(args: {
    has_links_to?: string[];
    linked_from?: string[];
    external_domains?: string[];
    broken_links?: boolean;
    vault_id?: string;
  }): Promise<ApiLinkSearchResponse> {
    this.ensureInitialized();
    const response = await this.server.linkHandlers.handleSearchByLinks(args);
    return unwrapMcpResponse<ApiLinkSearchResponse>(response);
  }

  /**
   * Migrate links
   */
  async migrateLinks(force?: boolean, vaultId?: string): Promise<ApiMigrateLinksResult> {
    this.ensureInitialized();
    const response = await this.server.linkHandlers.handleMigrateLinks({
      force,
      vault_id: vaultId
    });
    return unwrapMcpResponse<ApiMigrateLinksResult>(response);
  }

  // Resource Operations

  /**
   * Get available note types resource
   */
  async getTypesResource(): Promise<ApiTypesResource> {
    this.ensureInitialized();
    const response = await this.server.noteTypeHandlers.handleTypesResource();
    return unwrapMcpResponse<ApiTypesResource>(response);
  }

  /**
   * Get recent notes resource
   */
  async getRecentResource(): Promise<ApiRecentResource> {
    this.ensureInitialized();
    const response = await this.server.resourceHandlers.handleRecentResource();
    return unwrapMcpResponse<ApiRecentResource>(response);
  }

  /**
   * Get workspace statistics resource
   */
  async getStatsResource(): Promise<ApiStatsResource> {
    this.ensureInitialized();
    const response = await this.server.resourceHandlers.handleStatsResource();
    return unwrapMcpResponse<ApiStatsResource>(response);
  }

  // Convenience methods

  /**
   * Create a simple note with just content
   */
  async createSimpleNote(
    type: string,
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<ApiCreateResult> {
    return await this.createNote({
      notes: [
        {
          type,
          title: identifier,
          content
        }
      ],
      vault_id: vaultId
    });
  }

  /**
   * Update just the content of a note
   */
  async updateNoteContent(
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<ApiUpdateResult> {
    // Get current note to obtain content_hash
    const currentNote = await this.getNote(identifier, vaultId);

    if (!currentNote) {
      throw new Error(`Note not found: ${identifier}`);
    }

    return await this.updateNote({
      identifier,
      content,
      content_hash: currentNote.content_hash,
      vault_id: vaultId
    });
  }

  /**
   * Search notes by simple text query
   */
  async searchNotesByText(
    query: string,
    vaultId?: string,
    limit?: number
  ): Promise<ApiSearchResultType> {
    return await this.searchNotes({
      query,
      vault_id: vaultId,
      limit
    });
  }
}

// Export the main API class
export { FlintNoteApi as default };
