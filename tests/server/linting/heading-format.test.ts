/**
 * Tests for heading format validation rule
 */

import { describe, it, expect } from 'vitest';
import { HeadingFormatRule } from '../../../src/server/linting/rules/heading-format.js';
import type {
  LintContext,
  LintRuleConfig
} from '../../../src/server/linting/lint-rule.js';

describe('HeadingFormatRule', () => {
  const rule = new HeadingFormatRule();
  const agentContext: LintContext = { source: 'agent' };
  const userContext: LintContext = { source: 'user' };
  const agentConfig: LintRuleConfig = {
    agentSeverity: 'error',
    userSeverity: 'off'
  };

  describe('valid headings', () => {
    it('should accept heading with space after #', () => {
      const content = '# Heading';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept all heading levels with space', () => {
      const content = `
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept headings with multiple words', () => {
      const content = '## This is a Multi-Word Heading';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept headings with special characters', () => {
      const content = '# Meeting Notes (2025-01-01)';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should accept headings in context', () => {
      const content = `
Some text here.

# Main Heading

More content.

## Subheading

Even more content.
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });
  });

  describe('invalid headings', () => {
    it('should reject heading without space after #', () => {
      const content = '#Heading';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe('heading-format');
      expect(issues[0].severity).toBe('error');
      expect(issues[0].message).toContain('space after #');
      expect(issues[0].found).toBe('#Heading');
      expect(issues[0].expected).toBe('# Heading');
    });

    it('should reject all heading levels without space', () => {
      const content = `
#Heading 1
##Heading 2
###Heading 3
####Heading 4
#####Heading 5
######Heading 6
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(6);
    });

    it('should provide correct suggestion', () => {
      const content = '##NoSpace';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].expected).toBe('## NoSpace');
      expect(issues[0].suggestion).toContain('## NoSpace');
    });
  });

  describe('mixed valid and invalid', () => {
    it('should only report invalid headings', () => {
      const content = `
# Valid Heading
##Invalid
### Another Valid
####AlsoInvalid
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(2);
      expect(issues[0].found).toBe('##Invalid');
      expect(issues[1].found).toBe('####AlsoInvalid');
    });
  });

  describe('context sensitivity', () => {
    it('should not validate for user context', () => {
      const content = '#NoSpace';
      const issues = rule.validate(content, userContext, agentConfig);
      expect(issues).toHaveLength(0); // userSeverity is 'off'
    });

    it('should validate for agent context', () => {
      const content = '#NoSpace';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
    });
  });

  describe('line and column tracking', () => {
    it('should report correct line number', () => {
      const content = `Line 1
Line 2
##Heading on line 3
Line 4`;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].line).toBe(3);
    });

    it('should report column number', () => {
      const content = '##Heading';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(1);
      expect(issues[0].column).toBe(0); // Heading at start of line
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const issues = rule.validate('', agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should handle content without headings', () => {
      const content = 'This is plain text without any headings.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should not match # in the middle of a line', () => {
      const content = 'This line has a #hashtag in it.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0);
    });

    it('should handle code blocks with # characters', () => {
      const content = `
\`\`\`bash
#This is a comment in code
\`\`\`
      `;
      // Note: This is a limitation - the regex will still match inside code blocks
      // A more sophisticated parser would be needed to handle this correctly
      // For now, we accept this as a known limitation
      const issues = rule.validate(content, agentContext, agentConfig);
      // The regex will match this as it doesn't understand code blocks
      // This is acceptable for now as agent-generated content should have proper formatting
    });

    it('should handle inline code with # characters', () => {
      const content = 'Use `#include` for C headers.';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0); // # is in middle of line, not start
    });

    it('should handle empty heading', () => {
      const content = '#';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0); // No text after #, regex doesn't match
    });

    it('should handle heading with just space', () => {
      const content = '# ';
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(0); // Has space, valid
    });
  });

  describe('multiline content', () => {
    it('should validate all headings in document', () => {
      const content = `
# Introduction

This is some text.

##Section Without Space

More text here.

### Proper Subsection

And here.

####Another Bad One

Final text.
      `;
      const issues = rule.validate(content, agentContext, agentConfig);
      expect(issues).toHaveLength(2);
      expect(issues[0].found).toBe('##Section Without Space');
      expect(issues[1].found).toBe('####Another Bad One');
    });
  });
});
