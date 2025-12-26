/**
 * Webpage import functionality for Automerge
 *
 * Handles importing webpages from URLs:
 * 1. Fetch and extract article content via IPC (uses Defuddle in main process)
 * 2. Store HTML in OPFS (content-addressed)
 * 3. Create note with webpage type
 * 4. Sync to filesystem if file sync is enabled
 */

import { webpageOpfsStorage } from './webpage-opfs-storage.svelte';
import {
  createWebpageNote,
  setActiveItem,
  addItemToWorkspace,
  getIsFileSyncEnabled
} from './state.svelte';
import { syncFileToFilesystem } from './file-sync.svelte';
import type { WebpageMetadata } from './types';

/**
 * Result of a webpage import operation
 */
export interface WebpageImportResult {
  noteId: string;
  hash: string;
  title: string;
  url: string;
  author?: string;
  siteName?: string;
}

/**
 * Result from the IPC webpage archiving call
 */
interface ArchiveWebpageResult {
  html: string;
  metadata: WebpageMetadata;
}

/**
 * Import a webpage from a URL
 *
 * @param url - The URL to archive
 * @returns Import result with note ID, hash, and metadata
 */
export async function importWebpageFromUrl(url: string): Promise<WebpageImportResult> {
  // Validate URL - standard URL is fine here since we only need validation, not reactivity
  let parsedUrl: URL;
  try {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported');
  }

  // Call IPC to fetch and process the webpage
  const result = (await window.api?.archiveWebpage({ url })) as
    | ArchiveWebpageResult
    | undefined;

  if (!result) {
    throw new Error('Failed to archive webpage - IPC not available');
  }

  const { html, metadata } = result;

  // Store HTML in OPFS (content-addressed by hash)
  const hash = await webpageOpfsStorage.store(html);

  // Store metadata alongside
  await webpageOpfsStorage.storeMetadata(
    hash,
    metadata as unknown as Record<string, unknown>
  );

  // Sync to filesystem if file sync is enabled
  if (getIsFileSyncEnabled()) {
    const encoder = new TextEncoder();
    await syncFileToFilesystem('webpage', hash, encoder.encode(html), {
      metadata: metadata as unknown as Record<string, unknown>
    });
  }

  // Create the note
  const noteId = createWebpageNote({
    title: metadata.title || 'Untitled',
    webpageHash: hash,
    webpageUrl: metadata.url,
    webpageTitle: metadata.title,
    webpageAuthor: metadata.author,
    webpageSiteName: metadata.siteName,
    webpageExcerpt: metadata.excerpt
  });

  // Add to workspace and set as active
  addItemToWorkspace({ type: 'note', id: noteId });
  setActiveItem({ type: 'note', id: noteId });

  return {
    noteId,
    hash,
    title: metadata.title || 'Untitled',
    url: metadata.url,
    author: metadata.author,
    siteName: metadata.siteName
  };
}

/**
 * Check if a webpage with the given hash already exists
 */
export async function webpageExists(hash: string): Promise<boolean> {
  return webpageOpfsStorage.exists(hash);
}

/**
 * Get stored webpage HTML by hash
 */
export async function getWebpageHtml(hash: string): Promise<string | null> {
  return webpageOpfsStorage.retrieve(hash);
}

/**
 * Get stored webpage metadata by hash
 */
export async function getWebpageMetadata(hash: string): Promise<WebpageMetadata | null> {
  const data = await webpageOpfsStorage.retrieveMetadata(hash);
  if (!data) return null;
  return data as unknown as WebpageMetadata;
}

/**
 * Import a webpage from filesystem (reverse sync).
 * Used when a webpage file is added directly to the sync folder.
 *
 * @param hash - The content hash from the filename
 * @param htmlContent - The HTML content
 * @param metadata - Optional metadata from the .meta.json file
 * @returns Import result with note ID, hash, and metadata
 */
export async function importWebpageFromFilesystem(
  _hash: string,
  htmlContent: string,
  metadata?: Record<string, unknown>
): Promise<WebpageImportResult> {
  // Store HTML in OPFS (should deduplicate since hash matches)
  const storedHash = await webpageOpfsStorage.store(htmlContent);

  // Store metadata if provided
  if (metadata) {
    await webpageOpfsStorage.storeMetadata(storedHash, metadata);
  }

  // Extract metadata for note creation
  const title = (metadata?.title as string) || 'Imported Webpage';
  const url = (metadata?.url as string) || '';
  const author = metadata?.author as string | undefined;
  const siteName = metadata?.siteName as string | undefined;
  const excerpt = metadata?.excerpt as string | undefined;

  // Create the note
  const noteId = createWebpageNote({
    title,
    webpageHash: storedHash,
    webpageUrl: url,
    webpageTitle: title,
    webpageAuthor: author,
    webpageSiteName: siteName,
    webpageExcerpt: excerpt
  });

  // Add to workspace and set as active
  addItemToWorkspace({ type: 'note', id: noteId });
  setActiveItem({ type: 'note', id: noteId });

  return {
    noteId,
    hash: storedHash,
    title,
    url,
    author,
    siteName
  };
}
