/**
 * Field Filtering Tests
 *
 * Tests for the field filtering functionality in note retrieval and search operations.
 */

import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import {
  filterFields,
  filterNoteFields,
  filterSearchResults,
  validateFieldSpecs,
  COMMON_FIELD_PATTERNS
} from '../../src/utils/field-filter.js';

describe('Field Filtering Utility', () => {
  describe('filterFields', () => {
    const testObject = {
      id: 'test-id',
      title: 'Test Note',
      content: 'This is test content',
      type: 'general',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-02T00:00:00Z',
      metadata: {
        tags: ['test', 'example'],
        status: 'active',
        priority: 5,
        nested: {
          deep: 'value'
        }
      },
      size: 1024
    };

    it('should return original object when no fields specified', () => {
      const result = filterFields(testObject, []);
      assert.deepEqual(result, testObject);
    });

    it('should filter simple fields', () => {
      const result = filterFields(testObject, ['id', 'title']);
      assert.deepEqual(result, {
        id: 'test-id',
        title: 'Test Note'
      });
    });

    it('should filter nested fields using dot notation', () => {
      const result = filterFields(testObject, ['id', 'metadata.tags', 'metadata.status']);
      assert.deepEqual(result, {
        id: 'test-id',
        metadata: {
          tags: ['test', 'example'],
          status: 'active'
        }
      });
    });

    it('should handle wildcard for nested objects', () => {
      const result = filterFields(testObject, ['id', 'metadata.*']);
      assert.deepEqual(result, {
        id: 'test-id',
        metadata: {
          tags: ['test', 'example'],
          status: 'active',
          priority: 5,
          nested: {
            deep: 'value'
          }
        }
      });
    });

    it('should handle deep nested fields', () => {
      const result = filterFields(testObject, ['id', 'metadata.nested.deep']);
      assert.deepEqual(result, {
        id: 'test-id',
        metadata: {
          nested: {
            deep: 'value'
          }
        }
      });
    });

    it('should silently ignore non-existent fields', () => {
      const result = filterFields(testObject, ['id', 'nonexistent', 'metadata.missing']);
      assert.deepEqual(result, {
        id: 'test-id'
      });
    });

    it('should handle empty field specifications', () => {
      const result = filterFields(testObject, ['id', '', '  ', 'title']);
      assert.deepEqual(result, {
        id: 'test-id',
        title: 'Test Note'
      });
    });

    it('should handle root level wildcard', () => {
      const result = filterFields(testObject, ['*']);
      assert.deepEqual(result, testObject);
    });

    it('should handle null/undefined values', () => {
      const objWithNulls = {
        id: 'test',
        nullField: null,
        undefinedField: undefined,
        metadata: {
          tags: null,
          status: 'active'
        }
      };

      const result = filterFields(objWithNulls, [
        'id',
        'nullField',
        'metadata.tags',
        'metadata.status'
      ]);
      assert.deepEqual(result, {
        id: 'test',
        nullField: null,
        metadata: {
          tags: null,
          status: 'active'
        }
      });
    });

    it('should handle arrays in nested objects', () => {
      const result = filterFields(testObject, ['metadata.tags']);
      assert.deepEqual(result, {
        metadata: {
          tags: ['test', 'example']
        }
      });
    });

    it('should handle invalid input gracefully', () => {
      assert.deepEqual(filterFields(null as any, ['id']), null);
      assert.deepEqual(filterFields(undefined as any, ['id']), undefined);
      assert.deepEqual(filterFields('string' as any, ['id']), 'string');
    });
  });

  describe('filterNoteFields', () => {
    const testNote = {
      id: 'general/test-note.md',
      type: 'general',
      title: 'Test Note',
      content: 'This is test content',
      content_hash: 'sha256:abc123',
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-02T00:00:00Z',
      metadata: {
        tags: ['test'],
        status: 'active'
      },
      size: 1024
    };

    it('should return original note when no fields specified', () => {
      const result = filterNoteFields(testNote);
      assert.deepEqual(result, testNote);
    });

    it('should filter note fields correctly', () => {
      const result = filterNoteFields(testNote, ['id', 'title', 'content_hash']);
      assert.deepEqual(result, {
        id: 'general/test-note.md',
        title: 'Test Note',
        content_hash: 'sha256:abc123'
      });
    });

    it('should handle metadata filtering', () => {
      const result = filterNoteFields(testNote, ['id', 'metadata.tags']);
      assert.deepEqual(result, {
        id: 'general/test-note.md',
        metadata: {
          tags: ['test']
        }
      });
    });
  });

  describe('filterSearchResults', () => {
    const testSearchResults = {
      results: [
        {
          id: 'note1',
          title: 'Note 1',
          type: 'general',
          tags: ['tag1'],
          score: 0.95,
          snippet: 'Content snippet',
          filename: 'note1.md',
          path: '/path/to/note1.md',
          created: '2024-01-01T00:00:00Z',
          modified: '2024-01-02T00:00:00Z',
          size: 1024,
          metadata: {
            status: 'active',
            priority: 5
          }
        },
        {
          id: 'note2',
          title: 'Note 2',
          type: 'project',
          tags: ['tag2'],
          score: 0.85,
          snippet: 'Another snippet',
          filename: 'note2.md',
          path: '/path/to/note2.md',
          created: '2024-01-01T00:00:00Z',
          modified: '2024-01-02T00:00:00Z',
          size: 2048,
          metadata: {
            status: 'draft'
          }
        }
      ],
      total: 2,
      has_more: false
    };

    it('should return original results when no fields specified', () => {
      const result = filterSearchResults(testSearchResults);
      assert.deepEqual(result, testSearchResults);
    });

    it('should filter search results while preserving search-specific fields', () => {
      const result = filterSearchResults(testSearchResults, ['id', 'title']);

      // Search-specific fields should always be included
      assert.equal(result.results.length, 2);
      assert.equal(result.results[0].id, 'note1');
      assert.equal(result.results[0].title, 'Note 1');
      assert.equal(result.results[0].score, 0.95);
      assert.equal(result.results[0].snippet, 'Content snippet');
      assert.equal(result.results[0].filename, 'note1.md');
      assert.equal(result.results[0].path, '/path/to/note1.md');

      // Non-search fields should be filtered
      assert.equal(result.results[0].type, undefined);
      assert.equal(result.results[0].metadata, undefined);
    });

    it('should preserve top-level properties', () => {
      const result = filterSearchResults(testSearchResults, ['id']);
      assert.equal(result.total, 2);
      assert.equal(result.has_more, false);
    });

    it('should handle metadata filtering in search results', () => {
      const result = filterSearchResults(testSearchResults, ['id', 'metadata.status']);

      assert.equal(result.results[0].metadata?.status, 'active');
      assert.equal(result.results[0].metadata?.priority, undefined);
      assert.equal(result.results[1].metadata?.status, 'draft');
    });
  });

  describe('validateFieldSpecs', () => {
    it('should return empty array for valid field specs', () => {
      const errors = validateFieldSpecs(['id', 'title', 'metadata.tags', 'metadata.*']);
      assert.deepEqual(errors, []);
    });

    it('should detect invalid field types', () => {
      const errors = validateFieldSpecs([null as any, 123 as any, 'valid']);
      assert.equal(errors.length, 2);
      assert.match(errors[0], /Invalid field type/);
      assert.match(errors[1], /Invalid field type/);
    });

    it('should detect empty field specifications', () => {
      const errors = validateFieldSpecs(['', '  ', 'valid']);
      assert.equal(errors.length, 2);
      assert.match(errors[0], /Empty field specification/);
      assert.match(errors[1], /Empty field specification/);
    });

    it('should detect invalid dot notation', () => {
      const errors = validateFieldSpecs(['.invalid', 'invalid.', 'valid.field']);
      assert.equal(errors.length, 2);
      assert.match(errors[0], /Invalid dot notation/);
      assert.match(errors[1], /Invalid dot notation/);
    });

    it('should detect consecutive dots', () => {
      const errors = validateFieldSpecs(['invalid..field', 'valid.field']);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /Invalid consecutive dots/);
    });

    it('should detect invalid wildcard usage', () => {
      const errors = validateFieldSpecs(['*invalid', 'in*valid', 'valid.*', 'valid*']);
      assert.equal(errors.length, 2);
      assert.match(errors[0], /Invalid wildcard usage/);
      assert.match(errors[1], /Invalid wildcard usage/);
    });
  });

  describe('COMMON_FIELD_PATTERNS', () => {
    it('should have all expected patterns', () => {
      assert.ok(COMMON_FIELD_PATTERNS.LISTING);
      assert.ok(COMMON_FIELD_PATTERNS.LINK_CHECK);
      assert.ok(COMMON_FIELD_PATTERNS.METADATA_ONLY);
      assert.ok(COMMON_FIELD_PATTERNS.CONTENT_UPDATE);
      assert.ok(COMMON_FIELD_PATTERNS.VALIDATION);
      assert.ok(COMMON_FIELD_PATTERNS.NO_CONTENT);
      assert.ok(COMMON_FIELD_PATTERNS.CORE);
      assert.ok(COMMON_FIELD_PATTERNS.MINIMAL);
    });

    it('should have valid field specifications', () => {
      for (const [patternName, fields] of Object.entries(COMMON_FIELD_PATTERNS)) {
        const errors = validateFieldSpecs([...fields]);
        assert.deepEqual(
          errors,
          [],
          `Pattern ${patternName} has invalid field specs: ${errors.join(', ')}`
        );
      }
    });

    it('should work with actual filtering', () => {
      const testNote = {
        id: 'test-id',
        type: 'general',
        title: 'Test Note',
        content: 'Test content',
        content_hash: 'sha256:abc123',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-02T00:00:00Z',
        metadata: {
          tags: ['test'],
          status: 'active'
        }
      };

      // Test LISTING pattern
      const listingResult = filterNoteFields(testNote, [
        ...COMMON_FIELD_PATTERNS.LISTING
      ]);
      assert.ok(listingResult.id);
      assert.ok(listingResult.title);
      assert.ok(listingResult.type);
      assert.equal(listingResult.content, undefined);

      // Test VALIDATION pattern
      const validationResult = filterNoteFields(testNote, [
        ...COMMON_FIELD_PATTERNS.VALIDATION
      ]);
      assert.ok(validationResult.id);
      assert.ok(validationResult.content_hash);
      assert.equal(validationResult.content, undefined);
      assert.equal(validationResult.metadata, undefined);

      // Test MINIMAL pattern
      const minimalResult = filterNoteFields(testNote, [
        ...COMMON_FIELD_PATTERNS.MINIMAL
      ]);
      assert.ok(minimalResult.id);
      assert.equal(Object.keys(minimalResult).length, 1);
    });
  });

  describe('Error Handling', () => {
    it('should handle strict mode', () => {
      const testObj = { id: 'test', title: 'Test' };

      // Non-strict mode (default) - should not throw
      const result1 = filterFields(testObj, [null as any, 'id'], { strict: false });
      assert.deepEqual(result1, { id: 'test' });

      // Strict mode - should throw on invalid field spec
      assert.throws(() => {
        filterFields(testObj, [null as any, 'id'], { strict: true });
      });
    });

    it('should handle preserveEmptyObjects option', () => {
      const testObj = {
        id: 'test',
        metadata: {
          tags: ['test'],
          status: 'active'
        }
      };

      // Default behavior - remove empty objects
      const result1 = filterFields(testObj, ['id', 'metadata.nonexistent']);
      assert.equal(result1.metadata, undefined);

      // Preserve empty objects
      const result2 = filterFields(testObj, ['id', 'metadata.nonexistent'], {
        preserveEmptyObjects: true
      });
      assert.ok(result2.metadata);
      assert.deepEqual(result2.metadata, {});
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large objects efficiently', () => {
      const largeObj = {
        id: 'test',
        title: 'Test',
        content: 'x'.repeat(10000), // Large content
        metadata: {} as Record<string, any>
      };

      // Add many metadata fields
      for (let i = 0; i < 100; i++) {
        largeObj.metadata[`field${i}`] = `value${i}`;
      }

      const start = Date.now();
      const result = filterFields(largeObj, [
        'id',
        'title',
        'metadata.field1',
        'metadata.field50'
      ]);
      const end = Date.now();

      // Should complete quickly (less than 100ms for this size)
      assert.ok(end - start < 100);
      assert.equal(result.id, 'test');
      assert.equal(result.title, 'Test');
      assert.equal(result.content, undefined);
      assert.equal((result.metadata as any)?.field1, 'value1');
      assert.equal((result.metadata as any)?.field50, 'value50');
      assert.equal((result.metadata as any)?.field99, undefined);
    });
  });
});
