/**
 * Type definitions for the Dataview feature
 * Defines query configuration stored as YAML in flint-query fenced code blocks
 */

import type {
  MetadataFieldDefinition,
  MetadataFieldType
} from '../../../../server/core/metadata-schema';

/**
 * Filter operators supported by the searchNotesAdvanced API
 */
export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN';

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
  /** Whether this is a system field */
  isSystem?: boolean;
}

/**
 * Operators grouped by field type for UI
 */
export const OPERATORS_BY_TYPE: Record<MetadataFieldType | 'system', FilterOperator[]> = {
  string: ['=', '!=', 'LIKE'],
  number: ['=', '!=', '>', '<', '>=', '<='],
  boolean: ['=', '!='],
  date: ['=', '!=', '>', '<', '>=', '<='],
  array: ['IN', '=', '!='],
  select: ['=', '!=', 'IN'],
  system: ['=', '!=', 'LIKE']
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
    label: field.name.charAt(0).toUpperCase() + field.name.slice(1).replace(/_/g, ' '),
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
    IN: 'in list'
  };
  return labels[operator] || operator;
}

/**
 * A single filter condition in a query
 */
export interface QueryFilter {
  /** Field name: 'type' for note type, or a metadata field name */
  field: string;
  /** Comparison operator (default: '=') */
  operator?: FilterOperator;
  /** Value to compare against. Array for 'IN' operator */
  value: string | string[];
}

/**
 * Sort configuration for query results
 */
export interface QuerySort {
  /** Field to sort by */
  field: 'title' | 'type' | 'created' | 'updated' | string;
  /** Sort direction */
  order: 'asc' | 'desc';
}

/**
 * Complete query configuration stored in YAML
 */
export interface FlintQueryConfig {
  /** Optional display name for the query */
  name?: string;
  /** Filter conditions to apply */
  filters: QueryFilter[];
  /** Optional sort configuration */
  sort?: QuerySort;
  /** Metadata field names to display as columns */
  columns?: string[];
  /** Maximum results to return (default: 50) */
  limit?: number;
}

/**
 * A note returned from a query, flattened for display
 */
export interface QueryResultNote {
  id: string;
  title: string;
  type: string;
  created: string;
  updated: string;
  /** User-defined metadata fields */
  metadata: Record<string, unknown>;
}

/**
 * Information about a parsed flint-query code block
 */
export interface FlintQueryBlock {
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
 * Handlers for dataview widget interactions
 */
export interface DataviewHandlers {
  /** Called when query config changes (e.g., sort order) */
  onConfigChange: (from: number, to: number, newConfig: FlintQueryConfig) => void;
  /** Called when user clicks "+ New Note" */
  onNewNote: (type: string | null) => void;
  /** Called when user clicks a note title */
  onNoteClick: (noteId: string, shiftKey?: boolean) => void;
}
