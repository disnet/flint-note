// Types for PDF viewer components

export interface PdfOutlineItem {
  title: string;
  dest: string | unknown[]; // PDF destination
  items?: PdfOutlineItem[]; // Nested outline items
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modDate?: Date;
}

export interface PdfLocation {
  pageNumber: number;
  totalPages: number;
}

// Highlight types for PDF annotations
export interface PdfHighlight {
  id: string;
  pageNumber: number;
  text: string;
  // Character offsets within the page's text content
  startOffset: number;
  endOffset: number;
  // Bounding rectangles for rendering (relative to page, in PDF units)
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  createdAt: string;
}

// Selection info for creating highlights
export interface PdfSelectionInfo {
  text: string;
  pageNumber: number;
  startOffset: number;
  endOffset: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  // Position for popup placement (in viewport coordinates)
  position: { x: number; y: number };
}

// Marker for highlights section in note content
export const PDF_HIGHLIGHTS_MARKER_START = '<!-- pdf-highlights-start -->';
export const PDF_HIGHLIGHTS_MARKER_END = '<!-- pdf-highlights-end -->';

// Parse highlights from note content
export function parsePdfHighlightsFromContent(content: string): PdfHighlight[] {
  const startIdx = content.indexOf(PDF_HIGHLIGHTS_MARKER_START);
  const endIdx = content.indexOf(PDF_HIGHLIGHTS_MARKER_END);

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    return [];
  }

  const highlightsSection = content.slice(
    startIdx + PDF_HIGHLIGHTS_MARKER_START.length,
    endIdx
  );

  const highlights: PdfHighlight[] = [];
  // Format: > "quote text" [page:startOffset-endOffset](id|timestamp|rects)
  // rects are JSON-encoded array
  const regex = /^>\s*"(.+?)"\s*\[(\d+):(\d+)-(\d+)\]\(([^|]+)\|([^|]+)\|([^)]+)\)/gm;
  let match;

  while ((match = regex.exec(highlightsSection)) !== null) {
    try {
      const rects = JSON.parse(decodeURIComponent(match[7]));
      highlights.push({
        text: match[1],
        pageNumber: parseInt(match[2], 10),
        startOffset: parseInt(match[3], 10),
        endOffset: parseInt(match[4], 10),
        id: match[5],
        createdAt: match[6],
        rects
      });
    } catch {
      // Skip malformed highlights
    }
  }

  return highlights;
}

// Serialize highlights to markdown format
export function serializePdfHighlightsToContent(highlights: PdfHighlight[]): string {
  if (highlights.length === 0) {
    return '';
  }

  const lines = highlights.map((h) => {
    const rectsEncoded = encodeURIComponent(JSON.stringify(h.rects));
    // Escape quotes in text for markdown
    const escapedText = h.text.replace(/"/g, '\\"');
    return `> "${escapedText}" [${h.pageNumber}:${h.startOffset}-${h.endOffset}](${h.id}|${h.createdAt}|${rectsEncoded})`;
  });

  return `\n\n${PDF_HIGHLIGHTS_MARKER_START}\n## Highlights\n\n${lines.join('\n\n')}\n${PDF_HIGHLIGHTS_MARKER_END}`;
}

// Update content with new highlights (preserves non-highlights content)
export function updatePdfContentWithHighlights(
  content: string,
  highlights: PdfHighlight[]
): string {
  const startIdx = content.indexOf(PDF_HIGHLIGHTS_MARKER_START);
  const endIdx = content.indexOf(PDF_HIGHLIGHTS_MARKER_END);

  // Remove existing highlights section if present
  let baseContent = content;
  if (startIdx !== -1 && endIdx !== -1) {
    baseContent =
      content.slice(0, startIdx).trimEnd() +
      content.slice(endIdx + PDF_HIGHLIGHTS_MARKER_END.length);
  }

  // Add new highlights section
  const highlightsSection = serializePdfHighlightsToContent(highlights);
  return baseContent.trimEnd() + highlightsSection;
}
