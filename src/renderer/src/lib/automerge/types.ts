/**
 * Automerge document types for Flint notes storage
 */

// ============================================================================
// Sidebar Item Types (unified notes + conversations)
// ============================================================================

/**
 * Types of items that can appear in the sidebar
 * Extensible for future types: 'epub' | 'pdf' | 'bookmark'
 */
export type SidebarItemType = 'note' | 'conversation';

/**
 * Reference to a sidebar item stored in workspace arrays
 */
export interface SidebarItemRef {
  type: SidebarItemType;
  id: string;
}

/**
 * Full sidebar item for display purposes
 */
export interface SidebarItem {
  id: string;
  type: SidebarItemType;
  title: string;
  icon: string;
  updated: string;
  metadata?: {
    noteTypeId?: string;
    messageCount?: number;
    isPreview?: boolean;
  };
}

/**
 * Currently active item in the main view
 */
export type ActiveItem =
  | { type: 'note'; id: string }
  | { type: 'conversation'; id: string }
  | null;

/**
 * System views available in the main view area
 */
export type SystemView =
  | 'notes'
  | 'settings'
  | 'search'
  | 'types'
  | 'daily'
  | 'conversations'
  | null;

/**
 * Persisted view state for restoring on app restart
 */
export interface LastViewState {
  /** The last active item (note or conversation) */
  activeItem: ActiveItem;
  /** The last system view that was open */
  systemView: SystemView;
}

// ============================================================================
// Property Types
// ============================================================================

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
 * A workspace containing notes and conversations
 */
export interface Workspace {
  /** Unique identifier, format: "ws-xxxxxxxx" */
  id: string;
  /** Display name */
  name: string;
  /** Emoji icon */
  icon: string;
  /** Ordered list of pinned items (always visible) */
  pinnedItemIds: SidebarItemRef[];
  /** Ordered list of recent items (can be closed), sorted by activity */
  recentItemIds: SidebarItemRef[];
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
  /** Items on the shelf (optional for backward compatibility) */
  shelfItems?: ShelfItemData[];
  /** Last view state for restoring on app restart (optional for backward compatibility) */
  lastViewState?: LastViewState;
}

/**
 * Shelf item stored in Automerge document
 */
export interface ShelfItemData {
  type: 'note' | 'conversation';
  id: string;
  isExpanded: boolean;
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

// ============================================================================
// EPUB Types
// ============================================================================

/**
 * EPUB-specific properties stored in Note.props
 */
export interface EpubNoteProps {
  /** SHA-256 hash of EPUB content, used for OPFS lookup */
  epubHash: string;
  /** Book title extracted from EPUB metadata */
  epubTitle?: string;
  /** Book author extracted from EPUB metadata */
  epubAuthor?: string;
  /** Current reading position (EPUB CFI format) */
  currentCfi?: string;
  /** Reading progress percentage (0-100) */
  progress?: number;
  /** ISO timestamp of last reading session */
  lastRead?: string;
  /** Font size preference (75-200) */
  textSize?: number;
}

/**
 * A highlight/annotation in an EPUB
 */
export interface EpubHighlight {
  /** Unique identifier, format: "h-{timestamp.toString(36)}" */
  id: string;
  /** EPUB CFI pointing to the highlighted range */
  cfi: string;
  /** The highlighted text content */
  text: string;
  /** ISO timestamp of when the highlight was created */
  createdAt: string;
}

/**
 * Table of contents item from EPUB navigation
 */
export interface EpubTocItem {
  /** Display label for the TOC entry */
  label: string;
  /** Navigation target (href or CFI) */
  href: string;
  /** Nested TOC items (for chapters with subsections) */
  subitems?: EpubTocItem[];
}

/**
 * EPUB metadata extracted from the book
 */
export interface EpubMetadata {
  /** Book title */
  title?: string;
  /** Book author(s) */
  author?: string;
  /** Publisher name */
  publisher?: string;
  /** Language code (e.g., "en", "de") */
  language?: string;
  /** Book description/summary */
  description?: string;
}

/**
 * Reading location information
 */
export interface EpubLocation {
  /** Current section/chapter index */
  index: number;
  /** Progress fraction within the book (0-1) */
  fraction: number;
  /** Total number of sections/locations */
  totalLocations: number;
}
