/**
 * Core markdown linting engine
 */

import type {
  LintContext,
  LintIssue,
  LintResult,
  LintRule,
  LintRuleConfig
} from './lint-rule.js';
import { ValidationError } from './lint-rule.js';

/**
 * Configuration for the markdown linter
 */
export interface MarkdownLinterConfig {
  /** Map of rule IDs to their configurations */
  rules: Map<string, LintRuleConfig>;
}

/**
 * Main markdown linting engine
 */
export class MarkdownLinter {
  private rules: Map<string, LintRule> = new Map();
  private config: MarkdownLinterConfig;

  constructor(config?: Partial<MarkdownLinterConfig>) {
    this.config = {
      rules: config?.rules ?? new Map()
    };
  }

  /**
   * Register a lint rule with the linter
   */
  registerRule(rule: LintRule): void {
    this.rules.set(rule.id, rule);

    // Use default config if not explicitly configured
    if (!this.config.rules.has(rule.id)) {
      this.config.rules.set(rule.id, rule.defaultConfig);
    }
  }

  /**
   * Register multiple rules at once
   */
  registerRules(rules: LintRule[]): void {
    for (const rule of rules) {
      this.registerRule(rule);
    }
  }

  /**
   * Lint markdown content and return all issues found
   */
  lint(content: string, context: LintContext): LintResult {
    const allIssues: LintIssue[] = [];

    // Run each registered rule
    for (const [ruleId, rule] of this.rules) {
      const config = this.config.rules.get(ruleId);
      if (!config) {
        continue;
      }

      // Check if rule is enabled for this context
      const severity =
        context.source === 'agent' ? config.agentSeverity : config.userSeverity;

      if (severity === 'off') {
        continue;
      }

      // Run the rule
      const issues = rule.validate(content, context, config);
      allIssues.push(...issues);
    }

    // Categorize issues by severity
    const errors = allIssues.filter((issue) => issue.severity === 'error');
    const warnings = allIssues.filter((issue) => issue.severity === 'warning');
    const info = allIssues.filter((issue) => issue.severity === 'info');

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info
    };
  }

  /**
   * Lint content and throw ValidationError if any errors are found
   * Useful for API endpoints that need to reject invalid content
   */
  lintStrict(content: string, context: LintContext): void {
    const result = this.lint(content, context);

    if (!result.valid) {
      const errorMessages = result.errors
        .map((e) => `Line ${e.line}: ${e.message}`)
        .join('\n');

      throw new ValidationError(
        `Markdown validation failed:\n${errorMessages}`,
        result.errors
      );
    }
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): LintRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all registered rules
   */
  getAllRules(): LintRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Update configuration for a specific rule
   */
  configureRule(ruleId: string, config: LintRuleConfig): void {
    this.config.rules.set(ruleId, config);
  }
}

/**
 * Helper function to get line number from string offset
 */
export function getLineNumber(content: string, offset: number): number {
  const upToOffset = content.substring(0, offset);
  return upToOffset.split('\n').length;
}

/**
 * Helper function to get column number from string offset
 */
export function getColumnNumber(content: string, offset: number): number {
  const upToOffset = content.substring(0, offset);
  const lastNewline = upToOffset.lastIndexOf('\n');
  return lastNewline === -1 ? offset : offset - lastNewline - 1;
}

/**
 * Format lint issues for display with optional limits
 * @param issues Array of lint issues to format
 * @param limit Maximum number of issues to show (default: 10)
 * @returns Array of formatted warning messages
 */
export function formatLintIssues(issues: LintIssue[], limit: number = 10): string[] {
  const messages: string[] = [];

  if (issues.length === 0) {
    return messages;
  }

  // Take only the first 'limit' issues
  const displayedIssues = issues.slice(0, limit);

  for (const issue of displayedIssues) {
    messages.push(`Line ${issue.line}: ${issue.message}`);
  }

  // Add summary if there are more issues than the limit
  if (issues.length > limit) {
    messages.push(
      `... and ${issues.length - limit} more issue(s) (showing ${limit} out of ${issues.length})`
    );
  }

  return messages;
}
