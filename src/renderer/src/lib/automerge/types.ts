/**
 * Automerge document types for Flint notes storage
 */

/**
 * A note in the Flint system
 */
export interface Note {
  /** Unique identifier, format: "n-xxxxxxxx" (8 hex chars) */
  id: string;
  /** Note title */
  title: string;
  /** Markdown content */
  content: string;
  /** Reference to NoteType.id */
  type: string;
  /** ISO timestamp of creation */
  created: string;
  /** ISO timestamp of last update */
  updated: string;
  /** Soft delete flag */
  archived: boolean;
}

/**
 * A workspace containing notes
 */
export interface Workspace {
  /** Unique identifier, format: "ws-xxxxxxxx" */
  id: string;
  /** Display name */
  name: string;
  /** Emoji icon */
  icon: string;
  /** Ordered list of pinned note IDs (always visible) */
  pinnedNoteIds: string[];
  /** Ordered list of recent note IDs (can be closed) */
  recentNoteIds: string[];
  /** ISO timestamp of creation */
  created: string;
}

/**
 * A note type/category for organizing notes
 */
export interface NoteType {
  /** Unique identifier, format: "type-xxxxxxxx" */
  id: string;
  /** Display name */
  name: string;
  /** Description of this note type's purpose */
  purpose: string;
  /** Emoji icon */
  icon: string;
  /** Soft delete flag - preserves note assignments */
  archived: boolean;
  /** ISO timestamp of creation */
  created: string;
}

/**
 * The root Automerge document structure
 */
export interface NotesDocument {
  /** All notes keyed by ID */
  notes: Record<string, Note>;
  /** All workspaces keyed by ID */
  workspaces: Record<string, Workspace>;
  /** Currently active workspace ID */
  activeWorkspaceId: string;
  /** All note types keyed by ID */
  noteTypes: Record<string, NoteType>;
  /** Ordered list of workspace IDs for display order */
  workspaceOrder?: string[];
}

/**
 * Vault metadata stored in localStorage (not synced via Automerge)
 */
export interface Vault {
  /** Unique identifier, format: "vault-xxxxxxxx" */
  id: string;
  /** Display name */
  name: string;
  /** Automerge document URL */
  docUrl: string;
  /** Soft delete flag */
  archived: boolean;
  /** ISO timestamp of creation */
  created: string;
}
