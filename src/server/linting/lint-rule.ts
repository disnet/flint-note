/**
 * Markdown linting framework types and interfaces
 */

/**
 * Context in which linting is being performed
 */
export interface LintContext {
  /** Source of the content being linted */
  source: 'agent' | 'user';
  /** Type of the note being linted (if known) */
  noteType?: string;
  /** Path to the note being linted (if known) */
  notePath?: string;
}

/**
 * A single linting issue found in content
 */
export interface LintIssue {
  /** Unique identifier for the rule that generated this issue */
  ruleId: string;
  /** Severity of the issue */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable message describing the issue */
  message: string;
  /** Line number where the issue was found (1-indexed) */
  line: number;
  /** Column number where the issue starts (0-indexed) */
  column: number;
  /** The problematic text that was found */
  found: string;
  /** Optional suggestion for how to fix the issue */
  suggestion?: string;
  /** Optional expected format or pattern */
  expected?: string;
}

/**
 * Result of linting content
 */
export interface LintResult {
  /** Whether the content is valid (no errors) */
  valid: boolean;
  /** List of errors found */
  errors: LintIssue[];
  /** List of warnings found */
  warnings: LintIssue[];
  /** List of informational messages */
  info: LintIssue[];
}

/**
 * Configuration for a lint rule
 */
export interface LintRuleConfig {
  /** Severity level for agent-generated content */
  agentSeverity: 'error' | 'warning' | 'info' | 'off';
  /** Severity level for user-generated content */
  userSeverity: 'error' | 'warning' | 'info' | 'off';
  /** Additional rule-specific options */
  options?: Record<string, unknown>;
}

/**
 * Base interface for all lint rules
 */
export interface LintRule {
  /** Unique identifier for this rule */
  readonly id: string;
  /** Human-readable description of what this rule checks */
  readonly description: string;
  /** Default configuration for this rule */
  readonly defaultConfig: LintRuleConfig;

  /**
   * Validate content and return any issues found
   * @param content The markdown content to validate
   * @param context Context about where the content came from
   * @param config Configuration for this rule
   * @returns Array of issues found (empty if no issues)
   */
  validate(content: string, context: LintContext, config: LintRuleConfig): LintIssue[];
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: LintIssue[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
