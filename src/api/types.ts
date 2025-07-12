/**
 * Type definitions for FlintNote API responses
 * These types reuse existing core types to avoid duplication and maintain sync
 */

// Import existing core types
import type {
  Note,
  NoteInfo,
  NoteListItem,
  UpdateResult,
  DeleteNoteResult
} from '../core/notes.js';
import type {
  NoteTypeDescription,
  NoteTypeListItem,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  NoteTypeInfo,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ParsedNoteTypeDescription
} from '../core/note-types.js';
import type { SearchResult } from '../database/search-manager.js';
import type {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  NoteRow,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  SearchRow,
  NoteLinkRow,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MetadataRow
} from '../database/schema.js';
import type { VaultInfo } from '../utils/global-config.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { NoteMetadata } from '../types/index.js';

// ============================================================================
// Core Note Types (Reusing existing types)
// ============================================================================

// Direct exports of existing types
export type ApiNote = Note;
export type ApiNoteInfo = NoteInfo;
export type ApiNoteListItem = NoteListItem;

// ============================================================================
// Note Operation Results (Extending existing types)
// ============================================================================

// Single note creation result - extends basic note info with API-specific fields
export interface ApiCreateNoteResult extends NoteInfo {
  content_hash: string;
  agent_instructions: string[];
  next_suggestions: string;
}

// Batch creation results
export interface ApiBatchCreateResult {
  created_notes: ApiCreateNoteResult[];
  errors: Array<{
    index: number;
    error: string;
    note?: {
      type: string;
      title: string;
    };
  }>;
  total_created: number;
  total_errors: number;
}

// Update operations - extends existing UpdateResult
export interface ApiUpdateNoteResult extends UpdateResult {
  content_hash?: string;
}

export interface ApiBatchUpdateResult {
  updated_notes: ApiUpdateNoteResult[];
  errors: Array<{
    identifier: string;
    error: string;
  }>;
  total_updated: number;
  total_errors: number;
}

// Delete operations - reuse existing type
export type ApiDeleteNoteResult = DeleteNoteResult;

// Rename result
export interface ApiRenameNoteResult {
  id: string;
  old_title: string;
  new_title: string;
  old_filename: string;
  new_filename: string;
  updated_links: number;
  timestamp: string;
}

// Bulk delete result
export interface ApiBulkDeleteResult {
  deleted_notes: ApiDeleteNoteResult[];
  total_deleted: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
}

// ============================================================================
// Note Type Types (Reusing existing types)
// ============================================================================

// Direct exports and extensions
export type ApiNoteTypeInfo = NoteTypeDescription;
export type ApiNoteTypeListItem = NoteTypeListItem;

export interface ApiCreateNoteTypeResult {
  type_name: string;
  path: string;
  created: string;
  content_hash: string;
}

export interface ApiUpdateNoteTypeResult {
  type_name: string;
  updated: boolean;
  timestamp: string;
  content_hash: string;
}

export interface ApiDeleteNoteTypeResult {
  type_name: string;
  deleted: boolean;
  migrated_notes?: number;
  timestamp: string;
}

// ============================================================================
// Search Types (Reusing existing SearchResult)
// ============================================================================

// Direct export of existing search result
export type ApiSearchResult = SearchResult;

// Search response wrapper
export interface ApiSearchResponse {
  results: ApiSearchResult[];
  total: number;
  query: string;
  took: number;
  has_more?: boolean;
}

// Advanced search extends basic search response
export interface ApiAdvancedSearchResponse extends ApiSearchResponse {
  filters_applied: Array<{
    field: string;
    value: unknown;
    operator: string;
  }>;
  sort_applied?: Array<{
    field: string;
    order: 'asc' | 'desc';
  }>;
  offset?: number;
  limit?: number;
}

// SQL search response
export interface ApiSqlSearchResponse {
  results: Array<Record<string, unknown>>;
  columns: string[];
  total: number;
  query: string;
  took: number;
}

// ============================================================================
// Vault Types (Extending existing VaultInfo)
// ============================================================================

// Extended vault info with API-specific fields
export interface ApiVaultInfo extends VaultInfo {
  id: string;
  is_current?: boolean;
  note_count?: number;
  total_size?: number;
}

export interface ApiVaultListResponse {
  vaults: ApiVaultInfo[];
  current_vault_id: string;
  total: number;
}

export interface ApiCreateVaultResult {
  id: string;
  name: string;
  path: string;
  created: string;
  initialized: boolean;
  switched: boolean;
}

export interface ApiVaultOperationResult {
  id: string;
  name: string;
  operation: 'switch' | 'remove' | 'update';
  success: boolean;
  timestamp: string;
  message?: string;
}

// ============================================================================
// Link Types (Reusing existing NoteLinkRow)
// ============================================================================

// Enhanced link with additional API fields
export interface ApiNoteLink extends NoteLinkRow {
  is_broken?: boolean;
}

export interface ApiNoteLinkResponse {
  note_id: string;
  note_title: string;
  outbound_links: ApiNoteLink[];
  total_outbound: number;
}

export interface ApiBacklinksResponse {
  note_id: string;
  note_title: string;
  backlinks: ApiNoteLink[];
  total_backlinks: number;
}

export interface ApiBrokenLinksResponse {
  broken_links: Array<{
    source_note: {
      id: string;
      title: string;
      path: string;
    };
    target_title: string;
    link_text: string | null;
    line_number: number | null;
  }>;
  total_broken: number;
  scanned_notes: number;
}

export interface ApiLinkSearchResponse {
  notes: Array<{
    id: string;
    title: string;
    type: string;
    path: string;
    matched_criteria: string[];
    link_count: number;
  }>;
  total: number;
  criteria: {
    has_links_to?: string[];
    linked_from?: string[];
    external_domains?: string[];
    broken_links?: boolean;
  };
}

export interface ApiMigrateLinksResult {
  total_notes_processed: number;
  total_links_migrated: number;
  notes_with_changes: number;
  migration_time: number;
  errors: Array<{
    note_id: string;
    error: string;
  }>;
}

// ============================================================================
// Resource Types
// ============================================================================

export interface ApiTypesResource {
  types: Array<{
    name: string;
    description: string;
    note_count: number;
    last_used: string | null;
  }>;
  total_types: number;
  vault_id: string;
}

export interface ApiRecentResource {
  recent_notes: Array<{
    id: string;
    title: string;
    type: string;
    path: string;
    modified: string;
    size: number;
  }>;
  total: number;
  limit: number;
  vault_id: string;
}

export interface ApiStatsResource {
  vault: {
    id: string;
    name: string;
    path: string;
  };
  notes: {
    total_count: number;
    by_type: Record<string, number>;
    total_size_bytes: number;
    average_size_bytes: number;
    created_today: number;
    modified_today: number;
  };
  note_types: {
    total_count: number;
    with_descriptions: number;
    with_schemas: number;
  };
  links: {
    total_internal_links: number;
    total_external_links: number;
    broken_links: number;
    notes_with_links: number;
  };
  recent_activity: {
    notes_created_last_7_days: number;
    notes_modified_last_7_days: number;
    most_active_day: string;
  };
  storage: {
    total_size_mb: number;
    note_files_mb: number;
    metadata_size_mb: number;
    index_size_mb: number;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// ============================================================================
// Generic Response Types
// ============================================================================

export type ApiResponse<T> = T | ApiError;

// Helper type to indicate methods that might return arrays or single items
export type ApiNoteResult = ApiNote | null;
export type ApiMultipleNotesResult = Array<{
  identifier: string;
  note: ApiNote | null;
  error?: string;
}>;

// ============================================================================
// Union Types for Common Operations
// ============================================================================

export type ApiCreateResult = ApiCreateNoteResult | ApiBatchCreateResult;
export type ApiUpdateResult = ApiUpdateNoteResult | ApiBatchUpdateResult;
export type ApiSearchResultType =
  | ApiSearchResponse
  | ApiAdvancedSearchResponse
  | ApiSqlSearchResponse;

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

export type { NoteMetadata } from '../types/index.js';
