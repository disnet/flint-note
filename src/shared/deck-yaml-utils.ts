/**
 * Shared YAML parsing and serialization utilities for deck notes.
 * Used by both main process (agent tools) and renderer (deck widgets).
 */

import yaml from 'js-yaml';

// Type definitions for deck configuration
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
 * Validation warning for deck configuration issues
 */
export interface DeckValidationWarning {
  type: 'duplicate_field';
  field: string;
  message: string;
}
export type ColumnFormat =
  | 'default'
  | 'relative'
  | 'absolute'
  | 'iso'
  | 'pills'
  | 'comma'
  | 'check'
  | 'yesno';

export interface ColumnConfig {
  field: string;
  label?: string;
  format?: ColumnFormat;
}

export type ColumnDefinition = string | ColumnConfig;

export interface DeckFilter {
  field: string;
  operator?: FilterOperator;
  value: string | string[];
}

export interface DeckSort {
  field: string;
  order: 'asc' | 'desc';
}

export interface DeckView {
  name: string;
  filters: DeckFilter[];
  columns?: ColumnDefinition[];
  sort?: DeckSort;
}

export interface DeckConfig {
  views?: DeckView[];
  activeView?: number;
  /** @deprecated Use pageSize instead. Kept for backward compatibility. */
  limit?: number;
  /** Number of items to show per page (default: 25) */
  pageSize?: number;
  expanded?: boolean;
  // Legacy fields for backward compatibility
  filters?: DeckFilter[];
  sort?: DeckSort;
  columns?: ColumnDefinition[];
}

const VALID_OPERATORS: FilterOperator[] = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'LIKE',
  'IN',
  'NOT IN',
  'BETWEEN'
];
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/** Available page size options for the UI */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

/**
 * Result of parsing deck YAML, including any validation warnings
 */
export interface ParsedDeckResult {
  config: DeckConfig;
  warnings: DeckValidationWarning[];
}

/**
 * Deduplicate filters by field, keeping only the first filter for each field.
 * Returns the deduplicated filters and any warnings generated.
 */
function deduplicateFilters(filters: DeckFilter[]): {
  filters: DeckFilter[];
  warnings: DeckValidationWarning[];
} {
  const seen = new Set<string>();
  const deduplicated: DeckFilter[] = [];
  const warnings: DeckValidationWarning[] = [];

  for (const filter of filters) {
    if (seen.has(filter.field)) {
      warnings.push({
        type: 'duplicate_field',
        field: filter.field,
        message: `Multiple filters for "${filter.field}" - only the first is used. Use IN/NOT IN for multiple values or BETWEEN for ranges.`
      });
      continue;
    }
    seen.add(filter.field);
    deduplicated.push(filter);
  }

  return { filters: deduplicated, warnings };
}

/**
 * Check if a column has custom settings (needs enhanced YAML format)
 */
export function columnHasCustomSettings(col: ColumnConfig): boolean {
  return !!(col.label || col.format);
}

/**
 * Parse YAML content into a validated DeckConfig
 * Returns null if parsing fails or content is invalid
 */
export function parseDeckYaml(yamlContent: string): DeckConfig | null {
  const result = parseDeckYamlWithWarnings(yamlContent);
  return result?.config ?? null;
}

/**
 * Parse YAML content into a validated DeckConfig with warnings
 * Returns both the config and any validation warnings (e.g., duplicate filters)
 */
export function parseDeckYamlWithWarnings(yamlContent: string): ParsedDeckResult | null {
  try {
    const parsed = yaml.load(yamlContent);
    return validateDeckConfigWithWarnings(parsed);
  } catch (e) {
    console.error('Failed to parse flint-deck YAML:', e);
    return null;
  }
}

/**
 * Serialize filters, cleaning out incomplete ones
 */
function serializeFilters(filters: DeckFilter[]): Record<string, unknown>[] {
  const completeFilters = filters.filter((filter) => {
    if (!filter.field || !filter.field.trim()) return false;
    if (filter.value === undefined || filter.value === null) return false;
    if (typeof filter.value === 'string' && !filter.value.trim()) return false;
    if (Array.isArray(filter.value) && filter.value.length === 0) return false;
    return true;
  });

  return completeFilters.map((filter) => {
    const f: Record<string, unknown> = {
      field: filter.field,
      value: filter.value
    };
    // Only include operator if it's not the default '='
    if (filter.operator && filter.operator !== '=') {
      f.operator = filter.operator;
    }
    return f;
  });
}

/**
 * Serialize columns, using simple string format when possible
 */
function serializeColumns(
  columns: ColumnDefinition[]
): (string | Record<string, unknown>)[] {
  return columns.map((col) => {
    if (typeof col === 'string') {
      return col;
    }
    // Only use object format if there are custom settings
    if (columnHasCustomSettings(col)) {
      const colObj: Record<string, unknown> = { field: col.field };
      if (col.label) colObj.label = col.label;
      if (col.format && col.format !== 'default') colObj.format = col.format;
      return colObj;
    }
    // Otherwise just use the field name
    return col.field;
  });
}

/**
 * Serialize a single view
 */
function serializeView(view: DeckView): Record<string, unknown> {
  const viewObj: Record<string, unknown> = {
    name: view.name,
    filters: serializeFilters(view.filters)
  };

  if (view.columns && view.columns.length > 0) {
    viewObj.columns = serializeColumns(view.columns);
  }

  if (view.sort) {
    viewObj.sort = {
      field: view.sort.field,
      order: view.sort.order
    };
  }

  return viewObj;
}

/**
 * Serialize a DeckConfig back to YAML string.
 * Always writes the multi-view format.
 */
export function serializeDeckConfig(config: DeckConfig): string {
  const cleanConfig: Record<string, unknown> = {};

  // Serialize views (always use views format)
  if (config.views && config.views.length > 0) {
    cleanConfig.views = config.views.map(serializeView);

    // Only include activeView if not 0
    if (config.activeView !== undefined && config.activeView !== 0) {
      cleanConfig.activeView = config.activeView;
    }
  } else {
    // Legacy format fallback - convert to single view
    const legacyView: DeckView = {
      name: 'Default',
      filters: config.filters ?? [],
      columns: config.columns,
      sort: config.sort
    };
    cleanConfig.views = [serializeView(legacyView)];
  }

  // Serialize pageSize if not default
  if (config.pageSize && config.pageSize !== DEFAULT_PAGE_SIZE) {
    cleanConfig.pageSize = config.pageSize;
  }

  // Keep limit for backward compatibility if explicitly set (and different from pageSize)
  if (
    config.limit &&
    config.limit !== DEFAULT_LIMIT &&
    config.limit !== config.pageSize
  ) {
    cleanConfig.limit = config.limit;
  }

  if (config.expanded) {
    cleanConfig.expanded = true;
  }

  return yaml.dump(cleanConfig, {
    indent: 2,
    lineWidth: -1, // No line wrapping
    quotingType: '"',
    forceQuotes: false
  });
}

/**
 * Validate a single view object and collect warnings
 */
function validateViewWithWarnings(view: unknown): {
  view: DeckView | null;
  warnings: DeckValidationWarning[];
} {
  const warnings: DeckValidationWarning[] = [];

  if (!view || typeof view !== 'object') {
    return { view: null, warnings };
  }

  const v = view as Record<string, unknown>;

  // name is required
  if (typeof v.name !== 'string' || !v.name.trim()) {
    return { view: null, warnings };
  }

  // filters must be an array (can be empty)
  if (!Array.isArray(v.filters)) {
    return { view: null, warnings };
  }

  const validatedFilters: DeckFilter[] = [];
  for (const filter of v.filters) {
    const validatedFilter = validateFilter(filter);
    if (validatedFilter) {
      validatedFilters.push(validatedFilter);
    }
    // Skip invalid filters instead of failing entire view
  }

  // Deduplicate filters and collect warnings
  const dedupeResult = deduplicateFilters(validatedFilters);
  warnings.push(...dedupeResult.warnings);

  const result: DeckView = {
    name: v.name.trim(),
    filters: dedupeResult.filters
  };

  // Optional sort
  if (v.sort) {
    const validatedSort = validateSort(v.sort);
    if (validatedSort) {
      result.sort = validatedSort;
    }
  }

  // Optional columns
  if (Array.isArray(v.columns)) {
    const validColumns: ColumnDefinition[] = [];
    for (const col of v.columns) {
      const validatedCol = validateColumn(col);
      if (validatedCol) {
        validColumns.push(validatedCol);
      }
    }
    if (validColumns.length > 0) {
      result.columns = validColumns;
    }
  }

  return { view: result, warnings };
}

/**
 * Validate parsed YAML as a DeckConfig with warnings.
 * Handles both multi-view format (views array) and legacy single-view format.
 * Legacy format is auto-migrated to views format.
 */
function validateDeckConfigWithWarnings(parsed: unknown): ParsedDeckResult | null {
  const warnings: DeckValidationWarning[] = [];

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const config = parsed as Record<string, unknown>;

  const result: DeckConfig = {};

  // Check for views array (new multi-view format)
  if (Array.isArray(config.views) && config.views.length > 0) {
    const validatedViews: DeckView[] = [];
    for (const view of config.views) {
      const viewResult = validateViewWithWarnings(view);
      if (viewResult.view) {
        validatedViews.push(viewResult.view);
        warnings.push(...viewResult.warnings);
      }
    }

    if (validatedViews.length > 0) {
      result.views = validatedViews;
      result.activeView =
        typeof config.activeView === 'number'
          ? Math.max(0, Math.min(config.activeView, validatedViews.length - 1))
          : 0;
    }
  }

  // Legacy format - filters at top level (auto-migrate to views)
  if (!result.views && Array.isArray(config.filters)) {
    const validatedFilters: DeckFilter[] = [];
    for (const filter of config.filters) {
      const validatedFilter = validateFilter(filter);
      if (validatedFilter) {
        validatedFilters.push(validatedFilter);
      }
    }

    // Deduplicate filters and collect warnings
    const dedupeResult = deduplicateFilters(validatedFilters);
    warnings.push(...dedupeResult.warnings);

    const legacyView: DeckView = {
      name: 'Default',
      filters: dedupeResult.filters
    };

    // Optional sort (legacy)
    if (config.sort) {
      const validatedSort = validateSort(config.sort);
      if (validatedSort) {
        legacyView.sort = validatedSort;
      }
    }

    // Optional columns (legacy)
    if (Array.isArray(config.columns)) {
      const validColumns: ColumnDefinition[] = [];
      for (const col of config.columns) {
        const validatedCol = validateColumn(col);
        if (validatedCol) {
          validColumns.push(validatedCol);
        }
      }
      if (validColumns.length > 0) {
        legacyView.columns = validColumns;
      }
    }

    result.views = [legacyView];
    result.activeView = 0;
  }

  // Must have at least one view
  if (!result.views || result.views.length === 0) {
    return null;
  }

  // Deck-level settings

  // Parse pageSize (primary) and limit (legacy fallback)
  if (typeof config.pageSize === 'number' && config.pageSize > 0) {
    // Clamp pageSize to valid options range
    result.pageSize = Math.min(
      Math.max(config.pageSize, PAGE_SIZE_OPTIONS[0]),
      MAX_LIMIT
    );
  } else if (typeof config.limit === 'number' && config.limit > 0) {
    // Migrate limit to pageSize (for backward compatibility)
    // Clamp to max of 100 (largest page size option)
    result.pageSize = Math.min(
      config.limit,
      PAGE_SIZE_OPTIONS[PAGE_SIZE_OPTIONS.length - 1]
    );
  } else {
    result.pageSize = DEFAULT_PAGE_SIZE;
  }

  // Keep limit for backward compatibility (used by legacy clients)
  if (typeof config.limit === 'number' && config.limit > 0) {
    result.limit = Math.min(config.limit, MAX_LIMIT);
  }

  if (config.expanded === true) {
    result.expanded = true;
  }

  return { config: result, warnings };
}

/**
 * Validate a single filter object
 */
function validateFilter(filter: unknown): DeckFilter | null {
  if (!filter || typeof filter !== 'object') {
    return null;
  }

  const f = filter as Record<string, unknown>;

  // field is required
  if (typeof f.field !== 'string' || !f.field.trim()) {
    return null;
  }

  // value is required
  if (f.value === undefined || f.value === null) {
    return null;
  }

  const result: DeckFilter = {
    field: f.field.trim(),
    value: normalizeValue(f.value)
  };

  // Validate operator if present
  if (f.operator !== undefined) {
    if (
      typeof f.operator !== 'string' ||
      !VALID_OPERATORS.includes(f.operator as FilterOperator)
    ) {
      return null;
    }
    result.operator = f.operator as FilterOperator;
  }

  return result;
}

/**
 * Validate sort configuration
 */
function validateSort(sort: unknown): DeckSort | null {
  if (!sort || typeof sort !== 'object') {
    return null;
  }

  const s = sort as Record<string, unknown>;

  if (typeof s.field !== 'string' || !s.field.trim()) {
    return null;
  }

  if (
    typeof s.order !== 'string' ||
    !VALID_SORT_ORDERS.includes(s.order as 'asc' | 'desc')
  ) {
    return null;
  }

  return {
    field: s.field.trim(),
    order: s.order as 'asc' | 'desc'
  };
}

const VALID_COLUMN_FORMATS: ColumnFormat[] = [
  'default',
  'relative',
  'absolute',
  'iso',
  'pills',
  'comma',
  'check',
  'yesno'
];

/**
 * Validate a single column definition (string or object)
 */
function validateColumn(col: unknown): ColumnDefinition | null {
  // Simple string format
  if (typeof col === 'string' && col.trim().length > 0) {
    return col.trim();
  }

  // Object format
  if (col && typeof col === 'object') {
    const c = col as Record<string, unknown>;

    // field is required
    if (typeof c.field !== 'string' || !c.field.trim()) {
      return null;
    }

    const result: ColumnConfig = {
      field: c.field.trim()
    };

    // Optional label
    if (typeof c.label === 'string' && c.label.trim()) {
      result.label = c.label.trim();
    }

    // Optional format
    if (c.format !== undefined) {
      if (
        typeof c.format !== 'string' ||
        !VALID_COLUMN_FORMATS.includes(c.format as ColumnFormat)
      ) {
        // Invalid format - ignore it, use default
        result.format = 'default';
      } else {
        result.format = c.format as ColumnFormat;
      }
    }

    return result;
  }

  return null;
}

/**
 * Normalize value to string or string array
 */
function normalizeValue(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }
  return String(value);
}

/**
 * Create an empty deck config with sensible defaults
 */
export function createEmptyDeckConfig(): DeckConfig {
  return {
    views: [
      {
        name: 'Default',
        filters: [],
        sort: { field: 'updated', order: 'desc' }
      }
    ],
    activeView: 0,
    pageSize: DEFAULT_PAGE_SIZE
  };
}

/**
 * Create a deck config from structured input (for agent tools)
 */
export function createDeckConfigFromInput(input: {
  views: Array<{
    name: string;
    filters: Array<{
      field: string;
      operator?: FilterOperator;
      value: string | string[];
    }>;
    columns?: string[];
    sort?: { field: string; order: 'asc' | 'desc' };
  }>;
  limit?: number;
  pageSize?: number;
}): DeckConfig {
  return {
    views: input.views.map((v) => ({
      name: v.name,
      filters: v.filters.map((f) => ({
        field: f.field,
        operator: f.operator,
        value: f.value
      })),
      columns: v.columns,
      sort: v.sort
    })),
    activeView: 0,
    pageSize: input.pageSize ?? input.limit ?? DEFAULT_PAGE_SIZE
  };
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
 * Get a view by name or index
 */
export function getView(config: DeckConfig, viewRef: string | number): DeckView | null {
  if (!config.views || config.views.length === 0) {
    return null;
  }

  if (typeof viewRef === 'number') {
    if (viewRef >= 0 && viewRef < config.views.length) {
      return config.views[viewRef];
    }
    return null;
  }

  // Find by name
  return config.views.find((v) => v.name === viewRef) ?? null;
}
