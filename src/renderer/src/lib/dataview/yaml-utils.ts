/**
 * YAML parsing and serialization utilities for flint-query blocks
 */

import yaml from 'js-yaml';
import type { FlintQueryConfig, QueryFilter, QuerySort, FilterOperator } from './types';

const VALID_OPERATORS: FilterOperator[] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'];
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * Parse YAML content into a validated FlintQueryConfig
 * Returns null if parsing fails or content is invalid
 */
export function parseQueryYaml(yamlContent: string): FlintQueryConfig | null {
  try {
    const parsed = yaml.load(yamlContent);
    return validateQueryConfig(parsed);
  } catch (e) {
    console.error('Failed to parse flint-query YAML:', e);
    return null;
  }
}

/**
 * Serialize a FlintQueryConfig back to YAML string
 */
export function serializeQueryConfig(config: FlintQueryConfig): string {
  // Clean up the config before serialization
  const cleanConfig: Record<string, unknown> = {};

  if (config.name) {
    cleanConfig.name = config.name;
  }

  cleanConfig.filters = config.filters.map((filter) => {
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
    cleanConfig.columns = config.columns;
  }

  if (config.limit && config.limit !== DEFAULT_LIMIT) {
    cleanConfig.limit = config.limit;
  }

  return yaml.dump(cleanConfig, {
    indent: 2,
    lineWidth: -1, // No line wrapping
    quotingType: '"',
    forceQuotes: false
  });
}

/**
 * Validate parsed YAML as a FlintQueryConfig
 */
function validateQueryConfig(parsed: unknown): FlintQueryConfig | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const config = parsed as Record<string, unknown>;

  // filters is required and must be an array
  if (!Array.isArray(config.filters)) {
    return null;
  }

  // Validate and normalize each filter
  const validatedFilters: QueryFilter[] = [];
  for (const filter of config.filters) {
    const validatedFilter = validateFilter(filter);
    if (!validatedFilter) {
      return null;
    }
    validatedFilters.push(validatedFilter);
  }

  // Build the validated config
  const result: FlintQueryConfig = {
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

  // Optional columns
  if (Array.isArray(config.columns)) {
    const validColumns = config.columns.filter(
      (col): col is string => typeof col === 'string' && col.trim().length > 0
    );
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

  return result;
}

/**
 * Validate a single filter object
 */
function validateFilter(filter: unknown): QueryFilter | null {
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

  const result: QueryFilter = {
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
function validateSort(sort: unknown): QuerySort | null {
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
 * Create an empty query config with sensible defaults
 */
export function createEmptyQueryConfig(): FlintQueryConfig {
  return {
    filters: [],
    limit: DEFAULT_LIMIT
  };
}

/**
 * Create a simple type filter query
 */
export function createTypeFilterQuery(typeName: string, name?: string): FlintQueryConfig {
  return {
    name,
    filters: [{ field: 'type', value: typeName }],
    sort: { field: 'updated', order: 'desc' },
    limit: DEFAULT_LIMIT
  };
}
