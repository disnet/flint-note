/**
 * Document storage for the lean sync server.
 *
 * Handles loading and saving Automerge documents as binary blobs.
 *
 * Format: {userDir}/docs/{docId}.bin (single compacted binary)
 */

import fs from 'node:fs';
import path from 'node:path';

const DOCS_SUBDIR = 'docs';

function ensureDocsDir(userDir: string): void {
  fs.mkdirSync(path.join(userDir, DOCS_SUBDIR), { recursive: true });
}

function getDocPath(userDir: string, docId: string): string {
  return path.join(userDir, DOCS_SUBDIR, `${docId}.bin`);
}

/**
 * Load a document binary from disk.
 */
export function loadDocBinary(userDir: string, docId: string): Uint8Array | null {
  const docPath = getDocPath(userDir, docId);
  try {
    const data = fs.readFileSync(docPath);
    return new Uint8Array(data);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    return null;
  }
}

/**
 * Save a document binary to disk in the compacted format.
 */
export function saveDocBinary(userDir: string, docId: string, binary: Uint8Array): void {
  ensureDocsDir(userDir);
  const docPath = getDocPath(userDir, docId);
  fs.writeFileSync(docPath, binary);
}

/**
 * Check if a document exists on disk.
 */
export function docExists(userDir: string, docId: string): boolean {
  try {
    fs.accessSync(getDocPath(userDir, docId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the size of a document's binary on disk.
 * Returns 0 if not found.
 */
export function getDocSize(userDir: string, docId: string): number {
  try {
    const stat = fs.statSync(getDocPath(userDir, docId));
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Count total documents for a user directory.
 */
export function countDocs(userDir: string): number {
  const docsDir = path.join(userDir, DOCS_SUBDIR);
  try {
    const files = fs.readdirSync(docsDir);
    return files.filter((f) => f.endsWith('.bin')).length;
  } catch {
    return 0;
  }
}

/**
 * Get total size of all documents for a user directory.
 */
export function totalDocsSize(userDir: string): number {
  const docsDir = path.join(userDir, DOCS_SUBDIR);
  try {
    const files = fs.readdirSync(docsDir);
    let total = 0;
    for (const file of files) {
      if (file.endsWith('.bin')) {
        try {
          const stat = fs.statSync(path.join(docsDir, file));
          total += stat.size;
        } catch {
          // skip
        }
      }
    }
    return total;
  } catch {
    return 0;
  }
}
