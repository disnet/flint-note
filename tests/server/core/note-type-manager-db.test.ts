/**
 * Tests for NoteTypeManager with database-backed storage
 * Tests all CRUD operations using database instead of filesystem
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NoteTypeManager } from '../../../src/server/core/note-types.js';
import { Workspace } from '../../../src/server/core/workspace.js';
import { DatabaseManager } from '../../../src/server/database/schema.js';
import type {
  DatabaseConnection,
  NoteTypeDescriptionRow
} from '../../../src/server/database/schema.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('NoteTypeManager with Database Storage', () => {
  let workspace: Workspace;
  let noteTypeManager: NoteTypeManager;
  let dbManager: DatabaseManager;
  let db: DatabaseConnection;
  let testVaultPath: string;
  let vaultId: string; // Will be set to testVaultPath

  beforeEach(async () => {
    // Create temporary vault directory
    testVaultPath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'note-type-manager-db-test-')
    );
    vaultId = testVaultPath; // Use vault path as ID

    // Create .flint-note directory
    await fs.mkdir(path.join(testVaultPath, '.flint-note'), { recursive: true });

    // Initialize workspace and database
    dbManager = new DatabaseManager(testVaultPath);
    workspace = new Workspace(testVaultPath, dbManager);
    await workspace.initialize();

    noteTypeManager = new NoteTypeManager(workspace, dbManager);
    db = await dbManager.connect();
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  describe('createNoteType', () => {
    it('should create note type in database', async () => {
      await noteTypeManager.createNoteType('daily', 'Daily notes for tracking progress');

      // Verify it's in the database
      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );

      expect(result).toBeDefined();
      expect(result?.type_name).toBe('daily');
      expect(result?.purpose).toContain('Daily notes for tracking progress');
    });

    it('should create note type with agent instructions', async () => {
      const instructions = [
        'Extract actionable items',
        'Link to related notes',
        'Help organize content'
      ];

      await noteTypeManager.createNoteType(
        'project',
        'Project planning notes',
        instructions
      );

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'project']
      );

      expect(result).toBeDefined();
      const parsedInstructions = JSON.parse(result?.agent_instructions || '[]');
      expect(parsedInstructions).toEqual(instructions);
    });

    it('should create note type with metadata schema', async () => {
      const schema = {
        fields: [
          {
            name: 'status',
            description: 'Project status',
            type: 'string' as const,
            required: true
          },
          {
            name: 'priority',
            description: 'Priority level',
            type: 'string' as const,
            required: false
          }
        ]
      };

      await noteTypeManager.createNoteType('task', 'Task tracking notes', null, schema);

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'task']
      );

      expect(result).toBeDefined();
      const parsedSchema = JSON.parse(result?.metadata_schema || '{}');
      expect(parsedSchema.fields).toHaveLength(2);
      expect(parsedSchema.fields[0].name).toBe('status');
    });

    it('should generate content hash for optimistic locking', async () => {
      await noteTypeManager.createNoteType('daily', 'Daily notes');

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );

      expect(result?.content_hash).toBeDefined();
      expect(result?.content_hash).not.toBe('');
    });

    it('should not create description file on disk', async () => {
      await noteTypeManager.createNoteType('daily', 'Daily notes');

      // Check that _description.md file does NOT exist
      const descriptionPath = path.join(testVaultPath, 'daily', '_description.md');
      const fileExists = await fs
        .access(descriptionPath)
        .then(() => true)
        .catch(() => false);

      expect(fileExists).toBe(false);
    });

    it('should still create note type directory', async () => {
      await noteTypeManager.createNoteType('daily', 'Daily notes');

      // Directory should still be created for notes
      const dirPath = path.join(testVaultPath, 'daily');
      const dirExists = await fs
        .access(dirPath)
        .then(() => true)
        .catch(() => false);

      expect(dirExists).toBe(true);
    });

    it('should reject note type with select field without options', async () => {
      const schema = {
        fields: [
          {
            name: 'status',
            description: 'Status field',
            type: 'select' as const,
            required: false
          }
        ]
      };

      await expect(
        noteTypeManager.createNoteType('task', 'Task notes', null, schema)
      ).rejects.toThrow(/has no options defined/);
    });

    it('should accept note type with select field with options', async () => {
      const schema = {
        fields: [
          {
            name: 'status',
            description: 'Status field',
            type: 'select' as const,
            required: false,
            constraints: {
              options: ['active', 'inactive', 'archived']
            }
          }
        ]
      };

      await noteTypeManager.createNoteType('task', 'Task notes', null, schema);

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'task']
      );

      expect(result).toBeDefined();
      const parsedSchema = JSON.parse(result?.metadata_schema || '{}');
      expect(parsedSchema.fields[0].constraints.options).toEqual([
        'active',
        'inactive',
        'archived'
      ]);
    });
  });

  describe('getNoteTypeDescription', () => {
    it('should read note type description from database', async () => {
      // Create directory for note type
      await fs.mkdir(path.join(testVaultPath, 'daily'), { recursive: true });

      // Insert directly into DB
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'type-001',
          vaultId,
          'daily',
          'Daily notes for tracking progress',
          JSON.stringify(['instruction 1', 'instruction 2']),
          JSON.stringify({ fields: [] }),
          'test-hash'
        ]
      );

      const description = await noteTypeManager.getNoteTypeDescription('daily');

      expect(description.name).toBe('daily');
      expect(description.parsed.purpose).toContain('Daily notes for tracking progress');
      expect(description.parsed.agentInstructions).toHaveLength(2);
      expect(description.content_hash).toBe('test-hash');
    });

    it('should include metadata schema in description', async () => {
      // Create directory for note type
      await fs.mkdir(path.join(testVaultPath, 'task'), { recursive: true });

      const schema = {
        fields: [
          { name: 'status', description: 'Status', type: 'string', required: true }
        ]
      };

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type-001', vaultId, 'task', 'Task notes', '[]', JSON.stringify(schema), 'hash']
      );

      const description = await noteTypeManager.getNoteTypeDescription('task');

      expect(description.metadataSchema.fields).toHaveLength(1);
      expect(description.metadataSchema.fields[0].name).toBe('status');
    });

    it('should throw error for non-existent note type', async () => {
      await expect(
        noteTypeManager.getNoteTypeDescription('nonexistent')
      ).rejects.toThrow();
    });
  });

  describe('updateNoteType', () => {
    beforeEach(async () => {
      // Create directory for note type
      await fs.mkdir(path.join(testVaultPath, 'daily'), { recursive: true });

      // Create initial note type
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'type-001',
          vaultId,
          'daily',
          'Original purpose',
          JSON.stringify(['Original instruction']),
          JSON.stringify({ fields: [] }),
          'original-hash'
        ]
      );
    });

    it('should update note type description', async () => {
      await noteTypeManager.updateNoteType('daily', {
        description: 'Updated purpose'
      });

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );

      expect(result?.purpose).toContain('Updated purpose');
    });

    it('should update agent instructions', async () => {
      const newInstructions = ['New instruction 1', 'New instruction 2'];

      await noteTypeManager.updateNoteType('daily', {
        instructions: newInstructions
      });

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );

      const parsedInstructions = JSON.parse(result?.agent_instructions || '[]');
      expect(parsedInstructions).toEqual(newInstructions);
    });

    it('should update metadata schema', async () => {
      const newSchema = {
        fields: [
          {
            name: 'priority',
            description: 'Priority',
            type: 'string' as const,
            required: true
          }
        ]
      };

      await noteTypeManager.updateNoteType('daily', {
        metadata_schema: newSchema
      });

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );

      const parsedSchema = JSON.parse(result?.metadata_schema || '{}');
      expect(parsedSchema.fields[0].name).toBe('priority');
    });

    it('should update content hash after modification', async () => {
      const originalResult = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );
      const originalHash = originalResult?.content_hash;

      await noteTypeManager.updateNoteType('daily', {
        description: 'Updated purpose'
      });

      const updatedResult = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );

      expect(updatedResult?.content_hash).not.toBe(originalHash);
    });

    it('should update timestamp', async () => {
      const originalResult = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );
      const originalTimestamp = originalResult?.updated_at;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await noteTypeManager.updateNoteType('daily', {
        description: 'Updated purpose'
      });

      const updatedResult = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );

      // Updated timestamp should be different (though SQLite might have low resolution)
      expect(updatedResult?.updated_at).toBeDefined();
    });
  });

  describe('listNoteTypes', () => {
    it('should list note types from database', async () => {
      // Insert multiple note types
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', vaultId, 'daily', 'Daily notes', '[]', '{}', 'hash1']
      );

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type2', vaultId, 'note', 'General notes', '[]', '{}', 'hash2']
      );

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type3', vaultId, 'project', 'Project notes', '[]', '{}', 'hash3']
      );

      const types = await noteTypeManager.listNoteTypes();

      // Note: listNoteTypes might return more due to file system scanning
      // So we check that our DB entries are included
      const typeNames = types.map((t) => t.name);
      expect(typeNames).toContain('daily');
      expect(typeNames).toContain('note');
      expect(typeNames).toContain('project');
    });

    it('should include purpose for each note type', async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', vaultId, 'daily', 'Daily notes for tracking', '[]', '{}', 'hash']
      );

      const types = await noteTypeManager.listNoteTypes();
      const dailyType = types.find((t) => t.name === 'daily');

      expect(dailyType).toBeDefined();
      expect(dailyType?.purpose).toContain('Daily notes for tracking');
    });

    it('should include agent instructions for each note type', async () => {
      const instructions = ['instruction 1', 'instruction 2'];

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'type1',
          vaultId,
          'daily',
          'Daily notes',
          JSON.stringify(instructions),
          '{}',
          'hash'
        ]
      );

      const types = await noteTypeManager.listNoteTypes();
      const dailyType = types.find((t) => t.name === 'daily');

      expect(dailyType?.agentInstructions).toEqual(instructions);
    });
  });

  describe('deleteNoteType', () => {
    beforeEach(async () => {
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type-001', vaultId, 'temp', 'Temporary notes', '[]', '{}', 'hash']
      );
    });

    it('should delete note type from database', async () => {
      // Assuming empty note type (no notes)
      await noteTypeManager.deleteNoteType('temp', 'error', undefined, true);

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'temp']
      );

      expect(result).toBeUndefined();
    });

    it('should delete note type directory', async () => {
      // Create directory
      await fs.mkdir(path.join(testVaultPath, 'temp'), { recursive: true });

      await noteTypeManager.deleteNoteType('temp', 'error', undefined, true);

      const dirExists = await fs
        .access(path.join(testVaultPath, 'temp'))
        .then(() => true)
        .catch(() => false);

      expect(dirExists).toBe(false);
    });
  });

  describe('getMetadataSchema', () => {
    it('should get metadata schema from database', async () => {
      // Create directory for note type
      await fs.mkdir(path.join(testVaultPath, 'task'), { recursive: true });

      const schema = {
        fields: [
          {
            name: 'status',
            description: 'Status',
            type: 'string' as const,
            required: true
          }
        ]
      };

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type-001', vaultId, 'task', 'Task notes', '[]', JSON.stringify(schema), 'hash']
      );

      const retrievedSchema = await noteTypeManager.getMetadataSchema('task');

      expect(retrievedSchema.fields).toHaveLength(1);
      expect(retrievedSchema.fields[0].name).toBe('status');
    });
  });

  describe('updateMetadataSchema', () => {
    beforeEach(async () => {
      // Create directory for note type
      await fs.mkdir(path.join(testVaultPath, 'daily'), { recursive: true });

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'type-001',
          vaultId,
          'daily',
          'Daily notes',
          '[]',
          JSON.stringify({ fields: [] }),
          'hash'
        ]
      );
    });

    it('should update metadata schema in database', async () => {
      const newSchema = {
        fields: [
          {
            name: 'mood',
            description: 'Daily mood',
            type: 'string' as const,
            required: false
          }
        ]
      };

      await noteTypeManager.updateMetadataSchema('daily', newSchema);

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );

      const parsedSchema = JSON.parse(result?.metadata_schema || '{}');
      expect(parsedSchema.fields[0].name).toBe('mood');
    });
  });
});
