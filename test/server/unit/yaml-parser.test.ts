/**
 * YAML Parser Tests
 *
 * Comprehensive tests for YAML frontmatter parsing utilities including
 * metadata extraction, content separation, error handling, and edge cases.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseFrontmatter, parseNoteContent } from '../../src/utils/yaml-parser.ts';
import type { NoteLink } from '../../src/types/index.ts';

describe('YAML Parser', () => {
  describe('parseFrontmatter', () => {
    test('should parse basic YAML frontmatter', () => {
      const yaml = `title: "Test Note"
type: general
created: 2024-01-01T00:00:00Z
updated: 2024-01-01T00:00:00Z
tags: ["test", "example"]`;

      const result = parseFrontmatter(yaml);

      assert.strictEqual(result.title, 'Test Note');
      assert.strictEqual(result.type, 'general');
      // YAML parser converts ISO dates to Date objects and back to full ISO strings
      assert.strictEqual(result.created, '2024-01-01T00:00:00.000Z');
      assert.strictEqual(result.updated, '2024-01-01T00:00:00.000Z');
      assert.deepStrictEqual(result.tags, ['test', 'example']);
    });

    test('should parse metadata with different value types', () => {
      const yaml = `title: "Complex Note"
rating: 5
published: true
price: 29.99
tags: []
description: null`;

      const result = parseFrontmatter(yaml);

      assert.strictEqual(result.title, 'Complex Note');
      assert.strictEqual(result.rating, 5);
      assert.strictEqual(result.published, true);
      assert.strictEqual(result.price, 29.99);
      assert.deepStrictEqual(result.tags, []);
      assert.strictEqual(result.description, null);
    });

    test('should parse links array with full typing when parseLinks is true', () => {
      const yaml = `title: "Note with Links"
links:
  - target: "general/note-a.md"
    relationship: "references"
    created: "2024-01-01T00:00:00Z"
    context: "Related to project"
  - target: "general/note-b.md"
    relationship: "mentions"
    created: "2024-01-01T01:00:00Z"`;

      const result = parseFrontmatter(yaml, true);

      assert.strictEqual(result.title, 'Note with Links');
      assert.ok(result.links && typeof result.links === 'object');
      assert.ok(Array.isArray(result.links.outbound));
      assert.strictEqual(result.links.outbound!.length, 2);

      const firstLink = result.links.outbound![0] as NoteLink;
      assert.strictEqual(firstLink.target, 'general/note-a.md');
      assert.strictEqual(firstLink.relationship, 'references');
      assert.strictEqual(firstLink.created, '2024-01-01T00:00:00Z');
      assert.strictEqual(firstLink.context, 'Related to project');

      const secondLink = result.links.outbound![1] as NoteLink;
      assert.strictEqual(secondLink.target, 'general/note-b.md');
      assert.strictEqual(secondLink.relationship, 'mentions');
      assert.strictEqual(secondLink.created, '2024-01-01T01:00:00Z');
      assert.strictEqual(secondLink.context, undefined);
    });

    test('should handle links array without full typing when parseLinks is false', () => {
      const yaml = `title: "Note with Links"
links:
  - target: "general/note-a.md"
    relationship: "references"
    created: "2024-01-01T00:00:00Z"`;

      const result = parseFrontmatter(yaml, false);

      assert.strictEqual(result.title, 'Note with Links');
      assert.ok(Array.isArray(result.links));
      assert.strictEqual(result.links!.length, 1);
      // Should be raw object, not typed NoteLink
      assert.strictEqual((result.links![0] as any).target, 'general/note-a.md');
    });

    test('should handle malformed links array gracefully', () => {
      const yaml = `title: "Note with Malformed Links"
links:
  - target: "general/note-a.md"
  - incomplete_link: "missing_target"
  - target: "general/note-b.md"
    relationship: "references"`;

      const result = parseFrontmatter(yaml, true);

      assert.strictEqual(result.title, 'Note with Malformed Links');
      assert.ok(result.links && typeof result.links === 'object');
      assert.ok(Array.isArray(result.links.outbound));
      assert.strictEqual(result.links.outbound!.length, 3);

      // First link should have defaults
      const firstLink = result.links.outbound![0] as NoteLink;
      assert.strictEqual(firstLink.target, 'general/note-a.md');
      assert.strictEqual(firstLink.relationship, 'references');
      assert.ok(firstLink.created);

      // Second link should handle missing target gracefully
      const secondLink = result.links.outbound![1] as NoteLink;
      assert.strictEqual(secondLink.target, '');
      assert.strictEqual(secondLink.relationship, 'references');

      // Third link should be parsed normally
      const thirdLink = result.links.outbound![2] as NoteLink;
      assert.strictEqual(thirdLink.target, 'general/note-b.md');
      assert.strictEqual(thirdLink.relationship, 'references');
    });

    test('should return empty object for empty input', () => {
      const result = parseFrontmatter('');
      assert.deepStrictEqual(result, {});
    });

    test('should return empty object for invalid YAML', () => {
      const invalidYaml = 'invalid: yaml: content: [unclosed';
      assert.throws(() => parseFrontmatter(invalidYaml));
    });

    test('should return empty object for non-object YAML', () => {
      const result = parseFrontmatter('just a string');
      assert.deepStrictEqual(result, {});
    });

    test('should filter out unsupported value types', () => {
      const yaml = `title: "Test Note"
validString: "test"
validNumber: 42
validBoolean: true
validArray: ["a", "b"]
validUndefined: null
unsupportedObject:
  nested: "value"`;

      const result = parseFrontmatter(yaml);

      assert.strictEqual(result.title, 'Test Note');
      assert.strictEqual(result.validString, 'test');
      assert.strictEqual(result.validNumber, 42);
      assert.strictEqual(result.validBoolean, true);
      assert.deepStrictEqual(result.validArray, ['a', 'b']);
      assert.strictEqual(result.validUndefined, null);
      // Unsupported types should be filtered out
      assert.strictEqual(result.unsupportedObject, undefined);
    });

    test('should throw error for JavaScript function tags', () => {
      const yaml = `title: "Test Note"
unsupportedFunction: !!js/function "function() { return 'test'; }"`;

      assert.throws(() => parseFrontmatter(yaml));
    });
  });

  describe('parseNoteContent', () => {
    test('should parse note with frontmatter and content', () => {
      const noteContent = `---
title: "Test Note"
type: general
tags: ["test"]
---

# Test Note

This is the content of the note.

## Section 1

More content here.`;

      const result = parseNoteContent(noteContent);

      assert.strictEqual(result.metadata.title, 'Test Note');
      assert.strictEqual(result.metadata.type, 'general');
      assert.deepStrictEqual(result.metadata.tags, ['test']);

      const expectedContent = `# Test Note

This is the content of the note.

## Section 1

More content here.`;
      assert.strictEqual(result.content, expectedContent);
    });

    test('should handle note without frontmatter', () => {
      const noteContent = `# Test Note

This is a note without frontmatter.`;

      const result = parseNoteContent(noteContent);

      assert.deepStrictEqual(result.metadata, {});
      assert.strictEqual(result.content, noteContent);
    });

    test('should handle empty note', () => {
      const result = parseNoteContent('');

      assert.deepStrictEqual(result.metadata, {});
      assert.strictEqual(result.content, '');
    });

    test('should handle note with only frontmatter', () => {
      const noteContent = `---
title: "Empty Note"
type: general
---

`;

      const result = parseNoteContent(noteContent);

      assert.strictEqual(result.metadata.title, 'Empty Note');
      assert.strictEqual(result.metadata.type, 'general');
      assert.strictEqual(result.content, '');
    });

    test('should handle malformed frontmatter gracefully', () => {
      const noteContent = `---
invalid: yaml: content: [unclosed
---

# Test Note

This note has malformed frontmatter.`;

      const result = parseNoteContent(noteContent);

      // Should return empty metadata when YAML parsing fails
      assert.deepStrictEqual(result.metadata, {});
      assert.strictEqual(
        result.content,
        '# Test Note\n\nThis note has malformed frontmatter.'
      );
    });

    test('should handle multiple frontmatter delimiters', () => {
      const noteContent = `---
title: "First Frontmatter"
---

# Content with another delimiter

---
This is not frontmatter
---

More content.`;

      const result = parseNoteContent(noteContent);

      assert.strictEqual(result.metadata.title, 'First Frontmatter');

      const expectedContent = `# Content with another delimiter

---
This is not frontmatter
---

More content.`;
      assert.strictEqual(result.content, expectedContent);
    });

    test('should parse links with full typing when parseLinks is true', () => {
      const noteContent = `---
title: "Note with Links"
links:
  - target: "general/note-a.md"
    relationship: "references"
    created: "2024-01-01T00:00:00Z"
---

# Note with Links

This note has links in its frontmatter.`;

      const result = parseNoteContent(noteContent, true);

      assert.strictEqual(result.metadata.title, 'Note with Links');
      assert.ok(result.metadata.links && typeof result.metadata.links === 'object');
      assert.ok(Array.isArray(result.metadata.links.outbound));
      assert.strictEqual(result.metadata.links.outbound!.length, 1);

      const firstLink = result.metadata.links.outbound![0] as NoteLink;
      assert.strictEqual(firstLink.target, 'general/note-a.md');
      assert.strictEqual(firstLink.relationship, 'references');
      assert.strictEqual(firstLink.created, '2024-01-01T00:00:00Z');
    });

    test('should parse links without full typing when parseLinks is false', () => {
      const noteContent = `---
title: "Note with Links"
links:
  - target: "general/note-a.md"
    relationship: "references"
---

# Note with Links

This note has links in its frontmatter.`;

      const result = parseNoteContent(noteContent, false);

      assert.strictEqual(result.metadata.title, 'Note with Links');
      assert.ok(Array.isArray(result.metadata.links));
      // Should be raw object array, not typed NoteLink array
      assert.strictEqual((result.metadata.links![0] as any).target, 'general/note-a.md');
    });

    test('should handle frontmatter with Windows line endings', () => {
      const noteContent = `---\r\ntitle: "Windows Note"\r\ntype: general\r\n---\r\n\r\n# Windows Note\r\n\r\nContent with Windows line endings.`;

      const result = parseNoteContent(noteContent);

      assert.strictEqual(result.metadata.title, 'Windows Note');
      assert.strictEqual(result.metadata.type, 'general');
      assert.strictEqual(
        result.content,
        '# Windows Note\r\n\r\nContent with Windows line endings.'
      );
    });

    test('should handle frontmatter with extra whitespace', () => {
      const noteContent = `---
  title: "Whitespace Note"
  type: general
  tags: ["test"]
---

# Whitespace Note

Content after frontmatter.`;

      const result = parseNoteContent(noteContent);

      assert.strictEqual(result.metadata.title, 'Whitespace Note');
      assert.strictEqual(result.metadata.type, 'general');
      assert.deepStrictEqual(result.metadata.tags, ['test']);
      assert.strictEqual(
        result.content,
        '# Whitespace Note\n\nContent after frontmatter.'
      );
    });

    test('should handle complex metadata types', () => {
      const noteContent = `---
title: "Complex Metadata Note"
rating: 4.5
published: true
tags: ["fiction", "sci-fi"]
isbn: "978-0-123456-78-9"
publication_date: 2023-12-01
chapters: 12
price: null
available: false
---

# Complex Metadata Note

This note has various metadata types.`;

      const result = parseNoteContent(noteContent);

      assert.strictEqual(result.metadata.title, 'Complex Metadata Note');
      assert.strictEqual(result.metadata.rating, 4.5);
      assert.strictEqual(result.metadata.published, true);
      assert.deepStrictEqual(result.metadata.tags, ['fiction', 'sci-fi']);
      assert.strictEqual(result.metadata.isbn, '978-0-123456-78-9');
      // YAML parser converts dates to Date objects and back to full ISO strings
      assert.strictEqual(result.metadata.publication_date, '2023-12-01T00:00:00.000Z');
      assert.strictEqual(result.metadata.chapters, 12);
      assert.strictEqual(result.metadata.price, null);
      assert.strictEqual(result.metadata.available, false);
    });
  });
});
