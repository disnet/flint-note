/**
 * Migration service for legacy vaults
 *
 * Orchestrates the migration of SQLite-based vaults to Automerge.
 * This runs in the main process and communicates with the renderer via IPC.
 */

import crypto from 'crypto';
import type { BrowserWindow } from 'electron';
import type {
  MigrationParams,
  MigrationResult,
  MigrationProgress,
  MigrationError,
  EpubFileData,
  PdfFileData,
  WebpageFileData
} from './types';
import {
  extractVaultData,
  readEpubFile,
  readPdfFile,
  readWebpageFile
} from './sqlite-reader';
import { transformVaultData } from './data-transformer';
import { ensureSyncDirectory, getSafeSyncDirectory } from './utils';

/**
 * Generate a vault ID
 */
function generateVaultId(): string {
  return `vault-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Send progress update to renderer
 */
function sendProgress(win: BrowserWindow | null, progress: MigrationProgress): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('migration-progress', progress);
  }
}

/**
 * Migrate a legacy vault to Automerge
 *
 * This is the main migration function. It:
 * 1. Extracts data from SQLite (read-only)
 * 2. Transforms to Automerge format
 * 3. Returns the data for the renderer to create the Automerge document
 *
 * Note: The actual Automerge document creation happens in the renderer
 * because the Automerge repo lives there.
 *
 * @param params - Migration parameters
 * @param win - Browser window for progress updates
 * @returns Migration result with document data
 */
export async function migrateLegacyVault(
  params: MigrationParams,
  win: BrowserWindow | null
): Promise<MigrationResult> {
  const errors: MigrationError[] = [];
  const { vaultPath, syncDirectoryName } = params;

  try {
    // Phase 1: Determine sync directory
    sendProgress(win, {
      phase: 'detecting',
      message: 'Preparing migration...',
      current: 0,
      total: 4
    });

    const finalSyncDir = syncDirectoryName ?? getSafeSyncDirectory(vaultPath);

    // Create sync directory with marker
    ensureSyncDirectory(vaultPath, finalSyncDir);

    // Phase 2: Extract data from SQLite
    sendProgress(win, {
      phase: 'extracting',
      message: 'Reading legacy database...',
      current: 1,
      total: 4
    });

    const legacyData = await extractVaultData(vaultPath, (message, current, total) => {
      sendProgress(win, {
        phase: 'extracting',
        message,
        current,
        total
      });
    });

    // Phase 3: Transform data
    sendProgress(win, {
      phase: 'transforming',
      message: 'Converting data format...',
      current: 2,
      total: 4
    });

    const transformResult = transformVaultData(legacyData);
    errors.push(...transformResult.errors);

    // Phase 4: Read EPUB files
    if (transformResult.epubFiles.length > 0) {
      sendProgress(win, {
        phase: 'transforming',
        message: `Reading ${transformResult.epubFiles.length} EPUB files...`,
        current: 3,
        total: 4,
        details: {
          epubs: transformResult.epubFiles.length
        }
      });

      // Read actual EPUB file data
      for (const epubFile of transformResult.epubFiles) {
        const fileData = readEpubFile(vaultPath, epubFile.filePath);
        if (fileData) {
          epubFile.fileData = fileData;
        } else {
          errors.push({
            entity: 'epub',
            entityId: epubFile.noteId,
            message: `Could not read EPUB file: ${epubFile.filePath}`
          });
        }
      }
    }

    // Generate vault ID
    const vaultId = generateVaultId();

    // Send the transformed data to renderer for document creation
    // The renderer will create the Automerge document and store the EPUB files
    sendProgress(win, {
      phase: 'writing',
      message: 'Preparing to create Automerge document...',
      current: 4,
      total: 4,
      details: transformResult.stats
    });

    // Return result - the renderer will use this to create the actual document
    return {
      success: true,
      vaultId,
      docUrl: '', // Will be set by renderer after document creation
      baseDirectory: vaultPath,
      syncDirectoryName: finalSyncDir,
      stats: transformResult.stats,
      errors,
      idMapping: {
        noteTypes: transformResult.typeIdMapping
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    sendProgress(win, {
      phase: 'error',
      message: `Migration failed: ${errorMessage}`,
      current: 0,
      total: 0
    });

    return {
      success: false,
      vaultId: '',
      docUrl: '',
      baseDirectory: vaultPath,
      syncDirectoryName: params.syncDirectoryName ?? '',
      stats: {
        noteTypes: 0,
        notes: 0,
        epubs: 0,
        pdfs: 0,
        webpages: 0,
        decks: 0,
        dailyNotes: 0,
        workspaces: 0,
        reviewItems: 0,
        agentRoutines: 0,
        skipped: 0
      },
      errors: [
        {
          entity: 'note',
          entityId: 'migration',
          message: errorMessage
        }
      ],
      idMapping: { noteTypes: {} }
    };
  }
}

/**
 * Get the document data for creating an Automerge document
 *
 * This is called separately from migrate to allow the renderer
 * to create the document with proper async handling.
 */
export async function getMigrationDocumentData(vaultPath: string): Promise<{
  document: unknown;
  epubFiles: EpubFileData[];
  pdfFiles: PdfFileData[];
  webpageFiles: WebpageFileData[];
  errors: MigrationError[];
} | null> {
  try {
    const legacyData = await extractVaultData(vaultPath);
    const transformResult = transformVaultData(legacyData);

    // Read EPUB file data
    for (const epubFile of transformResult.epubFiles) {
      const fileData = readEpubFile(vaultPath, epubFile.filePath);
      if (fileData) {
        epubFile.fileData = fileData;
      }
    }

    // Read PDF file data
    for (const pdfFile of transformResult.pdfFiles) {
      const fileData = readPdfFile(vaultPath, pdfFile.filePath);
      if (fileData) {
        pdfFile.fileData = fileData;
      }
    }

    // Read webpage file data
    for (const webpageFile of transformResult.webpageFiles) {
      const htmlContent = readWebpageFile(vaultPath, webpageFile.filePath);
      if (htmlContent) {
        webpageFile.htmlContent = htmlContent;
      }
    }

    return {
      document: transformResult.document,
      epubFiles: transformResult.epubFiles,
      pdfFiles: transformResult.pdfFiles,
      webpageFiles: transformResult.webpageFiles,
      errors: transformResult.errors
    };
  } catch (error) {
    console.error('Error getting migration document data:', error);
    return null;
  }
}
