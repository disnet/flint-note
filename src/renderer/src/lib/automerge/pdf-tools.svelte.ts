/**
 * AI SDK Tool Definitions for PDF Document Operations
 *
 * These tools allow the AI chat agent to access PDF content stored in OPFS.
 * They execute directly in the renderer process with no IPC overhead.
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getNote } from './state.svelte';
import * as pdfOpfsStorage from './pdf-opfs-storage.svelte';
import type { PdfNoteProps, PdfOutlineItem } from './types';

// Configure PDF.js worker (using Vite's URL import for local bundling)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Token limits for safe context management
const TOKEN_LIMITS = {
  STRUCTURE_MAX: 5000, // Max tokens for outline responses
  CHUNK_DEFAULT: 10000, // Default chunk size
  CHUNK_MAX: 50000 // Hard max per request
};

// Estimate tokens from text (roughly 1 token per 3.5 characters)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// Truncate text to fit within token limit
function truncateToTokenLimit(
  text: string,
  maxTokens: number
): { text: string; truncated: boolean; originalTokens: number } {
  const originalTokens = estimateTokens(text);

  if (originalTokens <= maxTokens) {
    return { text, truncated: false, originalTokens };
  }

  // Truncate at word boundary
  const targetChars = maxTokens * 3.5;
  let truncateIndex = Math.floor(targetChars);

  // Find last space before target
  while (truncateIndex > 0 && text[truncateIndex] !== ' ') {
    truncateIndex--;
  }

  // If no space found, just truncate at target
  if (truncateIndex === 0) {
    truncateIndex = Math.floor(targetChars);
  }

  return {
    text: text.slice(0, truncateIndex) + '\n\n[Content truncated]',
    truncated: true,
    originalTokens
  };
}

// Types for document structure
interface OutlineItemWithTokens {
  label: string;
  pageNumber: number;
  estimatedTokens: number;
  children?: OutlineItemWithTokens[];
}

interface DocumentStructure {
  success: boolean;
  title: string;
  totalPages: number;
  structure: {
    type: 'outline' | 'page_chunks';
    items: OutlineItemWithTokens[];
  };
  totalEstimatedTokens: number;
  error?: string;
}

// Chunk reference types
type ChunkReference =
  | { type: 'page'; pageNumber: number }
  | { type: 'page_range'; startPage: number; endPage: number }
  | { type: 'full' };

interface DocumentChunk {
  success: boolean;
  chunkRef: ChunkReference;
  text: string;
  tokenCount: number;
  truncated: boolean;
  nextChunkRef?: ChunkReference;
  position: {
    current: string;
    total: string;
  };
  error?: string;
}

interface SearchResult {
  pageNumber: number;
  snippet: string;
  matchCount: number;
}

interface SearchResults {
  success: boolean;
  results: SearchResult[];
  totalMatches: number;
  error?: string;
}

// Get PDF document from note
async function getPdfDocFromNote(noteId: string): Promise<{
  pdfDoc: PDFDocumentProxy;
  props: PdfNoteProps;
  title: string;
} | null> {
  const note = getNote(noteId);
  if (!note) return null;

  const props = note.props as PdfNoteProps | undefined;
  if (!props?.pdfHash) return null;

  const data = await pdfOpfsStorage.retrieve(props.pdfHash);
  if (!data) return null;

  const loadingTask = pdfjsLib.getDocument({ data });
  const pdfDoc = await loadingTask.promise;

  return { pdfDoc, props, title: note.title };
}

// Extract text from a PDF page
async function extractPageText(
  pdfDoc: PDFDocumentProxy,
  pageNum: number
): Promise<string> {
  try {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const textItems = textContent.items
      .filter((item) => 'str' in item)
      .map((item) => (item as { str: string }).str);

    return textItems.join(' ').replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.warn(`[PDF Tools] Failed to extract text from page ${pageNum}:`, error);
    return '';
  }
}

// Parse PDF outline
async function parsePdfOutline(pdfDoc: PDFDocumentProxy): Promise<PdfOutlineItem[]> {
  try {
    const outline = await pdfDoc.getOutline();
    if (!outline) return [];

    const parseItems = async (
      items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>
    ): Promise<PdfOutlineItem[]> => {
      if (!items) return [];

      const result: PdfOutlineItem[] = [];

      for (const item of items) {
        let pageNumber = 1;

        if (item.dest) {
          try {
            let dest = item.dest;
            if (typeof dest === 'string') {
              const resolved = await pdfDoc.getDestination(dest);
              dest = resolved ?? [];
            }
            if (Array.isArray(dest) && dest[0]) {
              const pageRef = dest[0];
              const pageIndex = await pdfDoc.getPageIndex(pageRef);
              pageNumber = pageIndex + 1;
            }
          } catch {
            // Ignore destination parsing errors
          }
        }

        const outlineItem: PdfOutlineItem = {
          label: item.title || 'Untitled',
          pageNumber
        };

        if (item.items && item.items.length > 0) {
          outlineItem.children = await parseItems(item.items);
        }

        result.push(outlineItem);
      }

      return result;
    };

    return await parseItems(outline);
  } catch (error) {
    console.warn('[PDF Tools] Failed to parse outline:', error);
    return [];
  }
}

// Build outline with token estimates
async function buildOutlineWithEstimates(
  pdfDoc: PDFDocumentProxy,
  outline: PdfOutlineItem[]
): Promise<OutlineItemWithTokens[]> {
  const result: OutlineItemWithTokens[] = [];

  for (const item of outline) {
    // Estimate tokens for pages covered by this section
    const text = await extractPageText(pdfDoc, item.pageNumber);
    const estimatedTokens = estimateTokens(text);

    const itemWithTokens: OutlineItemWithTokens = {
      label: item.label,
      pageNumber: item.pageNumber,
      estimatedTokens
    };

    if (item.children && item.children.length > 0) {
      itemWithTokens.children = await buildOutlineWithEstimates(pdfDoc, item.children);
    }

    result.push(itemWithTokens);
  }

  return result;
}

/**
 * Get PDF document structure (outline with token estimates)
 */
async function getPdfDocumentStructure(noteId: string): Promise<DocumentStructure> {
  try {
    const pdfData = await getPdfDocFromNote(noteId);
    if (!pdfData) {
      return {
        success: false,
        title: '',
        totalPages: 0,
        structure: { type: 'outline', items: [] },
        totalEstimatedTokens: 0,
        error: 'PDF not found or not accessible'
      };
    }

    const { pdfDoc, title } = pdfData;
    const totalPages = pdfDoc.numPages;

    // Try to get outline
    const outline = await parsePdfOutline(pdfDoc);

    if (outline.length === 0) {
      // No outline - return page-based structure
      const items: OutlineItemWithTokens[] = [];
      let totalTokens = 0;

      for (let i = 1; i <= totalPages; i++) {
        const text = await extractPageText(pdfDoc, i);
        const tokens = estimateTokens(text);
        totalTokens += tokens;

        items.push({
          label: `Page ${i}`,
          pageNumber: i,
          estimatedTokens: tokens
        });
      }

      return {
        success: true,
        title,
        totalPages,
        structure: {
          type: 'page_chunks',
          items
        },
        totalEstimatedTokens: totalTokens
      };
    }

    // Build outline with token estimates
    const items = await buildOutlineWithEstimates(pdfDoc, outline);
    const totalTokens = items.reduce((sum, item) => sum + item.estimatedTokens, 0);

    return {
      success: true,
      title,
      totalPages,
      structure: {
        type: 'outline',
        items
      },
      totalEstimatedTokens: totalTokens
    };
  } catch (error) {
    return {
      success: false,
      title: '',
      totalPages: 0,
      structure: { type: 'outline', items: [] },
      totalEstimatedTokens: 0,
      error: error instanceof Error ? error.message : 'Failed to get document structure'
    };
  }
}

/**
 * Get text chunk from PDF
 */
async function getPdfDocumentChunk(
  noteId: string,
  chunkRef: ChunkReference,
  maxTokens: number = TOKEN_LIMITS.CHUNK_DEFAULT
): Promise<DocumentChunk> {
  // Enforce hard limit
  maxTokens = Math.min(maxTokens, TOKEN_LIMITS.CHUNK_MAX);

  try {
    const pdfData = await getPdfDocFromNote(noteId);
    if (!pdfData) {
      return {
        success: false,
        chunkRef,
        text: '',
        tokenCount: 0,
        truncated: false,
        position: { current: '', total: '' },
        error: 'PDF not found or not accessible'
      };
    }

    const { pdfDoc } = pdfData;
    const totalPages = pdfDoc.numPages;

    let text = '';
    let positionCurrent = '';
    let nextChunkRef: ChunkReference | undefined;

    if (chunkRef.type === 'page') {
      // Single page
      text = await extractPageText(pdfDoc, chunkRef.pageNumber);
      positionCurrent = `Page ${chunkRef.pageNumber}`;

      if (chunkRef.pageNumber < totalPages) {
        nextChunkRef = { type: 'page', pageNumber: chunkRef.pageNumber + 1 };
      }
    } else if (chunkRef.type === 'page_range') {
      // Page range
      const texts: string[] = [];
      for (let i = chunkRef.startPage; i <= Math.min(chunkRef.endPage, totalPages); i++) {
        const pageText = await extractPageText(pdfDoc, i);
        if (pageText) {
          texts.push(`[Page ${i}]\n${pageText}`);
        }
      }
      text = texts.join('\n\n');
      positionCurrent = `Pages ${chunkRef.startPage}-${Math.min(chunkRef.endPage, totalPages)}`;

      if (chunkRef.endPage < totalPages) {
        nextChunkRef = {
          type: 'page_range',
          startPage: chunkRef.endPage + 1,
          endPage: Math.min(
            chunkRef.endPage + (chunkRef.endPage - chunkRef.startPage + 1),
            totalPages
          )
        };
      }
    } else if (chunkRef.type === 'full') {
      // Full document
      const texts: string[] = [];
      for (let i = 1; i <= totalPages; i++) {
        const pageText = await extractPageText(pdfDoc, i);
        if (pageText) {
          texts.push(`[Page ${i}]\n${pageText}`);
        }
      }
      text = texts.join('\n\n');
      positionCurrent = 'Full document';
    }

    const { text: truncatedText, truncated } = truncateToTokenLimit(text, maxTokens);

    return {
      success: true,
      chunkRef,
      text: truncatedText,
      tokenCount: truncated ? maxTokens : estimateTokens(truncatedText),
      truncated,
      nextChunkRef,
      position: {
        current: positionCurrent,
        total: `${totalPages} pages`
      }
    };
  } catch (error) {
    return {
      success: false,
      chunkRef,
      text: '',
      tokenCount: 0,
      truncated: false,
      position: { current: '', total: '' },
      error: error instanceof Error ? error.message : 'Failed to get document chunk'
    };
  }
}

/**
 * Search for text within PDF
 */
async function searchPdfDocument(
  noteId: string,
  query: string,
  maxResults: number = 10
): Promise<SearchResults> {
  maxResults = Math.min(maxResults, 50);

  try {
    const pdfData = await getPdfDocFromNote(noteId);
    if (!pdfData) {
      return {
        success: false,
        results: [],
        totalMatches: 0,
        error: 'PDF not found or not accessible'
      };
    }

    const { pdfDoc } = pdfData;
    const results: SearchResult[] = [];
    let totalMatches = 0;
    const queryLower = query.toLowerCase();

    for (let i = 1; i <= pdfDoc.numPages && results.length < maxResults; i++) {
      const text = await extractPageText(pdfDoc, i);
      if (!text) continue;

      const textLower = text.toLowerCase();

      // Count matches on this page
      let matchCount = 0;
      let pos = 0;
      while ((pos = textLower.indexOf(queryLower, pos)) !== -1) {
        matchCount++;
        pos += queryLower.length;
      }

      if (matchCount > 0) {
        totalMatches += matchCount;

        // Get snippet around first match
        const firstMatchPos = textLower.indexOf(queryLower);
        const snippetStart = Math.max(0, firstMatchPos - 100);
        const snippetEnd = Math.min(text.length, firstMatchPos + query.length + 100);
        const snippet =
          (snippetStart > 0 ? '...' : '') +
          text.slice(snippetStart, snippetEnd) +
          (snippetEnd < text.length ? '...' : '');

        results.push({
          pageNumber: i,
          snippet,
          matchCount
        });
      }
    }

    return {
      success: true,
      results,
      totalMatches
    };
  } catch (error) {
    return {
      success: false,
      results: [],
      totalMatches: 0,
      error: error instanceof Error ? error.message : 'Failed to search document'
    };
  }
}

/**
 * Create PDF tools for the AI chat agent
 */
export function createPdfTools(): Record<string, Tool> {
  return {
    /**
     * Get PDF document structure (outline with token estimates)
     */
    get_pdf_structure: tool({
      description:
        'Get the structure (outline/table of contents) of a PDF document. Returns sections with page numbers and estimated token counts. Use this first to understand the document structure before reading specific pages.',
      inputSchema: z.object({
        noteId: z
          .string()
          .describe('The note ID of the PDF document (format: n-xxxxxxxx)')
      }),
      execute: async ({ noteId }) => {
        return await getPdfDocumentStructure(noteId);
      }
    }),

    /**
     * Get text from specific pages of a PDF
     */
    get_pdf_chunk: tool({
      description:
        'Get text content from specific pages of a PDF document. Use get_pdf_structure first to see available pages, then use this to read specific content.',
      inputSchema: z.object({
        noteId: z.string().describe('The note ID of the PDF document'),
        chunkType: z
          .enum(['page', 'page_range', 'full'])
          .describe(
            'Type of chunk: "page" for a single page, "page_range" for multiple pages, "full" for entire document'
          ),
        pageNumber: z
          .number()
          .optional()
          .describe('Page number for single page (required for "page" type, 1-indexed)'),
        startPage: z
          .number()
          .optional()
          .describe(
            'Start page for page range (required for "page_range" type, 1-indexed)'
          ),
        endPage: z
          .number()
          .optional()
          .describe(
            'End page for page range (required for "page_range" type, 1-indexed)'
          ),
        maxTokens: z
          .number()
          .optional()
          .default(TOKEN_LIMITS.CHUNK_DEFAULT)
          .describe(
            `Maximum tokens to return (default: ${TOKEN_LIMITS.CHUNK_DEFAULT}, max: ${TOKEN_LIMITS.CHUNK_MAX})`
          )
      }),
      execute: async ({
        noteId,
        chunkType,
        pageNumber,
        startPage,
        endPage,
        maxTokens
      }) => {
        let chunkRef: ChunkReference;

        if (chunkType === 'page') {
          if (pageNumber === undefined) {
            return {
              success: false,
              error: 'pageNumber is required for page type'
            };
          }
          chunkRef = { type: 'page', pageNumber };
        } else if (chunkType === 'page_range') {
          if (startPage === undefined || endPage === undefined) {
            return {
              success: false,
              error: 'startPage and endPage are required for page_range type'
            };
          }
          chunkRef = { type: 'page_range', startPage, endPage };
        } else {
          chunkRef = { type: 'full' };
        }

        return await getPdfDocumentChunk(noteId, chunkRef, maxTokens);
      }
    }),

    /**
     * Search for text within a PDF
     */
    search_pdf_text: tool({
      description:
        'Search for specific text within a PDF document. Returns page numbers and snippets showing where the text was found. Useful for finding specific topics, quotes, or references.',
      inputSchema: z.object({
        noteId: z.string().describe('The note ID of the PDF document'),
        query: z.string().describe('The text to search for'),
        maxResults: z
          .number()
          .optional()
          .default(10)
          .describe('Maximum number of results to return (default: 10, max: 50)')
      }),
      execute: async ({ noteId, query, maxResults }) => {
        return await searchPdfDocument(noteId, query, maxResults);
      }
    })
  };
}
