import crypto from 'crypto';

/**
 * Generates a SHA-256 hash of the provided content for optimistic locking
 * @param content - The content to hash
 * @returns Hash string in format "sha256:hexdigest"
 */
export function generateContentHash(content: string): string {
  return 'sha256:' + crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Creates a deterministic, hashable representation of note type definition
 * @param noteType - Note type object with description, agent_instructions, and metadata_schema
 * @returns Deterministic JSON string for consistent hashing
 */
export function createNoteTypeHashableContent(noteType: {
  description?: string;
  agent_instructions?: string;
  metadata_schema?: unknown;
}): string {
  // Create deterministic, stable representation for hashing
  return JSON.stringify(
    {
      description: noteType.description || '',
      agent_instructions: noteType.agent_instructions || '',
      metadata_schema: noteType.metadata_schema || {}
    },
    null,
    0
  ); // No indentation for consistent hashing
}

/**
 * Validates that a provided hash matches the current content hash
 * @param currentContent - The current content to hash
 * @param providedHash - The hash provided by the client
 * @throws Error if hashes don't match
 */
export function validateContentHash(currentContent: string, providedHash: string): void {
  const currentHash = generateContentHash(currentContent);
  if (currentHash !== providedHash) {
    throw new ContentHashMismatchError(currentHash, providedHash);
  }
}

/**
 * Error thrown when content hash validation fails
 */
export class ContentHashMismatchError extends Error {
  public readonly current_hash: string;
  public readonly provided_hash: string;

  constructor(currentHash: string, providedHash: string) {
    super(
      'Note content has been modified since last read. Please fetch the latest version.'
    );
    this.name = 'ContentHashMismatchError';
    this.current_hash = currentHash;
    this.provided_hash = providedHash;
  }

  toJSON() {
    return {
      error: 'content_hash_mismatch',
      message: this.message,
      current_hash: this.current_hash,
      provided_hash: this.provided_hash
    };
  }
}

/**
 * Error thrown when content hash is missing from update operations
 */
export class MissingContentHashError extends Error {
  constructor(operation: string) {
    super(`content_hash is required for ${operation} operations`);
    this.name = 'MissingContentHashError';
  }
}
