/**
 * Tests for wikilink format validation rule
 */

import { describe, it, expect } from 'vitest';
import { WikilinkFormatRule } from '../../../src/server/linting/rules/wikilink-format.js';
import type {
  LintContext,
  LintRuleConfig
} from '../../../src/server/linting/lint-rule.js';

describe('WikilinkFormatRule', () => {
  const rule = new WikilinkFormatRule();
  const agentContext: LintContext = { source: 'agent' };
  const userContext: LintContext = { source: 'user' };
  const agentConfig: LintRuleConfig = {
    agentSeverity: 'error',
    userSeverity: 'off'
  };

  describe('valid wikilinks', () => {
    it('should accept type/filename format', () => {
      const content = 'See [[meeting/standup]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept type/filename with display text', () => {
      const content = 'See [[meeting/standup|Weekly Standup]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept multiple valid links', () => {
      const content = `
# Meeting Notes

See [[meeting/standup|Weekly Standup]] and [[project/alpha|Alpha Project]].
Also reference [[daily/2025-01-01]] for context.
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept links with hyphens and numbers', () => {
      const content =
        '[[project/alpha-2-launch]] and [[meeting/q4-2024-planning|Q4 Planning]].';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });
  });

  describe('invalid wikilinks - note IDs', () => {
    it('should reject bare note ID', () => {
      const content = 'See [[n-abc123]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe('wikilink-format');
      expect(issues[0].severity).toBe('error');
      expect(issues[0].message).toContain('note IDs');
      expect(issues[0].found).toBe('[[n-abc123]]');
    });

    it('should reject note ID with display text', () => {
      const content = 'See [[n-abc123|Meeting Notes]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe('wikilink-format');
      expect(issues[0].message).toContain('note IDs');
      expect(issues[0].found).toBe('[[n-abc123|Meeting Notes]]');
    });

    it('should reject uppercase note ID', () => {
      const content = 'See [[N-ABC123]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
    });
  });

  describe('invalid wikilinks - missing type prefix', () => {
    it('should reject link without type prefix', () => {
      const content = 'See [[standup]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe('wikilink-format');
      expect(issues[0].message).toContain('type prefix');
      expect(issues[0].found).toBe('[[standup]]');
    });

    it('should reject link without type prefix but with display text', () => {
      const content = 'See [[standup|Weekly Standup]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('type prefix');
    });
  });

  describe('invalid wikilinks - multiple slashes', () => {
    it('should reject link with multiple slashes', () => {
      const content = 'See [[meeting/2025/standup]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('single slash');
    });
  });

  describe('multiple issues', () => {
    it('should report all issues in content', () => {
      const content = `
# Notes

- [[n-abc123|Note with ID]]
- [[missing-type]]
- [[meeting/standup|Valid Link]]
- [[n-def456]]
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(3); // Two ID-based, one missing type
    });
  });

  describe('context sensitivity', () => {
    it('should not validate for user context', () => {
      const content = 'See [[n-abc123]] and [[missing-type]] for details.';
      const issues = rule.validate(content, userContext, agentConfig);
      expect(issues).toHaveLength(0); // userSeverity is 'off'
    });

    it('should validate for agent context', () => {
      const content = 'See [[n-abc123]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
    });
  });

  describe('line and column tracking', () => {
    it('should report correct line number', () => {
      const content = `Line 1
Line 2
[[n-abc123]] on line 3
Line 4`;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].line).toBe(3);
    });

    it('should report column number', () => {
      const content = 'Some text [[n-abc123]] more text';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].column).toBe(10); // Position of [[ in the string
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

    it('should ignore incomplete wikilinks', () => {
      const content = 'Incomplete [[link or [[another incomplete';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should handle wikilinks with whitespace', () => {
      const content = '[[  meeting/standup  ]]';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0); // Trimmed to valid format
    });
  });
});
