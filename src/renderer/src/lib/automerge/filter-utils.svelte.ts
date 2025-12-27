/**
 * Shared filter utilities for note queries
 * Used by both deck widgets and agent search tools
 */

/* eslint-disable svelte/prefer-svelte-reactivity -- Date used for value comparison in utility functions */

import type { NoteMetadata, NoteType, NoteFilterOperator } from './types';

/**
 * Get the value of a field from a note for filtering
 * Supports both agent-style (no prefix) and deck-style (flint_ prefix) field names
 */
export function getFilterFieldValue(
  note: NoteMetadata,
  field: string,
  noteTypes: Record<string, NoteType>
): unknown {
  // Normalize field name (remove flint_ prefix if present for unified handling)
  const normalizedField = field.startsWith('flint_') ? field.slice(6) : field;

  switch (normalizedField) {
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
    default:
      // Custom field from note.props
      return note.props?.[field.startsWith('flint_') ? field : normalizedField];
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
