/**
 * OPFS (Origin Private File System) storage service for PDF files.
 * Uses content-addressing (SHA-256 hash) for deduplication.
 */

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
 * Get or create the pdfs directory in OPFS
 */
async function getPdfsDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle('pdfs', { create: true });
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

  const pdfsDir = await getPdfsDirectory();
  const fileHandle = await pdfsDir.getFileHandle(`${hash}.pdf`, { create: true });

  // Use the synchronous access handle for better performance
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }

  return hash;
}

/**
 * Retrieve data from OPFS by hash.
 * Returns null if not found.
 */
export async function retrieve(hash: string): Promise<ArrayBuffer | null> {
  try {
    const pdfsDir = await getPdfsDirectory();
    const fileHandle = await pdfsDir.getFileHandle(`${hash}.pdf`);
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
    const pdfsDir = await getPdfsDirectory();
    await pdfsDir.getFileHandle(`${hash}.pdf`);
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
    const pdfsDir = await getPdfsDirectory();
    await pdfsDir.removeEntry(`${hash}.pdf`);
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
  const pdfsDir = await getPdfsDirectory();
  let totalFiles = 0;
  let totalBytes = 0;

  // Iterate through all files in the directory
  for await (const [name, handle] of pdfsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.pdf')) {
      totalFiles++;
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      totalBytes += file.size;
    }
  }

  return { totalFiles, totalBytes };
}

/**
 * List all stored PDF hashes.
 */
export async function listHashes(): Promise<string[]> {
  const pdfsDir = await getPdfsDirectory();
  const hashes: string[] = [];

  for await (const [name, handle] of pdfsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.pdf')) {
      // Extract hash from filename (remove .pdf extension)
      hashes.push(name.slice(0, -4));
    }
  }

  return hashes;
}

/**
 * Clear all stored PDFs.
 * Use with caution!
 */
export async function clearAll(): Promise<number> {
  const pdfsDir = await getPdfsDirectory();
  let count = 0;

  const entries: string[] = [];
  for await (const [name, handle] of pdfsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.pdf')) {
      entries.push(name);
    }
  }

  for (const name of entries) {
    await pdfsDir.removeEntry(name);
    count++;
  }

  return count;
}

/**
 * Compute hash without storing (useful for checking duplicates before import)
 */
export { computeHash };

/**
 * PDF OPFS storage service singleton-like export
 */
export const pdfOpfsStorage = {
  store,
  retrieve,
  exists,
  remove,
  getStorageStats,
  listHashes,
  clearAll,
  computeHash
};
