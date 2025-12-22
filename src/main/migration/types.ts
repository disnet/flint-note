/**
 * Type definitions for legacy vault migration
 */

/**
 * Information about a detected legacy vault
 */
export interface LegacyVaultInfo {
  /** Full path to the vault directory */
  path: string;
  /** Display name (usually directory name) */
  name: string;
  /** Number of notes in the vault */
  noteCount: number;
  /** Number of EPUB notes (require special handling) */
  epubCount: number;
  /** Last modification time of the database */
  lastModified: string;
  /** Whether an Automerge vault already exists for this path */
  hasExistingMigration: boolean;
  /** The sync directory that will be used (e.g., 'notes' or 'notes-migration') */
  syncDirectoryName: string;
}

/**
 * Progress update during migration
 */
export interface MigrationProgress {
  /** Current phase of migration */
  phase: 'detecting' | 'extracting' | 'transforming' | 'writing' | 'complete' | 'error';
  /** Human-readable message */
  message: string;
  /** Current item number (for progress calculation) */
  current: number;
  /** Total items in current phase */
  total: number;
  /** Detailed counts by entity type */
  details?: {
    noteTypes?: number;
    notes?: number;
    workspaces?: number;
    reviewItems?: number;
    epubs?: number;
    agentRoutines?: number;
  };
}

/**
 * Result of a migration operation
 */
export interface MigrationResult {
  /** Whether migration completed successfully */
  success: boolean;
  /** ID of the created Automerge vault */
  vaultId: string;
  /** Automerge document URL */
  docUrl: string;
  /** The base directory used for file sync */
  baseDirectory: string;
  /** The sync subdirectory name used (e.g., 'notes') */
  syncDirectoryName: string;
  /** Statistics about migrated entities */
  stats: {
    noteTypes: number;
    notes: number;
    epubs: number;
    workspaces: number;
    reviewItems: number;
    agentRoutines: number;
    skipped: number;
  };
  /** Non-fatal errors encountered during migration */
  errors: MigrationError[];
  /** ID mappings for reference */
  idMapping: {
    /** Map from legacy type_name to new type-xxxxxxxx ID */
    noteTypes: Record<string, string>;
  };
}

/**
 * A non-fatal error during migration
 */
export interface MigrationError {
  /** Type of entity that failed */
  entity: 'note' | 'noteType' | 'workspace' | 'reviewItem' | 'epub' | 'agentRoutine';
  /** ID of the entity that failed */
  entityId: string;
  /** Error message */
  message: string;
}

/**
 * Parameters for starting a migration
 */
export interface MigrationParams {
  /** Path to the legacy vault directory */
  vaultPath: string;
  /** Name for the new Automerge vault */
  vaultName: string;
  /** Skip notes that already exist in the Automerge document */
  skipExisting?: boolean;
  /** Custom sync directory name (if not using auto-detected) */
  syncDirectoryName?: string;
}

// --- Legacy SQLite Row Types (for reading) ---

/**
 * A row from the notes table
 */
export interface LegacyNoteRow {
  id: string;
  title: string;
  content: string | null;
  type: string;
  flint_kind: string | null;
  filename: string;
  path: string;
  created: string;
  updated: string;
  size: number | null;
  content_hash: string | null;
  file_mtime: number | null;
  archived: number;
}

/**
 * A row from the note_metadata table
 */
export interface LegacyMetadataRow {
  note_id: string;
  key: string;
  value: string;
  value_type:
    | 'string'
    | 'number'
    | 'date'
    | 'boolean'
    | 'array'
    | 'notelink'
    | 'notelinks';
}

/**
 * A row from the note_type_descriptions table
 */
export interface LegacyNoteTypeRow {
  id: string;
  vault_id: string;
  type_name: string;
  purpose: string | null;
  agent_instructions: string | null;
  metadata_schema: string | null;
  icon: string | null;
  suggestions_config: string | null;
  default_review_mode: number | null;
  editor_chips: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A row from the ui_state table
 */
export interface LegacyUIStateRow {
  id: number;
  vault_id: string;
  state_key: string;
  state_value: string;
  schema_version: string;
  updated_at: string;
}

/**
 * A row from the review_items table
 */
export interface LegacyReviewItemRow {
  id: string;
  note_id: string;
  vault_id: string;
  enabled: number;
  last_reviewed: string | null;
  next_review: string;
  review_count: number;
  review_history: string | null;
  next_session_number: number;
  current_interval: number;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * A row from the workflows table
 */
export interface LegacyWorkflowRow {
  id: string;
  name: string;
  purpose: string;
  description: string;
  status: string;
  type: string;
  vault_id: string;
  recurring_spec: string | null;
  due_date: string | null;
  last_completed: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A row from the workflow_supplementary_materials table
 */
export interface LegacySupplementaryMaterialRow {
  id: string;
  workflow_id: string;
  material_type: string;
  content: string | null;
  note_id: string | null;
  metadata: string | null;
  position: number;
  created_at: string;
}

/**
 * A row from the workflow_completion_history table
 */
export interface LegacyWorkflowCompletionRow {
  id: string;
  workflow_id: string;
  completed_at: string;
  conversation_id: string | null;
  notes: string | null;
  output_note_id: string | null;
  metadata: string | null;
}

/**
 * Extracted data from a legacy vault
 */
export interface LegacyVaultData {
  /** Note type descriptions */
  noteTypes: LegacyNoteTypeRow[];
  /** All notes */
  notes: LegacyNoteRow[];
  /** Metadata for all notes, grouped by note_id */
  metadata: Map<string, LegacyMetadataRow[]>;
  /** UI state entries */
  uiState: LegacyUIStateRow[];
  /** Review items */
  reviewItems: LegacyReviewItemRow[];
  /** Vault ID from the database */
  vaultId: string;
  /** Workflows (agent routines) */
  workflows: LegacyWorkflowRow[];
  /** Supplementary materials grouped by workflow_id */
  workflowMaterials: Map<string, LegacySupplementaryMaterialRow[]>;
  /** Completion history grouped by workflow_id */
  workflowCompletions: Map<string, LegacyWorkflowCompletionRow[]>;
}

/**
 * EPUB file data for migration
 */
export interface EpubFileData {
  /** Note ID this EPUB belongs to */
  noteId: string;
  /** File data as Uint8Array */
  fileData: Uint8Array;
  /** Original file path */
  filePath: string;
  /** Extracted metadata */
  metadata: {
    title?: string;
    author?: string;
  };
  /** Reading state from legacy */
  readingState?: {
    currentCfi?: string;
    progress?: number;
  };
}
