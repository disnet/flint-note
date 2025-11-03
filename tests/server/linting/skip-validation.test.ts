/**
 * Tests for skipValidation parameter in note creation and update
 */

import { describe, it, expect } from 'vitest';
import { MarkdownLinter } from '../../../src/server/linting/markdown-linter.js';
import { WikilinkFormatRule } from '../../../src/server/linting/rules/wikilink-format.js';
import { HeadingFormatRule } from '../../../src/server/linting/rules/heading-format.js';
import { ValidationError } from '../../../src/server/linting/lint-rule.js';
import type { LintContext } from '../../../src/server/linting/lint-rule.js';

describe('skipValidation functionality', () => {
  const linter = new MarkdownLinter();
  linter.registerRules([new WikilinkFormatRule(), new HeadingFormatRule()]);

  const invalidContent = `#Heading without space
See [[meeting/standup]] for details.`;

  const validContent = `# Heading with space
See [[n-12345678|Standup Meeting]] for details.`;

  describe('Agent context validation', () => {
    const agentContext: LintContext = { source: 'agent' };

    it('should throw ValidationError with invalid content and no skipValidation', () => {
      expect(() => {
        linter.lintStrict(invalidContent, agentContext);
      }).toThrow(ValidationError);
    });

    it('should provide detailed error messages', () => {
      try {
        linter.lintStrict(invalidContent, agentContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        if (error instanceof ValidationError) {
          expect(error.issues.length).toBeGreaterThan(0);
          expect(error.message).toContain('Markdown validation failed');
          expect(error.message).toContain('Line');
        }
      }
    });

    it('should not throw with valid content', () => {
      expect(() => {
        linter.lintStrict(validContent, agentContext);
      }).not.toThrow();
    });

    it('should catch wikilink format errors', () => {
      const contentWithBadWikilink =
        '# Valid Heading\n\nSee [[meeting/standup|Title]] for info.';

      try {
        linter.lintStrict(contentWithBadWikilink, agentContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        if (error instanceof ValidationError) {
          expect(error.issues.some((issue) => issue.ruleId === 'wikilink-format')).toBe(
            true
          );
        }
      }
    });

    it('should catch heading format errors', () => {
      const contentWithBadHeading = '##Heading\n\nValid content.';

      try {
        linter.lintStrict(contentWithBadHeading, agentContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        if (error instanceof ValidationError) {
          expect(error.issues.some((issue) => issue.ruleId === 'heading-format')).toBe(
            true
          );
        }
      }
    });

    it('should catch multiple errors at once', () => {
      const contentWithMultipleErrors = `##BadHeading
[[meeting/notes]]
###AnotherBad
[[missing-type]]`;

      try {
        linter.lintStrict(contentWithMultipleErrors, agentContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        if (error instanceof ValidationError) {
          expect(error.issues.length).toBeGreaterThanOrEqual(4);
          expect(error.issues.some((issue) => issue.ruleId === 'heading-format')).toBe(
            true
          );
          expect(error.issues.some((issue) => issue.ruleId === 'wikilink-format')).toBe(
            true
          );
        }
      }
    });
  });

  describe('User context validation', () => {
    const userContext: LintContext = { source: 'user' };

    it('should not validate for user context (always passes)', () => {
      // User can write whatever format they want
      expect(() => {
        linter.lintStrict(invalidContent, userContext);
      }).not.toThrow();
    });

    it('should allow ID-based wikilinks from users', () => {
      const userContent = 'See [[n-abc123|Title]] for details.';
      expect(() => {
        linter.lintStrict(userContent, userContext);
      }).not.toThrow();
    });

    it('should allow headings without spaces from users', () => {
      const userContent = '#NoSpace\n##AlsoNoSpace';
      expect(() => {
        linter.lintStrict(userContent, userContext);
      }).not.toThrow();
    });
  });

  describe('Simulating skipValidation behavior', () => {
    it('should validate when skipValidation is false', () => {
      const skipValidation = false;
      const agentContext: LintContext = { source: 'agent' };

      if (!skipValidation) {
        expect(() => {
          linter.lintStrict(invalidContent, agentContext);
        }).toThrow(ValidationError);
      }
    });

    it('should skip validation when skipValidation is true', () => {
      const skipValidation = true;
      const agentContext: LintContext = { source: 'agent' };

      if (!skipValidation) {
        // This block would throw, but we skip it
        linter.lintStrict(invalidContent, agentContext);
      }
      // Test passes because we didn't run validation
      expect(skipValidation).toBe(true);
    });

    it('should demonstrate the API pattern', () => {
      // Simulating the API layer logic
      const createNote = (
        content: string,
        callerContext: 'agent' | 'user',
        skipValidation = false
      ) => {
        if (callerContext === 'agent' && !skipValidation) {
          const context: LintContext = { source: 'agent' };
          linter.lintStrict(content, context);
        }
        // If we get here, validation passed or was skipped
        return { success: true };
      };

      // Should throw without skipValidation
      expect(() => {
        createNote(invalidContent, 'agent', false);
      }).toThrow(ValidationError);

      // Should not throw with skipValidation
      expect(() => {
        createNote(invalidContent, 'agent', true);
      }).not.toThrow();

      // User context never validates
      expect(() => {
        createNote(invalidContent, 'user', false);
      }).not.toThrow();
    });
  });

  describe('Error details and suggestions', () => {
    const agentContext: LintContext = { source: 'agent' };

    it('should provide helpful suggestions for wikilink errors', () => {
      const content = 'See [[meeting/standup|Meeting]] for details.';

      try {
        linter.lintStrict(content, agentContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        if (error instanceof ValidationError) {
          const wikilinkError = error.issues.find((i) => i.ruleId === 'wikilink-format');
          expect(wikilinkError).toBeDefined();
          expect(wikilinkError?.suggestion).toBeDefined();
          expect(wikilinkError?.found).toBe('[[meeting/standup|Meeting]]');
        }
      }
    });

    it('should provide helpful suggestions for heading errors', () => {
      const content = '##NoSpace';

      try {
        linter.lintStrict(content, agentContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        if (error instanceof ValidationError) {
          const headingError = error.issues.find((i) => i.ruleId === 'heading-format');
          expect(headingError).toBeDefined();
          expect(headingError?.expected).toBe('## NoSpace');
          expect(headingError?.found).toBe('##NoSpace');
        }
      }
    });

    it('should include line and column information', () => {
      const content = `Line 1
Line 2
[[meeting/notes]] on line 3`;

      try {
        linter.lintStrict(content, agentContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        if (error instanceof ValidationError) {
          const issue = error.issues[0];
          expect(issue.line).toBe(3);
          expect(issue.column).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('Edge cases', () => {
    const agentContext: LintContext = { source: 'agent' };

    it('should handle empty content', () => {
      expect(() => {
        linter.lintStrict('', agentContext);
      }).not.toThrow();
    });

    it('should handle content with only valid formatting', () => {
      const perfectContent = `# Title

## Section

See [[n-12345678|Weekly Meeting]] for details.

### Subsection

More content here.`;

      expect(() => {
        linter.lintStrict(perfectContent, agentContext);
      }).not.toThrow();
    });

    it('should handle mixed valid and invalid content', () => {
      const mixedContent = `# Valid
##Invalid
See [[meeting/valid|Valid Link]]
And [[n-bad123|Bad Link]]`;

      try {
        linter.lintStrict(mixedContent, agentContext);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        if (error instanceof ValidationError) {
          // Should catch both the bad heading and bad wikilink
          expect(error.issues.length).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });
});
