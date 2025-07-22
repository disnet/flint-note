import type { ChatService, NoteService, ChatResponse } from './types';
import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem,
  NoteTypeListItem,
  NoteMetadata
} from '@flint-note/server';
import type { SearchResult } from '@flint-note/server/dist/database/search-manager';
import type {
  CoreVaultInfo as VaultInfo,
  CoreNoteLinkRow as NoteLinkRow,
  CoreNoteTypeInfo as NoteTypeInfo
} from '@flint-note/server/dist/api/types';
import type { ExternalLinkRow } from '@flint-note/server/dist/database/schema';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

export class ElectronChatService implements ChatService, NoteService {
  async sendMessage(text: string, model?: string): Promise<ChatResponse> {
    try {
      const response = await window.api.sendMessage({ message: text, model });

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

  sendMessageStream(
    text: string,
    onChunk: (chunk: string) => void,
    onComplete: (fullText: string) => void,
    onError: (error: string) => void,
    model?: string,
    onToolCall?: (toolCall: any) => void
  ): void {
    const requestId = crypto.randomUUID();

    window.api.sendMessageStream(
      { message: text, model, requestId },
      (data) => {
        // Stream started
        console.log('Stream started:', data.requestId);
      },
      (data) => {
        // Handle text chunk
        if (data.requestId === requestId) {
          onChunk(data.chunk);
        }
      },
      (data) => {
        // Stream ended
        if (data.requestId === requestId) {
          onComplete(data.fullText);
        }
      },
      (data) => {
        // Stream error
        if (data.requestId === requestId) {
          onError(data.error);
        }
      },
      onToolCall
        ? (data) => {
            // Handle tool call
            if (data.requestId === requestId) {
              onToolCall(data.toolCall);
            }
          }
        : undefined
    );
  }

  // Note operations
  async createNote(params: {
    type: string;
    identifier: string;
    content: string;
    vaultId?: string;
  }): Promise<NoteInfo> {
    const { type, identifier, content, vaultId } = params;
    try {
      return await window.api.createNote({ type, identifier, content, vaultId });
    } catch (error) {
      console.error('Failed to create note:', error);
      throw new Error('Failed to create note. Please try again.');
    }
  }

  async getNote(params: { identifier: string; vaultId?: string }): Promise<Note | null> {
    const { identifier, vaultId } = params;
    try {
      return await window.api.getNote({ identifier, vaultId });
    } catch (error) {
      console.error('Failed to get note:', error);
      throw new Error('Failed to get note. Please try again.');
    }
  }

  async updateNote(params: {
    identifier: string;
    content: string;
    vaultId?: string;
    metadata?: NoteMetadata;
  }): Promise<UpdateResult> {
    const { identifier, content, vaultId } = params;
    try {
      return await window.api.updateNote({ identifier, content, vaultId });
    } catch (error) {
      console.error('Failed to update note:', error);
      throw new Error('Failed to update note. Please try again.');
    }
  }

  async deleteNote(params: {
    identifier: string;
    vaultId?: string;
  }): Promise<DeleteNoteResult> {
    const { identifier, vaultId } = params;
    try {
      return await window.api.deleteNote({ identifier, vaultId });
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw new Error('Failed to delete note. Please try again.');
    }
  }

  async renameNote(params: {
    identifier: string;
    newIdentifier: string;
    vaultId?: string;
  }): Promise<{ success: boolean; notesUpdated?: number; linksUpdated?: number }> {
    const { identifier, newIdentifier, vaultId } = params;
    try {
      return await window.api.renameNote({ identifier, newIdentifier, vaultId });
    } catch (error) {
      console.error('Failed to rename note:', error);
      throw new Error('Failed to rename note. Please try again.');
    }
  }

  // Search operations
  async searchNotes(params: {
    query: string;
    vaultId?: string;
    limit?: number;
  }): Promise<SearchResult[]> {
    const { query, vaultId, limit } = params;
    try {
      return await window.api.searchNotes({ query, vaultId, limit });
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
  }): Promise<SearchResult[]> {
    try {
      return await window.api.searchNotesAdvanced(params);
    } catch (error) {
      console.error('Failed to search notes:', error);
      throw new Error('Failed to search notes. Please try again.');
    }
  }

  // Note type operations
  async listNoteTypes(): Promise<NoteTypeListItem[]> {
    try {
      return await window.api.listNoteTypes();
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
  }): Promise<NoteTypeInfo> {
    try {
      return await window.api.createNoteType(params);
    } catch (error) {
      console.error('Failed to create note type:', error);
      throw new Error('Failed to create note type. Please try again.');
    }
  }

  async listNotesByType(params: {
    type: string;
    vaultId?: string;
    limit?: number;
  }): Promise<NoteListItem[]> {
    const { type, vaultId, limit } = params;
    try {
      return await window.api.listNotesByType({ type, vaultId, limit });
    } catch (error) {
      console.error('Failed to list notes by type:', error);
      throw new Error('Failed to list notes by type. Please try again.');
    }
  }

  // Vault operations
  async listVaults(): Promise<VaultInfo[]> {
    try {
      return await window.api.listVaults();
    } catch (error) {
      console.error('Failed to list vaults:', error);
      throw new Error('Failed to list vaults. Please try again.');
    }
  }

  async getCurrentVault(): Promise<VaultInfo | null> {
    try {
      return await window.api.getCurrentVault();
    } catch (error) {
      console.error('Failed to get current vault:', error);
      throw new Error('Failed to get current vault. Please try again.');
    }
  }

  async createVault(params: {
    name: string;
    path: string;
    description?: string;
  }): Promise<VaultInfo> {
    const { name, path, description } = params;
    try {
      return await window.api.createVault({ name, path, description });
    } catch (error) {
      console.error('Failed to create vault:', error);
      throw new Error('Failed to create vault. Please try again.');
    }
  }

  async switchVault(params: { vaultId: string }): Promise<void> {
    const { vaultId } = params;
    try {
      return await window.api.switchVault({ vaultId });
    } catch (error) {
      console.error('Failed to switch vault:', error);
      throw new Error('Failed to switch vault. Please try again.');
    }
  }

  // Link operations
  async getNoteLinks(params: { identifier: string; vaultId?: string }): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }> {
    const { identifier, vaultId } = params;
    try {
      return await window.api.getNoteLinks({ identifier, vaultId });
    } catch (error) {
      console.error('Failed to get note links:', error);
      throw new Error('Failed to get note links. Please try again.');
    }
  }

  async getBacklinks(params: {
    identifier: string;
    vaultId?: string;
  }): Promise<NoteLinkRow[]> {
    const { identifier, vaultId } = params;
    try {
      return await window.api.getBacklinks({ identifier, vaultId });
    } catch (error) {
      console.error('Failed to get backlinks:', error);
      throw new Error('Failed to get backlinks. Please try again.');
    }
  }

  async findBrokenLinks(params: { vaultId?: string }): Promise<NoteLinkRow[]> {
    const { vaultId } = params;
    try {
      return await window.api.findBrokenLinks({ vaultId });
    } catch (error) {
      console.error('Failed to find broken links:', error);
      throw new Error('Failed to find broken links. Please try again.');
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
