/**
 * System Fields - Canonical Definition
 *
 * This module defines all system-managed fields in Flint notes.
 * These fields are automatically maintained by the system and cannot be
 * modified through user-facing APIs or metadata schemas.
 *
 * IMPORTANT: This is the single source of truth for system fields.
 * All validation and filtering logic should reference this module.
 *
 * Field naming conventions:
 * - New fields use the flint_* prefix (e.g., flint_id, flint_type)
 * - Legacy fields (id, type, etc.) are supported for backward compatibility on read
 * - Only flint_* prefixed fields are written to frontmatter for new notes/updates
 * - When reading, prefer flint_* fields, fallback to legacy
 */

/**
 * Supported content kinds for notes
 * - markdown: Standard markdown notes (default)
 * - epub: EPUB ebook reader notes
 */
export type NoteKind = 'markdown' | 'epub';

export const NOTE_KINDS: NoteKind[] = ['markdown', 'epub'];
export const DEFAULT_NOTE_KIND: NoteKind = 'markdown';

/**
 * Mapping from legacy field names to new flint_* prefixed names
 */
export const LEGACY_TO_FLINT: Record<string, string> = {
  id: 'flint_id',
  type: 'flint_type',
  title: 'flint_title',
  filename: 'flint_filename',
  created: 'flint_created',
  updated: 'flint_updated',
  path: 'flint_path',
  content: 'flint_content',
  content_hash: 'flint_content_hash',
  size: 'flint_size',
  archived: 'flint_archived'
};

/**
 * Mapping from flint_* prefixed names to legacy field names
 */
export const FLINT_TO_LEGACY: Record<string, string> = Object.fromEntries(
  Object.entries(LEGACY_TO_FLINT).map(([legacy, flint]) => [flint, legacy])
);

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
 * - flint_id/id: Immutable note identifier (format: n-xxxxxxxx)
 * - flint_type/type: Note type for organization (modified via move_note tool only)
 * - flint_kind: Content rendering type (markdown, epub) - system managed
 * - flint_title/title: Display name (modified via rename_note tool only)
 * - flint_filename/filename: Filesystem name without extension
 * - flint_created/created: Creation timestamp (set once, immutable)
 * - flint_updated/updated: Last modification timestamp (auto-updated)
 * - flint_path/path: Full filesystem path (derived from type/filename)
 * - flint_content/content: Note body text (managed through content updates)
 * - flint_content_hash/content_hash: Hash for optimistic locking (auto-calculated)
 * - flint_size/size: File size in bytes (derived from filesystem)
 */
export const SYSTEM_FIELDS = new Set([
  // New flint_* prefixed fields
  'flint_id',
  'flint_type',
  'flint_kind',
  'flint_title',
  'flint_filename',
  'flint_created',
  'flint_updated',
  'flint_path',
  'flint_content',
  'flint_content_hash',
  'flint_size',
  'flint_archived',
  // Legacy fields (for backward compatibility)
  'id',
  'type',
  'title',
  'filename',
  'created',
  'updated',
  'path',
  'content',
  'content_hash',
  'size',
  'archived'
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

/**
 * Normalize a legacy field name to its flint_* equivalent
 *
 * @param fieldName - The field name to normalize
 * @returns The flint_* prefixed field name, or the original if no mapping exists
 */
export function normalizeToFlintField(fieldName: string): string {
  return LEGACY_TO_FLINT[fieldName] || fieldName;
}

/**
 * Get a legacy field name from a flint_* prefixed name
 *
 * @param flintFieldName - The flint_* prefixed field name
 * @returns The legacy field name, or the original if no mapping exists
 */
export function toLegacyField(flintFieldName: string): string {
  return FLINT_TO_LEGACY[flintFieldName] || flintFieldName;
}

/**
 * Get a field value from metadata, preferring flint_* prefix, falling back to legacy
 *
 * @param metadata - The metadata object to read from
 * @param legacyFieldName - The legacy field name (e.g., 'id', 'type')
 * @returns The field value, or undefined if not found
 */
export function getFieldValue(
  metadata: Record<string, unknown>,
  legacyFieldName: string
): unknown {
  const flintFieldName = LEGACY_TO_FLINT[legacyFieldName];
  if (flintFieldName && metadata[flintFieldName] !== undefined) {
    return metadata[flintFieldName];
  }
  return metadata[legacyFieldName];
}

/**
 * Get a string field value from metadata with fallback
 *
 * @param metadata - The metadata object to read from
 * @param legacyFieldName - The legacy field name
 * @param defaultValue - Default value if field not found
 * @returns The field value as string, or default
 */
export function getStringFieldValue(
  metadata: Record<string, unknown>,
  legacyFieldName: string,
  defaultValue = ''
): string {
  const value = getFieldValue(metadata, legacyFieldName);
  return typeof value === 'string' ? value : defaultValue;
}

/**
 * Get the note kind from metadata, with fallback to default
 *
 * @param metadata - The metadata object to read from
 * @returns The note kind (markdown or epub)
 */
export function getNoteKind(metadata: Record<string, unknown>): NoteKind {
  const kind = metadata.flint_kind;
  if (typeof kind === 'string' && NOTE_KINDS.includes(kind as NoteKind)) {
    return kind as NoteKind;
  }
  return DEFAULT_NOTE_KIND;
}

/**
 * Check if a kind value is valid
 *
 * @param kind - The kind value to check
 * @returns true if valid
 */
export function isValidNoteKind(kind: unknown): kind is NoteKind {
  return typeof kind === 'string' && NOTE_KINDS.includes(kind as NoteKind);
}
