/**
 * Direct API for FlintNote - Direct manager access
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
  GetNoteInfoArgs,
  RenameNoteArgs,
  MoveNoteArgs,
  CreateNoteTypeArgs,
  ListNoteTypesArgs,
  GetNoteTypeInfoArgs,
  GetNoteTypeInfoResult,
  DeleteNoteTypeArgs,
  SearchNotesArgs,
  SearchNotesAdvancedArgs,
  SearchNotesSqlArgs,
  CreateVaultArgs,
  SwitchVaultArgs,
  RemoveVaultArgs,
  UpdateVaultArgs,
  AddSubnoteArgs,
  RemoveSubnoteArgs,
  ReorderSubnotesArgs,
  GetHierarchyPathArgs,
  GetDescendantsArgs,
  GetChildrenArgs,
  GetParentsArgs,
  HierarchyOperationResult
} from './types.js';
import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem,
  MoveNoteResult
} from '../core/notes.js';
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
import { generateNoteIdFromIdentifier } from '../utils/note-linking.js';
import { handleIndexRebuild } from '../database/search-manager.js';
import { logInitialization } from '../utils/config.js';
import type { MetadataFieldDefinition } from '../core/metadata-schema.js';
import { HierarchyManager } from '../core/hierarchy.js';
import type { NoteHierarchyRow } from '../database/schema.js';
import { RelationshipManager } from '../core/relationship-manager.js';
import type { NoteRelationships } from '../core/relationship-manager.js';

export interface FlintNoteApiConfig extends ServerConfig {
  [key: string]: unknown;
}

export interface UpdateNoteOptions {
  identifier: string;
  content: string;
  contentHash: string;
  vaultId: string;
  metadata?: NoteMetadata;
}

export interface DeleteNoteOptions {
  identifier: string;
  confirm?: boolean;
  vaultId: string;
}

export interface ListNotesOptions {
  typeName?: string;
  limit?: number;
  vaultId: string;
}

export interface SearchNotesByTextOptions {
  query: string;
  typeFilter?: string;
  limit?: number;
  vaultId: string;
}

export interface CreateSingleNoteOptions {
  type: string;
  title: string;
  content: string;
  metadata?: NoteMetadata;
  vaultId: string;
}

export class FlintNoteApi {
  private workspace!: Workspace;
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
          hasDescriptions = files.some((entry) => entry.endsWith('_description.md'));
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

        // Initialize hybrid search index - only rebuild if necessary
        const stats = await this.hybridSearchManager.getStats();
        const forceRebuild = process.env.FORCE_INDEX_REBUILD === 'true';
        const isEmptyIndex = stats.noteCount === 0;

        // Check if index exists but might be stale
        const shouldRebuild = forceRebuild || isEmptyIndex;

        await handleIndexRebuild(
          this.hybridSearchManager,
          shouldRebuild,
          logInitialization
        );
      } else {
        throw new Error(
          'No workspace path provided in config. ' +
            'FlintNoteApi requires explicit workspace path configuration.'
        );
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

  async getVaultContext(vaultId: string): Promise<VaultContext> {
    this.ensureInitialized();

    // Create context for specified vault
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

  // Core Note Operations (only verified methods)

  // Search Operations

  /**
   * Basic search for notes with optional filters
   */
  async searchNotes(args: SearchNotesArgs): Promise<SearchResult[]> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
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
    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const response = await hybridSearchManager.searchNotesAdvanced(args);
    return response.results;
  }

  /**
   * SQL search for notes with custom queries
   */
  async searchNotesSQL(args: SearchNotesSqlArgs): Promise<SearchResult[]> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
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
   * Create a single note with optional required field validation
   */
  async createNote(
    options: CreateSingleNoteOptions & { enforceRequiredFields?: boolean }
  ): Promise<NoteInfo> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(options.vaultId);

    return await noteManager.createNote(
      options.type,
      options.title,
      options.content,
      options.metadata || {},
      options.enforceRequiredFields ?? false
    );
  }

  /**
   * Get a note by identifier - returns pure Note object
   */
  async getNote(vaultId: string, identifier: string): Promise<Note | null> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(vaultId);
    return await noteManager.getNote(identifier);
  }

  /**
   * Update a note - returns UpdateResult
   */
  async updateNote(options: UpdateNoteOptions): Promise<UpdateResult> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(options.vaultId);

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
   * Delete a note - returns DeleteNoteResult
   */
  async deleteNote(options: DeleteNoteOptions): Promise<DeleteNoteResult> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(options.vaultId);
    return await noteManager.deleteNote(options.identifier, options.confirm ?? true);
  }

  /**
   * List notes by type - returns NoteListItem array
   */
  async listNotes(options: ListNotesOptions): Promise<NoteListItem[]> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(options.vaultId);
    return await noteManager.listNotes(options.typeName, options.limit);
  }

  /**
   * Get note metadata without full content
   */
  async getNoteInfo(args: GetNoteInfoArgs & { vault_id: string }): Promise<Note | null> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(args.vault_id);

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
  async renameNote(args: RenameNoteArgs & { vault_id: string }): Promise<{
    success: boolean;
    notesUpdated?: number;
    linksUpdated?: number;
    new_id?: string;
  }> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(args.vault_id);
    return await noteManager.renameNoteWithFile(
      args.noteId,
      args.newTitle,
      args.contentHash
    );
  }

  /**
   * Move a note from one note type to another
   */
  async moveNote(args: MoveNoteArgs & { vault_id: string }): Promise<MoveNoteResult> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(args.vault_id);
    return await noteManager.moveNote(args.noteId, args.newType, args.contentHash);
  }

  // Note Type Operations

  /**
   * Create a new note type
   */
  async createNoteType(
    args: CreateNoteTypeArgs & { vault_id: string }
  ): Promise<NoteTypeInfo> {
    this.ensureInitialized();
    const { noteTypeManager } = await this.getVaultContext(args.vault_id);
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
  async listNoteTypes(
    args: ListNoteTypesArgs & { vault_id: string }
  ): Promise<NoteTypeListItem[]> {
    this.ensureInitialized();
    const { noteTypeManager } = await this.getVaultContext(args.vault_id);
    return await noteTypeManager.listNoteTypes();
  }

  /**
   * Get note type information
   */
  async getNoteTypeInfo(
    args: GetNoteTypeInfoArgs & { vault_id: string }
  ): Promise<GetNoteTypeInfoResult> {
    this.ensureInitialized();
    const { noteTypeManager } = await this.getVaultContext(args.vault_id);
    const desc = await noteTypeManager.getNoteTypeDescription(args.type_name);
    return {
      name: desc.name,
      purpose: desc.parsed.purpose,
      path: desc.path,
      instructions: desc.parsed.agentInstructions,
      metadata_schema: desc.metadataSchema,
      content_hash: desc.content_hash
    };
  }

  /**
   * Update a note type
   */
  async updateNoteType(args: {
    type_name: string;
    description?: string;
    instructions?: string[];
    metadata_schema?: MetadataFieldDefinition[];
    vault_id: string;
  }): Promise<NoteTypeDescription> {
    this.ensureInitialized();
    const { noteTypeManager } = await this.getVaultContext(args.vault_id);

    const updates: Parameters<typeof noteTypeManager.updateNoteType>[1] = {};
    if (args.description) {
      updates.description = args.description;
    }
    if (args.instructions) {
      updates.instructions = args.instructions;
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
  async deleteNoteType(
    args: DeleteNoteTypeArgs & { vault_id: string }
  ): Promise<NoteTypeDeleteResult> {
    this.ensureInitialized();
    const { noteTypeManager } = await this.getVaultContext(args.vault_id);

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
    // Only need globalConfig, not full workspace initialization
    const currentVault = this.globalConfig.getCurrentVault();
    return currentVault;
  }

  /**
   * List all configured vaults with their details
   */
  async listVaults(): Promise<VaultInfo[]> {
    // Only need globalConfig, not full workspace initialization
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
    // Only need globalConfig, not full workspace initialization
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
    vaultId: string,
    identifier: string
  ): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(vaultId);
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
  async getBacklinks(vaultId: string, identifier: string): Promise<NoteLinkRow[]> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(vaultId);
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
  async findBrokenLinks(vaultId: string): Promise<NoteLinkRow[]> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(vaultId);
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
    vault_id: string;
  }): Promise<NoteRow[]> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();

    let notes: NoteRow[] = [];

    // Handle different search criteria
    if (args.has_links_to && args.has_links_to.length > 0) {
      // Find notes that link to any of the specified notes
      const targetIds = args.has_links_to.map((id) => generateNoteIdFromIdentifier(id));
      const placeholders = targetIds.map(() => '?').join(',');
      notes = await db.all(
        `SELECT DISTINCT n.* FROM notes n
         INNER JOIN note_links nl ON n.id = nl.source_note_id
         WHERE nl.target_note_id IN (${placeholders})`,
        targetIds
      );
    } else if (args.linked_from && args.linked_from.length > 0) {
      // Find notes that are linked from any of the specified notes
      const sourceIds = args.linked_from.map((id) => generateNoteIdFromIdentifier(id));
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
      const domainParams = args.external_domains.map((domain) => `%${domain}%`);
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
    vaultId: string,
    force?: boolean
  ): Promise<{
    total_notes: number;
    processed: number;
    errors: number;
    error_details?: string[];
  }> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(vaultId);
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

  // Hierarchy Operations

  /**
   * Add a parent-child relationship between two notes
   */
  async addSubnote(args: AddSubnoteArgs): Promise<HierarchyOperationResult> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const hierarchyManager = new HierarchyManager(db);

    // Convert identifiers to note IDs
    const parentId = generateNoteIdFromIdentifier(args.parent_id);
    const childId = generateNoteIdFromIdentifier(args.child_id);

    // Verify both notes exist
    const parentExists = await db.get('SELECT id FROM notes WHERE id = ?', [parentId]);
    const childExists = await db.get('SELECT id FROM notes WHERE id = ?', [childId]);

    if (!parentExists) {
      return {
        success: false,
        parentId: args.parent_id,
        childId: args.child_id,
        operation: 'add',
        timestamp: new Date().toISOString(),
        hierarchyUpdated: false,
        error: `Parent note not found: ${args.parent_id}`
      };
    }

    if (!childExists) {
      return {
        success: false,
        parentId: args.parent_id,
        childId: args.child_id,
        operation: 'add',
        timestamp: new Date().toISOString(),
        hierarchyUpdated: false,
        error: `Child note not found: ${args.child_id}`
      };
    }

    const result = await hierarchyManager.addSubnote(parentId, childId, args.position);

    // If the hierarchy operation was successful, sync changes back to parent note frontmatter
    if (result.success) {
      try {
        await this.syncHierarchyToFrontmatter(
          args.vault_id,
          args.parent_id,
          hierarchyManager,
          hybridSearchManager
        );
      } catch (syncError) {
        // Log the sync error but don't fail the operation
        console.warn('Failed to sync hierarchy changes to frontmatter:', syncError);
      }
    }

    return result;
  }

  /**
   * Remove a parent-child relationship
   */
  async removeSubnote(args: RemoveSubnoteArgs): Promise<HierarchyOperationResult> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const hierarchyManager = new HierarchyManager(db);

    // Convert identifiers to note IDs
    const parentId = generateNoteIdFromIdentifier(args.parent_id);
    const childId = generateNoteIdFromIdentifier(args.child_id);

    const result = await hierarchyManager.removeSubnote(parentId, childId);

    // If the hierarchy operation was successful, sync changes back to parent note frontmatter
    if (result.success) {
      try {
        await this.syncHierarchyToFrontmatter(
          args.vault_id,
          args.parent_id,
          hierarchyManager,
          hybridSearchManager
        );
      } catch (syncError) {
        // Log the sync error but don't fail the operation
        console.warn('Failed to sync hierarchy changes to frontmatter:', syncError);
      }
    }

    return result;
  }

  /**
   * Reorder subnotes within a parent
   */
  async reorderSubnotes(args: ReorderSubnotesArgs): Promise<HierarchyOperationResult> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const hierarchyManager = new HierarchyManager(db);

    // Convert identifiers to note IDs
    const parentId = generateNoteIdFromIdentifier(args.parent_id);
    const childIds = args.child_ids.map((id) => generateNoteIdFromIdentifier(id));

    const result = await hierarchyManager.reorderSubnotes(parentId, childIds);

    // If the hierarchy operation was successful, sync changes back to parent note frontmatter
    if (result.success) {
      try {
        await this.syncHierarchyToFrontmatter(
          args.vault_id,
          args.parent_id,
          hierarchyManager,
          hybridSearchManager
        );
      } catch (syncError) {
        // Log the sync error but don't fail the operation
        console.warn('Failed to sync hierarchy changes to frontmatter:', syncError);
      }
    }

    return result;
  }

  /**
   * Sync hierarchy changes to note frontmatter
   */
  private async syncHierarchyToFrontmatter(
    vaultId: string,
    noteIdentifier: string,
    hierarchyManager: HierarchyManager,
    hybridSearchManager: HybridSearchManager
  ): Promise<void> {
    const { noteManager } = await this.getVaultContext(vaultId);

    // Get current hierarchy children
    const noteId = generateNoteIdFromIdentifier(noteIdentifier);
    const children = await hierarchyManager.getChildren(noteId);

    // Convert child IDs back to identifiers
    const subnotes: string[] = [];
    const db = await hybridSearchManager.getDatabaseConnection();

    for (const child of children) {
      const note = await db.get<{ title: string; type: string }>(
        'SELECT title, type FROM notes WHERE id = ?',
        [child.child_id]
      );
      if (note) {
        subnotes.push(`${note.type}/${note.title}`);
      }
    }

    // Get current note and update its frontmatter
    const currentNote = await noteManager.getNote(noteIdentifier);
    if (!currentNote) {
      console.warn(`Note not found when syncing hierarchy: ${noteIdentifier}`);
      return;
    }

    // Create metadata object excluding protected fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { type, title, filename, created, updated, ...userMetadata } =
      currentNote.metadata;
    const updatedMetadata = { ...userMetadata };

    if (subnotes.length > 0) {
      updatedMetadata.subnotes = subnotes;
    } else {
      // Explicitly set to undefined to override existing value during merge
      (updatedMetadata as Record<string, unknown>).subnotes = undefined;
    }

    await noteManager.updateNoteWithMetadata(
      noteIdentifier,
      currentNote.content,
      updatedMetadata,
      currentNote.content_hash
    );
  }

  /**
   * Get the hierarchy path from root to the specified note
   */
  async getHierarchyPath(args: GetHierarchyPathArgs): Promise<string[]> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const hierarchyManager = new HierarchyManager(db);

    const noteId = generateNoteIdFromIdentifier(args.note_id);
    const path = await hierarchyManager.getHierarchyPath(noteId);

    // Convert note IDs back to identifiers for the response
    const identifierPath: string[] = [];
    for (const id of path) {
      const note = await db.get<{ title: string; type: string }>(
        'SELECT title, type FROM notes WHERE id = ?',
        [id]
      );
      if (note) {
        identifierPath.push(`${note.type}/${note.title}`);
      }
    }

    return identifierPath;
  }

  /**
   * Get all descendant notes up to specified depth
   */
  async getDescendants(args: GetDescendantsArgs): Promise<NoteHierarchyRow[]> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const hierarchyManager = new HierarchyManager(db);

    const noteId = generateNoteIdFromIdentifier(args.note_id);
    return await hierarchyManager.getDescendants(noteId, args.max_depth);
  }

  /**
   * Get direct children of a note
   */
  async getChildren(args: GetChildrenArgs): Promise<NoteHierarchyRow[]> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const hierarchyManager = new HierarchyManager(db);

    const noteId = generateNoteIdFromIdentifier(args.note_id);
    return await hierarchyManager.getChildren(noteId);
  }

  /**
   * Get direct parents of a note
   */
  async getParents(args: GetParentsArgs): Promise<NoteHierarchyRow[]> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const hierarchyManager = new HierarchyManager(db);

    const noteId = generateNoteIdFromIdentifier(args.note_id);
    return await hierarchyManager.getParents(noteId);
  }

  // Relationship Analysis Operations

  /**
   * Get comprehensive relationships for a note (content + hierarchy)
   */
  async getNoteRelationships(args: {
    note_id: string;
    vault_id: string;
  }): Promise<NoteRelationships> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const relationshipManager = new RelationshipManager(db);

    const noteId = generateNoteIdFromIdentifier(args.note_id);
    return await relationshipManager.getNoteRelationships(noteId);
  }

  /**
   * Find notes related to the given note, ranked by relationship strength
   */
  async getRelatedNotes(args: {
    note_id: string;
    vault_id: string;
    max_results?: number;
  }): Promise<Array<{ noteId: string; strength: number; relationship_types: string[] }>> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const relationshipManager = new RelationshipManager(db);

    const noteId = generateNoteIdFromIdentifier(args.note_id);
    return await relationshipManager.getRelatedNotes(noteId, args.max_results);
  }

  /**
   * Find relationship path between two notes
   */
  async findRelationshipPath(args: {
    start_note_id: string;
    end_note_id: string;
    vault_id: string;
    max_depth?: number;
  }): Promise<Array<{ noteId: string; relationship: string }> | null> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const relationshipManager = new RelationshipManager(db);

    const startNoteId = generateNoteIdFromIdentifier(args.start_note_id);
    const endNoteId = generateNoteIdFromIdentifier(args.end_note_id);

    return await relationshipManager.findRelationshipPath(
      startNoteId,
      endNoteId,
      args.max_depth
    );
  }

  /**
   * Get clustering coefficient for a note
   */
  async getClusteringCoefficient(args: {
    note_id: string;
    vault_id: string;
  }): Promise<number> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const relationshipManager = new RelationshipManager(db);

    const noteId = generateNoteIdFromIdentifier(args.note_id);
    return await relationshipManager.getClusteringCoefficient(noteId);
  }

  /**
   * Cleanup resources and close database connections
   * Call this when the API instance is no longer needed
   */
  async cleanup(): Promise<void> {
    if (this.hybridSearchManager) {
      try {
        await this.hybridSearchManager.close();
      } catch (error) {
        console.warn('Error closing hybrid search manager:', error);
      }
    }
    this.initialized = false;
  }
}
