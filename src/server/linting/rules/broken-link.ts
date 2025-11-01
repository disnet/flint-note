/**
 * Broken link validation rule
 * Detects wikilinks that reference non-existent notes
 */

import type { LintContext, LintIssue, LintRule, LintRuleConfig } from '../lint-rule.js';
import { getLineNumber, getColumnNumber } from '../markdown-linter.js';
import { WikilinkParser } from '../../core/wikilink-parser.js';

/**
 * Regular expression for note ID format (n-xxxxxxxx)
 */
const NOTE_ID_REGEX = /^n-[a-f0-9]+$/i;

/**
 * Validates that wikilinks reference existing notes
 * Checks all wikilink formats including:
 * - type/filename format (e.g., [[meeting/standup]])
 * - note ID format (e.g., [[n-abc123]])
 * - malformed links
 */
export class BrokenLinkRule implements LintRule {
  readonly id = 'broken-link';
  readonly description = 'Wikilinks must reference existing notes';
  readonly defaultConfig: LintRuleConfig = {
    agentSeverity: 'warning',
    userSeverity: 'off', // Users can create forward references
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

    // Skip validation if we don't have the note identifiers set
    if (!context.existingNoteIdentifiers) {
      return issues;
    }

    // Parse all wikilinks from content
    const parseResult = WikilinkParser.parseWikilinks(content);

    for (const wikilink of parseResult.wikilinks) {
      const { target, raw, position } = wikilink;
      const trimmedTarget = target.trim();

      // Skip empty targets
      if (!trimmedTarget) {
        continue;
      }

      // Check if this note identifier exists
      // We check both the raw target and normalized versions
      const exists =
        context.existingNoteIdentifiers.has(trimmedTarget) ||
        // For type/filename format, also try with .md extension
        context.existingNoteIdentifiers.has(`${trimmedTarget}.md`) ||
        // For note IDs, check as-is
        (NOTE_ID_REGEX.test(trimmedTarget) &&
          context.existingNoteIdentifiers.has(trimmedTarget));

      if (!exists) {
        issues.push({
          ruleId: this.id,
          severity,
          message: `Wikilink references non-existent note: ${trimmedTarget}`,
          line: getLineNumber(content, position.start),
          column: getColumnNumber(content, position.start),
          found: raw,
          suggestion: 'Create the note first, or check the link target for typos'
        });
      }
    }

    return issues;
  }
}
