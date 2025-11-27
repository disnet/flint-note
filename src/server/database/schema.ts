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
  private readOnlyDb: sqlite3.Database | null = null;
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
        (err) => {
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

  async connectReadOnly(): Promise<DatabaseConnection> {
    if (this.readOnlyDb) {
      return this.createConnection(this.readOnlyDb);
    }

    // Ensure the database exists first by creating a read-write connection
    if (!this.db) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.readOnlyDb = new sqlite3.Database(
        this.dbPath,
        sqlite3.OPEN_READONLY,
        (err) => {
          if (err) {
            reject(new Error(`Failed to connect to read-only database: ${err.message}`));
            return;
          }

          resolve(this.createConnection(this.readOnlyDb!));
        }
      );
    });
  }

  private createConnection(db: sqlite3.Database): DatabaseConnection {
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
        if (this.db === db) {
          this.db = null;
        }
        if (this.readOnlyDb === db) {
          this.readOnlyDb = null;
        }
      }
    };
  }

  private async initializeSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const connection = this.createConnection(this.db);

    // Retry schema initialization with exponential backoff for database busy errors
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        await this.doInitializeSchema(connection);
        return; // Success, exit retry loop
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('SQLITE_BUSY') && retryCount < maxRetries - 1) {
          retryCount++;
          const delay = Math.min(100 * Math.pow(2, retryCount - 1), 1000); // Exponential backoff, max 1s
          console.warn(
            `Database busy during schema init, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`Failed to initialize database schema: ${error}`);
      }
    }
  }

  private async doInitializeSchema(connection: DatabaseConnection): Promise<void> {
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
          title TEXT,
          content TEXT,
          type TEXT NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          created DATETIME NOT NULL,
          updated DATETIME NOT NULL,
          size INTEGER,
          content_hash TEXT,
          file_mtime BIGINT,
          archived INTEGER DEFAULT 0,
          UNIQUE(type, filename)
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

    // Create internal links table (wikilinks)
    await connection.run(`
        CREATE TABLE IF NOT EXISTS note_links (
          id INTEGER PRIMARY KEY,
          source_note_id TEXT NOT NULL,
          target_note_id TEXT,
          target_title TEXT NOT NULL,
          link_text TEXT,
          line_number INTEGER,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (target_note_id) REFERENCES notes(id) ON DELETE SET NULL
        )
      `);

    // Create external links table
    await connection.run(`
        CREATE TABLE IF NOT EXISTS external_links (
          id INTEGER PRIMARY KEY,
          note_id TEXT NOT NULL,
          url TEXT NOT NULL,
          title TEXT,
          line_number INTEGER,
          link_type TEXT DEFAULT 'url' CHECK (link_type IN ('url', 'image', 'embed')),
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

    // Create UI state table for storing vault-specific UI state
    await connection.run(`
        CREATE TABLE IF NOT EXISTS ui_state (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vault_id TEXT NOT NULL,
          state_key TEXT NOT NULL,
          state_value TEXT NOT NULL,
          schema_version TEXT NOT NULL DEFAULT '2.0.0',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(vault_id, state_key)
        )
      `);

    await connection.run(`
        CREATE INDEX IF NOT EXISTS idx_ui_state_vault
        ON ui_state(vault_id)
      `);

    await connection.run(`
        CREATE INDEX IF NOT EXISTS idx_ui_state_key
        ON ui_state(vault_id, state_key)
      `);

    // Create note hierarchies table for parent-child relationships
    await connection.run(`
        CREATE TABLE IF NOT EXISTS note_hierarchies (
          id INTEGER PRIMARY KEY,
          parent_id TEXT NOT NULL,
          child_id TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          created DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(parent_id, child_id),
          FOREIGN KEY (parent_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (child_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

    // Create processed notes table for inbox functionality
    await connection.run(`
        CREATE TABLE IF NOT EXISTS processed_notes (
          id INTEGER PRIMARY KEY,
          note_id TEXT NOT NULL UNIQUE,
          processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

    // Create note type descriptions table for storing note type metadata
    await connection.run(`
        CREATE TABLE IF NOT EXISTS note_type_descriptions (
          id TEXT PRIMARY KEY,
          vault_id TEXT NOT NULL,
          type_name TEXT NOT NULL,
          purpose TEXT,
          agent_instructions TEXT,
          metadata_schema TEXT,
          content_hash TEXT,
          icon TEXT,
          suggestions_config TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(vault_id, type_name)
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
    // Additional indexes for daily view date queries
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_notes_type_created ON notes(type, created)'
    );
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_notes_type_updated ON notes(type, updated)'
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

    // Create indexes for link tables
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_note_id)'
    );
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_note_id)'
    );
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_note_links_target_title ON note_links(target_title)'
    );
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_external_links_note ON external_links(note_id)'
    );
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_external_links_url ON external_links(url)'
    );

    // Create indexes for hierarchy table
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_note_hierarchies_parent ON note_hierarchies(parent_id)'
    );
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_note_hierarchies_child ON note_hierarchies(child_id)'
    );
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_note_hierarchies_position ON note_hierarchies(parent_id, position)'
    );

    // Create index for processed notes table
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_processed_notes_note_id ON processed_notes(note_id)'
    );

    // Create index for note type descriptions table
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_note_type_descriptions_vault ON note_type_descriptions(vault_id)'
    );

    // Create review_items table for spaced repetition
    await connection.run(`
        CREATE TABLE IF NOT EXISTS review_items (
          id TEXT PRIMARY KEY,
          note_id TEXT NOT NULL UNIQUE,
          vault_id TEXT NOT NULL,
          enabled BOOLEAN DEFAULT TRUE,
          last_reviewed TEXT,
          next_review TEXT NOT NULL,
          review_count INTEGER DEFAULT 0,
          review_history TEXT,
          next_session_number INTEGER DEFAULT 1,
          current_interval INTEGER DEFAULT 1,
          status TEXT DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

    // Create indexes for review_items table
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_review_next_review ON review_items(next_review, enabled)'
    );
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_review_vault ON review_items(vault_id)'
    );
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_review_session ON review_items(next_session_number, status, enabled)'
    );

    // Create review_state table for global session tracking
    await connection.run(`
        CREATE TABLE IF NOT EXISTS review_state (
          id INTEGER PRIMARY KEY DEFAULT 1,
          current_session_number INTEGER DEFAULT 0,
          last_session_completed_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

    // Create review_config table for user preferences
    await connection.run(`
        CREATE TABLE IF NOT EXISTS review_config (
          id INTEGER PRIMARY KEY DEFAULT 1,
          session_size INTEGER DEFAULT 5,
          sessions_per_week INTEGER DEFAULT 7,
          max_interval_sessions INTEGER DEFAULT 15,
          min_interval_days INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

    // Create note_suggestions table for AI-generated note suggestions
    await connection.run(`
        CREATE TABLE IF NOT EXISTS note_suggestions (
          id INTEGER PRIMARY KEY,
          note_id TEXT NOT NULL UNIQUE,
          suggestions TEXT NOT NULL,
          generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          model_version TEXT,
          dismissed_ids TEXT,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

    // Create indexes for note_suggestions table
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_note_suggestions_note_id ON note_suggestions(note_id)'
    );
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_note_suggestions_generated_at ON note_suggestions(generated_at)'
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
  }

  async rebuild(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const connection = this.createConnection(this.db);

    try {
      // Use more efficient bulk delete with transaction
      await connection.run('BEGIN TRANSACTION');
      await connection.run('DELETE FROM external_links');
      await connection.run('DELETE FROM note_links');
      await connection.run('DELETE FROM note_hierarchies');
      await connection.run('DELETE FROM note_metadata');
      await connection.run('DELETE FROM notes');
      await connection.run('DELETE FROM notes_fts');
      // Clear UI state to prevent references to notes that haven't been reindexed yet
      await connection.run('DELETE FROM ui_state');
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
    if (this.readOnlyDb) {
      const readOnlyConnection = this.createConnection(this.readOnlyDb);
      await readOnlyConnection.close();
    }
  }
}

// Database row interfaces
export interface NoteRow {
  id: string;
  title: string;
  content: string | null;
  type: string;
  flint_kind: string | null; // Content rendering type (markdown, epub)
  filename: string;
  path: string;
  created: string;
  updated: string;
  size: number | null;
  content_hash: string | null;
  file_mtime: number | null;
  archived: number; // SQLite boolean (0 or 1)
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

export interface NoteLinkRow {
  id: number;
  source_note_id: string;
  target_note_id: string | null;
  target_title: string;
  link_text: string | null;
  line_number: number | null;
  created: string;
}

export interface ExternalLinkRow {
  id: number;
  note_id: string;
  url: string;
  title: string | null;
  line_number: number | null;
  link_type: 'url' | 'image' | 'embed';
  created: string;
}

export interface NoteHierarchyRow {
  id: number;
  parent_id: string;
  child_id: string;
  position: number;
  created: string;
  updated: string;
}

export interface ProcessedNoteRow {
  id: number;
  note_id: string;
  processed_at: string;
}

export interface UIStateRow {
  id: number;
  vault_id: string;
  state_key: string;
  state_value: string;
  schema_version: string;
  updated_at: string;
}

export interface SlashCommandRow {
  id: string;
  name: string;
  instruction: string;
  parameters: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteTypeDescriptionRow {
  id: string;
  vault_id: string;
  type_name: string;
  purpose: string | null;
  agent_instructions: string | null;
  metadata_schema: string | null;
  content_hash: string | null;
  icon: string | null;
  suggestions_config: string | null;
  default_review_mode: number | null; // SQLite boolean (0 or 1)
  created_at: string;
  updated_at: string;
}

export interface ReviewItemRow {
  id: string;
  note_id: string;
  vault_id: string;
  enabled: number; // SQLite boolean (0 or 1)
  last_reviewed: string | null;
  next_review: string;
  review_count: number;
  review_history: string | null; // JSON array
  next_session_number: number;
  current_interval: number;
  status: string; // 'active' | 'retired'
  created_at: string;
  updated_at: string;
}

export interface ReviewStateRow {
  id: number;
  current_session_number: number;
  last_session_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewConfigRow {
  id: number;
  session_size: number;
  sessions_per_week: number;
  max_interval_sessions: number;
  min_interval_days: number;
  created_at: string;
  updated_at: string;
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
