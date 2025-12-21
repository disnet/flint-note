/**
 * Webpage import functionality for Automerge
 *
 * Handles importing webpages from URLs:
 * 1. Fetch and extract article content via IPC (uses Defuddle in main process)
 * 2. Store HTML in OPFS (content-addressed)
 * 3. Create note with webpage type
 */

import { webpageOpfsStorage } from './webpage-opfs-storage.svelte';
import { createWebpageNote, setActiveItem, addItemToWorkspace } from './state.svelte';
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
  // Validate URL
  const parsedUrl = new URL(url);
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
