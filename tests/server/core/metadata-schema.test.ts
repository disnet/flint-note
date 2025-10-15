/**
 * Tests for MetadataValidator and MetadataSchemaParser
 */

import { describe, it, expect } from 'vitest';
import {
  MetadataValidator,
  MetadataSchemaParser
} from '../../../src/server/core/metadata-schema.js';
import type { MetadataSchema } from '../../../src/server/core/metadata-schema.js';

describe('MetadataValidator', () => {
  describe('select type validation', () => {
    it('should validate select field with options', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'status',
            type: 'select',
            required: false,
            description: 'Status field',
            constraints: {
              options: ['active', 'inactive', 'archived']
            }
          }
        ]
      };

      // Valid value
      const result1 = MetadataValidator.validate({ status: 'active' }, schema);
      expect(result1.valid).toBe(true);
      expect(result1.errors).toHaveLength(0);

      // Invalid value
      const result2 = MetadataValidator.validate({ status: 'invalid' }, schema);
      expect(result2.valid).toBe(false);
      expect(result2.errors).toHaveLength(1);
      expect(result2.errors[0].message).toContain('must be one of');
    });

    it('should accept any string for select field without options (backward compatibility)', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'meetingType',
            type: 'select',
            required: false,
            description: 'Type of meeting'
          }
        ]
      };

      // For backward compatibility, accept any string value
      const result = MetadataValidator.validate({ meetingType: 'general' }, schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle meeting note type metadata', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'meetingDate',
            type: 'date',
            required: true,
            description: 'Date and time of the meeting'
          },
          {
            name: 'participants',
            type: 'array',
            required: false,
            description: 'List of meeting participants'
          },
          {
            name: 'meetingType',
            type: 'select',
            required: false,
            description: 'Type of meeting',
            default: 'general',
            constraints: {
              options: ['general', 'standup', 'review', 'planning', 'retrospective']
            }
          },
          {
            name: 'status',
            type: 'select',
            required: false,
            description: 'Meeting status',
            default: 'scheduled',
            constraints: {
              options: ['scheduled', 'completed', 'cancelled']
            }
          },
          {
            name: 'duration',
            type: 'number',
            required: false,
            description: 'Meeting duration in minutes'
          },
          {
            name: 'location',
            type: 'string',
            required: false,
            description: 'Meeting location or video call link'
          }
        ]
      };

      const metadata = {
        meetingDate: '2025-10-15',
        participants: ['Bob'],
        meetingType: 'general',
        status: 'completed'
      };

      const result = MetadataValidator.validate(metadata, schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('schema validation', () => {
    it('should error on select fields without options (for new note types)', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'status',
            type: 'select',
            required: false,
            description: 'Status field'
          }
        ]
      };

      const result = MetadataValidator.validateSchema(schema);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('has no options defined');
      expect(result.errors[0]).toContain("Use type 'string' instead");
    });

    it('should not error on select fields with options', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'status',
            type: 'select',
            required: false,
            description: 'Status field',
            constraints: {
              options: ['active', 'inactive']
            }
          }
        ]
      };

      const result = MetadataValidator.validateSchema(schema);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('other field types', () => {
    it('should validate string fields', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'title',
            type: 'string',
            required: true,
            description: 'Title field'
          }
        ]
      };

      const result1 = MetadataValidator.validate({ title: 'Test' }, schema);
      expect(result1.valid).toBe(true);

      const result2 = MetadataValidator.validate({ title: 123 }, schema);
      expect(result2.valid).toBe(false);
    });

    it('should validate number fields', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'count',
            type: 'number',
            required: true,
            description: 'Count field'
          }
        ]
      };

      const result1 = MetadataValidator.validate({ count: 42 }, schema);
      expect(result1.valid).toBe(true);

      const result2 = MetadataValidator.validate({ count: 'not-a-number' }, schema);
      expect(result2.valid).toBe(false);
    });

    it('should validate date fields', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'created',
            type: 'date',
            required: true,
            description: 'Creation date'
          }
        ]
      };

      const result1 = MetadataValidator.validate({ created: '2025-10-15' }, schema);
      expect(result1.valid).toBe(true);

      const result2 = MetadataValidator.validate({ created: 'invalid-date' }, schema);
      expect(result2.valid).toBe(false);
    });

    it('should validate array fields', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'tags',
            type: 'array',
            required: true,
            description: 'Tags'
          }
        ]
      };

      const result1 = MetadataValidator.validate({ tags: ['tag1', 'tag2'] }, schema);
      expect(result1.valid).toBe(true);

      const result2 = MetadataValidator.validate({ tags: 'not-an-array' }, schema);
      expect(result2.valid).toBe(false);
    });
  });
});

describe('MetadataSchemaParser', () => {
  describe('generateSchemaSection', () => {
    it('should include options in generated schema section', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'status',
            type: 'select',
            required: false,
            description: 'Status field',
            constraints: {
              options: ['active', 'inactive', 'archived']
            }
          }
        ]
      };

      const section = MetadataSchemaParser.generateSchemaSection(schema);
      expect(section).toContain('options: ["active", "inactive", "archived"]');
    });

    it('should not include options when not defined', () => {
      const schema: MetadataSchema = {
        fields: [
          {
            name: 'meetingType',
            type: 'select',
            required: false,
            description: 'Type of meeting'
          }
        ]
      };

      const section = MetadataSchemaParser.generateSchemaSection(schema);
      expect(section).not.toContain('options:');
      expect(section).toContain('meetingType');
      expect(section).toContain('select');
    });
  });
});
