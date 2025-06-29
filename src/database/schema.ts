import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

export interface DatabaseConnection {
  db: sqlite3.Database;
  run: (
    sql: string,
    params?: (string | number | boolean | null)[]
  ) => Promise<sqlite3.RunResult>;
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

export class DatabaseManager {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor(workspacePath: string) {
    this.dbPath = path.join(workspacePath, '.flint-note', 'search.db');
  }

  async connect(): Promise<DatabaseConnection> {
    if (this.db) {
      return this.createConnection(this.db);
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

    return new Promise((resolve, reject) => {
      // Use faster WAL mode and optimize for Windows
      this.db = new sqlite3.Database(
        this.dbPath,
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        err => {
          if (err) {
            reject(new Error(`Failed to connect to database: ${err.message}`));
            return;
          }

          this.initializeSchema()
            .then(() => resolve(this.createConnection(this.db!)))
            .catch(reject);
        }
      );
    });
  }

  private createConnection(db: sqlite3.Database): DatabaseConnection {
    const _run = promisify(db.run.bind(db));
    const _get = promisify(db.get.bind(db));
    const _all = promisify(db.all.bind(db));
    const close = promisify(db.close.bind(db));

    return {
      db,
      run: async (sql: string, params?: (string | number | boolean | null)[]) => {
        return new Promise<sqlite3.RunResult>((resolve, reject) => {
          if (params && params.length > 0) {
            db.run(sql, params, function (err) {
              if (err) reject(err);
              else resolve(this);
            });
          } else {
            db.run(sql, function (err) {
              if (err) reject(err);
              else resolve(this);
            });
          }
        });
      },
      get: async <T = unknown>(
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
      all: async <T = unknown>(
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
      close: async () => {
        await close();
        this.db = null;
      }
    };
  }

  private async initializeSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const connection = this.createConnection(this.db);

    try {
      // Enable foreign keys and optimize for performance
      await connection.run('PRAGMA foreign_keys = ON');
      await connection.run('PRAGMA journal_mode = WAL');
      await connection.run('PRAGMA synchronous = NORMAL');
      await connection.run('PRAGMA cache_size = 10000');
      await connection.run('PRAGMA temp_store = MEMORY');

      // Create notes table
      await connection.run(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          created DATETIME NOT NULL,
          updated DATETIME NOT NULL,
          size INTEGER,
          content_hash TEXT
        )
      `);

      // Create metadata table
      await connection.run(`
        CREATE TABLE IF NOT EXISTS note_metadata (
          note_id TEXT,
          key TEXT,
          value TEXT,
          value_type TEXT CHECK (value_type IN ('string', 'number', 'date', 'boolean', 'array')),
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

      // Create full-text search table
      await connection.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
          id UNINDEXED,
          title,
          content,
          type UNINDEXED,
          content=notes,
          content_rowid=rowid
        )
      `);

      // Create indexes for performance
      await connection.run('CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type)');
      await connection.run(
        'CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated)'
      );
      await connection.run(
        'CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created)'
      );
      await connection.run(
        'CREATE INDEX IF NOT EXISTS idx_metadata_key ON note_metadata(key)'
      );
      await connection.run(
        'CREATE INDEX IF NOT EXISTS idx_metadata_key_value ON note_metadata(key, value)'
      );
      await connection.run(
        'CREATE INDEX IF NOT EXISTS idx_metadata_note_id ON note_metadata(note_id)'
      );

      // Create triggers to keep FTS table in sync
      await connection.run(`
        CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
          INSERT INTO notes_fts(rowid, id, title, content, type)
          VALUES (new.rowid, new.id, new.title, new.content, new.type);
        END
      `);

      await connection.run(`
        CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
          INSERT INTO notes_fts(notes_fts, rowid, id, title, content, type)
          VALUES('delete', old.rowid, old.id, old.title, old.content, old.type);
        END
      `);

      await connection.run(`
        CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
          INSERT INTO notes_fts(notes_fts, rowid, id, title, content, type)
          VALUES('delete', old.rowid, old.id, old.title, old.content, old.type);
          INSERT INTO notes_fts(rowid, id, title, content, type)
          VALUES (new.rowid, new.id, new.title, new.content, new.type);
        END
      `);
    } catch (error) {
      throw new Error(`Failed to initialize database schema: ${error}`);
    }
  }

  async rebuild(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const connection = this.createConnection(this.db);

    try {
      // Use more efficient bulk delete with transaction
      await connection.run('BEGIN TRANSACTION');
      await connection.run('DELETE FROM note_metadata');
      await connection.run('DELETE FROM notes');
      await connection.run('DELETE FROM notes_fts');
      await connection.run('COMMIT');

      // Optimize database after bulk operations
      await connection.run('VACUUM');
      await connection.run('ANALYZE');
    } catch (error) {
      await connection.run('ROLLBACK');
      throw new Error(`Failed to rebuild database: ${error}`);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      const connection = this.createConnection(this.db);
      await connection.close();
    }
  }
}

// Database row interfaces
export interface NoteRow {
  id: string;
  title: string;
  content: string | null;
  type: string;
  filename: string;
  path: string;
  created: string;
  updated: string;
  size: number | null;
  content_hash: string | null;
}

export interface MetadataRow {
  note_id: string;
  key: string;
  value: string;
  value_type: 'string' | 'number' | 'date' | 'boolean' | 'array';
}

export interface SearchRow extends NoteRow {
  rank?: number;
  snippet?: string;
  score?: number;
}

// Helper functions for metadata type conversion
export function serializeMetadataValue(value: unknown): {
  value: string;
  type: MetadataRow['value_type'];
} {
  if (value === null || value === undefined) {
    return { value: '', type: 'string' };
  }

  if (Array.isArray(value)) {
    return { value: JSON.stringify(value), type: 'array' };
  }

  if (typeof value === 'boolean') {
    return { value: value.toString(), type: 'boolean' };
  }

  if (typeof value === 'number') {
    return { value: value.toString(), type: 'number' };
  }

  if (
    value instanceof Date ||
    (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))
  ) {
    return { value: value.toString(), type: 'date' };
  }

  return { value: value.toString(), type: 'string' };
}

export function deserializeMetadataValue(
  value: string,
  type: MetadataRow['value_type']
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
