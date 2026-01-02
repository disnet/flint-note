/**
 * Utility functions for Automerge integration
 */

// ============================================================================
// Deep Clone Utilities for Automerge
// ============================================================================
//
// IMPORTANT: Automerge documents use proxies internally. When you try to insert
// an object that already exists in an Automerge document into another location,
// you get: "RangeError: Cannot create a reference to an existing document object"
//
// To avoid this, always use these utilities when assigning objects/arrays inside
// `docHandle.change()` blocks:
//
//   docHandle.change((doc) => {
//     // ❌ BAD - may reference existing document objects
//     doc.something = externalObject;
//
//     // ✅ GOOD - creates fresh plain objects
//     doc.something = clone(externalObject);
//   });
//
// ============================================================================

/**
 * Deep clone a value, creating fresh plain objects safe for Automerge insertion.
 *
 * Use this when assigning objects or arrays inside `docHandle.change()` blocks
 * to avoid "Cannot create a reference to an existing document object" errors.
 *
 * @example
 * docHandle.change((doc) => {
 *   doc.config = clone(externalConfig);
 *   doc.items = clone(externalItems);
 * });
 */
export function clone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    // Primitives don't need cloning
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Deep clone a value only if it's an object/array, otherwise return as-is.
 * Useful in loops where values may be primitives or objects.
 *
 * @example
 * for (const [key, value] of Object.entries(props)) {
 *   note.props[key] = cloneIfObject(value);
 * }
 */
export function cloneIfObject<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    return JSON.parse(JSON.stringify(value)) as T;
  }
  return value;
}

/**
 * Generate a random hex string of specified length
 */
function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * Generate a unique ID with the given prefix
 * Format: "{prefix}-xxxxxxxx" where x is a hex digit
 */
export function generateId(prefix: string): string {
  return `${prefix}-${randomHex(8)}`;
}

/**
 * Generate a note ID
 * Format: "n-xxxxxxxx"
 */
export function generateNoteId(): string {
  return generateId('n');
}

/**
 * Generate a workspace ID
 * Format: "ws-xxxxxxxx"
 */
export function generateWorkspaceId(): string {
  return generateId('ws');
}

/**
 * Generate a note type ID
 * Format: "type-xxxxxxxx"
 */
export function generateNoteTypeId(): string {
  return generateId('type');
}

/**
 * Generate a vault ID
 * Format: "vault-xxxxxxxx"
 */
export function generateVaultId(): string {
  return generateId('vault');
}

/**
 * Generate a conversation ID
 * Format: "conv-xxxxxxxx"
 */
export function generateConversationId(): string {
  return generateId('conv');
}

/**
 * Generate a message ID
 * Format: "msg-xxxxxxxx"
 */
export function generateMessageId(): string {
  return generateId('msg');
}

/**
 * Generate a routine ID
 * Format: "w-xxxxxxxx" (preserved from legacy workflow prefix)
 */
export function generateRoutineId(): string {
  return generateId('w');
}

/**
 * Generate a routine completion ID
 * Format: "wc-xxxxxxxx"
 */
export function generateRoutineCompletionId(): string {
  return generateId('wc');
}

/**
 * Generate a routine material ID
 * Format: "wm-xxxxxxxx"
 */
export function generateRoutineMaterialId(): string {
  return generateId('wm');
}

/**
 * Generate a property ID
 * Format: "prop-xxxxxxxx"
 */
export function generatePropertyId(): string {
  return generateId('prop');
}

/**
 * Get current ISO timestamp
 */
export function nowISO(): string {
  return new Date().toISOString();
}
