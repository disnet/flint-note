/**
 * Field Filtering Utility
 *
 * Provides functionality to filter object fields based on field specifications.
 * Supports dot notation for nested fields and wildcard patterns.
 */

/**
 * Represents a field specification that can be used to filter object properties
 */
export type FieldSpec = string;

/**
 * Configuration for field filtering behavior
 */
export interface FieldFilterOptions {
  /**
   * Whether to throw errors for invalid field specifications
   * @default false - silently ignore invalid fields
   */
  strict?: boolean;

  /**
   * Whether to preserve empty objects when filtering nested fields
   * @default false - remove empty objects
   */
  preserveEmptyObjects?: boolean;
}

/**
 * Filters an object based on field specifications
 *
 * @param obj - The object to filter
 * @param fields - Array of field specifications (e.g., ['id', 'title', 'metadata.tags'])
 * @param options - Configuration options for filtering behavior
 * @returns Filtered object containing only the specified fields
 */
export function filterFields<T extends Record<string, unknown>>(
  obj: T,
  fields: FieldSpec[],
  options: FieldFilterOptions = {}
): Partial<T> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (!fields || fields.length === 0) {
    return obj; // Return original object if no fields specified
  }

  const { strict = false, preserveEmptyObjects = false } = options;
  const result: Partial<T> = {};

  // Process each field specification
  for (const fieldSpec of fields) {
    if (typeof fieldSpec !== 'string') {
      if (strict) {
        throw new Error(`Invalid field specification: ${fieldSpec}`);
      }
      continue; // Skip invalid field specs
    }

    const trimmedSpec = fieldSpec.trim();
    if (!trimmedSpec) {
      continue; // Skip empty field specs
    }

    try {
      applyFieldSpec(obj, result, trimmedSpec, preserveEmptyObjects);
    } catch (error) {
      if (strict) {
        throw error;
      }
      // Silently ignore errors in non-strict mode
    }
  }

  return result;
}

/**
 * Applies a single field specification to the result object
 */
function applyFieldSpec(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  fieldSpec: string,
  preserveEmptyObjects: boolean
): void {
  if (fieldSpec.includes('.')) {
    applyNestedFieldSpec(source, target, fieldSpec, preserveEmptyObjects);
  } else {
    applySimpleFieldSpec(source, target, fieldSpec);
  }
}

/**
 * Applies a simple field specification (no dot notation)
 */
function applySimpleFieldSpec(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  fieldName: string
): void {
  if (fieldName === '*') {
    // Wildcard at root level - copy all properties
    Object.assign(target, source);
  } else if (Object.prototype.hasOwnProperty.call(source, fieldName)) {
    target[fieldName] = source[fieldName];
  }
}

/**
 * Applies a nested field specification (with dot notation)
 */
function applyNestedFieldSpec(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  fieldSpec: string,
  preserveEmptyObjects: boolean
): void {
  const parts = fieldSpec.split('.');
  const [rootField, ...remainingParts] = parts;

  if (!Object.prototype.hasOwnProperty.call(source, rootField)) {
    return; // Root field doesn't exist
  }

  const sourceValue = source[rootField];
  if (sourceValue === null || sourceValue === undefined) {
    target[rootField] = sourceValue;
    return;
  }

  // Handle wildcard in nested path
  if (remainingParts.length === 1 && remainingParts[0] === '*') {
    if (typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      target[rootField] = { ...sourceValue };
    } else {
      target[rootField] = sourceValue;
    }
    return;
  }

  // Handle deeper nesting
  if (remainingParts.length > 0) {
    const nestedFieldSpec = remainingParts.join('.');

    if (typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      if (!target[rootField]) {
        target[rootField] = {};
      }

      applyFieldSpec(
        sourceValue as Record<string, unknown>,
        target[rootField] as Record<string, unknown>,
        nestedFieldSpec,
        preserveEmptyObjects
      );

      // Remove empty objects if not preserving them
      if (
        !preserveEmptyObjects &&
        typeof target[rootField] === 'object' &&
        target[rootField] &&
        Object.keys(target[rootField]).length === 0
      ) {
        delete target[rootField];
      }
    }
  } else {
    // Direct nested field access
    target[rootField] = sourceValue;
  }
}

/**
 * Filters note data specifically, with special handling for common note fields
 *
 * @param note - The note object to filter
 * @param fields - Array of field specifications
 * @param options - Configuration options
 * @returns Filtered note object
 */
export function filterNoteFields<T extends Record<string, unknown>>(
  note: T,
  fields?: FieldSpec[],
  options: FieldFilterOptions = {}
): Partial<T> {
  // If no fields specified, return original note
  if (!fields || fields.length === 0) {
    return note;
  }

  return filterFields(note, fields, options);
}

/**
 * Filters search results with special handling for search-specific fields
 *
 * @param results - Search results to filter
 * @param fields - Array of field specifications
 * @param options - Configuration options
 * @returns Filtered search results
 */
export function filterSearchResults<T extends Record<string, unknown>>(
  results: { results: T[]; [key: string]: unknown },
  fields?: FieldSpec[],
  options: FieldFilterOptions = {}
): { results: Partial<T>[]; [key: string]: unknown } {
  if (!fields || fields.length === 0) {
    return results;
  }

  // Search-specific fields that should always be included
  const searchFields = ['score', 'snippet', 'filename', 'path'];
  const enhancedFields = [...new Set([...fields, ...searchFields])];

  return {
    ...results,
    results: results.results.map(result => filterFields(result, enhancedFields, options))
  };
}

/**
 * Validates field specifications for common errors
 *
 * @param fields - Array of field specifications to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateFieldSpecs(fields: FieldSpec[]): string[] {
  const errors: string[] = [];

  for (const field of fields) {
    if (typeof field !== 'string') {
      errors.push(`Invalid field type: ${typeof field}`);
      continue;
    }

    const trimmed = field.trim();
    if (!trimmed) {
      errors.push('Empty field specification');
      continue;
    }

    // Check for invalid dot notation patterns
    if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
      errors.push(`Invalid dot notation: ${field}`);
    }

    if (trimmed.includes('..')) {
      errors.push(`Invalid consecutive dots: ${field}`);
    }

    // Check for invalid wildcard usage
    if (trimmed.includes('*') && !trimmed.endsWith('*') && !trimmed.endsWith('.*')) {
      errors.push(`Invalid wildcard usage: ${field}`);
    }
  }

  return errors;
}

/**
 * Common field filtering patterns for notes
 */
export const COMMON_FIELD_PATTERNS = {
  // Note browser/listing view
  LISTING: [
    'id',
    'type',
    'title',
    'created',
    'updated',
    'metadata.tags',
    'metadata.status'
  ],

  // Link resolution (checking if notes exist)
  LINK_CHECK: ['id', 'title'],

  // Metadata analysis/reporting
  METADATA_ONLY: ['id', 'type', 'metadata.*', 'created', 'updated'],

  // Content update preparation
  CONTENT_UPDATE: ['content', 'content_hash'],

  // Quick validation before operations
  VALIDATION: ['id', 'content_hash'],

  // Everything except content (useful for large notes)
  NO_CONTENT: ['id', 'type', 'title', 'content_hash', 'metadata.*', 'created', 'updated'],

  // Core fields only
  CORE: ['id', 'type', 'title', 'created', 'updated'],

  // Minimal response with only ID
  MINIMAL: ['id']
} as const;
