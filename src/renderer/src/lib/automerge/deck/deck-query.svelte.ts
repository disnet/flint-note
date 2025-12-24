/**
 * Client-side query service for Deck widgets
 * Replaces server-side SQL queries with in-memory filtering
 */

import type { Note, NoteType } from '../types';
import type {
  DeckConfig,
  DeckFilter,
  DeckSort,
  FilterOperator
} from '../../../../../shared/deck-yaml-utils';
import { getActiveView, DEFAULT_PAGE_SIZE } from '../../../../../shared/deck-yaml-utils';
import type { DeckQueryResult, DeckQueryOptions, FilterFieldInfo } from './deck-types';
import { noteToResultNote, EMPTY_FILTER_VALUE } from './deck-types';

/**
 * Execute a deck query against the provided notes
 * Filters, sorts, and paginates entirely client-side
 */
export function runDeckQuery(
  config: DeckConfig,
  allNotes: Note[],
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
  note: Note,
  filters: DeckFilter[],
  noteTypes: Record<string, NoteType>
): boolean {
  return filters.every((filter) => matchesFilter(note, filter, noteTypes));
}

/**
 * Check if a note matches a single filter
 */
function matchesFilter(
  note: Note,
  filter: DeckFilter,
  noteTypes: Record<string, NoteType>
): boolean {
  const { field, operator = '=', value } = filter;

  // Get the value to compare
  const noteValue = getFieldValue(note, field, noteTypes);

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

  return applyOperator(noteValue, operator, value);
}

/**
 * Get the value of a field from a note
 */
function getFieldValue(
  note: Note,
  field: string,
  noteTypes: Record<string, NoteType>
): unknown {
  // System fields (prefixed with flint_)
  switch (field) {
    case 'flint_type':
      // Return the type name for comparison (UI shows type names)
      return noteTypes[note.type]?.name || note.type;
    case 'flint_title':
      return note.title;
    case 'flint_created':
      return note.created;
    case 'flint_updated':
      return note.updated;
    case 'flint_archived':
      return note.archived;
    default:
      // Custom field from note.props
      return note.props?.[field];
  }
}

/**
 * Apply a filter operator to compare values
 */
function applyOperator(
  noteValue: unknown,
  operator: FilterOperator,
  filterValue: string | string[]
): boolean {
  // Convert note value to string for comparison
  const noteStr = Array.isArray(noteValue) ? noteValue.map(String) : String(noteValue);

  switch (operator) {
    case '=':
      if (Array.isArray(noteStr)) {
        // For array fields, check if the filter value is in the array
        return noteStr.includes(String(filterValue));
      }
      return noteStr === String(filterValue);

    case '!=':
      if (Array.isArray(noteStr)) {
        return !noteStr.includes(String(filterValue));
      }
      return noteStr !== String(filterValue);

    case '>':
      return compareValues(noteValue, filterValue) > 0;

    case '<':
      return compareValues(noteValue, filterValue) < 0;

    case '>=':
      return compareValues(noteValue, filterValue) >= 0;

    case '<=':
      return compareValues(noteValue, filterValue) <= 0;

    case 'LIKE': {
      // SQL LIKE pattern matching: % matches any sequence, _ matches any single char
      const pattern = String(filterValue).replace(/%/g, '.*').replace(/_/g, '.');
      const regex = new RegExp(`^${pattern}$`, 'i');
      if (Array.isArray(noteStr)) {
        return noteStr.some((v) => regex.test(v));
      }
      return regex.test(noteStr);
    }

    case 'IN': {
      const values = Array.isArray(filterValue)
        ? filterValue
        : String(filterValue)
            .split(',')
            .map((v) => v.trim());
      if (Array.isArray(noteStr)) {
        // For array fields, check if any note value is in the filter values
        return noteStr.some((v) => values.includes(v));
      }
      return values.includes(noteStr);
    }

    case 'NOT IN': {
      const values = Array.isArray(filterValue)
        ? filterValue
        : String(filterValue)
            .split(',')
            .map((v) => v.trim());
      if (Array.isArray(noteStr)) {
        return !noteStr.some((v) => values.includes(v));
      }
      return !values.includes(noteStr);
    }

    case 'BETWEEN': {
      const values = Array.isArray(filterValue)
        ? filterValue
        : String(filterValue)
            .split(',')
            .map((v) => v.trim());
      if (values.length !== 2) return false;
      const [min, max] = values;
      return compareValues(noteValue, min) >= 0 && compareValues(noteValue, max) <= 0;
    }

    default:
      return noteStr === String(filterValue);
  }
}

/**
 * Compare two values, handling dates and numbers appropriately
 */
function compareValues(a: unknown, b: unknown): number {
  // Try to parse as dates first (ISO format)
  const aStr = String(a);
  const bStr = String(b);

  // Check if both look like ISO dates
  if (isISODate(aStr) && isISODate(bStr)) {
    return new Date(aStr).getTime() - new Date(bStr).getTime();
  }

  // Try to parse as numbers
  const aNum = parseFloat(aStr);
  const bNum = parseFloat(bStr);
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum;
  }

  // Fall back to string comparison
  return aStr.localeCompare(bStr);
}

/**
 * Check if a string looks like an ISO date
 */
function isISODate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(str);
}

/**
 * Sort notes by the specified field and order
 */
function sortNotes(
  notes: Note[],
  sort: DeckSort,
  noteTypes: Record<string, NoteType>
): Note[] {
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
  note: Note,
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
  allNotes: Note[],
  field: string,
  noteTypes: Record<string, NoteType>
): string[] {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation, not reactive state
  const values = new Set<string>();

  for (const note of allNotes) {
    if (note.archived) continue;
    const value = getFieldValue(note, field, noteTypes);
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
  allNotes: Note[],
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
