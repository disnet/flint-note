/**
 * Automerge vault import service
 *
 * Handles importing vaults from directories containing .automerge folders.
 * These are vaults that were previously synced to disk and can be reconnected.
 */

import { getVaults, saveVaults, getRepo, connectVaultSync } from './repo';
import { addVaultToState, switchVault } from './state.svelte';
import { generateVaultId, nowISO } from './utils';
import type { Vault } from './types';

/**
 * Information about a detected automerge vault (from main process)
 */
export interface AutomergeVaultInfo {
  path: string;
  name: string;
  docUrl: string;
  created: string;
  isValid: boolean;
  error?: string;
}

export interface AutomergeImportProgress {
  phase:
    | 'validating'
    | 'creating-vault'
    | 'loading-document'
    | 'connecting-sync'
    | 'syncing-files'
    | 'complete'
    | 'error';
  message: string;
}

export interface AutomergeImportResult {
  success: boolean;
  vault?: Vault;
  error?: string;
}

// --- Reactive state for import progress ---

let importProgress = $state<AutomergeImportProgress | null>(null);
let isImporting = $state(false);

export function getAutomergeImportProgress(): AutomergeImportProgress | null {
  return importProgress;
}

export function getIsAutomergeImporting(): boolean {
  return isImporting;
}

export function resetAutomergeImportState(): void {
  importProgress = null;
  isImporting = false;
}

// --- IPC helpers ---

function getAutomergeImportAPI(): typeof window.api.automergeImport | undefined {
  return (window as { api?: { automergeImport?: typeof window.api.automergeImport } }).api
    ?.automergeImport;
}

/**
 * Import an existing automerge vault from a directory
 *
 * @param dirPath - Full path to the directory containing .automerge
 * @param customName - Optional custom name for the vault (defaults to name from manifest)
 * @returns Import result with success status and vault
 */
export async function importAutomergeVault(
  dirPath: string,
  customName?: string
): Promise<AutomergeImportResult> {
  const api = getAutomergeImportAPI();
  if (!api) {
    console.error('[automerge-import-renderer] API not available');
    return {
      success: false,
      error: 'Automerge import API not available'
    };
  }

  isImporting = true;
  importProgress = {
    phase: 'validating',
    message: 'Validating vault...'
  };

  try {
    // Phase 1: Detect and validate the vault
    const vaultInfo = await api.detectAutomergeVault({ dirPath });

    if (!vaultInfo) {
      return {
        success: false,
        error: 'Directory does not contain a Flint vault'
      };
    }

    if (!vaultInfo.isValid) {
      return {
        success: false,
        error: vaultInfo.error || 'Invalid vault manifest'
      };
    }

    // Phase 2: Check if vault with same docUrl already exists
    importProgress = {
      phase: 'creating-vault',
      message: 'Checking for duplicates...'
    };

    const existingVaults = getVaults();
    const existingVault = existingVaults.find((v) => v.docUrl === vaultInfo.docUrl);
    if (existingVault) {
      // If the existing vault is archived, unarchive it instead of failing
      if (existingVault.archived) {
        importProgress = {
          phase: 'creating-vault',
          message: 'Restoring archived vault...'
        };

        // Unarchive the vault
        const updatedVaults = existingVaults.map((v) =>
          v.id === existingVault.id ? { ...v, archived: false } : v
        );
        saveVaults(updatedVaults);

        // Update state
        addVaultToState({ ...existingVault, archived: false });

        // Switch to the restored vault
        importProgress = {
          phase: 'loading-document',
          message: 'Loading vault document...'
        };

        await switchVault(existingVault.id);

        importProgress = {
          phase: 'complete',
          message: 'Vault restored!'
        };

        return {
          success: true,
          vault: { ...existingVault, archived: false }
        };
      }

      return {
        success: false,
        error: `This vault is already imported as "${existingVault.name}"`
      };
    }

    // Phase 3: Create vault entry
    importProgress = {
      phase: 'creating-vault',
      message: 'Creating vault entry...'
    };

    const vault: Vault = {
      id: generateVaultId(),
      name: customName || vaultInfo.name,
      docUrl: vaultInfo.docUrl,
      baseDirectory: dirPath,
      archived: false,
      created: nowISO()
    };

    // Save vault to localStorage
    const vaults = getVaults();
    vaults.push(vault);
    saveVaults(vaults);

    // Add to state
    addVaultToState(vault);

    // Phase 4: Connect file sync FIRST
    // This establishes the connection to the main process repo which has the document data
    importProgress = {
      phase: 'connecting-sync',
      message: 'Connecting to vault storage...'
    };

    const repo = getRepo();
    await connectVaultSync(repo, vault);

    // Phase 5: Now switch to the vault (document should sync from main process)
    importProgress = {
      phase: 'loading-document',
      message: 'Loading vault document...'
    };

    const handle = await switchVault(vault.id);

    if (!handle) {
      // Rollback: remove vault from storage
      const updatedVaults = getVaults().filter((v) => v.id !== vault.id);
      saveVaults(updatedVaults);
      return {
        success: false,
        error: 'Failed to load vault document'
      };
    }

    // Phase 6: Import files from filesystem to OPFS
    // Since this vault has a baseDirectory, sync existing files
    importProgress = {
      phase: 'syncing-files',
      message: 'Importing files...'
    };

    try {
      const { performReverseFileSync, setupFileSyncListener } =
        await import('./file-sync.svelte');

      // Import files from filesystem to OPFS
      await performReverseFileSync();

      // Set up listener for future file changes
      setupFileSyncListener();
    } catch (error) {
      console.error('[automerge-import] File sync failed:', error);
      // Non-fatal - vault imported successfully, files can be synced later
    }

    // Phase 7: Complete
    importProgress = {
      phase: 'complete',
      message: 'Import complete!'
    };

    console.log(`[automerge-import-renderer] Successfully imported vault: ${vault.name}`);

    return {
      success: true,
      vault
    };
  } catch (error) {
    importProgress = {
      phase: 'error',
      message: error instanceof Error ? error.message : 'Import failed'
    };

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Import failed'
    };
  } finally {
    isImporting = false;
  }
}
