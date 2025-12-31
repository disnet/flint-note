/**
 * Shared filter utilities for note queries
 * Used by both deck widgets and agent search tools
 */

/* eslint-disable svelte/prefer-svelte-reactivity -- Date used for value comparison in utility functions */

import type { NoteMetadata, NoteType, NoteFilterOperator } from './types';

/**
 * Get the value of a field from a note for filtering
 *
 * Field naming convention:
 * - System fields: type, title, created, updated, archived (no prefix)
 * - Custom properties: props.fieldname (e.g., props.status, props.priority)
 */
export function getFilterFieldValue(
  note: NoteMetadata,
  field: string,
  noteTypes: Record<string, NoteType>
): unknown {
  // Handle props.* namespace for custom properties
  if (field.startsWith('props.')) {
    const propName = field.slice(6);
    return note.props?.[propName];
  }

  // System fields (no prefix)
  switch (field) {
    case 'type':
      // Return the type name for user-friendly filtering
      return noteTypes[note.type]?.name || note.type;
    case 'type_id':
      // Return raw type ID
      return note.type;
    case 'title':
      return note.title;
    case 'created':
      return note.created;
    case 'updated':
      return note.updated;
    case 'archived':
      return note.archived;
    case 'sourceFormat':
      return note.sourceFormat || 'markdown';
    case 'lastOpened':
      return note.lastOpened;
    case 'review.enabled':
      return note.review?.enabled ?? false;
    case 'review.status':
      return note.review?.status;
    case 'review.lastReviewed':
      return note.review?.lastReviewed;
    case 'review.reviewCount':
      return note.review?.reviewCount ?? 0;
    default:
      // Unknown field
      return undefined;
  }
}

/**
 * Sentinel value for filtering on empty/missing values
 */
export const EMPTY_FILTER_VALUE = '__empty__';

/**
 * Apply a filter operator to compare values
 */
export function applyFilterOperator(
  noteValue: unknown,
  operator: NoteFilterOperator | string,
  filterValue: string | string[]
): boolean {
  // Convert note value to string for comparison
  const noteStr = Array.isArray(noteValue) ? noteValue.map(String) : String(noteValue);

  switch (operator) {
    case '=':
      if (Array.isArray(noteStr)) {
        // For array fields, check if the filter value is in the array
        return noteStr.some((v) => v.toLowerCase() === String(filterValue).toLowerCase());
      }
      return noteStr.toLowerCase() === String(filterValue).toLowerCase();

    case '!=':
      if (Array.isArray(noteStr)) {
        return !noteStr.some(
          (v) => v.toLowerCase() === String(filterValue).toLowerCase()
        );
      }
      return noteStr.toLowerCase() !== String(filterValue).toLowerCase();

    case '>':
      return compareValues(noteValue, filterValue) > 0;

    case '<':
      return compareValues(noteValue, filterValue) < 0;

    case '>=':
      return compareValues(noteValue, filterValue) >= 0;

    case '<=':
      return compareValues(noteValue, filterValue) <= 0;

    case 'LIKE': {
      // Simple "contains" matching - case insensitive substring search
      const searchTerm = String(filterValue).toLowerCase();
      if (Array.isArray(noteStr)) {
        return noteStr.some((v) => v.toLowerCase().includes(searchTerm));
      }
      return noteStr.toLowerCase().includes(searchTerm);
    }

    case 'IN': {
      const values = Array.isArray(filterValue)
        ? filterValue.map((v) => v.toLowerCase())
        : String(filterValue)
            .split(',')
            .map((v) => v.trim().toLowerCase());
      if (Array.isArray(noteStr)) {
        // For array fields, check if any note value is in the filter values
        return noteStr.some((v) => values.includes(v.toLowerCase()));
      }
      return values.includes(noteStr.toLowerCase());
    }

    case 'NOT IN': {
      const values = Array.isArray(filterValue)
        ? filterValue.map((v) => v.toLowerCase())
        : String(filterValue)
            .split(',')
            .map((v) => v.trim().toLowerCase());
      if (Array.isArray(noteStr)) {
        return !noteStr.some((v) => values.includes(v.toLowerCase()));
      }
      return !values.includes(noteStr.toLowerCase());
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
      if (Array.isArray(noteStr)) {
        return noteStr.some((v) => v.toLowerCase() === String(filterValue).toLowerCase());
      }
      return noteStr.toLowerCase() === String(filterValue).toLowerCase();
  }
}

/**
 * Compare two values, handling dates and numbers appropriately
 */
export function compareValues(a: unknown, b: unknown): number {
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
export function isISODate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(str);
}
