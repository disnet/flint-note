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
  CreateVaultResult,
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
import { handleIndexRebuild } from '../database/search-manager.js';
import { logInitialization } from '../utils/config.js';
import type { MetadataFieldDefinition } from '../core/metadata-schema.js';
import { HierarchyManager } from '../core/hierarchy.js';
import type { NoteHierarchyRow } from '../database/schema.js';
import { RelationshipManager } from '../core/relationship-manager.js';
import type { NoteRelationships } from '../core/relationship-manager.js';
import { TemplateManager } from '../core/template-manager.js';
import type { TemplateMetadata } from '../core/template-manager.js';
import { logger } from '../../main/logger.js';
import { validateNoSystemFields } from '../core/system-fields.js';
import { VaultFileWatcher } from '../core/file-watcher.js';
import type { FileWatcherEvent } from '../core/file-watcher.js';
import { getDefaultLinter } from '../linting/linter-config.js';
import type { LintContext } from '../linting/lint-rule.js';
import { formatLintIssues } from '../linting/markdown-linter.js';

export interface FlintNoteApiConfig extends ServerConfig {
  configDir?: string;
  enableFileWatcher?: boolean;
  [key: string]: unknown;
}

export interface UpdateNoteOptions {
  identifier: string;
  content: string;
  contentHash: string;
  vaultId: string;
  metadata?: NoteMetadata;
  callerContext?: 'agent' | 'user';
  skipValidation?: boolean;
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
  callerContext?: 'agent' | 'user';
  skipValidation?: boolean;
}

export interface NoteInfoWithWarnings extends NoteInfo {
  validationWarnings?: string[];
}

export interface UpdateResultWithWarnings extends UpdateResult {
  validationWarnings?: string[];
}

export class FlintNoteApi {
  private workspace!: Workspace;
  private hybridSearchManager!: HybridSearchManager;
  private globalConfig: GlobalConfigManager;
  private config: FlintNoteApiConfig;
  private initialized = false;
  private fileWatcher: VaultFileWatcher | null = null;
  private noteManager: NoteManager | null = null;

  constructor(config: FlintNoteApiConfig = {}) {
    this.config = config;
    this.globalConfig = new GlobalConfigManager(config.configDir);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('FlintNoteApi already initialized, skipping');
      return;
    }

    try {
      logger.info('Starting FlintNoteApi initialization', {
        hasWorkspacePath: !!this.config.workspacePath,
        workspacePath: this.config.workspacePath,
        configDir: this.config.configDir
      });

      // Load global config first
      await this.globalConfig.load();
      logger.info('Global config loaded successfully');

      // If workspace path is provided explicitly, use it
      if (this.config.workspacePath) {
        const workspacePath = this.config.workspacePath;
        logger.info('Initializing with workspace path', { workspacePath });

        this.hybridSearchManager = new HybridSearchManager(workspacePath);
        this.workspace = new Workspace(
          workspacePath,
          this.hybridSearchManager.getDatabaseManager()
        );

        // Check if .flint-note directory exists to determine if this is a new vault
        const flintNoteDir = path.join(workspacePath, '.flint-note');

        try {
          await fs.access(flintNoteDir);
          logger.info('.flint-note directory exists, initializing existing vault');
          // .flint-note directory exists - this is an existing vault
          await this.workspace.initialize();
        } catch {
          logger.info('.flint-note directory not found, initializing new vault');
          // .flint-note directory doesn't exist - this is a new vault
          await this.workspace.initializeVault();
        }

        // Initialize hybrid search index - only rebuild if necessary
        const stats = await this.hybridSearchManager.getStats();
        const forceRebuild = process.env.FORCE_INDEX_REBUILD === 'true';
        const isEmptyIndex = stats.noteCount === 0;

        // Check if index exists but might be stale
        const shouldRebuild = forceRebuild || isEmptyIndex;

        logger.info('Search index stats', { noteCount: stats.noteCount, shouldRebuild });

        await handleIndexRebuild(
          this.hybridSearchManager,
          shouldRebuild,
          logInitialization
        );

        // Initialize file watcher if enabled (default: true)
        const enableFileWatcher = this.config.enableFileWatcher !== false;
        if (enableFileWatcher) {
          logger.info('Initializing file watcher for vault');

          // Create file watcher first (with null note manager temporarily)
          this.fileWatcher = new VaultFileWatcher(
            workspacePath,
            this.hybridSearchManager,
            null
          );

          // Update hybrid search manager with file watcher reference (for write tracking)
          this.hybridSearchManager.setFileWatcher(this.fileWatcher);

          // Create note manager with file watcher reference
          this.noteManager = new NoteManager(
            this.workspace,
            this.hybridSearchManager,
            this.fileWatcher
          );

          // Update file watcher with note manager reference (resolve circular dependency)
          this.fileWatcher.setNoteManager(this.noteManager);

          await this.fileWatcher.start();
          logger.info('File watcher started successfully');
        } else {
          // Create note manager without file watcher
          this.noteManager = new NoteManager(this.workspace, this.hybridSearchManager);
          logger.info('File watcher disabled by configuration');
        }

        logger.info('FlintNoteApi initialized successfully');
        // Note: Template application happens during createVault(), not here
        // This initialization is for existing vaults only
      } else {
        // No workspace path - we can still do vault operations with globalConfig
        // but cannot perform note operations that require a workspace
        logger.info('No workspace path provided - vault operations only mode');
        // Don't set this.initialized = true, as we're not fully initialized for note operations
        return;
      }

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize FlintNoteApi', {
        error,
        workspacePath: this.config.workspacePath,
        configDir: this.config.configDir
      });
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

  private ensureVaultOpsAvailable(): void {
    // Vault operations only need globalConfig, not full workspace initialization
    if (!this.globalConfig) {
      throw new Error(
        'FlintNoteApi configuration not available. Cannot perform vault operations.'
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

    // CRITICAL FIX: Reuse the existing HybridSearchManager if we're working with the current vault
    // Creating new instances causes multiple database connections which can lead to stale reads
    // after database rebuilds due to SQLite WAL mode connection isolation
    const isCurrentVault = this.workspace && this.workspace.rootPath === workspacePath;
    const hybridSearchManager = isCurrentVault
      ? this.hybridSearchManager
      : new HybridSearchManager(workspacePath);

    const workspace = isCurrentVault
      ? this.workspace
      : new Workspace(workspacePath, hybridSearchManager.getDatabaseManager());

    if (!isCurrentVault) {
      await workspace.initialize();
    }

    // Pass fileWatcher when creating NoteManager if vault is within the workspace
    // The fileWatcher watches the entire workspace, so it works for subdirectory vaults too
    const isVaultInWorkspace =
      this.workspace &&
      this.fileWatcher &&
      workspacePath.startsWith(this.workspace.rootPath);
    const noteManager = isVaultInWorkspace
      ? new NoteManager(workspace, hybridSearchManager, this.fileWatcher ?? undefined)
      : new NoteManager(workspace, hybridSearchManager);
    const noteTypeManager = new NoteTypeManager(
      workspace,
      hybridSearchManager.getDatabaseManager()
    );

    return {
      workspace,
      noteManager,
      noteTypeManager,
      hybridSearchManager
    };
  }

  /**
   * Get all existing note identifiers for broken link validation
   * Returns a Set containing both note IDs and type/filename formats
   */
  private async getExistingNoteIdentifiers(vaultId: string): Promise<Set<string>> {
    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = hybridSearchManager.getDatabaseManager();
    const connection = await db.connect();

    const notes = await connection.all<{ id: string; type: string; filename: string }>(
      'SELECT id, type, filename FROM notes'
    );

    const identifiers = new Set<string>();
    for (const note of notes) {
      // Add the note ID (n-xxxxxxxx format)
      identifiers.add(note.id);

      // Add the type/filename format (without .md extension)
      const filenameWithoutExt = note.filename.replace(/\.md$/, '');
      identifiers.add(`${note.type}/${filenameWithoutExt}`);
    }

    return identifiers;
  }

  // Core Note Operations (only verified methods)

  // Search Operations

  /**
   * Basic search for notes with optional filters
   */
  async searchNotes(
    args: SearchNotesArgs
  ): Promise<import('../database/search-manager.js').SearchResponse> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const response = await hybridSearchManager.searchNotes(
      args.query,
      args.type_filter,
      args.limit,
      args.use_regex,
      args.offset
    );
    return response;
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
    const response = await this.searchNotes({
      query: options.query,
      type_filter: options.typeFilter,
      limit: options.limit || 10,
      vault_id: options.vaultId
    });
    return response.results;
  }

  // Note Operations

  /**
   * Create a single note with optional required field validation
   */
  async createNote(
    options: CreateSingleNoteOptions & { enforceRequiredFields?: boolean }
  ): Promise<NoteInfoWithWarnings> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(options.vaultId);

    let validationWarnings: string[] | undefined;

    // Validate content if caller is agent (unless skipValidation is true)
    if (options.callerContext === 'agent' && !options.skipValidation) {
      const linter = getDefaultLinter();

      // Get existing note identifiers for broken link checking
      const existingNoteIdentifiers = await this.getExistingNoteIdentifiers(
        options.vaultId
      );

      const lintContext: LintContext = {
        source: 'agent',
        noteType: options.type,
        existingNoteIdentifiers
      };

      // Use lint() to get warnings, lintStrict() for errors
      const lintResult = linter.lint(options.content, lintContext);

      // Throw if there are errors
      if (!lintResult.valid) {
        const errorMessages = lintResult.errors
          .map((e) => `Line ${e.line}: ${e.message}`)
          .join('\n');
        throw new Error(`Markdown validation failed:\n${errorMessages}`);
      }

      // Format warnings if any (limit to 10)
      if (lintResult.warnings.length > 0) {
        validationWarnings = formatLintIssues(lintResult.warnings, 10);
      }
    }

    const noteInfo = await noteManager.createNote(
      options.type,
      options.title,
      options.content,
      options.metadata || {},
      options.enforceRequiredFields ?? false
    );

    // Return note info with warnings if any
    return validationWarnings ? { ...noteInfo, validationWarnings } : noteInfo;
  }

  /**
   * Get a note by identifier - returns pure Note object with optional content limiting
   */
  async getNote(
    vaultId: string,
    identifier: string,
    contentLimit?: { maxLines?: number; offset?: number }
  ): Promise<Note & { contentMetadata?: import('./types.js').ContentMetadata }> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(vaultId);
    const note = await noteManager.getNote(identifier);

    // Apply content limiting if specified
    if (contentLimit) {
      const maxLines = Math.min(contentLimit.maxLines ?? 500, 2000);
      const offset = contentLimit.offset ?? 0;

      const lines = note.content.split('\n');
      const totalLines = lines.length;

      if (totalLines <= maxLines && offset === 0) {
        // No truncation needed
        return note;
      }

      const truncatedLines = lines.slice(offset, offset + maxLines);
      const isTruncated = offset + maxLines < totalLines;

      return {
        ...note,
        content: truncatedLines.join('\n'),
        contentMetadata: {
          totalLines,
          returnedLines: truncatedLines.length,
          offset,
          isTruncated
        }
      };
    }

    return note;
  }

  /**
   * Get multiple notes by identifiers - returns array of results with optional content limiting
   */
  async getNotes(
    vaultId: string,
    identifiers: string[],
    contentLimit?: { maxLines?: number; offset?: number }
  ): Promise<
    Array<{
      success: boolean;
      note?: Note & { contentMetadata?: import('./types.js').ContentMetadata };
      error?: string;
    }>
  > {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(vaultId);
    const results = await noteManager.getNotes(identifiers);

    // Apply content limiting if specified
    if (contentLimit) {
      const maxLines = Math.min(contentLimit.maxLines ?? 500, 2000);
      const offset = contentLimit.offset ?? 0;

      return results.map((result) => {
        if (!result.success || !result.note) {
          return result;
        }

        const lines = result.note.content.split('\n');
        const totalLines = lines.length;

        if (totalLines <= maxLines && offset === 0) {
          // No truncation needed
          return result;
        }

        const truncatedLines = lines.slice(offset, offset + maxLines);
        const isTruncated = offset + maxLines < totalLines;

        return {
          ...result,
          note: {
            ...result.note,
            content: truncatedLines.join('\n'),
            contentMetadata: {
              totalLines,
              returnedLines: truncatedLines.length,
              offset,
              isTruncated
            }
          }
        };
      });
    }

    return results;
  }

  /**
   * Update a note - returns UpdateResult with optional validation warnings
   */
  async updateNote(options: UpdateNoteOptions): Promise<UpdateResultWithWarnings> {
    this.ensureInitialized();
    const { noteManager } = await this.getVaultContext(options.vaultId);

    let validationWarnings: string[] | undefined;

    // Validate content if caller is agent (unless skipValidation is true)
    if (options.callerContext === 'agent' && !options.skipValidation) {
      const linter = getDefaultLinter();

      // Get existing note identifiers for broken link checking
      const existingNoteIdentifiers = await this.getExistingNoteIdentifiers(
        options.vaultId
      );

      const lintContext: LintContext = {
        source: 'agent',
        existingNoteIdentifiers
      };

      // Use lint() to get warnings, lintStrict() for errors
      const lintResult = linter.lint(options.content, lintContext);

      // Throw if there are errors
      if (!lintResult.valid) {
        const errorMessages = lintResult.errors
          .map((e) => `Line ${e.line}: ${e.message}`)
          .join('\n');
        throw new Error(`Markdown validation failed:\n${errorMessages}`);
      }

      // Format warnings if any (limit to 10)
      if (lintResult.warnings.length > 0) {
        validationWarnings = formatLintIssues(lintResult.warnings, 10);
      }
    }

    let updateResult: UpdateResult;

    if (options.metadata) {
      updateResult = await noteManager.updateNoteWithMetadata(
        options.identifier,
        options.content,
        options.metadata,
        options.contentHash
      );
    } else {
      updateResult = await noteManager.updateNote(
        options.identifier,
        options.content,
        options.contentHash
      );
    }

    // Return update result with warnings if any
    return validationWarnings ? { ...updateResult, validationWarnings } : updateResult;
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

    // Validate metadata schema doesn't contain system fields
    if (args.metadata_schema?.fields) {
      const fieldNames = args.metadata_schema.fields.map((f) => f.name);
      const validation = validateNoSystemFields(fieldNames);
      if (!validation.valid) {
        throw new Error(
          `Cannot create note type with system fields in metadata schema: ${validation.systemFields.join(', ')}. ` +
            `System fields are automatically managed and cannot be redefined.`
        );
      }
    }

    const { noteTypeManager } = await this.getVaultContext(args.vault_id);
    return await noteTypeManager.createNoteType(
      args.type_name,
      args.description,
      args.agent_instructions || null,
      args.metadata_schema || null,
      args.icon || null
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
      content_hash: desc.content_hash,
      icon: desc.icon
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
    icon?: string;
    vault_id: string;
  }): Promise<NoteTypeDescription> {
    this.ensureInitialized();

    // Validate metadata schema doesn't contain system fields
    if (args.metadata_schema) {
      const fieldNames = args.metadata_schema.map((f) => f.name);
      const validation = validateNoSystemFields(fieldNames);
      if (!validation.valid) {
        throw new Error(
          `Cannot update note type with system fields in metadata schema: ${validation.systemFields.join(', ')}. ` +
            `System fields are automatically managed and cannot be redefined.`
        );
      }
    }

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
    if (args.icon !== undefined) {
      updates.icon = args.icon;
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
  async createVault(args: CreateVaultArgs): Promise<CreateVaultResult> {
    this.ensureVaultOpsAvailable();

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

    // Check if path is already registered as a different vault
    const existingVaultAtPath = this.globalConfig.getVaultByPath(resolvedPath, args.id);
    if (existingVaultAtPath) {
      throw new Error(
        `Path '${resolvedPath}' is already registered as vault '${existingVaultAtPath.name}' (ID: ${existingVaultAtPath.id})`
      );
    }

    // Check if directory contains an existing vault
    const isExistingVault = await Workspace.isExistingVault(resolvedPath);
    // Track whether this is a new vault for the response
    let isNewVault = false;
    // Track initial note ID from template (if any)
    let initialNoteId: string | undefined;

    if (args.detectExisting !== false && isExistingVault) {
      // Path contains existing vault - just register it without full initialization

      // Ensure directory exists (should already exist, but make sure)
      await fs.mkdir(resolvedPath, { recursive: true });

      // Add vault to registry
      await this.globalConfig.addVault(
        args.id,
        args.name,
        resolvedPath,
        args.description
      );

      // For existing vaults, only do minimal initialization to preserve existing data
      if (args.initialize !== false) {
        const tempHybridSearchManager = new HybridSearchManager(resolvedPath);
        const workspace = new Workspace(
          resolvedPath,
          tempHybridSearchManager.getDatabaseManager()
        );

        // Initialize workspace to load existing config and handle migrations
        await workspace.initialize();

        // Rebuild search index if needed (but don't create new content)
        const stats = await tempHybridSearchManager.getStats();
        const forceRebuild = process.env.FORCE_INDEX_REBUILD === 'true';
        const shouldRebuild = forceRebuild || stats.noteCount === 0;

        if (shouldRebuild) {
          await handleIndexRebuild(
            tempHybridSearchManager,
            shouldRebuild,
            logInitialization
          );
        }

        await tempHybridSearchManager.close();
      }
    } else {
      // New vault or existing detection disabled - proceed with full initialization
      isNewVault = true;

      if (isExistingVault && args.detectExisting === false) {
        console.warn(
          `Warning: Path '${resolvedPath}' contains existing vault but detectExisting=false, proceeding with initialization`
        );
      }

      // Ensure directory exists
      await fs.mkdir(resolvedPath, { recursive: true });

      // Add vault to registry
      await this.globalConfig.addVault(
        args.id,
        args.name,
        resolvedPath,
        args.description
      );

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

        await handleIndexRebuild(
          tempHybridSearchManager,
          shouldRebuild,
          logInitialization
        );

        // Apply template to the new vault (unless skipTemplate is true)
        if (args.skipTemplate !== true) {
          try {
            const tempNoteManager = new NoteManager(workspace, tempHybridSearchManager);
            const tempNoteTypeManager = new NoteTypeManager(
              workspace,
              tempHybridSearchManager.getDatabaseManager()
            );
            const templateManager = new TemplateManager();
            const templateId = args.templateId || 'default';

            const result = await templateManager.applyTemplate(
              templateId,
              tempNoteManager,
              tempNoteTypeManager
            );

            // Capture the initial note ID from template application
            initialNoteId = result.initialNoteId;

            logger.info(
              `Template applied: ${result.noteTypesCreated} note types, ${result.notesCreated} notes`,
              { initialNoteId: result.initialNoteId }
            );
            if (result.errors.length > 0) {
              logger.warn('Template application errors', { errors: result.errors });
            }
          } catch (error) {
            logger.error('Failed to apply template to new vault', { error });
            // Don't throw - template application shouldn't block vault creation
          }
        }

        await tempHybridSearchManager.close();

        // Handle vault switching
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

        return {
          ...vault,
          isNewVault,
          initialNoteId
        };
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

    const result = {
      ...vault,
      isNewVault,
      initialNoteId
    };
    return result;
  }

  /**
   * Switch to a different vault
   */
  async switchVault(args: SwitchVaultArgs): Promise<void> {
    this.ensureVaultOpsAvailable();

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
    this.ensureVaultOpsAvailable();

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
   * Get all links for a specific note (outgoing and incoming) with optional limiting per category
   */
  async getNoteLinks(
    vaultId: string,
    identifier: string,
    limit?: number
  ): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
    limited: boolean;
    total_outgoing_internal: number;
    total_outgoing_external: number;
    total_incoming: number;
  }> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    // Check if note exists
    const note = await db.get('SELECT id FROM notes WHERE id = ?', [identifier]);
    if (!note) {
      throw new Error(`Note not found: ${identifier}`);
    }

    const maxLimit = Math.min(limit ?? 500, 500);

    // Get full counts
    const outgoingInternalCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM note_links WHERE source_note_id = ?',
      [identifier]
    );
    const outgoingExternalCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM external_links WHERE note_id = ?',
      [identifier]
    );
    const incomingCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM note_links WHERE target_note_id = ?',
      [identifier]
    );

    const totalOutgoingInternal = outgoingInternalCount?.count ?? 0;
    const totalOutgoingExternal = outgoingExternalCount?.count ?? 0;
    const totalIncoming = incomingCount?.count ?? 0;

    // Get limited results
    const outgoing_internal = await db.all<NoteLinkRow>(
      'SELECT * FROM note_links WHERE source_note_id = ? LIMIT ?',
      [identifier, maxLimit]
    );
    const outgoing_external = await db.all<ExternalLinkRow>(
      'SELECT * FROM external_links WHERE note_id = ? LIMIT ?',
      [identifier, maxLimit]
    );
    const incoming = await db.all<NoteLinkRow>(
      'SELECT * FROM note_links WHERE target_note_id = ? LIMIT ?',
      [identifier, maxLimit]
    );

    const limited =
      totalOutgoingInternal > maxLimit ||
      totalOutgoingExternal > maxLimit ||
      totalIncoming > maxLimit;

    return {
      outgoing_internal,
      outgoing_external,
      incoming,
      limited,
      total_outgoing_internal: totalOutgoingInternal,
      total_outgoing_external: totalOutgoingExternal,
      total_incoming: totalIncoming
    };
  }

  /**
   * Get all notes that link to the specified note (backlinks) with pagination
   */
  async getBacklinks(
    vaultId: string,
    identifier: string,
    limit?: number,
    offset?: number
  ): Promise<import('./types.js').PaginatedResponse<NoteLinkRow>> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    // Check if note exists
    const note = await db.get('SELECT id FROM notes WHERE id = ?', [identifier]);
    if (!note) {
      throw new Error(`Note not found: ${identifier}`);
    }

    const maxLimit = Math.min(limit ?? 100, 500);
    const pageOffset = offset ?? 0;

    // Get total count
    const countResult = await db.get<{ total: number }>(
      'SELECT COUNT(*) as total FROM note_links WHERE target_note_id = ?',
      [identifier]
    );
    const total = countResult?.total ?? 0;

    // Get paginated results
    const backlinks = await db.all<NoteLinkRow>(
      'SELECT * FROM note_links WHERE target_note_id = ? ORDER BY source_note_id LIMIT ? OFFSET ?',
      [identifier, maxLimit, pageOffset]
    );

    return {
      results: backlinks,
      pagination: {
        total,
        limit: maxLimit,
        offset: pageOffset,
        hasMore: pageOffset + maxLimit < total
      }
    };
  }

  /**
   * Find all broken wikilinks (links to non-existent notes) with pagination
   */
  async findBrokenLinks(
    vaultId: string,
    limit?: number,
    offset?: number
  ): Promise<import('./types.js').PaginatedResponse<NoteLinkRow>> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    const maxLimit = Math.min(limit ?? 100, 500);
    const pageOffset = offset ?? 0;

    // Get total count of broken links
    const countResult = await db.get<{ total: number }>(
      `SELECT COUNT(*) as total FROM note_links
       WHERE target_note_id IS NULL OR
             target_note_id NOT IN (SELECT id FROM notes)`
    );
    const total = countResult?.total ?? 0;

    // Get paginated results
    const brokenLinks = await db.all<NoteLinkRow>(
      `SELECT * FROM note_links
       WHERE target_note_id IS NULL OR
             target_note_id NOT IN (SELECT id FROM notes)
       ORDER BY source_note_id
       LIMIT ? OFFSET ?`,
      [maxLimit, pageOffset]
    );

    return {
      results: brokenLinks,
      pagination: {
        total,
        limit: maxLimit,
        offset: pageOffset,
        hasMore: pageOffset + maxLimit < total
      }
    };
  }

  /**
   * Search for notes based on their link relationships with pagination
   */
  async searchByLinks(args: {
    has_links_to?: string[];
    linked_from?: string[];
    external_domains?: string[];
    broken_links?: boolean;
    vault_id: string;
    limit?: number;
    offset?: number;
  }): Promise<import('./types.js').PaginatedResponse<NoteRow>> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();

    const limit = Math.min(args.limit ?? 50, 200);
    const offset = args.offset ?? 0;

    let notes: NoteRow[] = [];
    let total = 0;

    // Handle different search criteria
    if (args.has_links_to && args.has_links_to.length > 0) {
      // Find notes that link to any of the specified notes
      const targetIds = args.has_links_to;
      const placeholders = targetIds.map(() => '?').join(',');

      // Get total count
      const countResult = await db.get<{ total: number }>(
        `SELECT COUNT(DISTINCT n.id) as total FROM notes n
         INNER JOIN note_links nl ON n.id = nl.source_note_id
         WHERE nl.target_note_id IN (${placeholders})`,
        targetIds
      );
      total = countResult?.total ?? 0;

      // Get paginated results
      notes = await db.all(
        `SELECT DISTINCT n.* FROM notes n
         INNER JOIN note_links nl ON n.id = nl.source_note_id
         WHERE nl.target_note_id IN (${placeholders})
         ORDER BY n.updated DESC
         LIMIT ? OFFSET ?`,
        [...targetIds, limit, offset]
      );
    } else if (args.linked_from && args.linked_from.length > 0) {
      // Find notes that are linked from any of the specified notes
      const sourceIds = args.linked_from;
      const placeholders = sourceIds.map(() => '?').join(',');

      // Get total count
      const countResult = await db.get<{ total: number }>(
        `SELECT COUNT(DISTINCT n.id) as total FROM notes n
         INNER JOIN note_links nl ON n.id = nl.target_note_id
         WHERE nl.source_note_id IN (${placeholders})`,
        sourceIds
      );
      total = countResult?.total ?? 0;

      // Get paginated results
      notes = await db.all(
        `SELECT DISTINCT n.* FROM notes n
         INNER JOIN note_links nl ON n.id = nl.target_note_id
         WHERE nl.source_note_id IN (${placeholders})
         ORDER BY n.updated DESC
         LIMIT ? OFFSET ?`,
        [...sourceIds, limit, offset]
      );
    } else if (args.external_domains && args.external_domains.length > 0) {
      // Find notes with external links to specified domains
      const domainConditions = args.external_domains
        .map(() => 'el.url LIKE ?')
        .join(' OR ');
      const domainParams = args.external_domains.map((domain) => `%${domain}%`);

      // Get total count
      const countResult = await db.get<{ total: number }>(
        `SELECT COUNT(DISTINCT n.id) as total FROM notes n
         INNER JOIN external_links el ON n.id = el.note_id
         WHERE ${domainConditions}`,
        domainParams
      );
      total = countResult?.total ?? 0;

      // Get paginated results
      notes = await db.all(
        `SELECT DISTINCT n.* FROM notes n
         INNER JOIN external_links el ON n.id = el.note_id
         WHERE ${domainConditions}
         ORDER BY n.updated DESC
         LIMIT ? OFFSET ?`,
        [...domainParams, limit, offset]
      );
    } else if (args.broken_links) {
      // Find notes with broken internal links
      // Get total count
      const countResult = await db.get<{ total: number }>(
        `SELECT COUNT(DISTINCT n.id) as total FROM notes n
         INNER JOIN note_links nl ON n.id = nl.source_note_id
         WHERE nl.target_note_id IS NULL`
      );
      total = countResult?.total ?? 0;

      // Get paginated results
      notes = await db.all(
        `SELECT DISTINCT n.* FROM notes n
         INNER JOIN note_links nl ON n.id = nl.source_note_id
         WHERE nl.target_note_id IS NULL
         ORDER BY n.updated DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    }

    return {
      results: notes,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
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
    const parentId = args.parent_id;
    const childId = args.child_id;

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
          parentId, // Use immutable ID, not the identifier
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
    const parentId = args.parent_id;
    const childId = args.child_id;

    const result = await hierarchyManager.removeSubnote(parentId, childId);

    // If the hierarchy operation was successful, sync changes back to parent note frontmatter
    if (result.success) {
      try {
        await this.syncHierarchyToFrontmatter(
          args.vault_id,
          parentId, // Use immutable ID, not the identifier
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
    const parentId = args.parent_id;
    const childIds = args.child_ids;

    const result = await hierarchyManager.reorderSubnotes(parentId, childIds);

    // If the hierarchy operation was successful, sync changes back to parent note frontmatter
    if (result.success) {
      try {
        await this.syncHierarchyToFrontmatter(
          args.vault_id,
          parentId, // Use immutable ID, not the identifier
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
    noteId: string, // Now accepts immutable ID directly
    hierarchyManager: HierarchyManager,
    hybridSearchManager: HybridSearchManager
  ): Promise<void> {
    const { noteManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    // Get current hierarchy children
    const children = await hierarchyManager.getChildren(noteId);

    // Convert child IDs back to identifiers
    const subnotes: string[] = [];

    for (const child of children) {
      const note = await db.get<{ filename: string; type: string }>(
        'SELECT filename, type FROM notes WHERE id = ?',
        [child.child_id]
      );
      if (note) {
        // Remove .md extension from filename for the identifier
        const filenameWithoutExt = note.filename.replace(/\.md$/, '');
        subnotes.push(`${note.type}/${filenameWithoutExt}`);
      }
    }

    // Get parent note info to construct the identifier for noteManager
    const parentNoteInfo = await db.get<{ filename: string; type: string }>(
      'SELECT filename, type FROM notes WHERE id = ?',
      [noteId]
    );
    if (!parentNoteInfo) {
      console.warn(`Note not found when syncing hierarchy: ${noteId}`);
      return;
    }

    // Construct the identifier (type/filename without .md)
    const noteIdentifier = `${parentNoteInfo.type}/${parentNoteInfo.filename.replace(/\.md$/, '')}`;

    // Get current note and update its frontmatter
    const currentNote = await noteManager.getNote(noteIdentifier);
    if (!currentNote) {
      console.warn(`Note not found when syncing hierarchy: ${noteIdentifier}`);
      return;
    }

    // Create metadata object excluding protected fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, type, title, filename, created, updated, ...userMetadata } =
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

    const noteId = args.note_id;
    const path = await hierarchyManager.getHierarchyPath(noteId);

    // Convert note IDs back to identifiers for the response
    const identifierPath: string[] = [];
    for (const id of path) {
      const note = await db.get<{ filename: string; type: string }>(
        'SELECT filename, type FROM notes WHERE id = ?',
        [id]
      );
      if (note) {
        // Remove .md extension from filename for the identifier
        const filenameWithoutExt = note.filename.replace(/\.md$/, '');
        identifierPath.push(`${note.type}/${filenameWithoutExt}`);
      }
    }

    return identifierPath;
  }

  /**
   * Get all descendant notes up to specified depth with optional result limiting
   */
  async getDescendants(args: GetDescendantsArgs): Promise<{
    descendants: NoteHierarchyRow[];
    limited: boolean;
    total: number;
  }> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const hierarchyManager = new HierarchyManager(db);

    const noteId = args.note_id;
    const maxResults = Math.min(args.max_results ?? 100, 500);

    // Get all descendants first
    const allDescendants = await hierarchyManager.getDescendants(noteId, args.max_depth);
    const total = allDescendants.length;

    // Limit results if necessary
    const descendants =
      total > maxResults ? allDescendants.slice(0, maxResults) : allDescendants;

    return {
      descendants,
      limited: total > maxResults,
      total
    };
  }

  /**
   * Get direct children of a note with optional limiting
   */
  async getChildren(args: GetChildrenArgs): Promise<{
    children: NoteHierarchyRow[];
    limited: boolean;
    total: number;
  }> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const hierarchyManager = new HierarchyManager(db);

    const noteId = args.note_id;
    const maxLimit = Math.min(args.limit ?? 100, 200);

    // Get all children first
    const allChildren = await hierarchyManager.getChildren(noteId);
    const total = allChildren.length;

    // Limit results if necessary
    const children = total > maxLimit ? allChildren.slice(0, maxLimit) : allChildren;

    return {
      children,
      limited: total > maxLimit,
      total
    };
  }

  /**
   * Get direct parents of a note with optional limiting
   */
  async getParents(args: GetParentsArgs): Promise<{
    parents: NoteHierarchyRow[];
    limited: boolean;
    total: number;
  }> {
    this.ensureInitialized();

    const { hybridSearchManager } = await this.getVaultContext(args.vault_id);
    const db = await hybridSearchManager.getDatabaseConnection();
    const hierarchyManager = new HierarchyManager(db);

    const noteId = args.note_id;
    const maxLimit = Math.min(args.limit ?? 100, 200);

    // Get all parents first
    const allParents = await hierarchyManager.getParents(noteId);
    const total = allParents.length;

    // Limit results if necessary
    const parents = total > maxLimit ? allParents.slice(0, maxLimit) : allParents;

    return {
      parents,
      limited: total > maxLimit,
      total
    };
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

    const noteId = args.note_id;
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

    const noteId = args.note_id;
    // Apply default of 50 and max of 200
    const maxResults = Math.min(args.max_results ?? 50, 200);
    return await relationshipManager.getRelatedNotes(noteId, maxResults);
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

    const startNoteId = args.start_note_id;
    const endNoteId = args.end_note_id;

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

    const noteId = args.note_id;
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

  // Database Operations

  /**
   * Rebuild the database from markdown files on disk
   */
  async rebuildDatabase(
    vaultId?: string
  ): Promise<{ success: boolean; noteCount: number }> {
    this.ensureInitialized();

    try {
      // Use the current workspace's search manager (which is already initialized)
      // If a vaultId is provided, verify it matches the current vault
      if (vaultId) {
        const currentVault = this.globalConfig.getCurrentVault();
        if (!currentVault || currentVault.id !== vaultId) {
          throw new Error(
            `Cannot rebuild database for vault '${vaultId}' - it is not the current vault. Please switch to the vault first.`
          );
        }
      }

      // Use the already-initialized search manager from this instance
      const hybridSearchManager = this.hybridSearchManager;

      // Rebuild the index with progress reporting
      let noteCount = 0;
      await hybridSearchManager.rebuildIndex((processed: number, total: number) => {
        noteCount = total;
        if (processed % 10 === 0 || processed === total) {
          console.log(`Rebuilding database: ${processed}/${total} notes processed`);
        }
      });

      // CRITICAL: Refresh database connections after rebuild to avoid stale read snapshots
      // SQLite WAL mode can cause existing connections to see old data after major writes
      await hybridSearchManager.refreshConnections();
      console.log('Database connections refreshed after rebuild');

      return {
        success: true,
        noteCount
      };
    } catch (error) {
      console.error('Failed to rebuild database:', error);
      throw new Error(
        `Failed to rebuild database: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get migration mapping for UI state migration (old identifier → new immutable ID)
   * Returns null if no migration is needed
   */
  async getMigrationMapping(): Promise<Record<string, string> | null> {
    this.ensureInitialized();

    try {
      const db = await this.hybridSearchManager.getDatabaseConnection();

      // Check if migration table exists
      const tableExists = await db.get<{ count: number }>(`
        SELECT COUNT(*) as count FROM sqlite_master
        WHERE type='table' AND name='note_id_migration'
      `);

      if (!tableExists || tableExists.count === 0) {
        return null; // No migration needed
      }

      const mappings = await db.all<{ old_identifier: string; new_id: string }>(
        'SELECT old_identifier, new_id FROM note_id_migration'
      );

      return Object.fromEntries(mappings.map((m) => [m.old_identifier, m.new_id]));
    } catch (error) {
      console.error('Failed to get migration mapping:', error);
      throw new Error(
        `Failed to get migration mapping: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * List available vault templates
   */
  async listTemplates(): Promise<TemplateMetadata[]> {
    // Template listing doesn't require initialization
    const templateManager = new TemplateManager();
    return await templateManager.listTemplates();
  }

  /**
   * Get recent unprocessed notes for the inbox view
   * Returns notes created in the last 7 days that haven't been marked as processed
   */
  async getRecentUnprocessedNotes(
    vaultId: string,
    daysBack: number = 7
  ): Promise<NoteListItem[]> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    // Calculate the date threshold
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - daysBack);
    const thresholdDate = threshold.toISOString();

    // Query for notes created in the last N days that are not in processed_notes
    const notes = await db.all<NoteRow>(
      `
      SELECT n.* FROM notes n
      LEFT JOIN processed_notes pn ON n.id = pn.note_id
      WHERE n.created >= ?
        AND pn.note_id IS NULL
      ORDER BY n.created DESC
    `,
      [thresholdDate]
    );

    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      type: note.type,
      filename: note.filename,
      path: note.path,
      created: note.created,
      modified: note.updated,
      size: note.size || 0,
      tags: []
    }));
  }

  /**
   * Get recent processed notes for the inbox view
   * Returns notes that have been marked as processed in the last N days
   */
  async getRecentProcessedNotes(
    vaultId: string,
    daysBack: number = 7
  ): Promise<NoteListItem[]> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    // Calculate the date threshold
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - daysBack);
    const thresholdDate = threshold.toISOString();

    // Query for notes that have been processed in the last N days
    const notes = await db.all<NoteRow>(
      `
      SELECT n.* FROM notes n
      INNER JOIN processed_notes pn ON n.id = pn.note_id
      WHERE pn.processed_at >= ?
      ORDER BY pn.processed_at DESC
    `,
      [thresholdDate]
    );

    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      type: note.type,
      filename: note.filename,
      path: note.path,
      created: note.created,
      modified: note.updated,
      size: note.size || 0,
      tags: []
    }));
  }

  /**
   * Mark a note as processed in the inbox
   * Adds the note to the processed_notes table so it no longer appears in the inbox
   */
  async markNoteAsProcessed(
    noteId: string,
    vaultId: string
  ): Promise<{ success: boolean }> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    try {
      await db.run(
        `
        INSERT OR IGNORE INTO processed_notes (note_id, processed_at)
        VALUES (?, CURRENT_TIMESTAMP)
      `,
        [noteId]
      );
      return { success: true };
    } catch (error) {
      console.error('Failed to mark note as processed:', error);
      return { success: false };
    }
  }

  /**
   * Unmark a note as processed in the inbox
   * Removes the note from the processed_notes table so it appears in the inbox again
   */
  async unmarkNoteAsProcessed(
    noteId: string,
    vaultId: string
  ): Promise<{ success: boolean }> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    try {
      await db.run(
        `
        DELETE FROM processed_notes
        WHERE note_id = ?
      `,
        [noteId]
      );
      return { success: true };
    } catch (error) {
      console.error('Failed to unmark note as processed:', error);
      return { success: false };
    }
  }

  // UI State management
  async loadUIState(vaultId: string, stateKey: string): Promise<unknown | null> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    try {
      const row = await db.get<{ state_value: string }>(
        'SELECT state_value FROM ui_state WHERE vault_id = ? AND state_key = ?',
        [vaultId, stateKey]
      );

      if (!row) {
        return null;
      }

      return JSON.parse(row.state_value);
    } catch (error) {
      console.error('Failed to load UI state:', error);
      return null;
    }
  }

  async saveUIState(
    vaultId: string,
    stateKey: string,
    stateValue: unknown
  ): Promise<{ success: boolean }> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    try {
      await db.run(
        `INSERT INTO ui_state (vault_id, state_key, state_value, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(vault_id, state_key)
         DO UPDATE SET state_value = ?, updated_at = CURRENT_TIMESTAMP`,
        [vaultId, stateKey, JSON.stringify(stateValue), JSON.stringify(stateValue)]
      );

      return { success: true };
    } catch (error) {
      console.error('Failed to save UI state:', error);
      throw error;
    }
  }

  async clearUIState(vaultId: string): Promise<{ success: boolean }> {
    this.ensureInitialized();
    const { hybridSearchManager } = await this.getVaultContext(vaultId);
    const db = await hybridSearchManager.getDatabaseConnection();

    try {
      await db.run('DELETE FROM ui_state WHERE vault_id = ?', [vaultId]);
      return { success: true };
    } catch (error) {
      console.error('Failed to clear UI state:', error);
      throw error;
    }
  }

  // Slash Commands management
  async loadSlashCommands(): Promise<unknown[]> {
    this.ensureInitialized();
    const db = await this.hybridSearchManager.getDatabaseConnection();

    try {
      const rows = await db.all<{
        id: string;
        name: string;
        instruction: string;
        parameters: string | null;
        created_at: string;
        updated_at: string;
      }>('SELECT * FROM slash_commands ORDER BY name');

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        instruction: row.instruction,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        parameters: row.parameters ? JSON.parse(row.parameters) : []
      }));
    } catch (error) {
      console.error('Failed to load slash commands:', error);
      return [];
    }
  }

  async saveSlashCommands(commands: unknown[]): Promise<{ success: boolean }> {
    this.ensureInitialized();
    const db = await this.hybridSearchManager.getDatabaseConnection();

    try {
      // Clear existing commands
      await db.run('DELETE FROM slash_commands');

      // Insert all commands
      for (const cmd of commands as Array<{
        id: string;
        name: string;
        instruction: string;
        createdAt: string;
        updatedAt: string;
        parameters?: unknown[];
      }>) {
        await db.run(
          `INSERT INTO slash_commands (id, name, instruction, parameters, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            cmd.id,
            cmd.name,
            cmd.instruction,
            cmd.parameters ? JSON.stringify(cmd.parameters) : null,
            cmd.createdAt,
            cmd.updatedAt
          ]
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to save slash commands:', error);
      throw error;
    }
  }

  /**
   * Get the file watcher instance if enabled
   */
  getFileWatcher(): VaultFileWatcher | null {
    return this.fileWatcher;
  }

  /**
   * Flush all pending file writes immediately
   * Part of Phase 1: Database-first architecture
   * Called on app shutdown to ensure no data loss
   */
  async flushPendingWrites(): Promise<void> {
    if (!this.noteManager) {
      return; // No note manager initialized
    }

    try {
      await this.noteManager.flushPendingWrites();
    } catch (error) {
      console.error('[FlintNoteApi] Error flushing pending writes:', error);
      throw error;
    }
  }

  /**
   * Register a file watcher event handler
   */
  onFileWatcherEvent(handler: (event: FileWatcherEvent) => void): (() => void) | null {
    if (!this.fileWatcher) {
      return null;
    }
    return this.fileWatcher.on(handler);
  }

  /**
   * Get the database connection for the current vault
   * Useful for advanced operations that need direct database access
   */
  async getDatabaseConnection(): Promise<
    import('../database/schema.js').DatabaseConnection | null
  > {
    if (!this.initialized || !this.hybridSearchManager) {
      return null;
    }

    try {
      return await this.hybridSearchManager.getDatabaseConnection();
    } catch (error) {
      console.error('Failed to get database connection:', error);
      return null;
    }
  }

  /**
   * Cleanup resources and close database connections
   * Call this when the API instance is no longer needed
   */
  async cleanup(): Promise<void> {
    // Stop file watcher first
    if (this.fileWatcher) {
      try {
        await this.fileWatcher.stop();
        this.fileWatcher = null;
      } catch (error) {
        console.warn('Error stopping file watcher:', error);
      }
    }

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
