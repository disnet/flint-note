/**
 * Query execution service for Deck widgets
 * Executes queries against the note API and returns formatted results
 *
 * Phase 2 Implementation:
 * - Uses server-side queryNotesForDeck API for efficient batch fetching
 * - Metadata filtering is performed server-side
 * - No more N+1 queries - notes and metadata fetched in single request
 */

import type {
  DeckConfig,
  DeckResultNote,
  DeckQueryResult,
  FilterOperator
} from './types';
import { DEFAULT_PAGE_SIZE } from './types';

// System fields to exclude from user metadata display
const SYSTEM_FIELDS = new Set([
  'id',
  'type',
  'kind',
  'title',
  'filename',
  'path',
  'content',
  'content_hash',
  'created',
  'modified',
  'updated',
  'size',
  'flint_id',
  'flint_type',
  'flint_kind',
  'flint_title',
  'flint_filename',
  'flint_path',
  'flint_content',
  'flint_content_hash',
  'flint_created',
  'flint_updated',
  'flint_size',
  'flint_archived'
]);

/**
 * Schema field info for type-aware query building
 */
export interface SchemaFieldInfo {
  type: string;
}

/**
 * Options for running a deck query
 */
export interface DeckQueryOptions {
  /** Offset for pagination (default: 0) */
  offset?: number;
  /** Schema fields for type-aware filtering (e.g., boolean false handling) */
  schemaFields?: Map<string, SchemaFieldInfo>;
}

/**
 * Execute a deck query and return matching notes with pagination info
 * Uses the optimized server-side queryNotesForDeck API
 */
export async function runDeckQuery(
  config: DeckConfig,
  options: DeckQueryOptions = {}
): Promise<DeckQueryResult> {
  const { offset = 0, schemaFields } = options;
  const filters = config.filters ?? [];
  // Extract type filter if present (supports single value or array via IN operator)
  const typeFilter = filters.find((f) => f.field === 'flint_type');
  let types: string | string[] | undefined;
  let typeOperator: '=' | '!=' | 'IN' | undefined;

  if (typeFilter) {
    if (Array.isArray(typeFilter.value)) {
      types = typeFilter.value.length === 1 ? typeFilter.value[0] : typeFilter.value;
      // For arrays, use IN (or != becomes NOT IN on the server)
      typeOperator = typeFilter.operator === '!=' ? '!=' : 'IN';
    } else if (typeof typeFilter.value === 'string') {
      // Check if it's an IN operator with comma-separated values
      if (typeFilter.operator === 'IN' && typeFilter.value.includes(',')) {
        types = typeFilter.value.split(',').map((v) => v.trim());
        typeOperator = 'IN';
      } else {
        types = typeFilter.value;
        typeOperator = typeFilter.operator === '!=' ? '!=' : '=';
      }
    }
  }

  // Get metadata filters (everything except flint_type)
  // Include value_type hint for boolean fields to enable special handling
  const metadataFilters = filters
    .filter((f) => f.field !== 'flint_type')
    .map((f) => {
      const fieldSchema = schemaFields?.get(f.field);
      const isBooleanField = fieldSchema?.type === 'boolean';
      return {
        key: f.field,
        value: Array.isArray(f.value) ? f.value.join(',') : String(f.value),
        operator: f.operator || ('=' as const),
        // Include value_type for boolean fields so server can handle false specially
        ...(isBooleanField ? { value_type: 'boolean' as const } : {})
      };
    });

  // Build sort configuration
  const sort = config.sort
    ? [
        {
          field: config.sort.field,
          order: config.sort.order
        }
      ]
    : undefined;

  // Use pageSize (or legacy limit, or default)
  const limit = config.pageSize || config.limit || DEFAULT_PAGE_SIZE;

  try {
    // Use the optimized server-side API
    const response = await window.api?.queryNotesForDataview({
      type: types,
      type_operator: typeOperator,
      metadata_filters: metadataFilters.length > 0 ? metadataFilters : undefined,
      sort,
      limit,
      offset
    });

    if (!response || !response.results) {
      return { notes: [], total: 0, hasMore: false };
    }

    // Transform response to DeckResultNote format
    // Filter out system fields from metadata for display
    const notes = response.results.map((note) => ({
      id: note.id,
      title: note.title,
      type: note.type,
      kind: note.flint_kind,
      created: note.created,
      updated: note.updated,
      metadata: extractUserMetadata(note.metadata)
    }));

    return {
      notes,
      total: response.total,
      hasMore: response.has_more
    };
  } catch (error) {
    console.error('Deck query failed:', error);
    // Fall back to legacy query method if new API fails
    const notes = await runLegacyDeckQuery(config);
    return { notes, total: notes.length, hasMore: false };
  }
}

/**
 * Extract user-defined metadata (excluding system fields)
 */
function extractUserMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const userMetadata: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!SYSTEM_FIELDS.has(key)) {
      userMetadata[key] = value;
    }
  }

  return userMetadata;
}

/**
 * Legacy query method - used as fallback if new API is not available
 * This maintains backward compatibility during transition
 */
async function runLegacyDeckQuery(config: DeckConfig): Promise<DeckResultNote[]> {
  const filters = config.filters ?? [];
  const typeFilter = filters.find((f) => f.field === 'flint_type');
  // Extract types from filter (supports single value or array)
  let typeNames: string[] = [];
  if (typeFilter) {
    if (Array.isArray(typeFilter.value)) {
      typeNames = typeFilter.value;
    } else if (typeof typeFilter.value === 'string') {
      if (typeFilter.operator === 'IN' && typeFilter.value.includes(',')) {
        typeNames = typeFilter.value.split(',').map((v) => v.trim());
      } else {
        typeNames = [typeFilter.value];
      }
    }
  }
  const metadataFilters = filters.filter((f) => f.field !== 'flint_type');

  let notes: DeckResultNote[] = [];

  if (typeNames.length > 0) {
    // Fetch notes for each type and merge
    const allNoteIds: string[] = [];
    for (const typeName of typeNames) {
      const noteList = await window.api?.listNotesByType({
        type: typeName,
        limit: config.limit || 50,
        includeArchived: false
      });

      if (noteList && Array.isArray(noteList)) {
        allNoteIds.push(...noteList.map((n: { id: string }) => n.id));
      }
    }
    notes = await fetchNotesWithMetadata(allNoteIds);
  } else {
    const searchResults = await window.api?.searchNotes({
      query: '',
      limit: config.limit || 50
    });

    if (searchResults && Array.isArray(searchResults)) {
      notes = await fetchNotesWithMetadata(searchResults.map((r) => r.id));
    }
  }

  // Apply metadata filters client-side
  if (metadataFilters.length > 0) {
    notes = notes.filter((note) => matchesMetadataFilters(note, metadataFilters));
  }

  // Apply sorting
  if (config.sort) {
    notes = sortNotes(notes, config.sort.field, config.sort.order);
  }

  // Apply limit
  const limit = config.limit || 50;
  if (notes.length > limit) {
    notes = notes.slice(0, limit);
  }

  return notes;
}

/**
 * Fetch full notes with metadata for a list of note IDs (legacy method)
 */
async function fetchNotesWithMetadata(noteIds: string[]): Promise<DeckResultNote[]> {
  const notes: DeckResultNote[] = [];

  const batchSize = 10;
  for (let i = 0; i < noteIds.length; i += batchSize) {
    const batch = noteIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        try {
          const note = await window.api?.getNote({ identifier: id });
          if (note) {
            return {
              id: note.id,
              title: note.title || '(untitled)',
              type: note.type,
              created: note.created,
              updated: note.updated || note.modified,
              metadata: extractUserMetadata(note.metadata || {})
            };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    notes.push(...batchResults.filter((n): n is DeckResultNote => n !== null));
  }

  return notes;
}

/**
 * Check if a note matches all metadata filters (legacy client-side filtering)
 */
function matchesMetadataFilters(
  note: DeckResultNote,
  filters: Array<{ field: string; operator?: FilterOperator; value: string | string[] }>
): boolean {
  return filters.every((filter) => {
    const noteValue = note.metadata[filter.field];
    const operator = filter.operator || '=';
    const filterValue = filter.value;

    if (noteValue === undefined || noteValue === null) {
      // For !=, notes without the field should match (they don't equal any value)
      if (operator === '!=') return true;
      // For boolean fields filtering on 'false', treat missing field as false
      // This matches the server-side behavior for boolean fields
      if (operator === '=' && filterValue === 'false') return true;
      return false;
    }

    const noteStr = Array.isArray(noteValue) ? noteValue.join(',') : String(noteValue);

    switch (operator) {
      case '=':
        return noteStr === String(filterValue);
      case '!=':
        return noteStr !== String(filterValue);
      case '>':
        return noteStr > String(filterValue);
      case '<':
        return noteStr < String(filterValue);
      case '>=':
        return noteStr >= String(filterValue);
      case '<=':
        return noteStr <= String(filterValue);
      case 'LIKE': {
        const pattern = String(filterValue).replace(/%/g, '.*').replace(/_/g, '.');
        return new RegExp(`^${pattern}$`, 'i').test(noteStr);
      }
      case 'IN': {
        const values = Array.isArray(filterValue)
          ? filterValue
          : String(filterValue).split(',');
        return values.some((v) => v.trim() === noteStr);
      }
      default:
        return noteStr === String(filterValue);
    }
  });
}

/**
 * Sort notes by a field (legacy client-side sorting)
 */
function sortNotes(
  notes: DeckResultNote[],
  field: string,
  order: 'asc' | 'desc'
): DeckResultNote[] {
  return [...notes].sort((a, b) => {
    let aVal: string | number;
    let bVal: string | number;

    if (field === 'title') {
      aVal = a.title.toLowerCase();
      bVal = b.title.toLowerCase();
    } else if (field === 'type') {
      aVal = a.type.toLowerCase();
      bVal = b.type.toLowerCase();
    } else if (field === 'created') {
      aVal = a.created;
      bVal = b.created;
    } else if (field === 'updated') {
      aVal = a.updated;
      bVal = b.updated;
    } else {
      const aMetaVal = a.metadata[field];
      const bMetaVal = b.metadata[field];

      aVal = aMetaVal !== undefined && aMetaVal !== null ? String(aMetaVal) : '';
      bVal = bMetaVal !== undefined && bMetaVal !== null ? String(bMetaVal) : '';
    }

    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Get available metadata fields for a note type
 * Used for column picker UI (future enhancement)
 */
export async function getMetadataFieldsForType(
  typeName: string
): Promise<Array<{ name: string; type: string }>> {
  try {
    const typeInfo = await window.api?.getNoteTypeInfo({ typeName });
    if (typeInfo?.metadata_schema?.fields) {
      return typeInfo.metadata_schema.fields.map((field) => ({
        name: field.name,
        type: field.type
      }));
    }
  } catch {
    // Type info not available
  }
  return [];
}
