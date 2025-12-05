/**
 * Type definitions for the Deck feature
 * Defines configuration stored as YAML in flint-deck fenced code blocks
 */

import type {
  MetadataFieldDefinition,
  MetadataFieldType
} from '../../../../server/core/metadata-schema';

/**
 * Column format options for type-specific rendering
 */
export type ColumnFormat =
  | 'default' // Use type-inferred formatting
  | 'relative' // Dates: "2 days ago"
  | 'absolute' // Dates: "Dec 15, 2024"
  | 'iso' // Dates: "2024-12-15"
  | 'pills' // Arrays: pill/tag style
  | 'comma' // Arrays: comma-separated
  | 'check' // Booleans: checkbox
  | 'yesno'; // Booleans: Yes/No text

/**
 * Enhanced column configuration with optional formatting
 */
export interface ColumnConfig {
  /** Field name (required) */
  field: string;
  /** Custom display label (optional) */
  label?: string;
  /** Type-specific formatting option (optional) */
  format?: ColumnFormat;
}

/**
 * Column definition - can be simple string or enhanced config
 */
export type ColumnDefinition = string | ColumnConfig;

/**
 * Normalize a column definition to ColumnConfig
 */
export function normalizeColumn(col: ColumnDefinition): ColumnConfig {
  if (typeof col === 'string') {
    return { field: col };
  }
  return col;
}

/**
 * Check if a column has custom settings (needs enhanced YAML format)
 */
export function columnHasCustomSettings(col: ColumnConfig): boolean {
  return !!(col.label || col.format);
}

/**
 * System columns available for column selection
 */
export const SYSTEM_COLUMNS: ColumnConfig[] = [
  { field: 'title', label: 'Title' },
  { field: 'type', label: 'Type' },
  { field: 'created', label: 'Created' },
  { field: 'updated', label: 'Updated' }
];

/**
 * Get available formats for a field type
 */
export function getFormatsForType(
  type: MetadataFieldType | 'system' | 'unknown'
): ColumnFormat[] {
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
export function getFormatLabel(format: ColumnFormat): string {
  const labels: Record<ColumnFormat, string> = {
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
 * Filter operators supported by the searchNotesAdvanced API
 */
export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'LIKE'
  | 'IN'
  | 'NOT IN'
  | 'BETWEEN';

/**
 * Special marker value for filtering on empty/null values.
 * When used as a filter value, matches notes where the field is empty or doesn't exist.
 */
export const EMPTY_FILTER_VALUE = '__empty__';

/**
 * Field information for the filter builder UI
 */
export interface FilterFieldInfo {
  /** Field name */
  name: string;
  /** Display label */
  label: string;
  /** Field type (determines available operators and input) */
  type: MetadataFieldType | 'system';
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
 * Operators grouped by field type for UI
 */
export const OPERATORS_BY_TYPE: Record<MetadataFieldType | 'system', FilterOperator[]> = {
  string: ['=', '!=', 'LIKE', 'IN', 'NOT IN'],
  number: ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN'],
  boolean: ['=', '!='],
  date: ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN'],
  array: ['IN', '=', '!=', 'NOT IN'],
  select: ['=', '!=', 'IN', 'NOT IN'],
  system: ['=', '!=', 'LIKE', 'IN', 'NOT IN']
};

/**
 * System fields available for filtering
 */
export const SYSTEM_FIELDS: FilterFieldInfo[] = [
  { name: 'flint_type', label: 'Type', type: 'system', isSystem: true },
  { name: 'flint_title', label: 'Title', type: 'system', isSystem: true },
  { name: 'flint_created', label: 'Created', type: 'date', isSystem: true },
  { name: 'flint_updated', label: 'Updated', type: 'date', isSystem: true },
  { name: 'flint_archived', label: 'Archived', type: 'boolean', isSystem: true }
];

/**
 * Convert a MetadataFieldDefinition to FilterFieldInfo
 */
export function fieldDefToFilterInfo(field: MetadataFieldDefinition): FilterFieldInfo {
  return {
    name: field.name,
    label: field.name.replace(/^flint_/, '').replace(/_/g, ' '),
    type: field.type,
    description: field.description,
    options: field.constraints?.options
  };
}

/**
 * Get available operators for a field type
 */
export function getOperatorsForType(
  type: MetadataFieldType | 'system'
): FilterOperator[] {
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

// DeckValidationWarning is re-exported from yaml-utils.ts (shared module)

/**
 * A single filter condition in a deck
 */
export interface DeckFilter {
  /** Field name: 'type' for note type, or a metadata field name */
  field: string;
  /** Comparison operator (default: '=') */
  operator?: FilterOperator;
  /** Value to compare against. Array for IN/NOT IN, [min, max] tuple for BETWEEN */
  value: string | string[];
}

/**
 * Sort configuration for deck results
 */
export interface DeckSort {
  /** Field to sort by */
  field: 'title' | 'type' | 'created' | 'updated' | string;
  /** Sort direction */
  order: 'asc' | 'desc';
}

/**
 * A single view configuration within a deck.
 * Each view has its own filters, columns, and sort settings.
 */
export interface DeckView {
  /** Display name for the view */
  name: string;
  /** Filter conditions for this view */
  filters: DeckFilter[];
  /** Columns to display in this view */
  columns?: ColumnDefinition[];
  /** Sort configuration for this view */
  sort?: DeckSort;
}

/** Available page size options for the UI */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

/**
 * Complete deck configuration stored in YAML.
 * Supports multi-view format (views array) and legacy single-view format.
 */
export interface DeckConfig {
  /** Views within this deck */
  views?: DeckView[];
  /** Index of the currently active view (default: 0) */
  activeView?: number;
  /** @deprecated Use pageSize instead. Kept for backward compatibility. */
  limit?: number;
  /** Number of items to show per page (default: 25) */
  pageSize?: number;
  /** Whether the widget is expanded (default: false) - deck-level setting */
  expanded?: boolean;
  // Legacy fields (for backward compatibility during parsing)
  /** @deprecated Use views[].filters instead */
  filters?: DeckFilter[];
  /** @deprecated Use views[].sort instead */
  sort?: DeckSort;
  /** @deprecated Use views[].columns instead */
  columns?: ColumnDefinition[];
}

/**
 * Get the effective view configuration from a DeckConfig.
 * Handles both legacy (single view) and new (multi-view) formats.
 */
export function getActiveView(config: DeckConfig): DeckView {
  if (config.views && config.views.length > 0) {
    const index = config.activeView ?? 0;
    return config.views[Math.min(index, config.views.length - 1)];
  }
  // Legacy format - construct view from top-level fields
  return {
    name: 'Default',
    filters: config.filters ?? [],
    columns: config.columns,
    sort: config.sort
  };
}

/**
 * Check if a config uses multi-view format
 */
export function isMultiViewConfig(config: DeckConfig): boolean {
  return Array.isArray(config.views) && config.views.length > 0;
}

/**
 * Create a default view with empty filters
 */
export function createDefaultView(name: string = 'Default'): DeckView {
  return {
    name,
    filters: [],
    sort: { field: 'updated', order: 'desc' }
  };
}

/**
 * A note returned from a deck query, flattened for display
 */
export interface DeckResultNote {
  id: string;
  title: string;
  type: string;
  created: string;
  updated: string;
  /** User-defined metadata fields */
  metadata: Record<string, unknown>;
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
 * Information about a parsed flint-deck code block
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
 * Handlers for deck widget interactions
 */
export interface DeckHandlers {
  /** Called when deck config changes (e.g., sort order) */
  onConfigChange: (from: number, to: number, newConfig: DeckConfig) => void;
  /** Called when user opens a note */
  onNoteOpen: (noteId: string) => void;
}
