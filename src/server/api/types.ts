/**
 * Type definitions for FlintNote API responses
 * These types reuse existing core types to avoid duplication and maintain sync
 */

// ============================================================================
// Re-export core types for convenience
// ============================================================================

// Re-export the original types in case consumers need them
export type {
  Note as CoreNote,
  NoteInfo as CoreNoteInfo,
  NoteListItem as CoreNoteListItem,
  UpdateResult as CoreUpdateResult,
  DeleteNoteResult as CoreDeleteNoteResult
} from '../core/notes.js';

export type {
  NoteTypeDescription as CoreNoteTypeDescription,
  NoteTypeListItem as CoreNoteTypeListItem,
  NoteTypeInfo as CoreNoteTypeInfo
} from '../core/note-types.js';

export type { SearchResult as CoreSearchResult } from '../database/search-manager.js';

export type {
  NoteLinkRow as CoreNoteLinkRow,
  NoteRow as CoreNoteRow,
  SearchRow as CoreSearchRow,
  MetadataRow as CoreMetadataRow
} from '../database/schema.js';

export type { VaultInfo as CoreVaultInfo } from '../utils/global-config.js';

export type {
  NoteMetadata,
  HierarchyGraph,
  HierarchyOperationResult,
  HierarchyValidation
} from '../types/index.js';

export type { NoteHierarchyRow } from '../database/schema.js';

export type {
  NoteRelationships,
  RelationshipGraph
} from '../core/relationship-manager.js';

// ============================================================================
// Server Configuration Types
// ============================================================================

export interface ServerConfig {
  workspacePath?: string;
  throwOnError?: boolean;
}

/**
 * Vault-specific operation context
 */
export interface VaultContext {
  workspace: import('../core/workspace.js').Workspace;
  noteManager: import('../core/notes.js').NoteManager;
  noteTypeManager: import('../core/note-types.js').NoteTypeManager;
  hybridSearchManager: import('../database/search-manager.js').HybridSearchManager;
  reviewManager: import('../core/review-manager.js').ReviewManager;
}

// ============================================================================
// API Argument Types
// ============================================================================

export interface CreateNoteTypeArgs {
  type_name: string;
  description: string;
  agent_instructions?: string[];
  metadata_schema?: import('../core/metadata-schema.js').MetadataSchema;
  icon?: string;
  vault_id: string;
}

export interface CreateNoteArgs {
  type?: string;
  /** Content rendering type: 'markdown' (default) or 'epub' */
  kind?: 'markdown' | 'epub' | string;
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  notes?: Array<{
    type: string;
    kind?: 'markdown' | 'epub' | string;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  vault_id: string;
}

export interface GetNoteArgs {
  identifier: string;
  vault_id: string;
  fields?: string[];
  contentLimit?: ContentLimitOptions;
}

export interface GetNotesArgs {
  identifiers: string[];
  vault_id: string;
  fields?: string[];
  contentLimit?: ContentLimitOptions;
}

export interface UpdateNoteArgs {
  identifier?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  content_hash?: string;
  updates?: Array<{
    identifier: string;
    content?: string;
    metadata?: Record<string, unknown>;
    content_hash: string;
  }>;
  vault_id: string;
}

export interface SearchNotesArgs {
  query?: string;
  type_filter?: string;
  limit?: number;
  offset?: number;
  use_regex?: boolean;
  vault_id: string;
  fields?: string[];
}

export interface SearchNotesAdvancedArgs {
  type?: string;
  metadata_filters?: Array<{
    key: string;
    value: string;
    operator?: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN';
  }>;
  updated_within?: string;
  updated_before?: string;
  created_within?: string;
  created_before?: string;
  content_contains?: string;
  // Hierarchy-specific filters
  parent_of?: string;
  child_of?: string;
  descendants_of?: string;
  ancestors_of?: string;
  max_depth?: number;
  has_children?: boolean;
  has_parents?: boolean;
  sort?: Array<{
    field: 'title' | 'type' | 'created' | 'updated' | 'size';
    order: 'asc' | 'desc';
  }>;
  limit?: number;
  offset?: number;
  vault_id: string;
  fields?: string[];
}

export interface SearchNotesSqlArgs {
  query: string;
  params?: (string | number | boolean | null)[];
  limit?: number;
  timeout?: number;
  vault_id: string;
  fields?: string[];
}

export interface ListNoteTypesArgs {
  vault_id: string;
}

export interface UpdateNoteTypeArgs {
  type_name: string;
  instructions?: string;
  description?: string;
  metadata_schema?: import('../core/metadata-schema.js').MetadataFieldDefinition[];
  content_hash: string;
  vault_id: string;
}

export interface GetNoteTypeInfoArgs {
  type_name: string;
  vault_id: string;
}

export interface GetNoteTypeInfoResult {
  name: string;
  purpose: string;
  path: string;
  instructions: string[];
  metadata_schema: import('../core/metadata-schema.js').MetadataSchema;
  content_hash: string;
  icon?: string;
  suggestions_config?: import('../types/index.js').NoteTypeSuggestionConfig;
  default_review_mode?: boolean;
}

export interface CreateVaultArgs {
  id: string;
  name: string;
  path: string;
  description?: string;
  templateId?: string; // Template to apply to new vault (defaults to 'default')
  skipTemplate?: boolean; // If true, skip template application even for new vaults (useful for tests)
  initialize?: boolean;
  switch_to?: boolean;
  detectExisting?: boolean; // If true, check if path contains existing vault and handle appropriately
}

export interface CreateVaultResult {
  id: string;
  name: string;
  path: string;
  created: string;
  last_accessed: string;
  description?: string;
  isNewVault: boolean; // True if this was a newly created vault, false if existing vault was opened
  initialNoteId?: string; // ID of the note to open initially (from template)
}

export interface SwitchVaultArgs {
  id: string;
}

export interface RemoveVaultArgs {
  id: string;
}

// ============================================================================
// Hierarchy API Argument Types
// ============================================================================

export interface AddSubnoteArgs {
  parent_id: string;
  child_id: string;
  position?: number;
  vault_id: string;
}

export interface RemoveSubnoteArgs {
  parent_id: string;
  child_id: string;
  vault_id: string;
}

export interface ReorderSubnotesArgs {
  parent_id: string;
  child_ids: string[];
  vault_id: string;
}

export interface GetHierarchyPathArgs {
  note_id: string;
  vault_id: string;
}

export interface GetDescendantsArgs {
  note_id: string;
  max_depth?: number;
  max_results?: number;
  vault_id: string;
}

export interface GetChildrenArgs {
  note_id: string;
  limit?: number;
  vault_id: string;
}

export interface GetParentsArgs {
  note_id: string;
  limit?: number;
  vault_id: string;
}

// ============================================================================
// Relationship Analysis API Argument Types
// ============================================================================

export interface GetNoteRelationshipsArgs {
  note_id: string;
  vault_id: string;
}

export interface GetRelatedNotesArgs {
  note_id: string;
  vault_id: string;
  max_results?: number; // Default: 50, Max: 200
}

export interface FindRelationshipPathArgs {
  start_note_id: string;
  end_note_id: string;
  vault_id: string;
  max_depth?: number;
}

export interface GetClusteringCoefficientArgs {
  note_id: string;
  vault_id: string;
}

export interface UpdateVaultArgs {
  id: string;
  name?: string;
  description?: string;
}

export interface GetNoteInfoArgs {
  title_or_filename: string;
  type?: string;
  vault_id: string;
}

export interface ListNotesByTypeArgs {
  type: string;
  limit?: number;
  vault_id: string;
}

export interface DeleteNoteArgs {
  identifier: string;
  confirm?: boolean;
  vault_id: string;
}

export interface DeleteNoteTypeArgs {
  type_name: string;
  action: 'error' | 'migrate' | 'delete';
  target_type?: string;
  confirm?: boolean;
  vault_id: string;
}

export interface BulkDeleteNotesArgs {
  type?: string;
  tags?: string[];
  pattern?: string;
  confirm?: boolean;
  vault_id: string;
}

export interface RenameNoteArgs {
  noteId: string;
  newTitle: string;
  contentHash: string;
  vault_id: string;
}

export interface MoveNoteArgs {
  noteId: string;
  newType: string;
  contentHash: string;
  vault_id: string;
}

// ============================================================================
// Hierarchy/Subnotes API Args (Phase 1)
// ============================================================================

export interface AddSubnoteArgs {
  parent_id: string;
  child_id: string;
  position?: number;
  vault_id: string;
}

export interface RemoveSubnoteArgs {
  parent_id: string;
  child_id: string;
  vault_id: string;
}

export interface ReorderSubnotesArgs {
  parent_id: string;
  child_ids: string[];
  vault_id: string;
}

export interface GetHierarchyPathArgs {
  note_id: string;
  vault_id: string;
}

export interface GetDescendantsArgs {
  note_id: string;
  max_depth?: number;
  vault_id: string;
}

export interface GetHierarchyGraphArgs {
  vault_id: string;
}

// ============================================================================
// Custom Functions API Argument Types
// ============================================================================

export interface RegisterCustomFunctionArgs {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description?: string;
      optional?: boolean;
      default?: unknown;
    }
  >;
  returnType: string;
  code: string;
  tags?: string[];
  vault_id: string;
}

export interface UpdateCustomFunctionArgs {
  id: string;
  name?: string;
  description?: string;
  parameters?: Record<
    string,
    {
      type: string;
      description?: string;
      optional?: boolean;
      default?: unknown;
    }
  >;
  returnType?: string;
  code?: string;
  tags?: string[];
  vault_id: string;
}

export interface ListCustomFunctionsArgs {
  tags?: string[];
  searchQuery?: string;
  vault_id: string;
}

export interface DeleteCustomFunctionArgs {
  id: string;
  vault_id: string;
}

export interface GetCustomFunctionArgs {
  id?: string;
  name?: string;
  vault_id: string;
}

export interface ValidateCustomFunctionArgs {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description?: string;
      optional?: boolean;
      default?: unknown;
    }
  >;
  returnType: string;
  code: string;
  tags?: string[];
  vault_id: string;
}

export interface CustomFunctionExecutionStatsArgs {
  functionId?: string;
  vault_id: string;
}

// ============================================================================
// Pagination Types
// ============================================================================

/**
 * Standard pagination parameters for list/search operations
 */
export interface PaginationParams {
  limit?: number; // Max results per request
  offset?: number; // Skip N results
}

/**
 * Standard paginated response wrapper
 */
export interface PaginatedResponse<T> {
  results: T[];
  pagination: {
    total: number; // Total matching results
    limit: number; // Applied limit
    offset: number; // Applied offset
    hasMore: boolean; // More results available
  };
}

/**
 * Content limiting options for note retrieval
 */
export interface ContentLimitOptions {
  maxLines?: number; // Max lines to return (default: 500, max: 2000)
  offset?: number; // Line offset for pagination
}

/**
 * Content metadata for truncated notes
 */
export interface ContentMetadata {
  totalLines: number;
  returnedLines: number;
  offset: number;
  isTruncated: boolean;
}

// ============================================================================
// Link Operations Argument Types with Pagination
// ============================================================================

export interface GetNoteLinksArgs {
  identifier: string;
  vault_id: string;
  limit?: number; // Max 500 per category
}

export interface GetBacklinksArgs {
  identifier: string;
  vault_id: string;
  limit?: number; // Default: 100, Max: 500
  offset?: number;
}

export interface FindBrokenLinksArgs {
  vault_id: string;
  limit?: number; // Default: 100, Max: 500
  offset?: number;
}

export interface SearchByLinksArgs {
  has_links_to?: string[];
  linked_from?: string[];
  external_domains?: string[];
  broken_links?: boolean;
  vault_id: string;
  limit?: number; // Default: 50, Max: 200
  offset?: number;
}
