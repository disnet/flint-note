export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

export interface ChatService {
  sendMessage(text: string): Promise<string>;
}

// Note-related types
export interface Note {
  id: string;
  type: string;
  filename: string;
  path: string;
  title: string;
  content: string;
  content_hash: string;
  metadata: {
    title: string;
    type: string;
    created: string;
    updated: string;
    tags?: string[];
    [key: string]: any;
  };
  created: string;
  modified: string;
  updated: string;
  size: number;
}

export interface NoteListItem {
  id: string;
  type: string;
  filename: string;
  title: string;
  created: string;
  modified: string;
  size: number;
  tags?: string[];
  path: string;
}

export interface SearchResult {
  notes: NoteListItem[];
  total: number;
  query: string;
  timing_ms: number;
}

export interface NoteType {
  name: string;
  description: string;
  agent_instructions: string[];
  metadata_schema?: any;
  count: number;
}

export interface Vault {
  id: string;
  name: string;
  path: string;
  description?: string;
  is_current: boolean;
  note_count: number;
  size_bytes: number;
}

export interface NoteService {
  // Note operations
  createNote(
    type: string,
    identifier: string,
    content: string,
    vaultId?: string
  ): Promise<any>;
  getNote(identifier: string, vaultId?: string): Promise<Note | null>;
  updateNote(identifier: string, content: string, vaultId?: string): Promise<any>;
  deleteNote(identifier: string, vaultId?: string): Promise<any>;
  renameNote(identifier: string, newIdentifier: string, vaultId?: string): Promise<any>;

  // Search operations
  searchNotes(query: string, vaultId?: string, limit?: number): Promise<SearchResult>;
  searchNotesAdvanced(params: {
    query: string;
    type?: string;
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    vaultId?: string;
  }): Promise<SearchResult>;

  // Note type operations
  listNoteTypes(vaultId?: string): Promise<NoteType[]>;
  createNoteType(params: {
    typeName: string;
    description: string;
    agentInstructions?: string[];
    metadataSchema?: any;
    vaultId?: string;
  }): Promise<any>;
  listNotesByType(
    type: string,
    vaultId?: string,
    limit?: number
  ): Promise<NoteListItem[]>;

  // Vault operations
  listVaults(): Promise<Vault[]>;
  getCurrentVault(): Promise<Vault>;
  createVault(name: string, path: string, description?: string): Promise<any>;
  switchVault(vaultId: string): Promise<any>;

  // Link operations
  getNoteLinks(identifier: string, vaultId?: string): Promise<any>;
  getBacklinks(identifier: string, vaultId?: string): Promise<any>;
  findBrokenLinks(vaultId?: string): Promise<any>;

  // Resource operations (MCP-style)
  getTypesResource(): Promise<any>;
  getRecentResource(): Promise<any>;
  getStatsResource(): Promise<any>;

  // Service status
  isReady(): Promise<boolean>;
}
