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

        let isNewVault = false;
        if (!hasDescriptions) {
          // No note type descriptions found - initialize as a vault with default note types
          await this.workspace.initializeVault();
          isNewVault = true;
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

        // Create onboarding content for new vaults after search index is ready
        if (isNewVault) {
          // Create noteManager directly for onboarding content creation
          const noteManager = new NoteManager(this.workspace, this.hybridSearchManager);
          await this.createOnboardingContentWithManager(noteManager);
        }
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
  async getNote(vaultId: string, identifier: string): Promise<Note> {
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

      // Initialize hybrid search index for the new vault
      const stats = await tempHybridSearchManager.getStats();
      const forceRebuild = process.env.FORCE_INDEX_REBUILD === 'true';
      const isEmptyIndex = stats.noteCount === 0;
      const shouldRebuild = forceRebuild || isEmptyIndex;

      await handleIndexRebuild(tempHybridSearchManager, shouldRebuild, logInitialization);

      // Create onboarding content for the new vault
      try {
        const tempNoteManager = new NoteManager(workspace, tempHybridSearchManager);
        await this.createOnboardingContentWithManager(tempNoteManager);
      } catch (error) {
        console.error('Failed to create onboarding content for new vault:', error);
        // Don't throw - onboarding content creation shouldn't block vault creation
      }
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

  // Daily View API Methods (Phase 1)

  /**
   * Get or create a daily note for a specific date
   */
  async getOrCreateDailyNote(
    date: string,
    vaultId: string,
    createIfMissing: boolean = true
  ): Promise<Note | null> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(vaultId);

    // Use the date as the identifier (YYYY-MM-DD)
    const identifier = `daily/${date}`;

    try {
      // Try to get existing daily note
      return await noteManager.getNote(identifier);
    } catch {
      // If note doesn't exist and we're not creating, return null
      if (!createIfMissing) {
        return null;
      }

      // If note doesn't exist, create it with blank content
      await noteManager.createNote(
        'daily',
        date,
        '', // Start with blank content instead of date header
        {
          date: date,
          autoCreated: true
        },
        false // Don't enforce required fields for daily notes
      );

      // Return the full note
      return await noteManager.getNote(identifier);
    }
  }

  /**
   * Get week data with daily notes and note aggregation
   */
  async getWeekData(
    startDate: string,
    vaultId: string
  ): Promise<{
    startDate: string;
    endDate: string;
    days: Array<{
      date: string;
      dailyNote: Note | null;
      createdNotes: Array<{ id: string; title: string; type: string }>;
      modifiedNotes: Array<{ id: string; title: string; type: string }>;
      totalActivity: number;
    }>;
  }> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    // Calculate end date (6 days after start date)
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const endDate = end.toISOString().split('T')[0];

    const days: Array<{
      date: string;
      dailyNote: Note | null;
      createdNotes: Array<{ id: string; title: string; type: string }>;
      modifiedNotes: Array<{ id: string; title: string; type: string }>;
      totalActivity: number;
    }> = [];

    // Generate data for each day in the week
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];

      // Only get existing daily notes, don't create new ones during week loading
      let dailyNote: Note | null = null;
      try {
        dailyNote = await this.getOrCreateDailyNote(dateStr, vaultId, false);
      } catch (error) {
        console.warn(`Failed to get daily note for ${dateStr}:`, error);
      }

      // Get notes created on this date
      const createdNotes = await db.all<{ id: string; title: string; type: string }>(
        `SELECT id, title, type FROM notes 
         WHERE DATE(created) = ? AND type != 'daily'
         ORDER BY created DESC`,
        [dateStr]
      );

      // Get notes modified on this date (excluding those already in created)
      const modifiedNotes = await db.all<{ id: string; title: string; type: string }>(
        `SELECT id, title, type FROM notes 
         WHERE DATE(updated) = ? AND DATE(created) != ? AND type != 'daily'
         ORDER BY updated DESC`,
        [dateStr, dateStr]
      );

      days.push({
        date: dateStr,
        dailyNote,
        createdNotes,
        modifiedNotes,
        totalActivity: createdNotes.length + modifiedNotes.length
      });
    }

    return {
      startDate,
      endDate,
      days
    };
  }

  /**
   * Get notes created or modified on a specific date
   */
  async getNotesByDate(
    date: string,
    vaultId: string
  ): Promise<{
    created: Array<{ id: string; title: string; type: string; created: string }>;
    modified: Array<{ id: string; title: string; type: string; updated: string }>;
  }> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    // Get notes created on this date
    const created = await db.all<{
      id: string;
      title: string;
      type: string;
      created: string;
    }>(
      `SELECT id, title, type, created FROM notes 
       WHERE DATE(created) = ? AND type != 'daily'
       ORDER BY created DESC`,
      [date]
    );

    // Get notes modified on this date (excluding those created on the same date)
    const modified = await db.all<{
      id: string;
      title: string;
      type: string;
      updated: string;
    }>(
      `SELECT id, title, type, updated FROM notes 
       WHERE DATE(updated) = ? AND DATE(created) != ? AND type != 'daily'
       ORDER BY updated DESC`,
      [date, date]
    );

    return { created, modified };
  }

  /**
   * Update a daily note's content
   */
  async updateDailyNote(
    date: string,
    content: string,
    vaultId: string
  ): Promise<UpdateResult> {
    this.ensureInitialized();

    // First ensure the daily note exists (create if missing since user is providing content)
    const dailyNote = await this.getOrCreateDailyNote(date, vaultId, true);

    if (!dailyNote) {
      throw new Error('Failed to create daily note');
    }

    // Update the note content
    return await this.updateNote({
      identifier: `daily/${date}`,
      content,
      contentHash: dailyNote.content_hash,
      vaultId
    });
  }

  /**
   * Create onboarding content (welcome note and tutorials) using proper note creation API
   * Called during initial vault setup with noteManager provided directly
   */
  private async createOnboardingContentWithManager(
    noteManager: NoteManager
  ): Promise<void> {
    try {
      // Create welcome note
      await this.createWelcomeNote(noteManager);

      // Create tutorial notes
      await this.createTutorialNotes(noteManager);

      // Create example notes
      await this.createExampleNotes(noteManager);

      // Create template notes
      await this.createTemplateNotes(noteManager);
    } catch (error) {
      console.error('Failed to create onboarding content:', error);
      // Don't throw - onboarding content creation shouldn't block vault initialization
    }
  }

  /**
   * Create the welcome note using proper note creation API
   */
  private async createWelcomeNote(noteManager: NoteManager): Promise<void> {
    const welcomeContent = `# Welcome to Flint!

Welcome to your new Flint vault! Flint is an AI-powered note-taking system designed to help you capture, organize, and connect your knowledge through intelligent conversations with your AI assistant.

## What Makes Flint Different?

Unlike traditional note-taking apps, Flint puts **AI assistance at the center** of your workflow. Your AI agent doesn't just help you write—it helps you think, organize, and discover connections in your knowledge.

## Your Learning Path

Your vault has been set up with a complete learning system to get you started:

### 📚 **Tutorial Notes** (/tutorial/)
Interactive step-by-step tutorials that teach you Flint's core concepts:
- **Your First Note** - Create and edit notes with AI assistance
- **Working with AI** - Learn to have effective conversations with your agent
- **Smart Note-Taking** - Write notes that enhance AI interactions
- **Building Connections** - Use wikilinks to create knowledge graphs
- **Organizing with Types** - Create custom note types for your workflows
- **Advanced Features** - Master sophisticated Flint capabilities

### 📋 **Example Notes** (/examples/)
Real examples showing best practices and effective patterns for different scenarios.

### 📄 **Template Notes** (/templates/)
Starter templates you can copy and customize for common note-taking needs.

### 📝 **General Notes** (/note/)
Your space for everyday notes, thoughts, and ideas.

## Quick Start

**👉 Start here**: Open the first tutorial at [[tutorial/01-your-first-note]] to begin your Flint journey.

The tutorials are designed to be completed in order, but you can jump around based on your interests and needs.

## Key Concepts to Remember

- **Your AI agent is your partner** - Don't just write alone, engage it in conversation
- **Structure helps AI help you** - Well-organized notes lead to better AI assistance
- **Connections create value** - Link related notes to build a knowledge network
- **Iterate and improve** - Notes grow more valuable as you develop and refine them

## Need Help?

- **Ask your AI agent** - It's designed to help with Flint-specific questions
- **Check the tutorials** - They cover all major concepts and workflows
- **Experiment freely** - Flint is designed for exploration and learning

Ready to transform how you work with knowledge? Let's begin with your first tutorial!

**Next step**: [[tutorial/01-your-first-note]]
`;

    await noteManager.createNote(
      'note',
      'Welcome to Flint',
      welcomeContent,
      {},
      false // Don't enforce required fields for onboarding content
    );
  }

  /**
   * Create tutorial notes using proper note creation API
   */
  private async createTutorialNotes(noteManager: NoteManager): Promise<void> {
    // Tutorial 1: Your First Note
    const tutorial1Content = `# Tutorial 1: Your First Note

Welcome to your first Flint tutorial! This interactive guide will walk you through creating and editing notes with AI assistance.

## What You'll Learn

- How to create and edit notes in Flint
- Basic markdown formatting
- How to start conversations with your AI agent
- Saving and organizing your work

## Getting Started

Flint combines traditional note-taking with AI assistance. Every note you create becomes part of a larger knowledge system that your AI agent can help you navigate and develop.

### Step 1: Understanding This Note

You're currently reading a tutorial note. Notice how it's structured with clear headings and sections. This helps both you and the AI agent understand the content.

### Step 2: Try Editing

**👉 Your first task**: Try editing this note! Add your own thoughts or questions below this line:

---
*[Add your thoughts here]*

### Step 3: Talk to Your AI Agent

The AI agent is your thinking partner. Try asking it questions like:
- "What should I write about in my first personal note?"
- "How can I organize my thoughts effectively?"
- "What are some good note-taking practices?"

### Step 4: Create Your First Personal Note

Now that you understand the basics, create your first personal note:

1. Navigate to the main interface
2. Click "New Note" or use the keyboard shortcut
3. Choose the "note" type for general content
4. Give it a meaningful title
5. Start writing!

## Key Concepts Learned

- **Notes are structured documents** with headings and sections
- **AI agent integration** is seamless and conversational
- **Note types** help organize different kinds of content
- **Markdown formatting** creates clear, readable documents

## What's Next?

Continue to [[tutorial/02-working-with-ai]] to learn how to have more effective conversations with your AI agent.

## Practice Exercise

Create a note about something you're interested in or working on. Ask your AI agent to help you structure it effectively.

**Remember**: The best way to learn Flint is by using it. Don't worry about making mistakes—everything can be edited and improved!
`;

    await noteManager.createNote(
      'tutorial',
      '01-your-first-note',
      tutorial1Content,
      {},
      false
    );

    // Tutorial 2: Working with AI
    const tutorial2Content = `# Tutorial 2: Working with the AI Agent

Your AI agent is more than just a writing assistant—it's a thinking partner designed to help you develop and organize your ideas. This tutorial teaches you how to work effectively together.

## Understanding Your AI Agent

Your AI agent has access to:
- **All your notes** - It can reference and connect information across your vault
- **Note structure understanding** - It knows about your note types and organization
- **Context awareness** - It remembers the conversation flow within each note
- **Task assistance** - It can help with research, writing, planning, and analysis

## Effective AI Conversations

### 1. Be Specific and Clear

**Good**: "Help me organize my research notes about renewable energy trends"
**Better**: "I have 5 research notes about solar and wind energy trends from 2020-2024. Help me create a summary that identifies the 3 most significant developments."

### 2. Provide Context

The AI works best when it understands:
- **What you're trying to accomplish**
- **What information you already have**
- **What kind of output you need**
- **Any constraints or preferences**

### 3. Ask for Specific Types of Help

Your AI agent can assist with:
- **Brainstorming**: "Help me think of topics to explore about urban planning"
- **Organization**: "How should I structure my project notes for the marketing campaign?"
- **Analysis**: "What patterns do you see in my meeting notes from this month?"
- **Writing**: "Help me write a clear summary of this research"
- **Connections**: "What other notes relate to this topic?"

## Conversation Patterns That Work

### The Iterative Approach

Start broad, then get specific:
1. "I'm working on X, what should I consider?"
2. "Of those points, help me dive deeper into Y"
3. "Now help me create an action plan for Y"

### The Building Approach

Use the AI to build up complex documents:
1. "Help me outline a report about Z"
2. "Now help me write the introduction section"
3. "Let's develop the main argument in section 2"

### The Review Approach

Use the AI to improve existing work:
1. "Review this draft and suggest improvements"
2. "What questions does this content leave unanswered?"
3. "How can I make this clearer for my audience?"

## Practice Exercise: AI-Assisted Note Creation

Let's practice by creating a note together with AI assistance:

**👉 Try this conversation with your AI agent:**

1. "I want to create a note about [choose a topic you're interested in]. Help me brainstorm what to include."

2. After the AI responds, ask: "Of those ideas, which 3 should I focus on first?"

3. Then: "Help me create an outline for a note covering those 3 areas."

4. Finally: "Now help me write the introduction section."

## Advanced AI Collaboration

### Using Notes as Context

- Reference other notes: "Based on my note about X, help me think about Y"
- Build connections: "What themes connect my notes about A, B, and C?"
- Track progress: "Looking at my project notes, what should I focus on next?"

### Task Management with AI

Your AI agent can help you:
- Break down complex projects into steps
- Identify priorities and dependencies
- Track progress and next actions
- Review and adjust plans

## What You've Learned

- How to have specific, contextual conversations with AI
- Patterns for effective AI collaboration
- Ways to use AI for different types of thinking tasks
- How to iterate and build with AI assistance

## Next Steps

Continue to [[tutorial/03-smart-note-taking]] to learn how to structure your notes for maximum AI effectiveness.

## Reflection Questions

- What types of tasks do you most want AI help with?
- How might AI assistance change your thinking and writing process?
- What questions do you want to explore in future conversations?

**Remember**: The AI agent learns from each conversation how to better assist you. The more you work together, the more effective your collaboration becomes.
`;

    await noteManager.createNote(
      'tutorial',
      '02-working-with-ai',
      tutorial2Content,
      {},
      false
    );

    // Add more tutorials as needed - keeping this concise for now
  }

  /**
   * Create example notes using proper note creation API
   */
  private async createExampleNotes(noteManager: NoteManager): Promise<void> {
    // Example 1: Meeting Notes
    const meetingExampleContent = `# Example: Effective Meeting Notes

This example demonstrates how to structure meeting notes for maximum value and AI assistance.

## Meeting Details
- **Meeting**: Product Planning Session Q2 2024
- **Date**: March 15, 2024
- **Attendees**: Sarah Chen (PM), Mike Rodriguez (Dev Lead), Lisa Wang (Design), Alex Thompson (Marketing)
- **Duration**: 90 minutes
- **Location**: Conference Room B / Zoom hybrid

## Context & Purpose
Quarterly planning meeting to define product roadmap for Q2 2024. This is our third quarterly planning session following the new agile framework adopted in Q1.

**Background**: Q1 showed 15% user growth but also revealed UX friction points in the onboarding flow. We need to balance new feature development with addressing technical debt.

## Key Decisions Made

### Q2 Priority: Hybrid Approach
- **Decision**: Focus on UX improvements + 2 new features
- **Rationale**: Competitive pressure requires new features, but UX issues are affecting retention
- **Timeline**: 6 sprints (12 weeks)

### Resource Allocation
- Development: 80 story points per sprint
- Design: 3 designers, 2 focused on UX overhaul
- QA: Increase testing capacity by 30%

## Action Items

| Task | Owner | Due Date | Priority |
|------|-------|----------|----------|
| Design system audit | Lisa Wang | March 22 | High |
| User research interviews | Sarah Chen | March 29 | High |
| Technical debt assessment | Mike Rodriguez | March 25 | Medium |
| Competitor analysis update | Alex Thompson | April 1 | Medium |

## Next Steps
- **Next meeting**: March 29, 2024 (Design review)
- **Follow-up needed**: Technical debt breakdown from engineering
- **Decisions pending**: Final feature prioritization after user research

## Meeting Effectiveness Notes
- **What worked well**: Clear agenda, good participation from all teams
- **What could improve**: Need better pre-meeting prep, some discussions went long
- **AI assistance opportunities**: Could help with follow-up task tracking and decision documentation

---

**AI Review Prompt**: "Help me identify any missing action items or unclear decisions from this meeting."
`;

    await noteManager.createNote(
      'examples',
      'meeting-notes-example',
      meetingExampleContent,
      {},
      false
    );

    // Example 2: Research Notes
    const researchExampleContent = `# Example: Research Note Structure

This example shows how to organize research notes for effective AI collaboration and knowledge building.

## Research Topic: Remote Work Productivity Trends 2024

### Research Question
How has remote work productivity changed since 2020, and what factors most influence team effectiveness in hybrid environments?

### Key Sources
1. **Harvard Business Review** - "The Future of Hybrid Work" (Feb 2024)
2. **MIT Sloan Management Review** - "Measuring Remote Team Performance" (Jan 2024)
3. **Gallup State of the Workplace** - Annual Report 2024
4. **PwC Remote Work Survey** - 2,000 executives, Q1 2024

### Major Findings

#### Productivity Metrics
- **Overall productivity**: 12% increase vs. 2020 baseline
- **Individual tasks**: 18% improvement
- **Collaborative work**: 8% decline in efficiency
- **Innovation activities**: 15% decline in breakthrough ideas

#### Success Factors
1. **Clear communication protocols** (89% correlation with high performance)
2. **Dedicated home office space** (76% correlation)
3. **Regular 1:1 manager meetings** (71% correlation)
4. **Flexible core hours** (68% correlation)

#### Challenges Identified
- **Social isolation**: 67% report decreased informal interactions
- **Career development concerns**: 54% worry about advancement opportunities
- **Technology fatigue**: 43% experience video call burnout
- **Work-life boundaries**: 39% struggle with "always on" culture

### Synthesis & Insights

**Key Insight**: The productivity gains in remote work are real but unevenly distributed. Individual focused work benefits significantly, while collaborative and creative work face ongoing challenges.

**Emerging Patterns**:
- Companies with structured hybrid policies (3-2 split) show better outcomes
- Investment in digital collaboration tools correlates with team satisfaction
- Intentional culture-building activities become more critical

### Questions for Further Research
- How do productivity patterns vary by industry and role type?
- What specific technologies most effectively support remote collaboration?
- How can organizations measure and improve "innovation productivity" in remote settings?

### Related Notes
- [[project-planning-example]] - Shows how research insights inform planning
- [[meeting-notes-example]] - Demonstrates research application in decision-making

### Next Actions
- [ ] Interview 3 remote team managers about success strategies
- [ ] Analyze our own team's productivity data using these frameworks
- [ ] Create presentation summarizing findings for leadership team

---

**AI Analysis Prompt**: "Based on this research, what recommendations would you make for optimizing our team's hybrid work approach?"
`;

    await noteManager.createNote(
      'examples',
      'research-notes-example',
      researchExampleContent,
      {},
      false
    );
  }

  /**
   * Create template notes using proper note creation API
   */
  private async createTemplateNotes(noteManager: NoteManager): Promise<void> {
    // Template 1: Daily Journal
    const dailyTemplateContent = `# Daily Journal - [Date]

## Today's Focus
*What are the main priorities for today?*

## Morning Reflection
*How am I feeling? What energy level? What's on my mind?*

## Work Accomplishments

### Completed Tasks
-

### In Progress
-

### Challenges Encountered
-

## Learning & Insights
*What did I learn today? Any interesting discoveries or realizations?*

## Personal Highlights
*Positive moments, achievements, or things I'm grateful for*

## Tomorrow's Preparation
*What should I focus on tomorrow? Any prep needed?*

### Priority Tasks for Tomorrow
1.
2.
3.

## Notes & Thoughts
*Random thoughts, ideas, or things to remember*

---

**AI Reflection Prompt**: "Help me identify patterns in my recent daily journals and suggest areas for improvement or focus."
`;

    await noteManager.createNote(
      'templates',
      'daily-journal-template',
      dailyTemplateContent,
      {},
      false
    );

    // Template 2: Meeting Notes
    const meetingTemplateContent = `# Meeting: [Meeting Title]

## Meeting Details
- **Date**: [Date]
- **Time**: [Time]
- **Duration**: [Duration]
- **Location**: [Location/Platform]
- **Attendees**: [List participants]
- **Meeting Type**: [Planning/Review/Decision/Brainstorm/etc.]

## Purpose & Objectives
*Why are we meeting? What do we hope to accomplish?*

## Agenda
1.
2.
3.

## Key Discussion Points

### Topic 1: [Topic Name]
**Discussion Summary**:

**Key Points Raised**:
-
-

**Decisions Made**:
-

### Topic 2: [Topic Name]
**Discussion Summary**:

**Key Points Raised**:
-
-

**Decisions Made**:
-

## Action Items

| Task | Owner | Due Date | Priority | Status |
|------|-------|----------|----------|---------|
|      |       |          |          |         |

## Next Steps
- **Next meeting**: [Date/Time]
- **Follow-up needed**:
- **Decisions pending**:

## Meeting Notes & Observations
- **What worked well**:
- **What could improve**:
- **Unanswered questions**:

## Related Notes
- [[Previous meeting link]]
- [[Related project/topic links]]

---

**AI Review Prompt**: "Review this meeting and help me identify any missing action items or unclear decisions that need follow-up."
`;

    await noteManager.createNote(
      'templates',
      'meeting-notes-template',
      meetingTemplateContent,
      {},
      false
    );

    // Template 3: Project Brief
    const projectTemplateContent = `# Project: [Project Name]

## Project Overview
*Brief description of what this project aims to accomplish*

## Background & Context
*Why is this project needed? What problem does it solve? What's the current situation?*

## Project Goals

### Primary Objectives
1.
2.
3.

### Success Metrics
- **Metric 1**: [Target]
- **Metric 2**: [Target]
- **Metric 3**: [Target]

## Scope & Deliverables

### In Scope
-
-
-

### Out of Scope
-
-
-

### Key Deliverables
1. **[Deliverable Name]** - [Description] - Due: [Date]
2. **[Deliverable Name]** - [Description] - Due: [Date]
3. **[Deliverable Name]** - [Description] - Due: [Date]

## Timeline & Milestones

### Phase 1: [Phase Name] - [Date Range]
- [ ] [Milestone 1]
- [ ] [Milestone 2]

### Phase 2: [Phase Name] - [Date Range]
- [ ] [Milestone 1]
- [ ] [Milestone 2]

### Phase 3: [Phase Name] - [Date Range]
- [ ] [Milestone 1]
- [ ] [Milestone 2]

## Resources & Team

### Team Members
- **[Role]**: [Name] - [Responsibilities]
- **[Role]**: [Name] - [Responsibilities]

### Required Resources
- **Budget**: [Amount/Range]
- **Tools/Technology**:
- **External vendors**:

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|-------------------|
|      | H/M/L  | H/M/L       |                   |

## Dependencies
- **Internal**:
- **External**:

## Communication Plan
- **Status updates**: [Frequency and format]
- **Stakeholder reviews**: [Schedule]
- **Team meetings**: [Schedule]

## Related Notes & References
- [[Research notes]]
- [[Previous projects]]
- [[Requirements documents]]

---

**AI Planning Prompt**: "Review this project brief and help me identify potential gaps, risks, or areas that need more detail."
`;

    await noteManager.createNote(
      'templates',
      'project-brief-template',
      projectTemplateContent,
      {},
      false
    );
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
