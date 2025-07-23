import {
  DatabaseManager,
  DatabaseConnection,
  NoteRow,
  MetadataRow,
  SearchRow,
  serializeMetadataValue,
  deserializeMetadataValue as _deserializeMetadataValue
} from './schema.js';
import { NoteMetadata, NoteLink as _NoteLink } from '../types/index.js';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

export interface SearchResult {
  id: string;
  title: string;
  type: string;
  tags: string[];
  score: number;
  snippet: string;
  lastUpdated: string;
  filename: string;
  path: string;
  created: string;
  modified: string;
  size: number;
  metadata: NoteMetadata;
  // Allow additional properties for aggregation results
  [key: string]: unknown;
}

export interface AdvancedSearchOptions {
  type?: string;
  metadata_filters?: Array<{
    key: string;
    value: string;
    operator?: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN';
  }>;
  updated_within?: string; // e.g., '7d', '1w', '2m'
  updated_before?: string;
  created_within?: string;
  created_before?: string;
  content_contains?: string;
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

export class HybridSearchManager {
  private dbManager: DatabaseManager;
  private workspacePath: string;
  private connection: DatabaseConnection | null = null;
  private readOnlyConnection: DatabaseConnection | null = null;
  private isInitialized = false;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.dbManager = new DatabaseManager(workspacePath);
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

  // Simple text search (backward compatible)
  async searchNotes(
    query: string | undefined,
    typeFilter: string | null = null,
    limit: number = 10,
    useRegex: boolean = false
  ): Promise<SearchResult[]> {
    const connection = await this.getReadOnlyConnection();

    try {
      const safeQuery = (query ?? '').trim();
      let sql: string;
      let params: (string | number)[] = [];

      if (!safeQuery) {
        // Return all notes
        sql = `
          SELECT n.*,
                 1.0 as score
          FROM notes n
          ${typeFilter ? 'WHERE n.type = ?' : ''}
          ORDER BY n.updated DESC
          LIMIT ?
        `;
        params = typeFilter ? [typeFilter, limit] : [limit];
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
              if (filteredRows.length >= limit) break;
            }
          }
        } catch (_regexError) {
          throw new Error(`Invalid regex pattern: ${safeQuery}`);
        }

        const results = await this.convertRowsToResults(filteredRows, connection);
        return results;
      } else {
        // Use FTS for text search with proper escaping
        const escapedQuery = this.escapeFTSQuery(safeQuery);
        if (!escapedQuery) {
          // If query can't be escaped for FTS, fall back to LIKE search
          sql = `
            SELECT n.*,
                   1.0 as score
            FROM notes n
            WHERE (n.title LIKE ? OR n.content LIKE ?)${typeFilter ? 'AND n.type = ?' : ''}
            ORDER BY n.updated DESC
            LIMIT ?
          `;
          const likeQuery = `%${safeQuery}%`;
          params = typeFilter
            ? [likeQuery, likeQuery, typeFilter, limit]
            : [likeQuery, likeQuery, limit];
        } else {
          sql = `
            SELECT n.*,
                   -fts.rank as score,
                   snippet(notes_fts, 2, '<mark>', '</mark>', '...', 32) as snippet
            FROM notes_fts fts
            JOIN notes n ON n.id = fts.id
            WHERE notes_fts MATCH ?${typeFilter ? 'AND n.type = ?' : ''}
            ORDER BY fts.rank
            LIMIT ?
          `;
          params = typeFilter ? [escapedQuery, typeFilter, limit] : [escapedQuery, limit];
        }
      }

      const rows = await connection.all<SearchRow>(sql, params);
      const results = await this.convertRowsToResults(rows, connection);

      return results;
    } catch (error) {
      throw new Error(
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Escape query string for FTS5 MATCH operator
   * Returns null if query cannot be safely used with FTS
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

    // Check for FTS5 special characters that might cause syntax errors
    // Allow * for prefix matching, but escape others
    const dangerousChars = /[()@"'-]/;
    if (dangerousChars.test(trimmed)) {
      return null; // Fall back to LIKE search
    }

    // If query doesn't already end with *, add it for prefix matching
    // This allows partial word matches like "prog" -> "prog*"
    if (!trimmed.endsWith('*') && trimmed.length >= 3) {
      return trimmed + '*';
    }

    return trimmed;
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
      const params: (string | number)[] = [];
      const joins: string[] = [];

      // Type filter
      if (options.type) {
        whereConditions.push('n.type = ?');
        params.push(options.type);
      }

      // Metadata filters
      if (options.metadata_filters && options.metadata_filters.length > 0) {
        options.metadata_filters.forEach((filter, index) => {
          const alias = `m${index}`;
          joins.push(`JOIN note_metadata ${alias} ON n.id = ${alias}.note_id`);

          whereConditions.push(`${alias}.key = ?`);
          params.push(filter.key);

          const operator = filter.operator || '=';
          if (operator === 'IN') {
            const values = filter.value.split(',').map(v => v.trim());
            const placeholders = values.map(() => '?').join(',');
            whereConditions.push(`${alias}.value IN (${placeholders})`);
            params.push(...values);
          } else {
            whereConditions.push(`${alias}.value ${operator} ?`);
            params.push(filter.value);
          }
        });
      }

      // Date filters
      if (options.updated_within) {
        const date = this.parseDateFilter(options.updated_within);
        whereConditions.push('n.updated >= ?');
        params.push(date);
      }

      if (options.updated_before) {
        const date = this.parseDateFilter(options.updated_before);
        whereConditions.push('n.updated <= ?');
        params.push(date);
      }

      if (options.created_within) {
        const date = this.parseDateFilter(options.created_within);
        whereConditions.push('n.created >= ?');
        params.push(date);
      }

      if (options.created_before) {
        const date = this.parseDateFilter(options.created_before);
        whereConditions.push('n.created <= ?');
        params.push(date);
      }

      // Content search
      if (options.content_contains) {
        joins.push('JOIN notes_fts fts ON n.id = fts.id');
        whereConditions.push('notes_fts MATCH ?');
        params.push(options.content_contains);
      }

      // Build complete query
      fromClause += ' ' + joins.join(' ');

      if (whereConditions.length > 0) {
        fromClause += ' WHERE ' + whereConditions.join(' AND ');
      }

      // Add sorting
      let orderClause = '';
      if (options.sort && options.sort.length > 0) {
        const sortTerms = options.sort.map(
          sort => `n.${sort.field} ${sort.order.toUpperCase()}`
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

      const results = await this.convertRowsToResults(rows, connection);
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
        results = rows.map(row => ({
          ...row, // Preserve all custom aggregation columns first
          id: String(row.id || ''),
          title: String(row.title || ''),
          type: String(row.type || ''),
          tags: [],
          score: 1.0,
          snippet: '',
          lastUpdated: String(row.updated || ''),
          filename: String(row.filename || ''),
          path: String(row.path || ''),
          created: String(row.created || ''),
          modified: String(row.updated || ''),
          size: Number(row.size ?? 0),
          metadata: {
            title: String(row.title || ''),
            type: String(row.type || ''),
            created: String(row.created || ''),
            updated: String(row.updated || ''),
            filename: String(row.filename || '')
          }
        }));
      } else {
        // For regular note queries, convert to SearchResult format
        results = await this.convertRowsToResults(rows as SearchRow[], connection);
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
    const hasAggregation = aggregationFunctions.some(func => lowerSql.includes(func));

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
    }

    return now.toISOString();
  }

  // Convert database rows to search results
  private async convertRowsToResults(
    rows: SearchRow[],
    connection: DatabaseConnection
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const row of rows) {
      // Get metadata for this note
      const metadataRows = await connection.all<MetadataRow>(
        'SELECT key, value, value_type FROM note_metadata WHERE note_id = ?',
        [row.id]
      );

      // Convert metadata rows to object
      const metadata: NoteMetadata = {
        title: row.title,
        type: row.type,
        created: row.created,
        updated: row.updated,
        filename: row.filename
      };

      // Add custom metadata
      for (const metaRow of metadataRows) {
        metadata[metaRow.key] = _deserializeMetadataValue(
          metaRow.value,
          metaRow.value_type
        ) as
          | string
          | number
          | boolean
          | object
          | string[]
          | _NoteLink[]
          | null
          | undefined;
      }

      // Extract tags from metadata
      const tags = Array.isArray(metadata.tags) ? metadata.tags : [];

      // Generate snippet if not provided
      let snippet = row.snippet || '';
      if (!snippet && row.content) {
        snippet = this.generateSnippet(row.content);
      }

      // Get file stats
      const stats = await this.getFileStats(row.path);

      results.push({
        id: row.id,
        title: row.title,
        type: row.type,
        tags,
        score: row.score || 1.0,
        snippet,
        lastUpdated: row.updated,
        filename: row.filename,
        path: row.path,
        created: stats.created,
        modified: stats.modified,
        size: stats.size,
        metadata
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
  ): Promise<{ created: string; modified: string; size: number }> {
    try {
      const stats = await fs.stat(filePath);
      return {
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        size: stats.size
      };
    } catch {
      return {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        size: 0
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

      // Check if note exists
      const existing = await connection.get<NoteRow>(
        'SELECT id FROM notes WHERE id = ?',
        [id]
      );

      if (existing) {
        // Update existing note
        await connection.run(
          `UPDATE notes SET
           title = ?, content = ?, type = ?, filename = ?, path = ?,
           updated = ?, size = ?, content_hash = ?
           WHERE id = ?`,
          [title, content, type, filename, filePath, now, stats.size, contentHash, id]
        );
      } else {
        // Insert new note
        await connection.run(
          `INSERT INTO notes
           (id, title, content, type, filename, path, created, updated, size, content_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            title,
            content,
            type,
            filename,
            filePath,
            stats.created,
            now,
            stats.size,
            contentHash
          ]
        );
      }

      // Update metadata
      await connection.run('DELETE FROM note_metadata WHERE note_id = ?', [id]);

      for (const [key, value] of Object.entries(metadata)) {
        if (value != null && key !== 'filename') {
          // Skip null values and filename
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
    const _connection = await this.getConnection();

    try {
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
        batch.map(async filePath => {
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

  // Scan workspace for all note files
  private async scanForNoteFiles(): Promise<string[]> {
    const noteFiles: string[] = [];

    try {
      const entries = await fs.readdir(this.workspacePath, { withFileTypes: true });

      // Process directories in parallel
      const dirPromises = entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(async entry => {
          try {
            const dirPath = path.join(this.workspacePath, entry.name);
            const dirFiles = await fs.readdir(dirPath);

            return dirFiles
              .filter(
                file =>
                  file.endsWith('.md') && !file.startsWith('.') && !file.startsWith('_')
              )
              .map(file => path.join(dirPath, file));
          } catch (error) {
            console.error(`Error scanning directory ${entry.name}:`, error);
            return [];
          }
        });

      const results = await Promise.all(dirPromises);
      noteFiles.push(...results.flat());
    } catch (error) {
      console.error('Error scanning for note files:', error);
    }

    return noteFiles;
  }

  // Index a single note file
  private async indexNoteFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = this.parseNoteContent(filePath, content);

      if (parsed) {
        await this.upsertNote(
          parsed.id,
          parsed.title,
          parsed.content,
          parsed.type,
          parsed.filename,
          filePath,
          parsed.metadata as NoteMetadata
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to index note file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      // Parse frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      const metadata: Record<string, unknown> = {};
      let bodyContent = content;

      if (frontmatterMatch) {
        try {
          // Simple YAML parser for basic metadata
          const yamlContent = frontmatterMatch[1];
          const lines = yamlContent.split('\n');

          for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).trim();
              const value = line.substring(colonIndex + 1).trim();

              if (key && value) {
                // Remove quotes if present
                const cleanValue = value.replace(/^["']|["']$/g, '');

                // Handle arrays (simple case)
                if (cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
                  metadata[key] = cleanValue
                    .slice(1, -1)
                    .split(',')
                    .map(v => v.trim().replace(/^["']|["']$/g, ''));
                } else {
                  // Handle numbers
                  if (/^\d+(\.\d+)?$/.test(cleanValue)) {
                    metadata[key] = parseFloat(cleanValue);
                  } else if (cleanValue === 'true') {
                    metadata[key] = true;
                  } else if (cleanValue === 'false') {
                    metadata[key] = false;
                  } else if (cleanValue === 'null') {
                    metadata[key] = null;
                  } else {
                    metadata[key] = cleanValue;
                  }
                }
              }
            }
          }

          bodyContent = frontmatterMatch[2];
        } catch (error) {
          console.error(`Failed to parse frontmatter in ${filePath}:`, error);
        }
      }

      const filename = path.basename(filePath);
      const parentDir = path.basename(path.dirname(filePath));

      // Determine note type from directory name or metadata
      const type =
        (typeof metadata.type === 'string' ? metadata.type : null) || parentDir;

      // Determine title from metadata or filename
      const title =
        (typeof metadata.title === 'string' ? metadata.title : null) ||
        filename.replace('.md', '');

      // Generate note ID (remove .md extension for consistency)
      const baseFilename = filename.replace(/\.md$/, '');
      const id = `${type}/${baseFilename}`;

      return {
        id,
        title,
        content: bodyContent,
        type,
        filename,
        metadata: {
          title,
          type,
          created: metadata.created || new Date().toISOString(),
          updated: metadata.updated || new Date().toISOString(),
          ...metadata
        }
      };
    } catch (error) {
      console.error(`Failed to parse note content for ${filePath}:`, error);
      return null;
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
