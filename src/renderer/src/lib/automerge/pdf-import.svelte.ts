/**
 * PDF import functionality for Automerge
 *
 * Handles importing PDF files:
 * 1. Store binary in OPFS (content-addressed)
 * 2. Extract metadata (title, author, page count)
 * 3. Create note with PDF type
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pdfOpfsStorage } from './pdf-opfs-storage.svelte';
import { createPdfNote, setActiveItem, addItemToWorkspace } from './state.svelte';
import type { PdfMetadata } from './types';

// Configure PDF.js worker (using Vite's URL import for local bundling)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Result of a PDF import operation
 */
export interface PdfImportResult {
  noteId: string;
  hash: string;
  title: string;
  author?: string;
  pageCount: number;
}

/**
 * Extract metadata from a PDF file using pdf.js
 */
async function extractPdfMetadata(
  arrayBuffer: ArrayBuffer,
  filename: string
): Promise<PdfMetadata> {
  try {
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    // Get metadata
    const metadata = await pdfDoc.getMetadata();
    const info = metadata.info as Record<string, unknown> | undefined;

    // Extract relevant fields
    const title =
      (info?.Title as string) || (info?.title as string) || filenameToTitle(filename);
    const author = (info?.Author as string) || (info?.author as string);
    const creator = (info?.Creator as string) || (info?.creator as string);
    const producer = (info?.Producer as string) || (info?.producer as string);

    return {
      title: title || filenameToTitle(filename),
      author,
      creator,
      producer,
      pageCount: pdfDoc.numPages
    };
  } catch (error) {
    console.warn('[PDF Import] Failed to extract metadata:', error);
    // Fallback to filename-based title
    return {
      title: filenameToTitle(filename),
      pageCount: 1 // Will be updated when document loads
    };
  }
}

/**
 * Convert a filename to a readable title
 * e.g., "research-paper-2024.pdf" -> "Research Paper 2024"
 */
function filenameToTitle(filename: string): string {
  // Remove .pdf extension
  let title = filename.replace(/\.pdf$/i, '');

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
 * Import a PDF file
 *
 * @param file - The File object from a file input or drag-drop
 * @returns Import result with note ID, hash, and metadata
 */
export async function importPdfFile(file: File): Promise<PdfImportResult> {
  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Store in OPFS (content-addressed by hash)
  const hash = await pdfOpfsStorage.store(arrayBuffer);

  // Extract metadata
  const metadata = await extractPdfMetadata(arrayBuffer, file.name);

  // Create the note
  const noteId = createPdfNote({
    title: metadata.title || file.name,
    pdfHash: hash,
    totalPages: metadata.pageCount,
    pdfTitle: metadata.title,
    pdfAuthor: metadata.author
  });

  // Add to workspace and set as active
  addItemToWorkspace({ type: 'note', id: noteId });
  setActiveItem({ type: 'note', id: noteId });

  return {
    noteId,
    hash,
    title: metadata.title || file.name,
    author: metadata.author,
    pageCount: metadata.pageCount
  };
}

/**
 * Import a PDF from raw data (e.g., from IPC or network)
 *
 * @param data - The PDF content as Uint8Array
 * @param filename - The original filename
 * @returns Import result with note ID, hash, and metadata
 */
export async function importPdfFromData(
  data: Uint8Array,
  filename: string
): Promise<PdfImportResult> {
  // Create a proper ArrayBuffer from the Uint8Array
  // Note: data.buffer can be SharedArrayBuffer in some contexts, so we slice to get a true ArrayBuffer
  const arrayBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;

  // Store in OPFS
  const hash = await pdfOpfsStorage.store(arrayBuffer);

  // Extract metadata
  const metadata = await extractPdfMetadata(arrayBuffer, filename);

  // Create the note
  const noteId = createPdfNote({
    title: metadata.title || filename,
    pdfHash: hash,
    totalPages: metadata.pageCount,
    pdfTitle: metadata.title,
    pdfAuthor: metadata.author
  });

  // Add to workspace and set as active
  addItemToWorkspace({ type: 'note', id: noteId });
  setActiveItem({ type: 'note', id: noteId });

  return {
    noteId,
    hash,
    title: metadata.title || filename,
    author: metadata.author,
    pageCount: metadata.pageCount
  };
}

/**
 * Check if a PDF with the given hash already exists
 */
export async function pdfExists(hash: string): Promise<boolean> {
  return pdfOpfsStorage.exists(hash);
}

/**
 * Trigger a file picker for PDF import
 *
 * @returns Import result or null if cancelled
 */
export async function pickAndImportPdf(): Promise<PdfImportResult | null> {
  return new Promise((resolve) => {
    // Create a hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const result = await importPdfFile(file);
        resolve(result);
      } catch (error) {
        console.error('[PDF Import] Failed to import:', error);
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
 * Handle file drop for PDF import
 *
 * @param event - The drop event
 * @returns Array of import results for any PDF files dropped
 */
export async function handlePdfDrop(event: DragEvent): Promise<PdfImportResult[]> {
  const results: PdfImportResult[] = [];

  if (!event.dataTransfer?.files) {
    return results;
  }

  for (const file of Array.from(event.dataTransfer.files)) {
    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      try {
        const result = await importPdfFile(file);
        results.push(result);
      } catch (error) {
        console.error('[PDF Import] Failed to import dropped file:', file.name, error);
      }
    }
  }

  return results;
}
