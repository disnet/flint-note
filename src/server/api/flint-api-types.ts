/**
 * Shared FlintNote API Type Definitions
 *
 * This file contains the complete TypeScript type definitions for the FlintNote API
 * that are used by both the TypeScript compiler and system prompt documentation.
 */

export const FLINT_API_TYPE_DEFINITIONS = `
declare namespace FlintAPI {
  // Notes API
  interface NotesAPI {
    create(options: CreateNoteOptions): Promise<CreateNoteResult>;
    get(identifier: string): Promise<Note | null>;
    update(options: UpdateNoteOptions): Promise<UpdateNoteResult>;
    delete(options: DeleteNoteOptions): Promise<DeleteNoteResult>;
    list(options?: ListNotesOptions): Promise<NoteInfo[]>;
    rename(options: RenameNoteOptions): Promise<RenameNoteResult>;
    move(options: MoveNoteOptions): Promise<MoveNoteResult>;
    search(options: SearchNotesOptions): Promise<SearchResult[]>;
  }

  interface CreateNoteOptions {
    type: string;
    title: string;
    content: string;
    metadata?: Record<string, any>;
  }

  interface CreateNoteResult {
    id: string;
    type: string;
    title: string;
    filename: string;
    path: string;
    created: string;
  }

  interface UpdateNoteOptions {
    identifier: string;
    content?: string;
    contentHash?: string;
    metadata?: Record<string, any>;
  }

  interface UpdateNoteResult {
    id: string;
    updated: string;
    content_hash: string;
  }

  interface DeleteNoteOptions {
    identifier: string;
    contentHash?: string;
  }

  interface DeleteNoteResult {
    id: string;
    deleted: boolean;
  }

  interface ListNotesOptions {
    typeName?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'created' | 'updated' | 'title';
    sortOrder?: 'asc' | 'desc';
  }

  interface Note {
    id: string;
    title: string;
    content: string;
    metadata: Record<string, any>;
    content_hash: string;
    links: any[];
    type: string;
    created: string;
    updated: string;
    size: number;
    tags: string[];
    path: string;
  }

  interface NoteInfo {
    id: string;
    title: string;
    type: string;
    created: string;
    updated: string;
    size: number;
    tags: string[];
    path: string;
  }

  interface RenameNoteOptions {
    identifier: string;
    newTitle: string;
    contentHash?: string;
  }

  interface RenameNoteResult {
    id: string;
    old_title: string;
    new_title: string;
    old_path: string;
    new_path: string;
  }

  interface MoveNoteOptions {
    identifier: string;
    newPath: string;
    contentHash?: string;
  }

  interface MoveNoteResult {
    id: string;
    old_path: string;
    new_path: string;
  }

  interface SearchNotesOptions {
    query: string;
    types?: string[];
    limit?: number;
    offset?: number;
  }

  interface SearchResult {
    id: string;
    title: string;
    type: string;
    path: string;
    score: number;
    matches: {
      field: string;
      value: string;
      highlight: string;
    }[];
  }

  // Note Types API
  interface NoteTypesAPI {
    create(options: CreateNoteTypeOptions): Promise<CreateNoteTypeResult>;
    list(): Promise<NoteTypeInfo[]>;
    get(typeName: string): Promise<NoteType>;
    update(options: UpdateNoteTypeOptions): Promise<UpdateNoteTypeResult>;
    delete(options: DeleteNoteTypeOptions): Promise<DeleteNoteTypeResult>;
  }

  interface CreateNoteTypeOptions {
    name: string;
    description?: string;
    agent_instructions?: string;
    template?: string;
  }

  interface CreateNoteTypeResult {
    name: string;
    created: string;
  }

  interface NoteTypeInfo {
    name: string;
    description?: string;
    created: string;
    updated: string;
    note_count: number;
  }

  interface NoteType {
    name: string;
    description?: string;
    agent_instructions?: string;
    template?: string;
    created: string;
    updated: string;
  }

  interface UpdateNoteTypeOptions {
    name: string;
    description?: string;
    agent_instructions?: string;
    template?: string;
  }

  interface UpdateNoteTypeResult {
    name: string;
    updated: string;
  }

  interface DeleteNoteTypeOptions {
    name: string;
    deleteNotes?: boolean;
  }

  interface DeleteNoteTypeResult {
    name: string;
    deleted: boolean;
    notes_affected: number;
  }

  // Vaults API
  interface VaultsAPI {
    getCurrent(): Promise<Vault | null>;
    list(): Promise<Vault[]>;
    create(options: CreateVaultOptions): Promise<Vault>;
    switch(vaultId: string): Promise<void>;
    update(options: UpdateVaultOptions): Promise<void>;
    remove(vaultId: string): Promise<void>;
  }

  interface Vault {
    id: string;
    name: string;
    path: string;
    created: string;
    updated: string;
    is_current: boolean;
  }

  interface CreateVaultOptions {
    name: string;
    path: string;
  }

  interface UpdateVaultOptions {
    id: string;
    name?: string;
  }

  // Links API
  interface LinksAPI {
    getForNote(noteId: string): Promise<LinkInfo>;
    getBacklinks(noteId: string): Promise<Array<{
      source_id: string;
      source_title: string;
      source_type: string;
      link_text: string;
      context: string;
    }>>;
    findBroken(): Promise<Array<{
      source_id: string;
      source_title: string;
      target_reference: string;
      link_text: string;
      context: string;
    }>>;
    searchBy(options: { text?: string; url?: string }): Promise<Array<{
      source_id: string;
      source_title: string;
      target_reference: string;
      link_text: string;
      context: string;
    }>>;
    migrate(options: {
      oldReference: string;
      newReference: string;
    }): Promise<{ updated_notes: number }>;
  }

  interface LinkInfo {
    outgoing_internal: Array<{
      target_id: string;
      target_title: string;
      target_type: string;
      link_text: string;
      context: string;
    }>;
    outgoing_external: Array<{
      url: string;
      link_text: string;
      context: string;
    }>;
    incoming: Array<{
      source_id: string;
      source_title: string;
      source_type: string;
      link_text: string;
      context: string;
    }>;
  }

  // Hierarchy API
  interface HierarchyAPI {
    addSubnote(options: {
      parent_id: string;
      child_id: string;
      order?: number;
    }): Promise<void>;
    
    removeSubnote(options: {
      parent_id: string;
      child_id: string;
    }): Promise<void>;
    
    reorder(options: {
      parent_id: string;
      child_orders: Array<{ child_id: string; order: number }>;
    }): Promise<void>;
    
    getPath(noteId: string): Promise<Array<{
      id: string;
      title: string;
      type: string;
    }>>;
    
    getDescendants(noteId: string): Promise<Array<{
      id: string;
      title: string;
      type: string;
      depth: number;
      order: number;
    }>>;
    
    getChildren(noteId: string): Promise<Array<{
      id: string;
      title: string;
      type: string;
      order: number;
    }>>;
    
    getParents(noteId: string): Promise<Array<{
      id: string;
      title: string;
      type: string;
    }>>;
  }

  // Relationships API
  interface RelationshipsAPI {
    get(noteId: string): Promise<{
      direct_connections: number;
      total_reachable: number;
      clustering_coefficient: number;
      related_notes: Array<{
        id: string;
        title: string;
        type: string;
        connection_strength: number;
        connection_types: string[];
      }>;
    }>;
    
    getRelated(noteId: string, options?: {
      limit?: number;
      min_strength?: number;
    }): Promise<Array<{
      id: string;
      title: string;
      type: string;
      connection_strength: number;
      connection_types: string[];
    }>>;
    
    findPath(fromId: string, toId: string): Promise<Array<{
      id: string;
      title: string;
      type: string;
    }> | null>;
    
    getClusteringCoefficient(noteId: string): Promise<number>;
  }

  // Utils API
  interface UtilsAPI {
    generateId(): string;
    parseLinks(content: string): Array<{
      type: 'internal' | 'external';
      reference: string;
      text: string;
      start: number;
      end: number;
    }>;
    formatDate(date: string | Date, format?: string): string;
    sanitizeTitle(title: string): string;
  }
}

// Global API objects available in execution context
declare const notes: FlintAPI.NotesAPI;
declare const noteTypes: FlintAPI.NoteTypesAPI;
declare const vaults: FlintAPI.VaultsAPI;
declare const links: FlintAPI.LinksAPI;
declare const hierarchy: FlintAPI.HierarchyAPI;
declare const relationships: FlintAPI.RelationshipsAPI;
declare const utils: FlintAPI.UtilsAPI;

// Global type aliases for common types
type Note = FlintAPI.Note;
type NoteInfo = FlintAPI.NoteInfo;
type CreateNoteResult = FlintAPI.CreateNoteResult;
type UpdateNoteResult = FlintAPI.UpdateNoteResult;
type DeleteNoteResult = FlintAPI.DeleteNoteResult;
type RenameNoteResult = FlintAPI.RenameNoteResult;
type MoveNoteResult = FlintAPI.MoveNoteResult;
type SearchResult = FlintAPI.SearchResult;
type NoteType = FlintAPI.NoteType;
type NoteTypeInfo = FlintAPI.NoteTypeInfo;
type Vault = FlintAPI.Vault;
type LinkInfo = FlintAPI.LinkInfo;
`;
