/**
 * YAML Frontmatter Parsing Utilities
 *
 * Shared utilities for parsing YAML frontmatter in notes.
 * Provides consistent parsing behavior across the application.
 */

import yaml from 'js-yaml';
import type { NoteMetadata, NoteLink } from '../types/index.js';

/**
 * Parse YAML frontmatter string into NoteMetadata
 *
 * @param frontmatter - Raw YAML frontmatter string
 * @param parseLinks - Whether to parse links array with full NoteLink typing
 * @returns Parsed metadata object
 * @throws Error if YAML parsing fails
 */
export function parseFrontmatter(
  frontmatter: string,
  parseLinks: boolean = true
): NoteMetadata {
  const parsed = yaml.load(frontmatter) as Record<string, unknown>;

  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  // Convert to NoteMetadata format
  const metadata: NoteMetadata = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'links' && parseLinks) {
      // Handle both old array format and new bidirectional format
      if (Array.isArray(value)) {
        // Old format - convert to new bidirectional structure for consistency
        metadata.links = {
          outbound: value.map(
            (link: Record<string, unknown>) =>
              ({
                target: (link.target as string) || '',
                relationship: (link.relationship as string) || 'references',
                created: (link.created as string) || new Date().toISOString(),
                context: link.context as string | undefined,
                display: link.display as string | undefined,
                type: link.type as string | undefined
              }) as NoteLink
          ),
          inbound: []
        };
      } else if (value && typeof value === 'object') {
        // New bidirectional format
        const linksObj = value as Record<string, unknown>;
        metadata.links = {
          outbound: Array.isArray(linksObj.outbound)
            ? linksObj.outbound.map(
                (link: Record<string, unknown>) =>
                  ({
                    target: (link.target as string) || '',
                    relationship: (link.relationship as string) || 'references',
                    created: (link.created as string) || new Date().toISOString(),
                    context: link.context as string | undefined,
                    display: link.display as string | undefined,
                    type: link.type as string | undefined
                  }) as NoteLink
              )
            : [],
          inbound: Array.isArray(linksObj.inbound)
            ? linksObj.inbound.map(
                (link: Record<string, unknown>) =>
                  ({
                    target: (link.target as string) || '',
                    relationship: (link.relationship as string) || 'references',
                    created: (link.created as string) || new Date().toISOString(),
                    context: link.context as string | undefined,
                    display: link.display as string | undefined,
                    type: link.type as string | undefined
                  }) as NoteLink
              )
            : []
        };
      }
    } else {
      // Type guard for allowed metadata values
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        Array.isArray(value) ||
        value === undefined ||
        value === null
      ) {
        metadata[key] = value;
      } else if (value instanceof Date) {
        // Convert Date objects to ISO strings for consistency
        metadata[key] = value.toISOString();
      }
    }
  }

  return metadata;
}

/**
 * Parse note content to separate frontmatter and body
 *
 * @param content - Full note content including frontmatter
 * @param parseLinks - Whether to parse links array with full NoteLink typing
 * @returns Object with parsed metadata and content body
 */
export function parseNoteContent(
  content: string,
  parseLinks: boolean = true
): {
  metadata: NoteMetadata;
  content: string;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (match) {
    const frontmatter = match[1];
    const body = match[2];

    let metadata: NoteMetadata = {};
    try {
      metadata = parseFrontmatter(frontmatter, parseLinks);
    } catch (_error) {
      // YAML parsing failed - continue with empty metadata
      // This allows the system to handle malformed YAML gracefully
      metadata = {};
    }

    return {
      metadata,
      content: body.trim()
    };
  } else {
    // No frontmatter, entire content is body
    return {
      metadata: {},
      content: content.trim()
    };
  }
}
