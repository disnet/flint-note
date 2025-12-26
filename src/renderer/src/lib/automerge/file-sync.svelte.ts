/**
 * File sync helper module for renderer process.
 * Syncs binary files (PDFs, EPUBs, web archives, images) between OPFS and filesystem.
 */

import { getIsFileSyncEnabled } from './state.svelte';
import { opfsStorage } from './opfs-storage.svelte';
import { pdfOpfsStorage } from './pdf-opfs-storage.svelte';
import { webpageOpfsStorage } from './webpage-opfs-storage.svelte';
import { imageOpfsStorage } from './image-opfs-storage.svelte';
import { importPdfFromData } from './pdf-import.svelte';
import { importEpubFromData } from './epub-import.svelte';
import { importWebpageFromFilesystem } from './webpage-import.svelte';

export type FileType = 'pdf' | 'epub' | 'webpage' | 'image';

/**
 * Check if file sync is available (running in Electron with API access)
 */
export function isFileSyncAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.api?.automergeSync;
}

/**
 * Sync a file to the filesystem via IPC.
 * Only syncs if file sync is enabled for the current vault.
 */
export async function syncFileToFilesystem(
  fileType: FileType,
  hash: string,
  data: Uint8Array,
  options?: {
    extension?: string; // Required for images
    metadata?: Record<string, unknown>; // For webpages
  }
): Promise<void> {
  if (!isFileSyncAvailable() || !getIsFileSyncEnabled()) {
    return;
  }

  const syncAPI = window.api?.automergeSync;
  if (!syncAPI) return;

  try {
    await syncAPI.writeFileToFilesystem({
      fileType,
      hash,
      data,
      extension: options?.extension,
      metadata: options?.metadata
    });
  } catch (error) {
    console.error(`[FileSync] Failed to sync ${fileType} to filesystem:`, error);
    // Don't throw - filesystem sync is best-effort
  }
}

/**
 * Check if a file exists on the filesystem.
 */
export async function fileExistsOnFilesystem(
  fileType: FileType,
  hash: string,
  extension?: string
): Promise<boolean> {
  if (!isFileSyncAvailable() || !getIsFileSyncEnabled()) {
    return false;
  }

  const syncAPI = window.api?.automergeSync;
  if (!syncAPI) return false;

  try {
    return await syncAPI.fileExistsOnFilesystem({
      fileType,
      hash,
      extension
    });
  } catch (error) {
    console.error(`[FileSync] Failed to check file existence:`, error);
    return false;
  }
}

/**
 * Handle a file that was added from the filesystem (reverse sync).
 * Imports the file into OPFS and creates a note if needed.
 */
export async function handleFileAddedFromFilesystem(data: {
  fileType: FileType;
  hash: string;
  extension?: string;
  data: Uint8Array;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(
    `[FileSync] Handling file added from filesystem: ${data.fileType}/${data.hash}`
  );

  try {
    switch (data.fileType) {
      case 'pdf': {
        // Check if already in OPFS
        const existsInOpfs = await pdfOpfsStorage.exists(data.hash);
        if (!existsInOpfs) {
          // Import into OPFS and create note
          await importPdfFromData(data.data, `imported-${data.hash}.pdf`);
        }
        break;
      }
      case 'epub': {
        const existsInOpfs = await opfsStorage.exists(data.hash);
        if (!existsInOpfs) {
          await importEpubFromData(data.data, `imported-${data.hash}.epub`);
        }
        break;
      }
      case 'webpage': {
        const existsInOpfs = await webpageOpfsStorage.exists(data.hash);
        if (!existsInOpfs) {
          // Decode the HTML content
          const decoder = new TextDecoder();
          const htmlContent = decoder.decode(data.data);
          await importWebpageFromFilesystem(data.hash, htmlContent, data.metadata);
        }
        break;
      }
      case 'image': {
        if (!data.extension) {
          console.warn('[FileSync] Image file added without extension, skipping');
          return;
        }
        const existsInOpfs = await imageOpfsStorage.exists(data.hash, data.extension);
        if (!existsInOpfs) {
          // Store in OPFS (images don't create notes, they're embedded in content)
          const arrayBuffer = data.data.buffer.slice(
            data.data.byteOffset,
            data.data.byteOffset + data.data.byteLength
          ) as ArrayBuffer;
          await imageOpfsStorage.storeWithFilename(
            arrayBuffer,
            `${data.hash}.${data.extension}`
          );
        }
        break;
      }
    }
  } catch (error) {
    console.error(`[FileSync] Failed to import ${data.fileType} from filesystem:`, error);
  }
}

/**
 * Perform initial sync of all OPFS files to filesystem.
 * Called when file sync is first enabled for a vault.
 */
export async function performInitialFileSync(): Promise<void> {
  if (!isFileSyncAvailable() || !getIsFileSyncEnabled()) {
    return;
  }

  console.log('[FileSync] Performing initial file sync (OPFS -> filesystem)');

  const syncAPI = window.api?.automergeSync;
  if (!syncAPI) return;

  try {
    // Sync EPUBs
    const epubHashes = await opfsStorage.listHashes();
    for (const hash of epubHashes) {
      const exists = await syncAPI.fileExistsOnFilesystem({ fileType: 'epub', hash });
      if (!exists) {
        const data = await opfsStorage.retrieve(hash);
        if (data) {
          await syncAPI.writeFileToFilesystem({
            fileType: 'epub',
            hash,
            data: new Uint8Array(data)
          });
        }
      }
    }
    console.log(`[FileSync] Synced ${epubHashes.length} EPUBs`);

    // Sync PDFs
    const pdfHashes = await pdfOpfsStorage.listHashes();
    for (const hash of pdfHashes) {
      const exists = await syncAPI.fileExistsOnFilesystem({ fileType: 'pdf', hash });
      if (!exists) {
        const data = await pdfOpfsStorage.retrieve(hash);
        if (data) {
          await syncAPI.writeFileToFilesystem({
            fileType: 'pdf',
            hash,
            data: new Uint8Array(data)
          });
        }
      }
    }
    console.log(`[FileSync] Synced ${pdfHashes.length} PDFs`);

    // Sync webpages
    const webpageHashes = await webpageOpfsStorage.listHashes();
    for (const hash of webpageHashes) {
      const exists = await syncAPI.fileExistsOnFilesystem({ fileType: 'webpage', hash });
      if (!exists) {
        const html = await webpageOpfsStorage.retrieve(hash);
        const metadata = await webpageOpfsStorage.retrieveMetadata(hash);
        if (html) {
          const encoder = new TextEncoder();
          await syncAPI.writeFileToFilesystem({
            fileType: 'webpage',
            hash,
            data: encoder.encode(html),
            metadata: metadata ?? undefined
          });
        }
      }
    }
    console.log(`[FileSync] Synced ${webpageHashes.length} webpages`);

    // Sync images
    const images = await imageOpfsStorage.listImages();
    for (const image of images) {
      const exists = await syncAPI.fileExistsOnFilesystem({
        fileType: 'image',
        hash: image.shortHash,
        extension: image.extension
      });
      if (!exists) {
        const data = await imageOpfsStorage.retrieve(image.shortHash, image.extension);
        if (data) {
          await syncAPI.writeFileToFilesystem({
            fileType: 'image',
            hash: image.shortHash,
            data: new Uint8Array(data),
            extension: image.extension
          });
        }
      }
    }
    console.log(`[FileSync] Synced ${images.length} images`);

    console.log('[FileSync] Initial file sync complete');
  } catch (error) {
    console.error('[FileSync] Initial file sync failed:', error);
  }
}

/**
 * Perform reverse sync - import files from filesystem to OPFS.
 * Called when file sync is first enabled to import existing files.
 */
export async function performReverseFileSync(): Promise<void> {
  if (!isFileSyncAvailable() || !getIsFileSyncEnabled()) {
    return;
  }

  console.log('[FileSync] Performing reverse file sync (filesystem -> OPFS)');

  const syncAPI = window.api?.automergeSync;
  if (!syncAPI) return;

  try {
    // Import PDFs from filesystem
    const pdfFiles = await syncAPI.listFilesInFilesystem({ fileType: 'pdf' });
    for (const file of pdfFiles) {
      const existsInOpfs = await pdfOpfsStorage.exists(file.hash);
      if (!existsInOpfs) {
        const fileData = await syncAPI.readFileFromFilesystem({
          fileType: 'pdf',
          hash: file.hash
        });
        if (fileData) {
          await importPdfFromData(fileData.data, `imported-${file.hash}.pdf`);
        }
      }
    }
    console.log(`[FileSync] Checked ${pdfFiles.length} PDFs from filesystem`);

    // Import EPUBs from filesystem
    const epubFiles = await syncAPI.listFilesInFilesystem({ fileType: 'epub' });
    for (const file of epubFiles) {
      const existsInOpfs = await opfsStorage.exists(file.hash);
      if (!existsInOpfs) {
        const fileData = await syncAPI.readFileFromFilesystem({
          fileType: 'epub',
          hash: file.hash
        });
        if (fileData) {
          await importEpubFromData(fileData.data, `imported-${file.hash}.epub`);
        }
      }
    }
    console.log(`[FileSync] Checked ${epubFiles.length} EPUBs from filesystem`);

    // Import webpages from filesystem
    const webpageFiles = await syncAPI.listFilesInFilesystem({ fileType: 'webpage' });
    for (const file of webpageFiles) {
      const existsInOpfs = await webpageOpfsStorage.exists(file.hash);
      if (!existsInOpfs) {
        const fileData = await syncAPI.readFileFromFilesystem({
          fileType: 'webpage',
          hash: file.hash
        });
        if (fileData) {
          const decoder = new TextDecoder();
          const htmlContent = decoder.decode(fileData.data);
          await importWebpageFromFilesystem(file.hash, htmlContent, fileData.metadata);
        }
      }
    }
    console.log(`[FileSync] Checked ${webpageFiles.length} webpages from filesystem`);

    // Import images from filesystem
    const imageFiles = await syncAPI.listFilesInFilesystem({ fileType: 'image' });
    for (const file of imageFiles) {
      if (!file.extension) continue;
      const existsInOpfs = await imageOpfsStorage.exists(file.hash, file.extension);
      if (!existsInOpfs) {
        const fileData = await syncAPI.readFileFromFilesystem({
          fileType: 'image',
          hash: file.hash,
          extension: file.extension
        });
        if (fileData) {
          const arrayBuffer = fileData.data.buffer.slice(
            fileData.data.byteOffset,
            fileData.data.byteOffset + fileData.data.byteLength
          ) as ArrayBuffer;
          await imageOpfsStorage.storeWithFilename(
            arrayBuffer,
            `${file.hash}.${file.extension}`
          );
        }
      }
    }
    console.log(`[FileSync] Checked ${imageFiles.length} images from filesystem`);

    console.log('[FileSync] Reverse file sync complete');
  } catch (error) {
    console.error('[FileSync] Reverse file sync failed:', error);
  }
}

/**
 * Set up file sync event listener for files added from filesystem.
 * Should be called when switching to a vault with file sync enabled.
 */
export function setupFileSyncListener(): () => void {
  const syncAPI = window.api?.automergeSync;
  if (!syncAPI) {
    return () => {};
  }

  // Remove any existing listener
  syncAPI.removeFileAddedListener();

  // Set up new listener
  syncAPI.onFileAddedFromFilesystem(async (data) => {
    await handleFileAddedFromFilesystem(data);
  });

  return () => {
    syncAPI.removeFileAddedListener();
  };
}
