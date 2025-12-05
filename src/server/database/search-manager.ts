import { DatabaseManager, serializeMetadataValue } from './schema.js';
import type { DatabaseConnection, NoteRow, SearchRow } from './schema.js';
import type { NoteMetadata, WikiLink } from '../types/index.js';
import type { FileWriteQueue } from '../core/notes.js';
import fs from 'fs/promises';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import { parseNoteContent as parseNoteContentProper } from '../utils/yaml-parser.js';
import { toRelativePath } from '../utils/path-utils.js';
import { LEGACY_TO_FLINT } from '../core/system-fields.js';
import { logger } from '../../main/logger.js';

/**
 * Helper to handle index rebuilding with progress reporting
 * @param hybridSearchManager - Search manager instance
 * @param forceRebuild - Whether to force rebuild
 * @param logCallback - Optional logging function
 */
export async function handleIndexRebuild(
  hybridSearchManager: {
    getStats(): Promise<{ noteCount: number }>;
    rebuildIndex(callback: (processed: number, total: number) => void): Promise<void>;
    syncFileSystemChanges(
      callback: (processed: number, total: number) => void
    ): Promise<{ added: number; updated: number; deleted: number }>;
  },
  forceRebuild: boolean = false,
  logCallback?: (message: string, isError?: boolean) => void
): Promise<void> {
  // Skip search index initialization during tests
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return;
  }

  const log =
    logCallback ||
    ((message: string, isError?: boolean) => {
      if (isError) {
        console.error(message);
      } else {
        console.error(message); // Using console.error for all server logs as per existing pattern
      }
    });

  try {
    const stats = await hybridSearchManager.getStats();
    const isEmptyIndex = stats.noteCount === 0;
    const shouldRebuild = forceRebuild || isEmptyIndex;

    if (shouldRebuild) {
      log('Rebuilding hybrid search index on startup...');
      await hybridSearchManager.rebuildIndex((processed: number, total: number) => {
        if (processed % 5 === 0 || processed === total) {
          log(`Hybrid search index: ${processed}/${total} notes processed`);
        }
      });
      log('Hybrid search index rebuilt successfully');
    } else {
      log(`Hybrid search index ready (${stats.noteCount} notes indexed)`);
      log('Starting filesystem sync (checking for new/updated/deleted files)...');
      // Sync filesystem changes (new, updated, or deleted files)
      const result = await hybridSearchManager.syncFileSystemChanges(
        (processed: number, total: number) => {
          if (processed % 5 === 0 || processed === total) {
            log(`Syncing filesystem changes: ${processed}/${total} processed`);
          }
        }
      );
      const totalChanges = result.added + result.updated + result.deleted;
      if (totalChanges > 0) {
        const parts: string[] = [];
        if (result.added > 0) parts.push(`${result.added} added`);
        if (result.updated > 0) parts.push(`${result.updated} updated`);
        if (result.deleted > 0) parts.push(`${result.deleted} deleted`);
        log(`Synced filesystem changes: ${parts.join(', ')}`);
      } else {
        log('Filesystem sync completed (no changes detected)');
      }
    }
    log('Index initialization complete - ready for note operations');
  } catch (error) {
    log(`Warning: Failed to initialize hybrid search index on startup: ${error}`, true);
  }
}

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  // Allow additional properties for aggregation results
  [key: string]: unknown;
}

export interface AdvancedSearchOptions {
  type?: string;
  metadata_filters?: Array<{
    key: string;
    value: string | string[];
    operator?:
      | '='
      | '!='
      | '>'
      | '<'
      | '>='
      | '<='
      | 'LIKE'
      | 'IN'
      | 'NOT IN'
      | 'BETWEEN';
  }>;
  updated_within?: string; // e.g., '7d', '1w', '2m'
  updated_before?: string;
  created_within?: string;
  created_before?: string;
  content_contains?: string;
  // Hierarchy-specific filters
  parent_of?: string; // Find notes that are parents of the specified note
  child_of?: string; // Find notes that are children of the specified note
  descendants_of?: string; // Find all descendants of the specified note
  ancestors_of?: string; // Find all ancestors of the specified note
  max_depth?: number; // Maximum hierarchy depth for descendants search
  has_children?: boolean; // Find notes that have or don't have children
  has_parents?: boolean; // Find notes that have or don't have parents
  sort?: Array<{
    field: 'title' | 'type' | 'created' | 'updated' | 'size';
    order: 'asc' | 'desc';
  }>;
  limit?: number;
  offset?: number;
}

export interface SqlSearchOptions {
  query: string;
  params?: (string | number | boolean | null)[];
  limit?: number;
  timeout?: number;
}

export interface SearchResponse {
  [key: string]: unknown;
  results: SearchResult[];
  total: number;
  has_more: boolean;
  query_time_ms?: number;
}

// Dataview query types
export interface DataviewQueryOptions {
  type?: string | string[];
  type_operator?: '=' | '!=' | 'IN';
  metadata_filters?: Array<{
    key: string;
    value: string | string[];
    operator?:
      | '='
      | '!='
      | '>'
      | '<'
      | '>='
      | '<='
      | 'LIKE'
      | 'IN'
      | 'NOT IN'
      | 'BETWEEN';
  }>;
  sort?: Array<{
    field: string;
    order: 'asc' | 'desc';
  }>;
  limit?: number;
  offset?: number;
}

export interface DataviewNote {
  id: string;
  title: string;
  type: string;
  created: string;
  updated: string;
  metadata: Record<string, unknown>;
}

export interface DataviewQueryResponse {
  results: DataviewNote[];
  total: number;
  has_more: boolean;
  query_time_ms: number;
}

export class HybridSearchManager {
  private dbManager: DatabaseManager;
  private workspacePath: string;
  private connection: DatabaseConnection | null = null;
  private readOnlyConnection: DatabaseConnection | null = null;
  private isInitialized = false;
  private fileWriteQueue: FileWriteQueue | null = null;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.dbManager = new DatabaseManager(workspacePath);
  }

  /**
   * Set the file write queue reference (called after initialization to resolve circular dependency)
   * This allows the search manager to use the shared write queue from NoteManager,
   * ensuring all file writes are properly debounced and tracked.
   */
  setFileWriteQueue(fileWriteQueue: FileWriteQueue): void {
    this.fileWriteQueue = fileWriteQueue;
  }

  /**
   * Write a file with file watcher tracking to prevent false external edit detection.
   * Uses the shared FileWriteQueue from NoteManager to ensure all writes are properly
   * debounced and tracked, eliminating race conditions between normalization writes
   * and user edits.
   *
   * IMPORTANT: Always use this method instead of fs.writeFile for markdown files
   */
  private async writeFileWithTracking(filePath: string, content: string): Promise<void> {
    // Use the shared file write queue if available (preferred approach)
    if (this.fileWriteQueue) {
      await this.fileWriteQueue.queueWrite(filePath, content);
      return;
    }

    // Fallback to immediate write (legacy behavior)
    // This path should rarely be hit after proper initialization
    logger.warn(
      '[HybridSearchManager] FileWriteQueue not set, falling back to immediate write. ' +
        'This may cause race conditions with external edit detection.'
    );

    await fs.writeFile(filePath, content, 'utf-8');
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      this.connection = await this.dbManager.connect();
      this.isInitialized = true;
    }
  }

  private async getConnection(): Promise<DatabaseConnection> {
    await this.ensureInitialized();
    if (!this.connection) {
      throw new Error('Database connection not available');
    }
    return this.connection;
  }

  /**
   * Get database connection for external use (e.g., link management)
   */
  async getDatabaseConnection(): Promise<DatabaseConnection> {
    return await this.getConnection();
  }

  /**
   * Get database manager for migrations and other database operations
   */
  getDatabaseManager(): DatabaseManager {
    return this.dbManager;
  }

  private async getReadOnlyConnection(): Promise<DatabaseConnection> {
    if (!this.readOnlyConnection) {
      this.readOnlyConnection = await this.dbManager.connectReadOnly();
    }
    return this.readOnlyConnection;
  }

  // Simple text search with pagination info
  async searchNotes(
    query: string | undefined,
    typeFilter: string | null = null,
    limit: number = 10,
    useRegex: boolean = false,
    offset: number = 0
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const connection = await this.getReadOnlyConnection();

    try {
      const safeQuery = (query ?? '').trim();
      let sql: string;
      let countSql: string;
      let params: (string | number)[] = [];

      if (!safeQuery) {
        // Return all notes
        sql = `
          SELECT n.*,
                 1.0 as score
          FROM notes n
          ${typeFilter ? 'WHERE n.type = ?' : ''}
          ORDER BY n.updated DESC
          LIMIT ? OFFSET ?
        `;
        countSql = `SELECT COUNT(*) as total FROM notes n ${typeFilter ? 'WHERE n.type = ?' : ''}`;
        params = typeFilter ? [typeFilter, limit, offset] : [limit, offset];
      } else if (useRegex) {
        // For regex search, fetch all notes and filter in JavaScript
        sql = `
          SELECT n.*,
                 1.0 as score
          FROM notes n
          ${typeFilter ? 'WHERE n.type = ?' : ''}
          ORDER BY n.updated DESC
        `;
        params = typeFilter ? [typeFilter] : [];

        const allRows = await connection.all<SearchRow>(sql, params);
        const filteredRows: SearchRow[] = [];

        try {
          const regex = new RegExp(safeQuery, 'i');
          for (const row of allRows) {
            if (regex.test(row.title || '') || regex.test(row.content || '')) {
              filteredRows.push(row);
            }
          }
        } catch {
          throw new Error(`Invalid regex pattern: ${safeQuery}`);
        }

        // Apply offset and limit to filtered results
        const total = filteredRows.length;
        const paginatedRows = filteredRows.slice(offset, offset + limit);
        const results = await this.convertRowsToResults(paginatedRows);
        const queryTime = Date.now() - startTime;

        return {
          results,
          total,
          has_more: offset + results.length < total,
          query_time_ms: queryTime
        };
      } else {
        // Use FTS for text search with proper escaping
        const escapedQuery = this.escapeFTSQuery(safeQuery);
        if (!escapedQuery) {
          // If query can't be escaped for FTS, fall back to LIKE search
          sql = `
            SELECT n.*,
                   1.0 as score
            FROM notes n
            WHERE (n.title LIKE ? OR n.content LIKE ?)${typeFilter ? ' AND n.type = ?' : ''}
            ORDER BY n.updated DESC
            LIMIT ? OFFSET ?
          `;
          countSql = `
            SELECT COUNT(*) as total
            FROM notes n
            WHERE (n.title LIKE ? OR n.content LIKE ?)${typeFilter ? ' AND n.type = ?' : ''}
          `;
          const likeQuery = `%${safeQuery}%`;
          params = typeFilter
            ? [likeQuery, likeQuery, typeFilter, limit, offset]
            : [likeQuery, likeQuery, limit, offset];
        } else {
          sql = `
            SELECT n.*,
                   -fts.rank as score,
                   snippet(notes_fts, 2, '<mark>', '</mark>', '...', 32) as snippet
            FROM notes_fts fts
            JOIN notes n ON n.id = fts.id
            WHERE notes_fts MATCH ?${typeFilter ? ' AND n.type = ?' : ''}
            ORDER BY fts.rank
            LIMIT ? OFFSET ?
          `;
          countSql = `
            SELECT COUNT(*) as total
            FROM notes_fts fts
            JOIN notes n ON n.id = fts.id
            WHERE notes_fts MATCH ?${typeFilter ? ' AND n.type = ?' : ''}
          `;
          params = typeFilter
            ? [escapedQuery, typeFilter, limit, offset]
            : [escapedQuery, limit, offset];
        }
      }

      // Execute count query (remove limit and offset from params for count)
      const countParams = params.slice(0, -2); // Remove the limit and offset parameters
      const countResult = await connection.get<{ total: number }>(countSql, countParams);
      const total = countResult?.total || 0;

      // Execute main query
      const rows = await connection.all<SearchRow>(sql, params);
      const results = await this.convertRowsToResults(rows);

      const queryTime = Date.now() - startTime;

      return {
        results,
        total,
        has_more: offset + results.length < total,
        query_time_ms: queryTime
      };
    } catch (error) {
      throw new Error(
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Escape query string for FTS5 MATCH operator
   * Wraps the query in double quotes to treat it as a literal string,
   * escaping any internal double quotes by doubling them (SQL-style).
   * Returns null if query is empty or invalid.
   */
  private escapeFTSQuery(query: string): string | null {
    if (!query || typeof query !== 'string') {
      return null;
    }

    // Remove leading/trailing whitespace
    const trimmed = query.trim();
    if (!trimmed) {
      return null;
    }

    // Escape internal double quotes by doubling them (SQL-style escaping)
    const escapedQuery = trimmed.replace(/"/g, '""');

    // Wrap in double quotes to treat as literal string
    // This makes the query safe from FTS5 syntax interpretation
    return `"${escapedQuery}"`;
  }

  async searchNotesAdvanced(options: AdvancedSearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();
    const connection = await this.getReadOnlyConnection();

    try {
      const limit = options.limit ?? 50;
      const offset = options.offset ?? 0;

      const sql = 'SELECT DISTINCT n.*';
      const countSql = 'SELECT COUNT(DISTINCT n.id) as total';
      let fromClause = ' FROM notes n';
      const whereConditions: string[] = [];
      // Separate params for JOINs vs WHERE to maintain correct SQL placeholder order
      // SQL order is: JOINs (with their params), then WHERE (with its params)
      const joinParams: (string | number)[] = [];
      const whereParams: (string | number)[] = [];
      const joins: string[] = [];

      // Type filter
      if (options.type) {
        whereConditions.push('n.type = ?');
        whereParams.push(options.type);
      }

      // Metadata filters
      // Special marker for filtering on empty/null values
      const EMPTY_MARKER = '__empty__';

      if (options.metadata_filters && options.metadata_filters.length > 0) {
        options.metadata_filters.forEach((filter, index) => {
          const alias = `m${index}`;
          const operator = filter.operator || '=';
          const isEmptyFilter = filter.value === EMPTY_MARKER;

          if (operator === '!=') {
            if (isEmptyFilter) {
              // != __empty__ means "field has a non-empty value"
              joins.push(`JOIN note_metadata ${alias} ON n.id = ${alias}.note_id`);
              whereConditions.push(`${alias}.key = ?`);
              whereParams.push(filter.key);
              whereConditions.push(`${alias}.value != ''`);
            } else {
              // For != we need LEFT JOIN to include notes without the field
              joins.push(
                `LEFT JOIN note_metadata ${alias} ON n.id = ${alias}.note_id AND ${alias}.key = ?`
              );
              joinParams.push(filter.key);
              whereConditions.push(`(${alias}.value IS NULL OR ${alias}.value != ?)`);
              const filterValue = Array.isArray(filter.value)
                ? filter.value[0]
                : filter.value;
              whereParams.push(filterValue);
            }
          } else if (operator === '=' && isEmptyFilter) {
            // = __empty__ means "field is empty or doesn't exist"
            joins.push(
              `LEFT JOIN note_metadata ${alias} ON n.id = ${alias}.note_id AND ${alias}.key = ?`
            );
            joinParams.push(filter.key);
            whereConditions.push(`(${alias}.value IS NULL OR ${alias}.value = '')`);
          } else if (operator === 'IN') {
            const values = Array.isArray(filter.value)
              ? filter.value
              : filter.value.split(',').map((v) => v.trim());
            const hasEmpty = values.includes(EMPTY_MARKER);
            const nonEmptyValues = values.filter((v) => v !== EMPTY_MARKER);

            if (hasEmpty) {
              joins.push(
                `LEFT JOIN note_metadata ${alias} ON n.id = ${alias}.note_id AND ${alias}.key = ?`
              );
              joinParams.push(filter.key);

              if (nonEmptyValues.length > 0) {
                const placeholders = nonEmptyValues.map(() => '?').join(',');
                whereConditions.push(
                  `(${alias}.value IS NULL OR ${alias}.value = '' OR ${alias}.value IN (${placeholders}))`
                );
                whereParams.push(...nonEmptyValues);
              } else {
                whereConditions.push(`(${alias}.value IS NULL OR ${alias}.value = '')`);
              }
            } else {
              joins.push(`JOIN note_metadata ${alias} ON n.id = ${alias}.note_id`);
              whereConditions.push(`${alias}.key = ?`);
              whereParams.push(filter.key);
              const placeholders = values.map(() => '?').join(',');
              whereConditions.push(`${alias}.value IN (${placeholders})`);
              whereParams.push(...values);
            }
          } else if (operator === 'NOT IN') {
            // NOT IN - exclude notes matching any of the values, include notes missing the field
            const values = Array.isArray(filter.value)
              ? filter.value
              : filter.value.split(',').map((v) => v.trim());
            const hasEmpty = values.includes(EMPTY_MARKER);
            const nonEmptyValues = values.filter((v) => v !== EMPTY_MARKER);

            // Use LEFT JOIN to include notes without the field
            joins.push(
              `LEFT JOIN note_metadata ${alias} ON n.id = ${alias}.note_id AND ${alias}.key = ?`
            );
            joinParams.push(filter.key);

            if (hasEmpty && nonEmptyValues.length > 0) {
              // NOT IN [__empty__, val1, val2] means "field exists AND has a value AND value is not in list"
              const placeholders = nonEmptyValues.map(() => '?').join(',');
              whereConditions.push(
                `(${alias}.value IS NOT NULL AND ${alias}.value != '' AND ${alias}.value NOT IN (${placeholders}))`
              );
              whereParams.push(...nonEmptyValues);
            } else if (hasEmpty) {
              // NOT IN [__empty__] means "field exists and has a non-empty value"
              whereConditions.push(
                `(${alias}.value IS NOT NULL AND ${alias}.value != '')`
              );
            } else {
              // Regular NOT IN - exclude matching values, include NULL/missing
              const placeholders = nonEmptyValues.map(() => '?').join(',');
              whereConditions.push(
                `(${alias}.value IS NULL OR ${alias}.value NOT IN (${placeholders}))`
              );
              whereParams.push(...nonEmptyValues);
            }
          } else if (operator === 'BETWEEN') {
            // BETWEEN - inclusive range query for dates and numbers
            const values = Array.isArray(filter.value) ? filter.value : [filter.value];
            if (values.length >= 2) {
              joins.push(`JOIN note_metadata ${alias} ON n.id = ${alias}.note_id`);
              whereConditions.push(`${alias}.key = ?`);
              whereParams.push(filter.key);
              whereConditions.push(`${alias}.value BETWEEN ? AND ?`);
              whereParams.push(values[0], values[1]);
            }
          } else {
            // For other operators, use regular JOIN (requires field to exist)
            joins.push(`JOIN note_metadata ${alias} ON n.id = ${alias}.note_id`);
            whereConditions.push(`${alias}.key = ?`);
            whereParams.push(filter.key);

            if (operator === 'LIKE') {
              whereConditions.push(`${alias}.value LIKE ?`);
              const filterValue = Array.isArray(filter.value)
                ? filter.value[0]
                : filter.value;
              const likeValue = filterValue.includes('%')
                ? filterValue
                : `%${filterValue}%`;
              whereParams.push(likeValue);
            } else {
              whereConditions.push(`${alias}.value ${operator} ?`);
              const filterValue = Array.isArray(filter.value)
                ? filter.value[0]
                : filter.value;
              whereParams.push(filterValue);
            }
          }
        });
      }

      // Date filters
      if (options.updated_within) {
        const date = this.parseDateFilter(options.updated_within);
        whereConditions.push('n.updated >= ?');
        whereParams.push(date);
      }

      if (options.updated_before) {
        const date = this.parseDateFilter(options.updated_before);
        whereConditions.push('n.updated <= ?');
        whereParams.push(date);
      }

      if (options.created_within) {
        const date = this.parseDateFilter(options.created_within);
        whereConditions.push('n.created >= ?');
        whereParams.push(date);
      }

      if (options.created_before) {
        const date = this.parseDateFilter(options.created_before);
        whereConditions.push('n.created <= ?');
        whereParams.push(date);
      }

      // Content search
      if (options.content_contains) {
        joins.push('JOIN notes_fts fts ON n.id = fts.id');
        whereConditions.push('notes_fts MATCH ?');
        whereParams.push(options.content_contains);
      }

      // Hierarchy filters
      if (options.parent_of) {
        joins.push('JOIN note_hierarchies h_parent ON n.id = h_parent.parent_id');
        whereConditions.push('h_parent.child_id = ?');
        whereParams.push(options.parent_of);
      }

      if (options.child_of) {
        joins.push('JOIN note_hierarchies h_child ON n.id = h_child.child_id');
        whereConditions.push('h_child.parent_id = ?');
        whereParams.push(options.child_of);
      }

      if (options.descendants_of) {
        const ancestorId = options.descendants_of;
        // Use recursive CTE to find all descendants
        const maxDepth = options.max_depth || 10;
        joins.push(`
          JOIN (
            WITH RECURSIVE descendants(id, level) AS (
              SELECT child_id, 1 FROM note_hierarchies WHERE parent_id = ?
              UNION ALL
              SELECT h.child_id, d.level + 1
              FROM note_hierarchies h
              JOIN descendants d ON h.parent_id = d.id
              WHERE d.level < ${maxDepth}
            )
            SELECT id FROM descendants
          ) d ON n.id = d.id
        `);
        joinParams.push(ancestorId);
      }

      if (options.ancestors_of) {
        // Use recursive CTE to find all ancestors
        joins.push(`
          JOIN (
            WITH RECURSIVE ancestors(id) AS (
              SELECT parent_id FROM note_hierarchies WHERE child_id = ?
              UNION ALL
              SELECT h.parent_id
              FROM note_hierarchies h
              JOIN ancestors a ON h.child_id = a.id
            )
            SELECT id FROM ancestors
          ) a ON n.id = a.id
        `);
        joinParams.push(options.ancestors_of);
      }

      if (options.has_children !== undefined) {
        if (options.has_children) {
          joins.push(
            'JOIN note_hierarchies h_has_children ON n.id = h_has_children.parent_id'
          );
        } else {
          whereConditions.push(
            'n.id NOT IN (SELECT DISTINCT parent_id FROM note_hierarchies WHERE parent_id IS NOT NULL)'
          );
        }
      }

      if (options.has_parents !== undefined) {
        if (options.has_parents) {
          joins.push(
            'JOIN note_hierarchies h_has_parents ON n.id = h_has_parents.child_id'
          );
        } else {
          whereConditions.push(
            'n.id NOT IN (SELECT DISTINCT child_id FROM note_hierarchies WHERE child_id IS NOT NULL)'
          );
        }
      }

      // Combine params in correct order: JOIN params first, then WHERE params
      const params = [...joinParams, ...whereParams];

      // Build complete query
      fromClause += ' ' + joins.join(' ');

      if (whereConditions.length > 0) {
        fromClause += ' WHERE ' + whereConditions.join(' AND ');
      }

      // Add sorting
      let orderClause = '';
      if (options.sort && options.sort.length > 0) {
        const sortTerms = options.sort.map(
          (sort) => `n.${sort.field} ${sort.order.toUpperCase()}`
        );
        orderClause = ' ORDER BY ' + sortTerms.join(', ');
      } else {
        orderClause = ' ORDER BY n.updated DESC';
      }

      // Execute count query
      const countResult = await connection.get<{ total: number }>(
        countSql + fromClause,
        params
      );
      const total = countResult?.total || 0;

      // Execute main query
      const mainSql = sql + fromClause + orderClause + ' LIMIT ? OFFSET ?';
      const rows = await connection.all<SearchRow>(mainSql, [...params, limit, offset]);

      const results = await this.convertRowsToResults(rows);
      const queryTime = Date.now() - startTime;

      return {
        results,
        total,
        has_more: offset + results.length < total,
        query_time_ms: queryTime
      };
    } catch (error) {
      throw new Error(
        `Advanced search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Query notes for dataview widgets with full metadata
   * Optimized to fetch notes and their metadata in batch
   */
  async queryNotesForDataview(
    options: DataviewQueryOptions
  ): Promise<DataviewQueryResponse> {
    const startTime = Date.now();
    const connection = await this.getReadOnlyConnection();

    try {
      const limit = options.limit ?? 50;
      const offset = options.offset ?? 0;

      // Base SELECT - we'll add sort columns dynamically
      let sql = 'SELECT n.id, n.title, n.type, n.created, n.updated';
      const countSql = 'SELECT COUNT(DISTINCT n.id) as total';
      let fromClause = ' FROM notes n';
      const whereConditions: string[] = [];
      // Separate params for JOINs vs WHERE to maintain correct SQL placeholder order
      // SQL order is: JOINs (with their params), then WHERE (with its params)
      const joinParams: (string | number)[] = [];
      const whereParams: (string | number)[] = [];
      const joins: string[] = [];
      const sortSelectColumns: string[] = [];

      // Exclude archived notes
      whereConditions.push('(n.archived IS NULL OR n.archived = 0)');

      // Type filter (supports single type or array of types, with operator)
      if (options.type) {
        const types = Array.isArray(options.type) ? options.type : [options.type];
        const typeOp = options.type_operator || '=';

        if (types.length === 1) {
          if (typeOp === '!=') {
            whereConditions.push('n.type != ?');
          } else {
            whereConditions.push('n.type = ?');
          }
          whereParams.push(types[0]);
        } else if (types.length > 1) {
          const placeholders = types.map(() => '?').join(',');
          if (typeOp === '!=') {
            whereConditions.push(`n.type NOT IN (${placeholders})`);
          } else {
            whereConditions.push(`n.type IN (${placeholders})`);
          }
          whereParams.push(...types);
        }
      }

      // Metadata filters
      // Special marker for filtering on empty/null values
      const EMPTY_MARKER = '__empty__';

      if (options.metadata_filters && options.metadata_filters.length > 0) {
        options.metadata_filters.forEach((filter, index) => {
          const alias = `m${index}`;
          const operator = filter.operator || '=';
          const isEmptyFilter = filter.value === EMPTY_MARKER;

          if (operator === '!=') {
            if (isEmptyFilter) {
              // != __empty__ means "field has a non-empty value"
              // Use regular JOIN (requires field to exist) and check value is not empty
              joins.push(`JOIN note_metadata ${alias} ON n.id = ${alias}.note_id`);
              whereConditions.push(`${alias}.key = ?`);
              whereParams.push(filter.key);
              whereConditions.push(`${alias}.value != ''`);
            } else {
              // For != we need LEFT JOIN to include notes without the field
              // Move key condition to ON clause so unmatched notes still appear
              joins.push(
                `LEFT JOIN note_metadata ${alias} ON n.id = ${alias}.note_id AND ${alias}.key = ?`
              );
              joinParams.push(filter.key);

              // Match notes where field doesn't exist (NULL) OR value doesn't match
              whereConditions.push(`(${alias}.value IS NULL OR ${alias}.value != ?)`);
              const filterValue = Array.isArray(filter.value)
                ? filter.value[0]
                : filter.value;
              whereParams.push(filterValue);
            }
          } else if (operator === '=' && isEmptyFilter) {
            // = __empty__ means "field is empty or doesn't exist"
            // Use LEFT JOIN and check for NULL or empty string
            joins.push(
              `LEFT JOIN note_metadata ${alias} ON n.id = ${alias}.note_id AND ${alias}.key = ?`
            );
            joinParams.push(filter.key);
            whereConditions.push(`(${alias}.value IS NULL OR ${alias}.value = '')`);
          } else if (operator === 'IN') {
            const values = Array.isArray(filter.value)
              ? filter.value
              : filter.value.split(',').map((v) => v.trim());
            const hasEmpty = values.includes(EMPTY_MARKER);
            const nonEmptyValues = values.filter((v) => v !== EMPTY_MARKER);

            if (hasEmpty) {
              // IN with __empty__ means "field is empty/null OR matches one of the values"
              // Use LEFT JOIN to include notes without the field
              joins.push(
                `LEFT JOIN note_metadata ${alias} ON n.id = ${alias}.note_id AND ${alias}.key = ?`
              );
              joinParams.push(filter.key);

              if (nonEmptyValues.length > 0) {
                const placeholders = nonEmptyValues.map(() => '?').join(',');
                whereConditions.push(
                  `(${alias}.value IS NULL OR ${alias}.value = '' OR ${alias}.value IN (${placeholders}))`
                );
                whereParams.push(...nonEmptyValues);
              } else {
                // Only __empty__ in the list
                whereConditions.push(`(${alias}.value IS NULL OR ${alias}.value = '')`);
              }
            } else {
              // Regular IN without __empty__
              joins.push(`JOIN note_metadata ${alias} ON n.id = ${alias}.note_id`);
              whereConditions.push(`${alias}.key = ?`);
              whereParams.push(filter.key);
              const placeholders = values.map(() => '?').join(',');
              whereConditions.push(`${alias}.value IN (${placeholders})`);
              whereParams.push(...values);
            }
          } else if (operator === 'NOT IN') {
            // NOT IN - exclude notes matching any of the values, include notes missing the field
            const values = Array.isArray(filter.value)
              ? filter.value
              : filter.value.split(',').map((v) => v.trim());
            const hasEmpty = values.includes(EMPTY_MARKER);
            const nonEmptyValues = values.filter((v) => v !== EMPTY_MARKER);

            // Use LEFT JOIN to include notes without the field
            joins.push(
              `LEFT JOIN note_metadata ${alias} ON n.id = ${alias}.note_id AND ${alias}.key = ?`
            );
            joinParams.push(filter.key);

            if (hasEmpty && nonEmptyValues.length > 0) {
              // NOT IN [__empty__, val1, val2] means "field exists AND has a value AND value is not in list"
              const placeholders = nonEmptyValues.map(() => '?').join(',');
              whereConditions.push(
                `(${alias}.value IS NOT NULL AND ${alias}.value != '' AND ${alias}.value NOT IN (${placeholders}))`
              );
              whereParams.push(...nonEmptyValues);
            } else if (hasEmpty) {
              // NOT IN [__empty__] means "field exists and has a non-empty value"
              whereConditions.push(
                `(${alias}.value IS NOT NULL AND ${alias}.value != '')`
              );
            } else {
              // Regular NOT IN - exclude matching values, include NULL/missing
              const placeholders = nonEmptyValues.map(() => '?').join(',');
              whereConditions.push(
                `(${alias}.value IS NULL OR ${alias}.value NOT IN (${placeholders}))`
              );
              whereParams.push(...nonEmptyValues);
            }
          } else if (operator === 'BETWEEN') {
            // BETWEEN - inclusive range query for dates and numbers
            const values = Array.isArray(filter.value) ? filter.value : [filter.value];
            if (values.length >= 2) {
              joins.push(`JOIN note_metadata ${alias} ON n.id = ${alias}.note_id`);
              whereConditions.push(`${alias}.key = ?`);
              whereParams.push(filter.key);
              whereConditions.push(`${alias}.value BETWEEN ? AND ?`);
              whereParams.push(values[0], values[1]);
            }
          } else {
            // For other operators, use regular JOIN (requires field to exist)
            joins.push(`JOIN note_metadata ${alias} ON n.id = ${alias}.note_id`);
            whereConditions.push(`${alias}.key = ?`);
            whereParams.push(filter.key);

            if (operator === 'LIKE') {
              // Wrap value with % for "contains" matching unless user provided their own wildcards
              whereConditions.push(`${alias}.value LIKE ?`);
              const filterValue = Array.isArray(filter.value)
                ? filter.value[0]
                : filter.value;
              const likeValue = filterValue.includes('%')
                ? filterValue
                : `%${filterValue}%`;
              whereParams.push(likeValue);
            } else {
              whereConditions.push(`${alias}.value ${operator} ?`);
              const filterValue = Array.isArray(filter.value)
                ? filter.value[0]
                : filter.value;
              whereParams.push(filterValue);
            }
          }
        });
      }

      // Combine params in correct order: JOIN params first, then WHERE params
      const params = [...joinParams, ...whereParams];

      // Determine sort joins and order clause BEFORE building the full query
      // This ensures JOINs come before WHERE in the SQL
      let orderClause = '';
      const sortJoins: string[] = [];
      if (options.sort && options.sort.length > 0) {
        const sortTerms = options.sort.map((sort, index) => {
          const field = sort.field;
          // Built-in fields sort directly on notes table
          if (['title', 'type', 'created', 'updated'].includes(field)) {
            return `n.${field} ${sort.order.toUpperCase()}`;
          }
          // For metadata fields, LEFT JOIN to get the value and sort by it
          // Use a unique alias for each sort field
          const sortAlias = `sort_${index}`;
          sortJoins.push(
            `LEFT JOIN note_metadata ${sortAlias} ON n.id = ${sortAlias}.note_id AND ${sortAlias}.key = '${field}'`
          );
          // Add the sort column to SELECT so ORDER BY works correctly
          sortSelectColumns.push(`${sortAlias}.value as ${sortAlias}_value`);
          // Sort with NULLS LAST behavior (empty values at end regardless of direction)
          if (sort.order.toUpperCase() === 'ASC') {
            // For ASC: put NULLs/empty at the end, then sort A→Z
            return `(${sortAlias}.value IS NULL OR ${sortAlias}.value = '') ASC, ${sortAlias}.value ASC`;
          } else {
            // For DESC: put NULLs/empty at the end, then sort Z→A
            return `(${sortAlias}.value IS NULL OR ${sortAlias}.value = '') ASC, ${sortAlias}.value DESC`;
          }
        });
        orderClause = ' ORDER BY ' + sortTerms.join(', ');
      } else {
        orderClause = ' ORDER BY n.updated DESC';
      }

      // Add sort columns to SELECT so ORDER BY works correctly with the results
      if (sortSelectColumns.length > 0) {
        sql += ', ' + sortSelectColumns.join(', ');
      }

      // Build complete query - JOINs must come before WHERE
      // Add filter joins first
      fromClause += ' ' + joins.join(' ');
      // Add sort joins (these are LEFT JOINs so they don't affect filtering)
      if (sortJoins.length > 0) {
        fromClause += ' ' + sortJoins.join(' ');
      }
      // Add WHERE clause last
      if (whereConditions.length > 0) {
        fromClause += ' WHERE ' + whereConditions.join(' AND ');
      }

      // Execute count query (before adding GROUP BY)
      const countResult = await connection.get<{ total: number }>(
        countSql + fromClause,
        params
      );
      const total = countResult?.total || 0;

      // Add GROUP BY to handle potential duplicates from JOINs
      fromClause += ' GROUP BY n.id';

      // Execute main query
      const mainSql = sql + fromClause + orderClause + ' LIMIT ? OFFSET ?';

      const rows = await connection.all<{
        id: string;
        title: string;
        type: string;
        created: string;
        updated: string;
      }>(mainSql, [...params, limit, offset]);

      // Batch fetch metadata for all notes
      const noteIds = rows.map((r) => r.id);
      const metadataMap = await this.batchFetchMetadata(connection, noteIds);

      // Build results
      const results: DataviewNote[] = rows.map((row) => ({
        id: row.id,
        title: row.title || '',
        type: row.type,
        created: row.created,
        updated: row.updated,
        metadata: metadataMap.get(row.id) || {}
      }));

      const queryTime = Date.now() - startTime;

      return {
        results,
        total,
        has_more: offset + results.length < total,
        query_time_ms: queryTime
      };
    } catch (error) {
      throw new Error(
        `Dataview query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Batch fetch metadata for multiple notes in a single query
   */
  private async batchFetchMetadata(
    connection: DatabaseConnection,
    noteIds: string[]
  ): Promise<Map<string, Record<string, unknown>>> {
    if (noteIds.length === 0) {
      return new Map();
    }

    const placeholders = noteIds.map(() => '?').join(',');
    const metadataRows = await connection.all<{
      note_id: string;
      key: string;
      value: string;
      value_type: 'string' | 'number' | 'date' | 'boolean' | 'array';
    }>(
      `SELECT note_id, key, value, value_type FROM note_metadata WHERE note_id IN (${placeholders})`,
      noteIds
    );

    // Group metadata by note_id
    const metadataMap = new Map<string, Record<string, unknown>>();

    // Initialize empty objects for all note IDs
    for (const id of noteIds) {
      metadataMap.set(id, {});
    }

    // Populate metadata
    for (const row of metadataRows) {
      const metadata = metadataMap.get(row.note_id);
      if (metadata) {
        metadata[row.key] = this.deserializeMetadataValue(row.value, row.value_type);
      }
    }

    return metadataMap;
  }

  // SQL search with safety measures
  async searchNotesSQL(options: SqlSearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();
    const connection = await this.getReadOnlyConnection();

    // Validate SQL query for safety
    this.validateSQLQuery(options.query);

    try {
      const limit = options.limit ?? 1000;
      const timeout = options.timeout ?? 30000;

      // Set query timeout
      await connection.run(`PRAGMA busy_timeout = ${timeout}`);

      // Execute query with limit
      let sql = options.query.trim();
      if (!sql.toLowerCase().includes('limit')) {
        sql += ` LIMIT ${limit}`;
      }

      const rows = await connection.all<SearchRow | Record<string, unknown>>(
        sql,
        options.params || []
      );

      // Detect if this is an aggregation query or custom SQL
      const isAggregationQuery = this.isAggregationQuery(sql);

      let results: SearchResult[];
      if (isAggregationQuery) {
        // For aggregation queries, return raw results with custom columns preserved
        results = rows.map((row) => ({
          ...row, // Preserve all custom aggregation columns first
          id: String(row.id || ''),
          title: String(row.title || ''),
          snippet: ''
        }));
      } else {
        // For regular note queries, convert to SearchResult format
        results = await this.convertRowsToResults(rows as SearchRow[]);
      }

      const queryTime = Date.now() - startTime;

      return {
        results,
        total: results.length,
        has_more: results.length >= limit,
        query_time_ms: queryTime
      };
    } catch (error) {
      throw new Error(
        `SQL search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Detect if SQL query is an aggregation or custom query
  private isAggregationQuery(sql: string): boolean {
    const lowerSql = sql.toLowerCase();

    // Check for aggregation functions
    const aggregationFunctions = [
      'count(',
      'sum(',
      'avg(',
      'min(',
      'max(',
      'group_concat('
    ];
    const hasAggregation = aggregationFunctions.some((func) => lowerSql.includes(func));

    // Check for GROUP BY clause
    const hasGroupBy = lowerSql.includes('group by');

    // If it has aggregation functions or GROUP BY, it's an aggregation query
    // Exception: Simple SELECT * FROM notes should be treated as a regular query
    const isSimpleSelectAll =
      lowerSql.includes('select *') &&
      lowerSql.includes('from notes') &&
      !hasAggregation &&
      !hasGroupBy;

    return (hasAggregation || hasGroupBy) && !isSimpleSelectAll;
  }

  // Validate SQL query for security
  private validateSQLQuery(query: string): void {
    const lowerSql = query.toLowerCase().trim();

    // 1. Only allow SELECT statements
    if (!lowerSql.startsWith('select')) {
      throw new Error('SQL Security Error: Only SELECT queries are allowed.');
    }

    // 2. Prohibit dangerous keywords and commands
    const prohibitedKeywords = [
      'drop',
      'delete',
      'insert',
      'update',
      'alter',
      'create',
      'attach',
      'detach',
      'grant',
      'revoke',
      'commit',
      'rollback',
      'truncate',
      'replace',
      'exec',
      'execute',
      'pragma'
    ];

    for (const keyword of prohibitedKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(lowerSql)) {
        throw new Error(`SQL Security Error: Prohibited keyword '${keyword}' found.`);
      }
    }

    // 3. Prevent manipulation of system tables
    const systemTables = ['sqlite_master', 'sqlite_sequence', 'sqlite_stat1'];
    for (const table of systemTables) {
      if (lowerSql.includes(table)) {
        throw new Error(
          `SQL Security Error: Direct access to system table '${table}' is not allowed.`
        );
      }
    }

    // 4. Limit query complexity (basic heuristics)
    const subqueryCount = (lowerSql.match(/select/g) || []).length - 1;
    if (subqueryCount > 3) {
      throw new Error(
        'SQL Security Error: Query is too complex (too many subqueries). Maximum 3 are allowed.'
      );
    }

    const joinCount = (lowerSql.match(/join/g) || []).length;
    if (joinCount > 5) {
      throw new Error(
        'SQL Security Error: Query is too complex (too many JOINs). Maximum 5 are allowed.'
      );
    }

    // 5. Disallow comments which can be used to hide malicious code
    if (lowerSql.includes('--') || lowerSql.includes('/*')) {
      throw new Error('SQL Security Error: Comments are not allowed in queries.');
    }
  }

  // Parse date filter strings like '7d', '1w', '2m'
  private parseDateFilter(filter: string): string {
    const match = filter.match(/^(\d+)([dwmy])$/);
    if (!match) {
      throw new Error(`Invalid date filter format: ${filter}`);
    }

    const amount = parseInt(match[1]);
    const unit = match[2];

    const now = new Date();
    switch (unit) {
      case 'd':
        now.setDate(now.getDate() - amount);
        break;
      case 'w':
        now.setDate(now.getDate() - amount * 7);
        break;
      case 'm':
        now.setMonth(now.getMonth() - amount);
        break;
      case 'y':
        now.setFullYear(now.getFullYear() - amount);
        break;
      default:
        throw new Error(`Unknown date unit: ${unit}`);
    }

    return now.toISOString();
  }

  // Convert database rows to search results
  private async convertRowsToResults(rows: SearchRow[]): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const row of rows) {
      // Generate snippet if not provided
      let snippet = row.snippet || '';
      if (!snippet && row.content) {
        snippet = this.generateSnippet(row.content);
      }

      // Find the line where the search term appears for the snippet
      // (FTS already provides highlighted snippets)
      if (!row.snippet && row.content) {
        // Extract the first few lines as snippet, with safety limit
        const lines = row.content.split('\n');
        const snippetLines: string[] = [];
        let charCount = 0;
        const maxChars = 500; // Safety limit for total characters

        for (const line of lines) {
          // Safety check: skip extremely long lines
          if (line.length > 1000) {
            snippetLines.push(line.substring(0, 1000) + '...');
            charCount += 1000;
          } else {
            snippetLines.push(line);
            charCount += line.length;
          }

          if (charCount >= maxChars || snippetLines.length >= 5) {
            break;
          }
        }

        snippet = snippetLines.join('\n');
        if (charCount >= maxChars || snippetLines.length < lines.length) {
          snippet += '\n...';
        }
      }

      results.push({
        id: row.id,
        title: row.title,
        snippet,
        type: row.type,
        filename: row.filename,
        flint_kind: row.flint_kind
      });
    }

    return results;
  }

  // Generate snippet from content
  private generateSnippet(content: string, maxLength: number = 200): string {
    if (!content) return '';

    // Remove frontmatter and extra whitespace
    const cleanContent = content.replace(/^---[\s\S]*?---/, '').trim();

    if (cleanContent.length <= maxLength) {
      return cleanContent;
    }

    // Find a good break point
    const truncated = cleanContent.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.7) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  // Get file statistics
  private async getFileStats(
    filePath: string
  ): Promise<{ created: string; modified: string; size: number; mtimeMs: number }> {
    try {
      const stats = await fs.stat(filePath);
      return {
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        size: stats.size,
        mtimeMs: Math.floor(stats.mtimeMs)
      };
    } catch {
      const now = Date.now();
      return {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        size: 0,
        mtimeMs: now
      };
    }
  }

  // Index management methods
  async upsertNote(
    id: string,
    title: string,
    content: string,
    type: string,
    filename: string,
    filePath: string,
    metadata: NoteMetadata
  ): Promise<void> {
    const connection = await this.getConnection();

    try {
      const now = new Date().toISOString();
      const stats = await this.getFileStats(filePath);
      const contentHash = createHash('sha256').update(content).digest('hex');

      // Convert absolute path to relative path for storage
      const relativePath = toRelativePath(filePath, this.workspacePath);

      // Check if note exists by ID
      const existingById = await connection.get<NoteRow>(
        'SELECT id, content_hash FROM notes WHERE id = ?',
        [id]
      );

      // Also check for conflicts with the UNIQUE constraint on (type, filename)
      const existingByTypeFilename = await connection.get<NoteRow>(
        'SELECT id, content_hash FROM notes WHERE type = ? AND filename = ?',
        [type, filename]
      );

      // Handle conflict: same (type, filename) but different ID
      if (existingByTypeFilename && existingByTypeFilename.id !== id) {
        logger.warn(
          `Note ID mismatch detected: File has ID ${id} but database has ${existingByTypeFilename.id} for ${type}/${filename}. ` +
            `Deleting old entry and using file's ID.`
        );
        // Delete the old note with the conflicting (type, filename)
        await connection.run('DELETE FROM notes WHERE id = ?', [
          existingByTypeFilename.id
        ]);
        // Now proceed to insert with the new ID
      }

      if (existingById) {
        // Only update the 'updated' timestamp if content has actually changed
        const contentChanged = existingById.content_hash !== contentHash;

        // Get flint_kind from metadata for storing in notes table
        const flintKind =
          typeof metadata.flint_kind === 'string' ? metadata.flint_kind : 'markdown';

        // Get archived status from metadata (handles both boolean and string 'true')
        const archivedValue = metadata.flint_archived as unknown;
        const isArchived = archivedValue === true || archivedValue === 'true' ? 1 : 0;

        if (contentChanged) {
          // Content has changed, update with new timestamp
          await connection.run(
            `UPDATE notes SET
             title = ?, content = ?, type = ?, flint_kind = ?, filename = ?, path = ?,
             updated = ?, size = ?, content_hash = ?, file_mtime = ?, archived = ?
             WHERE id = ?`,
            [
              title,
              content,
              type,
              flintKind,
              filename,
              relativePath,
              now,
              stats.size,
              contentHash,
              stats.mtimeMs,
              isArchived,
              id
            ]
          );
        } else {
          // Content hasn't changed, preserve existing updated timestamp
          await connection.run(
            `UPDATE notes SET
             title = ?, content = ?, type = ?, flint_kind = ?, filename = ?, path = ?,
             size = ?, content_hash = ?, file_mtime = ?, archived = ?
             WHERE id = ?`,
            [
              title,
              content,
              type,
              flintKind,
              filename,
              relativePath,
              stats.size,
              contentHash,
              stats.mtimeMs,
              isArchived,
              id
            ]
          );
        }
      } else {
        // Get flint_kind from metadata for storing in notes table
        const flintKind =
          typeof metadata.flint_kind === 'string' ? metadata.flint_kind : 'markdown';

        // Get archived status from metadata (handles both boolean and string 'true')
        const archivedValue = metadata.flint_archived as unknown;
        const isArchived = archivedValue === true || archivedValue === 'true' ? 1 : 0;

        // Insert new note
        await connection.run(
          `INSERT INTO notes
           (id, title, content, type, flint_kind, filename, path, created, updated, size, content_hash, file_mtime, archived)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            title,
            content,
            type,
            flintKind,
            filename,
            relativePath,
            stats.created,
            now,
            stats.size,
            contentHash,
            stats.mtimeMs,
            isArchived
          ]
        );
      }

      // Update metadata
      await connection.run('DELETE FROM note_metadata WHERE note_id = ?', [id]);

      // Legacy fields that should be skipped if their flint_* equivalent exists
      const LEGACY_TO_FLINT: Record<string, string> = {
        id: 'flint_id',
        type: 'flint_type',
        title: 'flint_title',
        filename: 'flint_filename',
        created: 'flint_created',
        updated: 'flint_updated',
        archived: 'flint_archived'
      };

      for (const [key, value] of Object.entries(metadata)) {
        if (value != null && key !== 'filename') {
          // Skip legacy fields if their flint_* equivalent exists in metadata
          const flintEquivalent = LEGACY_TO_FLINT[key];
          if (flintEquivalent && metadata[flintEquivalent] !== undefined) {
            continue;
          }

          const { value: serializedValue, type: valueType } =
            serializeMetadataValue(value);
          await connection.run(
            'INSERT INTO note_metadata (note_id, key, value, value_type) VALUES (?, ?, ?, ?)',
            [id, key, serializedValue, valueType]
          );
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to upsert note: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async removeNote(id: string): Promise<void> {
    const connection = await this.getConnection();

    try {
      await connection.run('DELETE FROM notes WHERE id = ?', [id]);
      // Metadata will be deleted automatically due to foreign key constraint
    } catch (error) {
      throw new Error(
        `Failed to remove note: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async rebuildIndex(
    progressCallback?: (processed: number, total: number) => void
  ): Promise<void> {
    try {
      // Ensure we have a connection before rebuilding
      await this.ensureInitialized();

      // Clear existing data
      await this.dbManager.rebuild();

      // Rebuild from filesystem
      await this.rebuildFromFileSystem(progressCallback);
    } catch (error) {
      throw new Error(
        `Failed to rebuild index: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Rebuild index by scanning all note files in the workspace
  async rebuildFromFileSystem(
    progressCallback?: (processed: number, total: number) => void
  ): Promise<void> {
    const noteFiles = await this.scanForNoteFiles();

    if (progressCallback) {
      progressCallback(0, noteFiles.length);
    }

    // Process files in batches for better performance
    const batchSize = 10;
    let processed = 0;

    for (let i = 0; i < noteFiles.length; i += batchSize) {
      const batch = noteFiles.slice(i, i + batchSize);

      // Process batch in parallel
      await Promise.allSettled(
        batch.map(async (filePath) => {
          try {
            await this.indexNoteFile(filePath);
          } catch (error) {
            console.error(`Failed to index note file ${filePath}:`, error);
            // Continue with other files
          }
        })
      );

      processed += batch.length;
      if (progressCallback) {
        progressCallback(Math.min(processed, noteFiles.length), noteFiles.length);
      }
    }
  }

  /**
   * Sync filesystem changes to database using hybrid mtime + content hash detection
   * Detects:
   * 1. New files (not in database)
   * 2. Changed files (mtime newer + content hash differs)
   * 3. Deleted files (in database but not on filesystem)
   *
   * This is faster than a full rebuild as it uses mtime as a fast filter
   * and only hashes files that have potentially changed.
   */
  async syncFileSystemChanges(
    progressCallback?: (processed: number, total: number) => void
  ): Promise<{ added: number; updated: number; deleted: number }> {
    const allNoteFiles = await this.scanForNoteFiles();
    const db = await this.getConnection();

    // Get all notes currently in the database with their mtime and content_hash
    const indexedNotes = await db.all<{
      path: string;
      file_mtime: number | null;
      content_hash: string | null;
    }>('SELECT path, file_mtime, content_hash FROM notes');

    // Create a map of relative paths to indexed notes
    const indexedMap = new Map(indexedNotes.map((note) => [note.path, note]));

    // Create a map of relative paths to absolute paths for files on disk
    const filesOnDiskMap = new Map(
      allNoteFiles.map((absPath) => [
        toRelativePath(absPath, this.workspacePath),
        absPath
      ])
    );

    // Find files to process
    const filesToAdd: string[] = [];
    const filesToCheck: Array<{
      path: string;
      dbMtime: number | null;
      dbHash: string | null;
    }> = [];

    for (const [relativePath, absolutePath] of filesOnDiskMap) {
      const indexed = indexedMap.get(relativePath);

      if (!indexed) {
        // New file - not in database
        filesToAdd.push(absolutePath);
      } else {
        // File exists in DB - check if it changed
        filesToCheck.push({
          path: absolutePath,
          dbMtime: indexed.file_mtime,
          dbHash: indexed.content_hash
        });
      }
    }

    // Find deleted files (in DB but not on disk)
    const filesToDelete: string[] = [];
    for (const [relativePath] of indexedMap) {
      if (!filesOnDiskMap.has(relativePath)) {
        filesToDelete.push(relativePath);
      }
    }

    // Phase 1: Check for changed files using hybrid approach
    const filesToUpdate: string[] = [];

    for (const { path, dbMtime, dbHash } of filesToCheck) {
      try {
        const stats = await fs.stat(path);
        const fsMtime = Math.floor(stats.mtimeMs);

        // Fast path: if mtime unchanged (or older), skip
        if (dbMtime !== null && fsMtime <= dbMtime) {
          continue;
        }

        // mtime is newer - check content hash to be sure
        const content = await fs.readFile(path, 'utf-8');
        const fsHash = createHash('sha256').update(content, 'utf8').digest('hex');

        if (fsHash !== dbHash) {
          // Content actually changed
          filesToUpdate.push(path);
        } else {
          // Content unchanged, just mtime touched - update mtime only
          await db.run('UPDATE notes SET file_mtime = ? WHERE path = ?', [fsMtime, path]);
        }
      } catch (error) {
        console.error(`Failed to check file ${path}:`, error);
      }
    }

    const totalToProcess =
      filesToAdd.length + filesToUpdate.length + filesToDelete.length;

    if (totalToProcess === 0) {
      return { added: 0, updated: 0, deleted: 0 };
    }

    logger.info(
      `Syncing filesystem changes: ${filesToAdd.length} new, ${filesToUpdate.length} updated, ${filesToDelete.length} deleted`
    );

    let processed = 0;

    // Process new files
    const batchSize = 10;
    for (let i = 0; i < filesToAdd.length; i += batchSize) {
      const batch = filesToAdd.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (filePath) => {
          try {
            await this.indexNoteFile(filePath);
          } catch (error) {
            console.error(`Failed to index new file ${filePath}:`, error);
          }
        })
      );
      processed += batch.length;
      if (progressCallback) {
        progressCallback(processed, totalToProcess);
      }
    }

    // Process updated files
    for (let i = 0; i < filesToUpdate.length; i += batchSize) {
      const batch = filesToUpdate.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (filePath) => {
          try {
            await this.indexNoteFile(filePath);
          } catch (error) {
            console.error(`Failed to reindex updated file ${filePath}:`, error);
          }
        })
      );
      processed += batch.length;
      if (progressCallback) {
        progressCallback(processed, totalToProcess);
      }
    }

    // Process deleted files
    for (const filePath of filesToDelete) {
      try {
        // Remove from database
        await db.run('DELETE FROM notes WHERE path = ?', [filePath]);
        // Also clean up metadata, links, etc.
        // Note: Foreign key constraints should handle cascade delete
      } catch (error) {
        // SQLITE_CORRUPT/SQLITE_READONLY expected when database is closed during cleanup (race condition)
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'SQLITE_CORRUPT' || error.code === 'SQLITE_READONLY')
        ) {
          // Silently ignore - database is being cleaned up
          continue;
        }
        console.error(`Failed to remove deleted file ${filePath}:`, error);
      }
      processed++;
      if (progressCallback) {
        progressCallback(processed, totalToProcess);
      }
    }

    return {
      added: filesToAdd.length,
      updated: filesToUpdate.length,
      deleted: filesToDelete.length
    };
  }

  /**
   * Legacy method - now wraps syncFileSystemChanges
   * @deprecated Use syncFileSystemChanges instead
   */
  async syncMissingNotes(
    progressCallback?: (processed: number, total: number) => void
  ): Promise<number> {
    const result = await this.syncFileSystemChanges(progressCallback);
    return result.added + result.updated;
  }

  // Scan workspace for all note files
  private async scanForNoteFiles(): Promise<string[]> {
    const noteFiles: string[] = [];

    try {
      const entries = await fs.readdir(this.workspacePath, { withFileTypes: true });

      // Process directories in parallel
      const dirPromises = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(async (entry) => {
          try {
            const dirPath = path.join(this.workspacePath, entry.name);
            const dirFiles = await fs.readdir(dirPath);

            return dirFiles
              .filter((file) => file.endsWith('.md') && file !== '_description.md')
              .map((file) => path.join(dirPath, file));
          } catch (error) {
            // ENOENT is expected when directory is deleted during scan (race condition)
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
              return [];
            }
            console.error(`Error scanning directory ${entry.name}:`, error);
            return [];
          }
        });

      const results = await Promise.all(dirPromises);
      noteFiles.push(...results.flat());
    } catch (error) {
      // ENOENT is expected when vault directory is removed during cleanup (race condition)
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return noteFiles;
      }
      console.error('Error scanning for note files:', error);
    }

    return noteFiles;
  }

  // Index a single note file
  private async indexNoteFile(filePath: string): Promise<void> {
    try {
      let content = await fs.readFile(filePath, 'utf-8');

      // First, normalize legacy frontmatter field names to flint_* prefixed names
      content = await this.normalizeLegacyFrontmatterFields(filePath, content);

      const parsed = this.parseNoteContent(filePath, content);

      if (parsed) {
        // Check if we need to normalize the frontmatter id field (must be done first)
        await this.normalizeFrontmatterId(filePath, content, parsed);

        // Re-read content after ID normalization
        let updatedContent = await fs.readFile(filePath, 'utf-8');

        // Check if we need to normalize the frontmatter type field
        await this.normalizeFrontmatterType(filePath, updatedContent, parsed);

        // Re-read content after type normalization
        updatedContent = await fs.readFile(filePath, 'utf-8');

        // Normalize wikilinks to ID-based format
        await this.normalizeWikilinks(filePath, updatedContent, parsed);

        await this.upsertNote(
          parsed.id,
          parsed.title,
          parsed.content,
          parsed.type,
          parsed.filename,
          filePath,
          parsed.metadata as NoteMetadata
        );

        // Extract and store links for this note
        // Don't use transaction here since this may be called during rebuild
        const { LinkExtractor } = await import('../core/link-extractor.js');
        const extractionResult = LinkExtractor.extractLinks(parsed.content);
        const db = await this.getConnection();
        await LinkExtractor.storeLinks(parsed.id, extractionResult, db, false);
      }
    } catch (error) {
      throw new Error(
        `Failed to index note file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Normalize the type field in frontmatter if it's missing or incorrect
   * Writes the correct type back to the file if normalization is needed
   * Note: This runs AFTER normalizeLegacyFrontmatterFields, so all fields should
   * already be flint_* prefixed.
   */
  private async normalizeFrontmatterType(
    filePath: string,
    content: string,
    parsed: {
      id: string;
      title: string;
      content: string;
      type: string;
      filename: string;
      metadata: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      const parentDir = path.basename(path.dirname(filePath));
      // Check both flint_type and legacy type fields (flint_type takes precedence)
      const flintType = parsed.metadata.flint_type;
      const legacyType = parsed.metadata.type;
      const frontmatterType =
        (typeof flintType === 'string' ? flintType : null) ||
        (typeof legacyType === 'string' ? legacyType : null);

      // Check if type is missing or doesn't match the directory
      const needsNormalization = !frontmatterType || frontmatterType !== parentDir;

      if (needsNormalization) {
        logger.info(
          `Normalizing type field in ${filePath}: ${frontmatterType || '(missing)'} → ${parentDir}`
        );

        // Parse the original content to get the frontmatter boundary
        const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
        const match = content.match(frontmatterRegex);

        let updatedContent: string;

        if (!match) {
          // No frontmatter found - create new frontmatter block with flint_type
          logger.info(
            `Creating frontmatter for ${filePath} with flint_type: ${parentDir}`
          );
          updatedContent = `---\nflint_type: ${parentDir}\n---\n${content}`;
        } else {
          const originalFrontmatter = match[1];
          const bodyContent = match[2];

          // Replace or add the flint_type field in the frontmatter
          let updatedFrontmatter: string;
          const hasFlintType = /^flint_type:/m.test(originalFrontmatter);

          if (hasFlintType) {
            // Replace existing flint_type field
            updatedFrontmatter = originalFrontmatter.replace(
              /^flint_type:.*$/m,
              `flint_type: ${parentDir}`
            );
          } else {
            // Add flint_type field after flint_id (if it exists) or at the beginning
            const lines = originalFrontmatter.split('\n');
            const idLineIndex = lines.findIndex((line) => line.startsWith('flint_id:'));
            const insertIndex = idLineIndex >= 0 ? idLineIndex + 1 : 0;
            lines.splice(insertIndex, 0, `flint_type: ${parentDir}`);
            updatedFrontmatter = lines.join('\n');
          }

          // Reconstruct the file content
          updatedContent = `---\n${updatedFrontmatter}\n---\n${bodyContent}`;
        }

        // Write the corrected content back to the file
        await this.writeFileWithTracking(filePath, updatedContent);

        // Update the parsed object to reflect the correction
        parsed.type = parentDir;
        parsed.metadata.flint_type = parentDir;
        parsed.metadata.type = parentDir; // Also update legacy field for compatibility
      }
    } catch (error) {
      // Log but don't fail the indexing operation if normalization fails
      console.error(
        `Failed to normalize type for ${filePath}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Normalize the id field in frontmatter if it's missing or clashes with an existing note
   * Generates and writes an immutable ID back to the file if needed
   * Note: This runs AFTER normalizeLegacyFrontmatterFields, so all fields should
   * already be flint_* prefixed.
   */
  private async normalizeFrontmatterId(
    filePath: string,
    content: string,
    parsed: {
      id: string;
      title: string;
      content: string;
      type: string;
      filename: string;
      metadata: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      // Check both flint_id and legacy id fields (flint_id takes precedence)
      const flintId = parsed.metadata.flint_id;
      const legacyId = parsed.metadata.id;
      const frontmatterId =
        (typeof flintId === 'string' && flintId.startsWith('n-') ? flintId : null) ||
        (typeof legacyId === 'string' && legacyId.startsWith('n-') ? legacyId : null);

      // Check if id is missing or is an old-style ID (type/filename)
      let needsNormalization = !frontmatterId;

      // Also check if the ID clashes with an existing note at a different path
      // This can happen when importing external files with legacy frontmatter
      if (frontmatterId && !needsNormalization) {
        const relativePath = toRelativePath(filePath, this.workspacePath);
        const db = await this.getConnection();
        const existingNote = await db.get<{ path: string }>(
          'SELECT path FROM notes WHERE id = ?',
          [frontmatterId]
        );
        if (existingNote && existingNote.path !== relativePath) {
          logger.warn(
            `ID clash detected: ${filePath} has ID ${frontmatterId} which belongs to existing note at ${existingNote.path}. Generating new ID.`
          );
          needsNormalization = true;
        }
      }

      if (needsNormalization) {
        // Generate a new immutable ID
        const newId = 'n-' + randomBytes(4).toString('hex');

        logger.info(
          `Normalizing id field in ${filePath}: ${parsed.metadata.flint_id || parsed.metadata.id || '(missing)'} → ${newId}`
        );

        // Parse the original content to get the frontmatter boundary
        const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
        const match = content.match(frontmatterRegex);

        let updatedContent: string;

        if (!match) {
          // No frontmatter found - create new frontmatter block with flint_id
          logger.info(`Creating frontmatter for ${filePath} with flint_id: ${newId}`);
          updatedContent = `---\nflint_id: ${newId}\n---\n${content}`;
        } else {
          const originalFrontmatter = match[1];
          const bodyContent = match[2];

          // Add or replace the flint_id field in the frontmatter
          let updatedFrontmatter: string;
          if (parsed.metadata.flint_id) {
            // Replace existing flint_id field (e.g., old-style ID)
            updatedFrontmatter = originalFrontmatter.replace(
              /^flint_id:.*$/m,
              `flint_id: ${newId}`
            );
          } else {
            // Add flint_id field at the beginning
            const lines = originalFrontmatter.split('\n');
            lines.unshift(`flint_id: ${newId}`);
            updatedFrontmatter = lines.join('\n');
          }

          // Reconstruct the file content
          updatedContent = `---\n${updatedFrontmatter}\n---\n${bodyContent}`;
        }

        // Write the corrected content back to the file
        await this.writeFileWithTracking(filePath, updatedContent);

        // Update the parsed object to reflect the correction
        parsed.id = newId;
        parsed.metadata.flint_id = newId;
        parsed.metadata.id = newId; // Also update legacy field for compatibility
      }
    } catch (error) {
      // Log but don't fail the indexing operation if normalization fails
      console.error(
        `Failed to normalize id for ${filePath}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Normalize legacy frontmatter field names to flint_* prefixed names
   * Converts id → flint_id, type → flint_type, title → flint_title, etc.
   * This ensures all files use the new field naming convention.
   */
  private async normalizeLegacyFrontmatterFields(
    filePath: string,
    content: string
  ): Promise<string> {
    try {
      // Parse frontmatter
      const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
      const match = content.match(frontmatterRegex);

      if (!match) {
        // No frontmatter - nothing to normalize
        return content;
      }

      const originalFrontmatter = match[1];
      const bodyContent = match[2];

      // Check if any legacy fields need conversion
      let updatedFrontmatter = originalFrontmatter;
      let hasChanges = false;

      for (const [legacyField, flintField] of Object.entries(LEGACY_TO_FLINT)) {
        // Match the legacy field at start of line, not preceded by flint_
        // Also ensure we don't match if flint_ version already exists
        const legacyRegex = new RegExp(`^${legacyField}:(.*)$`, 'm');
        const flintRegex = new RegExp(`^${flintField}:`, 'm');

        const hasLegacyField = legacyRegex.test(updatedFrontmatter);
        const hasFlintField = flintRegex.test(updatedFrontmatter);

        if (hasLegacyField && !hasFlintField) {
          // Convert legacy field to flint_ prefixed version
          updatedFrontmatter = updatedFrontmatter.replace(
            legacyRegex,
            `${flintField}:$1`
          );
          hasChanges = true;
        } else if (hasLegacyField && hasFlintField) {
          // Both exist - remove the legacy field (flint_ takes precedence)
          updatedFrontmatter = updatedFrontmatter.replace(
            new RegExp(`^${legacyField}:.*\n?`, 'm'),
            ''
          );
          hasChanges = true;
        }
      }

      if (hasChanges) {
        logger.info(`Normalizing legacy frontmatter fields in ${filePath}`);
        const updatedContent = `---\n${updatedFrontmatter}\n---\n${bodyContent}`;
        await this.writeFileWithTracking(filePath, updatedContent);
        return updatedContent;
      }

      return content;
    } catch (error) {
      console.error(
        `Failed to normalize legacy frontmatter fields for ${filePath}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return content;
    }
  }

  /**
   * Normalize wikilinks to ID-based format [[n-xxxxxxxx|display]]
   * Converts legacy [[Title]] and [[type/filename]] formats to ID-based links
   */
  private async normalizeWikilinks(
    filePath: string,
    content: string,
    parsed: {
      id: string;
      title: string;
      content: string;
      type: string;
      filename: string;
      metadata: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      // Import dependencies
      const { WikilinkParser } = await import('../core/wikilink-parser.js');
      const { LinkExtractor } = await import('../core/link-extractor.js');
      const db = await this.getConnection();

      // Parse all wikilinks in the content
      const parseResult = WikilinkParser.parseWikilinks(parsed.content);

      // Build replacement list with resolved IDs
      const replacements: Array<{
        link: WikiLink;
        normalizedLink: string;
      }> = [];

      // Process each wikilink
      for (const link of parseResult.wikilinks) {
        // Skip if already in ID format
        if (link.noteId) {
          continue;
        }

        // Resolve title/type/filename to note ID
        const targetNoteId = await LinkExtractor.findNoteByTitle(link.target, db);

        if (targetNoteId) {
          // Convert to ID-based format, preserving original display text
          const displayText = link.display !== link.target ? link.display : link.target;
          const normalizedLink = WikilinkParser.createIdWikilink(
            targetNoteId,
            displayText
          );

          replacements.push({ link, normalizedLink });
        }
        // If we can't resolve the link, leave it as-is (it's a broken link)
      }

      // If no changes needed, return early
      if (replacements.length === 0) {
        return;
      }

      logger.info(
        `Normalizing ${replacements.length} wikilink(s) in ${filePath} to ID-based format`
      );

      // Replace wikilinks in content by position (descending to avoid position shifts)
      let normalizedContent = parsed.content;
      const sortedReplacements = replacements.sort(
        (a, b) => b.link.position.start - a.link.position.start
      );

      for (const { link, normalizedLink } of sortedReplacements) {
        normalizedContent =
          normalizedContent.slice(0, link.position.start) +
          normalizedLink +
          normalizedContent.slice(link.position.end);
      }

      // Parse the full file content to preserve frontmatter
      const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
      const match = content.match(frontmatterRegex);

      let updatedFileContent: string;
      if (match) {
        const frontmatter = match[1];
        updatedFileContent = `---\n${frontmatter}\n---\n${normalizedContent}`;
      } else {
        // No frontmatter, just use the normalized content
        updatedFileContent = normalizedContent;
      }

      // Write the normalized content back to the file
      await this.writeFileWithTracking(filePath, updatedFileContent);

      // Update the parsed object to reflect the normalized content
      parsed.content = normalizedContent;
    } catch (error) {
      // Log but don't fail the indexing operation if normalization fails
      console.error(
        `Failed to normalize wikilinks for ${filePath}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  // Parse note content and extract metadata
  private parseNoteContent(
    filePath: string,
    content: string
  ): {
    id: string;
    title: string;
    content: string;
    type: string;
    filename: string;
    metadata: Record<string, unknown>;
  } | null {
    try {
      // Use proper YAML parser from yaml-parser.ts
      const parsed = parseNoteContentProper(content, false);
      const metadata = parsed.metadata;
      const bodyContent = parsed.content;

      const filename = path.basename(filePath);
      const parentDir = path.basename(path.dirname(filePath));

      // Determine note type from directory name or metadata
      const type =
        (typeof metadata.type === 'string' ? metadata.type : null) || parentDir;

      // Determine title from metadata, keep empty if not specified
      // (UI handles displaying placeholder for empty titles)
      const title =
        typeof metadata.flint_title === 'string' &&
        (metadata.flint_title as string).trim().length > 0
          ? (metadata.flint_title as string)
          : typeof metadata.title === 'string' &&
              (metadata.title as string).trim().length > 0
            ? (metadata.title as string)
            : '';

      // Get ID from frontmatter (for migrated notes with immutable IDs)
      // Fall back to old-style ID if frontmatter doesn't have one
      let id: string;
      if (typeof metadata.id === 'string' && metadata.id.startsWith('n-')) {
        id = metadata.id;
      } else {
        // Generate old-style ID for legacy notes without immutable IDs
        const baseFilename = filename.replace(/\.md$/, '');
        id = `${type}/${baseFilename}`;
      }

      return {
        id,
        title,
        content: bodyContent,
        type,
        filename,
        metadata: metadata
      };
    } catch (error) {
      console.error(`Failed to parse note content for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Refresh database connections to see latest data after rebuild
   * This is critical for SQLite WAL mode to avoid stale read snapshots
   */
  async refreshConnections(): Promise<void> {
    // Close existing connections
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.isInitialized = false;
    }
    if (this.readOnlyConnection) {
      await this.readOnlyConnection.close();
      this.readOnlyConnection = null;
    }

    // Reinitialize to get fresh connections
    await this.ensureInitialized();
  }

  /**
   * Get a note by ID from the database (Phase 2.5: DB-first reads)
   * Returns the full note with content and metadata
   */
  async getNoteById(id: string): Promise<{
    id: string;
    title: string;
    content: string;
    type: string;
    flint_kind: string | undefined;
    filename: string;
    path: string;
    created: string;
    updated: string;
    size: number;
    content_hash: string | null;
    metadata: Record<string, unknown>;
  } | null> {
    const connection = await this.getConnection();

    try {
      // Query note from database
      const note = await connection.get<NoteRow>('SELECT * FROM notes WHERE id = ?', [
        id
      ]);

      if (!note) {
        return null;
      }

      // Query metadata
      const metadataRows = await connection.all<{
        key: string;
        value: string;
        value_type: 'string' | 'number' | 'date' | 'boolean' | 'array';
      }>('SELECT key, value, value_type FROM note_metadata WHERE note_id = ?', [id]);

      // Reconstruct metadata object
      const metadata: Record<string, unknown> = {};
      for (const row of metadataRows) {
        metadata[row.key] = this.deserializeMetadataValue(row.value, row.value_type);
      }

      // Convert relative path to absolute path
      const absolutePath = path.isAbsolute(note.path)
        ? note.path
        : path.join(this.workspacePath, note.path);

      return {
        id: note.id,
        title: note.title,
        content: note.content || '',
        type: note.type,
        flint_kind: note.flint_kind || undefined,
        filename: note.filename,
        path: absolutePath,
        created: note.created,
        updated: note.updated,
        size: note.size || 0,
        content_hash: note.content_hash,
        metadata
      };
    } catch (error) {
      throw new Error(
        `Failed to get note by ID: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get a note by file path from the database (Phase 2.5: DB-first reads)
   * Returns the full note with content and metadata
   */
  async getNoteByPath(filePath: string): Promise<{
    id: string;
    title: string;
    content: string;
    type: string;
    flint_kind: string | undefined;
    filename: string;
    path: string;
    created: string;
    updated: string;
    size: number;
    content_hash: string | null;
    metadata: Record<string, unknown>;
  } | null> {
    const connection = await this.getConnection();

    try {
      // Convert absolute path to relative path for query
      const relativePath = toRelativePath(filePath, this.workspacePath);

      // Query note from database
      const note = await connection.get<NoteRow>('SELECT * FROM notes WHERE path = ?', [
        relativePath
      ]);

      if (!note) {
        return null;
      }

      // Query metadata
      const metadataRows = await connection.all<{
        key: string;
        value: string;
        value_type: 'string' | 'number' | 'date' | 'boolean' | 'array';
      }>('SELECT key, value, value_type FROM note_metadata WHERE note_id = ?', [note.id]);

      // Reconstruct metadata object
      const metadata: Record<string, unknown> = {};
      for (const row of metadataRows) {
        metadata[row.key] = this.deserializeMetadataValue(row.value, row.value_type);
      }

      // Convert relative path back to absolute path
      const absolutePath = path.isAbsolute(note.path)
        ? note.path
        : path.join(this.workspacePath, note.path);

      return {
        id: note.id,
        title: note.title,
        content: note.content || '',
        type: note.type,
        flint_kind: note.flint_kind || undefined,
        filename: note.filename,
        path: absolutePath,
        created: note.created,
        updated: note.updated,
        size: note.size || 0,
        content_hash: note.content_hash,
        metadata
      };
    } catch (error) {
      throw new Error(
        `Failed to get note by path: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * List notes from the database with optional filtering (Phase 2.5: DB-first reads)
   * Returns notes with minimal metadata for list views
   */
  async listNotes(
    options: {
      type?: string;
      limit?: number;
      offset?: number;
      includeArchived?: boolean;
    } = {}
  ): Promise<
    Array<{
      id: string;
      type: string;
      filename: string;
      title: string;
      created: string;
      modified: string;
      size: number;
      path: string;
      archived?: boolean;
      flint_kind?: string;
    }>
  > {
    const connection = await this.getConnection();

    try {
      let query = 'SELECT * FROM notes';
      const params: (string | number)[] = [];

      // Filter out archived notes by default (unless includeArchived is true)
      const conditions: string[] = [];
      if (!options.includeArchived) {
        conditions.push('archived = 0');
      }

      if (options.type) {
        conditions.push('type = ?');
        params.push(options.type);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY updated DESC';

      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      if (options.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }

      const notes = await connection.all<NoteRow>(query, params);

      // Map notes to result format
      const results = notes.map((note) => {
        // Convert relative path to absolute path
        const absolutePath = path.isAbsolute(note.path)
          ? note.path
          : path.join(this.workspacePath, note.path);

        return {
          id: note.id,
          type: note.type,
          filename: note.filename,
          title: note.title,
          created: note.created,
          modified: note.updated, // Use 'updated' as 'modified' for consistency
          size: note.size || 0,
          path: absolutePath,
          archived: note.archived === 1,
          flint_kind: note.flint_kind || undefined
        };
      });

      return results;
    } catch (error) {
      throw new Error(
        `Failed to list notes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Helper to deserialize metadata values from database
   */
  private deserializeMetadataValue(
    value: string,
    type: 'string' | 'number' | 'date' | 'boolean' | 'array'
  ): unknown {
    switch (type) {
      case 'boolean':
        return value === 'true';
      case 'number':
        return parseFloat(value);
      case 'array':
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      case 'date':
        return value;
      default:
        return value;
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.isInitialized = false;
    }
    if (this.readOnlyConnection) {
      await this.readOnlyConnection.close();
      this.readOnlyConnection = null;
    }
  }

  // Utility method to get database statistics
  async getStats(): Promise<{
    noteCount: number;
    metadataCount: number;
    dbSize: number;
  }> {
    const dbPath = path.join(this.workspacePath, '.flint-note', 'search.db');

    // Check if database file exists first
    try {
      await fs.access(dbPath);
    } catch {
      // Database doesn't exist yet
      return {
        noteCount: 0,
        metadataCount: 0,
        dbSize: 0
      };
    }

    try {
      const connection = await this.getConnection();

      const [noteResult, metadataResult] = await Promise.all([
        connection.get<{ count: number }>('SELECT COUNT(*) as count FROM notes'),
        connection.get<{ count: number }>('SELECT COUNT(*) as count FROM note_metadata')
      ]);

      // Get database file size
      let dbSize = 0;
      try {
        const stats = await fs.stat(dbPath);
        dbSize = stats.size;
      } catch {
        // Ignore errors getting file size
        dbSize = 0;
      }

      return {
        noteCount: noteResult?.count || 0,
        metadataCount: metadataResult?.count || 0,
        dbSize
      };
    } catch (error) {
      // If database doesn't exist or can't connect, return zero stats
      console.error('Failed to get database stats:', error);
      return {
        noteCount: 0,
        metadataCount: 0,
        dbSize: 0
      };
    }
  }
}
