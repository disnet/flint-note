/**
 * Enhanced search functionality for Flint notes
 *
 * Features:
 * - Fuzzy matching with ranking
 * - Match highlighting
 * - Search by title, content, and note type
 */

import type { NoteMetadata, NoteType } from './types';

/**
 * A single match within a note's content
 */
export interface SearchMatch {
  /** The text surrounding the match */
  context: string;
  /** Start index within context where highlight begins */
  highlightStart: number;
  /** End index within context where highlight ends */
  highlightEnd: number;
  /** Line number where match was found (1-indexed) */
  lineNumber: number;
}

/**
 * A search result with ranking and match information
 */
export interface SearchResult {
  /** The matching note */
  note: NoteMetadata;
  /** Relevance score (higher is better) */
  score: number;
  /** Title matches for highlighting */
  titleMatches: SearchMatch[];
  /** Content matches for highlighting (empty for now - content is in separate docs) */
  contentMatches: SearchMatch[];
  /** Note type that matched (if any) */
  matchedType?: NoteType;
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  maxResults?: number;
  /** Maximum matches to extract per note */
  maxMatchesPerNote?: number;
  /** Context characters to include around each match */
  contextChars?: number;
  /** Note types for type name matching */
  noteTypes?: Record<string, NoteType>;
}

const DEFAULT_OPTIONS: Required<SearchOptions> = {
  maxResults: 50,
  maxMatchesPerNote: 3,
  contextChars: 60,
  noteTypes: {}
};

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split query into individual search terms
 */
function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

/**
 * Find all matches of terms in text and return match info
 */
function findMatches(
  text: string,
  terms: string[],
  contextChars: number,
  maxMatches: number
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const lowerText = text.toLowerCase();
  const lines = text.split('\n');

  // Build a map of character position to line number
  let charPos = 0;
  const posToLine: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j <= lines[i].length; j++) {
      posToLine[charPos + j] = i + 1;
    }
    charPos += lines[i].length + 1; // +1 for newline
  }

  // Track positions we've already matched to avoid overlapping contexts
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Set used only for local computation, not reactive state
  const matchedPositions = new Set<number>();

  for (const term of terms) {
    if (matches.length >= maxMatches) break;

    const escapedTerm = escapeRegex(term);
    const regex = new RegExp(escapedTerm, 'gi');
    let match;

    while ((match = regex.exec(lowerText)) !== null && matches.length < maxMatches) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      // Skip if too close to an existing match
      let tooClose = false;
      for (const pos of matchedPositions) {
        if (Math.abs(pos - matchStart) < contextChars) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      matchedPositions.add(matchStart);

      // Calculate context bounds
      const contextStart = Math.max(0, matchStart - contextChars);
      const contextEnd = Math.min(text.length, matchEnd + contextChars);

      // Extract context, respecting word boundaries
      let context = text.slice(contextStart, contextEnd);

      // Trim to word boundaries if not at start/end
      if (contextStart > 0) {
        const firstSpace = context.indexOf(' ');
        if (firstSpace > 0 && firstSpace < contextChars / 2) {
          context = context.slice(firstSpace + 1);
        }
      }
      if (contextEnd < text.length) {
        const lastSpace = context.lastIndexOf(' ');
        if (lastSpace > context.length - contextChars / 2) {
          context = context.slice(0, lastSpace);
        }
      }

      // Recalculate highlight positions within trimmed context
      const highlightStart = Math.max(0, matchStart - contextStart);
      const highlightEnd = Math.min(context.length, highlightStart + match[0].length);

      matches.push({
        context: context.replace(/\n/g, ' '), // Replace newlines with spaces
        highlightStart,
        highlightEnd,
        lineNumber: posToLine[matchStart] || 1
      });
    }
  }

  return matches;
}

/**
 * Calculate relevance score for a note
 * Note: Content search is currently disabled as content is in separate docs
 */
function calculateScore(
  note: NoteMetadata,
  terms: string[],
  titleMatches: SearchMatch[],
  matchedType: NoteType | undefined
): number {
  let score = 0;
  const lowerTitle = note.title.toLowerCase();

  for (const term of terms) {
    // Title matches are worth more
    if (lowerTitle.includes(term)) {
      score += 10;
      // Exact title match is worth even more
      if (lowerTitle === term) {
        score += 20;
      }
      // Title starts with term
      if (lowerTitle.startsWith(term)) {
        score += 5;
      }
    }

    // Type match
    if (matchedType) {
      score += 3;
    }
  }

  // Boost for title matches
  if (titleMatches.length > 0) {
    score += 5;
  }

  // Recency boost (notes updated in last 7 days get a small boost)
  const daysSinceUpdate =
    (Date.now() - new Date(note.updated).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate < 7) {
    score += 2;
  }

  return score;
}

/**
 * Search notes with ranking and highlighting
 * Note: Content search is currently disabled as content is in separate docs
 */
export function searchNotesEnhanced(
  notes: NoteMetadata[],
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!query.trim()) {
    return [];
  }

  const terms = tokenizeQuery(query);
  if (terms.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const note of notes) {
    if (note.archived) continue;

    const lowerTitle = note.title.toLowerCase();

    // Check if any term matches in title
    let hasMatch = false;
    for (const term of terms) {
      if (lowerTitle.includes(term)) {
        hasMatch = true;
        break;
      }
    }

    // Also check note type name
    let matchedType: NoteType | undefined;
    if (opts.noteTypes && note.type) {
      const noteType = opts.noteTypes[note.type];
      if (noteType) {
        const lowerTypeName = noteType.name.toLowerCase();
        for (const term of terms) {
          if (lowerTypeName.includes(term)) {
            hasMatch = true;
            matchedType = noteType;
            break;
          }
        }
      }
    }

    if (!hasMatch) continue;

    // Find matches in title only (content is in separate docs)
    const titleMatches = findMatches(
      note.title,
      terms,
      opts.contextChars,
      opts.maxMatchesPerNote
    );
    const contentMatches: SearchMatch[] = []; // Content search disabled for now

    // Calculate score
    const score = calculateScore(note, terms, titleMatches, matchedType);

    results.push({
      note,
      score,
      titleMatches,
      contentMatches,
      matchedType
    });
  }

  // Sort by score (descending)
  results.sort((a, b) => b.score - a.score);

  // Return top results
  return results.slice(0, opts.maxResults);
}

/**
 * Highlight a match within text
 * Returns an array of segments: { text: string, highlight: boolean }
 */
export interface TextSegment {
  text: string;
  highlight: boolean;
}

export function highlightMatch(match: SearchMatch): TextSegment[] {
  const segments: TextSegment[] = [];
  const { context, highlightStart, highlightEnd } = match;

  if (highlightStart > 0) {
    segments.push({ text: context.slice(0, highlightStart), highlight: false });
  }

  segments.push({ text: context.slice(highlightStart, highlightEnd), highlight: true });

  if (highlightEnd < context.length) {
    segments.push({ text: context.slice(highlightEnd), highlight: false });
  }

  return segments;
}

/**
 * Get a preview of where matches occur in content
 * Returns a string with "..." between non-contiguous matches
 */
export function getMatchPreview(matches: SearchMatch[], maxLength = 150): string {
  if (matches.length === 0) return '';

  let preview = '';
  for (let i = 0; i < matches.length && preview.length < maxLength; i++) {
    if (i > 0) {
      preview += ' ... ';
    }
    preview += matches[i].context;
  }

  if (preview.length > maxLength) {
    preview = preview.slice(0, maxLength) + '...';
  }

  return preview;
}
