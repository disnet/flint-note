/**
 * Data transformer for legacy vault migration
 *
 * Transforms SQLite row data to Automerge document types.
 */

import crypto from 'crypto';
import type {
  LegacyVaultData,
  LegacyNoteRow,
  LegacyMetadataRow,
  LegacyNoteTypeRow,
  LegacyUIStateRow,
  LegacyReviewItemRow,
  LegacyWorkflowRow,
  LegacySupplementaryMaterialRow,
  LegacyWorkflowCompletionRow,
  MigrationError,
  EpubFileData,
  PdfFileData,
  WebpageFileData
} from './types';

// Import Automerge types from the renderer (these are just interfaces, safe to import)
import type {
  Note,
  NoteType,
  Workspace,
  NotesDocument,
  SidebarItemRef,
  AgentRoutine,
  AgentRoutineStatus,
  AgentRoutineType,
  SupplementaryMaterial,
  RoutineCompletion,
  RecurringSpec
} from '../../renderer/src/lib/automerge/types';

// Constants matching the Automerge system
const DEFAULT_NOTE_TYPE_ID = 'type-default';
const DAILY_NOTE_TYPE_ID = 'type-daily';
const EPUB_NOTE_TYPE_ID = 'type-epub';
const PDF_NOTE_TYPE_ID = 'type-pdf';
const WEBPAGE_NOTE_TYPE_ID = 'type-webpage';
const DECK_NOTE_TYPE_ID = 'type-deck';
const DEFAULT_WORKSPACE_ID = 'ws-default';

/**
 * Generate an 8-character hex ID
 */
function generateHexId(): string {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Generate a note type ID
 */
function generateNoteTypeId(): string {
  return `type-${generateHexId()}`;
}

/**
 * Generate a workspace ID
 */
function generateWorkspaceId(): string {
  return `ws-${generateHexId()}`;
}

/**
 * Get current ISO timestamp
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Convert SQLite boolean (0/1) to JavaScript boolean
 */
function toBool(value: number | null | undefined): boolean {
  return value === 1;
}

/**
 * Parse JSON safely, returning undefined on failure
 */
function safeParseJSON<T>(json: string | null | undefined): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/**
 * Parse metadata value based on type
 */
function parseMetadataValue(value: string, valueType: string): unknown {
  switch (valueType) {
    case 'number':
      return parseFloat(value);
    case 'boolean':
      return value === 'true';
    case 'array':
    case 'notelinks':
      return safeParseJSON<string[]>(value) ?? [];
    case 'date':
      return value; // Keep as ISO string
    case 'notelink':
    case 'string':
    default:
      return value;
  }
}

/**
 * Transform result containing the migrated document data
 */
export interface TransformResult {
  /** The document data ready to be written to Automerge */
  document: Omit<NotesDocument, 'conversations' | 'shelfItems' | 'lastViewState'>;
  /** EPUB files that need to be migrated */
  epubFiles: EpubFileData[];
  /** PDF files that need to be migrated */
  pdfFiles: PdfFileData[];
  /** Webpage files that need to be migrated */
  webpageFiles: WebpageFileData[];
  /** Non-fatal errors during transformation */
  errors: MigrationError[];
  /** Mapping from legacy type names to new type IDs */
  typeIdMapping: Record<string, string>;
  /** Statistics */
  stats: {
    noteTypes: number;
    notes: number;
    epubs: number;
    pdfs: number;
    webpages: number;
    decks: number;
    dailyNotes: number;
    workspaces: number;
    reviewItems: number;
    agentRoutines: number;
    skipped: number;
  };
}

/**
 * Build the note type ID mapping
 *
 * Maps legacy type_name to new type IDs.
 * Special cases:
 * - "Note" type maps to "type-default"
 * - Generates new IDs for other types
 */
export function buildTypeIdMapping(
  legacyTypes: LegacyNoteTypeRow[]
): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const legacyType of legacyTypes) {
    const typeName = legacyType.type_name;

    if (typeName.toLowerCase() === 'note') {
      // Default note type
      mapping[typeName] = DEFAULT_NOTE_TYPE_ID;
    } else {
      // Generate new ID
      mapping[typeName] = generateNoteTypeId();
    }
  }

  // Ensure "Note" type exists even if not in database
  if (!Object.keys(mapping).some((k) => k.toLowerCase() === 'note')) {
    mapping['Note'] = DEFAULT_NOTE_TYPE_ID;
  }

  return mapping;
}

/**
 * Transform a legacy note type to Automerge format
 */
function transformNoteType(legacy: LegacyNoteTypeRow, newId: string): NoteType {
  // Parse metadata schema to property definitions
  // Legacy schemas can be in different formats:
  // 1. Array format: [{name: 'field', type: 'string', ...}, ...]
  // 2. Object format: {fieldName: {type: 'string', ...}, ...}
  // 3. null/undefined
  const rawSchema = safeParseJSON<unknown>(legacy.metadata_schema);

  // Debug: log the raw schema to understand its format
  console.log(
    `[Migration] Type "${legacy.type_name}" raw schema:`,
    JSON.stringify(rawSchema, null, 2)
  );

  let properties:
    | Array<{
        name: string;
        type:
          | 'string'
          | 'number'
          | 'boolean'
          | 'date'
          | 'array'
          | 'select'
          | 'notelink'
          | 'notelinks';
        description?: string;
      }>
    | undefined;

  if (rawSchema) {
    let schemaArray: Array<{ name: string; type: string; description?: string }>;

    if (Array.isArray(rawSchema)) {
      // Already in array format: [{name: 'field', type: 'string'}, ...]
      schemaArray = rawSchema as Array<{
        name: string;
        type: string;
        description?: string;
      }>;
    } else if (typeof rawSchema === 'object') {
      const schemaObj = rawSchema as Record<string, unknown>;

      // Check for wrapped format: {fields: [...]}
      if (Array.isArray(schemaObj.fields)) {
        schemaArray = schemaObj.fields as Array<{
          name: string;
          type: string;
          description?: string;
        }>;
      } else {
        // Convert object format to array format
        // Object format: {fieldName: {type: 'string', description?: 'desc'}, ...}
        schemaArray = Object.entries(schemaObj).map(([name, value]) => {
          if (typeof value === 'object' && value !== null) {
            const fieldDef = value as { type?: string; description?: string };
            return {
              name,
              type: fieldDef.type ?? 'string',
              description: fieldDef.description
            };
          }
          // Handle simple format: {fieldName: 'string'}
          return {
            name,
            type: typeof value === 'string' ? value : 'string'
          };
        });
      }
    } else {
      schemaArray = [];
    }

    // Debug: log the extracted schema array
    console.log(
      `[Migration] Type "${legacy.type_name}" schemaArray:`,
      JSON.stringify(schemaArray, null, 2)
    );

    // Map legacy types to valid PropertyTypes
    // Note: undefined is not valid JSON for Automerge, so we only include optional fields if defined
    properties = schemaArray.map((field) => {
      // Map multiSelect to array type (they serve the same purpose)
      let mappedType = field.type;
      if (mappedType === 'multiSelect') {
        mappedType = 'array';
      }

      // Cast field to include optional properties from legacy format
      // Legacy format can have constraints nested: { constraints: { options: [...] } }
      const legacyField = field as {
        name: string;
        type: string;
        description?: string;
        options?: string[];
        required?: boolean;
        default?: string | number | boolean | string[];
        constraints?: { options?: string[]; min?: number; max?: number };
      };

      const prop: {
        name: string;
        type:
          | 'string'
          | 'number'
          | 'boolean'
          | 'date'
          | 'array'
          | 'select'
          | 'notelink'
          | 'notelinks';
        description?: string;
        required?: boolean;
        default?: string | number | boolean | string[];
        constraints?: { options?: string[] };
      } = {
        name: legacyField.name,
        type: mappedType as
          | 'string'
          | 'number'
          | 'boolean'
          | 'date'
          | 'array'
          | 'select'
          | 'notelink'
          | 'notelinks'
      };

      // Add optional fields only if they have values
      if (legacyField.description) {
        prop.description = legacyField.description;
      }
      if (legacyField.required) {
        prop.required = legacyField.required;
      }
      if (legacyField.default !== undefined) {
        prop.default = legacyField.default;
      }

      // Carry over select options into constraints
      // Check both top-level options and nested constraints.options
      const options = legacyField.options ?? legacyField.constraints?.options;
      if (options && Array.isArray(options) && options.length > 0) {
        prop.constraints = { options };
      }

      return prop;
    });
  }

  const editorChips = safeParseJSON<string[]>(legacy.editor_chips);

  const noteType: NoteType = {
    id: newId,
    name: legacy.type_name,
    purpose: legacy.purpose ?? '',
    icon: legacy.icon ?? '📄',
    archived: false,
    created: legacy.created_at ?? nowISO()
  };

  // Only include optional properties if they have values (undefined is not valid JSON for Automerge)
  if (properties && properties.length > 0) {
    noteType.properties = properties;
  }
  if (editorChips) {
    noteType.editorChips = editorChips;
  }
  if (legacy.agent_instructions) {
    noteType.agentInstructions = legacy.agent_instructions;
  }

  return noteType;
}

/**
 * Extract date from a daily note path
 * Legacy format: "daily/YYYY-MM-DD" or "daily/YYYY/MM/DD"
 * Returns the date in YYYY-MM-DD format, or null if not a valid daily path
 */
function extractDateFromDailyPath(path: string): string | null {
  // Try format: daily/YYYY-MM-DD
  const simpleMatch = path.match(/^daily\/(\d{4}-\d{2}-\d{2})(?:\/|$)/);
  if (simpleMatch) {
    return simpleMatch[1];
  }

  // Try format: daily/YYYY/MM/DD
  const nestedMatch = path.match(/^daily\/(\d{4})\/(\d{2})\/(\d{2})(?:\/|$)/);
  if (nestedMatch) {
    return `${nestedMatch[1]}-${nestedMatch[2]}-${nestedMatch[3]}`;
  }

  return null;
}

/**
 * Generate a daily note ID from a date
 * Format: "daily-YYYY-MM-DD"
 */
function getDailyNoteId(date: string): string {
  return `daily-${date}`;
}

/**
 * Transform a legacy note to Automerge format
 */
function transformNote(
  legacy: LegacyNoteRow,
  typeIdMapping: Record<string, string>,
  metadata: LegacyMetadataRow[],
  reviewItem?: LegacyReviewItemRow
): {
  note: Note;
  isEpub: boolean;
  isPdf: boolean;
  isWebpage: boolean;
  isDeck: boolean;
  isDaily: boolean;
} {
  // Determine the type ID based on flint_kind or type
  const isEpub = legacy.flint_kind === 'epub';
  const isPdf = legacy.flint_kind === 'pdf';
  const isWebpage = legacy.flint_kind === 'webpage';
  const isDeck = legacy.flint_kind === 'deck';
  // Daily notes are identified by type 'daily' (not flint_kind)
  const isDaily = legacy.type === 'daily';
  let typeId: string;

  if (isEpub) {
    typeId = EPUB_NOTE_TYPE_ID;
  } else if (isPdf) {
    typeId = PDF_NOTE_TYPE_ID;
  } else if (isWebpage) {
    typeId = WEBPAGE_NOTE_TYPE_ID;
  } else if (isDeck) {
    typeId = DECK_NOTE_TYPE_ID;
  } else if (isDaily) {
    typeId = DAILY_NOTE_TYPE_ID;
  } else {
    typeId = typeIdMapping[legacy.type] ?? DEFAULT_NOTE_TYPE_ID;
  }

  // Build props from metadata
  const props: Record<string, unknown> = {};

  for (const meta of metadata) {
    props[meta.key] = parseMetadataValue(meta.value, meta.value_type);
  }

  // Add review data to props if exists
  if (reviewItem) {
    props.reviewEnabled = toBool(reviewItem.enabled);
    if (reviewItem.last_reviewed) {
      props.reviewLastReviewed = reviewItem.last_reviewed;
    }
    props.reviewNextReview = reviewItem.next_review;
    props.reviewCount = reviewItem.review_count;
    props.reviewSessionNumber = reviewItem.next_session_number;
    props.reviewInterval = reviewItem.current_interval;
    props.reviewStatus = reviewItem.status;

    const history = safeParseJSON<unknown[]>(reviewItem.review_history);
    if (history) {
      props.reviewHistory = history;
    }
  }

  // Determine content transformation:
  // - EPUB/PDF/Webpage: content is stored in OPFS, not in note
  // - Deck: wrap raw YAML in ```flint-deck code block (Automerge format)
  // - Other: preserve as-is
  let content: string;
  if (isEpub || isPdf || isWebpage) {
    content = '';
  } else if (isDeck) {
    // Legacy decks store raw YAML, Automerge expects ```flint-deck wrapper
    const rawYaml = (legacy.content ?? '').trim();
    content = rawYaml ? '```flint-deck\n' + rawYaml + '\n```' : '';
  } else {
    content = legacy.content ?? '';
  }

  // For daily notes, transform the ID to the Automerge format (daily-YYYY-MM-DD)
  // and use the date as the title
  let noteId = legacy.id;
  let noteTitle = legacy.title ?? '';

  if (isDaily) {
    // Extract date from the path (format: daily/YYYY-MM-DD or daily/YYYY/MM/DD)
    const dateFromPath = extractDateFromDailyPath(legacy.path);
    if (dateFromPath) {
      noteId = getDailyNoteId(dateFromPath);
      // Daily notes should have the date as their title
      noteTitle = dateFromPath;
    } else {
      // Fallback: try to extract date from title if it looks like a date
      const titleDateMatch = noteTitle.match(/^(\d{4}-\d{2}-\d{2})$/);
      if (titleDateMatch) {
        noteId = getDailyNoteId(titleDateMatch[1]);
      }
      // If we can't extract the date, keep the original ID (note won't show in daily view)
    }
  }

  const note: Note = {
    id: noteId,
    title: noteTitle,
    content,
    type: typeId,
    created: legacy.created ?? nowISO(),
    updated: legacy.updated ?? nowISO(),
    archived: toBool(legacy.archived),
    props: Object.keys(props).length > 0 ? props : undefined
  };

  return { note, isEpub, isPdf, isWebpage, isDeck, isDaily };
}

/**
 * Parse workspace data from UI state
 */
interface ParsedWorkspace {
  name: string;
  icon?: string;
  // Legacy format uses pinnedNotes/recentNotes as arrays of {noteId, title} or {id, ...} objects
  pinnedNotes?: Array<{ noteId?: string; id?: string; title?: string }>;
  recentNotes?: Array<{ noteId?: string; id?: string; title?: string }>;
  // temporaryTabs may contain recent/open notes in legacy format
  temporaryTabs?: Array<{ noteId?: string; id?: string }>;
  // Or simpler string array format
  pinnedNoteIds?: string[];
  recentNoteIds?: string[];
}

/**
 * Extract workspaces from UI state
 */
function extractWorkspaces(uiState: LegacyUIStateRow[]): {
  workspaces: ParsedWorkspace[];
  activeWorkspaceId?: string;
  workspaceOrder?: string[];
} {
  const result: {
    workspaces: ParsedWorkspace[];
    activeWorkspaceId?: string;
    workspaceOrder?: string[];
  } = { workspaces: [] };

  // Debug: log all ui_state keys to understand what's available
  console.log(
    '[Migration] UI state keys:',
    uiState.map((s) => s.state_key)
  );

  for (const state of uiState) {
    console.log(
      `[Migration] UI state "${state.state_key}":`,
      state.state_value?.substring(0, 200)
    );

    if (state.state_key === 'workspaces') {
      // Handle both formats:
      // 1. Array format: [{id, name, ...}, ...]
      // 2. Wrapped format: {workspaces: [...], activeWorkspaceId: "..."}
      const parsed = safeParseJSON<
        ParsedWorkspace[] | { workspaces: ParsedWorkspace[]; activeWorkspaceId?: string }
      >(state.state_value);
      console.log('[Migration] Parsed workspaces:', parsed);
      if (parsed) {
        if (Array.isArray(parsed)) {
          result.workspaces = parsed;
        } else if (parsed.workspaces && Array.isArray(parsed.workspaces)) {
          result.workspaces = parsed.workspaces;
          if (parsed.activeWorkspaceId) {
            result.activeWorkspaceId = parsed.activeWorkspaceId;
          }
        }
      }
    } else if (state.state_key === 'currentWorkspaceId') {
      result.activeWorkspaceId = state.state_value;
    } else if (state.state_key === 'workspaceOrder') {
      result.workspaceOrder = safeParseJSON<string[]>(state.state_value);
    }
  }

  console.log('[Migration] Extracted workspace result:', result);
  return result;
}

/**
 * Transform workspaces to Automerge format
 */
function transformWorkspaces(
  parsedWorkspaces: ParsedWorkspace[],
  existingNoteIds: Set<string>
): { workspaces: Record<string, Workspace>; workspaceOrder: string[] } {
  const workspaces: Record<string, Workspace> = {};
  const workspaceOrder: string[] = [];

  // Always create default workspace
  const defaultWorkspace: Workspace = {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Default',
    icon: '📋',
    pinnedItemIds: [],
    recentItemIds: [],
    created: nowISO()
  };

  if (parsedWorkspaces.length === 0) {
    // No workspaces found, just use default
    workspaces[DEFAULT_WORKSPACE_ID] = defaultWorkspace;
    workspaceOrder.push(DEFAULT_WORKSPACE_ID);
    return { workspaces, workspaceOrder };
  }

  for (let i = 0; i < parsedWorkspaces.length; i++) {
    const parsed = parsedWorkspaces[i];
    const isDefault = i === 0 || parsed.name.toLowerCase() === 'default';
    const wsId = isDefault ? DEFAULT_WORKSPACE_ID : generateWorkspaceId();

    // Extract pinned note IDs from either format
    // Format 1: pinnedNotes: [{noteId: "n-xxx", title: "..."}, ...]
    // Format 2: pinnedNoteIds: ["n-xxx", ...]
    console.log(
      `[Migration] Workspace "${parsed.name}" raw pinnedNotes:`,
      JSON.stringify(parsed.pinnedNotes)
    );

    let pinnedIds: string[] = [];
    if (parsed.pinnedNotes && Array.isArray(parsed.pinnedNotes)) {
      pinnedIds = parsed.pinnedNotes
        .map((n) => {
          // Handle different possible formats
          if (typeof n === 'string') return n;
          if (n && typeof n === 'object' && 'noteId' in n) return n.noteId;
          if (n && typeof n === 'object' && 'id' in n) return (n as { id: string }).id;
          console.log('[Migration] Unknown pinned note format:', n);
          return null;
        })
        .filter(Boolean) as string[];
    } else if (parsed.pinnedNoteIds && Array.isArray(parsed.pinnedNoteIds)) {
      pinnedIds = parsed.pinnedNoteIds;
    }

    // Extract recent note IDs - may be stored as recentNotes or temporaryTabs
    console.log(
      `[Migration] Workspace "${parsed.name}" raw temporaryTabs:`,
      JSON.stringify(parsed.temporaryTabs)
    );

    let recentIds: string[] = [];
    // Check temporaryTabs first (legacy format)
    if (parsed.temporaryTabs && Array.isArray(parsed.temporaryTabs)) {
      recentIds = parsed.temporaryTabs
        .map((n) => {
          if (typeof n === 'string') return n;
          if (n && typeof n === 'object' && 'noteId' in n && n.noteId) return n.noteId;
          if (n && typeof n === 'object' && 'id' in n && n.id) return n.id;
          return null;
        })
        .filter(Boolean) as string[];
    } else if (parsed.recentNotes && Array.isArray(parsed.recentNotes)) {
      recentIds = parsed.recentNotes
        .map((n) => {
          if (typeof n === 'string') return n;
          if (n && typeof n === 'object' && 'noteId' in n && n.noteId) return n.noteId;
          if (n && typeof n === 'object' && 'id' in n && n.id) return n.id;
          return null;
        })
        .filter(Boolean) as string[];
    } else if (parsed.recentNoteIds && Array.isArray(parsed.recentNoteIds)) {
      recentIds = parsed.recentNoteIds;
    }

    console.log(`[Migration] Workspace "${parsed.name}" pinned IDs:`, pinnedIds);
    console.log(`[Migration] Workspace "${parsed.name}" recent IDs:`, recentIds);

    // Convert note IDs to SidebarItemRef, filtering out any that don't exist
    const pinnedItemIds: SidebarItemRef[] = pinnedIds
      .filter((id) => existingNoteIds.has(id))
      .map((id) => ({ type: 'note' as const, id }));

    const recentItemIds: SidebarItemRef[] = recentIds
      .filter((id) => existingNoteIds.has(id))
      .map((id) => ({ type: 'note' as const, id }));

    console.log(
      `[Migration] Workspace "${parsed.name}" final pinned:`,
      pinnedItemIds.length
    );
    console.log(
      `[Migration] Workspace "${parsed.name}" final recent:`,
      recentItemIds.length
    );

    workspaces[wsId] = {
      id: wsId,
      name: parsed.name || 'Workspace',
      icon: parsed.icon || '📋',
      pinnedItemIds,
      recentItemIds,
      created: nowISO()
    };

    workspaceOrder.push(wsId);
  }

  return { workspaces, workspaceOrder };
}

// ============================================================================
// Workflow (Agent Routine) Transformation
// ============================================================================

/**
 * Map legacy workflow status to AgentRoutineStatus
 */
function mapRoutineStatus(legacyStatus: string): AgentRoutineStatus {
  const validStatuses: AgentRoutineStatus[] = [
    'active',
    'paused',
    'completed',
    'archived'
  ];
  if (validStatuses.includes(legacyStatus as AgentRoutineStatus)) {
    return legacyStatus as AgentRoutineStatus;
  }
  return 'active'; // Default
}

/**
 * Map legacy workflow type to AgentRoutineType
 */
function mapRoutineType(legacyType: string): AgentRoutineType {
  if (legacyType === 'backlog') return 'backlog';
  return 'routine'; // Map 'workflow' to 'routine'
}

/**
 * Transform a legacy workflow to an AgentRoutine
 * Note: undefined is not valid JSON for Automerge, so we only include properties that have values
 */
function transformWorkflow(
  legacy: LegacyWorkflowRow,
  materials: LegacySupplementaryMaterialRow[],
  completions: LegacyWorkflowCompletionRow[]
): AgentRoutine {
  // Transform supplementary materials - filter out undefined properties
  const supplementaryMaterials: SupplementaryMaterial[] | undefined =
    materials.length > 0
      ? materials.map((m) => {
          const material: SupplementaryMaterial = {
            id: m.id,
            materialType: m.material_type as 'text' | 'code' | 'note_reference',
            position: m.position,
            createdAt: m.created_at
          };
          if (m.content != null) material.content = m.content;
          if (m.note_id != null) material.noteId = m.note_id;
          if (m.metadata) {
            const parsed = safeParseJSON(m.metadata);
            if (parsed) material.metadata = parsed;
          }
          return material;
        })
      : undefined;

  // Transform completion history - filter out undefined properties
  const completionHistory: RoutineCompletion[] | undefined =
    completions.length > 0
      ? completions.map((c) => {
          const completion: RoutineCompletion = {
            id: c.id,
            completedAt: c.completed_at
          };
          if (c.conversation_id != null) completion.conversationId = c.conversation_id;
          if (c.notes != null) completion.notes = c.notes;
          if (c.output_note_id != null) completion.outputNoteId = c.output_note_id;
          if (c.metadata) {
            const parsed = safeParseJSON(c.metadata);
            if (parsed) completion.metadata = parsed;
          }
          return completion;
        })
      : undefined;

  // Build routine object, only including optional properties that have values
  const routine: AgentRoutine = {
    id: legacy.id, // Preserve original w-xxxxxxxx ID
    name: legacy.name,
    purpose: legacy.purpose,
    description: legacy.description,
    status: mapRoutineStatus(legacy.status),
    type: mapRoutineType(legacy.type),
    created: legacy.created_at,
    updated: legacy.updated_at
  };

  // Only add optional fields if they have values
  if (legacy.recurring_spec) {
    const parsed = safeParseJSON<RecurringSpec>(legacy.recurring_spec);
    if (parsed) routine.recurringSpec = parsed;
  }
  if (legacy.due_date != null) routine.dueDate = legacy.due_date;
  if (legacy.last_completed != null) routine.lastCompleted = legacy.last_completed;
  if (supplementaryMaterials) routine.supplementaryMaterials = supplementaryMaterials;
  if (completionHistory) routine.completionHistory = completionHistory;

  return routine;
}

/**
 * Transform all legacy vault data to Automerge format
 *
 * @param data - Extracted legacy vault data
 * @param existingNotes - Optional map of existing notes (for skip detection)
 * @returns Transform result with document data and EPUB files to migrate
 */
export function transformVaultData(
  data: LegacyVaultData,
  existingNotes?: Record<string, Note>
): TransformResult {
  const errors: MigrationError[] = [];
  const epubFiles: EpubFileData[] = [];
  const pdfFiles: PdfFileData[] = [];
  const webpageFiles: WebpageFileData[] = [];

  // Build type ID mapping
  const typeIdMapping = buildTypeIdMapping(data.noteTypes);
  console.log('[Migration] Type ID mapping:', typeIdMapping);
  console.log('[Migration] Legacy note types count:', data.noteTypes.length);

  // Transform note types
  const noteTypes: Record<string, NoteType> = {};
  for (const legacyType of data.noteTypes) {
    try {
      console.log('[Migration] Processing legacy type:', legacyType.type_name);
      const newId = typeIdMapping[legacyType.type_name];
      if (newId) {
        noteTypes[newId] = transformNoteType(legacyType, newId);
        console.log('[Migration] Transformed type:', newId, noteTypes[newId]);
      } else {
        console.warn('[Migration] No mapping found for type:', legacyType.type_name);
      }
    } catch (error) {
      console.error('[Migration] Error transforming type:', legacyType.type_name, error);
      errors.push({
        entity: 'noteType',
        entityId: legacyType.type_name,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  console.log('[Migration] Transformed note types count:', Object.keys(noteTypes).length);

  // Ensure default note type exists
  if (!noteTypes[DEFAULT_NOTE_TYPE_ID]) {
    noteTypes[DEFAULT_NOTE_TYPE_ID] = {
      id: DEFAULT_NOTE_TYPE_ID,
      name: 'Note',
      purpose: 'General purpose notes',
      icon: '📝',
      archived: false,
      created: nowISO()
    };
  }

  // Ensure EPUB note type exists (needed if there are EPUB notes)
  const hasEpubs = data.notes.some((n) => n.flint_kind === 'epub');
  if (hasEpubs && !noteTypes[EPUB_NOTE_TYPE_ID]) {
    noteTypes[EPUB_NOTE_TYPE_ID] = {
      id: EPUB_NOTE_TYPE_ID,
      name: 'Book',
      purpose: 'EPUB books and documents',
      icon: '📚',
      archived: false,
      created: nowISO()
    };
  }

  // Ensure PDF note type exists (needed if there are PDF notes)
  const hasPdfs = data.notes.some((n) => n.flint_kind === 'pdf');
  if (hasPdfs && !noteTypes[PDF_NOTE_TYPE_ID]) {
    noteTypes[PDF_NOTE_TYPE_ID] = {
      id: PDF_NOTE_TYPE_ID,
      name: 'PDF',
      purpose: 'PDF documents',
      icon: '📄',
      archived: false,
      created: nowISO()
    };
  }

  // Ensure Webpage note type exists (needed if there are webpage notes)
  const hasWebpages = data.notes.some((n) => n.flint_kind === 'webpage');
  if (hasWebpages && !noteTypes[WEBPAGE_NOTE_TYPE_ID]) {
    noteTypes[WEBPAGE_NOTE_TYPE_ID] = {
      id: WEBPAGE_NOTE_TYPE_ID,
      name: 'Webpage',
      purpose: 'Archived web pages',
      icon: '🌐',
      archived: false,
      created: nowISO()
    };
  }

  // Ensure Daily note type exists (needed if there are daily notes)
  const hasDailyNotes = data.notes.some((n) => n.type === 'daily');
  if (hasDailyNotes && !noteTypes[DAILY_NOTE_TYPE_ID]) {
    noteTypes[DAILY_NOTE_TYPE_ID] = {
      id: DAILY_NOTE_TYPE_ID,
      name: 'Daily Note',
      purpose: 'Daily journal entries',
      icon: '📅',
      archived: false,
      created: nowISO()
    };
  }

  // Build review item lookup
  const reviewItemMap = new Map<string, LegacyReviewItemRow>();
  for (const item of data.reviewItems) {
    reviewItemMap.set(item.note_id, item);
  }

  // Transform notes
  const notes: Record<string, Note> = {};
  const existingNoteIds = new Set<string>();
  let skipped = 0;
  let epubCount = 0;
  let pdfCount = 0;
  let webpageCount = 0;
  let deckCount = 0;
  let dailyCount = 0;

  for (const legacyNote of data.notes) {
    try {
      // Skip if already exists in target
      if (existingNotes && existingNotes[legacyNote.id]) {
        skipped++;
        continue;
      }

      const metadata = data.metadata.get(legacyNote.id) ?? [];
      const reviewItem = reviewItemMap.get(legacyNote.id);

      const { note, isEpub, isPdf, isWebpage, isDeck, isDaily } = transformNote(
        legacyNote,
        typeIdMapping,
        metadata,
        reviewItem
      );

      notes[note.id] = note;
      existingNoteIds.add(note.id);

      if (isDaily) {
        dailyCount++;
      }

      if (isEpub) {
        epubCount++;
        // Get the actual EPUB file path from metadata (flint_epubPath)
        // The `path` column points to the markdown file with notes/highlights
        const epubPath = metadata.find((m) => m.key === 'flint_epubPath')?.value;
        if (!epubPath) {
          errors.push({
            entity: 'epub',
            entityId: legacyNote.id,
            message: 'EPUB note missing flint_epubPath metadata'
          });
        } else {
          // Add to EPUB files list for later migration
          epubFiles.push({
            noteId: legacyNote.id,
            fileData: new Uint8Array(0), // Will be populated by caller
            filePath: epubPath,
            metadata: {
              title: legacyNote.title ?? undefined
              // Author will be extracted when reading the EPUB
            },
            readingState: {
              currentCfi: metadata.find((m) => m.key === 'currentCfi')?.value,
              progress: metadata.find((m) => m.key === 'progress')?.value
                ? parseFloat(metadata.find((m) => m.key === 'progress')!.value)
                : undefined
            }
          });
        }
      }

      if (isPdf) {
        pdfCount++;
        // Get the actual PDF file path from metadata (flint_pdfPath)
        // The `path` column points to the markdown file with notes/highlights
        const pdfPath = metadata.find((m) => m.key === 'flint_pdfPath')?.value;
        if (!pdfPath) {
          errors.push({
            entity: 'epub', // Using 'epub' as the entity type since there's no 'pdf' in MigrationError
            entityId: legacyNote.id,
            message: 'PDF note missing flint_pdfPath metadata'
          });
        } else {
          // Add to PDF files list for later migration
          pdfFiles.push({
            noteId: legacyNote.id,
            fileData: new Uint8Array(0), // Will be populated by caller
            filePath: pdfPath,
            metadata: {
              title: legacyNote.title ?? undefined
              // Author will be extracted when reading the PDF
            },
            readingState: {
              currentPage: metadata.find((m) => m.key === 'currentPage')?.value
                ? parseInt(metadata.find((m) => m.key === 'currentPage')!.value, 10)
                : undefined,
              progress: metadata.find((m) => m.key === 'progress')?.value
                ? parseFloat(metadata.find((m) => m.key === 'progress')!.value)
                : undefined
            }
          });
        }
      }

      if (isWebpage) {
        webpageCount++;
        // Get the actual webpage file path from metadata (flint_webpagePath)
        // The `path` column points to the markdown file with notes/highlights
        const webpagePath = metadata.find((m) => m.key === 'flint_webpagePath')?.value;
        if (!webpagePath) {
          errors.push({
            entity: 'epub', // Using 'epub' as the entity type since there's no 'webpage' in MigrationError
            entityId: legacyNote.id,
            message: 'Webpage note missing flint_webpagePath metadata'
          });
        } else {
          // Add to webpage files list for later migration
          webpageFiles.push({
            noteId: legacyNote.id,
            htmlContent: '', // Will be populated by caller
            filePath: webpagePath,
            metadata: {
              title: legacyNote.title ?? undefined,
              url: metadata.find((m) => m.key === 'flint_webpageUrl')?.value,
              siteName: metadata.find((m) => m.key === 'flint_webpageSiteName')?.value,
              author: metadata.find((m) => m.key === 'flint_webpageAuthor')?.value
            }
          });
        }
      }

      if (isDeck) {
        deckCount++;
        // Deck content (YAML) is already in note.content, no special handling needed
      }
    } catch (error) {
      errors.push({
        entity: 'note',
        entityId: legacyNote.id,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Extract and transform workspaces
  const parsedWorkspaceData = extractWorkspaces(data.uiState);
  const { workspaces, workspaceOrder } = transformWorkspaces(
    parsedWorkspaceData.workspaces,
    existingNoteIds
  );

  // Determine active workspace
  let activeWorkspaceId = DEFAULT_WORKSPACE_ID;
  if (parsedWorkspaceData.activeWorkspaceId) {
    // Try to find matching workspace
    const matchingWs = Object.values(workspaces).find(
      (ws) => ws.name === parsedWorkspaceData.activeWorkspaceId
    );
    if (matchingWs) {
      activeWorkspaceId = matchingWs.id;
    }
  }

  // Transform workflows to agent routines
  const agentRoutines: Record<string, AgentRoutine> = {};
  let routineCount = 0;

  for (const legacyWorkflow of data.workflows) {
    try {
      const materials = data.workflowMaterials.get(legacyWorkflow.id) ?? [];
      const completions = data.workflowCompletions.get(legacyWorkflow.id) ?? [];

      const routine = transformWorkflow(legacyWorkflow, materials, completions);
      agentRoutines[routine.id] = routine;
      routineCount++;
    } catch (error) {
      errors.push({
        entity: 'agentRoutine',
        entityId: legacyWorkflow.id,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    document: {
      notes,
      workspaces,
      activeWorkspaceId,
      noteTypes,
      workspaceOrder,
      agentRoutines: routineCount > 0 ? agentRoutines : undefined
    },
    epubFiles,
    pdfFiles,
    webpageFiles,
    errors,
    typeIdMapping,
    stats: {
      noteTypes: Object.keys(noteTypes).length,
      notes: Object.keys(notes).length,
      epubs: epubCount,
      pdfs: pdfCount,
      webpages: webpageCount,
      decks: deckCount,
      dailyNotes: dailyCount,
      workspaces: Object.keys(workspaces).length,
      reviewItems: data.reviewItems.filter((r) => existingNoteIds.has(r.note_id)).length,
      agentRoutines: routineCount,
      skipped
    }
  };
}
