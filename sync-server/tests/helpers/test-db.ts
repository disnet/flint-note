import { Database } from 'bun:sqlite';

export function createTestDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_access (
      user_did TEXT NOT NULL,
      vault_id TEXT NOT NULL,
      doc_url TEXT NOT NULL,
      vault_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_did, vault_id)
    );

    CREATE TABLE IF NOT EXISTS content_doc_access (
      doc_url TEXT PRIMARY KEY,
      user_did TEXT NOT NULL,
      vault_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_content_doc_user
      ON content_doc_access(user_did, vault_id);

    CREATE TABLE IF NOT EXISTS oauth_sessions (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_did TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user
      ON sessions(user_did);

    CREATE TABLE IF NOT EXISTS allowed_users (
      user_did TEXT PRIMARY KEY,
      invite_code_used TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      max_uses INTEGER NOT NULL DEFAULT 1,
      uses INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS file_metadata (
      hash TEXT NOT NULL,
      file_type TEXT NOT NULL,
      extension TEXT NOT NULL,
      user_did TEXT NOT NULL,
      vault_id TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (hash, file_type, user_did)
    );

    CREATE INDEX IF NOT EXISTS idx_file_metadata_user_vault
      ON file_metadata(user_did, vault_id);

    CREATE TABLE IF NOT EXISTS conversation_metadata (
      conversation_id TEXT NOT NULL,
      user_did TEXT NOT NULL,
      vault_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (conversation_id, user_did)
    );

    CREATE INDEX IF NOT EXISTS idx_conversation_metadata_user_vault
      ON conversation_metadata(user_did, vault_id);

    CREATE TABLE IF NOT EXISTS sync_states (
      user_did TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      peer_storage_id TEXT NOT NULL,
      sync_state BLOB NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_did, doc_id, peer_storage_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_states_user
      ON sync_states(user_did);
  `);
  return db;
}
