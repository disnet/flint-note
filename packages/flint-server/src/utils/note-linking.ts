/**
 * Note Linking Utilities
 *
 * Enhanced utilities for note linking that integrate wikilink parsing with note discovery,
 * validation, and automatic link management.
 */

import { WikilinkParser } from '../core/wikilink-parser.js';
import type {
  WikiLink,
  NoteLookupResult,
  LinkSuggestion,
  NoteLink
} from '../types/index.js';

export interface NoteLinkingManager {
  searchNotes(query: string, type?: string, limit?: number): Promise<NoteLookupResult[]>;
  getNote(identifier: string): Promise<{
    id: string;
    title: string;
    type: string;
    filename: string;
    content: string;
    exists: boolean;
  } | null>;
}

export interface LinkValidationResult {
  valid: boolean;
  broken: WikiLink[];
  suggestions: Map<string, LinkSuggestion[]>;
}

export interface AutoLinkResult {
  originalContent: string;
  updatedContent: string;
  addedLinks: WikiLink[];
  changesCount: number;
}

export class NoteLinkingUtils {
  private manager: NoteLinkingManager;

  constructor(manager: NoteLinkingManager) {
    this.manager = manager;
  }

  /**
   * Validate all wikilinks in content
   */
  async validateWikilinks(
    content: string,
    contextType?: string
  ): Promise<LinkValidationResult> {
    const parseResult = WikilinkParser.parseWikilinks(content);
    const broken: WikiLink[] = [];
    const suggestions = new Map<string, LinkSuggestion[]>();

    for (const link of parseResult.wikilinks) {
      const exists = await this.validateWikilinkTarget(link.target);

      if (!exists) {
        broken.push(link);

        // Get suggestions for broken links
        const linkSuggestions = await this.getSuggestionsForBrokenLink(
          link.target,
          link.display,
          contextType
        );

        if (linkSuggestions.length > 0) {
          suggestions.set(link.target, linkSuggestions);
        }
      }
    }

    return {
      valid: broken.length === 0,
      broken,
      suggestions
    };
  }

  /**
   * Validate a single wikilink target
   */
  async validateWikilinkTarget(target: string): Promise<boolean> {
    try {
      const note = await this.manager.getNote(target);
      return note !== null && note.exists;
    } catch {
      return false;
    }
  }

  /**
   * Get suggestions for a broken link
   */
  async getSuggestionsForBrokenLink(
    brokenTarget: string,
    displayText: string,
    contextType?: string
  ): Promise<LinkSuggestion[]> {
    // Parse the broken target to understand what they were trying to link to
    const parsed = this.parseWikilinkTarget(brokenTarget);

    // Search using the filename or display text
    const searchQuery = parsed.filename || displayText || brokenTarget;
    const notes = await this.manager.searchNotes(searchQuery, contextType, 5);

    return notes
      .filter(note => note.exists)
      .map(note => ({
        target: `${note.type}/${note.filename}`,
        display: displayText || note.title,
        type: note.type,
        filename: note.filename,
        title: note.title,
        relevance: this.calculateSuggestionRelevance(
          searchQuery,
          note.title,
          note.filename
        )
      }))
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  }

  /**
   * Parse wikilink target to extract components
   */
  private parseWikilinkTarget(target: string): { type?: string; filename: string } {
    const parts = target.split('/');
    if (parts.length === 2) {
      return { type: parts[0], filename: parts[1] };
    }
    return { filename: target };
  }

  /**
   * Calculate relevance for link suggestions
   */
  private calculateSuggestionRelevance(
    query: string,
    title: string,
    filename: string
  ): number {
    const queryLower = query.toLowerCase();
    const titleLower = title.toLowerCase();
    const filenameLower = filename.toLowerCase();

    // Exact matches get highest score
    if (titleLower === queryLower || filenameLower === queryLower) return 1.0;

    // Starts with query gets high score
    if (titleLower.startsWith(queryLower) || filenameLower.startsWith(queryLower))
      return 0.8;

    // Contains query gets medium score
    if (titleLower.includes(queryLower) || filenameLower.includes(queryLower)) return 0.6;

    // Word matches get lower score
    const queryWords = queryLower.split(/\s+/);
    const titleWords = titleLower.split(/\s+/);
    const matchingWords = queryWords.filter(word =>
      titleWords.some(titleWord => titleWord.includes(word))
    );

    return (matchingWords.length / queryWords.length) * 0.4;
  }

  /**
   * Auto-suggest and insert wikilinks in content
   */
  async autoLinkContent(
    content: string,
    contextType?: string,
    aggressiveness: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
  ): Promise<AutoLinkResult> {
    // Get all available notes for linking
    const allNotes = await this.manager.searchNotes('', contextType, 200);

    // Find linkable text opportunities
    const opportunities = WikilinkParser.findLinkableText(content, allNotes);

    let updatedContent = content;
    const addedLinks: WikiLink[] = [];
    let offset = 0;

    // Filter opportunities based on aggressiveness level
    const filteredOpportunities = this.filterLinkOpportunities(
      opportunities,
      aggressiveness
    );

    // Sort by position (descending) to avoid position shifts
    const sortedOpportunities = filteredOpportunities.sort(
      (a, b) => b.position.start - a.position.start
    );

    for (const opportunity of sortedOpportunities) {
      const bestSuggestion = opportunity.suggestions[0];
      if (!bestSuggestion) continue;

      // Create the wikilink
      const wikilink = WikilinkParser.createWikilink(
        bestSuggestion.type,
        bestSuggestion.filename,
        bestSuggestion.display
      );

      // Replace the text with the wikilink
      const adjustedStart = opportunity.position.start + offset;
      const adjustedEnd = opportunity.position.end + offset;

      updatedContent =
        updatedContent.slice(0, adjustedStart) +
        wikilink +
        updatedContent.slice(adjustedEnd);

      // Adjust offset for next replacements
      const lengthDiff = wikilink.length - opportunity.text.length;
      offset += lengthDiff;

      // Track the added link
      addedLinks.push({
        target: bestSuggestion.target,
        display: bestSuggestion.display,
        type: bestSuggestion.type,
        filename: bestSuggestion.filename,
        raw: wikilink,
        position: {
          start: adjustedStart,
          end: adjustedStart + wikilink.length
        }
      });
    }

    return {
      originalContent: content,
      updatedContent,
      addedLinks,
      changesCount: addedLinks.length
    };
  }

  /**
   * Filter link opportunities based on aggressiveness level
   */
  private filterLinkOpportunities(
    opportunities: Array<{
      text: string;
      position: { start: number; end: number };
      suggestions: LinkSuggestion[];
    }>,
    aggressiveness: 'conservative' | 'moderate' | 'aggressive'
  ) {
    const minRelevance = {
      conservative: 0.8,
      moderate: 0.6,
      aggressive: 0.4
    }[aggressiveness];

    return opportunities.filter(opp => {
      const bestSuggestion = opp.suggestions[0];
      return bestSuggestion && (bestSuggestion.relevance || 0) >= minRelevance;
    });
  }

  /**
   * Extract and format outbound links for frontmatter
   */
  async extractOutboundLinks(content: string): Promise<NoteLink[]> {
    const parseResult = WikilinkParser.parseWikilinks(content);
    const outboundLinks: NoteLink[] = [];
    const timestamp = new Date().toISOString();

    for (const wikilink of parseResult.wikilinks) {
      // Validate that the target exists
      const exists = await this.validateWikilinkTarget(wikilink.target);
      if (exists) {
        outboundLinks.push({
          target: wikilink.target,
          relationship: 'references',
          created: timestamp,
          display: wikilink.display,
          type: wikilink.type
        });
      }
    }

    return outboundLinks;
  }

  /**
   * Generate markdown with properly formatted wikilinks
   */
  formatContentWithValidatedLinks(
    content: string,
    validationResult: LinkValidationResult
  ): string {
    let formattedContent = content;

    // Replace broken links with suggestions if available
    const replacements = new Map<string, string>();

    for (const brokenLink of validationResult.broken) {
      const suggestions = validationResult.suggestions.get(brokenLink.target);
      if (suggestions && suggestions.length > 0) {
        const bestSuggestion = suggestions[0];
        const newWikilink = WikilinkParser.createWikilink(
          bestSuggestion.type,
          bestSuggestion.filename,
          brokenLink.display || bestSuggestion.display
        );
        replacements.set(brokenLink.raw, newWikilink);
      }
    }

    if (replacements.size > 0) {
      formattedContent = WikilinkParser.replaceWikilinks(formattedContent, replacements);
    }

    return formattedContent;
  }

  /**
   * Get smart link suggestions based on context
   */
  async getSmartLinkSuggestions(
    partialQuery: string,
    contextType?: string,
    contextContent?: string,
    limit: number = 10
  ): Promise<LinkSuggestion[]> {
    // Get basic suggestions from search
    const notes = await this.manager.searchNotes(partialQuery, contextType, limit * 2);

    let suggestions = notes
      .filter(note => note.exists)
      .map(note => ({
        target: `${note.type}/${note.filename}`,
        display: note.title,
        type: note.type,
        filename: note.filename,
        title: note.title,
        relevance: this.calculateSuggestionRelevance(
          partialQuery,
          note.title,
          note.filename
        )
      }));

    // Boost relevance based on context if available
    if (contextContent) {
      // Ensure all suggestions have defined relevance before boosting
      const suggestionsWithRelevance = suggestions.map(s => ({
        ...s,
        relevance: s.relevance ?? 0
      }));
      suggestions = this.boostRelevanceFromContext(
        suggestionsWithRelevance,
        contextContent
      );
    }

    return suggestions
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, limit);
  }

  /**
   * Boost suggestion relevance based on context content
   */
  private boostRelevanceFromContext(
    suggestions: Array<LinkSuggestion & { relevance: number }>,
    contextContent: string
  ): Array<LinkSuggestion & { relevance: number }> {
    const contextWords = contextContent
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2);

    return suggestions.map(suggestion => {
      const titleWords = suggestion.title.toLowerCase().split(/\W+/);
      const filenameWords = suggestion.filename.toLowerCase().split(/\W+/);

      const contextMatches = [...titleWords, ...filenameWords].filter(word =>
        contextWords.includes(word)
      ).length;

      const contextBoost = Math.min(contextMatches * 0.1, 0.3);

      return {
        ...suggestion,
        relevance: suggestion.relevance + contextBoost
      };
    });
  }

  /**
   * Check if content has potential linking opportunities
   */
  async hasLinkingOpportunities(content: string, contextType?: string): Promise<boolean> {
    const allNotes = await this.manager.searchNotes('', contextType, 50);
    const opportunities = WikilinkParser.findLinkableText(content, allNotes);
    return opportunities.length > 0;
  }

  /**
   * Generate link report for content
   */
  async generateLinkReport(
    content: string,
    contextType?: string
  ): Promise<{
    totalWikilinks: number;
    validLinks: number;
    brokenLinks: number;
    linkingOpportunities: number;
    linkDensity: number;
  }> {
    const parseResult = WikilinkParser.parseWikilinks(content);
    const validationResult = await this.validateWikilinks(content, contextType);
    const allNotes = await this.manager.searchNotes('', contextType, 100);
    const opportunities = WikilinkParser.findLinkableText(content, allNotes);

    const wordCount = content.split(/\s+/).length;
    const linkDensity = parseResult.wikilinks.length / Math.max(wordCount, 1);

    return {
      totalWikilinks: parseResult.wikilinks.length,
      validLinks: parseResult.wikilinks.length - validationResult.broken.length,
      brokenLinks: validationResult.broken.length,
      linkingOpportunities: opportunities.length,
      linkDensity: Math.round(linkDensity * 1000) / 1000 // Round to 3 decimal places
    };
  }
}
