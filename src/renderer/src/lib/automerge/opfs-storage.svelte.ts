/**
 * OPFS (Origin Private File System) storage service for EPUB files.
 * Uses content-addressing (SHA-256 hash) for deduplication.
 */

import { addEpubHash, removeEpubHash } from './opfs-manifest.svelte';

// Extend FileSystemDirectoryHandle to include the entries() method
// which is part of the File System Access API but may not be in TypeScript's default types
declare global {
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }
}

/**
 * Storage statistics
 */
export interface StorageStats {
  totalFiles: number;
  totalBytes: number;
}

/**
 * Convert ArrayBuffer to hex string
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hash of data
 */
async function computeHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToHex(hashBuffer);
}

/**
 * Get or create the epubs directory in OPFS
 */
async function getEpubsDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle('epubs', { create: true });
}

/**
 * Store data in OPFS with content-addressed filename.
 * Returns the SHA-256 hash of the content.
 * If data with the same hash already exists, returns the hash without re-storing.
 */
export async function store(data: ArrayBuffer): Promise<string> {
  const hash = await computeHash(data);

  // Check if already exists (deduplication)
  if (await exists(hash)) {
    return hash;
  }

  const epubsDir = await getEpubsDirectory();
  const fileHandle = await epubsDir.getFileHandle(`${hash}.epub`, { create: true });

  // Use the synchronous access handle for better performance
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }

  // Update manifest
  addEpubHash(hash);

  return hash;
}

/**
 * Retrieve data from OPFS by hash.
 * Returns null if not found.
 */
export async function retrieve(hash: string): Promise<ArrayBuffer | null> {
  try {
    const epubsDir = await getEpubsDirectory();
    const fileHandle = await epubsDir.getFileHandle(`${hash}.epub`);
    const file = await fileHandle.getFile();
    return await file.arrayBuffer();
  } catch (error) {
    // File not found or other error
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if data exists in OPFS by hash.
 */
export async function exists(hash: string): Promise<boolean> {
  try {
    const epubsDir = await getEpubsDirectory();
    await epubsDir.getFileHandle(`${hash}.epub`);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

/**
 * Delete data from OPFS by hash.
 * Returns true if deleted, false if not found.
 */
export async function remove(hash: string): Promise<boolean> {
  try {
    const epubsDir = await getEpubsDirectory();
    await epubsDir.removeEntry(`${hash}.epub`);
    // Update manifest
    removeEpubHash(hash);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

/**
 * Get storage statistics.
 */
export async function getStorageStats(): Promise<StorageStats> {
  const epubsDir = await getEpubsDirectory();
  let totalFiles = 0;
  let totalBytes = 0;

  // Iterate through all files in the directory
  for await (const [name, handle] of epubsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.epub')) {
      totalFiles++;
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      totalBytes += file.size;
    }
  }

  return { totalFiles, totalBytes };
}

/**
 * List all stored EPUB hashes.
 */
export async function listHashes(): Promise<string[]> {
  const epubsDir = await getEpubsDirectory();
  const hashes: string[] = [];

  for await (const [name, handle] of epubsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.epub')) {
      // Extract hash from filename (remove .epub extension)
      hashes.push(name.slice(0, -5));
    }
  }

  return hashes;
}

/**
 * Clear all stored EPUBs.
 * Use with caution!
 */
export async function clearAll(): Promise<number> {
  const epubsDir = await getEpubsDirectory();
  let count = 0;

  const entries: string[] = [];
  for await (const [name, handle] of epubsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.epub')) {
      entries.push(name);
    }
  }

  for (const name of entries) {
    await epubsDir.removeEntry(name);
    // Update manifest - extract hash from filename
    const hash = name.slice(0, -5);
    removeEpubHash(hash);
    count++;
  }

  return count;
}

/**
 * Compute hash without storing (useful for checking duplicates before import)
 */
export { computeHash };

/**
 * OPFS storage service singleton-like export
 */
export const opfsStorage = {
  store,
  retrieve,
  exists,
  remove,
  getStorageStats,
  listHashes,
  clearAll,
  computeHash
};
