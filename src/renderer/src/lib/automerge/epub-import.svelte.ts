/**
 * EPUB import functionality for Automerge
 *
 * Handles importing EPUB files:
 * 1. Store binary in OPFS (content-addressed)
 * 2. Extract metadata (title, author)
 * 3. Create note with EPUB type
 * 4. Sync to filesystem if file sync is enabled
 */

import { unzipSync } from 'fflate';
import { opfsStorage } from './opfs-storage.svelte';
import {
  createEpubNote,
  setActiveItem,
  addItemToWorkspace,
  getIsFileSyncEnabled
} from './state.svelte';
import { syncFileToFilesystem } from './file-sync.svelte';
import type { EpubMetadata } from './types';

/**
 * Result of an EPUB import operation
 */
export interface EpubImportResult {
  noteId: string;
  hash: string;
  title: string;
  author?: string;
}

/**
 * Get file content from parsed zip as string
 */
function getZipFileAsString(
  zip: Record<string, Uint8Array>,
  path: string
): string | null {
  const entry = zip[path];
  if (!entry) return null;
  return new TextDecoder().decode(entry);
}

/**
 * Extract metadata from an EPUB file by parsing the OPF directly
 */
function extractEpubMetadata(arrayBuffer: ArrayBuffer, filename: string): EpubMetadata {
  try {
    // Parse the EPUB zip
    const uint8 = new Uint8Array(arrayBuffer);
    const zip = unzipSync(uint8);

    // Read container.xml to find content.opf
    const containerXml = getZipFileAsString(zip, 'META-INF/container.xml');
    if (!containerXml) {
      return { title: filenameToTitle(filename) };
    }

    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'text/xml');
    const rootfileEl = containerDoc.querySelector('rootfile');
    const opfPath = rootfileEl?.getAttribute('full-path');

    if (!opfPath) {
      return { title: filenameToTitle(filename) };
    }

    // Read content.opf
    const opfXml = getZipFileAsString(zip, opfPath);
    if (!opfXml) {
      return { title: filenameToTitle(filename) };
    }

    const opfDoc = parser.parseFromString(opfXml, 'text/xml');

    // Extract metadata from OPF
    // Try dc:title first, then title
    const titleEl =
      opfDoc.querySelector('metadata title') ||
      opfDoc.querySelector('dc\\:title') ||
      opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0];

    // Try dc:creator first, then creator
    const creatorEl =
      opfDoc.querySelector('metadata creator') ||
      opfDoc.querySelector('dc\\:creator') ||
      opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator')[0];

    const publisherEl =
      opfDoc.querySelector('metadata publisher') ||
      opfDoc.querySelector('dc\\:publisher') ||
      opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'publisher')[0];

    const languageEl =
      opfDoc.querySelector('metadata language') ||
      opfDoc.querySelector('dc\\:language') ||
      opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'language')[0];

    const descriptionEl =
      opfDoc.querySelector('metadata description') ||
      opfDoc.querySelector('dc\\:description') ||
      opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'description')[0];

    return {
      title: titleEl?.textContent?.trim() || filenameToTitle(filename),
      author: creatorEl?.textContent?.trim(),
      publisher: publisherEl?.textContent?.trim(),
      language: languageEl?.textContent?.trim(),
      description: descriptionEl?.textContent?.trim()
    };
  } catch (error) {
    console.warn('[EPUB Import] Failed to extract metadata:', error);
    // Fallback to filename-based title
    return {
      title: filenameToTitle(filename)
    };
  }
}

/**
 * Convert a filename to a readable title
 * e.g., "deep-work-cal-newport.epub" -> "Deep Work Cal Newport"
 */
function filenameToTitle(filename: string): string {
  // Remove .epub extension
  let title = filename.replace(/\.epub$/i, '');

  // Replace common separators with spaces
  title = title.replace(/[-_]/g, ' ');

  // Capitalize each word
  title = title
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return title;
}

/**
 * Import an EPUB file
 *
 * @param file - The File object from a file input or drag-drop
 * @returns Import result with note ID, hash, and metadata
 */
export async function importEpubFile(file: File): Promise<EpubImportResult> {
  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Store in OPFS (content-addressed by hash)
  const hash = await opfsStorage.store(arrayBuffer);

  // Sync to filesystem if file sync is enabled
  if (getIsFileSyncEnabled()) {
    await syncFileToFilesystem('epub', hash, new Uint8Array(arrayBuffer));
  }

  // Extract metadata
  const metadata = extractEpubMetadata(arrayBuffer, file.name);

  // Create the note
  const noteId = createEpubNote({
    title: metadata.title || file.name,
    epubHash: hash,
    epubTitle: metadata.title,
    epubAuthor: metadata.author
  });

  // Add to workspace and set as active
  addItemToWorkspace({ type: 'note', id: noteId });
  setActiveItem({ type: 'note', id: noteId });

  return {
    noteId,
    hash,
    title: metadata.title || file.name,
    author: metadata.author
  };
}

/**
 * Import an EPUB from raw data (e.g., from IPC or network)
 *
 * @param data - The EPUB content as Uint8Array
 * @param filename - The original filename
 * @returns Import result with note ID, hash, and metadata
 */
export async function importEpubFromData(
  data: Uint8Array,
  filename: string
): Promise<EpubImportResult> {
  // Create a proper ArrayBuffer from the Uint8Array
  // Note: data.buffer can be SharedArrayBuffer in some contexts, so we slice to get a true ArrayBuffer
  const arrayBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;

  // Store in OPFS
  const hash = await opfsStorage.store(arrayBuffer);

  // Sync to filesystem if file sync is enabled
  if (getIsFileSyncEnabled()) {
    await syncFileToFilesystem('epub', hash, new Uint8Array(arrayBuffer));
  }

  // Extract metadata
  const metadata = extractEpubMetadata(arrayBuffer, filename);

  // Create the note
  const noteId = createEpubNote({
    title: metadata.title || filename,
    epubHash: hash,
    epubTitle: metadata.title,
    epubAuthor: metadata.author
  });

  // Add to workspace and set as active
  addItemToWorkspace({ type: 'note', id: noteId });
  setActiveItem({ type: 'note', id: noteId });

  return {
    noteId,
    hash,
    title: metadata.title || filename,
    author: metadata.author
  };
}

/**
 * Check if an EPUB with the given hash already exists
 */
export async function epubExists(hash: string): Promise<boolean> {
  return opfsStorage.exists(hash);
}

/**
 * Trigger a file picker for EPUB import
 *
 * @returns Import result or null if cancelled
 */
export async function pickAndImportEpub(): Promise<EpubImportResult | null> {
  return new Promise((resolve) => {
    // Create a hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.epub,application/epub+zip';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const result = await importEpubFile(file);
        resolve(result);
      } catch (error) {
        console.error('[EPUB Import] Failed to import:', error);
        resolve(null);
      }
    };

    input.oncancel = () => {
      resolve(null);
    };

    // Trigger the file picker
    input.click();
  });
}

/**
 * Handle file drop for EPUB import
 *
 * @param event - The drop event
 * @returns Array of import results for any EPUB files dropped
 */
export async function handleEpubDrop(event: DragEvent): Promise<EpubImportResult[]> {
  const results: EpubImportResult[] = [];

  if (!event.dataTransfer?.files) {
    return results;
  }

  for (const file of Array.from(event.dataTransfer.files)) {
    if (
      file.name.toLowerCase().endsWith('.epub') ||
      file.type === 'application/epub+zip'
    ) {
      try {
        const result = await importEpubFile(file);
        results.push(result);
      } catch (error) {
        console.error('[EPUB Import] Failed to import dropped file:', file.name, error);
      }
    }
  }

  return results;
}
