/**
 * Legacy vault migration service for the renderer
 *
 * This module orchestrates the migration of SQLite-based vaults to Automerge.
 * It handles:
 * - Communication with the main process for data extraction
 * - EPUB file storage in OPFS
 * - Automerge document creation
 * - Vault metadata management
 */

import type { Repo } from '@automerge/automerge-repo';
import type { NotesDocument, Vault, Note, NoteType, Workspace } from './types';
import { generateVaultId, nowISO } from './utils';
import { getRepo, saveVaults, getVaults, setActiveVaultId } from './repo';
import { opfsStorage } from './opfs-storage.svelte';

// Types from the main process migration module
export interface LegacyVaultInfo {
  path: string;
  name: string;
  noteCount: number;
  epubCount: number;
  lastModified: string;
  hasExistingMigration: boolean;
  syncDirectoryName: string;
}

interface MigrationProgress {
  phase: 'detecting' | 'extracting' | 'transforming' | 'writing' | 'complete' | 'error';
  message: string;
  current: number;
  total: number;
  details?: {
    noteTypes?: number;
    notes?: number;
    workspaces?: number;
    reviewItems?: number;
    epubs?: number;
  };
}

interface MigrationError {
  entity: 'note' | 'noteType' | 'workspace' | 'reviewItem' | 'epub';
  entityId: string;
  message: string;
}

interface EpubFileData {
  noteId: string;
  fileData: Uint8Array;
  filePath: string;
  metadata: {
    title?: string;
    author?: string;
  };
  readingState?: {
    currentCfi?: string;
    progress?: number;
  };
}

// Document data structure from main process
interface MigrationDocumentData {
  notes: Record<string, Note>;
  workspaces: Record<string, Workspace>;
  activeWorkspaceId: string;
  noteTypes: Record<string, NoteType>;
  workspaceOrder?: string[];
}

interface MigrationStats {
  noteTypes: number;
  notes: number;
  epubs: number;
  workspaces: number;
  reviewItems: number;
  skipped: number;
}

export interface MigrationResult {
  success: boolean;
  vault?: Vault;
  stats?: MigrationStats;
  errors: MigrationError[];
}

// --- Reactive state for migration progress ---

let migrationProgress = $state<MigrationProgress | null>(null);
let isMigrating = $state(false);

export function getMigrationProgress(): MigrationProgress | null {
  return migrationProgress;
}

export function getIsMigrating(): boolean {
  return isMigrating;
}

// --- IPC helpers ---

function getLegacyMigrationAPI(): typeof window.api.legacyMigration | undefined {
  return (window as { api?: { legacyMigration?: typeof window.api.legacyMigration } }).api
    ?.legacyMigration;
}

/**
 * Get existing vaults for migration detection
 */
function getExistingVaultsForMigration(): Array<{ baseDirectory?: string }> {
  return getVaults().map((v) => ({ baseDirectory: v.baseDirectory }));
}

/**
 * Detect legacy vaults in common locations
 */
export async function detectLegacyVaults(): Promise<LegacyVaultInfo[]> {
  const api = getLegacyMigrationAPI();
  if (!api) {
    console.warn('[Migration] Legacy migration API not available');
    return [];
  }

  try {
    return await api.detectLegacyVaults({
      existingVaults: getExistingVaultsForMigration()
    });
  } catch (error) {
    console.error('[Migration] Failed to detect legacy vaults:', error);
    return [];
  }
}

/**
 * Detect a legacy vault at a specific path
 */
export async function detectLegacyVaultAtPath(
  vaultPath: string
): Promise<LegacyVaultInfo | null> {
  const api = getLegacyMigrationAPI();
  if (!api) {
    console.warn('[Migration] Legacy migration API not available');
    return null;
  }

  try {
    return await api.detectLegacyVaultAtPath({
      vaultPath,
      existingVaults: getExistingVaultsForMigration()
    });
  } catch (error) {
    console.error('[Migration] Failed to detect vault at path:', error);
    return null;
  }
}

/**
 * Browse for a vault directory
 */
export async function browseForVault(): Promise<string | null> {
  const api = getLegacyMigrationAPI();
  if (!api) {
    return null;
  }

  try {
    return await api.browseForVault();
  } catch (error) {
    console.error('[Migration] Failed to browse for vault:', error);
    return null;
  }
}

/**
 * Store an EPUB file in OPFS and return the hash
 */
async function storeEpubInOPFS(fileData: Uint8Array): Promise<string> {
  // Create a new ArrayBuffer from the Uint8Array to avoid SharedArrayBuffer issues
  const arrayBuffer = new ArrayBuffer(fileData.byteLength);
  new Uint8Array(arrayBuffer).set(fileData);
  return await opfsStorage.store(arrayBuffer);
}

/**
 * Update EPUB note props with the stored hash
 */
function updateEpubNoteProps(
  document: MigrationDocumentData,
  noteId: string,
  epubHash: string,
  metadata: EpubFileData['metadata'],
  readingState?: EpubFileData['readingState']
): void {
  const note = document.notes[noteId];
  if (!note) return;

  // Update note props with EPUB-specific data
  note.props = {
    ...note.props,
    epubHash,
    epubTitle: metadata.title,
    epubAuthor: metadata.author
  };

  // Preserve reading state if available
  if (readingState?.currentCfi) {
    note.props.currentCfi = readingState.currentCfi;
  }
  if (readingState?.progress !== undefined) {
    note.props.progress = readingState.progress;
  }
}

/**
 * Create an Automerge document from the migrated data
 */
function createMigratedDocument(
  repo: Repo,
  documentData: MigrationDocumentData
): { docUrl: string } {
  const handle = repo.create<NotesDocument>();

  handle.change((doc) => {
    // Copy all migrated data
    doc.notes = documentData.notes;
    doc.workspaces = documentData.workspaces;
    doc.activeWorkspaceId = documentData.activeWorkspaceId;
    doc.noteTypes = documentData.noteTypes;

    if (documentData.workspaceOrder) {
      doc.workspaceOrder = documentData.workspaceOrder;
    }
  });

  return { docUrl: handle.url };
}

/**
 * Create a vault entry from migration result
 */
function createVaultFromMigration(
  vaultId: string,
  name: string,
  docUrl: string,
  baseDirectory: string
): Vault {
  return {
    id: vaultId,
    name,
    docUrl,
    baseDirectory,
    archived: false,
    created: nowISO()
  };
}

/**
 * Convert API progress phase to typed phase
 */
function toMigrationPhase(phase: string): MigrationProgress['phase'] {
  const validPhases = [
    'detecting',
    'extracting',
    'transforming',
    'writing',
    'complete',
    'error'
  ];
  if (validPhases.includes(phase)) {
    return phase as MigrationProgress['phase'];
  }
  return 'transforming'; // Default fallback
}

/**
 * Convert API error to typed error
 */
function toMigrationError(error: {
  entity: string;
  entityId: string;
  message: string;
}): MigrationError {
  const validEntities = ['note', 'noteType', 'workspace', 'reviewItem', 'epub'];
  const entity = validEntities.includes(error.entity)
    ? (error.entity as MigrationError['entity'])
    : 'note';
  return {
    entity,
    entityId: error.entityId,
    message: error.message
  };
}

/**
 * Main migration function
 *
 * Orchestrates the full migration:
 * 1. Get document data from main process (SQLite extraction + transformation)
 * 2. Store EPUB files in OPFS
 * 3. Create Automerge document
 * 4. Create vault entry
 * 5. Save and activate the new vault
 */
export async function migrateLegacyVault(
  vaultPath: string,
  vaultName: string,
  _syncDirectoryName?: string
): Promise<MigrationResult> {
  const api = getLegacyMigrationAPI();
  if (!api) {
    return {
      success: false,
      errors: [
        { entity: 'note', entityId: 'migration', message: 'Migration API not available' }
      ]
    };
  }

  isMigrating = true;
  migrationProgress = {
    phase: 'detecting',
    message: 'Starting migration...',
    current: 0,
    total: 5
  };

  const errors: MigrationError[] = [];

  try {
    // Set up progress listener
    api.onMigrationProgress((progress) => {
      migrationProgress = {
        phase: toMigrationPhase(progress.phase),
        message: progress.message,
        current: progress.current,
        total: progress.total,
        details: progress.details
      };
    });

    // Phase 1: Extract and transform data in main process
    migrationProgress = {
      phase: 'extracting',
      message: 'Extracting data from legacy vault...',
      current: 1,
      total: 5
    };

    const mainResult = await api.getMigrationDocumentData({ vaultPath });

    if (!mainResult) {
      return {
        success: false,
        errors: [
          {
            entity: 'note',
            entityId: 'migration',
            message: 'Failed to extract vault data'
          }
        ]
      };
    }

    // Cast the unknown document to our typed structure
    const documentData = mainResult.document as MigrationDocumentData;
    const epubFiles = mainResult.epubFiles;
    const transformErrors = mainResult.errors.map(toMigrationError);
    errors.push(...transformErrors);

    // Phase 2: Store EPUB files in OPFS
    if (epubFiles.length > 0) {
      migrationProgress = {
        phase: 'transforming',
        message: `Storing ${epubFiles.length} EPUB files...`,
        current: 2,
        total: 5,
        details: { epubs: epubFiles.length }
      };

      for (let i = 0; i < epubFiles.length; i++) {
        const epubFile = epubFiles[i];

        // Update progress for each EPUB
        migrationProgress = {
          phase: 'transforming',
          message: `Storing EPUB ${i + 1} of ${epubFiles.length}...`,
          current: 2,
          total: 5,
          details: { epubs: epubFiles.length }
        };

        try {
          // Skip if no file data (file couldn't be read)
          if (!epubFile.fileData || epubFile.fileData.length === 0) {
            errors.push({
              entity: 'epub',
              entityId: epubFile.noteId,
              message: `EPUB file data is empty: ${epubFile.filePath}`
            });
            continue;
          }

          const epubHash = await storeEpubInOPFS(epubFile.fileData);
          updateEpubNoteProps(
            documentData,
            epubFile.noteId,
            epubHash,
            epubFile.metadata,
            epubFile.readingState
          );
        } catch (error) {
          errors.push({
            entity: 'epub',
            entityId: epubFile.noteId,
            message: `Failed to store EPUB: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }
    }

    // Phase 3: Create Automerge document
    migrationProgress = {
      phase: 'writing',
      message: 'Creating Automerge document...',
      current: 3,
      total: 5
    };

    const repo = getRepo();
    const { docUrl } = createMigratedDocument(repo, documentData);

    // Phase 4: Create and save vault
    migrationProgress = {
      phase: 'writing',
      message: 'Saving vault...',
      current: 4,
      total: 5
    };

    const vaultId = generateVaultId();
    const vault = createVaultFromMigration(vaultId, vaultName, docUrl, vaultPath);

    // Save to localStorage
    const vaults = getVaults();
    vaults.push(vault);
    saveVaults(vaults);

    // Set as active vault
    setActiveVaultId(vaultId);

    // Phase 5: Complete
    migrationProgress = {
      phase: 'complete',
      message: 'Migration complete!',
      current: 5,
      total: 5,
      details: {
        noteTypes: Object.keys(documentData.noteTypes).length,
        notes: Object.keys(documentData.notes).length,
        workspaces: Object.keys(documentData.workspaces).length,
        epubs: epubFiles.length
      }
    };

    return {
      success: true,
      vault,
      stats: {
        noteTypes: Object.keys(documentData.noteTypes).length,
        notes: Object.keys(documentData.notes).length,
        epubs: epubFiles.length,
        workspaces: Object.keys(documentData.workspaces).length,
        reviewItems: 0, // Not tracked separately in renderer
        skipped: 0
      },
      errors
    };
  } catch (error) {
    migrationProgress = {
      phase: 'error',
      message: `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
      current: 0,
      total: 0
    };

    return {
      success: false,
      errors: [
        {
          entity: 'note',
          entityId: 'migration',
          message: error instanceof Error ? error.message : String(error)
        },
        ...errors
      ]
    };
  } finally {
    isMigrating = false;

    // Clean up progress listener
    try {
      api?.removeMigrationListeners();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Reset migration state (for cleanup after modal closes)
 */
export function resetMigrationState(): void {
  migrationProgress = null;
  isMigrating = false;
}

/**
 * Check if a path already has an Automerge vault
 */
export function hasExistingVault(vaultPath: string): boolean {
  const vaults = getVaults();
  return vaults.some((v) => v.baseDirectory === vaultPath && !v.archived);
}
