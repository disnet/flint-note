import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createTestDb } from '../helpers/test-db.js';
import type { Database } from 'bun:sqlite';

let testDb: Database;

// Mock getDb before importing vault-access
mock.module('../../src/db.js', () => ({
  getDb: () => testDb
}));

const { registerVault, canAccessDocument, registerContentDoc, resetAccessStatements } =
  await import('../../src/sync/vault-access.js');

beforeEach(() => {
  resetAccessStatements();
  testDb = createTestDb();
});

describe('registerVault', () => {
  it('inserts new vault row', () => {
    const result = registerVault(
      'did:user:alice',
      'vault-1',
      'automerge:doc1',
      'My Vault'
    );
    expect(result).toBe(true);

    const row = testDb
      .query('SELECT * FROM vault_access WHERE user_did = ? AND vault_id = ?')
      .get('did:user:alice', 'vault-1') as Record<string, unknown>;
    expect(row).not.toBeNull();
    expect(row.doc_url).toBe('automerge:doc1');
    expect(row.vault_name).toBe('My Vault');
  });

  it('rejects doc_url owned by different user', () => {
    registerVault('did:user:alice', 'vault-1', 'automerge:doc1');
    const result = registerVault('did:user:bob', 'vault-2', 'automerge:doc1');
    expect(result).toBe(false);
  });

  it('allows same user to re-register', () => {
    registerVault('did:user:alice', 'vault-1', 'automerge:doc1', 'Name1');
    const result = registerVault('did:user:alice', 'vault-1', 'automerge:doc2', 'Name2');
    expect(result).toBe(true);

    const row = testDb
      .query('SELECT * FROM vault_access WHERE user_did = ? AND vault_id = ?')
      .get('did:user:alice', 'vault-1') as Record<string, unknown>;
    expect(row.doc_url).toBe('automerge:doc2');
    expect(row.vault_name).toBe('Name2');
  });
});

describe('canAccessDocument', () => {
  it('returns true for registered vault doc', () => {
    registerVault('did:user:alice', 'vault-1', 'automerge:doc1');
    expect(canAccessDocument('did:user:alice', 'automerge:doc1')).toBe(true);
  });

  it('returns true for registered content doc', () => {
    registerVault('did:user:alice', 'vault-1', 'automerge:vaultdoc');
    registerContentDoc('did:user:alice', 'vault-1', 'automerge:content1');
    expect(canAccessDocument('did:user:alice', 'automerge:content1')).toBe(true);
  });

  it('returns false for unregistered doc', () => {
    expect(canAccessDocument('did:user:alice', 'automerge:unknown')).toBe(false);
  });

  it('isolates users', () => {
    registerVault('did:user:alice', 'vault-1', 'automerge:doc1');
    expect(canAccessDocument('did:user:bob', 'automerge:doc1')).toBe(false);
  });
});

describe('registerContentDoc', () => {
  it('is idempotent', () => {
    registerVault('did:user:alice', 'vault-1', 'automerge:vaultdoc');
    registerContentDoc('did:user:alice', 'vault-1', 'automerge:content1');
    registerContentDoc('did:user:alice', 'vault-1', 'automerge:content1');

    const rows = testDb
      .query('SELECT * FROM content_doc_access WHERE doc_url = ?')
      .all('automerge:content1');
    expect(rows.length).toBe(1);
  });
});
