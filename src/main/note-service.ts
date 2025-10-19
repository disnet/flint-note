import { FlintNoteApi } from '../server/api';
import type {
  NoteInfo,
  Note,
  UpdateResult,
  DeleteNoteResult,
  NoteListItem
} from '../server/core/notes';
import type { NoteTypeListItem } from '../server/core/note-types';
import type { NoteMetadata } from '../server/types';
import type { GetNoteTypeInfoArgs } from '../server/api/types.js';
import type { MoveNoteResult } from '../server/core/notes';
import type { SearchResult } from '../server/database/search-manager';
import type {
  CoreVaultInfo as VaultInfo,
  CoreNoteLinkRow as NoteLinkRow,
  CoreNoteTypeInfo as NoteTypeInfo,
  CreateVaultResult
} from '../server/api/types';
import type { TemplateMetadata } from '../server/core/template-manager';
import type { ExternalLinkRow } from '../server/database/schema';
import type {
  MetadataFieldDefinition,
  MetadataSchema
} from '../server/core/metadata-schema';
import type {
  HierarchyOperationResult,
  NoteHierarchyRow,
  NoteRelationships
} from '../server/api/types';
import { logger } from './logger';
import type { GetNoteTypeInfoResult } from '../server/api/types.js';
import type { NoteTypeDescription } from '../server/core/note-types';
import { getCurrentVaultPath } from '../server/utils/global-config.js';
import { app } from 'electron';
import { publishNoteEvent } from './note-events.js';
import type { FileWatcherEvent } from '../server/core/file-watcher.js';

export class NoteService {
  private api: FlintNoteApi;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private electronUserDataPath: string;
  private hasVaultsAvailable = false;

  constructor() {
    // Use Electron's userData directory for configuration storage
    this.electronUserDataPath = app.getPath('userData');

    this.api = new FlintNoteApi({
      configDir: this.electronUserDataPath,
      throwOnError: false
    });
  }

  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return;
    }

    // If initialization is in progress, wait for it to complete
    // This prevents concurrent initialization calls from racing
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization and store the promise
    this.initializationPromise = this.doInitialize();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      logger.info('Starting NoteService initialization', {
        electronUserDataPath: this.electronUserDataPath,
        platform: process.platform
      });

      // Get the current vault path for initialization, using Electron userData directory
      const currentVaultPath = await getCurrentVaultPath(this.electronUserDataPath);
      logger.info('Current vault path retrieved', { currentVaultPath });

      if (currentVaultPath) {
        // Reinitialize API with workspace path if we have a current vault
        logger.info('Initializing FlintNote API with workspace path', {
          workspacePath: currentVaultPath
        });

        this.api = new FlintNoteApi({
          configDir: this.electronUserDataPath,
          workspacePath: currentVaultPath,
          throwOnError: false
        });

        await this.api.initialize();
        this.isInitialized = true;
        this.hasVaultsAvailable = true;

        // Set up file watcher event forwarding
        this.api.onFileWatcherEvent((event: FileWatcherEvent) => {
          this.handleFileWatcherEvent(event);
        });

        logger.info('FlintNote API initialized successfully with vault', {
          vaultPath: currentVaultPath
        });
      } else {
        // No vaults available - set up API without workspace for vault operations only
        logger.info('No current vault found, initializing in vault-management mode');
        this.api = new FlintNoteApi({
          configDir: this.electronUserDataPath,
          throwOnError: false
        });
        this.isInitialized = false; // Not fully initialized for note operations
        this.hasVaultsAvailable = false;
        logger.info('No vaults available - NoteService in vault-management-only mode');
      }
    } catch (error) {
      logger.error('Failed to initialize FlintNote API', {
        error,
        electronUserDataPath: this.electronUserDataPath,
        platform: process.platform,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
      this.isInitialized = false;
      this.hasVaultsAvailable = false;
      // Don't throw - allow the service to exist in an uninitialized state
      logger.warn(
        'NoteService will operate in limited mode due to initialization failure'
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(
        'NoteService must be initialized before use. Please create or select a vault first.'
      );
    }
  }

  /**
   * Check if vaults are available for initialization
   */
  async checkVaultAvailability(): Promise<boolean> {
    try {
      const currentVaultPath = await getCurrentVaultPath(this.electronUserDataPath);
      return currentVaultPath !== null;
    } catch (error) {
      logger.error('Failed to check vault availability:', { error });
      return false;
    }
  }

  /**
   * Retry initialization after vault creation/switching
   */
  async retryInitialization(): Promise<boolean> {
    try {
      this.isInitialized = false;
      this.hasVaultsAvailable = false;
      this.initializationPromise = null; // Clear any existing promise
      await this.initialize();
      return this.isInitialized;
    } catch (error) {
      logger.error('Failed to retry initialization:', { error });
      return false;
    }
  }

  private ensureVaultOpsAvailable(): void {
    // Vault operations only need the API object to exist, not full initialization
    // because they work with the global config, not workspace-specific data
  }

  /**
   * Get the underlying FlintNoteApi instance for advanced operations
   */
  getFlintNoteApi(): FlintNoteApi {
    return this.api;
  }

  // Note CRUD operations
  async createNote(
    type: string,
    identifier: string,
    content: string,
    vaultId: string,
    metadata?: NoteMetadata
  ): Promise<NoteInfo> {
    this.ensureInitialized();
    return await this.api.createNote({
      type,
      title: identifier,
      content,
      vaultId,
      metadata
    });
  }

  async getNote(identifier: string, vaultId: string): Promise<Note | null> {
    this.ensureInitialized();
    return await this.api.getNote(vaultId, identifier);
  }

  async updateNote(
    identifier: string,
    content: string,
    vaultId: string,
    metadata?: NoteMetadata
  ): Promise<UpdateResult> {
    this.ensureInitialized();
    // Get current note to obtain content hash
    const note = await this.api.getNote(vaultId, identifier);
    if (!note) {
      throw new Error('Note not found');
    }
    return await this.api.updateNote({
      identifier,
      content,
      metadata,
      contentHash: note.content_hash,
      vaultId
    });
  }

  async deleteNote(identifier: string, vaultId: string): Promise<DeleteNoteResult> {
    this.ensureInitialized();
    return await this.api.deleteNote({
      identifier,
      confirm: true,
      vaultId
    });
  }

  async renameNote(
    identifier: string,
    newIdentifier: string,
    vaultId: string
  ): Promise<{
    success: boolean;
    notesUpdated?: number;
    linksUpdated?: number;
    new_id?: string;
  }> {
    this.ensureInitialized();
    // Get the note first to obtain content hash
    const note = await this.api.getNote(vaultId, identifier);
    if (!note) {
      throw new Error('Note not found');
    }

    return await this.api.renameNote({
      noteId: identifier,
      newTitle: newIdentifier,
      contentHash: note.content_hash,
      vault_id: vaultId
    });
  }

  async moveNote(
    identifier: string,
    newType: string,
    vaultId: string
  ): Promise<MoveNoteResult> {
    this.ensureInitialized();
    // Get the note first to obtain content hash
    const note = await this.api.getNote(vaultId, identifier);
    if (!note) {
      throw new Error('Note not found');
    }

    return await this.api.moveNote({
      noteId: identifier,
      newType: newType,
      contentHash: note.content_hash,
      vault_id: vaultId
    });
  }

  // Search operations
  async searchNotes(
    query: string,
    vaultId: string,
    limit?: number
  ): Promise<SearchResult[]> {
    this.ensureInitialized();
    return await this.api.searchNotesByText({
      query,
      limit,
      vaultId
    });
  }

  async searchNotesAdvanced(params: {
    query: string;
    type?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    vaultId: string;
  }): Promise<SearchResult[]> {
    this.ensureInitialized();
    return await this.api.searchNotesAdvanced({
      content_contains: params.query,
      type: params.type,
      metadata_filters: params.tags
        ? [
            {
              key: 'tags',
              value: params.tags.join(','),
              operator: 'IN'
            }
          ]
        : undefined,
      created_within: params.dateFrom,
      created_before: params.dateTo,
      limit: params.limit,
      vault_id: params.vaultId
    });
  }

  // Note type operations
  async listNoteTypes(vaultId: string): Promise<NoteTypeListItem[]> {
    this.ensureInitialized();
    return await this.api.listNoteTypes({ vault_id: vaultId });
  }

  async createNoteType(params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: MetadataSchema;
    vaultId: string;
  }): Promise<NoteTypeInfo> {
    this.ensureInitialized();
    return await this.api.createNoteType({
      type_name: params.typeName,
      description: params.description,
      agent_instructions: params.agentInstructions,
      metadata_schema: params.metadataSchema,
      vault_id: params.vaultId
    });
  }

  async getNoteTypeInfo(args: GetNoteTypeInfoArgs): Promise<GetNoteTypeInfoResult> {
    this.ensureInitialized();
    return await this.api.getNoteTypeInfo(args);
  }

  async updateNoteType(params: {
    typeName: string;
    description?: string;
    instructions?: string[];
    metadataSchema?: MetadataFieldDefinition[];
    vaultId: string;
  }): Promise<NoteTypeDescription> {
    this.ensureInitialized();
    // For now, just return what the API gives us
    return await this.api.updateNoteType({
      type_name: params.typeName,
      description: params.description,
      instructions: params.instructions,
      metadata_schema: params.metadataSchema,
      vault_id: params.vaultId
    });
  }

  async listNotesByType(
    type: string,
    vaultId: string,
    limit?: number
  ): Promise<NoteListItem[]> {
    this.ensureInitialized();
    return await this.api.listNotes({
      typeName: type,
      limit,
      vaultId
    });
  }

  // Vault operations
  async listVaults(): Promise<VaultInfo[]> {
    this.ensureVaultOpsAvailable();
    const vaults = await this.api.listVaults();
    return vaults;
  }

  async getCurrentVault(): Promise<VaultInfo | null> {
    this.ensureVaultOpsAvailable();
    return await this.api.getCurrentVault();
  }

  async createVault(
    name: string,
    path: string,
    description?: string,
    templateId?: string
  ): Promise<CreateVaultResult> {
    this.ensureVaultOpsAvailable();
    return await this.api.createVault({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      path,
      description,
      templateId
    });
  }

  async switchVault(vaultId: string): Promise<void> {
    this.ensureVaultOpsAvailable();
    return await this.api.switchVault({ id: vaultId });
  }

  async removeVault(vaultId: string): Promise<void> {
    this.ensureVaultOpsAvailable();
    return await this.api.removeVault({ id: vaultId });
  }

  async listTemplates(): Promise<TemplateMetadata[]> {
    this.ensureVaultOpsAvailable();
    return await this.api.listTemplates();
  }

  // Link operations
  async getNoteLinks(
    identifier: string,
    vaultId: string
  ): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }> {
    this.ensureInitialized();
    return await this.api.getNoteLinks(vaultId, identifier);
  }

  async getBacklinks(identifier: string, vaultId: string): Promise<NoteLinkRow[]> {
    this.ensureInitialized();
    const result = await this.api.getBacklinks(vaultId, identifier);
    return result.results;
  }

  async findBrokenLinks(vaultId: string): Promise<NoteLinkRow[]> {
    this.ensureInitialized();
    const result = await this.api.findBrokenLinks(vaultId);
    return result.results;
  }

  // Additional helper methods
  async getAllNotes(vaultId: string): Promise<NoteListItem[]> {
    this.ensureInitialized();
    return await this.api.listNotes({
      vaultId
    });
  }

  // Ensure default note type exists in a specific vault
  async ensureDefaultNoteType(vaultId: string): Promise<void> {
    this.ensureInitialized();

    try {
      logger.info(`Ensuring default 'note' type exists in vault: ${vaultId}`);

      // Check if 'note' type already exists
      const noteTypes = await this.api.listNoteTypes({ vault_id: vaultId });
      const hasNoteType = noteTypes.some((type) => type.name === 'note');

      if (!hasNoteType) {
        // Create the default 'note' type
        await this.api.createNoteType({
          type_name: 'note',
          description: 'General purpose note for unspecified content',
          agent_instructions: [
            'This is a general purpose note with no specific structure requirements.',
            "Use for any content that doesn't fit into other specific note types."
          ],
          metadata_schema: {
            fields: [
              {
                name: 'tags',
                type: 'array',
                required: false,
                description: 'Optional tags for categorizing the note'
              },
              {
                name: 'created_by',
                type: 'string',
                required: false,
                description: 'Optional field indicating who created the note'
              }
            ]
          },
          vault_id: vaultId
        });
        logger.info(`Created default 'note' type in vault: ${vaultId}`);
      } else {
        logger.debug(`Default 'note' type already exists in vault: ${vaultId}`);
      }
    } catch (error) {
      logger.error(`Failed to ensure default note type in vault ${vaultId}:`, { error });
    }
  }

  // Hierarchy operations
  async addSubnote(
    parentIdentifier: string,
    childIdentifier: string,
    vaultId: string,
    position?: number
  ): Promise<HierarchyOperationResult> {
    this.ensureInitialized();
    return await this.api.addSubnote({
      parent_id: parentIdentifier,
      child_id: childIdentifier,
      vault_id: vaultId,
      position
    });
  }

  async removeSubnote(
    parentIdentifier: string,
    childIdentifier: string,
    vaultId: string
  ): Promise<HierarchyOperationResult> {
    this.ensureInitialized();
    return await this.api.removeSubnote({
      parent_id: parentIdentifier,
      child_id: childIdentifier,
      vault_id: vaultId
    });
  }

  async reorderSubnotes(
    parentIdentifier: string,
    childIdentifiers: string[],
    vaultId: string
  ): Promise<HierarchyOperationResult> {
    this.ensureInitialized();
    return await this.api.reorderSubnotes({
      parent_id: parentIdentifier,
      child_ids: childIdentifiers,
      vault_id: vaultId
    });
  }

  async getHierarchyPath(identifier: string, vaultId: string): Promise<string[]> {
    this.ensureInitialized();
    return await this.api.getHierarchyPath({
      note_id: identifier,
      vault_id: vaultId
    });
  }

  async getDescendants(
    identifier: string,
    vaultId: string,
    maxDepth?: number
  ): Promise<NoteHierarchyRow[]> {
    this.ensureInitialized();
    const result = await this.api.getDescendants({
      note_id: identifier,
      vault_id: vaultId,
      max_depth: maxDepth
    });
    return result.descendants;
  }

  async getChildren(identifier: string, vaultId: string): Promise<NoteHierarchyRow[]> {
    this.ensureInitialized();
    const result = await this.api.getChildren({
      note_id: identifier,
      vault_id: vaultId
    });
    return result.children;
  }

  async getParents(identifier: string, vaultId: string): Promise<NoteHierarchyRow[]> {
    this.ensureInitialized();
    const result = await this.api.getParents({
      note_id: identifier,
      vault_id: vaultId
    });
    return result.parents;
  }

  // Relationship analysis operations
  async getNoteRelationships(
    identifier: string,
    vaultId: string
  ): Promise<NoteRelationships> {
    this.ensureInitialized();
    return await this.api.getNoteRelationships({
      note_id: identifier,
      vault_id: vaultId
    });
  }

  async getRelatedNotes(
    identifier: string,
    vaultId: string,
    maxResults?: number
  ): Promise<Array<{ noteId: string; strength: number; relationship_types: string[] }>> {
    this.ensureInitialized();
    return await this.api.getRelatedNotes({
      note_id: identifier,
      vault_id: vaultId,
      max_results: maxResults
    });
  }

  async findRelationshipPath(
    startIdentifier: string,
    endIdentifier: string,
    vaultId: string,
    maxDepth?: number
  ): Promise<Array<{ noteId: string; relationship: string }> | null> {
    this.ensureInitialized();
    return await this.api.findRelationshipPath({
      start_note_id: startIdentifier,
      end_note_id: endIdentifier,
      vault_id: vaultId,
      max_depth: maxDepth
    });
  }

  async getClusteringCoefficient(identifier: string, vaultId: string): Promise<number> {
    this.ensureInitialized();
    return await this.api.getClusteringCoefficient({
      note_id: identifier,
      vault_id: vaultId
    });
  }

  // Daily View operations
  async getOrCreateDailyNote(
    date: string,
    vaultId: string,
    createIfMissing: boolean = true
  ): Promise<Note | null> {
    this.ensureInitialized();
    return await this.api.getOrCreateDailyNote(date, vaultId, createIfMissing);
  }

  async getDailyNote(date: string, vaultId: string): Promise<Note | null> {
    this.ensureInitialized();
    return await this.api.getOrCreateDailyNote(date, vaultId, false);
  }

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
    return await this.api.getWeekData(startDate, vaultId);
  }

  async getNotesByDate(
    date: string,
    vaultId: string
  ): Promise<{
    created: Array<{ id: string; title: string; type: string; created: string }>;
    modified: Array<{ id: string; title: string; type: string; updated: string }>;
  }> {
    this.ensureInitialized();
    return await this.api.getNotesByDate(date, vaultId);
  }

  async updateDailyNote(
    date: string,
    content: string,
    vaultId: string
  ): Promise<UpdateResult> {
    this.ensureInitialized();
    return await this.api.updateDailyNote(date, content, vaultId);
  }

  // Database operations
  async rebuildDatabase(
    vaultId?: string
  ): Promise<{ success: boolean; noteCount: number }> {
    this.ensureInitialized();
    return await this.api.rebuildDatabase(vaultId);
  }

  async getMigrationMapping(): Promise<Record<string, string> | null> {
    this.ensureInitialized();
    return await this.api.getMigrationMapping();
  }

  // Utility methods
  isReady(): boolean {
    return this.isInitialized;
  }

  hasVaults(): boolean {
    return this.hasVaultsAvailable;
  }

  /**
   * Get initialization status with details
   */
  getStatus(): {
    isInitialized: boolean;
    hasVaults: boolean;
    canPerformNoteOperations: boolean;
  } {
    return {
      isInitialized: this.isInitialized,
      hasVaults: this.hasVaultsAvailable,
      canPerformNoteOperations: this.isInitialized && this.hasVaultsAvailable
    };
  }

  /**
   * Get recent unprocessed notes for the inbox view
   */
  async getRecentUnprocessedNotes(
    vaultId: string,
    daysBack?: number
  ): Promise<Array<{ id: string; title: string; type: string; created: string }>> {
    this.ensureInitialized();
    const notes = await this.api.getRecentUnprocessedNotes(vaultId, daysBack);
    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      type: note.type,
      created: note.created
    }));
  }

  /**
   * Get recent processed notes for the inbox view
   */
  async getRecentProcessedNotes(
    vaultId: string,
    daysBack?: number
  ): Promise<Array<{ id: string; title: string; type: string; created: string }>> {
    this.ensureInitialized();
    const notes = await this.api.getRecentProcessedNotes(vaultId, daysBack);
    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      type: note.type,
      created: note.created
    }));
  }

  /**
   * Mark a note as processed in the inbox
   */
  async markNoteAsProcessed(
    noteId: string,
    vaultId: string
  ): Promise<{ success: boolean }> {
    this.ensureInitialized();
    return await this.api.markNoteAsProcessed(noteId, vaultId);
  }

  /**
   * Unmark a note as processed in the inbox
   */
  async unmarkNoteAsProcessed(
    noteId: string,
    vaultId: string
  ): Promise<{ success: boolean }> {
    this.ensureInitialized();
    return await this.api.unmarkNoteAsProcessed(noteId, vaultId);
  }

  // UI State management
  async loadUIState(vaultId: string, stateKey: string): Promise<unknown | null> {
    this.ensureInitialized();
    return await this.api.loadUIState(vaultId, stateKey);
  }

  async saveUIState(
    vaultId: string,
    stateKey: string,
    stateValue: unknown
  ): Promise<{ success: boolean }> {
    this.ensureInitialized();
    return await this.api.saveUIState(vaultId, stateKey, stateValue);
  }

  async clearUIState(vaultId: string): Promise<{ success: boolean }> {
    this.ensureInitialized();
    return await this.api.clearUIState(vaultId);
  }

  // Slash Commands management
  async loadSlashCommands(): Promise<unknown[]> {
    this.ensureInitialized();
    return await this.api.loadSlashCommands();
  }

  async saveSlashCommands(commands: unknown): Promise<{ success: boolean }> {
    this.ensureInitialized();
    return await this.api.saveSlashCommands(commands as unknown[]);
  }

  /**
   * Handle file watcher events and forward them to the renderer
   */
  private handleFileWatcherEvent(event: FileWatcherEvent): void {
    logger.debug('File watcher event:', event);

    switch (event.type) {
      case 'external-change':
        publishNoteEvent({
          type: 'file.external-change',
          path: event.path,
          noteId: event.noteId
        });
        break;

      case 'external-add':
        publishNoteEvent({
          type: 'file.external-add',
          path: event.path
        });
        break;

      case 'external-delete':
        publishNoteEvent({
          type: 'file.external-delete',
          path: event.path,
          noteId: event.noteId
        });
        break;

      case 'external-rename':
        publishNoteEvent({
          type: 'file.external-rename',
          oldPath: event.oldPath,
          newPath: event.newPath,
          noteId: event.noteId
        });
        break;

      case 'sync-started':
        publishNoteEvent({
          type: 'file.sync-started',
          fileCount: event.fileCount
        });
        break;

      case 'sync-completed':
        publishNoteEvent({
          type: 'file.sync-completed',
          added: event.added,
          updated: event.updated,
          deleted: event.deleted
        });
        // Trigger a bulk refresh to update the UI
        publishNoteEvent({
          type: 'notes.bulkRefresh',
          notes: []
        });
        break;
    }
  }
}
