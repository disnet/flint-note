/**
 * System Fields - Canonical Definition
 *
 * This module defines all system-managed fields in Flint notes.
 * These fields are automatically maintained by the system and cannot be
 * modified through user-facing APIs or metadata schemas.
 *
 * IMPORTANT: This is the single source of truth for system fields.
 * All validation and filtering logic should reference this module.
 */

/**
 * System-managed fields that cannot be modified by users
 *
 * These fields are:
 * - Automatically set and updated by the system
 * - Cannot be included in custom metadata schemas
 * - Cannot be modified through metadata update APIs
 * - Protected from user edits in the UI
 *
 * Field descriptions:
 * - id: Immutable note identifier (format: n-xxxxxxxx)
 * - type: Note type (modified via move_note tool only)
 * - title: Display name (modified via rename_note tool only)
 * - filename: Filesystem name without extension (modified via rename_note tool only)
 * - created: Creation timestamp (set once, immutable)
 * - updated: Last modification timestamp (auto-updated)
 * - path: Full filesystem path (derived from type/filename)
 * - content: Note body text (managed through content updates)
 * - content_hash: Hash for optimistic locking (auto-calculated)
 * - size: File size in bytes (derived from filesystem)
 */
export const SYSTEM_FIELDS = new Set([
  'id',
  'type',
  'title',
  'filename',
  'created',
  'updated',
  'path',
  'content',
  'content_hash',
  'size'
]);

/**
 * Check if a field name is a system-managed field
 *
 * @param fieldName - The field name to check
 * @returns true if the field is system-managed
 */
export function isSystemField(fieldName: string): boolean {
  return SYSTEM_FIELDS.has(fieldName);
}

/**
 * Filter out system fields from a metadata object
 *
 * @param metadata - The metadata object to filter
 * @returns A new object with system fields removed
 */
export function filterSystemFields(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!SYSTEM_FIELDS.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Validate that an array of field names doesn't contain system fields
 *
 * @param fieldNames - Array of field names to validate
 * @returns Object with validation result and any found system fields
 */
export function validateNoSystemFields(fieldNames: string[]): {
  valid: boolean;
  systemFields: string[];
} {
  const foundSystemFields = fieldNames.filter((name) => SYSTEM_FIELDS.has(name));
  return {
    valid: foundSystemFields.length === 0,
    systemFields: foundSystemFields
  };
}

/**
 * Get a list of all system field names
 *
 * @returns Array of system field names
 */
export function getSystemFieldNames(): string[] {
  return Array.from(SYSTEM_FIELDS);
}
