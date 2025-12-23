/**
 * Read-only SQLite reader for legacy vault migration
 *
 * This module provides read-only access to legacy SQLite databases.
 * It never modifies the source database.
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import type {
  LegacyVaultData,
  LegacyNoteRow,
  LegacyMetadataRow,
  LegacyNoteTypeRow,
  LegacyUIStateRow,
  LegacyReviewItemRow,
  LegacyWorkflowRow,
  LegacySupplementaryMaterialRow,
  LegacyWorkflowCompletionRow
} from './types';

interface ReadOnlyConnection {
  get: <T = unknown>(
    sql: string,
    params?: (string | number | boolean | null)[]
  ) => Promise<T | undefined>;
  all: <T = unknown>(
    sql: string,
    params?: (string | number | boolean | null)[]
  ) => Promise<T[]>;
  close: () => Promise<void>;
}

/**
 * Open a database in read-only mode
 */
function openReadOnly(dbPath: string): Promise<ReadOnlyConnection> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(new Error(`Failed to open database: ${err.message}`));
        return;
      }

      const connection: ReadOnlyConnection = {
        get: <T = unknown>(
          sql: string,
          params?: (string | number | boolean | null)[]
        ) => {
          return new Promise<T | undefined>((resolve, reject) => {
            if (params && params.length > 0) {
              db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row as T | undefined);
              });
            } else {
              db.get(sql, (err, row) => {
                if (err) reject(err);
                else resolve(row as T | undefined);
              });
            }
          });
        },
        all: <T = unknown>(
          sql: string,
          params?: (string | number | boolean | null)[]
        ) => {
          return new Promise<T[]>((resolve, reject) => {
            if (params && params.length > 0) {
              db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows as T[]);
              });
            } else {
              db.all(sql, (err, rows) => {
                if (err) reject(err);
                else resolve(rows as T[]);
              });
            }
          });
        },
        close: () => {
          return new Promise<void>((resolve, reject) => {
            db.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
      };

      resolve(connection);
    });
  });
}

/**
 * Get the path to the SQLite database for a vault
 */
export function getDatabasePath(vaultPath: string): string {
  return path.join(vaultPath, '.flint-note', 'search.db');
}

/**
 * Check if a legacy vault exists at the given path
 */
export function isLegacyVault(vaultPath: string): boolean {
  const dbPath = getDatabasePath(vaultPath);
  return fs.existsSync(dbPath);
}

/**
 * Get the modification time of the database
 */
export function getDatabaseModTime(vaultPath: string): string | null {
  const dbPath = getDatabasePath(vaultPath);
  try {
    const stats = fs.statSync(dbPath);
    return stats.mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * Get a quick count of notes in the database (without loading all data)
 */
export async function getNoteCounts(
  vaultPath: string
): Promise<{ total: number; epub: number }> {
  const dbPath = getDatabasePath(vaultPath);
  const conn = await openReadOnly(dbPath);

  try {
    const totalResult = await conn.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM notes'
    );
    const epubResult = await conn.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM notes WHERE flint_kind = 'epub'"
    );

    return {
      total: totalResult?.count ?? 0,
      epub: epubResult?.count ?? 0
    };
  } finally {
    await conn.close();
  }
}

/**
 * Extract the vault ID from the database
 */
export async function getVaultId(vaultPath: string): Promise<string | null> {
  const dbPath = getDatabasePath(vaultPath);
  const conn = await openReadOnly(dbPath);

  try {
    // Try to get vault_id from note_type_descriptions first
    const typeRow = await conn.get<{ vault_id: string }>(
      'SELECT vault_id FROM note_type_descriptions LIMIT 1'
    );
    if (typeRow?.vault_id) {
      return typeRow.vault_id;
    }

    // Fall back to ui_state
    const uiRow = await conn.get<{ vault_id: string }>(
      'SELECT vault_id FROM ui_state LIMIT 1'
    );
    return uiRow?.vault_id ?? null;
  } finally {
    await conn.close();
  }
}

/**
 * Check if workflows table exists in the database
 * (for backward compatibility with older vaults)
 */
async function hasWorkflowsTable(conn: ReadOnlyConnection): Promise<boolean> {
  try {
    const result = await conn.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='workflows'"
    );
    return result !== undefined;
  } catch {
    return false;
  }
}

/**
 * Get list of columns that exist in a table
 * (for backward compatibility with older schema versions)
 */
async function getTableColumns(
  conn: ReadOnlyConnection,
  tableName: string
): Promise<Set<string>> {
  try {
    // PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
    const columns = await conn.all<{ cid: number; name: string; type: string }>(
      `PRAGMA table_info(${tableName})`
    );
    console.log(`[Migration] PRAGMA table_info(${tableName}) returned:`, columns);
    return new Set(columns.map((c) => c.name));
  } catch (error) {
    console.error(`[Migration] Failed to get columns for ${tableName}:`, error);
    return new Set();
  }
}

/**
 * Extract all data from a legacy vault database
 *
 * This is the main extraction function that reads all tables.
 * The database is opened in read-only mode and never modified.
 */
export async function extractVaultData(
  vaultPath: string,
  onProgress?: (message: string, current: number, total: number) => void
): Promise<LegacyVaultData> {
  const dbPath = getDatabasePath(vaultPath);
  const conn = await openReadOnly(dbPath);

  try {
    // Get vault ID first
    const vaultId = await getVaultId(vaultPath);
    if (!vaultId) {
      throw new Error('Could not determine vault ID from database');
    }

    onProgress?.('Extracting note types...', 0, 7);

    // Check which columns exist in note_type_descriptions (for backward compatibility)
    const noteTypeColumns = await getTableColumns(conn, 'note_type_descriptions');
    console.log(
      '[Migration] note_type_descriptions columns:',
      Array.from(noteTypeColumns)
    );

    // Build dynamic column list - only include columns that exist
    // Core columns that should always exist
    const coreColumns = ['id', 'vault_id', 'type_name'];
    // Columns that may or may not exist depending on schema version
    const optionalColumns = [
      'purpose',
      'agent_instructions',
      'metadata_schema',
      'icon',
      'suggestions_config',
      'default_review_mode',
      'created_at',
      'updated_at',
      'editor_chips'
    ];

    // Filter to only columns that exist in the database
    const availableColumns =
      noteTypeColumns.size > 0
        ? [
            ...coreColumns.filter((col) => noteTypeColumns.has(col)),
            ...optionalColumns.filter((col) => noteTypeColumns.has(col))
          ]
        : // Fallback if PRAGMA failed - try with minimal columns
          coreColumns;

    console.log('[Migration] Using columns:', availableColumns);

    // Extract note types with available columns
    const noteTypes = await conn.all<LegacyNoteTypeRow>(
      `SELECT ${availableColumns.join(', ')}
       FROM note_type_descriptions
       WHERE vault_id = ?`,
      [vaultId]
    );

    console.log('[Migration] Extracted note types:', noteTypes.length);

    onProgress?.('Extracting notes...', 1, 7);

    // Extract notes
    const notes = await conn.all<LegacyNoteRow>(
      `SELECT id, title, content, type, flint_kind, filename, path,
              created, updated, size, content_hash, file_mtime, archived
       FROM notes`
    );

    onProgress?.('Extracting metadata...', 2, 7);

    // Extract all metadata
    const allMetadata = await conn.all<LegacyMetadataRow>(
      'SELECT note_id, key, value, value_type FROM note_metadata'
    );

    // Group metadata by note_id
    const metadata = new Map<string, LegacyMetadataRow[]>();
    for (const row of allMetadata) {
      const existing = metadata.get(row.note_id) || [];
      existing.push(row);
      metadata.set(row.note_id, existing);
    }

    onProgress?.('Extracting UI state...', 3, 7);

    // Extract UI state
    // Note: ui_state may use a different vault_id format (just folder name vs full path)
    // Try both the full vault_id and just the basename
    const vaultBasename = vaultId.split('/').pop() || vaultId;
    console.log(
      '[Migration] Looking for ui_state with vault_id:',
      vaultId,
      'or',
      vaultBasename
    );

    const uiState = await conn.all<LegacyUIStateRow>(
      `SELECT id, vault_id, state_key, state_value, schema_version, updated_at
       FROM ui_state
       WHERE vault_id = ? OR vault_id = ?`,
      [vaultId, vaultBasename]
    );
    console.log('[Migration] Matched ui_state rows:', uiState.length);

    onProgress?.('Extracting review items...', 4, 7);

    // Extract review items
    const reviewItems = await conn.all<LegacyReviewItemRow>(
      `SELECT id, note_id, vault_id, enabled, last_reviewed, next_review,
              review_count, review_history, next_session_number, current_interval,
              status, created_at, updated_at
       FROM review_items
       WHERE vault_id = ?`,
      [vaultId]
    );

    // Extract workflows (agent routines) if table exists
    let workflows: LegacyWorkflowRow[] = [];
    const workflowMaterials = new Map<string, LegacySupplementaryMaterialRow[]>();
    const workflowCompletions = new Map<string, LegacyWorkflowCompletionRow[]>();

    if (await hasWorkflowsTable(conn)) {
      onProgress?.('Extracting workflows...', 5, 7);

      // Extract workflows
      workflows = await conn.all<LegacyWorkflowRow>(
        `SELECT id, name, purpose, description, status, type, vault_id,
                recurring_spec, due_date, last_completed, created_at, updated_at
         FROM workflows
         WHERE vault_id = ?`,
        [vaultId]
      );

      onProgress?.('Extracting workflow materials...', 6, 7);

      // Extract supplementary materials for all workflows
      const allMaterials = await conn.all<LegacySupplementaryMaterialRow>(
        `SELECT wsm.id, wsm.workflow_id, wsm.material_type, wsm.content,
                wsm.note_id, wsm.metadata, wsm.position, wsm.created_at
         FROM workflow_supplementary_materials wsm
         INNER JOIN workflows w ON w.id = wsm.workflow_id
         WHERE w.vault_id = ?
         ORDER BY wsm.workflow_id, wsm.position`,
        [vaultId]
      );

      // Group materials by workflow_id
      for (const row of allMaterials) {
        const existing = workflowMaterials.get(row.workflow_id) || [];
        existing.push(row);
        workflowMaterials.set(row.workflow_id, existing);
      }

      // Extract completion history (limit to 20 most recent per workflow)
      const allCompletions = await conn.all<LegacyWorkflowCompletionRow>(
        `SELECT wch.id, wch.workflow_id, wch.completed_at, wch.conversation_id,
                wch.notes, wch.output_note_id, wch.metadata
         FROM workflow_completion_history wch
         INNER JOIN workflows w ON w.id = wch.workflow_id
         WHERE w.vault_id = ?
         ORDER BY wch.workflow_id, wch.completed_at DESC`,
        [vaultId]
      );

      // Group completions by workflow_id (limit to 20 most recent per workflow)
      for (const row of allCompletions) {
        const existing = workflowCompletions.get(row.workflow_id) || [];
        if (existing.length < 20) {
          existing.push(row);
        }
        workflowCompletions.set(row.workflow_id, existing);
      }
    }

    onProgress?.('Extraction complete', 7, 7);

    return {
      noteTypes,
      notes,
      metadata,
      uiState,
      reviewItems,
      vaultId,
      workflows,
      workflowMaterials,
      workflowCompletions
    };
  } finally {
    await conn.close();
  }
}

/**
 * Read an EPUB file from the vault
 *
 * @param vaultPath - The vault base path
 * @param relativePath - The relative path to the EPUB file (from the path column)
 * @returns The file contents as a Uint8Array, or null if not found
 */
export function readEpubFile(vaultPath: string, relativePath: string): Uint8Array | null {
  // The path in the database is relative to the vault root
  const fullPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(vaultPath, relativePath);

  try {
    const buffer = fs.readFileSync(fullPath);
    // Create a proper Uint8Array copy (not a view) for IPC serialization
    // Buffer.from creates a copy, then Uint8Array wraps it properly
    const uint8Array = new Uint8Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      uint8Array[i] = buffer[i];
    }
    return uint8Array;
  } catch (error) {
    console.error(`Failed to read EPUB file: ${fullPath}`, error);
    return null;
  }
}

/**
 * Read a PDF file from the vault
 *
 * @param vaultPath - The vault base path
 * @param relativePath - The relative path to the PDF file (from the flint_pdfPath metadata)
 * @returns The file contents as a Uint8Array, or null if not found
 */
export function readPdfFile(vaultPath: string, relativePath: string): Uint8Array | null {
  // The path in the database is relative to the vault root
  const fullPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(vaultPath, relativePath);

  try {
    const buffer = fs.readFileSync(fullPath);
    // Create a proper Uint8Array copy (not a view) for IPC serialization
    const uint8Array = new Uint8Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      uint8Array[i] = buffer[i];
    }
    return uint8Array;
  } catch (error) {
    console.error(`Failed to read PDF file: ${fullPath}`, error);
    return null;
  }
}

/**
 * Read a webpage HTML file from the vault
 *
 * @param vaultPath - The vault base path
 * @param relativePath - The relative path to the HTML file (from the flint_webpagePath metadata)
 * @returns The file contents as a string, or null if not found
 */
export function readWebpageFile(vaultPath: string, relativePath: string): string | null {
  // The path in the database is relative to the vault root
  const fullPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(vaultPath, relativePath);

  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch (error) {
    console.error(`Failed to read webpage file: ${fullPath}`, error);
    return null;
  }
}
