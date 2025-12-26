/**
 * OPFS (Origin Private File System) storage service for images.
 * Uses content-addressing (SHA-256 hash) for deduplication.
 * Images are stored with short 8-char hash filenames for readability.
 */

/**
 * Storage statistics
 */
export interface StorageStats {
  totalFiles: number;
  totalBytes: number;
}

/**
 * Result of storing an image
 */
export interface ImageStoreResult {
  shortHash: string; // 8-char prefix of SHA-256
  extension: string; // png, jpg, gif, webp
  fullHash: string; // Full SHA-256 for deduplication tracking
}

/**
 * Image file info for listing
 */
export interface ImageFileInfo {
  shortHash: string;
  extension: string;
  size: number;
}

// Supported image extensions
const SUPPORTED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

// Blob URL cache to avoid recreating URLs - non-reactive internal cache
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const blobUrlCache = new Map<string, string>();

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
 * Get short hash (8 chars) from full hash
 */
function getShortHash(fullHash: string): string {
  return fullHash.slice(0, 8);
}

/**
 * Normalize extension (lowercase, jpg -> jpg)
 */
function normalizeExtension(ext: string): string {
  const normalized = ext.toLowerCase().replace(/^\./, '');
  // Keep jpeg as jpeg, don't convert to jpg (they're different in MIME types)
  return normalized;
}

/**
 * Get MIME type for extension
 */
function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp'
  };
  return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Get or create the images directory in OPFS
 */
async function getImagesDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle('images', { create: true });
}

/**
 * Build filename from short hash and extension
 */
function buildFilename(shortHash: string, extension: string): string {
  return `${shortHash}.${extension}`;
}

/**
 * Parse filename into short hash and extension
 */
function parseFilename(
  filename: string
): { shortHash: string; extension: string } | null {
  const match = filename.match(/^([a-f0-9]{8})\.(\w+)$/i);
  if (!match) return null;
  return { shortHash: match[1].toLowerCase(), extension: match[2].toLowerCase() };
}

/**
 * Store image data in OPFS with content-addressed filename.
 * Returns the short hash and extension.
 * If data with the same hash already exists, returns the hash without re-storing.
 */
export async function store(
  data: ArrayBuffer,
  extension: string
): Promise<ImageStoreResult> {
  const normalizedExt = normalizeExtension(extension);
  if (!SUPPORTED_EXTENSIONS.includes(normalizedExt)) {
    throw new Error(`Unsupported image extension: ${extension}`);
  }

  const fullHash = await computeHash(data);
  const shortHash = getShortHash(fullHash);

  // Check if already exists (deduplication)
  if (await exists(shortHash, normalizedExt)) {
    return { shortHash, extension: normalizedExt, fullHash };
  }

  const imagesDir = await getImagesDirectory();
  const filename = buildFilename(shortHash, normalizedExt);
  const fileHandle = await imagesDir.getFileHandle(filename, { create: true });

  const writable = await fileHandle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }

  return { shortHash, extension: normalizedExt, fullHash };
}

/**
 * Store image with a specific filename (for legacy migration).
 * The filename should already be in the format hash.ext
 */
export async function storeWithFilename(
  data: ArrayBuffer,
  filename: string
): Promise<ImageStoreResult> {
  const parsed = parseFilename(filename);
  if (!parsed) {
    // If filename doesn't match expected format, compute hash and use extension from filename
    const ext = filename.split('.').pop() || 'png';
    return store(data, ext);
  }

  const { shortHash, extension } = parsed;
  const fullHash = await computeHash(data);

  // Check if already exists
  if (await exists(shortHash, extension)) {
    return { shortHash, extension, fullHash };
  }

  const imagesDir = await getImagesDirectory();
  const fileHandle = await imagesDir.getFileHandle(filename, { create: true });

  const writable = await fileHandle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }

  return { shortHash, extension, fullHash };
}

/**
 * Retrieve image data from OPFS by short hash and extension.
 * Returns null if not found.
 */
export async function retrieve(
  shortHash: string,
  extension: string
): Promise<ArrayBuffer | null> {
  try {
    const imagesDir = await getImagesDirectory();
    const filename = buildFilename(shortHash, normalizeExtension(extension));
    const fileHandle = await imagesDir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return await file.arrayBuffer();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if image exists in OPFS by short hash and extension.
 */
export async function exists(shortHash: string, extension: string): Promise<boolean> {
  try {
    const imagesDir = await getImagesDirectory();
    const filename = buildFilename(shortHash, normalizeExtension(extension));
    await imagesDir.getFileHandle(filename);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

/**
 * Delete image from OPFS by short hash and extension.
 * Returns true if deleted, false if not found.
 */
export async function remove(shortHash: string, extension: string): Promise<boolean> {
  try {
    const imagesDir = await getImagesDirectory();
    const filename = buildFilename(shortHash, normalizeExtension(extension));

    // Also revoke any cached blob URL
    const cacheKey = `${shortHash}.${extension}`;
    const cachedUrl = blobUrlCache.get(cacheKey);
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl);
      blobUrlCache.delete(cacheKey);
    }

    await imagesDir.removeEntry(filename);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

/**
 * Get a blob URL for an image.
 * Blob URLs are cached to avoid recreating them.
 * Returns null if image not found.
 */
export async function getBlobUrl(
  shortHash: string,
  extension: string
): Promise<string | null> {
  const cacheKey = `${shortHash}.${normalizeExtension(extension)}`;

  // Check cache first
  const cachedUrl = blobUrlCache.get(cacheKey);
  if (cachedUrl) {
    return cachedUrl;
  }

  // Retrieve from OPFS
  const data = await retrieve(shortHash, extension);
  if (!data) {
    return null;
  }

  // Create blob URL
  const mimeType = getMimeType(normalizeExtension(extension));
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);

  // Cache it
  blobUrlCache.set(cacheKey, url);

  return url;
}

/**
 * Revoke a cached blob URL.
 * Call this when the image is no longer needed to free memory.
 */
export function revokeBlobUrl(shortHash: string, extension: string): void {
  const cacheKey = `${shortHash}.${normalizeExtension(extension)}`;
  const cachedUrl = blobUrlCache.get(cacheKey);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    blobUrlCache.delete(cacheKey);
  }
}

/**
 * Revoke all cached blob URLs.
 */
export function revokeAllBlobUrls(): void {
  for (const url of blobUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  blobUrlCache.clear();
}

/**
 * Get storage statistics.
 */
export async function getStorageStats(): Promise<StorageStats> {
  const imagesDir = await getImagesDirectory();
  let totalFiles = 0;
  let totalBytes = 0;

  for await (const [name, handle] of imagesDir.entries()) {
    if (handle.kind === 'file') {
      const parsed = parseFilename(name);
      if (parsed && SUPPORTED_EXTENSIONS.includes(parsed.extension)) {
        totalFiles++;
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        totalBytes += file.size;
      }
    }
  }

  return { totalFiles, totalBytes };
}

/**
 * List all stored images.
 */
export async function listImages(): Promise<ImageFileInfo[]> {
  const imagesDir = await getImagesDirectory();
  const images: ImageFileInfo[] = [];

  for await (const [name, handle] of imagesDir.entries()) {
    if (handle.kind === 'file') {
      const parsed = parseFilename(name);
      if (parsed && SUPPORTED_EXTENSIONS.includes(parsed.extension)) {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        images.push({
          shortHash: parsed.shortHash,
          extension: parsed.extension,
          size: file.size
        });
      }
    }
  }

  return images;
}

/**
 * Clear all stored images.
 * Use with caution!
 */
export async function clearAll(): Promise<number> {
  // First revoke all blob URLs
  revokeAllBlobUrls();

  const imagesDir = await getImagesDirectory();
  let count = 0;

  const entries: string[] = [];
  for await (const [name, handle] of imagesDir.entries()) {
    if (handle.kind === 'file') {
      const parsed = parseFilename(name);
      if (parsed && SUPPORTED_EXTENSIONS.includes(parsed.extension)) {
        entries.push(name);
      }
    }
  }

  for (const name of entries) {
    await imagesDir.removeEntry(name);
    count++;
  }

  return count;
}

/**
 * Compute hash without storing (useful for checking duplicates before import)
 */
export { computeHash, getShortHash };

/**
 * Image OPFS storage service singleton-like export
 */
export const imageOpfsStorage = {
  store,
  storeWithFilename,
  retrieve,
  exists,
  remove,
  getBlobUrl,
  revokeBlobUrl,
  revokeAllBlobUrls,
  getStorageStats,
  listImages,
  clearAll,
  computeHash,
  getShortHash
};
