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
  LegacyReviewItemRow
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

    onProgress?.('Extracting note types...', 0, 5);

    // Extract note types
    const noteTypes = await conn.all<LegacyNoteTypeRow>(
      `SELECT id, vault_id, type_name, purpose, agent_instructions,
              metadata_schema, icon, suggestions_config, default_review_mode,
              editor_chips, created_at, updated_at
       FROM note_type_descriptions
       WHERE vault_id = ?`,
      [vaultId]
    );

    onProgress?.('Extracting notes...', 1, 5);

    // Extract notes
    const notes = await conn.all<LegacyNoteRow>(
      `SELECT id, title, content, type, flint_kind, filename, path,
              created, updated, size, content_hash, file_mtime, archived
       FROM notes`
    );

    onProgress?.('Extracting metadata...', 2, 5);

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

    onProgress?.('Extracting UI state...', 3, 5);

    // Extract UI state
    const uiState = await conn.all<LegacyUIStateRow>(
      `SELECT id, vault_id, state_key, state_value, schema_version, updated_at
       FROM ui_state
       WHERE vault_id = ?`,
      [vaultId]
    );

    onProgress?.('Extracting review items...', 4, 5);

    // Extract review items
    const reviewItems = await conn.all<LegacyReviewItemRow>(
      `SELECT id, note_id, vault_id, enabled, last_reviewed, next_review,
              review_count, review_history, next_session_number, current_interval,
              status, created_at, updated_at
       FROM review_items
       WHERE vault_id = ?`,
      [vaultId]
    );

    onProgress?.('Extraction complete', 5, 5);

    return {
      noteTypes,
      notes,
      metadata,
      uiState,
      reviewItems,
      vaultId
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
    return new Uint8Array(buffer);
  } catch (error) {
    console.error(`Failed to read EPUB file: ${fullPath}`, error);
    return null;
  }
}
