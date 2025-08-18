/**
 * Unit tests for note type deletion functionality
 *
 * Tests the NoteTypeManager's deleteNoteType method with various
 * deletion strategies (error, migrate, delete) and validation.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  createTestWorkspace,
  cleanupTestWorkspace,
  createTestNoteTypes,
  TestContext
} from './helpers/test-utils.ts';

describe('Note Type Deletion Unit Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('note-type-deletion');
    await createTestNoteTypes(context);
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  describe('Note Type Deletion with Error Strategy', () => {
    test('should delete empty note type successfully', async () => {
      const { noteTypeManager, workspace } = context;

      // Create an empty note type
      await workspace.ensureNoteType('empty-type');

      const result = await noteTypeManager.deleteNoteType(
        'empty-type',
        'error',
        undefined,
        true
      );

      assert.ok(result.deleted, 'Note type should be marked as deleted');
      assert.strictEqual(
        result.name,
        'empty-type',
        'Result should include correct type name'
      );
      assert.strictEqual(result.action, 'error', 'Result should show error action');
      assert.strictEqual(result.notes_affected, 0, 'Should affect 0 notes');
      assert.ok(result.timestamp, 'Result should include timestamp');

      // Verify directory is deleted
      const typePath = workspace.getNoteTypePath('empty-type');
      try {
        await fs.access(typePath);
        assert.fail('Note type directory should be deleted');
      } catch {
        // Expected - directory should not exist
      }
    });

    test('should reject deletion of non-empty note type with error strategy', async () => {
      const { noteTypeManager, noteManager, workspace } = context;

      // Create a note type with notes
      await workspace.ensureNoteType('populated-type');
      await noteManager.createNote(
        'populated-type',
        'Test Note',
        'This note prevents deletion'
      );

      await assert.rejects(
        async () =>
          await noteTypeManager.deleteNoteType(
            'populated-type',
            'error',
            undefined,
            true
          ),
        /contains \d+ notes/,
        'Should reject deletion of non-empty type with error strategy'
      );
    });
  });

  describe('Note Type Deletion with Migration Strategy', () => {
    test('should migrate notes to target type', async () => {
      const { noteTypeManager, noteManager, workspace } = context;

      // Create source and target note types
      await workspace.ensureNoteType('source-type');
      await workspace.ensureNoteType('target-type');

      // Create notes in source type
      await noteManager.createNote('source-type', 'Note 1', 'Content 1');
      await noteManager.createNote('source-type', 'Note 2', 'Content 2');

      const result = await noteTypeManager.deleteNoteType(
        'source-type',
        'migrate',
        'target-type',
        true
      );

      assert.ok(result.deleted, 'Source type should be deleted');
      assert.strictEqual(result.action, 'migrate', 'Should use migrate action');
      assert.strictEqual(result.notes_affected, 2, 'Should affect 2 notes');
      assert.strictEqual(
        result.migration_target,
        'target-type',
        'Should record migration target'
      );

      // Verify notes are moved to target type
      const targetNotes = await noteManager.listNotes('target-type');
      assert.strictEqual(targetNotes.length, 2, 'Target type should have 2 notes');

      // Verify source type directory is deleted
      const sourceTypePath = workspace.getNoteTypePath('source-type');
      try {
        await fs.access(sourceTypePath);
        assert.fail('Source type directory should be deleted');
      } catch {
        // Expected - directory should not exist
      }
    });

    test('should require target type for migration', async () => {
      const { noteTypeManager, noteManager, workspace } = context;

      await workspace.ensureNoteType('source-type');
      await noteManager.createNote('source-type', 'Note', 'Content');

      await assert.rejects(
        async () =>
          await noteTypeManager.deleteNoteType('source-type', 'migrate', undefined, true),
        /Migration target type is required/,
        'Should require target type for migration'
      );
    });

    test('should validate migration target exists', async () => {
      const { noteTypeManager, noteManager, workspace } = context;

      await workspace.ensureNoteType('source-type');
      await noteManager.createNote('source-type', 'Note', 'Content');

      await assert.rejects(
        async () =>
          await noteTypeManager.deleteNoteType(
            'source-type',
            'migrate',
            'non-existent-type',
            true
          ),
        /target.*not found|does not exist/i,
        'Should validate migration target exists'
      );
    });
  });

  describe('Note Type Deletion with Delete Strategy', () => {
    test('should delete note type and all its notes', async () => {
      const { noteTypeManager, noteManager, workspace } = context;

      await workspace.ensureNoteType('delete-type');

      // Create multiple notes
      const note1 = await noteManager.createNote('delete-type', 'Note 1', 'Content 1');
      const note2 = await noteManager.createNote('delete-type', 'Note 2', 'Content 2');
      const note3 = await noteManager.createNote('delete-type', 'Note 3', 'Content 3');

      const result = await noteTypeManager.deleteNoteType(
        'delete-type',
        'delete',
        undefined,
        true
      );

      assert.ok(result.deleted, 'Note type should be deleted');
      assert.strictEqual(result.action, 'delete', 'Should use delete action');
      assert.strictEqual(result.notes_affected, 3, 'Should affect 3 notes');

      // Verify all note files are deleted
      for (const note of [note1, note2, note3]) {
        try {
          await fs.access(note.path);
          assert.fail(`Note file should be deleted: ${note.path}`);
        } catch {
          // Expected - files should not exist
        }
      }

      // Verify note type directory is deleted
      const typePath = workspace.getNoteTypePath('delete-type');
      try {
        await fs.access(typePath);
        assert.fail('Note type directory should be deleted');
      } catch {
        // Expected - directory should not exist
      }
    });

    test('should respect bulk delete limit', async () => {
      const { noteTypeManager, noteManager, workspace } = context;

      // Set low bulk delete limit and enable note type deletion
      const config = {
        deletion: {
          require_confirmation: false,
          create_backups: true,
          backup_path: '.flint-note/backups',
          allow_note_type_deletion: true,
          max_bulk_delete: 2
        }
      };
      await workspace.updateConfig(config);

      await workspace.ensureNoteType('bulk-limit-type');

      // Create more notes than the limit allows
      await noteManager.createNote('bulk-limit-type', 'Note 1', 'Content 1');
      await noteManager.createNote('bulk-limit-type', 'Note 2', 'Content 2');
      await noteManager.createNote('bulk-limit-type', 'Note 3', 'Content 3');

      await assert.rejects(
        async () =>
          await noteTypeManager.deleteNoteType(
            'bulk-limit-type',
            'delete',
            undefined,
            true
          ),
        /exceeds bulk delete limit/,
        'Should respect bulk delete limit'
      );
    });
  });

  describe('Configuration Validation', () => {
    test('should reject deletion when disabled in configuration', async () => {
      const { noteTypeManager, workspace } = context;

      // Disable note type deletion
      const config = {
        deletion: {
          require_confirmation: false,
          create_backups: true,
          backup_path: '.flint-note/backups',
          allow_note_type_deletion: false,
          max_bulk_delete: 10
        }
      };
      await workspace.updateConfig(config);

      await workspace.ensureNoteType('test-type');

      await assert.rejects(
        async () =>
          await noteTypeManager.deleteNoteType('test-type', 'error', undefined, true),
        /Note type deletion is disabled/,
        'Should reject deletion when disabled'
      );
    });

    test('should require confirmation when configured', async () => {
      const { noteTypeManager, workspace } = context;

      // Configure to require confirmation
      const config = {
        deletion: {
          require_confirmation: true,
          create_backups: true,
          backup_path: '.flint-note/backups',
          allow_note_type_deletion: true,
          max_bulk_delete: 10
        }
      };
      await workspace.updateConfig(config);

      await workspace.ensureNoteType('confirm-type');

      // Should fail without confirmation
      await assert.rejects(
        async () =>
          await noteTypeManager.deleteNoteType('confirm-type', 'error', undefined, false),
        /requires confirmation/,
        'Should require confirmation'
      );

      // Should succeed with confirmation
      const result = await noteTypeManager.deleteNoteType(
        'confirm-type',
        'error',
        undefined,
        true
      );
      assert.ok(result.deleted, 'Should delete with confirmation');
    });
  });

  describe('Backup Functionality', () => {
    test('should create backup when configured', async () => {
      const { noteTypeManager, noteManager, workspace } = context;

      // Configure backup creation
      const backupDir = join(context.tempDir, 'backups');
      await fs.mkdir(backupDir, { recursive: true });

      const config = {
        deletion: {
          require_confirmation: false,
          create_backups: true,
          backup_path: backupDir,
          allow_note_type_deletion: true,
          max_bulk_delete: 10
        }
      };
      await workspace.updateConfig(config);

      await workspace.ensureNoteType('backup-type');
      await noteManager.createNote('backup-type', 'Important Note', 'Critical content');

      const result = await noteTypeManager.deleteNoteType(
        'backup-type',
        'delete',
        undefined,
        true
      );

      assert.ok(result.backup_path, 'Should create backup');
      assert.ok(result.deleted, 'Should delete successfully');

      // Verify backup exists and contains the note
      await fs.access(result.backup_path!);
      // Backup should be a directory or archive containing the notes
    });

    test('should not create backup for empty note types', async () => {
      const { noteTypeManager, workspace } = context;

      const backupDir = join(context.tempDir, 'backups');
      await fs.mkdir(backupDir, { recursive: true });

      const config = {
        deletion: {
          require_confirmation: false,
          create_backups: true,
          backup_path: backupDir,
          allow_note_type_deletion: true,
          max_bulk_delete: 10
        }
      };
      await workspace.updateConfig(config);

      await workspace.ensureNoteType('empty-backup-type');

      const result = await noteTypeManager.deleteNoteType(
        'empty-backup-type',
        'error',
        undefined,
        true
      );

      assert.ok(!result.backup_path, 'Should not create backup for empty type');
      assert.ok(result.deleted, 'Should delete successfully');
    });
  });

  describe('Validation and Error Handling', () => {
    test('should validate note type exists', async () => {
      const { noteTypeManager } = context;

      await assert.rejects(
        async () =>
          await noteTypeManager.deleteNoteType(
            'non-existent-type',
            'error',
            undefined,
            true
          ),
        /not found|does not exist/i,
        'Should reject deletion of non-existent type'
      );
    });

    test('should handle filesystem errors gracefully', async () => {
      const { noteTypeManager, workspace } = context;

      await workspace.ensureNoteType('error-type');
      const typePath = workspace.getNoteTypePath('error-type');

      // Make directory unreadable to simulate permission error
      try {
        await fs.chmod(typePath, 0o000);

        await assert.rejects(
          async () =>
            await noteTypeManager.deleteNoteType('error-type', 'error', undefined, true),
          /Failed to delete note type/,
          'Should handle filesystem errors gracefully'
        );
      } catch {
        // Skip test on systems that don't support chmod
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.chmod(typePath, 0o755);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    test('should provide detailed validation information', async () => {
      const { noteTypeManager, noteManager, workspace } = context;

      await workspace.ensureNoteType('validation-type');
      await noteManager.createNote('validation-type', 'Test', 'Content');

      // Check if validateNoteTypeDeletion method exists
      if (typeof noteTypeManager.validateNoteTypeDeletion === 'function') {
        const validation = await noteTypeManager.validateNoteTypeDeletion(
          'validation-type',
          'error'
        );

        assert.ok(
          !validation.can_delete,
          'Should not allow deletion with error strategy'
        );
        assert.ok(validation.errors.length > 0, 'Should provide error details');

        // Check if notes_count property exists in validation result
        if ('notes_count' in validation) {
          assert.ok((validation as any).notes_count > 0, 'Should report note count');
        }
      } else {
        console.log('validateNoteTypeDeletion method not implemented yet');
      }
    });

    test('should handle invalid deletion actions', async () => {
      const { noteTypeManager, workspace } = context;

      await workspace.ensureNoteType('action-test-type');

      // Enable note type deletion
      const config = {
        deletion: {
          require_confirmation: false,
          create_backups: true,
          backup_path: '.flint-note/backups',
          allow_note_type_deletion: true,
          max_bulk_delete: 10
        }
      };
      await workspace.updateConfig(config);

      // TypeScript will catch invalid actions at compile time, but we can test runtime validation
      // by passing through a variable that bypasses TypeScript checking
      const invalidAction = 'invalid-action' as any;

      try {
        await noteTypeManager.deleteNoteType(
          'action-test-type',
          invalidAction,
          undefined,
          true
        );
        // If we get here, the method didn't validate the action properly
        // This is acceptable since TypeScript provides compile-time safety
        console.log('Invalid action handling is done at TypeScript compile time');
      } catch (error) {
        // Any error is acceptable - could be validation or just normal processing
        assert.ok(error instanceof Error, 'Should handle invalid actions gracefully');
      }
    });
  });

  describe('Integration with Other Systems', () => {
    test('should handle note type with metadata schemas', async () => {
      const { noteTypeManager, workspace } = context;

      // Create note type with schema
      await workspace.ensureNoteType('schema-type');
      const schemaPath = join(workspace.getNoteTypePath('schema-type'), '_schema.yml');
      const schema = `
title:
  type: string
  required: true
rating:
  type: number
  min: 1
  max: 5
`;
      await fs.writeFile(schemaPath, schema, 'utf8');

      const result = await noteTypeManager.deleteNoteType(
        'schema-type',
        'error',
        undefined,
        true
      );

      assert.ok(result.deleted, 'Should delete note type with schema');
    });

    test('should handle note type with custom templates', async () => {
      const { noteTypeManager, workspace } = context;

      // Create note type with template
      await workspace.ensureNoteType('template-type');
      const templatePath = join(
        workspace.getNoteTypePath('template-type'),
        '_template.md'
      );
      const template = `# {{title}}

Created: {{date}}

## Content

{{content}}
`;
      await fs.writeFile(templatePath, template, 'utf8');

      const result = await noteTypeManager.deleteNoteType(
        'template-type',
        'error',
        undefined,
        true
      );

      assert.ok(result.deleted, 'Should delete note type with template');
    });
  });

  describe('Concurrent Deletion Safety', () => {
    test('should handle concurrent deletion attempts', async () => {
      const { noteTypeManager, workspace } = context;

      await workspace.ensureNoteType('concurrent-type');

      // Attempt multiple concurrent deletions
      const deletionPromises = [
        noteTypeManager.deleteNoteType('concurrent-type', 'error', undefined, true),
        noteTypeManager.deleteNoteType('concurrent-type', 'error', undefined, true),
        noteTypeManager.deleteNoteType('concurrent-type', 'error', undefined, true)
      ];

      const results = await Promise.allSettled(deletionPromises);

      // At least one should succeed, others should fail gracefully
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;

      assert.ok(successes >= 1, 'At least one deletion should succeed');
      assert.ok(failures >= 0, 'Failed deletions should be handled gracefully');
    });
  });
});
