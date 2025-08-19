/**
 * Frontmatter Metadata Tests
 *
 * Comprehensive tests for metadata handling in frontmatter during note operations
 * including creation, updates, retrieval, and validation scenarios.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import { join as pathJoin } from 'node:path';
import {
  createTestWorkspace,
  cleanupTestWorkspace,
  createTestNoteTypes,
  TEST_CONSTANTS,
  type TestContext
} from './helpers/test-utils.ts';

describe('Frontmatter Metadata Handling', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('frontmatter-metadata-test');
    await createTestNoteTypes(context);
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  describe('Note Creation with Metadata', () => {
    test('should create note with metadata in frontmatter', async () => {
      const title = 'Book Review: Atomic Habits';
      const content = 'This book changed my perspective on habit formation.';
      const metadata = {
        author: 'James Clear',
        rating: 5,
        tags: ['self-help', 'productivity'],
        isbn: '978-0735211292',
        published: true
      };

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content,
        metadata
      );

      // Verify note was created
      assert.ok(noteInfo.id);
      assert.ok(noteInfo.path);

      // Read the actual file content
      const fileContent = await fs.readFile(noteInfo.path, 'utf-8');

      // Verify frontmatter structure
      assert.match(fileContent, /^---\n/);
      assert.match(fileContent, /\n---\n\n/);

      // Verify required metadata fields are in frontmatter
      assert.match(fileContent, /^title: "Book Review: Atomic Habits"$/m);
      assert.match(fileContent, /^type: general$/m);
      assert.match(
        fileContent,
        /^created: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/m
      );
      assert.match(
        fileContent,
        /^updated: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/m
      );

      // Verify custom metadata fields are in frontmatter
      assert.match(fileContent, /^author: "James Clear"$/m);
      assert.match(fileContent, /^rating: 5$/m);
      assert.match(fileContent, /^tags: \["self-help", "productivity"\]$/m);
      assert.match(fileContent, /^isbn: "978-0735211292"$/m);
      assert.match(fileContent, /^published: true$/m);

      // Verify content is after frontmatter
      assert.match(
        fileContent,
        /---\n\nThis book changed my perspective on habit formation\./
      );

      // Verify metadata is NOT in the body content
      const bodyContent = fileContent.split('---\n\n')[1];
      assert.ok(bodyContent);
      assert.ok(!bodyContent.includes('author: "James Clear"'));
      assert.ok(!bodyContent.includes('rating: 5'));
    });

    test('should create note with complex metadata types in frontmatter', async () => {
      const title = 'Complex Metadata Test';
      const content = 'Testing various metadata types.';
      const metadata = {
        stringValue: 'test string',
        numberValue: 42,
        floatValue: 3.14,
        booleanTrue: true,
        booleanFalse: false,
        arrayStrings: ['tag1', 'tag2', 'tag3'],
        arrayNumbers: [1, 2, 3],
        arrayMixed: ['string', 42, true],
        nullValue: null
      };

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content,
        metadata
      );

      const fileContent = await fs.readFile(noteInfo.path, 'utf-8');

      // Verify different data types are properly formatted in YAML
      assert.match(fileContent, /^stringValue: "test string"$/m);
      assert.match(fileContent, /^numberValue: 42$/m);
      assert.match(fileContent, /^floatValue: 3\.14$/m);
      assert.match(fileContent, /^booleanTrue: true$/m);
      assert.match(fileContent, /^booleanFalse: false$/m);
      assert.match(fileContent, /^arrayStrings: \["tag1", "tag2", "tag3"\]$/m);
      assert.match(fileContent, /^arrayNumbers: \[1, 2, 3\]$/m);
      assert.match(fileContent, /^arrayMixed: \["string", 42, true\]$/m);
      assert.match(fileContent, /^nullValue: null$/m);
    });

    test('should create note with default tags in frontmatter when not provided', async () => {
      const title = 'Note Without Tags';
      const content = 'This note has no custom tags.';

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content
      );

      const fileContent = await fs.readFile(noteInfo.path, 'utf-8');

      // Verify default empty tags array is added
      assert.match(fileContent, /^tags: \[\]$/m);
    });

    test('should preserve custom tags in frontmatter', async () => {
      const title = 'Note With Custom Tags';
      const content = 'This note has custom tags.';
      const metadata = {
        tags: ['custom', 'important', 'test']
      };

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content,
        metadata
      );

      const fileContent = await fs.readFile(noteInfo.path, 'utf-8');

      // Verify custom tags are properly set
      assert.match(fileContent, /^tags: \["custom", "important", "test"\]$/m);
      // Should not have default empty tags
      assert.ok(!fileContent.match(/^tags: \[\]$/m));
    });
  });

  describe('Note Retrieval and Parsing', () => {
    test('should correctly parse metadata from frontmatter', async () => {
      const title = 'Test Note for Parsing';
      const content = 'Content for parsing test.';
      const metadata = {
        author: 'Test Author',
        rating: 4,
        tags: ['test', 'parsing'],
        published: true
      };

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content,
        metadata
      );

      // Retrieve the note
      const retrievedNote = await context.noteManager.getNote(noteInfo.id);
      assert.ok(retrievedNote, 'Note should be retrieved successfully');

      // Verify metadata was parsed correctly
      assert.strictEqual(retrievedNote.metadata.title, title);
      assert.strictEqual(retrievedNote.metadata.type, TEST_CONSTANTS.NOTE_TYPES.DEFAULT);
      assert.strictEqual(retrievedNote.metadata.author, 'Test Author');
      assert.strictEqual(retrievedNote.metadata.rating, 4);
      assert.deepStrictEqual(retrievedNote.metadata.tags, ['test', 'parsing']);
      assert.strictEqual(retrievedNote.metadata.published, true);
      assert.ok(retrievedNote.metadata.created);
      assert.ok(retrievedNote.metadata.updated);

      // Verify content was parsed correctly (without frontmatter)
      assert.strictEqual(retrievedNote.content.trim(), `Content for parsing test.`);
    });

    test('should handle note with manually created frontmatter', async () => {
      // Create a note file manually with frontmatter
      const manualNoteContent = `---
title: "Manual Note"
type: general
author: "Manual Author"
rating: 3
tags: ["manual", "test"]
published: false
custom_field: "custom value"
created: 2024-01-01T00:00:00.000Z
updated: 2024-01-01T00:00:00.000Z
---

# Manual Note

This note was created manually with frontmatter.

## Section 1

Some content here.`;

      const notePath = pathJoin(
        context.workspace.getNoteTypePath(TEST_CONSTANTS.NOTE_TYPES.DEFAULT),
        'manual-note.md'
      );
      // Ensure the directory exists before writing the file
      await context.workspace.ensureNoteType(TEST_CONSTANTS.NOTE_TYPES.DEFAULT);
      await fs.writeFile(notePath, manualNoteContent, 'utf-8');

      // Retrieve the note using the note manager
      const retrievedNote = await context.noteManager.getNoteByPath(notePath);
      assert.ok(retrievedNote, 'Note should be retrieved successfully');

      // Verify metadata was parsed correctly
      assert.strictEqual(retrievedNote.metadata.title, 'Manual Note');
      assert.strictEqual(retrievedNote.metadata.type, 'general');
      assert.strictEqual(retrievedNote.metadata.author, 'Manual Author');
      assert.strictEqual(retrievedNote.metadata.rating, 3);
      assert.deepStrictEqual(retrievedNote.metadata.tags, ['manual', 'test']);
      assert.strictEqual(retrievedNote.metadata.published, false);
      assert.strictEqual(retrievedNote.metadata.custom_field, 'custom value');
      assert.strictEqual(retrievedNote.metadata.created, '2024-01-01T00:00:00.000Z');
      assert.strictEqual(retrievedNote.metadata.updated, '2024-01-01T00:00:00.000Z');

      // Verify content was parsed correctly (without frontmatter)
      const expectedContent = `# Manual Note

This note was created manually with frontmatter.

## Section 1

Some content here.`;
      assert.strictEqual(retrievedNote.content, expectedContent);
    });
  });

  describe('Note Updates with Metadata', () => {
    test('should update note content while preserving frontmatter metadata', async () => {
      const title = 'Note to Update';
      const originalContent = 'Original content.';
      const metadata = {
        author: 'Original Author',
        rating: 3,
        tags: ['original']
      };

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        originalContent,
        metadata
      );

      const updatedContent = 'Updated content with new information.';

      // Get the current note to obtain content hash
      const currentNote = await context.noteManager.getNote(noteInfo.id);
      assert(currentNote, 'Current note should not be null');
      assert(currentNote.content_hash, 'Current note should have content hash');

      // Update the note
      await context.noteManager.updateNote(
        noteInfo.id,
        updatedContent,
        currentNote.content_hash
      );

      // Read the updated file
      const fileContent = await fs.readFile(noteInfo.path, 'utf-8');

      // Verify frontmatter metadata is preserved
      assert.match(fileContent, /^title: "Note to Update"$/m);
      assert.match(fileContent, /^author: "Original Author"$/m);
      assert.match(fileContent, /^rating: 3$/m);
      assert.match(fileContent, /^tags: \["original"\]$/m);

      // Verify updated timestamp changed (now quoted)
      assert.match(
        fileContent,
        /^updated: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"$/m
      );

      // Verify content was updated (note: update function doesn't add title header automatically)
      assert.match(fileContent, /Updated content with new information\./);
    });

    test('should update note with new metadata while preserving existing metadata', async () => {
      const title = 'Note for Metadata Update';
      const content = 'Content for metadata update test.';
      const originalMetadata = {
        author: 'Original Author',
        rating: 3,
        tags: ['original']
      };

      const updatedNote = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content,
        originalMetadata
      );

      const newMetadata = {
        rating: 5,
        tags: ['updated', 'improved'],
        new_field: 'new value'
      };

      // Get the current note to obtain content hash
      const currentNote = await context.noteManager.getNote(updatedNote.id);
      assert(currentNote, 'Current note should not be null');
      assert(currentNote.content_hash, 'Current note should have content hash');

      // Update with new metadata
      await context.noteManager.updateNoteWithMetadata(
        updatedNote.id,
        content,
        newMetadata,
        currentNote.content_hash
      );

      // Read the updated file
      const fileContent = await fs.readFile(updatedNote.path, 'utf-8');

      // Verify original author is preserved (now that we fixed the merge logic)
      assert.match(fileContent, /^author: "Original Author"$/m);

      // Verify updated fields
      assert.match(fileContent, /^rating: 5$/m);
      assert.match(fileContent, /^tags: \["updated", "improved"\]$/m);
      assert.match(fileContent, /^new_field: "new value"$/m);

      // Verify system fields are preserved
      assert.match(fileContent, /^title: "Note for Metadata Update"$/m);
      assert.match(fileContent, /^type: "general"$/m);
      assert.match(
        fileContent,
        /^created: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"$/m
      );
      assert.match(
        fileContent,
        /^updated: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"$/m
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle note with malformed frontmatter gracefully', async () => {
      // Create a note with malformed frontmatter
      const malformedContent = `---
title: "Malformed Note"
invalid: yaml: content: [unclosed
---

# Malformed Note

This note has malformed frontmatter.`;

      const notePath = pathJoin(
        context.workspace.getNoteTypePath('general'),
        'malformed-note.md'
      );
      // Ensure the directory exists before writing the file
      await context.workspace.ensureNoteType('general');
      await fs.writeFile(notePath, malformedContent, 'utf-8');

      // Should still be able to retrieve the note
      const retrievedNote = await context.noteManager.getNoteByPath(notePath);
      assert.ok(retrievedNote, 'Note should be retrieved successfully');

      // Metadata should be empty due to parsing failure
      assert.deepStrictEqual(retrievedNote.metadata, {});

      // Content should still be available
      assert.strictEqual(
        retrievedNote.content,
        '# Malformed Note\n\nThis note has malformed frontmatter.'
      );
    });

    test('should handle note without frontmatter', async () => {
      // Create a note without frontmatter
      const plainContent = `# Plain Note

This note has no frontmatter.

Just plain markdown content.`;

      const notePath = pathJoin(
        context.workspace.getNoteTypePath('general'),
        'plain-note.md'
      );
      // Ensure the directory exists before writing the file
      await context.workspace.ensureNoteType('general');
      await fs.writeFile(notePath, plainContent, 'utf-8');

      // Should be able to retrieve the note
      const retrievedNote = await context.noteManager.getNoteByPath(notePath);
      assert.ok(retrievedNote, 'Note should be retrieved successfully');

      // Metadata should be empty
      assert.deepStrictEqual(retrievedNote.metadata, {});

      // Content should be the entire file content
      assert.strictEqual(retrievedNote.content, plainContent);
    });

    test('should handle note with only frontmatter and no content', async () => {
      const title = 'Empty Content Note';
      const metadata = {
        author: 'Test Author',
        tags: ['empty']
      };

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        '', // Empty content
        metadata
      );

      const fileContent = await fs.readFile(noteInfo.path, 'utf-8');

      // Should have frontmatter
      assert.match(fileContent, /^---\n/);
      assert.match(fileContent, /\n---\n\n/);
      assert.match(fileContent, /^title: "Empty Content Note"$/m);
      assert.match(fileContent, /^author: "Test Author"$/m);
    });

    test('should handle metadata with special characters and quotes', async () => {
      const title = 'Special Characters Test';
      const content = 'Testing special characters in metadata.';
      const metadata = {
        description: 'A note with "quotes" and special chars: @#$%^&*()',
        author: "O'Reilly & Associates",
        tags: ['test-tag', 'special_chars', 'with spaces'],
        note_with_colon: 'Value: with colon',
        unicode: '🔥 Unicode characters 你好'
      };

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        title,
        content,
        metadata
      );

      const fileContent = await fs.readFile(noteInfo.path, 'utf-8');

      // Verify special characters are properly handled in YAML (quotes should be escaped)
      assert.match(
        fileContent,
        /^description: "A note with \\"quotes\\" and special chars: @#\$%\^&\*\(\)"$/m
      );
      assert.match(fileContent, /^author: "O'Reilly & Associates"$/m);
      assert.match(
        fileContent,
        /^tags: \["test-tag", "special_chars", "with spaces"\]$/m
      );
      assert.match(fileContent, /^note_with_colon: "Value: with colon"$/m);
      assert.match(fileContent, /^unicode: "🔥 Unicode characters 你好"$/m);

      // Verify the note can be retrieved and parsed correctly
      const retrievedNote = await context.noteManager.getNote(noteInfo.id);
      assert.ok(retrievedNote, 'Note should be retrieved successfully');

      assert.strictEqual(
        retrievedNote.metadata.description,
        'A note with "quotes" and special chars: @#$%^&*()'
      );
      assert.strictEqual(retrievedNote.metadata.author, "O'Reilly & Associates");
      assert.strictEqual(retrievedNote.metadata.unicode, '🔥 Unicode characters 你好');
      assert.strictEqual(retrievedNote.metadata.note_with_colon, 'Value: with colon');
    });
  });
});
