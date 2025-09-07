/**
 * Shared FlintNote API Type Definitions
 *
 * This file contains the complete TypeScript type definitions for the FlintNote API
 * that are used by both the TypeScript compiler and system prompt documentation.
 */

export const FLINT_API_TYPE_DEFINITIONS = `
declare namespace FlintAPI {
  // Unified FlintAPI interface with all methods
  interface FlintAPI {
    // Note methods
    createNote(options: CreateNoteOptions): Promise<CreateNoteResult>;
    getNote(id: string): Promise<Note>;
    updateNote(options: UpdateNoteOptions): Promise<UpdateNoteResult>;
    deleteNote(options: DeleteNoteOptions): Promise<DeleteNoteResult>;
    listNotes(options?: ListNotesOptions): Promise<NoteInfo[]>;
    renameNote(options: RenameNoteOptions): Promise<RenameNoteResult>;
    moveNote(options: MoveNoteOptions): Promise<MoveNoteResult>;
    searchNotes(options: SearchNotesOptions): Promise<SearchResult[]>;

    // Note Type methods
    createNoteType(options: CreateNoteTypeOptions): Promise<CreateNoteTypeResult>;
    listNoteTypes(): Promise<NoteTypeInfo[]>;
    getNoteType(typeName: string): Promise<NoteType>;
    updateNoteType(options: UpdateNoteTypeOptions): Promise<UpdateNoteTypeResult>;
    deleteNoteType(options: DeleteNoteTypeOptions): Promise<DeleteNoteTypeResult>;

    // Vault methods
    getCurrentVault(): Promise<Vault | null>;
    listVaults(): Promise<Vault[]>;
    createVault(options: CreateVaultOptions): Promise<Vault>;
    switchVault(vaultId: string): Promise<void>;
    updateVault(options: UpdateVaultOptions): Promise<void>;
    removeVault(vaultId: string): Promise<void>;

    // Link methods
    getNoteLinks(id: string): Promise<LinkInfo>;
    getBacklinks(id: string): Promise<Array<{
      source_id: string;
      source_title: string;
      source_type: string;
      link_text: string;
      context: string;
    }>>;
    findBrokenLinks(): Promise<Array<{
      source_id: string;
      source_title: string;
      target_reference: string;
      link_text: string;
      context: string;
    }>>;
    searchByLinks(options: { text?: string; url?: string }): Promise<Array<{
      source_id: string;
      source_title: string;
      target_reference: string;
      link_text: string;
      context: string;
    }>>;
    migrateLinks(options: {
      oldReference: string;
      newReference: string;
    }): Promise<{ updated_notes: number }>;

    // Hierarchy methods
    addSubnote(options: {
      parent_id: string;
      child_id: string;
      order?: number;
    }): Promise<void>;
    removeSubnote(options: {
      parent_id: string;
      child_id: string;
    }): Promise<void>;
    reorderSubnotes(options: {
      parent_id: string;
      child_orders: Array<{ child_id: string; order: number }>;
    }): Promise<void>;
    getHierarchyPath(id: string): Promise<Array<{
      id: string;
      title: string;
      type: string;
    }>>;
    getDescendants(id: string): Promise<Array<{
      id: string;
      title: string;
      type: string;
      depth: number;
      order: number;
    }>>;
    getChildren(id: string): Promise<Array<{
      id: string;
      title: string;
      type: string;
      order: number;
    }>>;
    getParents(id: string): Promise<Array<{
      id: string;
      title: string;
      type: string;
    }>>;

    // Relationship methods
    getNoteRelationships(id: string): Promise<{
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
    getRelatedNotes(id: string, options?: {
      limit?: number;
      min_strength?: number;
    }): Promise<Array<{
      id: string;
      title: string;
      type: string;
      connection_strength: number;
      connection_types: string[];
    }>>;
    findRelationshipPath(fromId: string, toId: string): Promise<Array<{
      id: string;
      title: string;
      type: string;
    }> | null>;
    getClusteringCoefficient(id: string): Promise<number>;
  }

  interface CreateNoteOptions {
    type: string;
    title: string;
    content: string;
    metadata?: Record<string, any>;
    vaultId?: string;
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
    id: string;
    content?: string;
    contentHash?: string;
    metadata?: Record<string, any>;
    vaultId?: string;
  }

  interface UpdateNoteResult {
    id: string;
    updated: string;
    content_hash: string;
  }

  interface DeleteNoteOptions {
    id: string;
    contentHash?: string;
    vaultId?: string;
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
    vaultId?: string;
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
    id: string;
    newTitle: string;
    contentHash?: string;
    vaultId?: string;
  }

  interface RenameNoteResult {
    id: string;
    old_title: string;
    new_title: string;
    old_path: string;
    new_path: string;
  }

  interface MoveNoteOptions {
    id: string;
    newType: string;
    contentHash?: string;
    vaultId?: string;
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
    vaultId?: string;
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

  // Legacy interfaces for backward compatibility (deprecated)

  interface CreateNoteTypeOptions {
    typeName: string;
    description?: string;
    agent_instructions?: string;
    template?: string;
    vaultId?: string;
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
    typeName: string;
    description?: string;
    agent_instructions?: string;
    template?: string;
    vaultId?: string;
  }

  interface UpdateNoteTypeResult {
    name: string;
    updated: string;
  }

  interface DeleteNoteTypeOptions {
    typeName: string;
    deleteNotes?: boolean;
    vaultId?: string;
  }

  interface DeleteNoteTypeResult {
    name: string;
    deleted: boolean;
    notes_affected: number;
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
    vaultId: string;
    name?: string;
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



  // Utils API (remains unchanged as utilities)
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
declare const flintApi: FlintAPI.FlintAPI;
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
