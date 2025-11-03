/**
 * Tests for markdown linter engine
 */

import { describe, it, expect } from 'vitest';
import { MarkdownLinter } from '../../../src/server/linting/markdown-linter.js';
import { ValidationError } from '../../../src/server/linting/lint-rule.js';
import { WikilinkFormatRule } from '../../../src/server/linting/rules/wikilink-format.js';
import { HeadingFormatRule } from '../../../src/server/linting/rules/heading-format.js';
import type { LintContext } from '../../../src/server/linting/lint-rule.js';

describe('MarkdownLinter', () => {
  describe('rule registration', () => {
    it('should register a single rule', () => {
      const linter = new MarkdownLinter();
      const rule = new WikilinkFormatRule();

      linter.registerRule(rule);

      expect(linter.getRule('wikilink-format')).toBe(rule);
    });

    it('should register multiple rules at once', () => {
      const linter = new MarkdownLinter();
      const wikilinkRule = new WikilinkFormatRule();
      const headingRule = new HeadingFormatRule();

      linter.registerRules([wikilinkRule, headingRule]);

      expect(linter.getRule('wikilink-format')).toBe(wikilinkRule);
      expect(linter.getRule('heading-format')).toBe(headingRule);
    });

    it('should use default config for registered rules', () => {
      const linter = new MarkdownLinter();
      const rule = new WikilinkFormatRule();

      linter.registerRule(rule);

      const allRules = linter.getAllRules();
      expect(allRules).toHaveLength(1);
      expect(allRules[0]).toBe(rule);
    });
  });

  describe('linting', () => {
    it('should find issues from registered rules', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      const content = 'See [[n-abc123]] for details.';
      const context: LintContext = { source: 'agent' };

      const result = linter.lint(content, context);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].ruleId).toBe('wikilink-format');
    });

    it('should run multiple rules', () => {
      const linter = new MarkdownLinter();
      linter.registerRules([new WikilinkFormatRule(), new HeadingFormatRule()]);

      const content = `#Heading
[[n-abc123]]`;
      const context: LintContext = { source: 'agent' };

      const result = linter.lint(content, context);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      const ruleIds = result.errors.map((e) => e.ruleId);
      expect(ruleIds).toContain('wikilink-format');
      expect(ruleIds).toContain('heading-format');
    });

    it('should categorize issues by severity', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      const content = 'See [[n-abc123]] for details.';
      const context: LintContext = { source: 'agent' };

      const result = linter.lint(content, context);

      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
      expect(result.info).toHaveLength(0);
    });

    it('should return valid result when no issues found', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      const content = 'See [[n-12345678|Meeting Notes]] for details.';
      const context: LintContext = { source: 'agent' };

      const result = linter.lint(content, context);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.info).toHaveLength(0);
    });
  });

  describe('context-aware linting', () => {
    it('should skip rules disabled for user context', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      const content = 'See [[n-abc123]] for details.';
      const userContext: LintContext = { source: 'user' };

      const result = linter.lint(content, userContext);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should enforce rules for agent context', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      const content = 'See [[n-abc123]] for details.';
      const agentContext: LintContext = { source: 'agent' };

      const result = linter.lint(content, agentContext);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('lintStrict', () => {
    it('should throw ValidationError when errors are found', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      const content = 'See [[n-abc123]] for details.';
      const context: LintContext = { source: 'agent' };

      expect(() => {
        linter.lintStrict(content, context);
      }).toThrow(ValidationError);
    });

    it('should include error details in ValidationError', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      const content = 'See [[n-abc123]] for details.';
      const context: LintContext = { source: 'agent' };

      try {
        linter.lintStrict(content, context);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        if (error instanceof ValidationError) {
          expect(error.issues).toHaveLength(1);
          expect(error.message).toContain('Line 1:');
        }
      }
    });

    it('should not throw when content is valid', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      const content = 'See [[n-12345678|Meeting Notes]] for details.';
      const context: LintContext = { source: 'agent' };

      expect(() => {
        linter.lintStrict(content, context);
      }).not.toThrow();
    });

    it('should not throw when only warnings are present', () => {
      const linter = new MarkdownLinter();
      // Configure rule to produce warnings instead of errors
      linter.registerRule(new WikilinkFormatRule());
      linter.configureRule('wikilink-format', {
        agentSeverity: 'warning',
        userSeverity: 'off'
      });

      const content = 'See [[n-abc123]] for details.';
      const context: LintContext = { source: 'agent' };

      expect(() => {
        linter.lintStrict(content, context);
      }).not.toThrow();
    });
  });

  describe('rule configuration', () => {
    it('should allow configuring rule severity', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      // Change to warning
      linter.configureRule('wikilink-format', {
        agentSeverity: 'warning',
        userSeverity: 'off'
      });

      const content = 'See [[n-abc123]] for details.';
      const context: LintContext = { source: 'agent' };

      const result = linter.lint(content, context);

      expect(result.valid).toBe(true); // No errors
      expect(result.warnings).toHaveLength(1); // But has warning
    });

    it('should allow disabling rules', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      // Disable for agent
      linter.configureRule('wikilink-format', {
        agentSeverity: 'off',
        userSeverity: 'off'
      });

      const content = 'See [[n-abc123]] for details.';
      const context: LintContext = { source: 'agent' };

      const result = linter.lint(content, context);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const linter = new MarkdownLinter();
      linter.registerRule(new WikilinkFormatRule());

      const context: LintContext = { source: 'agent' };
      const result = linter.lint('', context);

      expect(result.valid).toBe(true);
    });

    it('should handle linter with no rules', () => {
      const linter = new MarkdownLinter();

      const content = 'Any content';
      const context: LintContext = { source: 'agent' };
      const result = linter.lint(content, context);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
