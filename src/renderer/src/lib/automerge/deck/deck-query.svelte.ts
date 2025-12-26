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
import type { DeckQueryResult, DeckQueryOptions, FilterFieldInfo } from './deck-types';
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

  // Step 1: Filter out archived notes (unless requested)
  let notes = includeArchived ? allNotes : allNotes.filter((n) => !n.archived);

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
 */
function getSortValue(
  note: NoteMetadata,
  field: string,
  noteTypes: Record<string, NoteType>
): unknown {
  // Map common field names to note properties
  switch (field) {
    case 'title':
    case 'flint_title':
      return note.title.toLowerCase();
    case 'type':
    case 'flint_type':
      // Sort by type name, not ID
      return noteTypes[note.type]?.name?.toLowerCase() || '';
    case 'created':
    case 'flint_created':
      return note.created;
    case 'updated':
    case 'flint_updated':
      return note.updated;
    default:
      // Custom field from props
      return note.props?.[field];
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
 */
export function getAvailableFields(
  allNotes: NoteMetadata[],
  _noteTypes: Record<string, NoteType>
): FilterFieldInfo[] {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation, not reactive state
  const customFields = new Set<string>();

  // Collect all custom prop fields from notes
  for (const note of allNotes) {
    if (note.archived) continue;
    if (note.props) {
      Object.keys(note.props).forEach((key) => customFields.add(key));
    }
  }

  // System fields
  const fields: FilterFieldInfo[] = [
    { name: 'flint_type', label: 'Type', type: 'select', isSystem: true },
    { name: 'flint_title', label: 'Title', type: 'string', isSystem: true },
    { name: 'flint_created', label: 'Created', type: 'date', isSystem: true },
    { name: 'flint_updated', label: 'Updated', type: 'date', isSystem: true },
    { name: 'flint_archived', label: 'Archived', type: 'boolean', isSystem: true }
  ];

  // Add custom fields (default to string type, could be enhanced to infer from values)
  for (const fieldName of Array.from(customFields).sort()) {
    fields.push({
      name: fieldName,
      label: fieldName.replace(/_/g, ' '),
      type: 'string',
      isSystem: false
    });
  }

  return fields;
}
