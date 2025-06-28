/**
 * Link Manager
 *
 * Handles creation and management of links between notes, including
 * bidirectional linking, relationship types, link validation, and wikilink integration.
 */

import path from 'path';
import { Workspace } from './workspace.js';
import { NoteManager } from './notes.js';
import { WikilinkParser } from './wikilink-parser.js';
import { NoteLinkingUtils } from '../utils/note-linking.js';
import type {
  NoteLink,
  LinkRelationship,
  LinkResult,
  NoteLookupResult,
  LinkSuggestion
} from '../types/index.js';
import type { NoteLinkingManager } from '../utils/note-linking.js';

interface LinkNotesArgs {
  source: string;
  target: string;
  relationship?: LinkRelationship;
  bidirectional?: boolean;
  context?: string;
}

export class LinkManager implements NoteLinkingManager {
  #_workspace: Workspace;
  #noteManager: NoteManager;
  #linkingUtils: NoteLinkingUtils;

  constructor(workspace: Workspace, noteManager: NoteManager) {
    this.#_workspace = workspace;
    this.#noteManager = noteManager;
    this.#linkingUtils = new NoteLinkingUtils(this);
  }

  /**
   * Get the workspace instance
   */
  get workspace(): Workspace {
    return this.#_workspace;
  }

  /**
   * Create a link between two notes
   */
  async linkNotes(args: LinkNotesArgs): Promise<LinkResult> {
    const {
      source,
      target,
      relationship = 'references',
      bidirectional = true,
      context
    } = args;

    // Validate relationship type
    if (!this.isValidRelationship(relationship)) {
      throw new Error(`Invalid relationship type: ${relationship}`);
    }

    // Normalize identifiers and verify both notes exist
    const _sourceNote = await this.#noteManager.getNote(source);
    const _targetNote = await this.#noteManager.getNote(target);

    if (!_sourceNote) {
      throw new Error(`Source note does not exist: ${source}`);
    }

    if (!_targetNote) {
      throw new Error(`Target note does not exist: ${target}`);
    }

    // Check for duplicate links
    if (await this.linkExists(source, target, relationship)) {
      throw new Error(
        `Link already exists from ${source} to ${target} with relationship ${relationship}`
      );
    }

    const timestamp = new Date().toISOString();

    // Create the primary link
    await this.addLinkToNote(source, {
      target: target,
      relationship,
      created: timestamp,
      context
    });

    let reverseLinkCreated = false;

    // Create reverse link if bidirectional
    if (bidirectional) {
      const reverseRelationship = this.getReverseRelationship(relationship);

      // Only create reverse link if it doesn't already exist
      if (!(await this.linkExists(target, source, reverseRelationship))) {
        await this.addLinkToNote(target, {
          target: source,
          relationship: reverseRelationship,
          created: timestamp,
          context: context ? `Reverse of: ${context}` : undefined
        });
        reverseLinkCreated = true;
      }
    }

    // Add inline links to content if appropriate
    await this.addInlineLinks(source, target, relationship);

    return {
      success: true,
      link_created: {
        source: source,
        target: target,
        relationship,
        bidirectional,
        timestamp
      },
      reverse_link_created: reverseLinkCreated
    };
  }

  /**
   * Add a link to a note's frontmatter
   */
  private async addLinkToNote(identifier: string, link: NoteLink): Promise<void> {
    const note = await this.#noteManager.getNote(identifier);
    if (!note) {
      throw new Error(`Note not found: ${identifier}`);
    }

    // Initialize links structure if it doesn't exist
    const links = note.metadata.links || { outbound: [], inbound: [] };
    if (!links.outbound) links.outbound = [];
    if (!links.inbound) links.inbound = [];

    // Add the new link to outbound
    links.outbound.push(link);

    // Update the note metadata and let updateNote handle the content formatting
    const updatedMetadata = { ...note.metadata, links };

    // Pass the plain content - updateNote will handle frontmatter formatting
    await this.#noteManager.updateNoteWithMetadata(
      identifier,
      note.content,
      updatedMetadata,
      note.content_hash
    );
  }

  /**
   * Format note content with updated frontmatter including links
   * @deprecated Use NoteManager.formatUpdatedNoteContent instead
   */
  private formatNoteWithLinks(
    content: string,
    _metadata: Record<string, unknown>
  ): string {
    // This method is deprecated - NoteManager handles frontmatter formatting
    return content;
  }

  /**
   * Add inline wikilinks to note content where appropriate
   */
  private async addInlineLinks(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationship: LinkRelationship
  ): Promise<void> {
    const sourceNote = await this.#noteManager.getNote(sourceIdentifier);
    const targetNote = await this.#noteManager.getNote(targetIdentifier);

    if (!sourceNote) {
      throw new Error(`Source note not found: ${sourceIdentifier}`);
    }
    if (!targetNote) {
      throw new Error(`Target note not found: ${targetIdentifier}`);
    }

    const targetTitle = targetNote.title;
    const targetFilename = path.basename(targetNote.filename, '.md');
    const targetType = targetNote.type;
    const targetWikilink = `${targetType}/${targetFilename}`;

    // Check if content already contains a wikilink to the target
    if (WikilinkParser.containsLinkToTarget(sourceNote.content, targetWikilink)) {
      // Link already exists in content, don't add another
      return;
    }

    // For certain relationships, add context-appropriate inline links
    if (
      relationship === 'references' ||
      relationship === 'mentions' ||
      relationship === 'related-to'
    ) {
      const wikilink = WikilinkParser.createWikilink(
        targetType,
        targetFilename,
        targetTitle
      );

      // Add a simple reference at the end of the content
      const updatedContent = sourceNote.content.trim() + `\n\nSee also: ${wikilink}`;

      // Get the current note again to ensure we have the latest metadata
      const currentNote = await this.#noteManager.getNote(sourceIdentifier);
      if (!currentNote) {
        throw new Error(`Source note not found: ${sourceIdentifier}`);
      }

      // Update just the content, preserving existing metadata
      await this.#noteManager.updateNoteWithMetadata(
        sourceIdentifier,
        updatedContent,
        currentNote.metadata,
        currentNote.content_hash
      );
    }
  }

  /**
   * Check if a link already exists between two notes
   */
  private async linkExists(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationship: LinkRelationship
  ): Promise<boolean> {
    try {
      const currentNote = await this.#noteManager.getNote(sourceIdentifier);
      if (!currentNote) {
        return false;
      }
      const links = currentNote.metadata?.links?.outbound || [];

      return links.some(
        link => link.target === targetIdentifier && link.relationship === relationship
      );
    } catch {
      return false;
    }
  }

  /**
   * Check if relationship type is valid
   */
  private isValidRelationship(relationship: string): relationship is LinkRelationship {
    const validRelationships: LinkRelationship[] = [
      'references',
      'follows-up',
      'contradicts',
      'supports',
      'mentions',
      'depends-on',
      'blocks',
      'related-to'
    ];
    return validRelationships.includes(relationship as LinkRelationship);
  }

  /**
   * Get the reverse relationship for bidirectional linking
   */
  private getReverseRelationship(relationship: LinkRelationship): LinkRelationship {
    const reverseMap: Record<LinkRelationship, LinkRelationship> = {
      references: 'mentions',
      'follows-up': 'mentions',
      contradicts: 'contradicts',
      supports: 'supports',
      mentions: 'mentions',
      'depends-on': 'blocks',
      blocks: 'depends-on',
      'related-to': 'related-to'
    };

    return reverseMap[relationship] || 'related-to';
  }

  /**
   * Get all links for a specific note
   */
  async getLinksForNote(
    identifier: string
  ): Promise<{ outbound: NoteLink[]; inbound: NoteLink[] }> {
    const note = await this.#noteManager.getNote(identifier);
    if (!note) {
      return { outbound: [], inbound: [] };
    }

    const links = note.metadata.links || { outbound: [], inbound: [] };
    return {
      outbound: links.outbound || [],
      inbound: links.inbound || []
    };
  }

  /**
   * Remove a specific link between two notes
   */
  async removeLink(
    source: string,
    target: string,
    relationship: LinkRelationship
  ): Promise<boolean> {
    const note = await this.#noteManager.getNote(source);
    if (!note) {
      return false;
    }

    const links = note.metadata.links || { outbound: [], inbound: [] };
    const outboundLinks = links.outbound || [];

    const linkIndex = outboundLinks.findIndex(
      link => link.target === target && link.relationship === relationship
    );

    if (linkIndex === -1) {
      return false;
    }

    // Remove the link
    outboundLinks.splice(linkIndex, 1);

    // Update the note with new metadata
    const updatedMetadata = {
      ...note.metadata,
      links: { ...links, outbound: outboundLinks }
    };
    await this.#noteManager.updateNoteWithMetadata(
      source,
      note.content,
      updatedMetadata,
      note.content_hash
    );

    return true;
  }

  /**
   * Parse and update frontmatter links from wikilinks in content
   */
  async updateLinksFromContent(identifier: string): Promise<void> {
    const note = await this.#noteManager.getNote(identifier);
    if (!note) {
      throw new Error(`Note not found: ${identifier}`);
    }

    // Parse wikilinks from content
    const contentLinks = WikilinkParser.extractLinksForFrontmatter(note.content);

    // Convert to NoteLink format
    const outboundLinks: NoteLink[] = [];
    const timestamp = new Date().toISOString();

    for (const link of contentLinks) {
      // Validate that target note exists
      const targetNote = await this.#noteManager.getNote(link.target);
      if (targetNote) {
        outboundLinks.push({
          target: link.target,
          relationship: 'references',
          created: timestamp,
          display: link.display,
          type: link.type
        });
      }
    }

    // Update metadata
    const existingLinks = note.metadata.links || { outbound: [], inbound: [] };
    const updatedMetadata = {
      ...note.metadata,
      links: {
        ...existingLinks,
        outbound: outboundLinks
      }
    };

    await this.#noteManager.updateNoteWithMetadata(
      identifier,
      note.content,
      updatedMetadata,
      note.content_hash
    );
  }

  /**
   * Search for notes that could be linked
   */
  async searchLinkableNotes(
    query: string,
    excludeType?: string
  ): Promise<NoteLookupResult[]> {
    // Use the search manager to find notes
    const searchResults = await this.#noteManager.searchNotes({
      query,
      limit: 20
    });

    return searchResults
      .map(result => ({
        filename: path.basename(result.filename, '.md'),
        title: result.title,
        type: result.type,
        path: result.path,
        exists: true
      }))
      .filter(note => !excludeType || note.type !== excludeType);
  }

  /**
   * Get link suggestions for a partial query
   */
  async getLinkSuggestions(
    query: string,
    contextType?: string
  ): Promise<LinkSuggestion[]> {
    const notes = await this.searchLinkableNotes(query, contextType);

    return notes
      .map(note => ({
        target: `${note.type}/${note.filename}`,
        display: note.title,
        type: note.type,
        filename: note.filename,
        title: note.title,
        relevance: this.calculateRelevance(query, note.title)
      }))
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  }

  /**
   * Calculate relevance score for search suggestions
   */
  private calculateRelevance(query: string, title: string): number {
    const queryLower = query.toLowerCase();
    const titleLower = title.toLowerCase();

    // Exact match gets highest score
    if (titleLower === queryLower) return 1.0;

    // Starts with query gets high score
    if (titleLower.startsWith(queryLower)) return 0.8;

    // Contains query gets medium score
    if (titleLower.includes(queryLower)) return 0.6;

    // Fuzzy match gets lower score
    const words = queryLower.split(/\s+/);
    const matchingWords = words.filter(word => titleLower.includes(word));
    return (matchingWords.length / words.length) * 0.4;
  }

  /**
   * Find potential automatic link opportunities in content
   */
  async findAutoLinkOpportunities(identifier: string): Promise<
    Array<{
      text: string;
      position: { start: number; end: number };
      suggestions: LinkSuggestion[];
    }>
  > {
    const note = await this.#noteManager.getNote(identifier);
    if (!note) {
      return [];
    }

    // Get all available notes
    const allNotes = await this.searchLinkableNotes('', note.type);

    // Find linkable text in content
    return WikilinkParser.findLinkableText(note.content, allNotes);
  }

  /**
   * Update inbound links for a target note
   */
  async updateInboundLinks(targetIdentifier: string): Promise<void> {
    const targetNote = await this.#noteManager.getNote(targetIdentifier);
    if (!targetNote) {
      throw new Error(`Target note not found: ${targetIdentifier}`);
    }

    // Search for all notes that might link to this target
    const allNotes = await this.#noteManager.searchNotes({ query: '', limit: 1000 });
    const inboundLinks: NoteLink[] = [];

    for (const note of allNotes) {
      if (note.id === targetIdentifier) continue; // Skip self

      const noteContent = await this.#noteManager.getNote(note.id);
      if (!noteContent) continue;

      // Check if this note contains wikilinks to the target
      const parseResult = WikilinkParser.parseWikilinks(noteContent.content);
      const targetType = targetNote.type;
      const targetFilename = path.basename(targetNote.filename, '.md');
      const targetReference = `${targetType}/${targetFilename}`;

      for (const wikilink of parseResult.wikilinks) {
        if (WikilinkParser.normalizeTarget(wikilink.target) === targetReference) {
          inboundLinks.push({
            target: note.id,
            relationship: 'references',
            created: note.created,
            display: note.title,
            type: note.type
          });
          break; // Only count each note once
        }
      }
    }

    // Update target note's inbound links
    const existingLinks = targetNote.metadata.links || { outbound: [], inbound: [] };
    const updatedMetadata = {
      ...targetNote.metadata,
      links: {
        ...existingLinks,
        inbound: inboundLinks
      }
    };

    await this.#noteManager.updateNoteWithMetadata(
      targetIdentifier,
      targetNote.content,
      updatedMetadata,
      targetNote.content_hash
    );
  }

  /**
   * Implementation of NoteLinkingManager interface for NoteLinkingUtils
   */
  async searchNotes(
    query: string,
    type?: string,
    limit?: number
  ): Promise<NoteLookupResult[]> {
    const searchResults = await this.searchLinkableNotes(query, type);
    return searchResults.slice(0, limit || 20);
  }

  /**
   * Implementation of NoteLinkingManager interface for NoteLinkingUtils
   */
  async getNote(identifier: string): Promise<{
    id: string;
    title: string;
    type: string;
    filename: string;
    content: string;
    exists: boolean;
  } | null> {
    const note = await this.#noteManager.getNote(identifier);
    if (!note) {
      return null;
    }

    return {
      id: note.id,
      title: note.title,
      type: note.type,
      filename: path.basename(note.filename, '.md'),
      content: note.content,
      exists: true
    };
  }

  /**
   * Validate wikilinks in content using enhanced utilities
   */
  async validateWikilinks(content: string, contextType?: string) {
    return await this.#linkingUtils.validateWikilinks(content, contextType);
  }

  /**
   * Auto-link content with intelligent suggestions
   */
  async autoLinkContent(
    content: string,
    contextType?: string,
    aggressiveness: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
  ) {
    return await this.#linkingUtils.autoLinkContent(content, contextType, aggressiveness);
  }

  /**
   * Get smart link suggestions with context awareness
   */
  async getSmartLinkSuggestions(
    partialQuery: string,
    contextType?: string,
    contextContent?: string,
    limit: number = 10
  ) {
    return await this.#linkingUtils.getSmartLinkSuggestions(
      partialQuery,
      contextType,
      contextContent,
      limit
    );
  }

  /**
   * Generate comprehensive link report for content
   */
  async generateLinkReport(content: string, contextType?: string) {
    return await this.#linkingUtils.generateLinkReport(content, contextType);
  }
}
