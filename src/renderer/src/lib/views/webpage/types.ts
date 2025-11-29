// Types for Webpage viewer components

export interface WebpageMetadata {
  url: string;
  title: string;
  siteName?: string;
  author?: string;
  excerpt?: string;
  fetchedAt: string;
  byline?: string;
  lang?: string;
  dir?: string;
}

export interface WebpageHighlight {
  id: string;
  textContent: string; // The highlighted text
  prefix: string; // Text before the highlight (for context matching)
  suffix: string; // Text after the highlight (for context matching)
  // Fallback: character offsets within the cleaned HTML body text
  startOffset: number;
  endOffset: number;
  createdAt: string;
}

// Selection info for creating highlights
export interface WebpageSelectionInfo {
  text: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
  // Position for popup placement (in viewport coordinates)
  position: { x: number; y: number };
}

// Marker for highlights section in note content
export const WEBPAGE_HIGHLIGHTS_MARKER_START = '<!-- webpage-highlights-start -->';
export const WEBPAGE_HIGHLIGHTS_MARKER_END = '<!-- webpage-highlights-end -->';

// Parse highlights from note content
export function parseWebpageHighlightsFromContent(content: string): WebpageHighlight[] {
  const startIdx = content.indexOf(WEBPAGE_HIGHLIGHTS_MARKER_START);
  const endIdx = content.indexOf(WEBPAGE_HIGHLIGHTS_MARKER_END);

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    return [];
  }

  const highlightsSection = content.slice(
    startIdx + WEBPAGE_HIGHLIGHTS_MARKER_START.length,
    endIdx
  );

  const highlights: WebpageHighlight[] = [];
  // Format: > "quote text" [prefix...suffix](id|timestamp|startOffset-endOffset)
  const regex =
    /^>\s*"(.+?)"\s*\[([^.]*)\.\.\.(.*?)\]\(([^|]+)\|([^|]+)\|(\d+)-(\d+)\)/gm;
  let match;

  while ((match = regex.exec(highlightsSection)) !== null) {
    try {
      highlights.push({
        textContent: decodeURIComponent(match[1]),
        prefix: decodeURIComponent(match[2]),
        suffix: decodeURIComponent(match[3]),
        id: match[4],
        createdAt: match[5],
        startOffset: parseInt(match[6], 10),
        endOffset: parseInt(match[7], 10)
      });
    } catch {
      // Skip malformed highlights
    }
  }

  return highlights;
}

// Serialize highlights to markdown format
export function serializeWebpageHighlightsToContent(
  highlights: WebpageHighlight[]
): string {
  if (highlights.length === 0) {
    return '';
  }

  const lines = highlights.map((h) => {
    // Encode special characters in text, prefix, and suffix
    const encodedText = encodeURIComponent(h.textContent);
    const encodedPrefix = encodeURIComponent(h.prefix);
    const encodedSuffix = encodeURIComponent(h.suffix);
    return `> "${encodedText}" [${encodedPrefix}...${encodedSuffix}](${h.id}|${h.createdAt}|${h.startOffset}-${h.endOffset})`;
  });

  return `\n\n${WEBPAGE_HIGHLIGHTS_MARKER_START}\n## Highlights\n\n${lines.join('\n\n')}\n${WEBPAGE_HIGHLIGHTS_MARKER_END}`;
}

// Update content with new highlights (preserves non-highlights content)
export function updateWebpageContentWithHighlights(
  content: string,
  highlights: WebpageHighlight[]
): string {
  const startIdx = content.indexOf(WEBPAGE_HIGHLIGHTS_MARKER_START);
  const endIdx = content.indexOf(WEBPAGE_HIGHLIGHTS_MARKER_END);

  // Remove existing highlights section if present
  let baseContent = content;
  if (startIdx !== -1 && endIdx !== -1) {
    baseContent =
      content.slice(0, startIdx).trimEnd() +
      content.slice(endIdx + WEBPAGE_HIGHLIGHTS_MARKER_END.length);
  }

  // Add new highlights section
  const highlightsSection = serializeWebpageHighlightsToContent(highlights);
  return baseContent.trimEnd() + highlightsSection;
}

// Helper to extract context around selected text
export function extractSelectionContext(
  fullText: string,
  startOffset: number,
  endOffset: number,
  contextLength: number = 30
): { prefix: string; suffix: string } {
  const prefix = fullText.slice(Math.max(0, startOffset - contextLength), startOffset);
  const suffix = fullText.slice(
    endOffset,
    Math.min(fullText.length, endOffset + contextLength)
  );
  return { prefix, suffix };
}

// Find highlight location in text using fuzzy matching
export function findHighlightInText(
  text: string,
  highlight: WebpageHighlight
): { start: number; end: number } | null {
  // First try exact match with context
  const searchPattern = highlight.prefix + highlight.textContent + highlight.suffix;
  let idx = text.indexOf(searchPattern);
  if (idx !== -1) {
    return {
      start: idx + highlight.prefix.length,
      end: idx + highlight.prefix.length + highlight.textContent.length
    };
  }

  // Try finding just the text content
  idx = text.indexOf(highlight.textContent);
  if (idx !== -1) {
    return {
      start: idx,
      end: idx + highlight.textContent.length
    };
  }

  // Fallback to stored offsets if text has changed significantly
  if (
    highlight.startOffset >= 0 &&
    highlight.endOffset <= text.length &&
    text.slice(highlight.startOffset, highlight.endOffset) === highlight.textContent
  ) {
    return {
      start: highlight.startOffset,
      end: highlight.endOffset
    };
  }

  return null;
}
