/**
 * Heading format validation rule
 * Ensures headings have proper spacing after hash marks
 */

import type { LintContext, LintIssue, LintRule, LintRuleConfig } from '../lint-rule.js';
import { getLineNumber, getColumnNumber } from '../markdown-linter.js';

/**
 * Regular expression for matching markdown headings
 * Matches headings without space after # (invalid format)
 * The [^# \n] ensures we don't match additional # characters as part of the text
 */
const HEADING_REGEX = /^(#{1,6})([^# \n].*?)$/gm;

/**
 * Validates that markdown headings have proper spacing:
 * - Must have space after # characters (e.g., "# Heading")
 * - Rejects headings without space (e.g., "#Heading")
 */
export class HeadingFormatRule implements LintRule {
  readonly id = 'heading-format';
  readonly description = 'Headings must have a space after # characters';
  readonly defaultConfig: LintRuleConfig = {
    agentSeverity: 'error',
    userSeverity: 'off', // Users can format headings however they want
    options: {}
  };

  validate(content: string, context: LintContext, config: LintRuleConfig): LintIssue[] {
    const issues: LintIssue[] = [];

    // Determine severity for this context
    const severity =
      context.source === 'agent' ? config.agentSeverity : config.userSeverity;

    if (severity === 'off') {
      return issues;
    }

    // Find all headings in content
    const matches = content.matchAll(HEADING_REGEX);

    for (const match of matches) {
      const fullMatch = match[0]; // The entire heading line
      const hashes = match[1]; // The # characters
      const headingText = match[2]; // Text after #
      const offset = match.index!;

      // If we matched this regex, it means there's no space after #
      // (because we're matching [^ \n] which is "not a space or newline")
      const correctedHeading = `${hashes} ${headingText}`;

      issues.push({
        ruleId: this.id,
        severity,
        message: 'Headings must have a space after # characters',
        line: getLineNumber(content, offset),
        column: getColumnNumber(content, offset),
        found: fullMatch,
        expected: correctedHeading,
        suggestion: `Change to: ${correctedHeading}`
      });
    }

    return issues;
  }
}
