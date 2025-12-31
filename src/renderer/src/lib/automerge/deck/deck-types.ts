/**
 * Type definitions for the Automerge Deck feature
 * Adapted from legacy deck types, removing server-side dependencies
 */

import type { NoteMetadata, NoteType } from '../types';

// Re-export core deck types from shared utils
export {
  type DeckConfig,
  type DeckView,
  type DeckFilter,
  type DeckSort,
  type FilterOperator,
  type ColumnConfig,
  type ColumnDefinition,
  type ColumnFormat,
  type DeckValidationWarning,
  type PageSize,
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
  parseDeckYaml,
  parseDeckYamlWithWarnings,
  serializeDeckConfig,
  createEmptyDeckConfig,
  getActiveView,
  getView,
  columnHasCustomSettings
} from '../../../../../shared/deck-yaml-utils';

/**
 * Metadata field types for Automerge notes
 * Used for filter builder UI and query execution
 */
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'select'
  | 'notelink'
  | 'notelinks'
  | 'system';

/**
 * Field information for the filter builder UI
 */
export interface FilterFieldInfo {
  /** Field name */
  name: string;
  /** Display label */
  label: string;
  /** Field type (determines available operators and input) */
  type: FieldType;
  /** Optional description */
  description?: string;
  /** Available options for select fields */
  options?: string[];
  /** Icons for options (keyed by option value) */
  optionIcons?: Record<string, string>;
  /** Whether this is a system field */
  isSystem?: boolean;
}

/**
 * Filter operators supported by the client-side query service
 */
import type { FilterOperator } from '../../../../../shared/deck-yaml-utils';

/**
 * Operators grouped by field type for UI
 */
export const OPERATORS_BY_TYPE: Record<FieldType, FilterOperator[]> = {
  string: ['=', '!=', 'LIKE', 'IN', 'NOT IN'],
  number: ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN'],
  boolean: ['=', '!='],
  date: ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN'],
  array: ['IN', '=', '!=', 'NOT IN'],
  select: ['=', '!=', 'IN', 'NOT IN'],
  notelink: ['=', '!=', 'IN', 'NOT IN'],
  notelinks: ['IN', 'NOT IN', '=', '!='],
  system: ['=', '!=', 'LIKE', 'IN', 'NOT IN']
};

/**
 * System fields available for filtering
 * These use bare names (no prefix) - custom properties use props.* namespace
 */
export const SYSTEM_FIELDS: FilterFieldInfo[] = [
  { name: 'type', label: 'Type', type: 'select', isSystem: true },
  { name: 'title', label: 'Title', type: 'string', isSystem: true },
  { name: 'created', label: 'Created', type: 'date', isSystem: true },
  { name: 'updated', label: 'Updated', type: 'date', isSystem: true },
  { name: 'archived', label: 'Archived', type: 'boolean', isSystem: true }
];

/**
 * Set of system field names for quick lookup
 */
export const SYSTEM_FIELD_NAMES = new Set([
  'type',
  'type_id',
  'title',
  'created',
  'updated',
  'archived'
]);

/**
 * System columns available for column selection
 */
export const SYSTEM_COLUMNS: { field: string; label: string }[] = [
  { field: 'title', label: 'Title' },
  { field: 'type', label: 'Type' },
  { field: 'created', label: 'Created' },
  { field: 'updated', label: 'Updated' }
];

/**
 * Get available operators for a field type
 */
export function getOperatorsForType(type: FieldType): FilterOperator[] {
  return OPERATORS_BY_TYPE[type] || OPERATORS_BY_TYPE.string;
}

/**
 * Get display label for an operator
 */
export function getOperatorLabel(operator: FilterOperator): string {
  const labels: Record<FilterOperator, string> = {
    '=': 'equals',
    '!=': 'not equals',
    '>': 'greater than',
    '<': 'less than',
    '>=': 'at least',
    '<=': 'at most',
    LIKE: 'contains',
    IN: 'in list',
    'NOT IN': 'not in list',
    BETWEEN: 'between'
  };
  return labels[operator] || operator;
}

/**
 * Get available formats for a field type
 */
export function getFormatsForType(
  type: FieldType
): import('../../../../../shared/deck-yaml-utils').ColumnFormat[] {
  switch (type) {
    case 'date':
      return ['default', 'relative', 'absolute', 'iso'];
    case 'boolean':
      return ['default', 'check', 'yesno'];
    case 'array':
      return ['default', 'pills', 'comma'];
    default:
      return ['default'];
  }
}

/**
 * Get display label for a format option
 */
export function getFormatLabel(
  format: import('../../../../../shared/deck-yaml-utils').ColumnFormat
): string {
  const labels: Record<
    import('../../../../../shared/deck-yaml-utils').ColumnFormat,
    string
  > = {
    default: 'Default',
    relative: 'Relative (2 days ago)',
    absolute: 'Absolute (Dec 15, 2024)',
    iso: 'ISO (2024-12-15)',
    pills: 'Pills',
    comma: 'Comma-separated',
    check: 'Checkbox',
    yesno: 'Yes/No'
  };
  return labels[format] || format;
}

/**
 * Special marker value for filtering on empty/null values.
 * When used as a filter value, matches notes where the field is empty or doesn't exist.
 * Re-exported from filter-utils for backward compatibility.
 */
export { EMPTY_FILTER_VALUE } from '../filter-utils.svelte';

/**
 * A note returned from a deck query, flattened for display
 */
export interface DeckResultNote {
  id: string;
  title: string;
  /** Note type ID (e.g., 'type-xxxxxxxx') */
  typeId: string;
  /** Note type name for display */
  typeName: string;
  /** Note type icon */
  typeIcon: string;
  created: string;
  updated: string;
  /** Custom properties from note.props */
  props: Record<string, unknown>;
}

/**
 * Result of a deck query, including pagination metadata
 */
export interface DeckQueryResult {
  /** Notes matching the query for the current page */
  notes: DeckResultNote[];
  /** Total number of notes matching the query (across all pages) */
  total: number;
  /** Whether there are more results beyond the current page */
  hasMore: boolean;
}

/**
 * Options for running a deck query
 */
export interface DeckQueryOptions {
  /** Offset for pagination (default: 0) */
  offset?: number;
  /** Whether to include archived notes (default: false) */
  includeArchived?: boolean;
}

/**
 * Handlers for deck widget interactions
 */
export interface DeckHandlers {
  /** Called when deck config changes (e.g., sort order) */
  onConfigChange: (
    newConfig: import('../../../../../shared/deck-yaml-utils').DeckConfig
  ) => void;
  /** Called when user opens a note */
  onNoteOpen: (noteId: string) => void;
  /** Called when user creates a new note from the deck */
  onNoteCreate: (typeId: string, prefillProps?: Record<string, unknown>) => void;
}

/**
 * Convert a NoteMetadata to DeckResultNote
 */
export function noteToResultNote(
  note: NoteMetadata,
  noteTypes: Record<string, NoteType>
): DeckResultNote {
  const noteType = noteTypes[note.type];
  return {
    id: note.id,
    title: note.title,
    typeId: note.type,
    typeName: noteType?.name || 'Unknown',
    typeIcon: noteType?.icon || '📝',
    created: note.created,
    updated: note.updated,
    props: note.props || {}
  };
}

/**
 * Information about a parsed flint-deck code block (for CodeMirror extension)
 */
export interface DeckBlock {
  /** Start position of the opening ``` */
  from: number;
  /** End position of the closing ``` */
  to: number;
  /** Start position of the YAML content */
  contentFrom: number;
  /** End position of the YAML content */
  contentTo: number;
  /** The raw YAML content */
  yamlContent: string;
}

/**
 * Normalize a column definition to ColumnConfig
 */
export function normalizeColumn(
  col: import('../../../../../shared/deck-yaml-utils').ColumnDefinition
): import('../../../../../shared/deck-yaml-utils').ColumnConfig {
  if (typeof col === 'string') {
    return { field: col };
  }
  return col;
}

/**
 * Create a default view with empty filters
 */
export function createDefaultView(
  name: string = 'Default'
): import('../../../../../shared/deck-yaml-utils').DeckView {
  return {
    name,
    filters: [],
    sort: { field: 'updated', order: 'desc' }
  };
}
