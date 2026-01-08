/**
 * OPFS Manifest - Tracks what files exist in OPFS storage
 *
 * Instead of iterating OPFS directories on each startup (slow),
 * we maintain a manifest in localStorage for instant lookups.
 * The manifest is updated whenever files are added/removed from OPFS.
 */

const MANIFEST_KEY = 'opfs-manifest';

interface OpfsManifest {
  version: 1;
  pdfs: string[]; // Full hashes
  epubs: string[]; // Full hashes
  webpages: string[]; // Full hashes
  images: string[]; // Format: "shortHash.extension"
}

// In-memory cache of the manifest for fast access
let manifestCache: OpfsManifest | null = null;

/**
 * Get the default empty manifest
 */
function getEmptyManifest(): OpfsManifest {
  return {
    version: 1,
    pdfs: [],
    epubs: [],
    webpages: [],
    images: []
  };
}

/**
 * Load the manifest from localStorage
 */
function loadManifest(): OpfsManifest {
  if (manifestCache) {
    return manifestCache;
  }

  try {
    const stored = localStorage.getItem(MANIFEST_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as OpfsManifest;
      if (parsed.version === 1) {
        manifestCache = parsed;
        return parsed;
      }
    }
  } catch (error) {
    console.warn('[OpfsManifest] Failed to load manifest:', error);
  }

  manifestCache = getEmptyManifest();
  return manifestCache;
}

/**
 * Save the manifest to localStorage
 */
function saveManifest(): void {
  if (!manifestCache) return;

  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifestCache));
  } catch (error) {
    console.error('[OpfsManifest] Failed to save manifest:', error);
  }
}

/**
 * Add a PDF hash to the manifest
 */
export function addPdfHash(hash: string): void {
  const manifest = loadManifest();
  if (!manifest.pdfs.includes(hash)) {
    manifest.pdfs.push(hash);
    saveManifest();
  }
}

/**
 * Remove a PDF hash from the manifest
 */
export function removePdfHash(hash: string): void {
  const manifest = loadManifest();
  const index = manifest.pdfs.indexOf(hash);
  if (index !== -1) {
    manifest.pdfs.splice(index, 1);
    saveManifest();
  }
}

/**
 * Check if a PDF hash exists in the manifest
 */
export function hasPdfHash(hash: string): boolean {
  return loadManifest().pdfs.includes(hash);
}

/**
 * Get all PDF hashes from manifest
 */
export function getPdfHashes(): string[] {
  return [...loadManifest().pdfs];
}

/**
 * Add an EPUB hash to the manifest
 */
export function addEpubHash(hash: string): void {
  const manifest = loadManifest();
  if (!manifest.epubs.includes(hash)) {
    manifest.epubs.push(hash);
    saveManifest();
  }
}

/**
 * Remove an EPUB hash from the manifest
 */
export function removeEpubHash(hash: string): void {
  const manifest = loadManifest();
  const index = manifest.epubs.indexOf(hash);
  if (index !== -1) {
    manifest.epubs.splice(index, 1);
    saveManifest();
  }
}

/**
 * Check if an EPUB hash exists in the manifest
 */
export function hasEpubHash(hash: string): boolean {
  return loadManifest().epubs.includes(hash);
}

/**
 * Get all EPUB hashes from manifest
 */
export function getEpubHashes(): string[] {
  return [...loadManifest().epubs];
}

/**
 * Add a webpage hash to the manifest
 */
export function addWebpageHash(hash: string): void {
  const manifest = loadManifest();
  if (!manifest.webpages.includes(hash)) {
    manifest.webpages.push(hash);
    saveManifest();
  }
}

/**
 * Remove a webpage hash from the manifest
 */
export function removeWebpageHash(hash: string): void {
  const manifest = loadManifest();
  const index = manifest.webpages.indexOf(hash);
  if (index !== -1) {
    manifest.webpages.splice(index, 1);
    saveManifest();
  }
}

/**
 * Check if a webpage hash exists in the manifest
 */
export function hasWebpageHash(hash: string): boolean {
  return loadManifest().webpages.includes(hash);
}

/**
 * Get all webpage hashes from manifest
 */
export function getWebpageHashes(): string[] {
  return [...loadManifest().webpages];
}

/**
 * Add an image key to the manifest
 * @param key Format: "shortHash.extension"
 */
export function addImageKey(key: string): void {
  const manifest = loadManifest();
  if (!manifest.images.includes(key)) {
    manifest.images.push(key);
    saveManifest();
  }
}

/**
 * Remove an image key from the manifest
 * @param key Format: "shortHash.extension"
 */
export function removeImageKey(key: string): void {
  const manifest = loadManifest();
  const index = manifest.images.indexOf(key);
  if (index !== -1) {
    manifest.images.splice(index, 1);
    saveManifest();
  }
}

/**
 * Check if an image key exists in the manifest
 * @param key Format: "shortHash.extension"
 */
export function hasImageKey(key: string): boolean {
  return loadManifest().images.includes(key);
}

/**
 * Get all image keys from manifest
 */
export function getImageKeys(): string[] {
  return [...loadManifest().images];
}

/**
 * Rebuild the manifest from actual OPFS contents.
 * This is slow but ensures manifest accuracy.
 * Should only be called on first run or if manifest is corrupted.
 */
export async function rebuildManifest(
  listPdfHashes: () => Promise<string[]>,
  listEpubHashes: () => Promise<string[]>,
  listWebpageHashes: () => Promise<string[]>,
  listImageKeys: () => Promise<string[]>
): Promise<void> {
  console.log('[OpfsManifest] Rebuilding manifest from OPFS...');
  const start = performance.now();

  const [pdfs, epubs, webpages, images] = await Promise.all([
    listPdfHashes(),
    listEpubHashes(),
    listWebpageHashes(),
    listImageKeys()
  ]);

  manifestCache = {
    version: 1,
    pdfs,
    epubs,
    webpages,
    images
  };
  saveManifest();

  const duration = performance.now() - start;
  console.log(
    `[OpfsManifest] Rebuilt manifest in ${duration.toFixed(0)}ms: ` +
      `${pdfs.length} PDFs, ${epubs.length} EPUBs, ${webpages.length} webpages, ${images.length} images`
  );
}

/**
 * Check if manifest exists (has been initialized)
 */
export function hasManifest(): boolean {
  return localStorage.getItem(MANIFEST_KEY) !== null;
}

/**
 * Clear the manifest (for testing or reset)
 */
export function clearManifest(): void {
  localStorage.removeItem(MANIFEST_KEY);
  manifestCache = null;
}

/**
 * Get manifest stats for debugging
 */
export function getManifestStats(): {
  pdfs: number;
  epubs: number;
  webpages: number;
  images: number;
} {
  const manifest = loadManifest();
  return {
    pdfs: manifest.pdfs.length,
    epubs: manifest.epubs.length,
    webpages: manifest.webpages.length,
    images: manifest.images.length
  };
}
