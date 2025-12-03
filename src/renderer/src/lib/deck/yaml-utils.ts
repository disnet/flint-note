/**
 * YAML parsing and serialization utilities for flint-deck blocks
 */

import yaml from 'js-yaml';
import type {
  DeckConfig,
  DeckFilter,
  DeckSort,
  FilterOperator,
  ColumnDefinition,
  ColumnConfig,
  ColumnFormat
} from './types';
import { columnHasCustomSettings } from './types';

const VALID_OPERATORS: FilterOperator[] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'];
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * Parse YAML content into a validated DeckConfig
 * Returns null if parsing fails or content is invalid
 */
export function parseDeckYaml(yamlContent: string): DeckConfig | null {
  try {
    const parsed = yaml.load(yamlContent);
    return validateDeckConfig(parsed);
  } catch (e) {
    console.error('Failed to parse flint-deck YAML:', e);
    return null;
  }
}

/**
 * Serialize a DeckConfig back to YAML string
 */
export function serializeDeckConfig(config: DeckConfig): string {
  // Clean up the config before serialization
  const cleanConfig: Record<string, unknown> = {};

  if (config.name) {
    cleanConfig.name = config.name;
  }

  // Filter out incomplete filters (missing field or empty value)
  const completeFilters = config.filters.filter((filter) => {
    if (!filter.field || !filter.field.trim()) return false;
    if (filter.value === undefined || filter.value === null) return false;
    if (typeof filter.value === 'string' && !filter.value.trim()) return false;
    if (Array.isArray(filter.value) && filter.value.length === 0) return false;
    return true;
  });

  cleanConfig.filters = completeFilters.map((filter) => {
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

  if (config.sort) {
    cleanConfig.sort = {
      field: config.sort.field,
      order: config.sort.order
    };
  }

  if (config.columns && config.columns.length > 0) {
    // Serialize columns - use simple string format when possible
    cleanConfig.columns = config.columns.map((col) => {
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

  if (config.limit && config.limit !== DEFAULT_LIMIT) {
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
 * Validate parsed YAML as a DeckConfig
 */
function validateDeckConfig(parsed: unknown): DeckConfig | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const config = parsed as Record<string, unknown>;

  // filters is required and must be an array
  if (!Array.isArray(config.filters)) {
    return null;
  }

  // Validate and normalize each filter
  const validatedFilters: DeckFilter[] = [];
  for (const filter of config.filters) {
    const validatedFilter = validateFilter(filter);
    if (!validatedFilter) {
      return null;
    }
    validatedFilters.push(validatedFilter);
  }

  // Build the validated config
  const result: DeckConfig = {
    filters: validatedFilters
  };

  // Optional name
  if (typeof config.name === 'string' && config.name.trim()) {
    result.name = config.name.trim();
  }

  // Optional sort
  if (config.sort) {
    const validatedSort = validateSort(config.sort);
    if (validatedSort) {
      result.sort = validatedSort;
    }
  }

  // Optional columns - can be strings or objects
  if (Array.isArray(config.columns)) {
    const validColumns: ColumnDefinition[] = [];
    for (const col of config.columns) {
      const validatedCol = validateColumn(col);
      if (validatedCol) {
        validColumns.push(validatedCol);
      }
    }
    if (validColumns.length > 0) {
      result.columns = validColumns;
    }
  }

  // Optional limit
  if (typeof config.limit === 'number' && config.limit > 0) {
    result.limit = Math.min(config.limit, MAX_LIMIT);
  } else {
    result.limit = DEFAULT_LIMIT;
  }

  // Optional expanded
  if (config.expanded === true) {
    result.expanded = true;
  }

  return result;
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
    filters: [],
    limit: DEFAULT_LIMIT
  };
}

/**
 * Create a simple type filter deck
 */
export function createTypeFilterDeck(typeName: string, name?: string): DeckConfig {
  return {
    name,
    filters: [{ field: 'type', value: typeName }],
    sort: { field: 'updated', order: 'desc' },
    limit: DEFAULT_LIMIT
  };
}
