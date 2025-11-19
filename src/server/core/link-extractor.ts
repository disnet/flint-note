/**
 * Link Extractor
 *
 * Enhanced link extraction functionality that extracts both wikilinks
 * and external URLs from note content for storage in the SQLite database.
 */

import { WikilinkParser } from './wikilink-parser.js';
import type {
  DatabaseConnection,
  NoteLinkRow,
  ExternalLinkRow
} from '../database/schema.js';

export interface ExtractedWikilink {
  target_title: string;
  link_text?: string;
  line_number: number;
  target_note_id?: string;
}

export interface ExtractedExternalLink {
  url: string;
  title?: string;
  line_number: number;
  link_type: 'url' | 'image' | 'embed';
}

export interface LinkExtractionResult {
  wikilinks: ExtractedWikilink[];
  external_links: ExtractedExternalLink[];
  rewritten_content?: string; // Optional: content with title-based links converted to ID-based
}

export class LinkExtractor {
  // Regex for markdown links [title](url)
  private static readonly MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;

  // Regex for plain URLs
  private static readonly URL_REGEX = /https?:\/\/[^\s<>"']+/g;

  // Regex for image embeds ![alt](url)
  private static readonly IMAGE_EMBED_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

  /**
   * Extract all links from note content
   */
  static extractLinks(content: string): LinkExtractionResult {
    const lines = content.split('\n');
    const wikilinks: ExtractedWikilink[] = [];
    const external_links: ExtractedExternalLink[] = [];

    // Track processed URLs to avoid duplicates
    const processedUrls = new Set<string>();

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Extract wikilinks from this line
      const lineWikilinks = this.extractWikilinksFromLine(line, lineNumber);
      wikilinks.push(...lineWikilinks);

      // Extract external links from this line
      const lineExternalLinks = this.extractExternalLinksFromLine(line, lineNumber);

      // Filter out duplicates
      for (const link of lineExternalLinks) {
        if (!processedUrls.has(link.url)) {
          processedUrls.add(link.url);
          external_links.push(link);
        }
      }
    }

    return { wikilinks, external_links };
  }

  /**
   * Convert title-based wikilinks to ID-based wikilinks
   * Returns rewritten content with [[Title]] -> [[n-id]] or [[Title|Custom]] -> [[n-id|Custom]]
   */
  static async convertTitleLinksToIdLinks(
    content: string,
    db: DatabaseConnection
  ): Promise<string> {
    const parseResult = WikilinkParser.parseWikilinks(content);

    // Collect replacements: map from original raw link to new ID-based link
    const replacements = new Map<string, string>();

    for (const wikilink of parseResult.wikilinks) {
      // Skip links that are already ID-based
      if (wikilink.noteId) {
        continue;
      }

      // Try to resolve the title to a note ID
      const noteId = await this.findNoteByTitle(wikilink.target, db);

      if (noteId) {
        // Determine if this link has custom display text
        // If display text differs from target title, preserve it
        const hasCustomDisplay = wikilink.display !== wikilink.target;
        const displayText = hasCustomDisplay ? wikilink.display : undefined;

        // Create the new ID-based wikilink, preserving custom display text
        const newLink = WikilinkParser.createIdWikilink(noteId, displayText);
        replacements.set(wikilink.raw, newLink);
      }
    }

    // Apply replacements using WikilinkParser.replaceWikilinks
    // But we need to map by target, not by raw link text
    // Let's do manual replacement instead
    if (replacements.size === 0) {
      return content;
    }

    let rewrittenContent = content;

    // Sort by position (descending) to avoid position shifts during replacement
    const sortedLinks = parseResult.wikilinks
      .filter((link) => replacements.has(link.raw))
      .sort((a, b) => b.position.start - a.position.start);

    for (const link of sortedLinks) {
      const replacement = replacements.get(link.raw);
      if (replacement) {
        rewrittenContent =
          rewrittenContent.slice(0, link.position.start) +
          replacement +
          rewrittenContent.slice(link.position.end);
      }
    }

    return rewrittenContent;
  }

  /**
   * Extract wikilinks from a single line
   */
  private static extractWikilinksFromLine(
    line: string,
    lineNumber: number
  ): ExtractedWikilink[] {
    const wikilinks: ExtractedWikilink[] = [];
    const parseResult = WikilinkParser.parseWikilinks(line);

    for (const wikilink of parseResult.wikilinks) {
      wikilinks.push({
        target_title: wikilink.target,
        link_text: wikilink.display !== wikilink.target ? wikilink.display : undefined,
        line_number: lineNumber,
        target_note_id: wikilink.noteId // Capture note ID if present (ID-based links)
      });
    }

    return wikilinks;
  }

  /**
   * Extract external links from a single line
   */
  private static extractExternalLinksFromLine(
    line: string,
    lineNumber: number
  ): ExtractedExternalLink[] {
    const links: ExtractedExternalLink[] = [];

    // First, extract image embeds
    let match;
    this.IMAGE_EMBED_REGEX.lastIndex = 0;
    while ((match = this.IMAGE_EMBED_REGEX.exec(line)) !== null) {
      const [, alt, url] = match;
      if (this.isValidUrl(url)) {
        links.push({
          url: url.trim(),
          title: alt.trim() || undefined,
          line_number: lineNumber,
          link_type: 'image'
        });
      }
    }

    // Then extract markdown links
    this.MARKDOWN_LINK_REGEX.lastIndex = 0;
    while ((match = this.MARKDOWN_LINK_REGEX.exec(line)) !== null) {
      const [, title, url] = match;
      if (this.isValidUrl(url)) {
        links.push({
          url: url.trim(),
          title: title.trim() || undefined,
          line_number: lineNumber,
          link_type: 'url'
        });
      }
    }

    // Finally, extract plain URLs (but skip ones already captured)
    const capturedUrls = new Set(links.map((link) => link.url));
    this.URL_REGEX.lastIndex = 0;
    while ((match = this.URL_REGEX.exec(line)) !== null) {
      const url = match[0].trim();
      if (this.isValidUrl(url) && !capturedUrls.has(url)) {
        links.push({
          url,
          line_number: lineNumber,
          link_type: 'url'
        });
      }
    }

    return links;
  }

  /**
   * Check if a string is a valid URL
   */
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }

  /**
   * Resolve wikilink targets to actual note IDs
   */
  static async resolveWikilinks(
    wikilinks: ExtractedWikilink[],
    db: DatabaseConnection
  ): Promise<ExtractedWikilink[]> {
    const resolved: ExtractedWikilink[] = [];

    for (const wikilink of wikilinks) {
      // If target_note_id is already set (ID-based link), validate it exists
      if (wikilink.target_note_id) {
        // Validate that the target note exists in the database
        const note = await db.get<{ id: string }>('SELECT id FROM notes WHERE id = ?', [
          wikilink.target_note_id
        ]);
        resolved.push({
          ...wikilink,
          // Set to null if note doesn't exist (broken link)
          target_note_id: note?.id
        });
        continue;
      }

      // Otherwise, resolve title/filename to note ID
      const targetNoteId = await this.findNoteByTitle(wikilink.target_title, db);
      resolved.push({
        ...wikilink,
        target_note_id: targetNoteId
      });
    }

    return resolved;
  }

  /**
   * Find note ID by title, filename, or note ID
   */
  static async findNoteByTitle(
    targetTitle: string,
    db: DatabaseConnection
  ): Promise<string | undefined> {
    // First check if target is already a note ID (n-xxxxxxxx format)
    const { WikilinkParser } = await import('./wikilink-parser.js');
    if (WikilinkParser.isNoteId(targetTitle)) {
      // Validate that the note exists
      const note = await db.get<{ id: string }>('SELECT id FROM notes WHERE id = ?', [
        targetTitle
      ]);
      return note?.id;
    }

    // Try exact title match
    let note = await db.get<{ id: string }>(
      'SELECT id FROM notes WHERE title = ? COLLATE NOCASE',
      [targetTitle]
    );

    if (note) {
      return note.id;
    }

    // Try to parse as type/filename format
    const typeFileMatch = targetTitle.match(/^([^/]+)\/([^/]+)$/);
    if (typeFileMatch) {
      const [, type, filename] = typeFileMatch;
      const filenameWithExt = filename.endsWith('.md') ? filename : `${filename}.md`;

      note = await db.get<{ id: string }>(
        'SELECT id FROM notes WHERE type = ? AND filename = ?',
        [type, filenameWithExt]
      );

      if (note) {
        return note.id;
      }
    }

    // Try filename match (with and without .md extension)
    const cleanTitle = targetTitle.replace(/\.md$/, '');
    const titleWithExt = cleanTitle.endsWith('.md') ? cleanTitle : `${cleanTitle}.md`;

    note = await db.get<{ id: string }>(
      'SELECT id FROM notes WHERE filename = ? OR filename = ?',
      [cleanTitle, titleWithExt]
    );

    return note?.id;
  }

  /**
   * Store extracted links in the database
   */
  static async storeLinks(
    noteId: string,
    extractionResult: LinkExtractionResult,
    db: DatabaseConnection,
    useTransaction: boolean = true
  ): Promise<void> {
    // Start transaction if requested
    if (useTransaction) {
      await db.run('BEGIN TRANSACTION');
    }

    try {
      // Clear existing links for this note
      await db.run('DELETE FROM note_links WHERE source_note_id = ?', [noteId]);
      await db.run('DELETE FROM external_links WHERE note_id = ?', [noteId]);

      // Resolve wikilinks to note IDs
      const resolvedWikilinks = await this.resolveWikilinks(
        extractionResult.wikilinks,
        db
      );

      // Insert wikilinks
      for (const wikilink of resolvedWikilinks) {
        await db.run(
          `INSERT INTO note_links (source_note_id, target_note_id, target_title, link_text, line_number)
           VALUES (?, ?, ?, ?, ?)`,
          [
            noteId,
            wikilink.target_note_id || null,
            wikilink.target_title,
            wikilink.link_text || null,
            wikilink.line_number
          ]
        );
      }

      // Insert external links
      for (const link of extractionResult.external_links) {
        await db.run(
          `INSERT INTO external_links (note_id, url, title, line_number, link_type)
           VALUES (?, ?, ?, ?, ?)`,
          [noteId, link.url, link.title || null, link.line_number, link.link_type]
        );
      }

      if (useTransaction) {
        await db.run('COMMIT');
      }
    } catch (error) {
      if (useTransaction) {
        await db.run('ROLLBACK');
      }
      throw error;
    }
  }

  /**
   * Get all links for a note
   */
  static async getLinksForNote(
    noteId: string,
    db: DatabaseConnection
  ): Promise<{
    outgoing_internal: NoteLinkRow[];
    outgoing_external: ExternalLinkRow[];
    incoming: NoteLinkRow[];
  }> {
    // Get outgoing internal links
    const outgoing_internal = await db.all<NoteLinkRow>(
      `SELECT * FROM note_links WHERE source_note_id = ? ORDER BY line_number`,
      [noteId]
    );

    // Get outgoing external links
    const outgoing_external = await db.all<ExternalLinkRow>(
      `SELECT * FROM external_links WHERE note_id = ? ORDER BY line_number`,
      [noteId]
    );

    // Get incoming internal links
    const incoming = await db.all<NoteLinkRow>(
      `SELECT * FROM note_links WHERE target_note_id = ? ORDER BY created DESC`,
      [noteId]
    );

    return {
      outgoing_internal,
      outgoing_external,
      incoming
    };
  }

  /**
   * Find broken links (wikilinks with no target_note_id)
   */
  static async findBrokenLinks(db: DatabaseConnection): Promise<NoteLinkRow[]> {
    return await db.all<NoteLinkRow>(
      `SELECT * FROM note_links WHERE target_note_id IS NULL ORDER BY source_note_id, line_number`
    );
  }

  /**
   * Get backlinks for a note
   */
  static async getBacklinks(
    noteId: string,
    db: DatabaseConnection
  ): Promise<NoteLinkRow[]> {
    return await db.all<NoteLinkRow>(
      `SELECT * FROM note_links WHERE target_note_id = ? ORDER BY created DESC`,
      [noteId]
    );
  }

  /**
   * Update broken links when a note is created or renamed
   */
  static async updateBrokenLinks(
    noteId: string,
    noteTitle: string,
    db: DatabaseConnection
  ): Promise<number> {
    const result = await db.run(
      `UPDATE note_links
       SET target_note_id = ?
       WHERE target_note_id IS NULL AND target_title = ?`,
      [noteId, noteTitle]
    );

    return result.changes || 0;
  }

  /**
   * Clear all links for a note (used during note deletion)
   */
  static async clearLinksForNote(
    noteId: string,
    db: DatabaseConnection,
    useTransaction: boolean = true
  ): Promise<void> {
    // Start transaction if requested
    if (useTransaction) {
      await db.run('BEGIN TRANSACTION');
    }

    try {
      // Clear outgoing links
      await db.run('DELETE FROM note_links WHERE source_note_id = ?', [noteId]);
      await db.run('DELETE FROM external_links WHERE note_id = ?', [noteId]);

      // Set target_note_id to NULL for incoming links (making them broken)
      await db.run(
        'UPDATE note_links SET target_note_id = NULL WHERE target_note_id = ?',
        [noteId]
      );

      if (useTransaction) {
        await db.run('COMMIT');
      }
    } catch (error) {
      if (useTransaction) {
        await db.run('ROLLBACK');
      }
      throw error;
    }
  }
}
