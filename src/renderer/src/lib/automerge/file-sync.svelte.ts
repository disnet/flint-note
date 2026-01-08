/**
 * File sync helper module for renderer process.
 * Syncs binary files (PDFs, EPUBs, web archives, images) between OPFS and filesystem.
 */

import { getIsFileSyncEnabled, getAllNotes, getNoteContent } from './state.svelte';
import { opfsStorage } from './opfs-storage.svelte';
import { pdfOpfsStorage } from './pdf-opfs-storage.svelte';
import { webpageOpfsStorage } from './webpage-opfs-storage.svelte';
import { imageOpfsStorage } from './image-opfs-storage.svelte';
import { importPdfFromData } from './pdf-import.svelte';
import { importEpubFromData } from './epub-import.svelte';
import { importWebpageFromFilesystem } from './webpage-import.svelte';
import type { EpubNoteProps, PdfNoteProps, WebpageNoteProps } from './types';
import {
  hasManifest,
  rebuildManifest,
  getPdfHashes,
  getEpubHashes,
  getWebpageHashes,
  getImageKeys
} from './opfs-manifest.svelte';

export type FileType = 'pdf' | 'epub' | 'webpage' | 'image';

// Regex to match OPFS image references in note content: ![alt](opfs://images/hash.ext)
const OPFS_IMAGE_REGEX = /!\[[^\]]*\]\(opfs:\/\/images\/([a-f0-9]{8})\.(\w+)\)/gi;

/**
 * Structure containing all file hashes referenced by notes in the current vault.
 * Used to filter file sync to only include files that belong to this vault.
 */
interface VaultFileHashes {
  epubHashes: Set<string>;
  pdfHashes: Set<string>;
  webpageHashes: Set<string>;
  imageRefs: Set<string>; // Format: "shortHash.extension"
}

/**
 * Collect all file hashes referenced by notes in the current vault.
 * This is used to filter file sync to only include files that belong to this vault,
 * rather than syncing all files from the global OPFS storage.
 */
async function getVaultFileHashes(): Promise<VaultFileHashes> {
  const result: VaultFileHashes = {
    epubHashes: new Set(),
    pdfHashes: new Set(),
    webpageHashes: new Set(),
    imageRefs: new Set()
  };

  const notes = getAllNotes();

  for (const note of notes) {
    // Check for EPUB hash in props
    const epubHash = (note.props as EpubNoteProps | undefined)?.epubHash;
    if (epubHash) {
      result.epubHashes.add(epubHash);
    }

    // Check for PDF hash in props
    const pdfHash = (note.props as PdfNoteProps | undefined)?.pdfHash;
    if (pdfHash) {
      result.pdfHashes.add(pdfHash);
    }

    // Check for webpage hash in props
    const webpageHash = (note.props as WebpageNoteProps | undefined)?.webpageHash;
    if (webpageHash) {
      result.webpageHashes.add(webpageHash);
    }

    // For images, we need to scan note content for opfs:// references
    try {
      const content = await getNoteContent(note.id);
      if (content) {
        let match;
        while ((match = OPFS_IMAGE_REGEX.exec(content)) !== null) {
          const shortHash = match[1];
          const extension = match[2];
          result.imageRefs.add(`${shortHash}.${extension}`);
        }
      }
    } catch {
      // Content may not be available for all notes, skip silently
    }
  }

  console.log(
    `[FileSync] Vault file hashes: ${result.epubHashes.size} EPUBs, ${result.pdfHashes.size} PDFs, ${result.webpageHashes.size} webpages, ${result.imageRefs.size} images`
  );

  return result;
}

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
 * Perform initial sync of OPFS files to filesystem.
 * Called when file sync is first enabled for a vault.
 * Only syncs files that are referenced by notes in the current vault,
 * not all files in OPFS (which may belong to other vaults).
 */
export async function performInitialFileSync(): Promise<void> {
  if (!isFileSyncAvailable() || !getIsFileSyncEnabled()) {
    return;
  }

  console.log('[FileSync] Performing initial file sync (OPFS -> filesystem)');

  const syncAPI = window.api?.automergeSync;
  if (!syncAPI) return;

  try {
    // Get file hashes that are referenced by notes in this vault
    const vaultHashes = await getVaultFileHashes();

    // Sync EPUBs (only those referenced by vault notes)
    let epubSyncCount = 0;
    for (const hash of vaultHashes.epubHashes) {
      const exists = await syncAPI.fileExistsOnFilesystem({ fileType: 'epub', hash });
      if (!exists) {
        const data = await opfsStorage.retrieve(hash);
        if (data) {
          await syncAPI.writeFileToFilesystem({
            fileType: 'epub',
            hash,
            data: new Uint8Array(data)
          });
          epubSyncCount++;
        }
      }
    }
    console.log(
      `[FileSync] Synced ${epubSyncCount}/${vaultHashes.epubHashes.size} EPUBs (vault-scoped)`
    );

    // Sync PDFs (only those referenced by vault notes)
    let pdfSyncCount = 0;
    for (const hash of vaultHashes.pdfHashes) {
      const exists = await syncAPI.fileExistsOnFilesystem({ fileType: 'pdf', hash });
      if (!exists) {
        const data = await pdfOpfsStorage.retrieve(hash);
        if (data) {
          await syncAPI.writeFileToFilesystem({
            fileType: 'pdf',
            hash,
            data: new Uint8Array(data)
          });
          pdfSyncCount++;
        }
      }
    }
    console.log(
      `[FileSync] Synced ${pdfSyncCount}/${vaultHashes.pdfHashes.size} PDFs (vault-scoped)`
    );

    // Sync webpages (only those referenced by vault notes)
    let webpageSyncCount = 0;
    for (const hash of vaultHashes.webpageHashes) {
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
          webpageSyncCount++;
        }
      }
    }
    console.log(
      `[FileSync] Synced ${webpageSyncCount}/${vaultHashes.webpageHashes.size} webpages (vault-scoped)`
    );

    // Sync images (only those referenced in vault note content)
    let imageSyncCount = 0;
    for (const imageRef of vaultHashes.imageRefs) {
      const [shortHash, extension] = imageRef.split('.');
      const exists = await syncAPI.fileExistsOnFilesystem({
        fileType: 'image',
        hash: shortHash,
        extension
      });
      if (!exists) {
        const data = await imageOpfsStorage.retrieve(shortHash, extension);
        if (data) {
          await syncAPI.writeFileToFilesystem({
            fileType: 'image',
            hash: shortHash,
            data: new Uint8Array(data),
            extension
          });
          imageSyncCount++;
        }
      }
    }
    console.log(
      `[FileSync] Synced ${imageSyncCount}/${vaultHashes.imageRefs.size} images (vault-scoped)`
    );

    console.log('[FileSync] Initial file sync complete');
  } catch (error) {
    console.error('[FileSync] Initial file sync failed:', error);
  }
}

/**
 * Perform reverse sync - import files from filesystem to OPFS.
 * Called when file sync is first enabled to import existing files.
 *
 * Optimizations:
 * - Pre-fetches all existing OPFS hashes in parallel to avoid individual existence checks
 * - Runs all file type syncs in parallel
 * - Uses concurrent imports within each type (limited to avoid overwhelming the system)
 */
export async function performReverseFileSync(): Promise<void> {
  if (!isFileSyncAvailable() || !getIsFileSyncEnabled()) {
    return;
  }

  const totalStart = performance.now();
  console.log('[FileSync] Starting reverse file sync (filesystem -> OPFS)');

  const syncAPI = window.api?.automergeSync;
  if (!syncAPI) {
    return;
  }

  try {
    // Get existing OPFS hashes from manifest (fast) or rebuild if needed (slow, but only once)
    const hashStart = performance.now();

    // Check if manifest needs to be built (first run or localStorage cleared)
    if (!hasManifest()) {
      console.log('[FileSync] No manifest found, rebuilding from OPFS...');
      await rebuildManifest(
        () => pdfOpfsStorage.listHashes(),
        () => opfsStorage.listHashes(),
        () => webpageOpfsStorage.listHashes(),
        async () => {
          const images = await imageOpfsStorage.listImages();
          return images.map((img) => `${img.shortHash}.${img.extension}`);
        }
      );
    }

    // Get hashes from manifest (instant - just localStorage read)
    const pdfHashSet = new Set(getPdfHashes());
    const epubHashSet = new Set(getEpubHashes());
    const webpageHashSet = new Set(getWebpageHashes());
    const imageKeySet = new Set(getImageKeys());
    const hashTime = performance.now() - hashStart;

    // Helper to run imports with limited concurrency
    const runWithConcurrency = async <T, R>(
      items: T[],
      fn: (item: T) => Promise<R>,
      concurrency: number = 3
    ): Promise<R[]> => {
      const results: R[] = [];
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
      }
      return results;
    };

    // Sync all file types in parallel (using simple timing since perf logger is stack-based)
    const syncStart = performance.now();
    const [pdfResult, epubResult, webpageResult, imageResult] = await Promise.all([
      // Sync PDFs
      (async () => {
        const start = performance.now();
        const pdfFiles = await syncAPI.listFilesInFilesystem({ fileType: 'pdf' });
        const toImport = pdfFiles.filter((f) => !pdfHashSet.has(f.hash));
        let imported = 0;

        await runWithConcurrency(toImport, async (file) => {
          const fileData = await syncAPI.readFileFromFilesystem({
            fileType: 'pdf',
            hash: file.hash
          });
          if (fileData) {
            await importPdfFromData(fileData.data, `imported-${file.hash}.pdf`);
            imported++;
          }
        });

        return { total: pdfFiles.length, imported, time: performance.now() - start };
      })(),

      // Sync EPUBs
      (async () => {
        const start = performance.now();
        const epubFiles = await syncAPI.listFilesInFilesystem({ fileType: 'epub' });
        const toImport = epubFiles.filter((f) => !epubHashSet.has(f.hash));
        let imported = 0;

        await runWithConcurrency(toImport, async (file) => {
          const fileData = await syncAPI.readFileFromFilesystem({
            fileType: 'epub',
            hash: file.hash
          });
          if (fileData) {
            await importEpubFromData(fileData.data, `imported-${file.hash}.epub`);
            imported++;
          }
        });

        return { total: epubFiles.length, imported, time: performance.now() - start };
      })(),

      // Sync Webpages
      (async () => {
        const start = performance.now();
        const webpageFiles = await syncAPI.listFilesInFilesystem({ fileType: 'webpage' });
        const toImport = webpageFiles.filter((f) => !webpageHashSet.has(f.hash));
        let imported = 0;

        await runWithConcurrency(toImport, async (file) => {
          const fileData = await syncAPI.readFileFromFilesystem({
            fileType: 'webpage',
            hash: file.hash
          });
          if (fileData) {
            const decoder = new TextDecoder();
            const htmlContent = decoder.decode(fileData.data);
            await importWebpageFromFilesystem(file.hash, htmlContent, fileData.metadata);
            imported++;
          }
        });

        return { total: webpageFiles.length, imported, time: performance.now() - start };
      })(),

      // Sync Images
      (async () => {
        const start = performance.now();
        const imageFiles = await syncAPI.listFilesInFilesystem({ fileType: 'image' });
        const toImport = imageFiles.filter((f) => {
          if (!f.extension) return false;
          const key = `${f.hash}.${f.extension}`;
          return !imageKeySet.has(key);
        });
        let imported = 0;

        await runWithConcurrency(toImport, async (file) => {
          if (!file.extension) return;
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
            imported++;
          }
        });

        return { total: imageFiles.length, imported, time: performance.now() - start };
      })()
    ]);
    const syncTime = performance.now() - syncStart;

    // Log timing details
    const formatTime = (ms: number): string =>
      ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;

    const totalTime = performance.now() - totalStart;

    console.log(
      `[FileSync] Complete in ${formatTime(totalTime)} ` +
        `(hash lookup: ${formatTime(hashTime)}, sync: ${formatTime(syncTime)}): ` +
        `PDFs ${pdfResult.imported}/${pdfResult.total} (${formatTime(pdfResult.time)}), ` +
        `EPUBs ${epubResult.imported}/${epubResult.total} (${formatTime(epubResult.time)}), ` +
        `Webpages ${webpageResult.imported}/${webpageResult.total} (${formatTime(webpageResult.time)}), ` +
        `Images ${imageResult.imported}/${imageResult.total} (${formatTime(imageResult.time)})`
    );
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
