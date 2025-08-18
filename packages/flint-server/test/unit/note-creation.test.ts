/**
 * Note Creation Tests
 *
 * Comprehensive tests for note creation functionality including
 * validation, file operations, metadata handling, and error cases.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import {
  createTestWorkspace,
  cleanupTestWorkspace,
  createTestNoteTypes,
  TEST_CONSTANTS,
  type TestContext
} from './helpers/test-utils.ts';
import type { NoteInfo } from '../../src/types/index.js';

describe('Note Creation', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('note-creation-test');
    await createTestNoteTypes(context);
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  describe('Basic Note Creation', () => {
    test('should create a note in default type', async () => {
      const title = 'My First Note';
      const content = 'This is the content of my first note.';

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content
      );

      assert.ok(noteInfo.id, 'Should return note ID');
      assert.ok(noteInfo.path, 'Should return note path');
      assert.strictEqual(noteInfo.title, title, 'Should return correct title');
      assert.strictEqual(
        noteInfo.type,
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Should return correct type'
      );

      // Verify file was created
      const noteContent = await fs.readFile(noteInfo.path, 'utf8');
      assert.ok(noteContent.includes(title), 'File should contain title');
      assert.ok(noteContent.includes(content), 'File should contain content');
    });

    test('should create a note in specific type', async () => {
      const title = 'Project Planning';
      const content = 'Planning for the new project.';

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.PROJECT,
        title,
        content
      );

      assert.strictEqual(
        noteInfo.type,
        TEST_CONSTANTS.NOTE_TYPES.PROJECT,
        'Should create in correct type'
      );
      assert.ok(
        noteInfo.path.includes('projects'),
        'Path should include project directory'
      );

      // Verify file was created in correct directory
      const noteContent = await fs.readFile(noteInfo.path, 'utf8');
      assert.ok(noteContent.includes(title), 'File should contain title');
      assert.ok(noteContent.includes(content), 'File should contain content');
    });

    test('should throw error when creating notes with duplicate titles', async () => {
      const title = 'Duplicate Title';
      const content1 = 'First note content.';
      const content2 = 'Second note content.';

      // First note should be created successfully
      const note1 = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content1
      );

      assert.ok(note1.id, 'First note should be created successfully');

      // Second note with same title should throw an error
      await assert.rejects(
        () =>
          context.noteManager.createNote(
            TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
            title,
            content2
          ),
        /NOTE_ALREADY_EXISTS|already exists/i,
        'Should throw error when creating note with duplicate title'
      );

      // Verify only the first file exists with correct content
      const content1Read = await fs.readFile(note1.path, 'utf8');
      assert.ok(
        content1Read.includes(content1),
        'First note should have correct content'
      );
    });

    test('should handle empty content', async () => {
      const title = 'Empty Note';
      const content = '';

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content
      );

      assert.ok(noteInfo.id, 'Should create note with empty content');

      const noteContent = await fs.readFile(noteInfo.path, 'utf8');
      assert.ok(noteContent.includes(title), 'Should still include title');
    });
  });

  describe('Metadata and Frontmatter', () => {
    test('should create note with YAML frontmatter', async () => {
      const title = 'Note with Metadata';
      const content = 'Content with metadata.';

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content
      );

      const noteContent = await fs.readFile(noteInfo.path, 'utf8');

      // Check frontmatter structure
      assert.ok(noteContent.startsWith('---\n'), 'Should start with YAML frontmatter');
      assert.ok(
        noteContent.includes(`title: "${title}"`),
        'Should include title in frontmatter'
      );
      assert.ok(
        noteContent.includes(`type: ${TEST_CONSTANTS.NOTE_TYPES.DEFAULT}`),
        'Should include type in frontmatter'
      );
      assert.ok(noteContent.includes('created:'), 'Should include created timestamp');
      assert.ok(noteContent.includes('updated:'), 'Should include updated timestamp');
    });

    test('should preserve existing frontmatter when provided', async () => {
      const title = 'Custom Metadata Note';
      const contentWithFrontmatter = `---
title: "Custom Title"
author: "Test Author"
tags: ["test", "custom"]
priority: "high"
---

# Custom Content

This note has custom frontmatter.`;

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        contentWithFrontmatter
      );

      const noteContent = await fs.readFile(noteInfo.path, 'utf8');

      // Should preserve custom frontmatter
      assert.ok(
        noteContent.includes('author: "Test Author"'),
        'Should preserve custom author'
      );
      assert.ok(
        noteContent.includes('priority: "high"'),
        'Should preserve custom priority'
      );
      assert.ok(
        noteContent.includes('tags: ["test", "custom"]'),
        'Should preserve custom tags'
      );

      // Should still add system metadata
      assert.ok(noteContent.includes('created:'), 'Should add created timestamp');
      assert.ok(noteContent.includes('updated:'), 'Should add updated timestamp');
    });

    test('should handle malformed frontmatter gracefully', async () => {
      const title = 'Malformed Frontmatter Note';
      const contentWithBadFrontmatter = `---
title: "Unclosed quote
invalid: yaml: structure
---

# Content

This has malformed frontmatter.`;

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        contentWithBadFrontmatter
      );

      // Should create note successfully despite malformed frontmatter
      assert.ok(noteInfo.id, 'Should create note despite malformed frontmatter');

      const noteContent = await fs.readFile(noteInfo.path, 'utf8');
      assert.ok(noteContent.includes('Content'), 'Should preserve content');
    });
  });

  describe('Note Type Validation', () => {
    test('should create note type directory if it does not exist', async () => {
      const newTypeName = 'research';
      const title = 'Research Note';
      const content = 'This is a research note.';

      const noteInfo = await context.noteManager.createNote(newTypeName, title, content);

      assert.strictEqual(noteInfo.type, newTypeName, 'Should use correct note type');

      // Verify directory was created
      const typePath = context.workspace.getNoteTypePath(newTypeName);
      const stats = await fs.stat(typePath);
      assert.ok(stats.isDirectory(), 'Should create note type directory');
    });

    test('should reject invalid note type names', async () => {
      const invalidNames = [
        '', // empty
        '.hidden', // starts with dot
        'invalid name', // contains spaces
        'path/with/slashes', // contains slashes
        'CON' // Windows reserved name
      ];

      for (const invalidName of invalidNames) {
        await assert.rejects(
          () => context.noteManager.createNote(invalidName, 'Test', 'Content'),
          /invalid.*note type/i,
          `Should reject invalid note type name: "${invalidName}"`
        );
      }
    });

    test('should accept valid note type names', async () => {
      const validNames = ['simple', 'my-notes', 'my_notes', 'notes123', 'CamelCase'];

      for (const validName of validNames) {
        const noteInfo = await context.noteManager.createNote(
          validName,
          'Test Note',
          'Test content'
        );

        assert.strictEqual(
          noteInfo.type,
          validName,
          `Should accept valid name: "${validName}"`
        );
      }
    });
  });

  describe('File System Operations', () => {
    test('should create note file with correct permissions', async () => {
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Permission Test',
        'Testing file permissions.'
      );

      const stats = await fs.stat(noteInfo.path);
      assert.ok(stats.isFile(), 'Should create a regular file');
      assert.ok(stats.size > 0, 'File should have content');
    });

    test('should handle filesystem errors gracefully', async () => {
      // Try to create note in read-only directory (simulate permission error)
      const originalEnsureNoteType = context.workspace.ensureNoteType;

      context.workspace.ensureNoteType = async () => {
        throw new Error('Permission denied');
      };

      await assert.rejects(
        () => context.noteManager.createNote('readonly', 'Test', 'Content'),
        /Permission denied/,
        'Should propagate filesystem errors'
      );

      // Restore original method
      context.workspace.ensureNoteType = originalEnsureNoteType;
    });

    test('should create nested directory structure if needed', async () => {
      const deepTypeName = 'level1-level2-level3';

      const noteInfo = await context.noteManager.createNote(
        deepTypeName,
        'Deep Note',
        'This is a deeply nested note.'
      );

      assert.ok(
        noteInfo.path.includes(deepTypeName),
        'Should create in correct directory'
      );

      // Verify the note was created and is readable
      const noteContent = await fs.readFile(noteInfo.path, 'utf8');
      assert.ok(noteContent.includes('Deep Note'), 'Should contain correct content');
    });
  });

  describe('Title Processing', () => {
    test('should handle special characters in titles', async () => {
      const specialTitles = [
        'Title with "quotes"',
        'Title with [brackets]',
        'Title with & ampersand',
        'Title with <tags>',
        'Title with émojis 📝',
        'Title with newlines\nand tabs\t'
      ];

      for (const title of specialTitles) {
        const noteInfo = await context.noteManager.createNote(
          TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
          title,
          'Content for special title test.'
        );

        assert.ok(noteInfo.id, `Should create note with title: "${title}"`);

        const noteContent = await fs.readFile(noteInfo.path, 'utf8');
        assert.ok(
          noteContent.includes('Content for special title test.'),
          'Should preserve content'
        );
      }
    });

    test('should handle very long titles', async () => {
      const longTitle = 'A'.repeat(300); // Very long title

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        longTitle,
        'Content for long title test.'
      );

      assert.ok(noteInfo.id, 'Should create note with long title');
      assert.ok(noteInfo.path.length < 260, 'Should keep file path reasonable length'); // Windows path limit
    });

    test('should trim whitespace from titles', async () => {
      const titleWithWhitespace = '   Title with Whitespace   ';
      const expectedTitle = 'Title with Whitespace';

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        titleWithWhitespace,
        'Testing whitespace handling.'
      );

      const noteContent = await fs.readFile(noteInfo.path, 'utf8');
      assert.ok(
        noteContent.includes(`title: "${expectedTitle}"`),
        'Should trim whitespace from title'
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle empty title gracefully', async () => {
      const emptyTitle = '';

      await assert.rejects(
        () =>
          context.noteManager.createNote(
            TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
            emptyTitle,
            'Content'
          ),
        /title.*required/i,
        'Should reject empty title'
      );
    });

    test('should handle whitespace-only title', async () => {
      const whitespaceTitle = '   \n\t   ';

      await assert.rejects(
        () =>
          context.noteManager.createNote(
            TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
            whitespaceTitle,
            'Content'
          ),
        /title.*required/i,
        'Should reject whitespace-only title'
      );
    });

    test('should provide helpful error messages', async () => {
      try {
        await context.noteManager.createNote('', 'Valid Title', 'Content');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error, 'Should throw Error instance');
        assert.ok(error.message.length > 0, 'Should provide error message');
        assert.ok(
          error.message.toLowerCase().includes('note type'),
          'Should mention note type in error'
        );
      }
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent note creation', async () => {
      const promises: Promise<NoteInfo>[] = [];
      const noteCount = 5;

      // Create multiple notes concurrently
      for (let i = 0; i < noteCount; i++) {
        promises.push(
          context.noteManager.createNote(
            TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
            `Concurrent Note ${i}`,
            `Content for note ${i}`
          )
        );
      }

      const results = await Promise.all(promises);

      // Verify all notes were created successfully
      assert.strictEqual(results.length, noteCount, 'Should create all notes');

      const ids = results.map(r => r.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, noteCount, 'Should generate unique IDs');

      const paths = results.map(r => r.path);
      const uniquePaths = new Set(paths);
      assert.strictEqual(uniquePaths.size, noteCount, 'Should generate unique paths');
    });
  });
});
