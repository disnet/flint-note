/**
 * Wikilink format validation rule
 * Ensures wikilinks use ID-based format for AI agents
 */

import type { LintContext, LintIssue, LintRule, LintRuleConfig } from '../lint-rule.js';
import { getLineNumber, getColumnNumber } from '../markdown-linter.js';

/**
 * Regular expression for matching wikilinks
 * Matches [[target]] or [[target|display]]
 */
const WIKILINK_REGEX = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;

/**
 * Regular expression for note ID format (n-xxxxxxxx)
 */
const NOTE_ID_REGEX = /^n-[a-f0-9]{8}$/;

/**
 * Validates that wikilinks use the correct format:
 * - Agents MUST use ID-based format (e.g., [[n-12345678|Display Text]])
 * - Users can use any format (validation disabled for user edits)
 *
 * Why ID-based links for agents:
 * - Note titles can change, but IDs are immutable
 * - Links never break when notes are renamed
 * - Simpler implementation (no need to update links across all notes)
 */
export class WikilinkFormatRule implements LintRule {
  readonly id = 'wikilink-format';
  readonly description =
    'AI agents must use ID-based wikilinks (e.g., [[n-12345678|Title]])';
  readonly defaultConfig: LintRuleConfig = {
    agentSeverity: 'error',
    userSeverity: 'off', // Users can use whatever format they want
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

    // Find all wikilinks in content
    const matches = content.matchAll(WIKILINK_REGEX);

    for (const match of matches) {
      const fullMatch = match[0]; // [[...]]
      const target = match[1].trim(); // The part before |
      const offset = match.index!;

      // Check if this is an ID-based link (which is what we want for agents)
      if (NOTE_ID_REGEX.test(target)) {
        // This is correct format for agents - no issue
        continue;
      }

      // If we reach here, the link is NOT ID-based, which is an error for agents
      issues.push({
        ruleId: this.id,
        severity,
        message:
          'AI agents must use ID-based wikilinks (format: [[n-xxxxxxxx|Display Text]])',
        line: getLineNumber(content, offset),
        column: getColumnNumber(content, offset),
        found: fullMatch,
        expected: 'ID-based wikilink (e.g., [[n-12345678|Display Text]])',
        suggestion:
          'Use the note.id field when creating wikilinks. The display text (after |) should be human-readable.'
      });
    }

    return issues;
  }
}
