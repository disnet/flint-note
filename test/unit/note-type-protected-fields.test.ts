/**
 * Unit tests for note type protected field validation
 * Tests that note types cannot define protected metadata fields
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NoteTypeManager } from '../../src/core/note-types.js';
import { Workspace } from '../../src/core/workspace.js';
import type { MetadataFieldType } from '../../src/core/metadata-schema.js';

describe('Note Type Protected Fields Unit Tests', () => {
  let tempDir: string;
  let workspace: Workspace;
  let noteTypeManager: NoteTypeManager;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(join(tmpdir(), 'note-type-protected-test-'));
    workspace = new Workspace(tempDir);
    await workspace.initialize();
    noteTypeManager = new NoteTypeManager(workspace);
  });

  afterEach(async () => {
    // Clean up the temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should reject note type creation with protected "title" field', async () => {
    const metadataSchema = {
      fields: [
        {
          name: 'title',
          type: 'string' as MetadataFieldType,
          description: 'Title of the note'
        },
        {
          name: 'status',
          type: 'string' as MetadataFieldType,
          description: 'Status of the note'
        }
      ]
    };

    try {
      await noteTypeManager.createNoteType(
        'test-type',
        'A test note type',
        ['Test instruction'],
        metadataSchema
      );
      assert.fail('Should have thrown an error for protected title field');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('title') &&
          errorMessage.includes('protected') &&
          errorMessage.includes('automatically managed'),
        `Error should mention protected title field and automatic management, got: ${errorMessage}`
      );
    }
  });

  test('should reject note type creation with protected "filename" field', async () => {
    const metadataSchema = {
      fields: [
        {
          name: 'filename',
          type: 'string' as MetadataFieldType,
          description: 'Filename of the note'
        },
        {
          name: 'category',
          type: 'string' as MetadataFieldType,
          description: 'Category of the note'
        }
      ]
    };

    try {
      await noteTypeManager.createNoteType(
        'test-type',
        'A test note type',
        ['Test instruction'],
        metadataSchema
      );
      assert.fail('Should have thrown an error for protected filename field');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('filename') &&
          errorMessage.includes('protected') &&
          errorMessage.includes('automatically managed'),
        `Error should mention protected filename field and automatic management, got: ${errorMessage}`
      );
    }
  });

  test('should reject note type creation with protected "created" field', async () => {
    const metadataSchema = {
      fields: [
        {
          name: 'created',
          type: 'date' as MetadataFieldType,
          description: 'Creation timestamp'
        },
        {
          name: 'priority',
          type: 'string' as MetadataFieldType,
          description: 'Priority level'
        }
      ]
    };

    try {
      await noteTypeManager.createNoteType(
        'test-type',
        'A test note type',
        ['Test instruction'],
        metadataSchema
      );
      assert.fail('Should have thrown an error for protected created field');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('created') &&
          errorMessage.includes('protected') &&
          errorMessage.includes('automatically managed'),
        `Error should mention protected created field and automatic management, got: ${errorMessage}`
      );
    }
  });

  test('should reject note type creation with protected "updated" field', async () => {
    const metadataSchema = {
      fields: [
        {
          name: 'updated',
          type: 'date' as MetadataFieldType,
          description: 'Last updated timestamp'
        },
        {
          name: 'tags',
          type: 'array' as MetadataFieldType,
          description: 'Tags for the note'
        }
      ]
    };

    try {
      await noteTypeManager.createNoteType(
        'test-type',
        'A test note type',
        ['Test instruction'],
        metadataSchema
      );
      assert.fail('Should have thrown an error for protected updated field');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('updated') &&
          errorMessage.includes('protected') &&
          errorMessage.includes('automatically managed'),
        `Error should mention protected updated field and automatic management, got: ${errorMessage}`
      );
    }
  });

  test('should reject note type creation with multiple protected fields', async () => {
    const metadataSchema = {
      fields: [
        {
          name: 'title',
          type: 'string' as MetadataFieldType,
          description: 'Title of the note'
        },
        {
          name: 'created',
          type: 'date' as MetadataFieldType,
          description: 'Creation timestamp'
        },
        {
          name: 'updated',
          type: 'date' as MetadataFieldType,
          description: 'Last updated timestamp'
        },
        {
          name: 'status',
          type: 'string' as MetadataFieldType,
          description: 'Status of the note'
        }
      ]
    };

    try {
      await noteTypeManager.createNoteType(
        'test-type',
        'A test note type',
        ['Test instruction'],
        metadataSchema
      );
      assert.fail('Should have thrown an error for multiple protected fields');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('title') &&
          errorMessage.includes('created') &&
          errorMessage.includes('updated') &&
          errorMessage.includes('protected'),
        `Error should mention all protected fields, got: ${errorMessage}`
      );
    }
  });

  test('should allow note type creation with non-protected fields', async () => {
    const metadataSchema = {
      fields: [
        {
          name: 'status',
          type: 'string' as MetadataFieldType,
          description: 'Status of the note',
          constraints: {
            options: ['draft', 'published', 'archived']
          }
        },
        {
          name: 'priority',
          type: 'number' as MetadataFieldType,
          description: 'Priority level',
          constraints: {
            min: 1,
            max: 5
          }
        },
        {
          name: 'tags',
          type: 'array' as MetadataFieldType,
          description: 'Tags for the note'
        }
      ]
    };

    // This should succeed
    const result = await noteTypeManager.createNoteType(
      'valid-type',
      'A valid note type',
      ['Test instruction'],
      metadataSchema
    );

    assert.strictEqual(result.name, 'valid-type');
    assert.strictEqual(typeof result.path, 'string');
    assert.strictEqual(typeof result.created, 'string');

    // Verify the note type was actually created
    const descriptionPath = join(
      tempDir,
      '.flint-note',
      'descriptions',
      'valid-type_description.md'
    );
    const descriptionExists = await fs
      .access(descriptionPath)
      .then(() => true)
      .catch(() => false);
    assert.ok(descriptionExists, 'Description file should be created');
  });

  test('should allow note type creation with no metadata schema', async () => {
    // This should succeed
    const result = await noteTypeManager.createNoteType(
      'simple-type',
      'A simple note type without metadata',
      ['Simple instruction'],
      null
    );

    assert.strictEqual(result.name, 'simple-type');
    assert.strictEqual(typeof result.path, 'string');
    assert.strictEqual(typeof result.created, 'string');
  });

  test('should allow note type creation with empty metadata schema', async () => {
    // This should succeed
    const result = await noteTypeManager.createNoteType(
      'empty-schema-type',
      'A note type with empty metadata schema',
      ['Empty schema instruction'],
      { fields: [] }
    );

    assert.strictEqual(result.name, 'empty-schema-type');
    assert.strictEqual(typeof result.path, 'string');
    assert.strictEqual(typeof result.created, 'string');
  });

  test('should handle protected fields case-insensitively', async () => {
    const metadataSchema = {
      fields: [
        {
          name: 'Title', // Capitalized version
          type: 'string' as MetadataFieldType,
          description: 'Title of the note'
        }
      ]
    };

    // Should still work because we only check lowercase field names
    const result = await noteTypeManager.createNoteType(
      'case-test-type',
      'A note type to test case sensitivity',
      ['Case test instruction'],
      metadataSchema
    );

    assert.strictEqual(result.name, 'case-test-type');
    assert.strictEqual(typeof result.path, 'string');
    assert.strictEqual(typeof result.created, 'string');
  });

  test('should validate protected fields regardless of other field properties', async () => {
    const metadataSchema = {
      fields: [
        {
          name: 'created',
          type: 'string' as MetadataFieldType, // Different type than expected
          description: 'Not actually a creation timestamp',
          constraints: {
            pattern: '^[a-z]+$'
          }
        }
      ]
    };

    try {
      await noteTypeManager.createNoteType(
        'test-type',
        'A test note type',
        ['Test instruction'],
        metadataSchema
      );
      assert.fail(
        'Should have thrown an error for protected created field regardless of type'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      assert.ok(
        errorMessage.includes('created') && errorMessage.includes('protected'),
        `Error should mention protected created field, got: ${errorMessage}`
      );
    }
  });
});
