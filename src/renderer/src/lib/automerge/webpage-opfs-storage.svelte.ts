/**
 * OPFS (Origin Private File System) storage service for archived webpages.
 * Uses content-addressing (SHA-256 hash) for deduplication.
 */

/**
 * Storage statistics
 */
export interface WebpageStorageStats {
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
 * Compute SHA-256 hash from string
 */
async function computeStringHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  return computeHash(data.buffer as ArrayBuffer);
}

/**
 * Get or create the webpages directory in OPFS
 */
async function getWebpagesDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle('webpages', { create: true });
}

/**
 * Store HTML content in OPFS with content-addressed filename.
 * Returns the SHA-256 hash of the content.
 * If content with the same hash already exists, returns the hash without re-storing.
 */
export async function store(htmlContent: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(htmlContent);
  const hash = await computeHash(data.buffer as ArrayBuffer);

  // Check if already exists (deduplication)
  if (await exists(hash)) {
    return hash;
  }

  const webpagesDir = await getWebpagesDirectory();
  const fileHandle = await webpagesDir.getFileHandle(`${hash}.html`, { create: true });

  const writable = await fileHandle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }

  return hash;
}

/**
 * Store metadata JSON alongside the HTML content
 */
export async function storeMetadata(
  hash: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const webpagesDir = await getWebpagesDirectory();
  const fileHandle = await webpagesDir.getFileHandle(`${hash}.meta.json`, {
    create: true
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(metadata, null, 2));

  const writable = await fileHandle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

/**
 * Retrieve HTML content from OPFS by hash.
 * Returns null if not found.
 */
export async function retrieve(hash: string): Promise<string | null> {
  try {
    const webpagesDir = await getWebpagesDirectory();
    const fileHandle = await webpagesDir.getFileHandle(`${hash}.html`);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
}

/**
 * Retrieve metadata JSON from OPFS by hash.
 * Returns null if not found.
 */
export async function retrieveMetadata(
  hash: string
): Promise<Record<string, unknown> | null> {
  try {
    const webpagesDir = await getWebpagesDirectory();
    const fileHandle = await webpagesDir.getFileHandle(`${hash}.meta.json`);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if archived webpage exists in OPFS by hash.
 */
export async function exists(hash: string): Promise<boolean> {
  try {
    const webpagesDir = await getWebpagesDirectory();
    await webpagesDir.getFileHandle(`${hash}.html`);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

/**
 * Delete archived webpage from OPFS by hash.
 * Also removes associated metadata file.
 * Returns true if deleted, false if not found.
 */
export async function remove(hash: string): Promise<boolean> {
  try {
    const webpagesDir = await getWebpagesDirectory();
    await webpagesDir.removeEntry(`${hash}.html`);
    // Also try to remove metadata (ignore if not found)
    try {
      await webpagesDir.removeEntry(`${hash}.meta.json`);
    } catch {
      // Metadata file might not exist
    }
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
export async function getStorageStats(): Promise<WebpageStorageStats> {
  const webpagesDir = await getWebpagesDirectory();
  let totalFiles = 0;
  let totalBytes = 0;

  for await (const [name, handle] of webpagesDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.html')) {
      totalFiles++;
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      totalBytes += file.size;
    }
  }

  return { totalFiles, totalBytes };
}

/**
 * List all stored webpage hashes.
 */
export async function listHashes(): Promise<string[]> {
  const webpagesDir = await getWebpagesDirectory();
  const hashes: string[] = [];

  for await (const [name, handle] of webpagesDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.html')) {
      // Extract hash from filename (remove .html extension)
      hashes.push(name.slice(0, -5));
    }
  }

  return hashes;
}

/**
 * Clear all stored webpages.
 * Use with caution!
 */
export async function clearAll(): Promise<number> {
  const webpagesDir = await getWebpagesDirectory();
  let count = 0;

  const entries: string[] = [];
  for await (const [name, handle] of webpagesDir.entries()) {
    if (handle.kind === 'file') {
      entries.push(name);
    }
  }

  for (const name of entries) {
    await webpagesDir.removeEntry(name);
    if (name.endsWith('.html')) {
      count++;
    }
  }

  return count;
}

/**
 * Compute hash without storing (useful for checking duplicates before import)
 */
export { computeHash, computeStringHash };

/**
 * OPFS webpage storage service singleton-like export
 */
export const webpageOpfsStorage = {
  store,
  storeMetadata,
  retrieve,
  retrieveMetadata,
  exists,
  remove,
  getStorageStats,
  listHashes,
  clearAll,
  computeHash,
  computeStringHash
};
