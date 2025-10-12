/**
 * Tests for note_type_descriptions database table operations
 * These tests verify the DB schema and CRUD operations for note type descriptions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../../src/server/database/schema.js';
import type { DatabaseConnection } from '../../../src/server/database/schema.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface NoteTypeDescriptionRow {
  id: string;
  vault_id: string;
  type_name: string;
  purpose: string | null;
  agent_instructions: string | null;
  metadata_schema: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

describe('Note Type Descriptions Database Table', () => {
  let dbManager: DatabaseManager;
  let db: DatabaseConnection;
  let testDir: string;

  beforeEach(async () => {
    // Create temporary directory for test database
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'note-type-db-test-'));
    dbManager = new DatabaseManager(testDir);
    db = await dbManager.connect();
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Schema Creation', () => {
    it('should create note_type_descriptions table', async () => {
      const result = await db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='note_type_descriptions'"
      );
      expect(result?.count).toBe(1);
    });

    it('should have correct columns', async () => {
      const columns = await db.all<{ name: string; type: string }>(
        "SELECT name, type FROM pragma_table_info('note_type_descriptions')"
      );

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('vault_id');
      expect(columnNames).toContain('type_name');
      expect(columnNames).toContain('purpose');
      expect(columnNames).toContain('agent_instructions');
      expect(columnNames).toContain('metadata_schema');
      expect(columnNames).toContain('content_hash');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should have id as primary key', async () => {
      const columns = await db.all<{ name: string; pk: number }>(
        "SELECT name, pk FROM pragma_table_info('note_type_descriptions')"
      );

      const idColumn = columns.find((c) => c.name === 'id');
      expect(idColumn?.pk).toBe(1);
    });

    it('should have unique constraint on vault_id and type_name', async () => {
      // SQLite creates an automatic index for UNIQUE constraints
      // Check by trying to insert duplicate vault_id/type_name - should fail
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', 'vault1', 'daily', 'Purpose', '[]', '{}', 'hash1']
      );

      // Attempting to insert another row with same vault_id and type_name should fail
      await expect(
        db.run(
          `INSERT INTO note_type_descriptions
           (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['type2', 'vault1', 'daily', 'Different Purpose', '[]', '{}', 'hash2']
        )
      ).rejects.toThrow();
    });

    it('should have index on vault_id', async () => {
      const indexes = await db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='note_type_descriptions' AND name LIKE '%vault%'"
      );

      expect(indexes.length).toBeGreaterThan(0);
    });
  });

  describe('CRUD Operations', () => {
    const testVaultId = 'test-vault-123';
    const testTypeId = 'type-001';

    it('should insert a note type description', async () => {
      const agentInstructions = JSON.stringify(['instruction 1', 'instruction 2']);
      const metadataSchema = JSON.stringify({ fields: [] });

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          testTypeId,
          testVaultId,
          'daily',
          'Daily notes for tracking progress',
          agentInstructions,
          metadataSchema,
          'hash123'
        ]
      );

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE id = ?',
        [testTypeId]
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe(testTypeId);
      expect(result?.vault_id).toBe(testVaultId);
      expect(result?.type_name).toBe('daily');
      expect(result?.purpose).toBe('Daily notes for tracking progress');
      expect(result?.agent_instructions).toBe(agentInstructions);
      expect(result?.metadata_schema).toBe(metadataSchema);
      expect(result?.content_hash).toBe('hash123');
    });

    it('should read a note type description by id', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testTypeId, testVaultId, 'note', 'General notes', '[]', '{}', 'hash456']
      );

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE id = ?',
        [testTypeId]
      );

      expect(result?.type_name).toBe('note');
      expect(result?.purpose).toBe('General notes');
    });

    it('should read note type description by vault_id and type_name', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testTypeId, testVaultId, 'project', 'Project notes', '[]', '{}', 'hash789']
      );

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [testVaultId, 'project']
      );

      expect(result?.id).toBe(testTypeId);
      expect(result?.type_name).toBe('project');
    });

    it('should update a note type description', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testTypeId, testVaultId, 'daily', 'Old purpose', '[]', '{}', 'oldhash']
      );

      await db.run(
        `UPDATE note_type_descriptions
         SET purpose = ?, content_hash = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND content_hash = ?`,
        ['New purpose', 'newhash', testTypeId, 'oldhash']
      );

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE id = ?',
        [testTypeId]
      );

      expect(result?.purpose).toBe('New purpose');
      expect(result?.content_hash).toBe('newhash');
    });

    it('should delete a note type description', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testTypeId, testVaultId, 'daily', 'Purpose', '[]', '{}', 'hash']
      );

      await db.run('DELETE FROM note_type_descriptions WHERE id = ?', [testTypeId]);

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE id = ?',
        [testTypeId]
      );

      expect(result).toBeUndefined();
    });

    it('should list all note type descriptions for a vault', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', testVaultId, 'daily', 'Daily notes', '[]', '{}', 'hash1']
      );

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type2', testVaultId, 'note', 'General notes', '[]', '{}', 'hash2']
      );

      const results = await db.all<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? ORDER BY type_name',
        [testVaultId]
      );

      expect(results.length).toBe(2);
      expect(results[0].type_name).toBe('daily');
      expect(results[1].type_name).toBe('note');
    });
  });

  describe('Vault Isolation', () => {
    it('should not return note types from other vaults', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', 'vault1', 'daily', 'Purpose', '[]', '{}', 'hash1']
      );

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type2', 'vault2', 'daily', 'Purpose', '[]', '{}', 'hash2']
      );

      const vault1Results = await db.all<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ?',
        ['vault1']
      );

      expect(vault1Results.length).toBe(1);
      expect(vault1Results[0].vault_id).toBe('vault1');
    });

    it('should allow same type_name in different vaults', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', 'vault1', 'daily', 'Purpose 1', '[]', '{}', 'hash1']
      );

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type2', 'vault2', 'daily', 'Purpose 2', '[]', '{}', 'hash2']
      );

      const allResults = await db.all<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE type_name = ? ORDER BY vault_id',
        ['daily']
      );

      expect(allResults.length).toBe(2);
      expect(allResults[0].vault_id).toBe('vault1');
      expect(allResults[1].vault_id).toBe('vault2');
    });
  });

  describe('Unique Constraint', () => {
    it('should enforce unique vault_id and type_name combination', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', 'vault1', 'daily', 'Purpose', '[]', '{}', 'hash1']
      );

      await expect(
        db.run(
          `INSERT INTO note_type_descriptions
           (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['type2', 'vault1', 'daily', 'Different Purpose', '[]', '{}', 'hash2']
        )
      ).rejects.toThrow();
    });
  });

  describe('Optimistic Locking with content_hash', () => {
    it('should fail update when content_hash does not match', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', 'vault1', 'daily', 'Original', '[]', '{}', 'correcthash']
      );

      const result = await db.run(
        `UPDATE note_type_descriptions
         SET purpose = ?, content_hash = ?
         WHERE id = ? AND content_hash = ?`,
        ['Updated', 'newhash', 'type1', 'wronghash']
      );

      // No rows should be affected
      expect(result.changes).toBe(0);

      // Original value should remain
      const row = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE id = ?',
        ['type1']
      );
      expect(row?.purpose).toBe('Original');
      expect(row?.content_hash).toBe('correcthash');
    });

    it('should succeed update when content_hash matches', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', 'vault1', 'daily', 'Original', '[]', '{}', 'correcthash']
      );

      const result = await db.run(
        `UPDATE note_type_descriptions
         SET purpose = ?, content_hash = ?
         WHERE id = ? AND content_hash = ?`,
        ['Updated', 'newhash', 'type1', 'correcthash']
      );

      expect(result.changes).toBe(1);

      const row = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE id = ?',
        ['type1']
      );
      expect(row?.purpose).toBe('Updated');
      expect(row?.content_hash).toBe('newhash');
    });
  });

  describe('JSON Field Handling', () => {
    it('should store and retrieve agent_instructions as JSON', async () => {
      const instructions = ['instruction 1', 'instruction 2', 'instruction 3'];
      const jsonInstructions = JSON.stringify(instructions);

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', 'vault1', 'daily', 'Purpose', jsonInstructions, '{}', 'hash']
      );

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE id = ?',
        ['type1']
      );

      expect(result?.agent_instructions).toBe(jsonInstructions);
      const parsed = JSON.parse(result?.agent_instructions || '[]');
      expect(parsed).toEqual(instructions);
    });

    it('should store and retrieve metadata_schema as JSON', async () => {
      const schema = {
        fields: [
          { name: 'field1', type: 'string', required: true },
          { name: 'field2', type: 'number', required: false }
        ]
      };
      const jsonSchema = JSON.stringify(schema);

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', 'vault1', 'daily', 'Purpose', '[]', jsonSchema, 'hash']
      );

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE id = ?',
        ['type1']
      );

      expect(result?.metadata_schema).toBe(jsonSchema);
      const parsed = JSON.parse(result?.metadata_schema || '{}');
      expect(parsed).toEqual(schema);
    });
  });
});
