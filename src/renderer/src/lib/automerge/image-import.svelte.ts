/**
 * Image import functionality for Automerge notes.
 *
 * Handles importing images via:
 * 1. Drag and drop onto the editor
 * 2. Clipboard paste (Cmd+V)
 *
 * Images are stored in OPFS with content-addressed filenames.
 * Images are synced to filesystem if file sync is enabled.
 */

import { imageOpfsStorage } from './image-opfs-storage.svelte';
import { getIsFileSyncEnabled } from './state.svelte';
import { syncFileToFilesystem } from './file-sync.svelte';

/**
 * Result of an image import operation
 */
export interface ImageImportResult {
  shortHash: string; // 8-char hash
  extension: string; // png, jpg, gif, webp
  markdownSyntax: string; // ![](opfs://images/a1b2c3d4.png)
  originalName?: string; // Original filename if available
}

/**
 * Supported MIME types and their corresponding extensions
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

/**
 * Check if a MIME type is a supported image type
 */
export function isSupportedImageType(mimeType: string): boolean {
  return mimeType in MIME_TO_EXTENSION;
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string | null {
  return MIME_TO_EXTENSION[mimeType] || null;
}

/**
 * Get file extension from filename
 */
function getExtensionFromFilename(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  // Normalize jpeg to jpg
  if (ext === 'jpeg') return 'jpg';
  if (['png', 'jpg', 'gif', 'webp'].includes(ext)) return ext;
  return null;
}

/**
 * Build markdown image syntax for an OPFS-stored image
 */
export function buildMarkdownImageSyntax(
  shortHash: string,
  extension: string,
  altText: string = ''
): string {
  return `![${altText}](opfs://images/${shortHash}.${extension})`;
}

/**
 * Parse an OPFS image URL to extract hash and extension
 * Returns null if not a valid OPFS image URL
 */
export function parseOpfsImageUrl(
  url: string
): { shortHash: string; extension: string } | null {
  const match = url.match(/^opfs:\/\/images\/([a-f0-9]{8})\.(\w+)$/i);
  if (!match) return null;
  return { shortHash: match[1].toLowerCase(), extension: match[2].toLowerCase() };
}

/**
 * Import an image from a File object (e.g., from drag-drop or file picker)
 */
export async function importImageFile(file: File): Promise<ImageImportResult> {
  // Determine extension from MIME type or filename
  let extension = getExtensionFromMimeType(file.type);
  if (!extension) {
    extension = getExtensionFromFilename(file.name);
  }
  if (!extension) {
    throw new Error(`Unsupported image type: ${file.type || file.name}`);
  }

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Store in OPFS
  const result = await imageOpfsStorage.store(arrayBuffer, extension);

  // Sync to filesystem if file sync is enabled
  if (getIsFileSyncEnabled()) {
    await syncFileToFilesystem('image', result.shortHash, new Uint8Array(arrayBuffer), {
      extension: result.extension
    });
  }

  // Build markdown syntax
  const markdownSyntax = buildMarkdownImageSyntax(result.shortHash, result.extension);

  return {
    shortHash: result.shortHash,
    extension: result.extension,
    markdownSyntax,
    originalName: file.name
  };
}

/**
 * Import an image from raw data (e.g., from IPC during migration)
 */
export async function importImageFromData(
  data: Uint8Array | ArrayBuffer,
  extension: string,
  originalName?: string
): Promise<ImageImportResult> {
  // Convert Uint8Array to ArrayBuffer if needed
  let arrayBuffer: ArrayBuffer;
  if (data instanceof ArrayBuffer) {
    arrayBuffer = data;
  } else {
    // Create a new ArrayBuffer from the Uint8Array to ensure proper type
    const copy = new Uint8Array(data);
    arrayBuffer = copy.buffer as ArrayBuffer;
  }

  // Store in OPFS
  const result = await imageOpfsStorage.store(arrayBuffer, extension);

  // Sync to filesystem if file sync is enabled
  if (getIsFileSyncEnabled()) {
    await syncFileToFilesystem('image', result.shortHash, new Uint8Array(arrayBuffer), {
      extension: result.extension
    });
  }

  // Build markdown syntax
  const markdownSyntax = buildMarkdownImageSyntax(result.shortHash, result.extension);

  return {
    shortHash: result.shortHash,
    extension: result.extension,
    markdownSyntax,
    originalName
  };
}

/**
 * Check if a DataTransfer object contains image data
 */
export function hasImageData(dataTransfer: DataTransfer): boolean {
  // Check files
  for (const file of Array.from(dataTransfer.files)) {
    if (isSupportedImageType(file.type)) {
      return true;
    }
    // Also check by extension
    const ext = getExtensionFromFilename(file.name);
    if (ext) return true;
  }

  // Check items (for clipboard data)
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind === 'file' && isSupportedImageType(item.type)) {
      return true;
    }
  }

  return false;
}

/**
 * Get image files from a DataTransfer object
 */
export function getImageFiles(dataTransfer: DataTransfer): File[] {
  const imageFiles: File[] = [];

  // First try files (for drag-drop)
  for (const file of Array.from(dataTransfer.files)) {
    if (isSupportedImageType(file.type)) {
      imageFiles.push(file);
    } else {
      // Check by extension as fallback
      const ext = getExtensionFromFilename(file.name);
      if (ext) {
        imageFiles.push(file);
      }
    }
  }

  // If no files found, check items (for clipboard)
  if (imageFiles.length === 0) {
    for (const item of Array.from(dataTransfer.items)) {
      if (item.kind === 'file' && isSupportedImageType(item.type)) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }
  }

  return imageFiles;
}

/**
 * Handle image drop event
 * Returns array of import results for all images dropped
 */
export async function handleImageDrop(event: DragEvent): Promise<ImageImportResult[]> {
  const results: ImageImportResult[] = [];

  if (!event.dataTransfer) {
    return results;
  }

  const imageFiles = getImageFiles(event.dataTransfer);

  for (const file of imageFiles) {
    try {
      const result = await importImageFile(file);
      results.push(result);
    } catch (error) {
      console.error('[Image Import] Failed to import dropped file:', file.name, error);
    }
  }

  return results;
}

/**
 * Handle clipboard paste event
 * Returns import result if an image was pasted, null otherwise
 */
export async function handleImagePaste(
  event: ClipboardEvent
): Promise<ImageImportResult | null> {
  if (!event.clipboardData) {
    return null;
  }

  const imageFiles = getImageFiles(event.clipboardData);

  if (imageFiles.length === 0) {
    return null;
  }

  // Only import the first image
  try {
    return await importImageFile(imageFiles[0]);
  } catch (error) {
    console.error('[Image Import] Failed to import pasted image:', error);
    return null;
  }
}

/**
 * Check if an image exists in OPFS
 */
export async function imageExists(
  shortHash: string,
  extension: string
): Promise<boolean> {
  return imageOpfsStorage.exists(shortHash, extension);
}

/**
 * Trigger a file picker for image import
 * Returns array of import results or empty array if cancelled
 */
export async function pickAndImportImages(): Promise<ImageImportResult[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.multiple = true;

    input.onchange = async () => {
      const results: ImageImportResult[] = [];

      if (input.files) {
        for (const file of Array.from(input.files)) {
          try {
            const result = await importImageFile(file);
            results.push(result);
          } catch (error) {
            console.error('[Image Import] Failed to import:', file.name, error);
          }
        }
      }

      resolve(results);
    };

    input.oncancel = () => {
      resolve([]);
    };

    input.click();
  });
}
