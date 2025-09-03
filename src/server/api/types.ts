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
}

// ============================================================================
// API Argument Types
// ============================================================================

export interface CreateNoteTypeArgs {
  type_name: string;
  description: string;
  agent_instructions?: string[];
  metadata_schema?: import('../core/metadata-schema.js').MetadataSchema;
  vault_id: string;
}

export interface CreateNoteArgs {
  type?: string;
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  notes?: Array<{
    type: string;
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
}

export interface GetNotesArgs {
  identifiers: string[];
  vault_id: string;
  fields?: string[];
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
}

export interface CreateVaultArgs {
  id: string;
  name: string;
  path: string;
  description?: string;
  initialize?: boolean;
  switch_to?: boolean;
}

export interface SwitchVaultArgs {
  id: string;
}

export interface RemoveVaultArgs {
  id: string;
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
  identifier: string;
  new_title: string;
  content_hash: string;
  vault_id: string;
}

export interface MoveNoteArgs {
  identifier: string;
  new_type: string;
  content_hash: string;
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
