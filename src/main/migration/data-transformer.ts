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
  MigrationError,
  EpubFileData
} from './types';

// Import Automerge types from the renderer (these are just interfaces, safe to import)
import type {
  Note,
  NoteType,
  Workspace,
  NotesDocument,
  SidebarItemRef
} from '../../renderer/src/lib/automerge/types';

// Constants matching the Automerge system
const DEFAULT_NOTE_TYPE_ID = 'type-default';
const EPUB_NOTE_TYPE_ID = 'type-epub';
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
  /** Non-fatal errors during transformation */
  errors: MigrationError[];
  /** Mapping from legacy type names to new type IDs */
  typeIdMapping: Record<string, string>;
  /** Statistics */
  stats: {
    noteTypes: number;
    notes: number;
    epubs: number;
    workspaces: number;
    reviewItems: number;
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
  const metadataSchema = safeParseJSON<
    Array<{
      name: string;
      type: string;
      description?: string;
    }>
  >(legacy.metadata_schema);

  // Map legacy types to valid PropertyTypes
  const properties = metadataSchema?.map((field) => {
    // Map multiSelect to array type (they serve the same purpose)
    let mappedType = field.type;
    if (mappedType === 'multiSelect') {
      mappedType = 'array';
    }
    return {
      name: field.name,
      type: mappedType as
        | 'string'
        | 'number'
        | 'boolean'
        | 'date'
        | 'array'
        | 'select'
        | 'notelink'
        | 'notelinks',
      description: field.description
    };
  });

  const editorChips = safeParseJSON<string[]>(legacy.editor_chips);

  return {
    id: newId,
    name: legacy.type_name,
    purpose: legacy.purpose ?? '',
    icon: legacy.icon ?? '📄',
    archived: false,
    created: legacy.created_at ?? nowISO(),
    properties,
    editorChips,
    agentInstructions: legacy.agent_instructions ?? undefined
  };
}

/**
 * Transform a legacy note to Automerge format
 */
function transformNote(
  legacy: LegacyNoteRow,
  typeIdMapping: Record<string, string>,
  metadata: LegacyMetadataRow[],
  reviewItem?: LegacyReviewItemRow
): { note: Note; isEpub: boolean } {
  // Determine the type ID
  const isEpub = legacy.flint_kind === 'epub';
  let typeId: string;

  if (isEpub) {
    typeId = EPUB_NOTE_TYPE_ID;
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

  const note: Note = {
    id: legacy.id,
    title: legacy.title ?? '',
    content: isEpub ? '' : (legacy.content ?? ''), // EPUB content is not stored in note
    type: typeId,
    created: legacy.created ?? nowISO(),
    updated: legacy.updated ?? nowISO(),
    archived: toBool(legacy.archived),
    props: Object.keys(props).length > 0 ? props : undefined
  };

  return { note, isEpub };
}

/**
 * Parse workspace data from UI state
 */
interface ParsedWorkspace {
  name: string;
  icon: string;
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

  for (const state of uiState) {
    if (state.state_key === 'workspaces') {
      const parsed = safeParseJSON<ParsedWorkspace[]>(state.state_value);
      if (parsed) {
        result.workspaces = parsed;
      }
    } else if (state.state_key === 'currentWorkspaceId') {
      result.activeWorkspaceId = state.state_value;
    } else if (state.state_key === 'workspaceOrder') {
      result.workspaceOrder = safeParseJSON<string[]>(state.state_value);
    }
  }

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

    // Convert note IDs to SidebarItemRef, filtering out any that don't exist
    const pinnedItemIds: SidebarItemRef[] = (parsed.pinnedNoteIds ?? [])
      .filter((id) => existingNoteIds.has(id))
      .map((id) => ({ type: 'note' as const, id }));

    const recentItemIds: SidebarItemRef[] = (parsed.recentNoteIds ?? [])
      .filter((id) => existingNoteIds.has(id))
      .map((id) => ({ type: 'note' as const, id }));

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

  // Build type ID mapping
  const typeIdMapping = buildTypeIdMapping(data.noteTypes);

  // Transform note types
  const noteTypes: Record<string, NoteType> = {};
  for (const legacyType of data.noteTypes) {
    try {
      const newId = typeIdMapping[legacyType.type_name];
      if (newId) {
        noteTypes[newId] = transformNoteType(legacyType, newId);
      }
    } catch (error) {
      errors.push({
        entity: 'noteType',
        entityId: legacyType.type_name,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

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

  for (const legacyNote of data.notes) {
    try {
      // Skip if already exists in target
      if (existingNotes && existingNotes[legacyNote.id]) {
        skipped++;
        continue;
      }

      const metadata = data.metadata.get(legacyNote.id) ?? [];
      const reviewItem = reviewItemMap.get(legacyNote.id);

      const { note, isEpub } = transformNote(
        legacyNote,
        typeIdMapping,
        metadata,
        reviewItem
      );

      notes[note.id] = note;
      existingNoteIds.add(note.id);

      if (isEpub) {
        epubCount++;
        // Add to EPUB files list for later migration
        epubFiles.push({
          noteId: legacyNote.id,
          fileData: new Uint8Array(0), // Will be populated by caller
          filePath: legacyNote.path,
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

  return {
    document: {
      notes,
      workspaces,
      activeWorkspaceId,
      noteTypes,
      workspaceOrder
    },
    epubFiles,
    errors,
    typeIdMapping,
    stats: {
      noteTypes: Object.keys(noteTypes).length,
      notes: Object.keys(notes).length,
      epubs: epubCount,
      workspaces: Object.keys(workspaces).length,
      reviewItems: data.reviewItems.filter((r) => existingNoteIds.has(r.note_id)).length,
      skipped
    }
  };
}
