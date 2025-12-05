/**
 * Tests for deck YAML parsing and validation utilities.
 * Covers duplicate field detection, new operators (NOT IN, BETWEEN), and serialization.
 */

import { describe, it, expect } from 'vitest';
import {
  parseDeckYaml,
  parseDeckYamlWithWarnings,
  serializeDeckConfig,
  createDeckConfigFromInput,
  getActiveView,
  DeckConfig,
  DeckFilter
} from '../../src/shared/deck-yaml-utils.js';

describe('deck-yaml-utils', () => {
  describe('parseDeckYamlWithWarnings - duplicate field validation', () => {
    it('should return warning for duplicate filters on same field', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: status
        value: active
      - field: status
        value: completed
`;
      const result = parseDeckYamlWithWarnings(yaml);

      expect(result).not.toBeNull();
      expect(result!.warnings.length).toBe(1);
      expect(result!.warnings[0].type).toBe('duplicate_field');
      expect(result!.warnings[0].field).toBe('status');
      expect(result!.warnings[0].message).toContain('Multiple filters for "status"');
    });

    it('should keep only the first filter for duplicate fields', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: status
        value: active
        operator: "="
      - field: status
        value: completed
        operator: "!="
`;
      const result = parseDeckYamlWithWarnings(yaml);

      expect(result).not.toBeNull();
      expect(result!.config.views![0].filters.length).toBe(1);
      expect(result!.config.views![0].filters[0].value).toBe('active');
      expect(result!.config.views![0].filters[0].operator).toBe('=');
    });

    it('should return multiple warnings for multiple duplicate fields', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: status
        value: active
      - field: priority
        value: high
      - field: status
        value: completed
      - field: priority
        value: low
`;
      const result = parseDeckYamlWithWarnings(yaml);

      expect(result).not.toBeNull();
      expect(result!.warnings.length).toBe(2);
      expect(result!.warnings.map((w) => w.field).sort()).toEqual(['priority', 'status']);
    });

    it('should not warn when fields are unique', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: status
        value: active
      - field: priority
        value: high
      - field: type
        value: project
`;
      const result = parseDeckYamlWithWarnings(yaml);

      expect(result).not.toBeNull();
      expect(result!.warnings.length).toBe(0);
      expect(result!.config.views![0].filters.length).toBe(3);
    });

    it('should handle duplicate fields in legacy format', () => {
      const yaml = `
filters:
  - field: status
    value: active
  - field: status
    value: completed
`;
      const result = parseDeckYamlWithWarnings(yaml);

      expect(result).not.toBeNull();
      expect(result!.warnings.length).toBe(1);
      expect(result!.warnings[0].field).toBe('status');
      // Legacy format is converted to views
      expect(result!.config.views![0].filters.length).toBe(1);
    });

    it('should handle duplicate fields across multiple views', () => {
      const yaml = `
views:
  - name: View 1
    filters:
      - field: status
        value: active
      - field: status
        value: pending
  - name: View 2
    filters:
      - field: priority
        value: high
      - field: priority
        value: low
`;
      const result = parseDeckYamlWithWarnings(yaml);

      expect(result).not.toBeNull();
      expect(result!.warnings.length).toBe(2);
      // Each view should have 1 filter (first one kept)
      expect(result!.config.views![0].filters.length).toBe(1);
      expect(result!.config.views![1].filters.length).toBe(1);
    });
  });

  describe('parseDeckYaml - new operators', () => {
    it('should parse NOT IN operator', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: status
        operator: NOT IN
        value:
          - completed
          - archived
`;
      const result = parseDeckYaml(yaml);

      expect(result).not.toBeNull();
      expect(result!.views![0].filters[0].operator).toBe('NOT IN');
      expect(result!.views![0].filters[0].value).toEqual(['completed', 'archived']);
    });

    it('should parse BETWEEN operator', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: priority
        operator: BETWEEN
        value:
          - 1
          - 5
`;
      const result = parseDeckYaml(yaml);

      expect(result).not.toBeNull();
      expect(result!.views![0].filters[0].operator).toBe('BETWEEN');
      expect(result!.views![0].filters[0].value).toEqual(['1', '5']);
    });

    it('should parse BETWEEN with date values (quoted)', () => {
      // Note: Unquoted dates in YAML are parsed as Date objects by js-yaml
      // For consistent string handling, dates should be quoted in YAML
      const yaml = `
views:
  - name: Test
    filters:
      - field: created
        operator: BETWEEN
        value:
          - "2024-01-01"
          - "2024-12-31"
`;
      const result = parseDeckYaml(yaml);

      expect(result).not.toBeNull();
      expect(result!.views![0].filters[0].operator).toBe('BETWEEN');
      expect(result!.views![0].filters[0].value).toEqual(['2024-01-01', '2024-12-31']);
    });

    it('should parse IN operator with array values', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: tags
        operator: IN
        value:
          - urgent
          - important
          - review
`;
      const result = parseDeckYaml(yaml);

      expect(result).not.toBeNull();
      expect(result!.views![0].filters[0].operator).toBe('IN');
      expect(result!.views![0].filters[0].value).toEqual([
        'urgent',
        'important',
        'review'
      ]);
    });

    it('should reject invalid operators', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: status
        operator: INVALID_OP
        value: test
`;
      const result = parseDeckYaml(yaml);

      // The filter should be skipped due to invalid operator
      expect(result).not.toBeNull();
      expect(result!.views![0].filters.length).toBe(0);
    });

    it('should accept all valid operators', () => {
      const operators = [
        '=',
        '!=',
        '>',
        '<',
        '>=',
        '<=',
        'LIKE',
        'IN',
        'NOT IN',
        'BETWEEN'
      ];

      for (const op of operators) {
        const yaml = `
views:
  - name: Test
    filters:
      - field: test
        operator: "${op}"
        value: ${op === 'IN' || op === 'NOT IN' || op === 'BETWEEN' ? '["a", "b"]' : '"test"'}
`;
        const result = parseDeckYaml(yaml);
        expect(result).not.toBeNull();
        expect(result!.views![0].filters[0].operator).toBe(op);
      }
    });
  });

  describe('serializeDeckConfig - array values', () => {
    it('should serialize NOT IN filter with array value', () => {
      const config: DeckConfig = {
        views: [
          {
            name: 'Test',
            filters: [
              {
                field: 'status',
                operator: 'NOT IN',
                value: ['completed', 'archived']
              }
            ]
          }
        ],
        activeView: 0
      };

      const yaml = serializeDeckConfig(config);

      expect(yaml).toContain('operator: NOT IN');
      expect(yaml).toContain('completed');
      expect(yaml).toContain('archived');
    });

    it('should serialize BETWEEN filter with array value', () => {
      const config: DeckConfig = {
        views: [
          {
            name: 'Test',
            filters: [
              {
                field: 'priority',
                operator: 'BETWEEN',
                value: ['1', '10']
              }
            ]
          }
        ],
        activeView: 0
      };

      const yaml = serializeDeckConfig(config);

      expect(yaml).toContain('operator: BETWEEN');
      // Parse back to verify round-trip
      const parsed = parseDeckYaml(yaml);
      expect(parsed!.views![0].filters[0].value).toEqual(['1', '10']);
    });

    it('should round-trip NOT IN filter correctly', () => {
      const config: DeckConfig = {
        views: [
          {
            name: 'Test View',
            filters: [
              {
                field: 'status',
                operator: 'NOT IN',
                value: ['draft', 'review', 'rejected']
              }
            ]
          }
        ],
        activeView: 0,
        limit: 50
      };

      const yaml = serializeDeckConfig(config);
      const parsed = parseDeckYaml(yaml);

      expect(parsed).not.toBeNull();
      expect(parsed!.views![0].filters[0].field).toBe('status');
      expect(parsed!.views![0].filters[0].operator).toBe('NOT IN');
      expect(parsed!.views![0].filters[0].value).toEqual(['draft', 'review', 'rejected']);
    });

    it('should round-trip BETWEEN filter correctly', () => {
      const config: DeckConfig = {
        views: [
          {
            name: 'Test View',
            filters: [
              {
                field: 'score',
                operator: 'BETWEEN',
                value: ['50', '100']
              }
            ]
          }
        ],
        activeView: 0,
        limit: 50
      };

      const yaml = serializeDeckConfig(config);
      const parsed = parseDeckYaml(yaml);

      expect(parsed).not.toBeNull();
      expect(parsed!.views![0].filters[0].field).toBe('score');
      expect(parsed!.views![0].filters[0].operator).toBe('BETWEEN');
      expect(parsed!.views![0].filters[0].value).toEqual(['50', '100']);
    });
  });

  describe('createDeckConfigFromInput - new operators', () => {
    it('should create config with NOT IN filter', () => {
      const input = {
        views: [
          {
            name: 'Filtered',
            filters: [
              {
                field: 'status',
                operator: 'NOT IN' as const,
                value: ['completed', 'cancelled']
              }
            ]
          }
        ]
      };

      const config = createDeckConfigFromInput(input);

      expect(config.views![0].filters[0].operator).toBe('NOT IN');
      expect(config.views![0].filters[0].value).toEqual(['completed', 'cancelled']);
    });

    it('should create config with BETWEEN filter', () => {
      const input = {
        views: [
          {
            name: 'Range',
            filters: [
              {
                field: 'date',
                operator: 'BETWEEN' as const,
                value: ['2024-01-01', '2024-06-30']
              }
            ]
          }
        ]
      };

      const config = createDeckConfigFromInput(input);

      expect(config.views![0].filters[0].operator).toBe('BETWEEN');
      expect(config.views![0].filters[0].value).toEqual(['2024-01-01', '2024-06-30']);
    });
  });

  describe('getActiveView', () => {
    it('should return active view from config', () => {
      const config: DeckConfig = {
        views: [
          { name: 'View 1', filters: [{ field: 'a', value: '1' }] },
          { name: 'View 2', filters: [{ field: 'b', value: '2' }] }
        ],
        activeView: 1
      };

      const view = getActiveView(config);

      expect(view.name).toBe('View 2');
      expect(view.filters[0].field).toBe('b');
    });

    it('should default to first view when activeView not set', () => {
      const config: DeckConfig = {
        views: [
          { name: 'View 1', filters: [{ field: 'a', value: '1' }] },
          { name: 'View 2', filters: [{ field: 'b', value: '2' }] }
        ]
      };

      const view = getActiveView(config);

      expect(view.name).toBe('View 1');
    });
  });

  describe('parseDeckYaml - edge cases', () => {
    it('should handle empty filters array', () => {
      const yaml = `
views:
  - name: Empty
    filters: []
`;
      const result = parseDeckYaml(yaml);

      expect(result).not.toBeNull();
      expect(result!.views![0].filters).toEqual([]);
    });

    it('should skip filters with missing required fields', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: status
        value: active
      - value: missing-field
      - field: missing-value
`;
      const result = parseDeckYaml(yaml);

      expect(result).not.toBeNull();
      expect(result!.views![0].filters.length).toBe(1);
      expect(result!.views![0].filters[0].field).toBe('status');
    });

    it('should handle numeric values correctly', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: count
        value: 42
`;
      const result = parseDeckYaml(yaml);

      expect(result).not.toBeNull();
      expect(result!.views![0].filters[0].value).toBe('42');
    });

    it('should handle boolean values correctly', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: active
        value: true
`;
      const result = parseDeckYaml(yaml);

      expect(result).not.toBeNull();
      expect(result!.views![0].filters[0].value).toBe('true');
    });

    it('should handle NOT IN with single value', () => {
      const yaml = `
views:
  - name: Test
    filters:
      - field: status
        operator: NOT IN
        value:
          - excluded
`;
      const result = parseDeckYaml(yaml);

      expect(result).not.toBeNull();
      expect(result!.views![0].filters[0].operator).toBe('NOT IN');
      expect(result!.views![0].filters[0].value).toEqual(['excluded']);
    });
  });

  describe('serializeDeckConfig - filter completeness', () => {
    it('should skip filters with empty field', () => {
      const config: DeckConfig = {
        views: [
          {
            name: 'Test',
            filters: [
              { field: '', value: 'test' } as DeckFilter,
              { field: 'valid', value: 'test' }
            ]
          }
        ]
      };

      const yaml = serializeDeckConfig(config);
      const parsed = parseDeckYaml(yaml);

      expect(parsed!.views![0].filters.length).toBe(1);
      expect(parsed!.views![0].filters[0].field).toBe('valid');
    });

    it('should skip filters with empty value', () => {
      const config: DeckConfig = {
        views: [
          {
            name: 'Test',
            filters: [
              { field: 'empty', value: '' } as DeckFilter,
              { field: 'valid', value: 'test' }
            ]
          }
        ]
      };

      const yaml = serializeDeckConfig(config);
      const parsed = parseDeckYaml(yaml);

      expect(parsed!.views![0].filters.length).toBe(1);
      expect(parsed!.views![0].filters[0].field).toBe('valid');
    });

    it('should skip filters with empty array value', () => {
      const config: DeckConfig = {
        views: [
          {
            name: 'Test',
            filters: [
              { field: 'empty', operator: 'IN', value: [] } as DeckFilter,
              { field: 'valid', value: 'test' }
            ]
          }
        ]
      };

      const yaml = serializeDeckConfig(config);
      const parsed = parseDeckYaml(yaml);

      expect(parsed!.views![0].filters.length).toBe(1);
      expect(parsed!.views![0].filters[0].field).toBe('valid');
    });
  });
});
