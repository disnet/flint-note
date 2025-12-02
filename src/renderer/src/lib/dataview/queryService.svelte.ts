/**
 * Query execution service for Dataview widgets
 * Executes queries against the note API and returns formatted results
 */

import type { FlintQueryConfig, QueryResultNote, FilterOperator } from './types';

/**
 * Execute a dataview query and return matching notes
 */
export async function runDataviewQuery(
  config: FlintQueryConfig
): Promise<QueryResultNote[]> {
  // Extract type filter if present (use flint_type)
  const typeFilter = config.filters.find((f) => f.field === 'flint_type');
  const typeName = typeof typeFilter?.value === 'string' ? typeFilter.value : undefined;

  // Get metadata filters (everything except flint_type)
  const metadataFilters = config.filters.filter((f) => f.field !== 'flint_type');

  let notes: QueryResultNote[] = [];

  if (typeName) {
    // Use listNotesByType for type-based queries
    const noteList = await window.api?.listNotesByType({
      type: typeName,
      limit: config.limit || 50,
      includeArchived: false
    });

    if (noteList && Array.isArray(noteList)) {
      // Fetch full notes to get metadata
      // TODO: This is N+1 queries - optimize by adding batch getNotes IPC
      notes = await fetchNotesWithMetadata(noteList.map((n) => n.id));
    }
  } else {
    // No type filter - use search with empty query
    // This returns all notes (up to limit)
    const searchResults = await window.api?.searchNotes({
      query: '',
      limit: config.limit || 50
    });

    if (searchResults && Array.isArray(searchResults)) {
      notes = await fetchNotesWithMetadata(searchResults.map((r) => r.id));
    }
  }

  // Apply metadata filters client-side
  // TODO: Extend IPC to support server-side metadata filtering
  if (metadataFilters.length > 0) {
    notes = notes.filter((note) => matchesMetadataFilters(note, metadataFilters));
  }

  // Apply sorting
  if (config.sort) {
    notes = sortNotes(notes, config.sort.field, config.sort.order);
  }

  // Apply limit (in case client-side filtering reduced results)
  const limit = config.limit || 50;
  if (notes.length > limit) {
    notes = notes.slice(0, limit);
  }

  return notes;
}

/**
 * Fetch full notes with metadata for a list of note IDs
 */
async function fetchNotesWithMetadata(noteIds: string[]): Promise<QueryResultNote[]> {
  const notes: QueryResultNote[] = [];

  // Fetch notes in parallel (with reasonable batch size)
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

    notes.push(...batchResults.filter((n): n is QueryResultNote => n !== null));
  }

  return notes;
}

/**
 * Extract user-defined metadata (excluding system fields)
 */
function extractUserMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const systemFields = new Set([
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

  const userMetadata: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!systemFields.has(key)) {
      userMetadata[key] = value;
    }
  }

  return userMetadata;
}

/**
 * Check if a note matches all metadata filters
 */
function matchesMetadataFilters(
  note: QueryResultNote,
  filters: Array<{ field: string; operator?: FilterOperator; value: string | string[] }>
): boolean {
  return filters.every((filter) => {
    const noteValue = note.metadata[filter.field];
    const operator = filter.operator || '=';
    const filterValue = filter.value;

    // Handle undefined/null metadata values
    if (noteValue === undefined || noteValue === null) {
      // Only match if filter is checking for empty/null
      return operator === '!=' && filterValue !== '';
    }

    // Convert note value to string for comparison
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
        // Simple LIKE implementation (% as wildcard)
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
 * Sort notes by a field
 */
function sortNotes(
  notes: QueryResultNote[],
  field: string,
  order: 'asc' | 'desc'
): QueryResultNote[] {
  return [...notes].sort((a, b) => {
    let aVal: string | number;
    let bVal: string | number;

    // Handle built-in fields
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
      // Metadata field
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
