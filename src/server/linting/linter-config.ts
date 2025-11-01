/**
 * Default markdown linter configuration
 */

import { MarkdownLinter } from './markdown-linter.js';
import { WikilinkFormatRule } from './rules/wikilink-format.js';
import { HeadingFormatRule } from './rules/heading-format.js';
import { BrokenLinkRule } from './rules/broken-link.js';

/**
 * Create and configure the default markdown linter instance
 */
export function createDefaultLinter(): MarkdownLinter {
  const linter = new MarkdownLinter();

  // Register all lint rules
  linter.registerRules([
    new WikilinkFormatRule(),
    new HeadingFormatRule(),
    new BrokenLinkRule()
  ]);

  return linter;
}

/**
 * Singleton instance of the default linter
 */
let defaultLinterInstance: MarkdownLinter | null = null;

/**
 * Get the default linter instance (creates it if it doesn't exist)
 */
export function getDefaultLinter(): MarkdownLinter {
  if (!defaultLinterInstance) {
    defaultLinterInstance = createDefaultLinter();
  }
  return defaultLinterInstance;
}
