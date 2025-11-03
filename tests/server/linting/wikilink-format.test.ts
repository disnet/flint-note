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

  describe('valid wikilinks for agents (ID-based)', () => {
    it('should accept ID-based wikilink without display text', () => {
      const content = 'See [[n-12345678]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept ID-based wikilink with display text', () => {
      const content = 'See [[n-12345678|My Note Title]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept multiple ID-based wikilinks', () => {
      const content = `
# Meeting Notes

See [[n-12345678|Weekly Standup]] and [[n-abcdef00|Alpha Project]].
Also reference [[n-11111111|Daily Note]] for context.
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept ID-based links with special characters in display', () => {
      const content = '[[n-12345678|Note: Meeting (2024-01-01)]]';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept all lowercase hex IDs', () => {
      const content = '[[n-abcdef12]] and [[n-deadbeef|Another]] and [[n-00112233]]';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });
  });

  describe('invalid wikilinks for agents (non-ID-based)', () => {
    it('should reject bare title without ID', () => {
      const content = 'See [[My Note]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe('wikilink-format');
      expect(issues[0].severity).toBe('error');
      expect(issues[0].message).toContain('ID-based wikilinks');
      expect(issues[0].found).toBe('[[My Note]]');
    });

    it('should reject type/filename format', () => {
      const content = 'See [[meeting/standup]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe('wikilink-format');
      expect(issues[0].message).toContain('ID-based wikilinks');
      expect(issues[0].found).toBe('[[meeting/standup]]');
    });

    it('should reject type/filename with display text', () => {
      const content = 'See [[meeting/standup|Weekly Standup]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain('ID-based wikilinks');
    });

    it('should reject invalid ID formats', () => {
      const content = `
- [[n-123]] (too short)
- [[n-12345678901]] (too long)
- [[n-ABCDEF12]] (uppercase)
- [[n-1234567g]] (invalid hex)
- [[note-12345678]] (wrong prefix)
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues.length).toBeGreaterThan(0);
      // All of these should be rejected
      expect(issues.length).toBe(5);
    });
  });

  describe('multiple issues', () => {
    it('should report all non-ID-based links', () => {
      const content = `
# Notes

- [[My Note]] (bare title)
- [[meeting/standup|Valid Link]] (type/filename)
- [[n-12345678|Correct]] (ID-based - valid)
- [[Another Note]] (bare title)
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(3); // Three non-ID-based links
    });
  });

  describe('context sensitivity', () => {
    it('should not validate for user context', () => {
      const content = 'See [[My Note]] and [[meeting/standup]] for details.';
      const issues = rule.validate(content, userContext, agentConfig);
      expect(issues).toHaveLength(0); // userSeverity is 'off'
    });

    it('should validate for agent context', () => {
      const content = 'See [[My Note]] for details.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
    });

    it('should allow users to use ID-based links too', () => {
      const content = 'See [[n-12345678|My Note]] for details.';
      const issues = rule.validate(content, userContext, agentConfig);
      expect(issues).toHaveLength(0);
    });
  });

  describe('line and column tracking', () => {
    it('should report correct line number', () => {
      const content = `Line 1
Line 2
[[My Note]] on line 3
Line 4`;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].line).toBe(3);
    });

    it('should report column number', () => {
      const content = 'Some text [[My Note]] more text';
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
      const content = '[[  n-12345678  ]]';
      const issues = rule.validate(content, agentContext, agentConfig);
      // Should be valid after trimming
      expect(issues).toHaveLength(0);
    });

    it('should handle wikilinks with whitespace in non-ID format', () => {
      const content = '[[  My Note  ]]';
      const issues = rule.validate(content, agentContext, agentConfig);
      // Should be invalid (not ID-based)
      expect(issues).toHaveLength(1);
    });
  });
});
