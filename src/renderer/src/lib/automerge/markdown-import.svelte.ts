/**
 * Plain markdown directory import service
 *
 * Handles importing a directory of markdown files as a new vault.
 * - Root-level .md files → default type
 * - First-level subdirectories → create note types
 * - Nested files → inherit first-level directory's type
 */

import { createVault, createNoteType, createNote, switchVault } from './state.svelte';
import type { Vault } from './types';

// Default note type ID - same as in state.svelte.ts
const DEFAULT_NOTE_TYPE_ID = 'type-default';

export interface MarkdownImportProgress {
  phase: 'scanning' | 'creating-types' | 'importing-notes' | 'complete' | 'error';
  message: string;
  current: number;
  total: number;
}

export interface MarkdownImportError {
  file: string;
  message: string;
}

export interface MarkdownImportResult {
  success: boolean;
  vault?: Vault;
  stats?: {
    noteTypes: number;
    notes: number;
  };
  errors: MarkdownImportError[];
}

// --- Reactive state for import progress ---

let importProgress = $state<MarkdownImportProgress | null>(null);
let isImporting = $state(false);

export function getImportProgress(): MarkdownImportProgress | null {
  return importProgress;
}

export function getIsImporting(): boolean {
  return isImporting;
}

export function resetImportState(): void {
  importProgress = null;
  isImporting = false;
}

// --- IPC helpers ---

function getMarkdownImportAPI(): typeof window.api.markdownImport | undefined {
  return (window as { api?: { markdownImport?: typeof window.api.markdownImport } }).api
    ?.markdownImport;
}

/**
 * Import a markdown directory as a new vault
 *
 * @param dirPath - Full path to the directory to import
 * @param vaultName - Name for the new vault
 * @returns Import result with success status, vault, stats, and any errors
 */
export async function importMarkdownDirectory(
  dirPath: string,
  vaultName: string
): Promise<MarkdownImportResult> {
  const api = getMarkdownImportAPI();
  if (!api) {
    console.error('[markdown-import-renderer] API not available');
    return {
      success: false,
      errors: [{ file: '', message: 'Markdown import API not available' }]
    };
  }

  isImporting = true;
  importProgress = {
    phase: 'scanning',
    message: 'Scanning directory for markdown files...',
    current: 0,
    total: 3
  };

  const errors: MarkdownImportError[] = [];

  try {
    // Phase 1: Get import data from main process
    const importData = await api.getMarkdownImportData({ dirPath });

    if (!importData) {
      return {
        success: false,
        errors: [{ file: '', message: 'No markdown files found in directory' }]
      };
    }

    // Phase 2: Create the vault
    importProgress = {
      phase: 'creating-types',
      message: 'Creating vault and note types...',
      current: 1,
      total: 3
    };

    const vault = createVault(vaultName);

    // Switch to the new vault to initialize the doc handle so we can create notes
    await switchVault(vault.id);

    // Phase 3: Create note types for categories
    const categoryToTypeId: Record<string, string> = {};

    for (const category of importData.directory.categories) {
      try {
        const typeId = createNoteType({
          name: category,
          purpose: `Notes imported from ${category} folder`,
          icon: '📁'
        });
        categoryToTypeId[category] = typeId;
      } catch (error) {
        errors.push({
          file: category,
          message: `Failed to create note type: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }

    // Phase 4: Create notes from markdown files
    importProgress = {
      phase: 'importing-notes',
      message: `Importing ${importData.files.length} notes...`,
      current: 2,
      total: 3
    };

    let importedNotes = 0;

    for (let i = 0; i < importData.files.length; i++) {
      const file = importData.files[i];

      // Update progress
      importProgress = {
        phase: 'importing-notes',
        message: `Importing note ${i + 1} of ${importData.files.length}...`,
        current: 2,
        total: 3
      };

      try {
        // Determine the note type
        const typeId = file.categoryName
          ? categoryToTypeId[file.categoryName] || DEFAULT_NOTE_TYPE_ID
          : DEFAULT_NOTE_TYPE_ID;

        // Create the note
        await createNote({
          title: file.title,
          content: file.content,
          type: typeId
        });

        importedNotes++;
      } catch (error) {
        errors.push({
          file: file.relativePath,
          message: `Failed to create note: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }

    // Phase 5: Complete
    importProgress = {
      phase: 'complete',
      message: 'Import complete!',
      current: 3,
      total: 3
    };

    return {
      success: true,
      vault,
      stats: {
        noteTypes: Object.keys(categoryToTypeId).length,
        notes: importedNotes
      },
      errors
    };
  } catch (error) {
    importProgress = {
      phase: 'error',
      message: error instanceof Error ? error.message : 'Import failed',
      current: 0,
      total: 0
    };

    return {
      success: false,
      errors: [
        {
          file: '',
          message: error instanceof Error ? error.message : 'Import failed'
        }
      ]
    };
  } finally {
    isImporting = false;
  }
}
