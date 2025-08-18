/**
 * Metadata Schema Tests
 *
 * Tests for the metadata schema system including parsing, validation,
 * and integration with note types.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  MetadataSchemaParser,
  MetadataValidator,
  type MetadataSchema,
  type MetadataFieldType
} from '../../src/core/metadata-schema.ts';

describe('MetadataSchemaParser', () => {
  describe('parseFromDescription', () => {
    test('should parse basic metadata schema from description', () => {
      const description = `# Book Reviews

## Purpose
Track books I've read.

## Metadata Schema
Expected frontmatter or metadata fields for this note type:
- title: Book title (required, string)
- author: Author name (required, string)
- rating: Personal rating (required, number, min: 1, max: 5)
- genre: Book genre (optional, string)
- isbn: ISBN number (optional, string, pattern: "^[0-9-]{10,17}$")
- tags: Topic tags (optional, array)
`;

      const schema = MetadataSchemaParser.parseFromDescription(description);

      assert.strictEqual(schema.fields.length, 6);

      const titleField = schema.fields.find(f => f.name === 'title');
      assert.ok(titleField);
      assert.strictEqual(titleField.name, 'title');
      assert.strictEqual(titleField.type, 'string');
      assert.strictEqual(titleField.required, true);
      assert.strictEqual(titleField.description, 'Book title');

      const ratingField = schema.fields.find(f => f.name === 'rating');
      assert.ok(ratingField);
      assert.strictEqual(ratingField.name, 'rating');
      assert.strictEqual(ratingField.type, 'number');
      assert.strictEqual(ratingField.required, true);
      assert.strictEqual(ratingField.description, 'Personal rating');
      assert.ok(ratingField.constraints);
      assert.strictEqual(ratingField.constraints.min, 1);
      assert.strictEqual(ratingField.constraints.max, 5);

      const isbnField = schema.fields.find(f => f.name === 'isbn');
      assert.ok(isbnField);
      assert.strictEqual(isbnField.name, 'isbn');
      assert.strictEqual(isbnField.type, 'string');
      assert.strictEqual(isbnField.required, false);
      assert.strictEqual(isbnField.description, 'ISBN number');
      assert.ok(isbnField.constraints);
      assert.strictEqual(isbnField.constraints.pattern, '^[0-9-]{10,17}$');

      const tagsField = schema.fields.find(f => f.name === 'tags');
      assert.ok(tagsField);
      assert.strictEqual(tagsField.name, 'tags');
      assert.strictEqual(tagsField.type, 'array');
      assert.strictEqual(tagsField.required, false);
      assert.strictEqual(tagsField.description, 'Topic tags');
    });

    test('should handle select fields with options', () => {
      const description = `# Meeting Notes

## Metadata Schema
Expected frontmatter or metadata fields for this note type:
- status: Meeting status (required, select, options: ["scheduled", "completed", "cancelled"])
- priority: Priority level (optional, select, options: ["low", "medium", "high"])
`;

      const schema = MetadataSchemaParser.parseFromDescription(description);

      const statusField = schema.fields.find(f => f.name === 'status');
      assert.ok(statusField);
      assert.strictEqual(statusField.name, 'status');
      assert.strictEqual(statusField.type, 'select');
      assert.strictEqual(statusField.required, true);
      assert.ok(statusField.constraints);
      assert.deepStrictEqual(statusField.constraints.options, [
        'scheduled',
        'completed',
        'cancelled'
      ]);

      const priorityField = schema.fields.find(f => f.name === 'priority');
      assert.ok(priorityField);
      assert.strictEqual(priorityField.name, 'priority');
      assert.strictEqual(priorityField.type, 'select');
      assert.strictEqual(priorityField.required, false);
      assert.ok(priorityField.constraints);
      assert.deepStrictEqual(priorityField.constraints.options, [
        'low',
        'medium',
        'high'
      ]);
    });

    test('should return empty schema when no metadata section exists', () => {
      const description = `# Simple Note Type

## Purpose
Just a simple note type.

## Agent Instructions
- Be helpful
`;

      const schema = MetadataSchemaParser.parseFromDescription(description);
      assert.strictEqual(schema.fields.length, 0);
    });
  });

  describe('generateSchemaSection', () => {
    test('should generate metadata section from schema definition', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'title',
            type: 'string' as MetadataFieldType,
            required: true,
            description: 'Book title'
          },
          {
            name: 'rating',
            type: 'number' as MetadataFieldType,
            required: true,
            description: 'Personal rating',
            constraints: { min: 1, max: 5 }
          },
          {
            name: 'tags',
            type: 'array' as MetadataFieldType,
            required: false,
            description: 'Topic tags'
          }
        ]
      };

      const section = MetadataSchemaParser.generateSchemaSection(schema);

      assert.ok(section.includes('## Metadata Schema'));
      assert.ok(section.includes('- title: Book title (required)'));
      assert.ok(
        section.includes('- rating: Personal rating (required, number, min: 1, max: 5)')
      );
      assert.ok(section.includes('- tags: Topic tags (optional, array)'));
    });

    test('should generate default schema when no fields provided', () => {
      const schema: MetadataSchema = { fields: [] };
      const section = MetadataSchemaParser.generateSchemaSection(schema);

      assert.ok(section.includes('## Metadata Schema'));
      assert.ok(section.includes('- type: Note type (auto-set)'));
      assert.ok(section.includes('- created: Creation timestamp (auto-set)'));
      assert.ok(
        section.includes('- tags: Relevant tags for categorization (array, optional)')
      );
    });
  });
});

describe('MetadataValidator', () => {
  describe('validate', () => {
    const schema: MetadataSchema = {
      fields: [
        {
          name: 'title',
          type: 'string' as MetadataFieldType,
          required: true,
          description: 'Title'
        },
        {
          name: 'rating',
          type: 'number' as MetadataFieldType,
          required: true,
          constraints: { min: 1, max: 5 }
        },
        {
          name: 'status',
          type: 'select' as MetadataFieldType,
          required: false,
          constraints: { options: ['draft', 'published', 'archived'] }
        },
        {
          name: 'tags',
          type: 'array' as MetadataFieldType,
          required: false
        },
        {
          name: 'published_date',
          type: 'date' as MetadataFieldType,
          required: false
        }
      ]
    };

    test('should validate correct metadata', () => {
      const metadata = {
        title: 'Test Note',
        rating: 4,
        status: 'published',
        tags: ['test', 'example'],
        published_date: '2024-01-01T00:00:00Z'
      };

      const result = MetadataValidator.validate(metadata, schema);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    test('should detect missing required fields', () => {
      const metadata = {
        rating: 4
        // missing required 'title' field
      };

      const result = MetadataValidator.validate(metadata, schema);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].field, 'title');
      assert.ok(result.errors[0].message.includes("Required field 'title' is missing"));
    });

    test('should validate field types', () => {
      const metadata = {
        title: 'Test Note',
        rating: 'invalid_number', // should be number
        tags: 'not_an_array' // should be array
      };

      const result = MetadataValidator.validate(metadata, schema);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 2);

      const ratingError = result.errors.find(e => e.field === 'rating');
      assert.ok(ratingError);
      assert.ok(ratingError.message.includes('must be a number'));

      const tagsError = result.errors.find(e => e.field === 'tags');
      assert.ok(tagsError);
      assert.ok(tagsError.message.includes('must be an array'));
    });

    test('should validate number constraints', () => {
      const metadata = {
        title: 'Test Note',
        rating: 10 // exceeds max of 5
      };

      const result = MetadataValidator.validate(metadata, schema);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].field, 'rating');
      assert.ok(result.errors[0].message.includes('must be at most 5'));
    });

    test('should validate select field options', () => {
      const metadata = {
        title: 'Test Note',
        rating: 4,
        status: 'invalid_status' // not in allowed options
      };

      const result = MetadataValidator.validate(metadata, schema);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(
        result.errors[0].message.includes('must be one of: draft, published, archived')
      );
    });

    test('should validate date fields', () => {
      const metadata = {
        title: 'Test Note',
        rating: 4,
        published_date: 'not-a-date'
      };

      const result = MetadataValidator.validate(metadata, schema);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].message.includes('must be a valid date string'));
    });

    test('should warn about unknown fields', () => {
      const metadata = {
        title: 'Test Note',
        rating: 4,
        unknown_field: 'some value'
      };

      const result = MetadataValidator.validate(metadata, schema);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.warnings.length, 1);
      assert.strictEqual(result.warnings[0].field, 'unknown_field');
      assert.ok(
        result.warnings[0].message.includes(
          "Unknown field 'unknown_field' not defined in schema"
        )
      );
    });

    test('should validate string patterns', () => {
      const patternSchema: MetadataSchema = {
        fields: [
          {
            name: 'isbn',
            type: 'string' as MetadataFieldType,
            required: false,
            constraints: { pattern: '^[0-9-]{10,17}$' }
          }
        ]
      };

      const metadata = { isbn: 'invalid-isbn-format' };
      const result = MetadataValidator.validate(metadata, patternSchema);

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors[0].message.includes('does not match required pattern'));
    });
  });

  describe('getDefaults', () => {
    test('should provide default values for required fields', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'title',
            type: 'string' as MetadataFieldType,
            required: true
          },
          {
            name: 'rating',
            type: 'number' as MetadataFieldType,
            required: true,
            constraints: { min: 1, max: 5 }
          },
          {
            name: 'published',
            type: 'boolean' as MetadataFieldType,
            required: true
          },
          {
            name: 'tags',
            type: 'array' as MetadataFieldType,
            required: true
          },
          {
            name: 'created',
            type: 'date' as MetadataFieldType,
            required: false
          },
          {
            name: 'status',
            type: 'select' as MetadataFieldType,
            required: true,
            constraints: { options: ['draft', 'published'] }
          }
        ]
      };

      const defaults = MetadataValidator.getDefaults(schema);

      assert.strictEqual(defaults.title, '');
      assert.strictEqual(defaults.rating, 1); // min value
      assert.strictEqual(defaults.published, false);
      assert.deepStrictEqual(defaults.tags, []);
      assert.strictEqual(defaults.status, 'draft'); // first option
      assert.ok(!Object.prototype.hasOwnProperty.call(defaults, 'created'));
    });

    test('should use explicit default values when provided', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'priority',
            type: 'select' as MetadataFieldType,
            required: false,
            default: 'medium',
            constraints: { options: ['low', 'medium', 'high'] }
          },
          {
            name: 'score',
            type: 'number' as MetadataFieldType,
            required: false,
            default: 3
          }
        ]
      };

      const defaults = MetadataValidator.getDefaults(schema);

      assert.strictEqual(defaults.priority, 'medium');
      assert.strictEqual(defaults.score, 3);
    });
  });
});
