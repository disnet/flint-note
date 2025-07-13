import { FlintNoteApi } from '@flint-note/server';

export interface FlintApiConfig {
  workspacePath?: string;
  throwOnError?: boolean;
}

export class FlintApiService {
  private api: FlintNoteApi | null = null;
  private isInitialized = false;
  private config: FlintApiConfig;

  constructor(config: FlintApiConfig = {}) {
    this.config = {
      workspacePath: config.workspacePath || process.env.FLINT_WORKSPACE_PATH,
      throwOnError: config.throwOnError !== false, // Default to true
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('🔧 Initializing FlintNote API service with config:', this.config);

      this.api = new FlintNoteApi(this.config);
      await this.api.initialize();

      this.isInitialized = true;
      console.log('✅ FlintNote API service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize FlintNote API service:', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.api) {
      throw new Error('FlintNote API service must be initialized before use');
    }
  }

  // Note Operations
  async getNote(identifier: string, vaultId?: string): Promise<any | null> {
    this.ensureInitialized();

    try {
      console.log(`📖 Getting note: ${identifier}`);
      const note = await this.api!.getNote(identifier, vaultId);
      console.log(`✅ Note retrieved: ${identifier}`, note ? 'found' : 'not found');
      return note || null;
    } catch (error) {
      console.error(`❌ Error getting note ${identifier}:`, error);
      if (this.config.throwOnError) {
        throw error;
      }
      return null;
    }
  }

  async createNote(args: any): Promise<any> {
    this.ensureInitialized();

    try {
      console.log('📝 Creating note(s):', args);
      const result = await this.api!.createNote(args);
      console.log('✅ Note(s) created successfully:', result);
      return result || {};
    } catch (error) {
      console.error('❌ Error creating note(s):', error);
      if (this.config.throwOnError) {
        throw error;
      }
      return undefined;
    }
  }

  async createSimpleNote(
    type: string,
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<any> {
    this.ensureInitialized();

    try {
      console.log(`📝 Creating simple note: ${type}/${identifier}`);
      const result = await this.api!.createSimpleNote(type, identifier, content, vaultId);
      console.log(`✅ Simple note created: ${type}/${identifier}`);
      return result || {};
    } catch (error) {
      console.error(`❌ Error creating simple note ${type}/${identifier}:`, error);
      if (this.config.throwOnError) {
        throw error;
      }
      return undefined;
    }
  }

  async updateNote(args: any): Promise<any> {
    this.ensureInitialized();

    try {
      console.log(`📝 Updating note: ${args.identifier}`);
      const result = await this.api!.updateNote(args);
      console.log(`✅ Note updated: ${args.identifier}`);
      return result || {};
    } catch (error) {
      console.error(`❌ Error updating note ${args.identifier}:`, error);
      if (this.config.throwOnError) {
        throw error;
      }
      return undefined;
    }
  }

  async updateNoteContent(
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<any> {
    this.ensureInitialized();

    try {
      console.log(`📝 Updating note content: ${identifier}`);
      const result = await this.api!.updateNoteContent(identifier, content, vaultId);
      console.log(`✅ Note content updated: ${identifier}`);
      return result || {};
    } catch (error) {
      console.error(`❌ Error updating note content ${identifier}:`, error);
      if (this.config.throwOnError) {
        throw error;
      }
      return undefined;
    }
  }

  async deleteNote(args: any): Promise<any> {
    this.ensureInitialized();

    try {
      console.log(`🗑️ Deleting note: ${args.identifier}`);
      const result = await this.api!.deleteNote(args);
      console.log(`✅ Note deleted: ${args.identifier}`);
      return result || {};
    } catch (error) {
      console.error(`❌ Error deleting note ${args.identifier}:`, error);
      if (this.config.throwOnError) {
        throw error;
      }
      return undefined;
    }
  }

  async getNoteInfo(args: any): Promise<any> {
    this.ensureInitialized();

    try {
      console.log(`ℹ️ Getting note info: ${args.identifier}`);
      const info = await this.api!.getNoteInfo(args);
      console.log(`✅ Note info retrieved: ${args.identifier}`);
      return info || {};
    } catch (error) {
      console.error(`❌ Error getting note info ${args.identifier}:`, error);
      if (this.config.throwOnError) {
        throw error;
      }
      return undefined;
    }
  }

  // Search Operations
  async searchNotes(
    query: string,
    options: {
      type_filter?: string;
      limit?: number;
      use_regex?: boolean;
      vaultId?: string;
      fields?: string[];
    } = {}
  ) {
    this.ensureInitialized();

    try {
      console.log(`🔍 Searching notes: "${query}"`, options);
      const result = await this.api!.searchNotes({
        query,
        type_filter: options.type_filter,
        limit: options.limit || 10,
        use_regex: options.use_regex || false,
        vault_id: options.vaultId,
        fields: options.fields
      });
      if (result && Array.isArray(result)) {
        console.log(`✅ Search completed: found ${result.length} results`);
        return result;
      } else if (result && result.notes) {
        console.log(`✅ Search completed: found ${result.notes.length} results`);
        return result;
      } else {
        console.log(`✅ Search completed: found 0 results`);
        return { notes: [] };
      }
    } catch (error) {
      console.error(`❌ Error searching notes with query "${query}":`, error);
      if (this.config.throwOnError) {
        throw error;
      }
      return { notes: [] };
    }
  }

  async searchNotesByText(query: string, vaultId?: string, limit?: number) {
    this.ensureInitialized();

    try {
      console.log(`🔍 Text search: "${query}"`);
      const result = await this.api!.searchNotesByText(query, vaultId, limit);
      console.log(
        `✅ Text search completed: found ${result?.notes?.length || 0} results`
      );
      return result || { notes: [] };
    } catch (error) {
      console.error(`❌ Error in text search "${query}":`, error);
      if (this.config.throwOnError) {
        throw error;
      }
      return { notes: [] };
    }
  }

  async searchNotesAdvanced(
    options: {
      query?: string;
      type?: string;
      metadata_filters?: Array<{
        key: string;
        value: string;
        operator?: string;
      }>;
      updated_within?: string;
      updated_before?: string;
      created_within?: string;
      created_before?: string;
      content_contains?: string;
      sort?: Array<{
        field: string;
        order: string;
      }>;
      limit?: number;
      offset?: number;
      vaultId?: string;
      fields?: string[];
    } = {}
  ) {
    this.ensureInitialized();

    try {
      console.log('🔍 Advanced search with options:', options);
      const result = await this.api!.searchNotesAdvanced({
        query: options.query,
        type: options.type,
        metadata_filters: options.metadata_filters,
        updated_within: options.updated_within,
        updated_before: options.updated_before,
        created_within: options.created_within,
        created_before: options.created_before,
        content_contains: options.content_contains,
        sort: options.sort,
        limit: options.limit || 50,
        offset: options.offset || 0,
        vault_id: options.vaultId,
        fields: options.fields
      });
      console.log(
        `✅ Advanced search completed: found ${result?.notes?.length || 0} results`
      );
      return result || { notes: [] };
    } catch (error) {
      console.error('❌ Error in advanced search:', error);
      if (this.config.throwOnError) {
        throw error;
      }
      return { notes: [] };
    }
  }

  // Vault Operations
  async getCurrentVault() {
    this.ensureInitialized();

    try {
      console.log('🏛️ Getting current vault info');
      const vault = await this.api!.getCurrentVault();
      console.log('✅ Current vault info retrieved:', vault?.name || 'unknown');
      return vault || { name: 'default', id: 'default' };
    } catch (error) {
      console.error('❌ Error getting current vault:', error);
      if (this.config.throwOnError) {
        throw error;
      }
      return { name: 'default', id: 'default' };
    }
  }

  async listVaults() {
    this.ensureInitialized();

    try {
      console.log('🏛️ Listing all vaults');
      const vaults = await this.api!.listVaults();
      console.log(`✅ Vaults listed: found ${vaults?.vaults?.length || 0} vaults`);
      return vaults || { vaults: [] };
    } catch (error) {
      console.error('❌ Error listing vaults:', error);
      if (this.config.throwOnError) {
        throw error;
      }
      return { vaults: [] };
    }
  }

  // Note Type Operations
  async listNoteTypes(vaultId?: string) {
    this.ensureInitialized();

    try {
      console.log('📋 Listing note types');
      const types = await this.api!.listNoteTypes({ vault_id: vaultId });
      console.log(`✅ Note types listed: found ${types?.length || 0} types`);
      return types || [];
    } catch (error) {
      console.error('❌ Error listing note types:', error);
      if (this.config.throwOnError) {
        throw error;
      }
      return [];
    }
  }

  // Utility methods
  isReady(): boolean {
    return this.isInitialized && this.api !== null;
  }

  async reconnect(): Promise<void> {
    console.log('🔄 Reconnecting FlintNote API service...');
    this.isInitialized = false;
    this.api = null;
    await this.initialize();
  }

  getConfig(): FlintApiConfig {
    return { ...this.config };
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const vault = await this.getCurrentVault();
      return { success: vault && vault.name !== undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const flintApiService = new FlintApiService();
