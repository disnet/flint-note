/**
 * Content document management for lazy loading note content.
 * Each note's content is stored in a separate Automerge document.
 */

import { type Repo, type DocHandle, type AutomergeUrl } from '@automerge/automerge-repo';
import type { NoteContentDocument } from './types';

// Cache of loaded content handles
const contentHandles = new Map<string, DocHandle<NoteContentDocument>>();

// localStorage key prefix for content URL mappings
const CONTENT_URLS_PREFIX = 'flint-content-urls-';

/**
 * Get the content URL map from localStorage for a vault
 */
function getContentUrlMap(vaultId: string): Record<string, string> {
  const key = `${CONTENT_URLS_PREFIX}${vaultId}`;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : {};
}

/**
 * Save the content URL map to localStorage for a vault
 */
function saveContentUrlMap(vaultId: string, map: Record<string, string>): void {
  const key = `${CONTENT_URLS_PREFIX}${vaultId}`;
  localStorage.setItem(key, JSON.stringify(map));
}

/**
 * Get the content URL for a note from localStorage
 */
export function getContentUrl(vaultId: string, noteId: string): string | undefined {
  const map = getContentUrlMap(vaultId);
  return map[noteId];
}

/**
 * Store a content URL for a note in localStorage
 */
export function storeContentUrl(vaultId: string, noteId: string, url: string): void {
  const map = getContentUrlMap(vaultId);
  map[noteId] = url;
  saveContentUrlMap(vaultId, map);
}

/**
 * Remove a content URL for a note from localStorage
 */
export function removeContentUrl(vaultId: string, noteId: string): void {
  const map = getContentUrlMap(vaultId);
  delete map[noteId];
  saveContentUrlMap(vaultId, map);
}

/**
 * Get or create a content document handle for a note.
 * Creates a new document if one doesn't exist for this note.
 *
 * @param repo - The Automerge repo
 * @param vaultId - The vault ID (for localStorage key)
 * @param noteId - The note ID
 * @param existingUrl - Optional URL from root document's contentUrls
 * @returns The content document handle
 */
export async function getContentHandle(
  repo: Repo,
  vaultId: string,
  noteId: string,
  existingUrl?: string
): Promise<DocHandle<NoteContentDocument>> {
  // Check cache first
  const cached = contentHandles.get(noteId);
  if (cached) {
    return cached;
  }

  // Try to find existing URL from parameter or localStorage
  const url = existingUrl || getContentUrl(vaultId, noteId);

  if (url) {
    try {
      // Load existing content doc
      const handle = await repo.find<NoteContentDocument>(url as AutomergeUrl);
      await handle.whenReady();

      if (handle.isReady()) {
        contentHandles.set(noteId, handle);
        return handle;
      }
      // Document unavailable, fall through to create new one
      console.warn(
        `[ContentDocs] Content doc unavailable for ${noteId}, creating new one`
      );
    } catch (error) {
      console.warn(`[ContentDocs] Error loading content doc for ${noteId}:`, error);
      // Fall through to create new one
    }
  }

  // Create new content doc
  const handle = repo.create<NoteContentDocument>({
    noteId,
    content: ''
  });

  // Store URL in localStorage
  storeContentUrl(vaultId, noteId, handle.url);

  // Cache the handle
  contentHandles.set(noteId, handle);

  return handle;
}

/**
 * Get a content handle if it exists, without creating a new one
 */
export async function findContentHandle(
  repo: Repo,
  vaultId: string,
  noteId: string,
  existingUrl?: string
): Promise<DocHandle<NoteContentDocument> | null> {
  // Check cache first
  const cached = contentHandles.get(noteId);
  if (cached) {
    return cached;
  }

  // Try to find existing URL
  const url = existingUrl || getContentUrl(vaultId, noteId);
  if (!url) {
    return null;
  }

  try {
    const handle = await repo.find<NoteContentDocument>(url as AutomergeUrl);
    await handle.whenReady();

    if (handle.isReady()) {
      contentHandles.set(noteId, handle);
      return handle;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get a cached content handle (synchronous, returns null if not loaded)
 */
export function getCachedContentHandle(
  noteId: string
): DocHandle<NoteContentDocument> | null {
  return contentHandles.get(noteId) || null;
}

/**
 * Clear the content handle cache (call when switching vaults)
 */
export function clearContentCache(): void {
  contentHandles.clear();
}

/**
 * Remove a content handle from cache
 */
export function removeFromContentCache(noteId: string): void {
  contentHandles.delete(noteId);
}

/**
 * Get the number of cached content handles
 */
export function getContentCacheSize(): number {
  return contentHandles.size;
}

/**
 * Preload content handles for a list of note IDs
 */
export async function preloadContentHandles(
  repo: Repo,
  vaultId: string,
  noteIds: string[],
  contentUrls?: Record<string, string>
): Promise<void> {
  const promises = noteIds.map((noteId) =>
    getContentHandle(repo, vaultId, noteId, contentUrls?.[noteId]).catch((error) => {
      console.warn(`[ContentDocs] Failed to preload content for ${noteId}:`, error);
    })
  );
  await Promise.all(promises);
}

/**
 * Clear content URL data for a vault from localStorage
 */
export function clearContentUrls(vaultId: string): void {
  const key = `${CONTENT_URLS_PREFIX}${vaultId}`;
  localStorage.removeItem(key);
}
