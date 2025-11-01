/**
 * Tests for broken link validation rule
 */

import { describe, it, expect } from 'vitest';
import { BrokenLinkRule } from '../../../src/server/linting/rules/broken-link.js';
import type {
  LintContext,
  LintRuleConfig
} from '../../../src/server/linting/lint-rule.js';

describe('BrokenLinkRule', () => {
  const rule = new BrokenLinkRule();
  const agentConfig: LintRuleConfig = {
    agentSeverity: 'warning',
    userSeverity: 'off'
  };

  // Create a set of existing note identifiers
  const existingNoteIdentifiers = new Set<string>([
    'n-abc123',
    'meeting/standup',
    'project/alpha',
    'daily/2025-01-01',
    'task/implement-feature'
  ]);

  const agentContext: LintContext = {
    source: 'agent',
    existingNoteIdentifiers
  };

  const userContext: LintContext = {
    source: 'user',
    existingNoteIdentifiers
  };

  describe('valid links to existing notes', () => {
    it('should accept type/filename format for existing note', () => {
      const content = 'See [[meeting/standup]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept note ID format for existing note', () => {
      const content = 'See [[n-abc123]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept links with display text', () => {
      const content = 'See [[meeting/standup|Weekly Meeting]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept multiple valid links', () => {
      const content = `
# Meeting Notes

See [[meeting/standup]] and [[project/alpha|Alpha Project]].
Also reference [[daily/2025-01-01]] for context.
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });
  });

  describe('broken links to non-existent notes', () => {
    it('should warn about type/filename that does not exist', () => {
      const content = 'See [[meeting/nonexistent]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe('broken-link');
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].message).toContain('non-existent note');
      expect(issues[0].message).toContain('meeting/nonexistent');
      expect(issues[0].found).toBe('[[meeting/nonexistent]]');
    });

    it('should warn about note ID that does not exist', () => {
      const content = 'See [[n-xyz999]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('n-xyz999');
    });

    it('should warn about link without type prefix that does not exist', () => {
      const content = 'See [[nonexistent]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('nonexistent');
    });

    it('should warn about broken link even with display text', () => {
      const content = 'See [[meeting/nonexistent|Some Meeting]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
    });
  });

  describe('multiple links', () => {
    it('should report all broken links', () => {
      const content = `
# Notes

- [[meeting/standup|Valid Link]]
- [[meeting/nonexistent]]
- [[n-abc123|Valid ID]]
- [[n-xyz999]]
- [[project/missing]]
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(3); // nonexistent, xyz999, missing
    });

    it('should only warn about broken links, not valid ones', () => {
      const content = `
Valid: [[meeting/standup]]
Broken: [[meeting/missing]]
Valid: [[project/alpha]]
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('meeting/missing');
    });
  });

  describe('context sensitivity', () => {
    it('should not validate for user context', () => {
      const content = 'See [[meeting/nonexistent]] for details.';
      const issues = rule.validate(content, userContext, agentConfig);
      expect(issues).toHaveLength(0); // userSeverity is 'off'
    });

    it('should validate for agent context', () => {
      const content = 'See [[meeting/nonexistent]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
    });
  });

  describe('missing identifier set', () => {
    it('should skip validation when existingNoteIdentifiers is not provided', () => {
      const contextWithoutIdentifiers: LintContext = {
        source: 'agent'
        // No existingNoteIdentifiers
      };
      const content = 'See [[meeting/nonexistent]] for details.';
      const issues = rule.validate(content, contextWithoutIdentifiers, agentConfig);
      expect(issues).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const issues = rule.validate('', agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should handle content without wikilinks', () => {
      const content = 'This is plain text without any wikilinks.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should ignore empty link targets', () => {
      const content = 'Empty link: [[]]';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should handle whitespace in link targets', () => {
      const content = '[[  meeting/standup  ]]';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0); // Trimmed to existing note
    });
  });

  describe('line and column tracking', () => {
    it('should report correct line number', () => {
      const content = `Line 1
Line 2
[[meeting/nonexistent]] on line 3
Line 4`;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].line).toBe(3);
    });

    it('should report column number', () => {
      const content = 'Some text [[meeting/nonexistent]] more text';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].column).toBe(10); // Position of [[ in the string
    });
  });

  describe('suggestion field', () => {
    it('should include helpful suggestion for broken links', () => {
      const content = 'See [[meeting/nonexistent]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].suggestion).toBeTruthy();
      expect(issues[0].suggestion).toContain('Create the note');
    });
  });
});
