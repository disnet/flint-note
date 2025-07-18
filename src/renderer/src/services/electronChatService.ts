import type { ApiCreateResult, ApiNoteResult } from '@flint-note/server';
import type { ChatService, NoteService, ChatResponse } from './types';
import type {
  ApiBacklinksResponse,
  ApiBrokenLinksResponse,
  ApiCreateNoteTypeResult,
  ApiDeleteNoteResult,
  ApiNoteLinkResponse,
  ApiNoteListItem,
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
} from '@flint-note/server/dist/api/types';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

export class ElectronChatService implements ChatService, NoteService {
  async sendMessage(text: string): Promise<ChatResponse> {
    try {
      const response = await window.api.sendMessage(text);

      // Handle both old string format and new object format
      if (typeof response === 'string') {
        return { text: response };
      }

      return response;
    } catch (error) {
      console.error('Failed to send message via Electron API:', error);
      throw new Error('Failed to send message. Please try again.');
    }
  }

  // Note operations
  async createNote(
    type: string,
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<ApiCreateResult> {
    try {
      return await window.api.createNote(type, identifier, content, vaultId);
    } catch (error) {
      console.error('Failed to create note:', error);
      throw new Error('Failed to create note. Please try again.');
    }
  }

  async getNote(identifier: string, vaultId?: string): Promise<ApiNoteResult> {
    try {
      return await window.api.getNote(identifier, vaultId);
    } catch (error) {
      console.error('Failed to get note:', error);
      throw new Error('Failed to get note. Please try again.');
    }
  }

  async updateNote(
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<ApiUpdateResult> {
    try {
      return await window.api.updateNote(identifier, content, vaultId);
    } catch (error) {
      console.error('Failed to update note:', error);
      throw new Error('Failed to update note. Please try again.');
    }
  }

  async deleteNote(identifier: string, vaultId?: string): Promise<ApiDeleteNoteResult> {
    try {
      return await window.api.deleteNote(identifier, vaultId);
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw new Error('Failed to delete note. Please try again.');
    }
  }

  async renameNote(
    identifier: string,
    newIdentifier: string,
    vaultId?: string
  ): Promise<ApiRenameNoteResult> {
    try {
      return await window.api.renameNote(identifier, newIdentifier, vaultId);
    } catch (error) {
      console.error('Failed to rename note:', error);
      throw new Error('Failed to rename note. Please try again.');
    }
  }

  // Search operations
  async searchNotes(
    query: string,
    vaultId?: string,
    limit?: number
  ): Promise<ApiSearchResultType> {
    try {
      return await window.api.searchNotes(query, vaultId, limit);
    } catch (error) {
      console.error('Failed to search notes:', error);
      throw new Error('Failed to search notes. Please try again.');
    }
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
    try {
      return await window.api.searchNotesAdvanced(params);
    } catch (error) {
      console.error('Failed to search notes:', error);
      throw new Error('Failed to search notes. Please try again.');
    }
  }

  // Note type operations
  async listNoteTypes(vaultId?: string): Promise<ApiNoteTypeListItem[]> {
    try {
      return await window.api.listNoteTypes(vaultId);
    } catch (error) {
      console.error('Failed to list note types:', error);
      throw new Error('Failed to list note types. Please try again.');
    }
  }

  async createNoteType(params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId?: string;
  }): Promise<ApiCreateNoteTypeResult> {
    try {
      return await window.api.createNoteType(params);
    } catch (error) {
      console.error('Failed to create note type:', error);
      throw new Error('Failed to create note type. Please try again.');
    }
  }

  async listNotesByType(
    type: string,
    vaultId?: string,
    limit?: number
  ): Promise<ApiNoteListItem[]> {
    try {
      return await window.api.listNotesByType(type, vaultId, limit);
    } catch (error) {
      console.error('Failed to list notes by type:', error);
      throw new Error('Failed to list notes by type. Please try again.');
    }
  }

  // Vault operations
  async listVaults(): Promise<ApiVaultListResponse> {
    try {
      return await window.api.listVaults();
    } catch (error) {
      console.error('Failed to list vaults:', error);
      throw new Error('Failed to list vaults. Please try again.');
    }
  }

  async getCurrentVault(): Promise<ApiVaultInfo> {
    try {
      return await window.api.getCurrentVault();
    } catch (error) {
      console.error('Failed to get current vault:', error);
      throw new Error('Failed to get current vault. Please try again.');
    }
  }

  async createVault(
    name: string,
    path: string,
    description?: string
  ): Promise<ApiVaultOperationResult> {
    try {
      return await window.api.createVault(name, path, description);
    } catch (error) {
      console.error('Failed to create vault:', error);
      throw new Error('Failed to create vault. Please try again.');
    }
  }

  async switchVault(vaultId: string): Promise<ApiVaultOperationResult> {
    try {
      return await window.api.switchVault(vaultId);
    } catch (error) {
      console.error('Failed to switch vault:', error);
      throw new Error('Failed to switch vault. Please try again.');
    }
  }

  // Link operations
  async getNoteLinks(identifier: string, vaultId?: string): Promise<ApiNoteLinkResponse> {
    try {
      return await window.api.getNoteLinks(identifier, vaultId);
    } catch (error) {
      console.error('Failed to get note links:', error);
      throw new Error('Failed to get note links. Please try again.');
    }
  }

  async getBacklinks(
    identifier: string,
    vaultId?: string
  ): Promise<ApiBacklinksResponse> {
    try {
      return await window.api.getBacklinks(identifier, vaultId);
    } catch (error) {
      console.error('Failed to get backlinks:', error);
      throw new Error('Failed to get backlinks. Please try again.');
    }
  }

  async findBrokenLinks(vaultId?: string): Promise<ApiBrokenLinksResponse> {
    try {
      return await window.api.findBrokenLinks(vaultId);
    } catch (error) {
      console.error('Failed to find broken links:', error);
      throw new Error('Failed to find broken links. Please try again.');
    }
  }

  // Resource operations (MCP-style)
  async getTypesResource(): Promise<ApiTypesResource> {
    try {
      return await window.api.getTypesResource();
    } catch (error) {
      console.error('Failed to get types resource:', error);
      throw new Error('Failed to get types resource. Please try again.');
    }
  }

  async getRecentResource(): Promise<ApiRecentResource> {
    try {
      return await window.api.getRecentResource();
    } catch (error) {
      console.error('Failed to get recent resource:', error);
      throw new Error('Failed to get recent resource. Please try again.');
    }
  }

  async getStatsResource(): Promise<ApiStatsResource> {
    try {
      return await window.api.getStatsResource();
    } catch (error) {
      console.error('Failed to get stats resource:', error);
      throw new Error('Failed to get stats resource. Please try again.');
    }
  }

  // MCP resource operations
  async listMcpResources(serverName: string = 'flint-note'): Promise<unknown> {
    try {
      return await window.api.listMcpResources(serverName);
    } catch (error) {
      console.error('Failed to list MCP resources:', error);
      throw new Error('Failed to list MCP resources. Please try again.');
    }
  }

  async fetchMcpResource(uri: string): Promise<unknown> {
    try {
      return await window.api.fetchMcpResource(uri);
    } catch (error) {
      console.error('Failed to fetch MCP resource:', error);
      throw new Error('Failed to fetch MCP resource. Please try again.');
    }
  }

  // Service status
  async isReady(): Promise<boolean> {
    try {
      return await window.api.noteServiceReady();
    } catch (error) {
      console.error('Failed to check note service status:', error);
      return false;
    }
  }
}
