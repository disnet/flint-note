import { getDb } from '../db.js';

export interface VaultInfo {
  vaultId: string;
  docUrl: string;
  vaultName: string | null;
  createdAt: string;
}

/**
 * Register a vault for sync. Returns false if the doc_url is already
 * owned by a different user (prevents cross-user sync leakage).
 */
export function registerVault(
  userDid: string,
  vaultId: string,
  docUrl: string,
  vaultName?: string
): boolean {
  const db = getDb();

  // Check if this doc_url is already registered by a different user
  const existing = db
    .query('SELECT user_did FROM vault_access WHERE doc_url = ? AND user_did != ?')
    .get(docUrl, userDid) as { user_did: string } | null;
  if (existing) {
    return false;
  }

  db.query(
    `INSERT INTO vault_access (user_did, vault_id, doc_url, vault_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_did, vault_id) DO UPDATE SET
      doc_url = excluded.doc_url,
      vault_name = excluded.vault_name`
  ).run(userDid, vaultId, docUrl, vaultName ?? null);
  return true;
}

export function userOwnsVault(userDid: string, vaultId: string): boolean {
  const db = getDb();
  const row = db
    .query('SELECT 1 FROM vault_access WHERE user_did = ? AND vault_id = ?')
    .get(userDid, vaultId);
  return !!row;
}

export function registerContentDoc(
  userDid: string,
  vaultId: string,
  docUrl: string
): void {
  const db = getDb();
  db.query(
    `INSERT OR IGNORE INTO content_doc_access (doc_url, user_did, vault_id)
    VALUES (?, ?, ?)`
  ).run(docUrl, userDid, vaultId);
}

export function getUserVaults(userDid: string): VaultInfo[] {
  const db = getDb();
  return db
    .query(
      `SELECT vault_id as vaultId, doc_url as docUrl, vault_name as vaultName, created_at as createdAt
       FROM vault_access WHERE user_did = ?`
    )
    .all(userDid) as VaultInfo[];
}

export function canAccessDocument(userDid: string, docUrl: string): boolean {
  const db = getDb();

  // Check vault root documents
  const vaultAccess = db
    .query('SELECT 1 FROM vault_access WHERE user_did = ? AND doc_url = ?')
    .get(userDid, docUrl);
  if (vaultAccess) return true;

  // Check content documents
  const contentAccess = db
    .query(
      `SELECT 1 FROM content_doc_access
       WHERE doc_url = ? AND user_did = ?`
    )
    .get(docUrl, userDid);
  return !!contentAccess;
}

export function getVaultContentDocs(userDid: string, vaultId: string): string[] {
  const db = getDb();
  return db
    .query('SELECT doc_url FROM content_doc_access WHERE user_did = ? AND vault_id = ?')
    .all(userDid, vaultId)
    .map((row) => (row as { doc_url: string }).doc_url);
}
