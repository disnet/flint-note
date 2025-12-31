/**
 * Client-side query service for Deck widgets
 * Replaces server-side SQL queries with in-memory filtering
 */

import type { NoteMetadata, NoteType } from '../types';
import type {
  DeckConfig,
  DeckFilter,
  DeckSort
} from '../../../../../shared/deck-yaml-utils';
import { getActiveView, DEFAULT_PAGE_SIZE } from '../../../../../shared/deck-yaml-utils';
import type {
  DeckQueryResult,
  DeckQueryOptions,
  FilterFieldInfo,
  FieldType
} from './deck-types';
import { noteToResultNote, EMPTY_FILTER_VALUE } from './deck-types';
import {
  getFilterFieldValue,
  applyFilterOperator,
  compareValues
} from '../filter-utils.svelte';

/**
 * Execute a deck query against the provided notes
 * Filters, sorts, and paginates entirely client-side
 */
export function runDeckQuery(
  config: DeckConfig,
  allNotes: NoteMetadata[],
  noteTypes: Record<string, NoteType>,
  options: DeckQueryOptions = {}
): DeckQueryResult {
  const { offset = 0, includeArchived = false } = options;

  // Get active view configuration
  const view = getActiveView(config);
  const filters = view.filters || [];
  const sort = view.sort;
  const pageSize = config.pageSize || DEFAULT_PAGE_SIZE;

  // Check if there's an archived filter - if so, we need to include archived notes
  const hasArchivedFilter = filters.some((f) => f.field === 'archived');

  // Step 1: Filter out archived notes (unless requested or there's an archived filter)
  let notes =
    includeArchived || hasArchivedFilter ? allNotes : allNotes.filter((n) => !n.archived);

  // Step 2: Apply filters
  notes = notes.filter((note) => matchesFilters(note, filters, noteTypes));

  // Step 3: Sort
  if (sort) {
    notes = sortNotes(notes, sort, noteTypes);
  }

  // Step 4: Calculate total before pagination
  const total = notes.length;

  // Step 5: Paginate
  const paginatedNotes = notes.slice(offset, offset + pageSize);
  const hasMore = offset + pageSize < total;

  // Step 6: Transform to result format
  const resultNotes = paginatedNotes.map((note) => noteToResultNote(note, noteTypes));

  return {
    notes: resultNotes,
    total,
    hasMore
  };
}

/**
 * Check if a note matches all filters
 */
function matchesFilters(
  note: NoteMetadata,
  filters: DeckFilter[],
  noteTypes: Record<string, NoteType>
): boolean {
  return filters.every((filter) => matchesFilter(note, filter, noteTypes));
}

/**
 * Check if a note matches a single filter
 */
function matchesFilter(
  note: NoteMetadata,
  filter: DeckFilter,
  noteTypes: Record<string, NoteType>
): boolean {
  const { field, operator = '=', value } = filter;

  // Get the value to compare (uses shared utility)
  const noteValue = getFilterFieldValue(note, field, noteTypes);

  // Handle empty filter value
  if (value === EMPTY_FILTER_VALUE) {
    const isEmpty = noteValue === undefined || noteValue === null || noteValue === '';
    return operator === '=' ? isEmpty : !isEmpty;
  }

  // Handle null/undefined note values
  if (noteValue === undefined || noteValue === null) {
    // For !=, notes without the field should match (they don't equal any value)
    if (operator === '!=') return true;
    // For boolean fields filtering on 'false', treat missing field as false
    if (operator === '=' && value === 'false') return true;
    return false;
  }

  // Use shared filter operator logic
  return applyFilterOperator(noteValue, operator, value);
}

/**
 * Sort notes by the specified field and order
 */
function sortNotes(
  notes: NoteMetadata[],
  sort: DeckSort,
  noteTypes: Record<string, NoteType>
): NoteMetadata[] {
  const { field, order } = sort;
  const multiplier = order === 'desc' ? -1 : 1;

  return [...notes].sort((a, b) => {
    const aValue = getSortValue(a, field, noteTypes);
    const bValue = getSortValue(b, field, noteTypes);

    // Handle null/undefined - push to end
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    return multiplier * compareValues(aValue, bValue);
  });
}

/**
 * Get the value to use for sorting from a note
 *
 * Field naming convention:
 * - System fields: type, title, created, updated (no prefix)
 * - Custom properties: props.fieldname (e.g., props.status)
 */
function getSortValue(
  note: NoteMetadata,
  field: string,
  noteTypes: Record<string, NoteType>
): unknown {
  // Handle props.* namespace for custom properties
  if (field.startsWith('props.')) {
    const propName = field.slice(6);
    return note.props?.[propName];
  }

  // System fields
  switch (field) {
    case 'title':
      return note.title.toLowerCase();
    case 'type':
      // Sort by type name, not ID
      return noteTypes[note.type]?.name?.toLowerCase() || '';
    case 'created':
      return note.created;
    case 'updated':
      return note.updated;
    default:
      return undefined;
  }
}

/**
 * Get unique values for a field across all notes (for filter suggestions)
 */
export function getFieldValues(
  allNotes: NoteMetadata[],
  field: string,
  noteTypes: Record<string, NoteType>
): string[] {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation, not reactive state
  const values = new Set<string>();

  for (const note of allNotes) {
    if (note.archived) continue;
    const value = getFilterFieldValue(note, field, noteTypes);
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      value.forEach((v) => values.add(String(v)));
    } else {
      values.add(String(value));
    }
  }

  return Array.from(values).sort();
}

/**
 * Get all available fields for filtering (system + custom props)
 * @param allNotes - All notes in the vault
 * @param noteTypes - Note types dictionary for looking up field types and options
 * @param filteredTypeIds - Optional array of type IDs to filter props by
 */
export function getAvailableFields(
  allNotes: NoteMetadata[],
  noteTypes: Record<string, NoteType>,
  filteredTypeIds?: string[]
): FilterFieldInfo[] {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation, not reactive state
  const customFields = new Set<string>();

  // Collect custom prop fields from notes, optionally filtered by type
  for (const note of allNotes) {
    if (note.archived) continue;
    // If type filter is active, only include props from matching notes
    if (filteredTypeIds && filteredTypeIds.length > 0) {
      if (!note.type || !filteredTypeIds.includes(note.type)) {
        continue;
      }
    }
    if (note.props) {
      Object.keys(note.props).forEach((key) => customFields.add(key));
    }
  }

  // Build a map of field name -> schema info from note types
  // When type filter is active, only look at those types; otherwise look at all
  const typeIdsToCheck =
    filteredTypeIds && filteredTypeIds.length > 0
      ? filteredTypeIds
      : Object.keys(noteTypes);

  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation
  const fieldSchemaMap = new Map<string, { type: FieldType; options?: string[] }>();
  for (const typeId of typeIdsToCheck) {
    const noteType = noteTypes[typeId];
    if (noteType?.properties) {
      for (const prop of noteType.properties) {
        // Only set if not already set (first type wins)
        // or if new one has options and existing doesn't
        const existing = fieldSchemaMap.get(prop.name);
        const hasOptions =
          prop.constraints?.options && prop.constraints.options.length > 0;
        if (!existing || (hasOptions && !existing.options)) {
          fieldSchemaMap.set(prop.name, {
            type: prop.type as FieldType,
            options: prop.constraints?.options
          });
        }
      }
    }
  }

  // System fields (no prefix)
  const fields: FilterFieldInfo[] = [
    { name: 'type', label: 'Type', type: 'select', isSystem: true },
    { name: 'title', label: 'Title', type: 'string', isSystem: true },
    { name: 'created', label: 'Created', type: 'date', isSystem: true },
    { name: 'updated', label: 'Updated', type: 'date', isSystem: true },
    { name: 'archived', label: 'Archived', type: 'boolean', isSystem: true }
  ];

  // Add custom fields with props.* prefix
  for (const fieldName of Array.from(customFields).sort()) {
    const schema = fieldSchemaMap.get(fieldName);
    fields.push({
      name: `props.${fieldName}`,
      label: fieldName.replace(/_/g, ' '),
      type: schema?.type ?? 'string',
      options: schema?.options,
      isSystem: false
    });
  }

  return fields;
}
