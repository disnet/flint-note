import type {
  ChatService,
  NoteService,
  Note,
  SearchResult,
  NoteListItem,
  NoteType,
  Vault
} from './types';

export class ElectronChatService implements ChatService, NoteService {
  async sendMessage(text: string): Promise<string> {
    try {
      return await window.api.sendMessage(text);
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
  ): Promise<any> {
    try {
      return await window.api.createNote(type, identifier, content, vaultId);
    } catch (error) {
      console.error('Failed to create note:', error);
      throw new Error('Failed to create note. Please try again.');
    }
  }

  async getNote(identifier: string, vaultId?: string): Promise<Note | null> {
    try {
      return await window.api.getNote(identifier, vaultId);
    } catch (error) {
      console.error('Failed to get note:', error);
      throw new Error('Failed to get note. Please try again.');
    }
  }

  async updateNote(identifier: string, content: string, vaultId?: string): Promise<any> {
    try {
      return await window.api.updateNote(identifier, content, vaultId);
    } catch (error) {
      console.error('Failed to update note:', error);
      throw new Error('Failed to update note. Please try again.');
    }
  }

  async deleteNote(identifier: string, vaultId?: string): Promise<any> {
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
  ): Promise<any> {
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
  ): Promise<SearchResult> {
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
  }): Promise<SearchResult> {
    try {
      return await window.api.searchNotesAdvanced(params);
    } catch (error) {
      console.error('Failed to search notes:', error);
      throw new Error('Failed to search notes. Please try again.');
    }
  }

  // Note type operations
  async listNoteTypes(vaultId?: string): Promise<NoteType[]> {
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
    metadataSchema?: any;
    vaultId?: string;
  }): Promise<any> {
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
  ): Promise<NoteListItem[]> {
    try {
      return await window.api.listNotesByType(type, vaultId, limit);
    } catch (error) {
      console.error('Failed to list notes by type:', error);
      throw new Error('Failed to list notes by type. Please try again.');
    }
  }

  // Vault operations
  async listVaults(): Promise<Vault[]> {
    try {
      return await window.api.listVaults();
    } catch (error) {
      console.error('Failed to list vaults:', error);
      throw new Error('Failed to list vaults. Please try again.');
    }
  }

  async getCurrentVault(): Promise<Vault> {
    try {
      return await window.api.getCurrentVault();
    } catch (error) {
      console.error('Failed to get current vault:', error);
      throw new Error('Failed to get current vault. Please try again.');
    }
  }

  async createVault(name: string, path: string, description?: string): Promise<any> {
    try {
      return await window.api.createVault(name, path, description);
    } catch (error) {
      console.error('Failed to create vault:', error);
      throw new Error('Failed to create vault. Please try again.');
    }
  }

  async switchVault(vaultId: string): Promise<any> {
    try {
      return await window.api.switchVault(vaultId);
    } catch (error) {
      console.error('Failed to switch vault:', error);
      throw new Error('Failed to switch vault. Please try again.');
    }
  }

  // Link operations
  async getNoteLinks(identifier: string, vaultId?: string): Promise<any> {
    try {
      return await window.api.getNoteLinks(identifier, vaultId);
    } catch (error) {
      console.error('Failed to get note links:', error);
      throw new Error('Failed to get note links. Please try again.');
    }
  }

  async getBacklinks(identifier: string, vaultId?: string): Promise<any> {
    try {
      return await window.api.getBacklinks(identifier, vaultId);
    } catch (error) {
      console.error('Failed to get backlinks:', error);
      throw new Error('Failed to get backlinks. Please try again.');
    }
  }

  async findBrokenLinks(vaultId?: string): Promise<any> {
    try {
      return await window.api.findBrokenLinks(vaultId);
    } catch (error) {
      console.error('Failed to find broken links:', error);
      throw new Error('Failed to find broken links. Please try again.');
    }
  }

  // Resource operations (MCP-style)
  async getTypesResource(): Promise<any> {
    try {
      return await window.api.getTypesResource();
    } catch (error) {
      console.error('Failed to get types resource:', error);
      throw new Error('Failed to get types resource. Please try again.');
    }
  }

  async getRecentResource(): Promise<any> {
    try {
      return await window.api.getRecentResource();
    } catch (error) {
      console.error('Failed to get recent resource:', error);
      throw new Error('Failed to get recent resource. Please try again.');
    }
  }

  async getStatsResource(): Promise<any> {
    try {
      return await window.api.getStatsResource();
    } catch (error) {
      console.error('Failed to get stats resource:', error);
      throw new Error('Failed to get stats resource. Please try again.');
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
