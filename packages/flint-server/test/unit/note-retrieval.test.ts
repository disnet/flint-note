/**
 * Note Retrieval Tests
 *
 * Comprehensive tests for note retrieval functionality including
 * content parsing, metadata extraction, error handling, and edge cases.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';

import {
  createTestWorkspace,
  cleanupTestWorkspace,
  createTestNotes,
  createTestNotesWithMetadata,
  createTestNoteTypes,
  TEST_CONSTANTS,
  type TestContext
} from './helpers/test-utils.ts';

describe('Note Retrieval', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestWorkspace('note-retrieval-test');
    await createTestNoteTypes(context);
    await createTestNotes(context);
    await createTestNotesWithMetadata(context);
  });

  afterEach(async () => {
    await cleanupTestWorkspace(context);
  });

  describe('Basic Note Retrieval', () => {
    test('should retrieve a note with basic content', async () => {
      // Create a simple note first
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Simple Retrieval Test',
        'This is a simple note for retrieval testing.'
      );

      // Retrieve the note
      const retrievedNote = await context.noteManager.getNote(noteInfo.id);

      assert.ok(retrievedNote, 'Should retrieve the note');
      assert.strictEqual(retrievedNote.id, noteInfo.id, 'Should have correct ID');
      assert.strictEqual(
        retrievedNote.title,
        'Simple Retrieval Test',
        'Should have correct title'
      );
      assert.strictEqual(
        retrievedNote.type,
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Should have correct type'
      );
      assert.ok(
        retrievedNote.content.includes('simple note for retrieval'),
        'Should have correct content'
      );
      assert.ok(retrievedNote.created, 'Should have created timestamp');
      assert.ok(retrievedNote.updated, 'Should have updated timestamp');
    });

    test('should retrieve note by file path', async () => {
      // Create a note in a specific type
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.PROJECT,
        'Project Note',
        'This is a project note.'
      );

      // Retrieve by path
      const retrievedNote = await context.noteManager.getNoteByPath(noteInfo.path);

      assert.ok(retrievedNote, 'Should retrieve note by path');
      assert.strictEqual(
        retrievedNote.title,
        'Project Note',
        'Should have correct title'
      );
      assert.strictEqual(
        retrievedNote.type,
        TEST_CONSTANTS.NOTE_TYPES.PROJECT,
        'Should have correct type'
      );
    });

    test('should return null for non-existent note', async () => {
      const nonExistentId = 'general/non-existent-note.md';
      const result = await context.noteManager.getNote(nonExistentId);

      assert.strictEqual(result, null, 'Should return null for non-existent note');
    });
  });

  describe('Metadata Extraction', () => {
    test('should parse YAML frontmatter correctly', async () => {
      const noteWithMetadata = `---
title: "Test Note with Metadata"
author: "Test Author"
tags: ["test", "metadata", "parsing"]
priority: 1
published: true
custom_field: "custom value"
---

# Test Content

This note has comprehensive metadata.`;

      // Write note directly to test parsing
      const notePath = context.workspace.getNotePath(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'metadata-test.md'
      );
      await fs.writeFile(notePath, noteWithMetadata, 'utf8');

      const noteId = `${TEST_CONSTANTS.NOTE_TYPES.DEFAULT}/metadata-test.md`;
      const retrievedNote = await context.noteManager.getNote(noteId);

      assert.ok(retrievedNote, 'Should retrieve note with metadata');
      assert.strictEqual(
        retrievedNote.metadata?.author,
        'Test Author',
        'Should parse author'
      );
      assert.deepStrictEqual(
        retrievedNote.metadata?.tags,
        ['test', 'metadata', 'parsing'],
        'Should parse tags array'
      );
      assert.strictEqual(
        retrievedNote.metadata?.priority,
        1,
        'Should parse numeric priority'
      );
      assert.strictEqual(retrievedNote.metadata?.published, true, 'Should parse boolean');
      assert.strictEqual(
        retrievedNote.metadata?.custom_field,
        'custom value',
        'Should parse custom fields'
      );
    });

    test('should handle malformed YAML frontmatter gracefully', async () => {
      const noteWithBadYaml = `---
title: "Unclosed quote
invalid: yaml: structure: here
bad_list:
  - item 1
  - item 2
    - nested without proper indentation
---

# Content

This note has malformed YAML.`;

      const notePath = context.workspace.getNotePath(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'bad-yaml.md'
      );
      await fs.writeFile(notePath, noteWithBadYaml, 'utf8');

      const noteId = `${TEST_CONSTANTS.NOTE_TYPES.DEFAULT}/bad-yaml.md`;
      const retrievedNote = await context.noteManager.getNote(noteId);

      assert.ok(retrievedNote, 'Should retrieve note despite bad YAML');
      assert.ok(
        retrievedNote.content.includes('This note has malformed YAML'),
        'Should preserve content'
      );
      // Metadata might be empty or partial due to parsing errors
      assert.ok(
        typeof retrievedNote.metadata === 'object',
        'Should provide metadata object'
      );
    });

    test('should handle notes without frontmatter', async () => {
      const noteWithoutFrontmatter = `# Simple Note

This note has no frontmatter at all.

Just plain markdown content.`;

      const notePath = context.workspace.getNotePath(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'no-frontmatter.md'
      );
      await fs.writeFile(notePath, noteWithoutFrontmatter, 'utf8');

      const noteId = `${TEST_CONSTANTS.NOTE_TYPES.DEFAULT}/no-frontmatter.md`;
      const retrievedNote = await context.noteManager.getNote(noteId);

      assert.ok(retrievedNote, 'Should retrieve note without frontmatter');
      assert.ok(retrievedNote.content.includes('Simple Note'), 'Should have content');
      assert.ok(retrievedNote.metadata, 'Should provide empty metadata object');
    });

    test('should extract title from content if not in frontmatter', async () => {
      const noteWithContentTitle = `# Content Title

This note's title comes from the H1 header, not frontmatter.`;

      const notePath = context.workspace.getNotePath(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'content-title.md'
      );
      await fs.writeFile(notePath, noteWithContentTitle, 'utf8');

      const noteId = `${TEST_CONSTANTS.NOTE_TYPES.DEFAULT}/content-title.md`;
      const retrievedNote = await context.noteManager.getNote(noteId);

      assert.ok(retrievedNote, 'Should retrieve note');
      assert.strictEqual(
        retrievedNote.title,
        'Content Title',
        'Should extract title from content'
      );
    });
  });

  describe('Content Processing', () => {
    test('should preserve markdown formatting', async () => {
      const markdownContent = `# Main Title

## Subsection

This note contains:

- **Bold text**
- *Italic text*
- [Links](https://example.com)
- \`inline code\`

### Code Block

\`\`\`javascript
function example() {
  return "code block";
}
\`\`\`

### Lists

1. Numbered item
2. Another item
   - Nested bullet
   - Another bullet

### Blockquote

> This is a blockquote
> with multiple lines

### Table

| Column 1 | Column 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
`;

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Markdown Test',
        markdownContent
      );

      const retrievedNote = await context.noteManager.getNote(noteInfo.id);

      assert.ok(retrievedNote, 'Should retrieve markdown note');
      assert.ok(
        retrievedNote.content.includes('**Bold text**'),
        'Should preserve bold formatting'
      );
      assert.ok(
        retrievedNote.content.includes('*Italic text*'),
        'Should preserve italic formatting'
      );
      assert.ok(
        retrievedNote.content.includes('[Links](https://example.com)'),
        'Should preserve links'
      );
      assert.ok(
        retrievedNote.content.includes('```javascript'),
        'Should preserve code blocks'
      );
      assert.ok(
        retrievedNote.content.includes('> This is a blockquote'),
        'Should preserve blockquotes'
      );
      assert.ok(
        retrievedNote.content.includes('| Column 1 | Column 2 |'),
        'Should preserve tables'
      );
    });

    test('should handle empty content', async () => {
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Empty Content Note',
        ''
      );

      const retrievedNote = await context.noteManager.getNote(noteInfo.id);

      assert.ok(retrievedNote, 'Should retrieve note with empty content');
      assert.strictEqual(retrievedNote.title, 'Empty Content Note', 'Should have title');
      assert.ok(typeof retrievedNote.content === 'string', 'Content should be string');
    });

    test('should handle very large content', async () => {
      const largeContent = 'A'.repeat(10000) + '\n\n' + 'B'.repeat(10000);

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Large Content Note',
        largeContent
      );

      const retrievedNote = await context.noteManager.getNote(noteInfo.id);

      assert.ok(retrievedNote, 'Should retrieve note with large content');
      assert.ok(retrievedNote.content.length > 20000, 'Should preserve large content');
      assert.ok(
        retrievedNote.content.includes('A'.repeat(100)),
        'Should contain expected content'
      );
    });
  });

  describe('Multiple Note Types', () => {
    test('should retrieve notes from different types', async () => {
      const noteTypes = [
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        TEST_CONSTANTS.NOTE_TYPES.PROJECT,
        TEST_CONSTANTS.NOTE_TYPES.MEETING,
        TEST_CONSTANTS.NOTE_TYPES.BOOK_REVIEW
      ];

      const createdNotes = [];

      // Create notes in different types
      for (const type of noteTypes) {
        let metadata = {};

        // Provide required metadata for book-reviews type
        if (type === 'book-reviews') {
          metadata = {
            author: 'Test Author',
            rating: 4,
            status: 'completed'
          };
        }

        const noteInfo = await context.noteManager.createNote(
          type,
          `${type} Note`,
          `This is a note in ${type} type.`,
          metadata
        );
        createdNotes.push(noteInfo);
      }

      // Retrieve all notes
      for (let i = 0; i < createdNotes.length; i++) {
        const retrievedNote = await context.noteManager.getNote(createdNotes[i].id);

        assert.ok(retrievedNote, `Should retrieve ${noteTypes[i]} note`);
        assert.strictEqual(
          retrievedNote.type,
          noteTypes[i],
          `Should have correct type: ${noteTypes[i]}`
        );
        assert.ok(
          retrievedNote.content.includes(noteTypes[i]),
          'Should have type-specific content'
        );
      }
    });

    test('should handle notes with same filename in different types', async () => {
      const _filename = 'same-name';
      const types = [
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        TEST_CONSTANTS.NOTE_TYPES.PROJECT
      ];

      const notes = [];
      for (const type of types) {
        const noteInfo = await context.noteManager.createNote(
          type,
          'Same Name',
          `Content for ${type} note.`
        );
        notes.push(noteInfo);
      }

      // Retrieve both notes
      for (let i = 0; i < notes.length; i++) {
        const retrievedNote = await context.noteManager.getNote(notes[i].id);

        assert.ok(retrievedNote, `Should retrieve note from ${types[i]}`);
        assert.strictEqual(retrievedNote.type, types[i], 'Should have correct type');
        assert.ok(
          retrievedNote.content.includes(types[i]),
          'Should have correct content'
        );
      }

      // Verify IDs are different
      assert.notStrictEqual(notes[0].id, notes[1].id, 'Should have different IDs');
    });
  });

  describe('File System Integration', () => {
    test('should handle file modifications outside the system', async () => {
      // Create a note normally
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'External Modification Test',
        'Original content.'
      );

      // Modify the file directly
      const modifiedContent = `---
title: "Externally Modified Note"
author: "External Editor"
---

# Modified Content

This was modified outside the system.`;

      await fs.writeFile(noteInfo.path, modifiedContent, 'utf8');

      // Retrieve the note
      const retrievedNote = await context.noteManager.getNote(noteInfo.id);

      assert.ok(retrievedNote, 'Should retrieve externally modified note');
      assert.strictEqual(
        retrievedNote.title,
        'Externally Modified Note',
        'Should reflect external changes'
      );
      assert.strictEqual(
        retrievedNote.metadata?.author,
        'External Editor',
        'Should parse new metadata'
      );
      assert.ok(
        retrievedNote.content.includes('Modified Content'),
        'Should have modified content'
      );
    });

    test('should handle corrupted files gracefully', async () => {
      // Create a note normally
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Corruption Test',
        'Original content.'
      );

      // Corrupt the file with binary data
      const corruptedContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      await fs.writeFile(noteInfo.path, corruptedContent);

      // Try to retrieve the corrupted note
      const retrievedNote = await context.noteManager.getNote(noteInfo.id);

      // Should handle gracefully - either return null or return with error indication
      if (retrievedNote) {
        assert.ok(
          typeof retrievedNote.content === 'string',
          'Content should be string even if corrupted'
        );
      } else {
        assert.strictEqual(retrievedNote, null, 'Should return null for corrupted file');
      }
    });

    test('should respect file permissions', async () => {
      // Create a note normally
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Permissions Test',
        'Original content.'
      );

      // Make file unreadable (skip on Windows)
      if (process.platform !== 'win32') {
        await fs.chmod(noteInfo.path, 0o000);

        // Try to retrieve the unreadable note
        await assert.rejects(
          () => context.noteManager.getNote(noteInfo.id),
          /permission denied|EACCES/i,
          'Should throw permission error'
        );

        // Restore permissions for cleanup
        await fs.chmod(noteInfo.path, 0o644);
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle concurrent retrieval requests', async () => {
      // Create a note
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Concurrent Test',
        'Content for concurrent testing.'
      );

      // Make multiple concurrent retrieval requests
      const promises = [];
      const concurrentCount = 10;

      for (let i = 0; i < concurrentCount; i++) {
        promises.push(context.noteManager.getNote(noteInfo.id));
      }

      const results = await Promise.all(promises);

      // All requests should succeed
      for (let i = 0; i < concurrentCount; i++) {
        assert.ok(results[i], `Request ${i} should succeed`);
        assert.strictEqual(
          results[i]?.title,
          'Concurrent Test',
          `Request ${i} should have correct title`
        );
      }
    });

    test('should cache repeated requests efficiently', async () => {
      // Create a note
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Cache Test',
        'Content for cache testing.'
      );

      // Make repeated requests
      const startTime = Date.now();

      const firstRetrieval = await context.noteManager.getNote(noteInfo.id);
      const secondRetrieval = await context.noteManager.getNote(noteInfo.id);
      const thirdRetrieval = await context.noteManager.getNote(noteInfo.id);

      const endTime = Date.now();

      // All should return the same data
      assert.strictEqual(
        firstRetrieval?.title,
        'Cache Test',
        'First retrieval should work'
      );
      assert.strictEqual(
        secondRetrieval?.title,
        'Cache Test',
        'Second retrieval should work'
      );
      assert.strictEqual(
        thirdRetrieval?.title,
        'Cache Test',
        'Third retrieval should work'
      );

      // Should complete reasonably quickly
      assert.ok(endTime - startTime < 1000, 'Multiple retrievals should be fast');
    });

    test('should handle special characters in file content', async () => {
      const specialContent = `# Special Characters Test

Unicode characters: 🚀 💫 ⭐
Emoji: 😀 😃 😄 😁 😆 😅
Non-Latin: 你好 世界 こんにちは العالم
Mathematical: ∑ ∫ ∂ ∇ ∞ ≈ ≠ ≤ ≥
Special symbols: © ® ™ § ¶ † ‡
Combining: é ñ ü ø å æ œ ß

Binary-like content: \x00\x01\x02
Control chars:
Quotes: "double" 'single' "smart" 'smart'
Backslashes: \\n \\t \\r \\
`;

      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Special Characters Test',
        specialContent
      );

      const retrievedNote = await context.noteManager.getNote(noteInfo.id);

      assert.ok(retrievedNote, 'Should retrieve note with special characters');
      assert.ok(retrievedNote.content.includes('🚀'), 'Should preserve emoji');
      assert.ok(retrievedNote.content.includes('你好'), 'Should preserve Unicode');
      assert.ok(
        retrievedNote.content.includes('∑'),
        'Should preserve mathematical symbols'
      );
      assert.ok(
        retrievedNote.content.includes('"smart"'),
        'Should preserve smart quotes'
      );
    });
  });

  describe('Note ID Format Compatibility', () => {
    test('should retrieve note using ID without .md extension', async () => {
      // Create a note
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'ID Format Test',
        'Testing ID format compatibility.'
      );

      // Extract the ID without .md extension
      const idWithoutExtension = noteInfo.id.replace(/\.md$/, '');

      // Retrieve using ID without .md extension
      const retrievedNote = await context.noteManager.getNote(idWithoutExtension);

      assert.ok(retrievedNote, 'Should retrieve note using ID without .md extension');
      assert.strictEqual(
        retrievedNote.id,
        idWithoutExtension,
        'Should return ID as provided'
      );
      assert.strictEqual(
        retrievedNote.title,
        'ID Format Test',
        'Should have correct title'
      );
      assert.ok(
        retrievedNote.content.includes('Testing ID format compatibility'),
        'Should have correct content'
      );
    });

    test('should retrieve note using ID with .md extension', async () => {
      // Create a note
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.PROJECT,
        'ID Format With Extension Test',
        'Testing ID format with extension.'
      );

      // Retrieve using the full ID (which includes .md extension)
      const retrievedNote = await context.noteManager.getNote(noteInfo.id);

      assert.ok(retrievedNote, 'Should retrieve note using ID with .md extension');
      assert.strictEqual(retrievedNote.id, noteInfo.id, 'Should have correct ID');
      assert.strictEqual(
        retrievedNote.title,
        'ID Format With Extension Test',
        'Should have correct title'
      );
      assert.ok(
        retrievedNote.content.includes('Testing ID format with extension'),
        'Should have correct content'
      );
    });

    test('should handle both ID formats for the same note', async () => {
      // Create a note in a specific type
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.MEETING,
        'Dual Format Test',
        'Testing both ID formats for same note.'
      );

      // Extract ID without extension
      const idWithoutExtension = noteInfo.id.replace(/\.md$/, '');
      const idWithExtension = noteInfo.id;

      // Retrieve using both formats
      const [noteWithoutExt, noteWithExt] = await Promise.all([
        context.noteManager.getNote(idWithoutExtension),
        context.noteManager.getNote(idWithExtension)
      ]);

      // Both should succeed and return the same note content
      assert.ok(noteWithoutExt, 'Should retrieve note using ID without extension');
      assert.ok(noteWithExt, 'Should retrieve note using ID with extension');

      // IDs should match what was requested
      assert.strictEqual(
        noteWithoutExt.id,
        idWithoutExtension,
        'Should return ID without extension as provided'
      );
      assert.strictEqual(
        noteWithExt.id,
        idWithExtension,
        'Should return ID with extension as provided'
      );

      // Content should be identical
      assert.strictEqual(
        noteWithoutExt.title,
        noteWithExt.title,
        'Both formats should return same title'
      );
      assert.strictEqual(
        noteWithoutExt.content,
        noteWithExt.content,
        'Both formats should return same content'
      );
      assert.strictEqual(
        noteWithoutExt.type,
        noteWithExt.type,
        'Both formats should return same type'
      );
      assert.strictEqual(
        noteWithoutExt.path,
        noteWithExt.path,
        'Both formats should return same path'
      );
    });

    test('should handle mixed ID formats in different note types', async () => {
      const testCases = [
        { type: TEST_CONSTANTS.NOTE_TYPES.DEFAULT, title: 'Default Type Test' },
        { type: TEST_CONSTANTS.NOTE_TYPES.PROJECT, title: 'Project Type Test' },
        { type: TEST_CONSTANTS.NOTE_TYPES.MEETING, title: 'Meeting Type Test' }
      ];

      const createdNotes = [];

      // Create notes in different types
      for (const testCase of testCases) {
        const noteInfo = await context.noteManager.createNote(
          testCase.type,
          testCase.title,
          `Content for ${testCase.type} note.`
        );
        createdNotes.push({ ...noteInfo, expectedTitle: testCase.title });
      }

      // Test each note with both ID formats
      for (const note of createdNotes) {
        const idWithoutExtension = note.id.replace(/\.md$/, '');
        const idWithExtension = note.id;

        // Test both formats
        const [noteWithoutExt, noteWithExt] = await Promise.all([
          context.noteManager.getNote(idWithoutExtension),
          context.noteManager.getNote(idWithExtension)
        ]);

        assert.ok(noteWithoutExt, `Should retrieve ${note.type} note without extension`);
        assert.ok(noteWithExt, `Should retrieve ${note.type} note with extension`);

        assert.strictEqual(
          noteWithoutExt.title,
          note.expectedTitle,
          `Should have correct title for ${note.type} without extension`
        );
        assert.strictEqual(
          noteWithExt.title,
          note.expectedTitle,
          `Should have correct title for ${note.type} with extension`
        );
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should provide helpful error messages for invalid IDs', async () => {
      const invalidIds = [
        '',
        'invalid-format',
        'missing/extension',
        'too/many/slashes/here.md',
        '../parent-directory.md',
        'absolute/path.md'
      ];

      for (const invalidId of invalidIds) {
        const result = await context.noteManager.getNote(invalidId);
        assert.strictEqual(
          result,
          null,
          `Should return null for invalid ID: ${invalidId}`
        );
      }
    });

    test('should handle workspace path traversal attempts', async () => {
      const maliciousIds = [
        '../../../etc/passwd',
        'general/../../../etc/passwd',
        'general/../../outside-workspace.md',
        '..\\..\\windows-path.md'
      ];

      for (const maliciousId of maliciousIds) {
        const result = await context.noteManager.getNote(maliciousId);
        assert.strictEqual(result, null, `Should reject malicious path: ${maliciousId}`);
      }
    });

    test('should recover from temporary file system issues', async () => {
      // Create a note
      const noteInfo = await context.noteManager.createNote(
        TEST_CONSTANTS.NOTE_TYPES.DEFAULT,
        'Recovery Test',
        'Test recovery functionality.'
      );

      // Verify it can be retrieved initially
      const initialRetrieval = await context.noteManager.getNote(noteInfo.id);
      assert.ok(initialRetrieval, 'Should retrieve note initially');

      // Temporarily move the file to simulate file system issue
      const tempPath = noteInfo.path + '.temp';
      await fs.rename(noteInfo.path, tempPath);

      // Should return null when file is missing
      const missingRetrieval = await context.noteManager.getNote(noteInfo.id);
      assert.strictEqual(missingRetrieval, null, 'Should return null when file missing');

      // Restore the file
      await fs.rename(tempPath, noteInfo.path);

      // Should work again after recovery
      const recoveredRetrieval = await context.noteManager.getNote(noteInfo.id);
      assert.ok(recoveredRetrieval, 'Should retrieve note after recovery');
      assert.strictEqual(
        recoveredRetrieval.title,
        'Recovery Test',
        'Should have correct data after recovery'
      );
    });
  });
});
