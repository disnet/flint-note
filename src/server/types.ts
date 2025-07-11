/**
 * Type definitions for the FlintNote MCP Server
 */

import type { MetadataSchema, MetadataFieldDefinition } from '../core/metadata-schema.js';
import type { Workspace } from '../core/workspace.js';
import type { NoteManager } from '../core/notes.js';
import type { NoteTypeManager } from '../core/note-types.js';
import type { HybridSearchManager } from '../database/search-manager.js';

export interface ServerConfig {
  workspacePath?: string;
  throwOnError?: boolean;
}

export interface CreateNoteTypeArgs {
  type_name: string;
  description: string;
  agent_instructions?: string[];
  metadata_schema?: MetadataSchema;
  vault_id?: string;
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
  vault_id?: string;
}

export interface GetNoteArgs {
  identifier: string;
  vault_id?: string;
  fields?: string[];
}

export interface GetNotesArgs {
  identifiers: string[];
  vault_id?: string;
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
  vault_id?: string;
}

export interface SearchNotesArgs {
  query?: string;
  type_filter?: string;
  limit?: number;
  use_regex?: boolean;
  vault_id?: string;
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
  vault_id?: string;
  fields?: string[];
}

export interface SearchNotesSqlArgs {
  query: string;
  params?: (string | number | boolean | null)[];
  limit?: number;
  timeout?: number;
  vault_id?: string;
  fields?: string[];
}

export interface ListNoteTypesArgs {
  vault_id?: string;
}

export interface UpdateNoteTypeArgs {
  type_name: string;
  instructions?: string;
  description?: string;
  metadata_schema?: MetadataFieldDefinition[];
  content_hash: string;
  vault_id?: string;
}

export interface GetNoteTypeInfoArgs {
  type_name: string;
  vault_id?: string;
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
  vault_id?: string;
}

export interface ListNotesByTypeArgs {
  type: string;
  limit?: number;
  vault_id?: string;
}

export interface DeleteNoteArgs {
  identifier: string;
  confirm?: boolean;
  vault_id?: string;
}

export interface DeleteNoteTypeArgs {
  type_name: string;
  action: 'error' | 'migrate' | 'delete';
  target_type?: string;
  confirm?: boolean;
  vault_id?: string;
}

export interface BulkDeleteNotesArgs {
  type?: string;
  tags?: string[];
  pattern?: string;
  confirm?: boolean;
  vault_id?: string;
}

export interface RenameNoteArgs {
  identifier: string;
  new_title: string;
  content_hash: string;
  vault_id?: string;
}

/**
 * Vault-specific operation context
 */
export interface VaultContext {
  workspace: Workspace;
  noteManager: NoteManager;
  noteTypeManager: NoteTypeManager;
  hybridSearchManager: HybridSearchManager;
}
