// Types for EPUB viewer components

export interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

export interface EpubMetadata {
  title?: string;
  author?: string | string[];
  publisher?: string;
  language?: string;
  description?: string;
  [key: string]: unknown;
}

export interface EpubLocation {
  index: number;
  fraction: number;
  totalLocations?: number;
}

export interface EpubHighlight {
  id: string;
  cfi: string;
  text: string;
  createdAt: string;
}

// Marker for highlights section in note content
export const HIGHLIGHTS_MARKER_START = '<!-- epub-highlights-start -->';
export const HIGHLIGHTS_MARKER_END = '<!-- epub-highlights-end -->';

// Parse highlights from note content
export function parseHighlightsFromContent(content: string): EpubHighlight[] {
  const startIdx = content.indexOf(HIGHLIGHTS_MARKER_START);
  const endIdx = content.indexOf(HIGHLIGHTS_MARKER_END);

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    return [];
  }

  const highlightsSection = content.slice(
    startIdx + HIGHLIGHTS_MARKER_START.length,
    endIdx
  );

  const highlights: EpubHighlight[] = [];
  // Format: > "quote text" [cfi](id|timestamp)
  const regex = /^>\s*"(.+?)"\s*\[([^\]]+)\]\(([^|]+)\|([^)]+)\)/gm;
  let match;

  while ((match = regex.exec(highlightsSection)) !== null) {
    highlights.push({
      text: match[1],
      cfi: match[2],
      id: match[3],
      createdAt: match[4]
    });
  }

  return highlights;
}

// Serialize highlights to markdown format
export function serializeHighlightsToContent(highlights: EpubHighlight[]): string {
  if (highlights.length === 0) {
    return '';
  }

  const lines = highlights.map((h) => `> "${h.text}" [${h.cfi}](${h.id}|${h.createdAt})`);

  return `\n\n${HIGHLIGHTS_MARKER_START}\n## Highlights\n\n${lines.join('\n\n')}\n${HIGHLIGHTS_MARKER_END}`;
}

// Update content with new highlights (preserves non-highlights content)
export function updateContentWithHighlights(
  content: string,
  highlights: EpubHighlight[]
): string {
  const startIdx = content.indexOf(HIGHLIGHTS_MARKER_START);
  const endIdx = content.indexOf(HIGHLIGHTS_MARKER_END);

  // Remove existing highlights section if present
  let baseContent = content;
  if (startIdx !== -1 && endIdx !== -1) {
    baseContent =
      content.slice(0, startIdx).trimEnd() +
      content.slice(endIdx + HIGHLIGHTS_MARKER_END.length);
  }

  // Add new highlights section
  const highlightsSection = serializeHighlightsToContent(highlights);
  return baseContent.trimEnd() + highlightsSection;
}
