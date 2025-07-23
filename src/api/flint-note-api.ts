/**
 * Direct API for FlintNote - Direct manager access without MCP protocol
 * Conservative implementation using only verified manager methods
 */

import fs from 'fs/promises';
import path from 'path';
import { Workspace } from '../core/workspace.js';
import { NoteManager } from '../core/notes.js';
import { NoteTypeManager } from '../core/note-types.js';
import { HybridSearchManager } from '../database/search-manager.js';
import { GlobalConfigManager } from '../utils/global-config.js';
import type {
  ServerConfig,
  VaultContext,
  GetNotesArgs,
  GetNoteInfoArgs,
  RenameNoteArgs,
  MoveNoteArgs,
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
import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem,
  MoveNoteResult
} from '../core/notes.js';
import type { BatchUpdateResult, BatchUpdateNoteInput } from '../types/index.js';
import type {
  NoteTypeInfo,
  NoteTypeListItem,
  NoteTypeDescription
} from '../core/note-types.js';
import type { NoteMetadata, NoteTypeDeleteResult } from '../types/index.js';
import type { SearchResult } from '../database/search-manager.js';
import type { VaultInfo } from '../utils/global-config.js';
import { resolvePath, isPathSafe } from '../utils/path.js';
import { LinkExtractor } from '../core/link-extractor.js';
import type { NoteLinkRow, ExternalLinkRow, NoteRow } from '../database/schema.js';
import { generateNoteIdFromIdentifier } from '../server/server-utils.js';

export interface FlintNoteApiConfig extends ServerConfig {
  [key: string]: unknown;
}

export interface UpdateNoteOptions {
  identifier: string;
  content: string;
  contentHash: string;
  vaultId?: string;
  metadata?: NoteMetadata;
}

export interface DeleteNoteOptions {
  identifier: string;
  confirm?: boolean;
  vaultId?: string;
}

export interface ListNotesOptions {
  typeName?: string;
  limit?: number;
  vaultId?: string;
}

export interface SearchNotesByTextOptions {
  query: string;
  typeFilter?: string;
  limit?: number;
  vaultId?: string;
}

export interface CreateSingleNoteOptions {
  type: string;
  title: string;
  content: string;
  metadata?: NoteMetadata;
  vaultId?: string;
}

export interface CreateMultipleNotesOptions {
  notes: Array<{
    type: string;
    title: string;
    content: string;
    metadata?: NoteMetadata;
  }>;
  vaultId?: string;
}

export interface UpdateMultipleNotesOptions {
  notes: Array<{
    identifier: string;
    content: string;
    contentHash: string;
    metadata?: NoteMetadata;
  }>;
  vaultId?: string;
}

export class FlintNoteApi {
  private workspace!: Workspace;
  private noteManager!: NoteManager;
  private noteTypeManager!: NoteTypeManager;
  private hybridSearchManager!: HybridSearchManager;
  private globalConfig: GlobalConfigManager;
  private config: FlintNoteApiConfig;
  private initialized = false;

  constructor(config: FlintNoteApiConfig = {}) {
    this.config = config;
    this.globalConfig = new GlobalConfigManager();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load global config first
      await this.globalConfig.load();

      // If workspace path is provided explicitly, use it
      if (this.config.workspacePath) {
        const workspacePath = this.config.workspacePath;
        this.hybridSearchManager = new HybridSearchManager(workspacePath);
        this.workspace = new Workspace(
          workspacePath,
          this.hybridSearchManager.getDatabaseManager()
        );

        // Check if workspace has any note type descriptions
        const flintNoteDir = path.join(workspacePath, '.flint-note');
        let hasDescriptions = false;

        try {
          const files = await fs.readdir(flintNoteDir);
          hasDescriptions = files.some(entry => entry.endsWith('_description.md'));
        } catch {
          // .flint-note directory doesn't exist or is empty
          hasDescriptions = false;
        }

        if (!hasDescriptions) {
          // No note type descriptions found - initialize as a vault with default note types
          await this.workspace.initializeVault();
        } else {
          // Existing workspace with note types - just initialize
          await this.workspace.initialize();
        }

        this.noteManager = new NoteManager(this.workspace, this.hybridSearchManager);
        this.noteTypeManager = new NoteTypeManager(this.workspace);

        // Initialize hybrid search index - only rebuild if necessary
        try {
          const stats = await this.hybridSearchManager.getStats();
          const forceRebuild = process.env.FORCE_INDEX_REBUILD === 'true';
          const isEmptyIndex = stats.noteCount === 0;

          // Check if index exists but might be stale
          const shouldRebuild = forceRebuild || isEmptyIndex;

          if (shouldRebuild) {
            console.error('Rebuilding hybrid search index on startup...');
            await this.hybridSearchManager.rebuildIndex((processed, total) => {
              if (processed % 5 === 0 || processed === total) {
                console.error(
                  `Hybrid search index: ${processed}/${total} notes processed`
                );
              }
            });
            console.error('Hybrid search index rebuilt successfully');
          } else {
            console.error(`Hybrid search index ready (${stats.noteCount} notes indexed)`);
          }
        } catch (error) {
          console.error(
            'Warning: Failed to initialize hybrid search index on startup:',
            error
          );
        }
      } else {
        // Use the current active vault
        const currentVault = this.globalConfig.getCurrentVault();
        if (!currentVault) {
          throw new Error(
            'No workspace path provided and no active vault configured. ' +
              'Initialize a vault first or provide a workspace path.'
          );
        }

        // Initialize with current vault
        const workspacePath = currentVault.path;
        this.hybridSearchManager = new HybridSearchManager(workspacePath);
        this.workspace = new Workspace(
          workspacePath,
          this.hybridSearchManager.getDatabaseManager()
        );
        await this.workspace.initialize();

        this.noteManager = new NoteManager(this.workspace, this.hybridSearchManager);
        this.noteTypeManager = new NoteTypeManager(this.workspace);
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize FlintNoteApi:', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'FlintNoteApi must be initialized before use. Call initialize() first.'
      );
    }
  }

  async resolveVaultContext(vaultId?: string): Promise<VaultContext> {
    this.ensureInitialized();

    if (!vaultId) {
      // Use current active vault
      if (!this.noteManager || !this.noteTypeManager || !this.hybridSearchManager) {
        throw new Error('API not fully initialized');
      }
      return {
        workspace: this.workspace,
        noteManager: this.noteManager,
        noteTypeManager: this.noteTypeManager,
        hybridSearchManager: this.hybridSearchManager
      };
    }

    // Create temporary context for specified vault
    const vault = this.globalConfig.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault with ID '${vaultId}' does not exist`);
    }

    const workspacePath = vault.path;
    const hybridSearchManager = new HybridSearchManager(workspacePath);
    const workspace = new Workspace(
      workspacePath,
      hybridSearchManager.getDatabaseManager()
    );
    await workspace.initialize();

    const noteManager = new NoteManager(workspace, hybridSearchManager);
    const noteTypeManager = new NoteTypeManager(workspace);

    return {
      workspace,
      noteManager,
      noteTypeManager,
      hybridSearchManager
    };
  }

  // Utility to get current managers for convenience
  getManagers() {
    this.ensureInitialized();
    return {
      workspace: this.workspace,
      noteManager: this.noteManager,
      noteTypeManager: this.noteTypeManager,
      hybridSearchManager: this.hybridSearchManager
    };
  }

  // Core Note Operations (only verified methods)

  // Search Operations

  /**
   * Basic search for notes with optional filters
   */
  async searchNotes(args: SearchNotesArgs): Promise<SearchResult[]> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);
    const results = await hybridSearchManager.searchNotes(
      args.query,
      args.type_filter,
      args.limit,
      args.use_regex
    );
    return results;
  }

  /**
   * Advanced search for notes with structured filtering
   */
  async searchNotesAdvanced(args: SearchNotesAdvancedArgs): Promise<SearchResult[]> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);
    const response = await hybridSearchManager.searchNotesAdvanced(args);
    return response.results;
  }

  /**
   * SQL search for notes with custom queries
   */
  async searchNotesSQL(args: SearchNotesSqlArgs): Promise<SearchResult[]> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);
    const response = await hybridSearchManager.searchNotesSQL(args);
    return response.results;
  }

  /**
   * Convenience method for basic text search
   */
  async searchNotesByText(options: SearchNotesByTextOptions): Promise<SearchResult[]> {
    return await this.searchNotes({
      query: options.query,
      type_filter: options.typeFilter,
      limit: options.limit || 10,
      vault_id: options.vaultId
    });
  }

  // Note Operations

  /**
   * Create a single note - returns NoteInfo
   */
  async createNote(options: CreateSingleNoteOptions): Promise<NoteInfo> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(options.vaultId);

    return await noteManager.createNote(
      options.type,
      options.title,
      options.content,
      options.metadata || {}
    );
  }

  /**
   * Create multiple notes in batch - returns NoteInfo array
   */
  async createNotes(options: CreateMultipleNotesOptions): Promise<NoteInfo[]> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(options.vaultId);

    const result = await noteManager.batchCreateNotes(options.notes);
    // Extract successful note creations and return pure NoteInfo array
    return result.results.filter(r => r.success && r.result).map(r => r.result!);
  }

  /**
   * Get a note by identifier - returns pure Note object
   */
  async getNote(identifier: string, vaultId?: string): Promise<Note | null> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(vaultId);
    return await noteManager.getNote(identifier);
  }

  /**
   * Update a note - returns UpdateResult
   */
  async updateNote(options: UpdateNoteOptions): Promise<UpdateResult> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(options.vaultId);

    if (options.metadata) {
      return await noteManager.updateNoteWithMetadata(
        options.identifier,
        options.content,
        options.metadata,
        options.contentHash
      );
    } else {
      return await noteManager.updateNote(
        options.identifier,
        options.content,
        options.contentHash
      );
    }
  }

  /**
   * Update multiple notes in batch - returns BatchUpdateResult
   */
  async updateNotes(options: UpdateMultipleNotesOptions): Promise<BatchUpdateResult> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(options.vaultId);

    const batchUpdates: BatchUpdateNoteInput[] = options.notes.map(note => ({
      identifier: note.identifier,
      content: note.content,
      metadata: note.metadata,
      content_hash: note.contentHash
    }));

    return await noteManager.batchUpdateNotes(batchUpdates);
  }

  /**
   * Delete a note - returns DeleteNoteResult
   */
  async deleteNote(options: DeleteNoteOptions): Promise<DeleteNoteResult> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(options.vaultId);
    return await noteManager.deleteNote(options.identifier, options.confirm ?? true);
  }

  /**
   * List notes by type - returns NoteListItem array
   */
  async listNotes(options: ListNotesOptions = {}): Promise<NoteListItem[]> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(options.vaultId);
    return await noteManager.listNotes(options.typeName, options.limit);
  }

  /**
   * Get multiple notes by identifiers
   */
  async getNotes(args: GetNotesArgs): Promise<(Note | null)[]> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(args.vault_id);
    const results = await noteManager.getNotes(args.identifiers);
    // Extract notes from the success/error result structure
    return results.map(result => (result.success && result.note ? result.note : null));
  }

  /**
   * Get note metadata without full content
   */
  async getNoteInfo(args: GetNoteInfoArgs): Promise<Note | null> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(args.vault_id);

    // First try to get by exact title/filename
    let note = await noteManager.getNote(args.title_or_filename);

    if (!note && args.type) {
      // If not found and type is specified, try with type prefix
      const typeIdentifier = `${args.type}/${args.title_or_filename}`;
      note = await noteManager.getNote(typeIdentifier);
    }

    return note;
  }

  /**
   * Rename a note
   */
  async renameNote(
    args: RenameNoteArgs
  ): Promise<{ success: boolean; notesUpdated?: number; linksUpdated?: number }> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(args.vault_id);
    return await noteManager.renameNote(
      args.identifier,
      args.new_title,
      args.content_hash
    );
  }

  /**
   * Move a note from one note type to another
   */
  async moveNote(args: MoveNoteArgs): Promise<MoveNoteResult> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(args.vault_id);
    return await noteManager.moveNote(args.identifier, args.new_type, args.content_hash);
  }

  /**
   * Bulk delete notes
   */
  async bulkDeleteNotes(args: BulkDeleteNotesArgs): Promise<DeleteNoteResult[]> {
    this.ensureInitialized();
    const { noteManager } = await this.resolveVaultContext(args.vault_id);

    // Build criteria for finding notes to delete
    const criteria: Parameters<typeof noteManager.findNotesMatchingCriteria>[0] = {};

    if (args.type) {
      criteria.type = args.type;
    }
    if (args.tags) {
      criteria.tags = args.tags;
    }
    if (args.pattern) {
      criteria.pattern = args.pattern;
    }

    // Find matching notes (returns string[] of note identifiers)
    const matchingNoteIds = await noteManager.findNotesMatchingCriteria(criteria);

    // Delete each note
    const results: DeleteNoteResult[] = [];
    for (const noteId of matchingNoteIds) {
      try {
        const result = await noteManager.deleteNote(noteId, args.confirm ?? true);
        results.push(result);
      } catch (error) {
        // Create a minimal DeleteNoteResult for failed deletions
        results.push({
          id: noteId,
          deleted: false,
          timestamp: new Date().toISOString(),
          warnings: [
            `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`
          ]
        });
      }
    }

    return results;
  }

  // Note Type Operations

  /**
   * Create a new note type
   */
  async createNoteType(args: CreateNoteTypeArgs): Promise<NoteTypeInfo> {
    this.ensureInitialized();
    const { noteTypeManager } = await this.resolveVaultContext(args.vault_id);
    return await noteTypeManager.createNoteType(
      args.type_name,
      args.description,
      args.agent_instructions || null,
      args.metadata_schema || null
    );
  }

  /**
   * List all note types
   */
  async listNoteTypes(args: ListNoteTypesArgs = {}): Promise<NoteTypeListItem[]> {
    this.ensureInitialized();
    const { noteTypeManager } = await this.resolveVaultContext(args.vault_id);
    return await noteTypeManager.listNoteTypes();
  }

  /**
   * Get note type information
   */
  async getNoteTypeInfo(args: GetNoteTypeInfoArgs): Promise<NoteTypeDescription> {
    this.ensureInitialized();
    const { noteTypeManager } = await this.resolveVaultContext(args.vault_id);
    return await noteTypeManager.getNoteTypeDescription(args.type_name);
  }

  /**
   * Update a note type
   */
  async updateNoteType(args: UpdateNoteTypeArgs): Promise<NoteTypeDescription> {
    this.ensureInitialized();
    const { noteTypeManager } = await this.resolveVaultContext(args.vault_id);

    const updates: Parameters<typeof noteTypeManager.updateNoteType>[1] = {};
    if (args.description) {
      updates.description = args.description;
    }
    if (args.instructions) {
      // Convert string to array - args has string, manager expects string[]
      updates.instructions = [args.instructions];
    }
    if (args.metadata_schema) {
      // Convert array to MetadataSchema object
      updates.metadata_schema = { fields: args.metadata_schema };
    }

    return await noteTypeManager.updateNoteType(args.type_name, updates);
  }

  /**
   * Delete a note type
   */
  async deleteNoteType(args: DeleteNoteTypeArgs): Promise<NoteTypeDeleteResult> {
    this.ensureInitialized();
    const { noteTypeManager } = await this.resolveVaultContext(args.vault_id);

    return await noteTypeManager.deleteNoteType(
      args.type_name,
      args.action,
      args.target_type,
      args.confirm ?? false
    );
  }

  // Vault Operations

  /**
   * Get information about the currently active vault
   */
  async getCurrentVault(): Promise<VaultInfo | null> {
    this.ensureInitialized();

    const currentVault = this.globalConfig.getCurrentVault();
    return currentVault;
  }

  /**
   * List all configured vaults with their details
   */
  async listVaults(): Promise<VaultInfo[]> {
    this.ensureInitialized();

    const vaults = this.globalConfig.listVaults();
    return vaults.map(({ info }) => info);
  }

  /**
   * Create a new vault with optional initialization and switching
   */
  async createVault(args: CreateVaultArgs): Promise<VaultInfo> {
    this.ensureInitialized();

    // Validate vault ID
    if (!this.globalConfig.isValidVaultId(args.id)) {
      throw new Error(
        `Invalid vault ID '${args.id}'. Must contain only letters, numbers, hyphens, and underscores.`
      );
    }

    // Check if vault already exists
    if (this.globalConfig.hasVault(args.id)) {
      throw new Error(`Vault with ID '${args.id}' already exists`);
    }

    // Resolve path with tilde expansion
    const resolvedPath = resolvePath(args.path);

    // Validate path safety
    if (!isPathSafe(args.path)) {
      throw new Error(`Invalid or unsafe path: ${args.path}`);
    }

    // Ensure directory exists
    await fs.mkdir(resolvedPath, { recursive: true });

    // Add vault to registry
    await this.globalConfig.addVault(args.id, args.name, resolvedPath, args.description);

    if (args.initialize !== false) {
      // Initialize the vault with default note types
      const tempHybridSearchManager = new HybridSearchManager(resolvedPath);
      const workspace = new Workspace(
        resolvedPath,
        tempHybridSearchManager.getDatabaseManager()
      );
      await workspace.initializeVault();
    }

    if (args.switch_to !== false) {
      // Switch to the new vault
      await this.globalConfig.switchVault(args.id);

      // Reinitialize this API instance with the new vault
      this.initialized = false;
      await this.initialize();
    }

    const vault = this.globalConfig.getVault(args.id);
    if (!vault) {
      throw new Error('Failed to retrieve created vault');
    }

    return vault;
  }

  /**
   * Switch to a different vault
   */
  async switchVault(args: SwitchVaultArgs): Promise<void> {
    this.ensureInitialized();

    const vault = this.globalConfig.getVault(args.id);
    if (!vault) {
      throw new Error(`Vault with ID '${args.id}' does not exist`);
    }

    // Switch to the vault
    await this.globalConfig.switchVault(args.id);

    // Reinitialize this API instance with the new vault
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Update vault metadata (name and/or description)
   */
  async updateVault(args: UpdateVaultArgs): Promise<void> {
    this.ensureInitialized();

    const vault = this.globalConfig.getVault(args.id);
    if (!vault) {
      throw new Error(`Vault with ID '${args.id}' does not exist`);
    }

    const updates: Partial<Pick<VaultInfo, 'name' | 'description'>> = {};
    if (args.name) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;

    if (Object.keys(updates).length === 0) {
      throw new Error('No updates provided. Specify name and/or description to update.');
    }

    await this.globalConfig.updateVault(args.id, updates);
  }

  /**
   * Remove a vault from the registry (does not delete files)
   */
  async removeVault(args: RemoveVaultArgs): Promise<void> {
    this.ensureInitialized();

    const vault = this.globalConfig.getVault(args.id);
    if (!vault) {
      throw new Error(`Vault with ID '${args.id}' does not exist`);
    }

    const wasCurrentVault = this.globalConfig.getCurrentVault()?.path === vault.path;

    // Remove vault from registry
    await this.globalConfig.removeVault(args.id);

    if (wasCurrentVault) {
      // Reinitialize this API instance if we removed the current vault
      this.initialized = false;
      await this.initialize();
    }
  }

  // Link Operations

  /**
   * Get all links for a specific note (outgoing and incoming)
   */
  async getNoteLinks(
    identifier: string,
    vaultId?: string
  ): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.resolveVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();
    const noteId = generateNoteIdFromIdentifier(identifier);

    // Check if note exists
    const note = await db.get('SELECT id FROM notes WHERE id = ?', [noteId]);
    if (!note) {
      throw new Error(`Note not found: ${identifier}`);
    }

    return await LinkExtractor.getLinksForNote(noteId, db);
  }

  /**
   * Get all notes that link to the specified note (backlinks)
   */
  async getBacklinks(identifier: string, vaultId?: string): Promise<NoteLinkRow[]> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.resolveVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();
    const noteId = generateNoteIdFromIdentifier(identifier);

    // Check if note exists
    const note = await db.get('SELECT id FROM notes WHERE id = ?', [noteId]);
    if (!note) {
      throw new Error(`Note not found: ${identifier}`);
    }

    return await LinkExtractor.getBacklinks(noteId, db);
  }

  /**
   * Find all broken wikilinks (links to non-existent notes)
   */
  async findBrokenLinks(vaultId?: string): Promise<NoteLinkRow[]> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.resolveVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    return await LinkExtractor.findBrokenLinks(db);
  }

  /**
   * Search for notes based on their link relationships
   */
  async searchByLinks(args: {
    has_links_to?: string[];
    linked_from?: string[];
    external_domains?: string[];
    broken_links?: boolean;
    vault_id?: string;
  }): Promise<NoteRow[]> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();

    let notes: NoteRow[] = [];

    // Handle different search criteria
    if (args.has_links_to && args.has_links_to.length > 0) {
      // Find notes that link to any of the specified notes
      const targetIds = args.has_links_to.map(id => generateNoteIdFromIdentifier(id));
      const placeholders = targetIds.map(() => '?').join(',');
      notes = await db.all(
        `SELECT DISTINCT n.* FROM notes n
         INNER JOIN note_links nl ON n.id = nl.source_note_id
         WHERE nl.target_note_id IN (${placeholders})`,
        targetIds
      );
    } else if (args.linked_from && args.linked_from.length > 0) {
      // Find notes that are linked from any of the specified notes
      const sourceIds = args.linked_from.map(id => generateNoteIdFromIdentifier(id));
      const placeholders = sourceIds.map(() => '?').join(',');
      notes = await db.all(
        `SELECT DISTINCT n.* FROM notes n
         INNER JOIN note_links nl ON n.id = nl.target_note_id
         WHERE nl.source_note_id IN (${placeholders})`,
        sourceIds
      );
    } else if (args.external_domains && args.external_domains.length > 0) {
      // Find notes with external links to specified domains
      const domainConditions = args.external_domains
        .map(() => 'el.url LIKE ?')
        .join(' OR ');
      const domainParams = args.external_domains.map(domain => `%${domain}%`);
      notes = await db.all(
        `SELECT DISTINCT n.* FROM notes n
         INNER JOIN external_links el ON n.id = el.note_id
         WHERE ${domainConditions}`,
        domainParams
      );
    } else if (args.broken_links) {
      // Find notes with broken internal links
      notes = await db.all(
        `SELECT DISTINCT n.* FROM notes n
         INNER JOIN note_links nl ON n.id = nl.source_note_id
         WHERE nl.target_note_id IS NULL`
      );
    }

    return notes;
  }

  /**
   * Scan all existing notes and populate the link tables (one-time migration)
   */
  async migrateLinks(
    force?: boolean,
    vaultId?: string
  ): Promise<{
    total_notes: number;
    processed: number;
    errors: number;
    error_details?: string[];
  }> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.resolveVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    // Check if migration is needed
    if (!force) {
      const existingLinks = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM note_links'
      );
      if (existingLinks && existingLinks.count > 0) {
        throw new Error(
          `Link tables already contain data. Use force=true to migrate anyway. Existing links: ${existingLinks.count}`
        );
      }
    }

    // Get all notes from the database
    const notes = await db.all<{ id: string; content: string }>(
      'SELECT id, content FROM notes'
    );
    let processedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const note of notes) {
      try {
        // Extract links from note content
        const extractionResult = LinkExtractor.extractLinks(note.content);

        // Store the extracted links
        await LinkExtractor.storeLinks(note.id, extractionResult, db);
        processedCount++;
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${note.id}: ${errorMessage}`);
      }
    }

    return {
      total_notes: notes.length,
      processed: processedCount,
      errors: errorCount,
      error_details: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit error details to first 10
    };
  }
}
