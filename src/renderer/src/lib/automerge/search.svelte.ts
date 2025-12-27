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
 * Simple Levenshtein distance for fuzzy title matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if a term fuzzy-matches within text
 * Returns true if the term matches exactly or within maxDistance edits
 */
function fuzzyMatchTerm(text: string, term: string, maxDistance = 2): boolean {
  const words = text.toLowerCase().split(/\s+/);
  const lowerTerm = term.toLowerCase();

  // Exact substring match
  if (text.toLowerCase().includes(lowerTerm)) return true;

  // Fuzzy match against words (only for terms >= 4 chars)
  if (lowerTerm.length < 4) return false;

  return words.some((word) => {
    if (word.length < 3) return false;
    // Check if word starts with term (prefix match) with tolerance
    const compareLength = Math.min(word.length, lowerTerm.length);
    const wordPrefix = word.slice(0, compareLength);
    const termPrefix = lowerTerm.slice(0, compareLength);
    return levenshteinDistance(wordPrefix, termPrefix) <= maxDistance;
  });
}

/**
 * Calculate relevance score for a note
 * Scoring priorities:
 * 1. Exact title match (highest)
 * 2. Full query match in title
 * 3. All search terms matched
 * 4. Individual term matches
 * 5. Content matches (lower weight)
 */
function calculateScore(
  note: NoteMetadata,
  terms: string[],
  titleMatches: SearchMatch[],
  matchedType: NoteType | undefined,
  contentMatchCount = 0
): number {
  let score = 0;
  const lowerTitle = note.title.toLowerCase();
  const fullQuery = terms.join(' ');

  // 1. Exact title match - highest priority (works for any query length)
  if (lowerTitle === fullQuery) {
    score += 100;
  } else if (terms.length > 1) {
    // 2. Full query match bonuses (for multi-word queries)
    if (lowerTitle.includes(fullQuery)) {
      // Title contains the full query as a substring
      score += 50;
    } else if (lowerTitle.startsWith(fullQuery)) {
      // Title starts with full query
      score += 45;
    }
  }

  // 3. Individual term matching
  let matchedTermCount = 0;
  for (const term of terms) {
    if (lowerTitle.includes(term)) {
      matchedTermCount++;
      score += 10;

      // Word boundary bonus (term is at start of a word)
      const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(term)}`, 'i');
      if (wordBoundaryRegex.test(note.title)) {
        score += 3;
      }

      // Title starts with this term (only first term gets this bonus)
      if (terms.indexOf(term) === 0 && lowerTitle.startsWith(term)) {
        score += 5;
      }
    }
  }

  // 4. All terms matched bonus (critical for multi-word queries)
  if (matchedTermCount === terms.length && terms.length > 1) {
    score += 25;
  }

  // 4. Content match scoring (lower weight than title)
  if (contentMatchCount > 0) {
    score += Math.min(contentMatchCount * 3, 15);
  }

  // 5. Type match bonus
  if (matchedType) {
    score += 3;
  }

  // 6. Title match presence bonus
  if (titleMatches.length > 0) {
    score += 5;
  }

  // 7. Recency boost (notes updated in last 7 days get a small boost)
  const daysSinceUpdate =
    (Date.now() - new Date(note.updated).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate < 7) {
    score += 2;
  }

  return score;
}

/**
 * Search options with fuzzy matching support
 */
export interface EnhancedSearchOptions extends SearchOptions {
  /** Enable fuzzy matching for typo tolerance (default: true) */
  fuzzyMatch?: boolean;
}

const DEFAULT_ENHANCED_OPTIONS: Required<EnhancedSearchOptions> = {
  ...DEFAULT_OPTIONS,
  fuzzyMatch: true
};

/**
 * Search notes with ranking and highlighting
 * Supports exact and fuzzy matching in titles
 */
export function searchNotesEnhanced(
  notes: NoteMetadata[],
  query: string,
  options: EnhancedSearchOptions = {}
): SearchResult[] {
  const opts = { ...DEFAULT_ENHANCED_OPTIONS, ...options };

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

    // Check if any term matches in title (exact or fuzzy)
    let hasMatch = false;
    for (const term of terms) {
      if (opts.fuzzyMatch) {
        if (fuzzyMatchTerm(note.title, term)) {
          hasMatch = true;
          break;
        }
      } else {
        if (note.title.toLowerCase().includes(term)) {
          hasMatch = true;
          break;
        }
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
    const contentMatches: SearchMatch[] = []; // Content search handled via index

    // Calculate score (contentMatchCount will be 0 for title-only search)
    const score = calculateScore(note, terms, titleMatches, matchedType, 0);

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

/**
 * Enhanced search result with content match indicator
 */
export interface EnhancedSearchResult extends SearchResult {
  /** Whether this result came from content search (not title) */
  isContentMatch: boolean;
}

/**
 * Options for async search including content loading
 */
export interface AsyncSearchOptions extends EnhancedSearchOptions {
  /** Function to load note content by ID */
  contentLoader?: (noteId: string) => Promise<string>;
}

/**
 * Async search that combines title and content search
 * - Phase 1: Immediate title search (synchronous)
 * - Phase 2: Content search via MiniSearch index with snippet extraction
 * Returns merged results with content matches included
 */
export async function searchNotesAsync(
  notes: NoteMetadata[],
  query: string,
  options: AsyncSearchOptions = {},
  searchIndexModule?: { search: (q: string) => { id: string; score: number }[] }
): Promise<EnhancedSearchResult[]> {
  const opts = { ...DEFAULT_ENHANCED_OPTIONS, ...options };

  if (!query.trim()) {
    return [];
  }

  const terms = tokenizeQuery(query);

  // Phase 1: Title search (immediate)
  const titleResults = searchNotesEnhanced(notes, query, options);

  // Convert to enhanced results
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Map used for local computation, not reactive state
  const resultMap = new Map<string, EnhancedSearchResult>();

  // Add title results first (higher priority)
  for (const result of titleResults) {
    resultMap.set(result.note.id, {
      ...result,
      isContentMatch: false
    });
  }

  // Phase 2: Content search via MiniSearch index (if available)
  if (searchIndexModule && options.contentLoader) {
    const contentResults = searchIndexModule.search(query);

    // Limit content loading to top results for performance
    const topContentResults = contentResults.slice(0, opts.maxResults ?? 50);

    // Process content results and extract snippets
    const contentPromises = topContentResults.map(async (contentResult) => {
      const noteId = contentResult.id;
      const note = notes.find((n) => n.id === noteId);
      if (!note || note.archived) return null;

      // Load content and extract snippets for all content matches
      let contentMatches: SearchMatch[] = [];
      try {
        const content = await options.contentLoader!(noteId);
        if (content) {
          contentMatches = findMatches(
            content,
            terms,
            opts.contextChars ?? 60,
            opts.maxMatchesPerNote ?? 3
          );
        }
      } catch {
        // Ignore content loading errors
      }

      return { noteId, note, contentResult, contentMatches };
    });

    const processedResults = await Promise.all(contentPromises);

    // Merge content results
    for (const processed of processedResults) {
      if (!processed) continue;
      const { noteId, note, contentResult, contentMatches } = processed;

      const existing = resultMap.get(noteId);
      if (existing) {
        // Boost score for notes that match both title and content
        existing.score += Math.min(contentResult.score * 0.3, 10);
        // Add content matches if we have them
        if (contentMatches.length > 0 && existing.contentMatches.length === 0) {
          existing.contentMatches = contentMatches;
        }
      } else {
        // Content-only match (not in title results)
        resultMap.set(noteId, {
          note,
          score: contentResult.score * 0.5, // Content matches weighted lower
          titleMatches: [],
          contentMatches,
          isContentMatch: true
        });
      }
    }
  }

  // Sort by score and return top results
  return Array.from(resultMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.maxResults);
}
