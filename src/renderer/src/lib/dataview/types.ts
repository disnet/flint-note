/**
 * Type definitions for the Dataview feature
 * Defines query configuration stored as YAML in flint-query fenced code blocks
 */

/**
 * Filter operators supported by the searchNotesAdvanced API
 */
export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN';

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
