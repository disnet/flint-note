/**
 * Tests for markdown sync utility functions.
 * Covers props serialization, parsing, and comparison utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  buildMarkdownWithFrontmatter,
  parseMarkdownFile,
  deepEqual,
  propsChanged
} from '../../../src/main/automerge-sync/utils';

describe('automerge-sync utils', () => {
  describe('buildMarkdownWithFrontmatter', () => {
    it('should include props in frontmatter under props key', () => {
      const note = {
        id: 'n-test1234',
        title: 'Test Note',
        content: 'Hello world',
        type: 'type-default',
        props: {
          priority: 'high',
          tags: ['work', 'urgent']
        }
      };

      const result = buildMarkdownWithFrontmatter(note);

      expect(result).toContain('props:');
      expect(result).toContain('priority: high');
      expect(result).toContain('- work');
      expect(result).toContain('- urgent');
    });

    it('should not include empty props section', () => {
      const note = {
        id: 'n-test1234',
        title: 'Test Note',
        content: 'Hello world',
        type: 'type-default',
        props: {}
      };

      const result = buildMarkdownWithFrontmatter(note);

      expect(result).not.toContain('props:');
    });

    it('should not include undefined props', () => {
      const note = {
        id: 'n-test1234',
        title: 'Test Note',
        content: 'Hello world',
        type: 'type-default'
      };

      const result = buildMarkdownWithFrontmatter(note);

      expect(result).not.toContain('props:');
    });

    it('should handle nested object props', () => {
      const note = {
        id: 'n-test1234',
        title: 'Test Note',
        content: 'Hello world',
        type: 'type-default',
        props: {
          metadata: {
            source: 'import',
            version: 2
          }
        }
      };

      const result = buildMarkdownWithFrontmatter(note);

      expect(result).toContain('props:');
      expect(result).toContain('metadata:');
      expect(result).toContain('source: import');
      expect(result).toContain('version: 2');
    });
  });

  describe('parseMarkdownFile', () => {
    it('should parse props from frontmatter', () => {
      const content = `---
id: n-test1234
title: Test Note
type: type-default
props:
  priority: high
  dueDate: "2024-12-31"
---

Content here`;

      const result = parseMarkdownFile(content);

      expect(result).not.toBeNull();
      expect(result?.props).toEqual({
        priority: 'high',
        dueDate: '2024-12-31'
      });
    });

    it('should capture unknown fields as props', () => {
      const content = `---
id: n-test1234
title: Test Note
type: type-default
customField: customValue
anotherField: 42
---

Content here`;

      const result = parseMarkdownFile(content);

      expect(result).not.toBeNull();
      expect(result?.props).toEqual({
        customField: 'customValue',
        anotherField: 42
      });
    });

    it('should merge explicit props with unknown fields', () => {
      const content = `---
id: n-test1234
title: Test Note
type: type-default
props:
  priority: high
unknownField: unknownValue
---

Content here`;

      const result = parseMarkdownFile(content);

      expect(result).not.toBeNull();
      expect(result?.props).toEqual({
        priority: 'high',
        unknownField: 'unknownValue'
      });
    });

    it('should handle array props correctly', () => {
      const content = `---
id: n-test1234
title: Test Note
type: type-default
props:
  tags:
    - work
    - urgent
    - review
---

Content here`;

      const result = parseMarkdownFile(content);

      expect(result).not.toBeNull();
      expect(result?.props?.tags).toEqual(['work', 'urgent', 'review']);
    });

    it('should return undefined props when none present', () => {
      const content = `---
id: n-test1234
title: Test Note
type: type-default
---

Content here`;

      const result = parseMarkdownFile(content);

      expect(result).not.toBeNull();
      expect(result?.props).toBeUndefined();
    });

    it('should not treat system fields as props', () => {
      const content = `---
id: n-test1234
title: Test Note
type: type-custom
---

Content here`;

      const result = parseMarkdownFile(content);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('n-test1234');
      expect(result?.title).toBe('Test Note');
      expect(result?.type).toBe('type-custom');
      expect(result?.props).toBeUndefined();
    });

    it('should round-trip props correctly', () => {
      const originalNote = {
        id: 'n-roundtrip',
        title: 'Round Trip Test',
        content: 'Test content',
        type: 'type-default',
        props: {
          priority: 'high',
          score: 42,
          tags: ['a', 'b', 'c'],
          nested: {
            key: 'value'
          }
        }
      };

      const markdown = buildMarkdownWithFrontmatter(originalNote);
      const parsed = parseMarkdownFile(markdown);

      expect(parsed).not.toBeNull();
      expect(parsed?.props).toEqual(originalNote.props);
    });
  });

  describe('deepEqual', () => {
    it('should return true for identical primitives', () => {
      expect(deepEqual('hello', 'hello')).toBe(true);
      expect(deepEqual(42, 42)).toBe(true);
      expect(deepEqual(true, true)).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(undefined, undefined)).toBe(true);
    });

    it('should return false for different primitives', () => {
      expect(deepEqual('hello', 'world')).toBe(false);
      expect(deepEqual(42, 43)).toBe(false);
      expect(deepEqual(true, false)).toBe(false);
      expect(deepEqual(null, undefined)).toBe(false);
    });

    it('should compare arrays correctly', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
      expect(deepEqual([], [])).toBe(true);
    });

    it('should compare objects correctly', () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
      expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(deepEqual({}, {})).toBe(true);
    });

    it('should compare nested structures', () => {
      expect(
        deepEqual({ a: { b: [1, 2, { c: 3 }] } }, { a: { b: [1, 2, { c: 3 }] } })
      ).toBe(true);

      expect(
        deepEqual({ a: { b: [1, 2, { c: 3 }] } }, { a: { b: [1, 2, { c: 4 }] } })
      ).toBe(false);
    });

    it('should handle mixed types', () => {
      expect(deepEqual({ a: 1 }, [1])).toBe(false);
      expect(deepEqual('1', 1)).toBe(false);
      expect(deepEqual(null, {})).toBe(false);
    });
  });

  describe('propsChanged', () => {
    it('should return false for identical props', () => {
      expect(propsChanged({ a: 1 }, { a: 1 })).toBe(false);
      expect(propsChanged({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBe(false);
    });

    it('should return true for different props', () => {
      expect(propsChanged({ a: 1 }, { a: 2 })).toBe(true);
      expect(propsChanged({ a: 1 }, { b: 1 })).toBe(true);
    });

    it('should return false for both undefined', () => {
      expect(propsChanged(undefined, undefined)).toBe(false);
    });

    it('should return true when one is undefined', () => {
      expect(propsChanged({ a: 1 }, undefined)).toBe(true);
      expect(propsChanged(undefined, { a: 1 })).toBe(true);
    });

    it('should return false for same reference', () => {
      const props = { a: 1 };
      expect(propsChanged(props, props)).toBe(false);
    });

    it('should return false for empty objects', () => {
      expect(propsChanged({}, {})).toBe(false);
    });

    it('should detect added properties', () => {
      expect(propsChanged({ a: 1 }, { a: 1, b: 2 })).toBe(true);
    });

    it('should detect removed properties', () => {
      expect(propsChanged({ a: 1, b: 2 }, { a: 1 })).toBe(true);
    });
  });
});
