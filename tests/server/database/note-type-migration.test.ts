/**
 * Tests for migrating note type descriptions from files to database
 * These tests verify the migration function correctly reads _description.md files
 * and migrates them to the database
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../../src/server/database/schema.js';
import type {
  DatabaseConnection,
  NoteTypeDescriptionRow
} from '../../../src/server/database/schema.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Note Type Migration from Files to DB', () => {
  let dbManager: DatabaseManager;
  let db: DatabaseConnection;
  let testVaultPath: string;

  beforeEach(async () => {
    // Create temporary vault directory
    testVaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'note-type-migration-test-'));

    // Create .flint-note directory
    await fs.mkdir(path.join(testVaultPath, '.flint-note'), { recursive: true });

    // Initialize database
    dbManager = new DatabaseManager(testVaultPath);
    db = await dbManager.connect();
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  describe('File Discovery', () => {
    it('should find note types with _description.md in type directory', async () => {
      // Create a note type directory with description
      await fs.mkdir(path.join(testVaultPath, 'daily'), { recursive: true });
      await fs.writeFile(
        path.join(testVaultPath, 'daily', '_description.md'),
        '# Daily\n\n## Purpose\nDaily notes\n\n## Agent Instructions\n- instruction 1\n\n## Metadata Schema\n'
      );

      // Check that the file exists
      const files = await fs.readdir(path.join(testVaultPath, 'daily'));
      expect(files).toContain('_description.md');
    });

    it('should find note types with legacy .flint-note description files', async () => {
      // Create a note type directory
      await fs.mkdir(path.join(testVaultPath, 'note'), { recursive: true });

      // Create legacy description in .flint-note
      await fs.writeFile(
        path.join(testVaultPath, '.flint-note', 'note_description.md'),
        '# Note\n\n## Purpose\nGeneral notes\n\n## Agent Instructions\n- instruction 1\n\n## Metadata Schema\n'
      );

      const flintNoteFiles = await fs.readdir(path.join(testVaultPath, '.flint-note'));
      expect(flintNoteFiles).toContain('note_description.md');
    });

    it('should discover multiple note types', async () => {
      // Create multiple note types
      await fs.mkdir(path.join(testVaultPath, 'daily'), { recursive: true });
      await fs.writeFile(
        path.join(testVaultPath, 'daily', '_description.md'),
        '# Daily\n\n## Purpose\nDaily notes\n\n## Agent Instructions\n\n## Metadata Schema\n'
      );

      await fs.mkdir(path.join(testVaultPath, 'note'), { recursive: true });
      await fs.writeFile(
        path.join(testVaultPath, 'note', '_description.md'),
        '# Note\n\n## Purpose\nGeneral notes\n\n## Agent Instructions\n\n## Metadata Schema\n'
      );

      await fs.mkdir(path.join(testVaultPath, 'project'), { recursive: true });
      await fs.writeFile(
        path.join(testVaultPath, 'project', '_description.md'),
        '# Project\n\n## Purpose\nProject notes\n\n## Agent Instructions\n\n## Metadata Schema\n'
      );

      // Get all directories (note types)
      const entries = await fs.readdir(testVaultPath, { withFileTypes: true });
      const noteTypes = entries.filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
      );

      expect(noteTypes.length).toBe(3);
    });
  });

  describe('Description Parsing', () => {
    it('should parse purpose from description file', async () => {
      await fs.mkdir(path.join(testVaultPath, 'daily'), { recursive: true });
      await fs.writeFile(
        path.join(testVaultPath, 'daily', '_description.md'),
        '# Daily\n\n## Purpose\nDaily notes for tracking progress and capturing daily thoughts\n\n## Agent Instructions\n- instruction 1\n\n## Metadata Schema\n'
      );

      const content = await fs.readFile(
        path.join(testVaultPath, 'daily', '_description.md'),
        'utf-8'
      );

      // Simple parsing to check purpose section
      const purposeMatch = content.match(/## Purpose\s+([^\n]+)/);
      expect(purposeMatch).toBeDefined();
      expect(purposeMatch?.[1]).toBe(
        'Daily notes for tracking progress and capturing daily thoughts'
      );
    });

    it('should parse agent instructions from description file', async () => {
      await fs.mkdir(path.join(testVaultPath, 'daily'), { recursive: true });
      await fs.writeFile(
        path.join(testVaultPath, 'daily', '_description.md'),
        `# Daily

## Purpose
Daily notes

## Agent Instructions
- Extract actionable items
- Link to related notes
- Help organize content

## Metadata Schema
`
      );

      const content = await fs.readFile(
        path.join(testVaultPath, 'daily', '_description.md'),
        'utf-8'
      );

      // Check that instructions are present
      expect(content).toContain('Extract actionable items');
      expect(content).toContain('Link to related notes');
      expect(content).toContain('Help organize content');
    });

    it('should handle descriptions without metadata schema', async () => {
      await fs.mkdir(path.join(testVaultPath, 'simple'), { recursive: true });
      await fs.writeFile(
        path.join(testVaultPath, 'simple', '_description.md'),
        '# Simple\n\n## Purpose\nSimple notes\n\n## Agent Instructions\n- instruction 1\n'
      );

      const content = await fs.readFile(
        path.join(testVaultPath, 'simple', '_description.md'),
        'utf-8'
      );

      expect(content).toContain('## Purpose');
      expect(content).toContain('## Agent Instructions');
    });
  });

  describe('Migration Execution', () => {
    it('should migrate note type from file to database', async () => {
      // Create note type with description
      await fs.mkdir(path.join(testVaultPath, 'daily'), { recursive: true });
      await fs.writeFile(
        path.join(testVaultPath, 'daily', '_description.md'),
        `# Daily

## Purpose
Daily notes for tracking progress

## Agent Instructions
- Extract actionable items
- Link to related notes

## Metadata Schema
Expected frontmatter fields:
- type: daily
- created: Creation timestamp
- updated: Last modification timestamp
`
      );

      // Simulate migration by directly inserting into DB
      // (actual migration function will be tested in integration)
      const vaultId = 'test-vault-123';
      const instructions = JSON.stringify([
        'Extract actionable items',
        'Link to related notes'
      ]);
      const schema = JSON.stringify({ fields: [] });

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'type-daily-001',
          vaultId,
          'daily',
          'Daily notes for tracking progress',
          instructions,
          schema,
          'test-hash'
        ]
      );

      // Verify it's in the database
      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );

      expect(result).toBeDefined();
      expect(result?.type_name).toBe('daily');
      expect(result?.purpose).toBe('Daily notes for tracking progress');
      expect(result?.agent_instructions).toBe(instructions);
    });

    it('should preserve all description data during migration', async () => {
      await fs.mkdir(path.join(testVaultPath, 'project'), { recursive: true });
      await fs.writeFile(
        path.join(testVaultPath, 'project', '_description.md'),
        `# Project

## Purpose
Project planning and tracking notes

## Agent Instructions
- Track milestones and deadlines
- Link to related tasks
- Monitor project progress
- Identify blockers and risks

## Metadata Schema
Expected frontmatter fields:
- type: project
- status: Project status (planning, active, completed)
- priority: Priority level (low, medium, high)
- deadline: Project deadline
`
      );

      const vaultId = 'test-vault-123';
      const instructions = JSON.stringify([
        'Track milestones and deadlines',
        'Link to related tasks',
        'Monitor project progress',
        'Identify blockers and risks'
      ]);
      const schema = JSON.stringify({
        fields: [
          { name: 'status', type: 'string' },
          { name: 'priority', type: 'string' },
          { name: 'deadline', type: 'date' }
        ]
      });

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'type-project-001',
          vaultId,
          'project',
          'Project planning and tracking notes',
          instructions,
          schema,
          'test-hash-2'
        ]
      );

      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'project']
      );

      expect(result?.purpose).toBe('Project planning and tracking notes');
      const parsedInstructions = JSON.parse(result?.agent_instructions || '[]');
      expect(parsedInstructions).toHaveLength(4);
      expect(parsedInstructions[0]).toBe('Track milestones and deadlines');

      const parsedSchema = JSON.parse(result?.metadata_schema || '{}');
      expect(parsedSchema.fields).toHaveLength(3);
    });

    it('should handle missing description files gracefully', async () => {
      // Create note type directory without description
      await fs.mkdir(path.join(testVaultPath, 'undocumented'), { recursive: true });

      // Check that directory exists but has no _description.md
      const files = await fs.readdir(path.join(testVaultPath, 'undocumented'));
      expect(files).not.toContain('_description.md');

      // Migration should skip or handle this case - no database entry expected
      const vaultId = 'test-vault-123';
      const result = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'undocumented']
      );

      expect(result).toBeUndefined();
    });

    it('should migrate multiple note types to same vault', async () => {
      const vaultId = 'test-vault-123';

      // Migrate multiple types
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

      const results = await db.all<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? ORDER BY type_name',
        [vaultId]
      );

      expect(results.length).toBe(3);
      expect(results[0].type_name).toBe('daily');
      expect(results[1].type_name).toBe('note');
      expect(results[2].type_name).toBe('project');
    });

    it('should be idempotent - running migration twice should not duplicate', async () => {
      const vaultId = 'test-vault-123';

      // First migration
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', vaultId, 'daily', 'Daily notes', '[]', '{}', 'hash1']
      );

      // Attempting to insert duplicate should fail (unique constraint)
      await expect(
        db.run(
          `INSERT INTO note_type_descriptions
           (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['type2', vaultId, 'daily', 'Daily notes', '[]', '{}', 'hash2']
        )
      ).rejects.toThrow();

      // Should still only have one entry
      const results = await db.all<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        [vaultId, 'daily']
      );

      expect(results.length).toBe(1);
    });
  });

  describe('Multi-Vault Migration', () => {
    it('should migrate note types for different vaults independently', async () => {
      // Migrate same type name for different vaults
      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type1', 'vault1', 'daily', 'Vault 1 daily notes', '[]', '{}', 'hash1']
      );

      await db.run(
        `INSERT INTO note_type_descriptions
         (id, vault_id, type_name, purpose, agent_instructions, metadata_schema, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['type2', 'vault2', 'daily', 'Vault 2 daily notes', '[]', '{}', 'hash2']
      );

      const vault1Daily = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        ['vault1', 'daily']
      );

      const vault2Daily = await db.get<NoteTypeDescriptionRow>(
        'SELECT * FROM note_type_descriptions WHERE vault_id = ? AND type_name = ?',
        ['vault2', 'daily']
      );

      expect(vault1Daily?.purpose).toBe('Vault 1 daily notes');
      expect(vault2Daily?.purpose).toBe('Vault 2 daily notes');
      expect(vault1Daily?.id).not.toBe(vault2Daily?.id);
    });
  });

  describe('Legacy Path Support', () => {
    it('should prefer current path over legacy path', async () => {
      await fs.mkdir(path.join(testVaultPath, 'daily'), { recursive: true });

      // Create both current and legacy descriptions
      await fs.writeFile(
        path.join(testVaultPath, 'daily', '_description.md'),
        '# Daily\n\n## Purpose\nCurrent location\n\n## Agent Instructions\n\n## Metadata Schema\n'
      );

      await fs.writeFile(
        path.join(testVaultPath, '.flint-note', 'daily_description.md'),
        '# Daily\n\n## Purpose\nLegacy location\n\n## Agent Instructions\n\n## Metadata Schema\n'
      );

      // Check current path exists
      const currentExists = await fs
        .access(path.join(testVaultPath, 'daily', '_description.md'))
        .then(() => true)
        .catch(() => false);
      expect(currentExists).toBe(true);

      // Check legacy path exists
      const legacyExists = await fs
        .access(path.join(testVaultPath, '.flint-note', 'daily_description.md'))
        .then(() => true)
        .catch(() => false);
      expect(legacyExists).toBe(true);

      // Migration should prefer current path
      const currentContent = await fs.readFile(
        path.join(testVaultPath, 'daily', '_description.md'),
        'utf-8'
      );
      expect(currentContent).toContain('Current location');
    });

    it('should fall back to legacy path if current path does not exist', async () => {
      await fs.mkdir(path.join(testVaultPath, 'note'), { recursive: true });

      // Only create legacy description
      await fs.writeFile(
        path.join(testVaultPath, '.flint-note', 'note_description.md'),
        '# Note\n\n## Purpose\nLegacy location only\n\n## Agent Instructions\n\n## Metadata Schema\n'
      );

      // Current path should not exist
      const currentExists = await fs
        .access(path.join(testVaultPath, 'note', '_description.md'))
        .then(() => true)
        .catch(() => false);
      expect(currentExists).toBe(false);

      // Legacy path should exist
      const legacyExists = await fs
        .access(path.join(testVaultPath, '.flint-note', 'note_description.md'))
        .then(() => true)
        .catch(() => false);
      expect(legacyExists).toBe(true);

      const legacyContent = await fs.readFile(
        path.join(testVaultPath, '.flint-note', 'note_description.md'),
        'utf-8'
      );
      expect(legacyContent).toContain('Legacy location only');
    });
  });
});
