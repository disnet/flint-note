/**
 * Automerge document types for Flint notes storage
 */

/**
 * Property field types supported in note type schemas
 */
export type PropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'select'
  | 'notelink' // Single note reference (stored as n-xxxxxxxx)
  | 'notelinks'; // Array of note references

/**
 * Constraints for property values
 */
export interface PropertyConstraints {
  /** Minimum value (for numbers) or minimum length (for arrays) */
  min?: number;
  /** Maximum value (for numbers) or maximum length (for arrays) */
  max?: number;
  /** Regex pattern for string validation */
  pattern?: string;
  /** Valid options for select fields */
  options?: string[];
  /** Date format specification */
  format?: string;
}

/**
 * Definition of a property field in a note type schema
 */
export interface PropertyDefinition {
  /** Property name (used as key in note.props) */
  name: string;
  /** Data type of the property */
  type: PropertyType;
  /** Human-readable description */
  description?: string;
  /** Whether the property is required */
  required?: boolean;
  /** Value constraints */
  constraints?: PropertyConstraints;
  /** Default value when creating a new note */
  default?: string | number | boolean | string[];
}

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
  /** Custom property values defined by the note's type */
  props?: Record<string, unknown>;
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
  /** Ordered list of recent conversation IDs (optional for backward compatibility) */
  recentConversationIds?: string[];
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
  /** Property schema defining custom fields for notes of this type */
  properties?: PropertyDefinition[];
  /** Names of properties to display as chips in the editor (defaults to system fields if not set) */
  editorChips?: string[];
}

/**
 * A persisted tool call in a conversation
 */
export interface PersistedToolCall {
  /** Unique identifier */
  id: string;
  /** Tool function name */
  name: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** Result returned by the tool */
  result?: unknown;
  /** Execution status */
  status: 'pending' | 'running' | 'completed' | 'error';
  /** Error message if status is 'error' */
  error?: string;
}

/**
 * A persisted message in a conversation
 */
export interface PersistedChatMessage {
  /** Unique identifier, format: "msg-xxxxxxxx" */
  id: string;
  /** Message role */
  role: 'user' | 'assistant' | 'system';
  /** Message content (markdown) */
  content: string;
  /** Tool calls made by assistant (if any) */
  toolCalls?: PersistedToolCall[];
  /** ISO timestamp of creation */
  createdAt: string;
}

/**
 * A conversation containing chat messages
 */
export interface Conversation {
  /** Unique identifier, format: "conv-xxxxxxxx" */
  id: string;
  /** Auto-generated from first user message, or "New Conversation" */
  title: string;
  /** Workspace this conversation belongs to */
  workspaceId: string;
  /** Ordered list of messages */
  messages: PersistedChatMessage[];
  /** ISO timestamp of creation */
  created: string;
  /** ISO timestamp of last activity */
  updated: string;
  /** Soft delete flag */
  archived: boolean;
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
  /** All conversations keyed by ID (optional for backward compatibility) */
  conversations?: Record<string, Conversation>;
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
  /** Optional base directory for file system sync */
  baseDirectory?: string;
  /** Soft delete flag */
  archived: boolean;
  /** ISO timestamp of creation */
  created: string;
}
