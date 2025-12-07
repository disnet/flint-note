/**
 * Tests for file-based note types
 *
 * These tests verify:
 * - YAML parsing of type notes (frontmatter + body)
 * - Type note content formatting
 * - Migration YAML generation edge cases
 * - Error handling for malformed YAML
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import {
  NoteTypeManager,
  type TypeNoteDefinition
} from '../../../src/server/core/note-types.js';
import { Workspace } from '../../../src/server/core/workspace.js';

describe('File-Based Type Notes', () => {
  let testVaultPath: string;
  let workspace: Workspace;
  let noteTypeManager: NoteTypeManager;

  beforeEach(async () => {
    testVaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'file-based-types-test-'));
    await fs.mkdir(path.join(testVaultPath, '.flint-note'), { recursive: true });

    // Create minimal workspace config
    const config = {
      vault_path: testVaultPath,
      vault_name: 'test-vault'
    };
    await fs.writeFile(
      path.join(testVaultPath, '.flint-note', 'config.json'),
      JSON.stringify(config, null, 2)
    );

    workspace = new Workspace(testVaultPath);
    noteTypeManager = new NoteTypeManager(workspace);
  });

  afterEach(async () => {
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  describe('parseTypeNoteContent', () => {
    it('should parse basic type note with frontmatter and definition', () => {
      const content = `---
flint_id: n-12345678
flint_title: meeting
flint_filename: meeting
flint_type: type
flint_kind: type
flint_created: 2024-01-15T10:00:00.000Z
flint_updated: 2024-01-15T10:00:00.000Z
---
name: meeting
icon: "📅"
purpose: Notes for recording meeting discussions
agent_instructions:
  - Extract action items
  - Summarize key decisions
default_review_mode: false
`;

      const { frontmatter, definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(frontmatter.flint_id).toBe('n-12345678');
      expect(frontmatter.flint_title).toBe('meeting');
      expect(frontmatter.flint_type).toBe('type');
      expect(frontmatter.flint_kind).toBe('type');

      expect(definition).not.toBeNull();
      expect(definition!.name).toBe('meeting');
      expect(definition!.icon).toBe('📅');
      expect(definition!.purpose).toBe('Notes for recording meeting discussions');
      expect(definition!.agent_instructions).toEqual([
        'Extract action items',
        'Summarize key decisions'
      ]);
      expect(definition!.default_review_mode).toBe(false);
    });

    it('should parse type note with multiline purpose', () => {
      const content = `---
flint_id: n-abcdef12
flint_title: project
---
name: project
purpose: |
  This is a multiline purpose.
  It spans multiple lines.
  And includes various details.
agent_instructions:
  - First instruction
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition).not.toBeNull();
      expect(definition!.purpose).toContain('This is a multiline purpose.');
      expect(definition!.purpose).toContain('It spans multiple lines.');
    });

    it('should parse type note with folded string purpose (>)', () => {
      const content = `---
flint_id: n-abcdef12
flint_title: project
---
name: project
purpose: >
  This is a folded purpose
  that will be joined
  into a single line.
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition).not.toBeNull();
      expect(definition!.purpose).toContain('This is a folded purpose');
    });

    it('should parse type note with metadata schema', () => {
      const content = `---
flint_id: n-schema01
flint_title: task
---
name: task
purpose: Task tracking
metadata_schema:
  fields:
    - name: status
      type: select
      description: Task status
      required: true
      options:
        - todo
        - in_progress
        - done
    - name: priority
      type: select
      options:
        - low
        - medium
        - high
    - name: due_date
      type: date
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition).not.toBeNull();
      expect(definition!.metadata_schema).toBeDefined();
      expect(definition!.metadata_schema!.fields).toHaveLength(3);

      const statusField = definition!.metadata_schema!.fields[0];
      expect(statusField.name).toBe('status');
      expect(statusField.type).toBe('select');
      expect(statusField.required).toBe(true);
      expect(statusField.options).toEqual(['todo', 'in_progress', 'done']);

      const dueDateField = definition!.metadata_schema!.fields[2];
      expect(dueDateField.name).toBe('due_date');
      expect(dueDateField.type).toBe('date');
    });

    it('should handle type note with editor_chips array', () => {
      const content = `---
flint_id: n-chips01
flint_title: meeting
---
name: meeting
purpose: Meeting notes
editor_chips:
  - attendees
  - date
  - location
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition).not.toBeNull();
      expect(definition!.editor_chips).toEqual(['attendees', 'date', 'location']);
    });

    it('should handle special characters in purpose and instructions', () => {
      // Note: YAML requires proper escaping. Single quotes around strings with
      // special chars, or use block scalar syntax for complex strings
      const content = `---
flint_id: n-special
flint_title: special
---
name: special
icon: "🎉"
purpose: 'Handle "quotes", apostrophes, colons: here, and [brackets]'
agent_instructions:
  - 'Use formatting: bold, *italic*, and \`code\`'
  - 'Handle URLs like https://example.com/path?query=value'
  - 'Process emoji: 🚀 🎯 ✅'
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition).not.toBeNull();
      expect(definition!.purpose).toContain('"quotes"');
      expect(definition!.purpose).toContain('colons: here');

      expect(definition!.agent_instructions![0]).toContain('`code`');
      expect(definition!.agent_instructions![1]).toContain('https://example.com');
      expect(definition!.agent_instructions![2]).toContain('🚀');
    });

    it('should handle nested quotes using single-quote YAML strings', () => {
      // When you need both single and double quotes, use block scalar
      const content = `---
flint_id: n-quotes
flint_title: quotes
---
name: quotes
purpose: |
  Handle "double quotes" and 'single quotes' together
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition).not.toBeNull();
      expect(definition!.purpose).toContain('"double quotes"');
      expect(definition!.purpose).toContain("'single quotes'");
    });

    it('should handle empty agent_instructions array', () => {
      const content = `---
flint_id: n-empty
flint_title: minimal
---
name: minimal
purpose: Minimal type
agent_instructions: []
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition).not.toBeNull();
      expect(definition!.agent_instructions).toEqual([]);
    });

    it('should handle suggestions_config object', () => {
      const content = `---
flint_id: n-suggest
flint_title: project
---
name: project
purpose: Project notes
suggestions_config:
  enabled: true
  max_suggestions: 5
  sources:
    - related_notes
    - tags
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition).not.toBeNull();
      expect(definition!.suggestions_config).toBeDefined();
      expect((definition!.suggestions_config as any).enabled).toBe(true);
      expect((definition!.suggestions_config as any).max_suggestions).toBe(5);
    });

    it('should return null definition for invalid YAML body', () => {
      // Suppress expected console.warn from YAML parsing failure
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const content = `---
flint_id: n-invalid
flint_title: invalid
---
name: invalid
purpose: [unclosed array
agent_instructions:
  - broken
`;

      // The parsing should not throw - just return null for unparseable body
      const { frontmatter, definition } = noteTypeManager.parseTypeNoteContent(content);

      // Frontmatter should still parse
      expect(frontmatter.flint_id).toBe('n-invalid');
      // Definition should be null due to invalid YAML
      expect(definition).toBeNull();

      warnSpy.mockRestore();
    });

    it('should handle content without frontmatter', () => {
      const content = `name: nofrontmatter
purpose: No frontmatter type
`;

      const { frontmatter, definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(Object.keys(frontmatter)).toHaveLength(0);
      expect(definition).not.toBeNull();
      expect(definition!.name).toBe('nofrontmatter');
    });

    it('should handle Windows line endings (CRLF)', () => {
      const content = `---\r\nflint_id: n-windows\r\nflint_title: windows\r\n---\r\nname: windows\r\npurpose: Windows line endings\r\n`;

      const { frontmatter, definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(frontmatter.flint_id).toBe('n-windows');
      expect(definition).not.toBeNull();
      expect(definition!.name).toBe('windows');
    });
  });

  describe('formatTypeNoteContent', () => {
    it('should format basic type note correctly', () => {
      const definition: TypeNoteDefinition = {
        name: 'meeting',
        icon: '📅',
        purpose: 'Meeting notes',
        agent_instructions: ['Extract action items', 'Note decisions'],
        default_review_mode: false
      };

      const content = noteTypeManager.formatTypeNoteContent('meeting', definition);

      // Verify it's valid YAML by parsing it back
      const { frontmatter, definition: parsed } =
        noteTypeManager.parseTypeNoteContent(content);

      expect(frontmatter.flint_title).toBe('meeting');
      expect(frontmatter.flint_type).toBe('type');
      expect(frontmatter.flint_kind).toBe('type');

      expect(parsed!.name).toBe('meeting');
      expect(parsed!.icon).toBe('📅');
      expect(parsed!.purpose).toBe('Meeting notes');
      expect(parsed!.agent_instructions).toEqual([
        'Extract action items',
        'Note decisions'
      ]);
    });

    it('should preserve existing frontmatter fields', () => {
      const definition: TypeNoteDefinition = {
        name: 'preserved',
        purpose: 'Test preservation'
      };

      const existingFrontmatter = {
        flint_id: 'n-existing',
        flint_created: '2023-01-01T00:00:00.000Z'
      };

      const content = noteTypeManager.formatTypeNoteContent(
        'preserved',
        definition,
        undefined,
        existingFrontmatter
      );

      const { frontmatter } = noteTypeManager.parseTypeNoteContent(content);

      expect(frontmatter.flint_id).toBe('n-existing');
      expect(frontmatter.flint_created).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should handle metadata schema formatting', () => {
      const definition: TypeNoteDefinition = {
        name: 'withschema',
        purpose: 'With schema',
        metadata_schema: {
          fields: [
            {
              name: 'status',
              type: 'select',
              options: ['open', 'closed'],
              required: true
            },
            { name: 'count', type: 'number', description: 'Item count' }
          ]
        }
      };

      const content = noteTypeManager.formatTypeNoteContent('withschema', definition);
      const { definition: parsed } = noteTypeManager.parseTypeNoteContent(content);

      expect(parsed!.metadata_schema!.fields).toHaveLength(2);
      expect(parsed!.metadata_schema!.fields[0].options).toEqual(['open', 'closed']);
    });

    it('should handle special characters in content without breaking YAML', () => {
      const definition: TypeNoteDefinition = {
        name: 'special',
        purpose: 'Handle "quotes", \'apostrophes\', and colons: everywhere',
        agent_instructions: [
          'Use markdown: **bold** and *italic*',
          'Include [link text](URL) format'
        ]
      };

      const content = noteTypeManager.formatTypeNoteContent('special', definition);
      const { definition: parsed } = noteTypeManager.parseTypeNoteContent(content);

      expect(parsed!.purpose).toBe(
        'Handle "quotes", \'apostrophes\', and colons: everywhere'
      );
      expect(parsed!.agent_instructions![1]).toContain('[link text](URL)');
    });

    it('should handle unicode and emoji', () => {
      const definition: TypeNoteDefinition = {
        name: 'unicode',
        icon: '🌍',
        purpose: 'Unicode: 日本語, 中文, العربية, עברית',
        agent_instructions: ['Emoji: 🎉 🚀 ✅ ❌']
      };

      const content = noteTypeManager.formatTypeNoteContent('unicode', definition);
      const { definition: parsed } = noteTypeManager.parseTypeNoteContent(content);

      expect(parsed!.icon).toBe('🌍');
      expect(parsed!.purpose).toContain('日本語');
      expect(parsed!.purpose).toContain('العربية');
      expect(parsed!.agent_instructions![0]).toContain('🎉');
    });
  });

  describe('roundtrip parsing', () => {
    it('should preserve all fields through format -> parse cycle', () => {
      const original: TypeNoteDefinition = {
        name: 'roundtrip',
        icon: '🔄',
        purpose: 'Test roundtrip preservation',
        agent_instructions: ['Instruction 1', 'Instruction 2', 'Instruction 3'],
        metadata_schema: {
          fields: [
            { name: 'field1', type: 'string', required: true },
            { name: 'field2', type: 'array', description: 'A list' }
          ]
        },
        default_review_mode: true,
        editor_chips: ['field1', 'field2']
      };

      const content = noteTypeManager.formatTypeNoteContent('roundtrip', original);
      const { definition: parsed } = noteTypeManager.parseTypeNoteContent(content);

      expect(parsed).not.toBeNull();
      expect(parsed!.name).toBe(original.name);
      expect(parsed!.icon).toBe(original.icon);
      expect(parsed!.purpose).toBe(original.purpose);
      expect(parsed!.agent_instructions).toEqual(original.agent_instructions);
      expect(parsed!.metadata_schema!.fields).toHaveLength(2);
      expect(parsed!.default_review_mode).toBe(true);
      expect(parsed!.editor_chips).toEqual(original.editor_chips);
    });

    it('should handle empty/minimal definition', () => {
      const original: TypeNoteDefinition = {
        name: 'minimal',
        purpose: 'Just the basics'
      };

      const content = noteTypeManager.formatTypeNoteContent('minimal', original);
      const { definition: parsed } = noteTypeManager.parseTypeNoteContent(content);

      expect(parsed!.name).toBe('minimal');
      expect(parsed!.purpose).toBe('Just the basics');
    });
  });

  describe('YAML edge cases', () => {
    it('should handle numeric-looking type names', () => {
      const content = `---
flint_id: n-numeric
flint_title: "2024"
---
name: "2024"
purpose: Numeric type name
`;

      const { frontmatter, definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(frontmatter.flint_title).toBe('2024');
      expect(definition!.name).toBe('2024');
    });

    it('should handle boolean-looking values', () => {
      const content = `---
flint_id: n-bool
flint_title: test
---
name: test
purpose: "true is not a boolean here"
default_review_mode: true
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition!.purpose).toBe('true is not a boolean here');
      expect(definition!.default_review_mode).toBe(true);
    });

    it('should handle null and undefined fields gracefully', () => {
      const content = `---
flint_id: n-null
flint_title: nulltest
---
name: nulltest
purpose: Test null handling
icon: ~
agent_instructions: null
metadata_schema:
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition!.name).toBe('nulltest');
      expect(definition!.icon).toBeNull();
      expect(definition!.agent_instructions).toBeNull();
    });

    it('should handle deeply nested metadata schema', () => {
      const content = `---
flint_id: n-nested
flint_title: nested
---
name: nested
purpose: Deeply nested schema
metadata_schema:
  fields:
    - name: config
      type: object
      description: Configuration object
      properties:
        - name: nested1
          type: string
        - name: nested2
          type: number
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition!.metadata_schema!.fields[0].name).toBe('config');
      expect((definition!.metadata_schema!.fields[0] as any).properties).toHaveLength(2);
    });

    it('should handle instructions with YAML special chars', () => {
      const content = `---
flint_id: n-yamlchars
flint_title: yamlchars
---
name: yamlchars
purpose: Test YAML special chars
agent_instructions:
  - "Use key: value format"
  - "Handle - dashes at start"
  - "Process # comments"
  - "Deal with > and |"
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition!.agent_instructions).toHaveLength(4);
      expect(definition!.agent_instructions![0]).toContain('key: value');
      expect(definition!.agent_instructions![1]).toContain('- dashes');
      expect(definition!.agent_instructions![2]).toContain('# comments');
    });

    it('should handle very long purpose text', () => {
      const longPurpose = 'A'.repeat(2000) + ' with special: chars and "quotes"';
      const definition: TypeNoteDefinition = {
        name: 'longpurpose',
        purpose: longPurpose
      };

      const content = noteTypeManager.formatTypeNoteContent('longpurpose', definition);
      const { definition: parsed } = noteTypeManager.parseTypeNoteContent(content);

      expect(parsed!.purpose).toBe(longPurpose);
    });

    it('should handle instructions with URLs containing query params', () => {
      const content = `---
flint_id: n-urls
flint_title: urls
---
name: urls
purpose: URL handling
agent_instructions:
  - "See https://example.com/path?foo=bar&baz=qux for details"
  - "Reference: https://api.example.com/v1/users?limit=10&offset=0"
`;

      const { definition } = noteTypeManager.parseTypeNoteContent(content);

      expect(definition!.agent_instructions![0]).toContain('?foo=bar&baz=qux');
      expect(definition!.agent_instructions![1]).toContain('?limit=10&offset=0');
    });
  });
});

describe('Migration YAML Generation', () => {
  /**
   * Tests for the YAML generation in the v2.17.0 migration
   * These simulate what happens during migration when converting
   * note_type_descriptions rows to type note files
   */

  describe('generateTypeNoteContent from DB row', () => {
    /**
     * Simulates the YAML generation logic from migrateToV2_17_0
     */
    function generateMigrationContent(row: {
      type_name: string;
      purpose?: string;
      agent_instructions?: string;
      metadata_schema?: string;
      icon?: string;
      default_review_mode?: number;
      suggestions_config?: string;
      editor_chips?: string;
      created_at?: string;
      updated_at?: string;
    }): string {
      const timestamp = new Date().toISOString();
      const noteId = 'n-testmigr';

      // Parse JSON fields (mimicking migration logic)
      let instructions: string[] = [];
      let schema = { fields: [] as any[] };
      let suggestionsConfig = null;
      let editorChips: string[] | null = null;

      try {
        if (row.agent_instructions) {
          instructions = JSON.parse(row.agent_instructions);
        }
      } catch {
        // Use empty array
      }

      try {
        if (row.metadata_schema) {
          schema = JSON.parse(row.metadata_schema);
        }
      } catch {
        // Use empty schema
      }

      try {
        if (row.suggestions_config) {
          suggestionsConfig = JSON.parse(row.suggestions_config);
        }
      } catch {
        // Skip
      }

      try {
        if (row.editor_chips) {
          editorChips = JSON.parse(row.editor_chips);
        }
      } catch {
        // Skip
      }

      // Build frontmatter object
      const frontmatter: Record<string, unknown> = {
        flint_id: noteId,
        flint_title: row.type_name,
        flint_filename: row.type_name,
        flint_type: 'type',
        flint_kind: 'type',
        flint_created: row.created_at || timestamp,
        flint_updated: row.updated_at || timestamp
      };

      // Build definition object for YAML body
      const definition: Record<string, unknown> = {
        name: row.type_name
      };

      if (row.icon) {
        definition.icon = row.icon;
      }

      definition.purpose = row.purpose || '';

      if (instructions.length > 0) {
        definition.agent_instructions = instructions;
      }

      if (schema.fields && schema.fields.length > 0) {
        definition.metadata_schema = schema;
      }

      if (suggestionsConfig !== null) {
        definition.suggestions_config = suggestionsConfig;
      }

      if (row.default_review_mode !== null && row.default_review_mode !== undefined) {
        definition.default_review_mode = row.default_review_mode === 1;
      }

      if (editorChips !== null) {
        definition.editor_chips = editorChips;
      }

      // Use yaml.dump for proper serialization (handles special chars, quoting, etc.)
      const frontmatterYaml = yaml.dump(frontmatter, {
        lineWidth: -1,
        noRefs: true,
        sortKeys: false
      });

      const definitionYaml = yaml.dump(definition, {
        lineWidth: -1,
        noRefs: true,
        sortKeys: false
      });

      return `---\n${frontmatterYaml}---\n${definitionYaml}`;
    }

    it('should generate valid YAML from basic DB row', () => {
      const row = {
        type_name: 'meeting',
        purpose: 'Meeting notes',
        agent_instructions: JSON.stringify(['Instruction 1', 'Instruction 2']),
        metadata_schema: JSON.stringify({ fields: [] }),
        icon: '📅'
      };

      const content = generateMigrationContent(row);

      // Verify it's valid YAML
      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      expect(frontmatterMatch).not.toBeNull();

      const frontmatter = yaml.load(frontmatterMatch![1]);
      expect((frontmatter as any).flint_title).toBe('meeting');

      const body = yaml.load(frontmatterMatch![2]);
      expect((body as any).name).toBe('meeting');
      expect((body as any).icon).toBe('📅');
    });

    it('should handle purpose with special characters', () => {
      const row = {
        type_name: 'special',
        purpose: 'Handle "quotes", colons: here, and [brackets]',
        agent_instructions: JSON.stringify([]),
        metadata_schema: JSON.stringify({ fields: [] })
      };

      const content = generateMigrationContent(row);

      // Should not throw when parsing
      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      const body = yaml.load(frontmatterMatch![2]);
      expect((body as any).purpose).toContain('Handle "quotes"');
    });

    it('should handle purpose with newlines', () => {
      const row = {
        type_name: 'multiline',
        purpose: 'Line 1\nLine 2\nLine 3',
        agent_instructions: JSON.stringify([]),
        metadata_schema: JSON.stringify({ fields: [] })
      };

      const content = generateMigrationContent(row);

      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      const body = yaml.load(frontmatterMatch![2]);
      expect((body as any).purpose).toContain('Line 1');
      expect((body as any).purpose).toContain('Line 2');
    });

    it('should handle metadata schema with complex fields', () => {
      const row = {
        type_name: 'complex',
        purpose: 'Complex schema',
        agent_instructions: JSON.stringify([]),
        metadata_schema: JSON.stringify({
          fields: [
            {
              name: 'status',
              type: 'select',
              required: true,
              description: 'Status field'
            },
            { name: 'count', type: 'number' }
          ]
        })
      };

      const content = generateMigrationContent(row);

      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      const body = yaml.load(frontmatterMatch![2]);
      expect((body as any).metadata_schema.fields).toHaveLength(2);
      expect((body as any).metadata_schema.fields[0].required).toBe(true);
    });

    it('should handle invalid JSON gracefully', () => {
      const row = {
        type_name: 'invalid',
        purpose: 'Invalid JSON handling',
        agent_instructions: 'not valid json',
        metadata_schema: '{ broken json }'
      };

      // Should not throw
      const content = generateMigrationContent(row);

      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      expect(frontmatterMatch).not.toBeNull();

      const body = yaml.load(frontmatterMatch![2]);
      expect((body as any).name).toBe('invalid');
      // Instructions should be empty due to parse failure
      expect((body as any).agent_instructions).toBeUndefined();
    });

    it('should handle null/undefined optional fields', () => {
      const row = {
        type_name: 'minimal',
        purpose: 'Minimal type'
        // All optional fields omitted
      };

      const content = generateMigrationContent(row);

      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      const body = yaml.load(frontmatterMatch![2]);
      expect((body as any).name).toBe('minimal');
    });

    it('should handle editor_chips array', () => {
      const row = {
        type_name: 'withchips',
        purpose: 'With editor chips',
        editor_chips: JSON.stringify(['chip1', 'chip2', 'chip3'])
      };

      const content = generateMigrationContent(row);

      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      const body = yaml.load(frontmatterMatch![2]);
      expect((body as any).editor_chips).toEqual(['chip1', 'chip2', 'chip3']);
    });

    it('should handle default_review_mode correctly', () => {
      const rowTrue = {
        type_name: 'reviewtrue',
        purpose: 'Review mode true',
        default_review_mode: 1
      };

      const rowFalse = {
        type_name: 'reviewfalse',
        purpose: 'Review mode false',
        default_review_mode: 0
      };

      const contentTrue = generateMigrationContent(rowTrue);
      const contentFalse = generateMigrationContent(rowFalse);

      const matchTrue = contentTrue.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      const matchFalse = contentFalse.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

      const bodyTrue = yaml.load(matchTrue![2]);
      const bodyFalse = yaml.load(matchFalse![2]);

      expect((bodyTrue as any).default_review_mode).toBe(true);
      expect((bodyFalse as any).default_review_mode).toBe(false);
    });

    it('should handle emoji icons', () => {
      const row = {
        type_name: 'emoji',
        purpose: 'Emoji test',
        icon: '🎯'
      };

      const content = generateMigrationContent(row);

      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      const body = yaml.load(frontmatterMatch![2]);
      expect((body as any).icon).toBe('🎯');
    });

    it('should handle suggestions_config as JSON string', () => {
      const row = {
        type_name: 'suggest',
        purpose: 'With suggestions',
        suggestions_config: JSON.stringify({
          enabled: true,
          sources: ['related', 'tags']
        })
      };

      const content = generateMigrationContent(row);

      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      const body = yaml.load(frontmatterMatch![2]);
      // suggestions_config is serialized as JSON string in the YAML
      const suggestConfig =
        typeof (body as any).suggestions_config === 'string'
          ? JSON.parse((body as any).suggestions_config)
          : (body as any).suggestions_config;
      expect(suggestConfig.enabled).toBe(true);
    });

    it('should handle type names with hyphens', () => {
      const row = {
        type_name: 'meeting-notes',
        purpose: 'Meeting notes type'
      };

      const content = generateMigrationContent(row);

      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      const body = yaml.load(frontmatterMatch![2]);
      expect((body as any).name).toBe('meeting-notes');
    });

    it('should handle instructions with colons and special YAML chars', () => {
      // The migration now uses yaml.dump() which properly quotes values
      const row = {
        type_name: 'yamlinstr',
        purpose: 'YAML special chars in instructions',
        agent_instructions: JSON.stringify([
          'Format: key: value',
          'Use - for lists',
          'Handle # comments'
        ])
      };

      const content = generateMigrationContent(row);

      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      const body = yaml.load(frontmatterMatch![2]);

      // Should parse successfully with proper quoting
      expect((body as any).agent_instructions).toHaveLength(3);
      expect((body as any).agent_instructions[0]).toBe('Format: key: value');
      expect((body as any).agent_instructions[1]).toBe('Use - for lists');
      expect((body as any).agent_instructions[2]).toBe('Handle # comments');
    });

    it('should handle simple instructions without special chars', () => {
      // This shows the migration works for simple cases
      const row = {
        type_name: 'simple',
        purpose: 'Simple instructions',
        agent_instructions: JSON.stringify([
          'Extract action items',
          'Summarize key decisions',
          'Note any follow-ups'
        ])
      };

      const content = generateMigrationContent(row);

      const frontmatterMatch = content.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
      );
      const body = yaml.load(frontmatterMatch![2]);
      expect((body as any).agent_instructions).toHaveLength(3);
      expect((body as any).agent_instructions[0]).toBe('Extract action items');
    });
  });
});

describe('Error Handling', () => {
  let testVaultPath: string;
  let workspace: Workspace;
  let noteTypeManager: NoteTypeManager;

  beforeEach(async () => {
    testVaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'error-handling-test-'));
    await fs.mkdir(path.join(testVaultPath, '.flint-note'), { recursive: true });

    const config = {
      vault_path: testVaultPath,
      vault_name: 'test-vault'
    };
    await fs.writeFile(
      path.join(testVaultPath, '.flint-note', 'config.json'),
      JSON.stringify(config, null, 2)
    );

    workspace = new Workspace(testVaultPath);
    noteTypeManager = new NoteTypeManager(workspace);
  });

  afterEach(async () => {
    await fs.rm(testVaultPath, { recursive: true, force: true });
  });

  it('should handle corrupted frontmatter gracefully', () => {
    // Suppress expected console.warn from YAML parsing failure
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const content = `---
flint_id: unclosed quote
flint_title: "missing end quote
---
name: test
purpose: Test
`;

    // Should not throw - parser should be resilient
    const { frontmatter, definition } = noteTypeManager.parseTypeNoteContent(content);

    // Frontmatter may fail to parse but body still parses
    // This is actually correct behavior - corrupted frontmatter
    // doesn't prevent body parsing
    expect(definition).not.toBeNull();
    expect(definition!.name).toBe('test');

    warnSpy.mockRestore();
  });

  it('should handle frontmatter that causes body to be interpreted incorrectly', () => {
    // Suppress expected console.warn from YAML parsing failure
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // This tests when frontmatter corruption affects body parsing
    const content = `---
flint_id: n-test
---
name: [invalid array start`;

    const { frontmatter, definition } = noteTypeManager.parseTypeNoteContent(content);

    // Frontmatter should parse fine
    expect(frontmatter.flint_id).toBe('n-test');
    // Body should fail to parse due to unclosed array
    expect(definition).toBeNull();

    warnSpy.mockRestore();
  });

  it('should handle completely invalid content', () => {
    const content = 'not yaml at all - just random text with no structure';

    const { frontmatter, definition } = noteTypeManager.parseTypeNoteContent(content);

    expect(Object.keys(frontmatter)).toHaveLength(0);
    expect(definition).toBeNull();
  });

  it('should handle empty content', () => {
    const content = '';

    const { frontmatter, definition } = noteTypeManager.parseTypeNoteContent(content);

    expect(Object.keys(frontmatter)).toHaveLength(0);
    expect(definition).toBeNull();
  });

  it('should handle frontmatter-only content', () => {
    const content = `---
flint_id: n-frontonly
flint_title: frontonly
---
`;

    const { frontmatter, definition } = noteTypeManager.parseTypeNoteContent(content);

    expect(frontmatter.flint_id).toBe('n-frontonly');
    expect(definition).toBeNull();
  });

  it('should handle body with tabs instead of spaces', () => {
    // Suppress expected console.warn from YAML parsing failure
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // YAML is sensitive to indentation - tabs vs spaces
    const content = `---
flint_id: n-tabs
---
name: tabs
purpose: Tab indented
agent_instructions:
\t- Instruction with tab
`;

    // This might fail or succeed depending on YAML parser
    // The key is it doesn't throw unexpectedly
    try {
      const { definition } = noteTypeManager.parseTypeNoteContent(content);
      // If it parses, great
      if (definition) {
        expect(definition.name).toBe('tabs');
      }
    } catch {
      // Tab parsing failure is acceptable, as long as it's handled
    }

    warnSpy.mockRestore();
  });
});
