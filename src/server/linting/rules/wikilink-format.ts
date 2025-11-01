/**
 * Wikilink format validation rule
 * Ensures wikilinks use type/filename format instead of note IDs
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
const NOTE_ID_REGEX = /^n-[a-f0-9]+$/i;

/**
 * Validates that wikilinks use the correct format:
 * - Must use type/filename format (e.g., [[meeting/standup]])
 * - Must NOT use note IDs (e.g., [[n-abc123]])
 * - May optionally include display text (e.g., [[meeting/standup|Weekly Meeting]])
 */
export class WikilinkFormatRule implements LintRule {
  readonly id = 'wikilink-format';
  readonly description = 'Wikilinks must use type/filename format, not note IDs';
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
      const displayText = match[3]; // The part after | (if present)
      const offset = match.index!;

      // Check if this is an ID-based link
      if (NOTE_ID_REGEX.test(target)) {
        issues.push({
          ruleId: this.id,
          severity,
          message: 'Wikilinks should use type/filename format, not note IDs',
          line: getLineNumber(content, offset),
          column: getColumnNumber(content, offset),
          found: fullMatch,
          expected: 'type/filename format (e.g., [[meeting/standup|Title]])',
          suggestion: displayText
            ? 'Use the linkId field from create_note response, which provides the correct type/filename format'
            : 'Replace note ID with type/filename format'
        });
        continue;
      }

      // Check if this is missing type prefix (no slash)
      if (!target.includes('/')) {
        issues.push({
          ruleId: this.id,
          severity,
          message: 'Wikilinks should include type prefix (e.g., meeting/filename)',
          line: getLineNumber(content, offset),
          column: getColumnNumber(content, offset),
          found: fullMatch,
          expected: 'type/filename format with type prefix',
          suggestion:
            'Add the appropriate note type prefix (e.g., meeting/, daily/, project/)'
        });
        continue;
      }

      // Validate type/filename format structure
      const parts = target.split('/');
      if (parts.length > 2) {
        // More than one slash - might be a path with subdirectories
        issues.push({
          ruleId: this.id,
          severity,
          message: 'Wikilink target should have format type/filename (single slash)',
          line: getLineNumber(content, offset),
          column: getColumnNumber(content, offset),
          found: fullMatch,
          expected: 'type/filename with single slash',
          suggestion: 'Use only one slash to separate type and filename'
        });
      }
    }

    return issues;
  }
}
