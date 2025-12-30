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
    archived?: boolean;
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
  | 'settings'
  | 'search'
  | 'types'
  | 'daily'
  | 'conversations'
  | 'review'
  | 'inbox'
  | 'routines'
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
 * Source format for note content.
 * Determines which viewer/editor to use, independent of the organizational note type.
 */
export type SourceFormat = 'markdown' | 'pdf' | 'epub' | 'webpage' | 'deck';

/**
 * A note in the Flint system (full note with content loaded)
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
  /** Review mode metadata (optional, only for notes with review enabled) */
  review?: ReviewData;
  /** ISO timestamp of last time this note was opened/viewed (optional for backward compatibility) */
  lastOpened?: string;
  /** Source format - determines which viewer to use (optional for backward compatibility) */
  sourceFormat?: SourceFormat;
}

/**
 * Note metadata stored in the root document (without content).
 * Content is stored in a separate NoteContentDocument.
 */
export type NoteMetadata = Omit<Note, 'content'>;

// ============================================================================
// Note Filter Types (for agent search tool)
// ============================================================================

/**
 * Filter operator for note queries
 */
export type NoteFilterOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'LIKE'
  | 'IN'
  | 'NOT IN'
  | 'BETWEEN';

/**
 * A single filter condition for note queries
 */
export interface NoteFilter {
  /** Field to filter on (system: type, title, created, updated, archived; or custom prop name) */
  field: string;
  /** Comparison operator (default: =) */
  operator?: NoteFilterOperator;
  /** Value to compare against (array for IN/NOT IN/BETWEEN) */
  value: string | string[];
}

/**
 * Input for filtering notes
 */
export interface NoteFilterInput {
  /** Array of filter conditions */
  filters?: NoteFilter[];
  /** How to combine filters: AND (all must match) or OR (any can match) */
  logic?: 'AND' | 'OR';
}

/**
 * Separate Automerge document for note content.
 * Each note has its own content document for lazy loading and better sync performance.
 */
export interface NoteContentDocument {
  /** Reference to the note this content belongs to */
  noteId: string;
  /** The markdown content */
  content: string;
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
  /** Instructions for AI agents when working with notes of this type */
  agentInstructions?: string;
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
  /** Commentary text that preceded this tool call */
  commentary?: string;
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
 * A conversation containing chat messages.
 * Full conversation data is stored in OPFS, not in Automerge.
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
 * Lightweight conversation metadata stored in the Automerge index.
 * Full conversation content is stored in OPFS.
 */
export interface ConversationIndexEntry {
  /** Unique identifier, format: "conv-xxxxxxxx" */
  id: string;
  /** Title for display in lists */
  title: string;
  /** Workspace this conversation belongs to */
  workspaceId: string;
  /** ISO timestamp of creation */
  created: string;
  /** ISO timestamp of last activity */
  updated: string;
  /** Soft delete flag */
  archived: boolean;
  /** Message count for display purposes */
  messageCount: number;
}

// ============================================================================
// Agent Routine Types
// ============================================================================

/**
 * Status of an agent routine
 */
export type AgentRoutineStatus = 'active' | 'paused' | 'completed' | 'archived';

/**
 * Type of agent routine
 */
export type AgentRoutineType = 'routine' | 'backlog';

/**
 * Recurring schedule specification
 */
export interface RecurringSpec {
  frequency: 'daily' | 'weekly' | 'monthly';
  /** Day of week (0-6, 0=Sunday) for weekly routines */
  dayOfWeek?: number;
  /** Day of month (1-31) for monthly routines */
  dayOfMonth?: number;
  /** Time of day in "HH:MM" format */
  time?: string;
}

/**
 * Supplementary material attached to a routine
 */
export interface SupplementaryMaterial {
  /** Unique identifier, format: "wm-xxxxxxxx" */
  id: string;
  /** Type of material */
  materialType: 'text' | 'code' | 'note_reference';
  /** Content for text/code types */
  content?: string;
  /** Note ID for note_reference type */
  noteId?: string;
  /** Additional metadata */
  metadata?: {
    /** Programming language for code type */
    language?: string;
    /** Description of the material */
    description?: string;
    /** Template type identifier */
    templateType?: string;
  };
  /** Display order */
  position: number;
  /** ISO timestamp of creation */
  createdAt: string;
}

/**
 * A completion record for an agent routine
 */
export interface RoutineCompletion {
  /** Unique identifier, format: "wc-xxxxxxxx" */
  id: string;
  /** ISO timestamp of completion */
  completedAt: string;
  /** Associated conversation ID (if any) */
  conversationId?: string;
  /** Notes about the completion */
  notes?: string;
  /** ID of note created as output (if any) */
  outputNoteId?: string;
  /** Execution metadata */
  metadata?: {
    /** Execution duration in milliseconds */
    durationMs?: number;
    /** Number of tool calls made */
    toolCallsCount?: number;
  };
}

/**
 * An agent routine (migrated from legacy "workflow")
 */
export interface AgentRoutine {
  /** Unique identifier, format: "w-xxxxxxxx" (preserved from legacy) */
  id: string;
  /** Short name (1-20 chars) */
  name: string;
  /** One-sentence description (1-100 chars) */
  purpose: string;
  /** Detailed markdown instructions */
  description: string;
  /** Current status */
  status: AgentRoutineStatus;
  /** Routine type */
  type: AgentRoutineType;
  /** Scheduling specification for recurring routines */
  recurringSpec?: RecurringSpec;
  /** Due date for one-time routines (ISO datetime) */
  dueDate?: string;
  /** Last time this routine was completed (ISO datetime) */
  lastCompleted?: string;
  /** ISO timestamp of creation */
  created: string;
  /** ISO timestamp of last update */
  updated: string;
  /** Embedded supplementary materials */
  supplementaryMaterials?: SupplementaryMaterial[];
  /** Embedded completion history (limited during migration) */
  completionHistory?: RoutineCompletion[];
}

/**
 * Due status type for routine list items
 */
export type RoutineDueType = 'overdue' | 'due_now' | 'upcoming' | 'scheduled';

/**
 * Lightweight routine item for list views with computed due info
 */
export interface RoutineListItem {
  id: string;
  name: string;
  purpose: string;
  status: AgentRoutineStatus;
  type: AgentRoutineType;
  isRecurring: boolean;
  dueInfo?: {
    type: RoutineDueType;
    dueDate?: string;
    recurringSchedule?: string;
  };
  lastCompleted?: string;
}

/**
 * Input for creating a routine
 */
export interface CreateRoutineInput {
  name: string;
  purpose: string;
  description: string;
  status?: AgentRoutineStatus;
  type?: AgentRoutineType;
  recurringSpec?: RecurringSpec;
  dueDate?: string;
  supplementaryMaterials?: Array<{
    type: 'text' | 'code' | 'note_reference';
    content?: string;
    noteId?: string;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Input for updating a routine
 */
export interface UpdateRoutineInput {
  routineId: string;
  name?: string;
  purpose?: string;
  description?: string;
  status?: AgentRoutineStatus;
  type?: AgentRoutineType;
  recurringSpec?: RecurringSpec | null;
  dueDate?: string | null;
}

/**
 * Input for completing a routine
 */
export interface CompleteRoutineInput {
  routineId: string;
  conversationId?: string;
  notes?: string;
  outputNoteId?: string;
  metadata?: {
    durationMs?: number;
    toolCallsCount?: number;
  };
}

/**
 * Input for listing routines
 */
export interface ListRoutinesInput {
  status?: AgentRoutineStatus | 'all';
  type?: AgentRoutineType | 'all';
  dueSoon?: boolean;
  recurringOnly?: boolean;
  overdueOnly?: boolean;
  includeArchived?: boolean;
  sortBy?: 'dueDate' | 'created' | 'name' | 'lastCompleted';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Input for getting a routine
 */
export interface GetRoutineInput {
  routineId?: string;
  routineName?: string;
  includeSupplementaryMaterials?: boolean;
  includeCompletionHistory?: boolean;
  completionHistoryLimit?: number;
}

/**
 * The root Automerge document structure
 */
export interface NotesDocument {
  /** Document schema version for migrations (undefined = 0) */
  schemaVersion?: number;
  /** All note metadata keyed by ID (content is in separate NoteContentDocument) */
  notes: Record<string, NoteMetadata>;
  /** All workspaces keyed by ID */
  workspaces: Record<string, Workspace>;
  /** Currently active workspace ID */
  activeWorkspaceId: string;
  /** All note types keyed by ID */
  noteTypes: Record<string, NoteType>;
  /** Ordered list of workspace IDs for display order */
  workspaceOrder?: string[];
  /** Conversation index - lightweight metadata only, full data in OPFS */
  conversationIndex?: Record<string, ConversationIndexEntry>;
  /** Items on the shelf (optional for backward compatibility) */
  shelfItems?: ShelfItemData[];
  /** Last view state for restoring on app restart (optional for backward compatibility) */
  lastViewState?: LastViewState;
  /** Agent routines keyed by ID (optional for backward compatibility) */
  agentRoutines?: Record<string, AgentRoutine>;
  /** Review mode state (optional for backward compatibility) */
  reviewState?: ReviewState;
  /** Processed note IDs: noteId -> ISO timestamp when processed (optional for backward compatibility) */
  processedNoteIds?: Record<string, string>;
  /** Mapping of noteId -> Automerge URL for content documents */
  contentUrls?: Record<string, string>;
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
 * Inbox note for display in the inbox view
 */
export interface InboxNote {
  /** Note ID */
  id: string;
  /** Note title */
  title: string;
  /** Note type ID */
  type: string;
  /** ISO timestamp of creation */
  created: string;
  /** ISO timestamp when processed (if in processed view) */
  processedAt?: string;
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

// ============================================================================
// PDF Types
// ============================================================================

/**
 * PDF-specific properties stored in Note.props
 */
export interface PdfNoteProps {
  /** SHA-256 hash of PDF content, used for OPFS lookup */
  pdfHash: string;
  /** Document title extracted from PDF metadata */
  pdfTitle?: string;
  /** Document author extracted from PDF metadata */
  pdfAuthor?: string;
  /** Total number of pages in the PDF */
  totalPages: number;
  /** Current page number (1-indexed) */
  currentPage?: number;
  /** Zoom level percentage (50-200) */
  zoomLevel?: number;
  /** ISO timestamp of last reading session */
  lastRead?: string;
}

/**
 * A highlight/annotation in a PDF
 */
export interface PdfHighlight {
  /** Unique identifier, format: "h-{timestamp.toString(36)}" */
  id: string;
  /** Page number where the highlight is located (1-indexed) */
  pageNumber: number;
  /** The highlighted text content */
  text: string;
  /** Bounding rectangles for the highlight (normalized coordinates 0-1) */
  rects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  /** ISO timestamp of when the highlight was created */
  createdAt: string;
}

/**
 * Outline/bookmark item from PDF navigation
 */
export interface PdfOutlineItem {
  /** Display label for the outline entry */
  label: string;
  /** Target page number (1-indexed) */
  pageNumber: number;
  /** Nested outline items (for sections with subsections) */
  children?: PdfOutlineItem[];
}

/**
 * PDF metadata extracted from the document
 */
export interface PdfMetadata {
  /** Document title */
  title?: string;
  /** Document author(s) */
  author?: string;
  /** Document creator application */
  creator?: string;
  /** PDF producer application */
  producer?: string;
  /** Total page count */
  pageCount: number;
}

// ============================================================================
// Webpage Archive Types
// ============================================================================

/**
 * Webpage-specific properties stored in Note.props
 */
export interface WebpageNoteProps {
  /** SHA-256 hash of archived HTML content, used for OPFS lookup */
  webpageHash: string;
  /** Original URL of the webpage */
  webpageUrl: string;
  /** Article title extracted from the page */
  webpageTitle?: string;
  /** Article author/byline extracted from the page */
  webpageAuthor?: string;
  /** Website name (e.g., "The New York Times") */
  webpageSiteName?: string;
  /** Article excerpt/description */
  webpageExcerpt?: string;
  /** Reading progress percentage (0-100) */
  progress?: number;
  /** ISO timestamp of last reading session */
  lastRead?: string;
  /** ISO timestamp when the page was archived */
  archivedAt?: string;
}

/**
 * Metadata extracted from a webpage during archiving
 */
export interface WebpageMetadata {
  /** Original URL */
  url: string;
  /** Article title */
  title: string;
  /** Website name */
  siteName?: string;
  /** Article author/byline */
  author?: string;
  /** Article excerpt/description */
  excerpt?: string;
  /** ISO timestamp when fetched */
  fetchedAt: string;
  /** Language code */
  lang?: string;
  /** Text direction */
  dir?: string;
}

/**
 * A highlight/annotation in an archived webpage
 */
export interface WebpageHighlight {
  /** Unique identifier, format: "h-{timestamp.toString(36)}" */
  id: string;
  /** The highlighted text content */
  text: string;
  /** Text before the highlight (for context matching) */
  prefix: string;
  /** Text after the highlight (for context matching) */
  suffix: string;
  /** Character offset from start of plain text content */
  startOffset: number;
  /** Character offset to end of highlight */
  endOffset: number;
  /** ISO timestamp of when the highlight was created */
  createdAt: string;
}

/**
 * Selection info for creating highlights
 */
export interface WebpageSelectionInfo {
  /** Selected text */
  text: string;
  /** Context before selection */
  prefix: string;
  /** Context after selection */
  suffix: string;
  /** Start offset in document text */
  startOffset: number;
  /** End offset in document text */
  endOffset: number;
  /** Position for popup placement */
  position: { x: number; y: number };
}

// ============================================================================
// Review Mode Types
// ============================================================================

/**
 * Review rating scale (1-4)
 * 1: Need more time - struggled, need to revisit sooner
 * 2: Productive - good engagement, appropriate timing
 * 3: Already familiar - could have waited longer
 * 4: Fully processed - no more reviews needed, retire
 */
export type ReviewRating = 1 | 2 | 3 | 4;

/**
 * Review item status
 */
export type ReviewStatus = 'active' | 'retired';

/**
 * Entry in a note's review history
 */
export interface ReviewHistoryEntry {
  /** ISO datetime of the review */
  date: string;
  /** Session number when review was completed */
  sessionNumber: number;
  /** Rating given by the user */
  rating: ReviewRating;
  /** User's response to the challenge */
  response?: string;
  /** AI-generated challenge prompt */
  prompt?: string;
  /** AI-generated feedback */
  feedback?: string;
}

/**
 * Review metadata stored per-note
 */
export interface ReviewData {
  /** Whether review is enabled for this note */
  enabled: boolean;
  /** ISO datetime of last review, or null if never reviewed */
  lastReviewed: string | null;
  /** Next session number when this note should be reviewed */
  nextSessionNumber: number;
  /** Current interval in sessions */
  currentInterval: number;
  /** Whether the note is actively being reviewed or retired */
  status: ReviewStatus;
  /** Total number of reviews completed */
  reviewCount: number;
  /** History of all reviews for this note */
  reviewHistory: ReviewHistoryEntry[];
}

/**
 * Scheduling configuration for review mode
 */
export interface ReviewConfig {
  /** Number of notes to review per session (default: 5) */
  sessionSize: number;
  /** Expected sessions per week, used for date estimates (default: 7) */
  sessionsPerWeek: number;
  /** Maximum interval between reviews in sessions (default: 15) */
  maxIntervalSessions: number;
  /** Minimum days between reviews of the same note (default: 1) */
  minIntervalDays: number;
}

/**
 * Result of a single review within a session
 */
export interface ReviewSessionResult {
  /** Note ID that was reviewed */
  noteId: string;
  /** Note title at time of review */
  noteTitle: string;
  /** Rating given by the user */
  rating: ReviewRating;
  /** User's response to the challenge */
  userResponse: string;
  /** AI-generated feedback */
  agentFeedback: string;
  /** ISO datetime of completion */
  timestamp: string;
  /** Next session number when this note will be reviewed (-1 if retired) */
  scheduledForSession: number;
}

/**
 * An in-progress review session (persisted for resume)
 */
export interface ReviewSession {
  /** Unique session identifier */
  id: string;
  /** ISO datetime when session started */
  startedAt: string;
  /** Ordered list of note IDs to review in this session */
  noteIds: string[];
  /** Current index in noteIds array */
  currentIndex: number;
  /** Current AI-generated challenge prompt */
  currentPrompt?: string;
  /** User's current response (saved for resume) */
  userResponse?: string;
  /** AI feedback for current note (if in feedback state) */
  agentFeedback?: string;
  /** Completed review results */
  results: ReviewSessionResult[];
  /** Current state of the review */
  state: 'prompting' | 'feedback';
}

/**
 * Document-level review state
 */
export interface ReviewState {
  /** Current session number (increments after each completed session) */
  currentSessionNumber: number;
  /** ISO date of last completed session (for 1 AM reset logic), or null */
  lastSessionDate: string | null;
  /** Scheduling configuration */
  config: ReviewConfig;
  /** Active session if one is in progress (persisted for resume) */
  activeSession?: ReviewSession;
}
