/**
 * Utility functions for Automerge integration
 */

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
 * Get current ISO timestamp
 */
export function nowISO(): string {
  return new Date().toISOString();
}
