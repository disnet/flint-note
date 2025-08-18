/**
 * Wikilink Parser
 *
 * Handles parsing, validation, and management of wikilinks in note content.
 * Supports the format [[type/filename|Display Name]] for stable linking.
 */

import type {
  WikiLink,
  LinkParseResult,
  NoteLookupResult,
  LinkSuggestion
} from '../types/index.js';

export class WikilinkParser {
  // Regex to match wikilinks in format [[type/filename|Display Name]] or [[filename|Display Name]]
  private static readonly WIKILINK_REGEX = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;

  // Regex to extract type/filename format
  private static readonly TYPE_FILENAME_REGEX = /^([^/]+)\/([^/]+)$/;

  /**
   * Parse all wikilinks from content
   */
  static parseWikilinks(content: string): LinkParseResult {
    const wikilinks: WikiLink[] = [];
    let match;

    // Reset regex state
    this.WIKILINK_REGEX.lastIndex = 0;

    while ((match = this.WIKILINK_REGEX.exec(content)) !== null) {
      const [fullMatch, target, , display] = match;
      const position = {
        start: match.index,
        end: match.index + fullMatch.length
      };

      const parsedTarget = this.parseTarget(target);

      wikilinks.push({
        target: target.trim(),
        display: display?.trim() || target.trim(),
        type: parsedTarget.type,
        filename: parsedTarget.filename,
        raw: fullMatch,
        position
      });
    }

    return {
      wikilinks,
      content
    };
  }

  /**
   * Parse target to extract type and filename
   */
  private static parseTarget(target: string): { type?: string; filename: string } {
    const match = target.match(this.TYPE_FILENAME_REGEX);

    if (match) {
      return {
        type: match[1],
        filename: match[2]
      };
    }

    // If no type specified, just return filename
    return {
      filename: target
    };
  }

  /**
   * Validate wikilink format
   */
  static validateWikilinkFormat(wikilink: string): boolean {
    return this.WIKILINK_REGEX.test(wikilink);
  }

  /**
   * Create a properly formatted wikilink
   */
  static createWikilink(type: string, filename: string, display?: string): string {
    const target = `${type}/${filename}`;
    return display ? `[[${target}|${display}]]` : `[[${target}]]`;
  }

  /**
   * Extract unique targets from wikilinks
   */
  static extractTargets(wikilinks: WikiLink[]): string[] {
    const targets = new Set<string>();

    for (const link of wikilinks) {
      targets.add(link.target);
    }

    return Array.from(targets);
  }

  /**
   * Replace wikilinks in content with new format
   */
  static replaceWikilinks(content: string, replacements: Map<string, string>): string {
    let updatedContent = content;

    // Parse existing wikilinks
    const parseResult = this.parseWikilinks(content);

    // Sort by position (descending) to avoid position shifts during replacement
    const sortedLinks = parseResult.wikilinks.sort(
      (a, b) => b.position.start - a.position.start
    );

    for (const link of sortedLinks) {
      const replacement = replacements.get(link.target);
      if (replacement) {
        updatedContent =
          updatedContent.slice(0, link.position.start) +
          replacement +
          updatedContent.slice(link.position.end);
      }
    }

    return updatedContent;
  }

  /**
   * Find potential wikilink insertions in content
   * Looks for note titles or keywords that could be linked
   */
  static findLinkableText(
    content: string,
    availableNotes: NoteLookupResult[]
  ): Array<{
    text: string;
    position: { start: number; end: number };
    suggestions: LinkSuggestion[];
  }> {
    const linkableMatches: Array<{
      text: string;
      position: { start: number; end: number };
      suggestions: LinkSuggestion[];
    }> = [];

    // Create a map of titles to notes for quick lookup
    const titleMap = new Map<string, NoteLookupResult[]>();
    for (const note of availableNotes) {
      const title = note.title.toLowerCase();
      if (!titleMap.has(title)) {
        titleMap.set(title, []);
      }
      titleMap.get(title)!.push(note);
    }

    // Look for exact title matches in content
    for (const [title, notes] of titleMap.entries()) {
      if (title.length < 3) continue; // Skip very short titles

      const regex = new RegExp(`\\b${this.escapeRegex(title)}\\b`, 'gi');
      let match;

      while ((match = regex.exec(content)) !== null) {
        // Check if this text is already inside a wikilink
        if (this.isInsideWikilink(content, match.index, match.index + match[0].length)) {
          continue;
        }

        const suggestions: LinkSuggestion[] = notes.map(note => ({
          target: `${note.type}/${note.filename}`,
          display: note.title,
          type: note.type,
          filename: note.filename,
          title: note.title,
          relevance: 1.0
        }));

        linkableMatches.push({
          text: match[0],
          position: {
            start: match.index,
            end: match.index + match[0].length
          },
          suggestions
        });
      }
    }

    return linkableMatches;
  }

  /**
   * Check if a text position is inside an existing wikilink
   */
  private static isInsideWikilink(content: string, start: number, end: number): boolean {
    const parseResult = this.parseWikilinks(content);

    return parseResult.wikilinks.some(
      link => start >= link.position.start && end <= link.position.end
    );
  }

  /**
   * Escape special regex characters
   */
  private static escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate filename-safe string from title
   */
  static generateFilename(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Normalize wikilink target format
   */
  static normalizeTarget(target: string): string {
    const parsed = this.parseTarget(target);

    if (parsed.type) {
      return `${parsed.type}/${parsed.filename}`;
    }

    return parsed.filename;
  }

  /**
   * Extract all wikilink targets from content for frontmatter
   */
  static extractLinksForFrontmatter(content: string): Array<{
    target: string;
    display: string;
    type?: string;
  }> {
    const parseResult = this.parseWikilinks(content);

    return parseResult.wikilinks.map(link => ({
      target: link.target,
      display: link.display,
      type: link.type
    }));
  }

  /**
   * Check if content contains specific wikilink target
   */
  static containsLinkToTarget(content: string, target: string): boolean {
    const parseResult = this.parseWikilinks(content);
    return parseResult.wikilinks.some(
      link =>
        link.target === target ||
        this.normalizeTarget(link.target) === this.normalizeTarget(target)
    );
  }

  /**
   * Get all unique note types referenced in wikilinks
   */
  static getReferencedTypes(content: string): string[] {
    const parseResult = this.parseWikilinks(content);
    const types = new Set<string>();

    for (const link of parseResult.wikilinks) {
      if (link.type) {
        types.add(link.type);
      }
    }

    return Array.from(types);
  }

  /**
   * Count wikilinks in content
   */
  static countWikilinks(content: string): number {
    const parseResult = this.parseWikilinks(content);
    return parseResult.wikilinks.length;
  }

  /**
   * Remove all wikilinks from content, leaving only display text
   */
  static removeWikilinks(content: string): string {
    return content.replace(this.WIKILINK_REGEX, (match, target, pipe, display) => {
      return display || target;
    });
  }
}
