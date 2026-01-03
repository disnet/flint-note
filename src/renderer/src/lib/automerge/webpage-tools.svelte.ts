/**
 * AI SDK Tool Definitions for Archived Webpage Operations
 *
 * These tools allow the AI chat agent to access archived webpage content stored in OPFS.
 * They execute directly in the renderer process with no IPC overhead.
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { getNote } from './state.svelte';
import * as webpageOpfsStorage from './webpage-opfs-storage.svelte';
import type { WebpageNoteProps } from './types';

// Token limits for safe context management
const TOKEN_LIMITS = {
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

// Extract text from DOM element, preserving paragraph structure
function extractTextFromDom(element: Element): string {
  const blockTags = new Set([
    'p',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'li',
    'blockquote',
    'pre',
    'article',
    'section',
    'header',
    'footer',
    'aside',
    'main',
    'nav'
  ]);
  const results: string[] = [];

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        results.push(text);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();

      // Skip script and style elements
      if (tagName === 'script' || tagName === 'style') {
        return;
      }

      const isBlock = blockTags.has(tagName);

      if (isBlock && results.length > 0) {
        results.push('\n\n');
      }

      for (const child of el.childNodes) {
        walk(child);
      }

      if (isBlock && results.length > 0 && !results[results.length - 1].endsWith('\n')) {
        results.push('\n');
      }
    }
  }

  walk(element);

  // Clean up the result
  return results
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Extract text from HTML content string
function extractTextFromHtml(htmlContent: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  return extractTextFromDom(doc.body);
}

// Types for webpage sections
interface WebpageSection {
  index: number;
  heading: string;
  level: number;
  text: string;
  estimatedTokens: number;
}

// Extract sections from HTML based on headings
function extractSections(htmlContent: string): WebpageSection[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const body = doc.body;

  const sections: WebpageSection[] = [];
  const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

  // Find all headings
  const headings = body.querySelectorAll(headingTags.join(', '));

  if (headings.length === 0) {
    // No headings - return single section with all content
    const fullText = extractTextFromDom(body);
    return [
      {
        index: 0,
        heading: 'Content',
        level: 0,
        text: fullText,
        estimatedTokens: estimateTokens(fullText)
      }
    ];
  }

  // Extract content before first heading
  let currentNode: Node | null = body.firstChild;
  let preHeadingText = '';
  const firstHeading = headings[0];

  while (currentNode && currentNode !== firstHeading) {
    if (currentNode.nodeType === Node.ELEMENT_NODE) {
      const el = currentNode as Element;
      if (!headingTags.includes(el.tagName.toLowerCase())) {
        preHeadingText += extractTextFromDom(el) + '\n\n';
      }
    } else if (currentNode.nodeType === Node.TEXT_NODE) {
      const text = currentNode.textContent?.trim();
      if (text) {
        preHeadingText += text + '\n\n';
      }
    }
    currentNode = currentNode.nextSibling;
  }

  if (preHeadingText.trim()) {
    sections.push({
      index: 0,
      heading: 'Introduction',
      level: 0,
      text: preHeadingText.trim(),
      estimatedTokens: estimateTokens(preHeadingText)
    });
  }

  // Extract sections for each heading
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const headingText = heading.textContent?.trim() || `Section ${i + 1}`;
    const level = parseInt(heading.tagName.substring(1), 10);

    // Collect content until next heading
    let sectionText = '';
    let sibling: Node | null = heading.nextSibling;

    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE) {
        const el = sibling as Element;
        if (headingTags.includes(el.tagName.toLowerCase())) {
          break; // Next heading found
        }
        sectionText += extractTextFromDom(el) + '\n\n';
      } else if (sibling.nodeType === Node.TEXT_NODE) {
        const text = sibling.textContent?.trim();
        if (text) {
          sectionText += text + '\n\n';
        }
      }
      sibling = sibling.nextSibling;
    }

    sections.push({
      index: sections.length,
      heading: headingText,
      level,
      text: sectionText.trim(),
      estimatedTokens: estimateTokens(sectionText)
    });
  }

  return sections;
}

// Types for tool responses
interface WebpageInfo {
  success: boolean;
  title: string;
  url: string;
  siteName?: string;
  author?: string;
  excerpt?: string;
  archivedAt?: string;
  totalEstimatedTokens: number;
  hasSections: boolean;
  sectionCount?: number;
  sections?: Array<{ index: number; heading: string; estimatedTokens: number }>;
  error?: string;
}

type WebpageChunkReference =
  | { type: 'full' }
  | { type: 'section'; index: number }
  | { type: 'token_chunk'; index: number };

interface WebpageContent {
  success: boolean;
  chunkRef: WebpageChunkReference;
  text: string;
  tokenCount: number;
  truncated: boolean;
  nextChunkRef?: WebpageChunkReference;
  position: {
    current: string;
    total: string;
  };
  error?: string;
}

interface WebpageSearchResult {
  snippet: string;
  matchCount: number;
  sectionIndex?: number;
  sectionHeading?: string;
}

interface WebpageSearchResults {
  success: boolean;
  results: WebpageSearchResult[];
  totalMatches: number;
  error?: string;
}

// Get webpage data from note
async function getWebpageDataFromNote(noteId: string): Promise<{
  htmlContent: string;
  props: WebpageNoteProps;
  title: string;
} | null> {
  const note = getNote(noteId);
  if (!note) return null;

  const props = note.props as WebpageNoteProps | undefined;
  if (!props?.webpageHash) return null;

  const htmlContent = await webpageOpfsStorage.retrieve(props.webpageHash);
  if (!htmlContent) return null;

  return { htmlContent, props, title: note.title };
}

/**
 * Get webpage info (metadata and token estimate)
 */
async function getWebpageInfo(noteId: string): Promise<WebpageInfo> {
  try {
    const webpageData = await getWebpageDataFromNote(noteId);
    if (!webpageData) {
      return {
        success: false,
        title: '',
        url: '',
        totalEstimatedTokens: 0,
        hasSections: false,
        error: 'Webpage not found or not accessible'
      };
    }

    const { htmlContent, props, title } = webpageData;

    // Extract text and calculate tokens
    const textContent = extractTextFromHtml(htmlContent);
    const totalTokens = estimateTokens(textContent);

    // Check for sections (headings in content)
    const sections = extractSections(htmlContent);
    const hasSections = sections.length > 1;

    return {
      success: true,
      title: props.webpageTitle || title,
      url: props.webpageUrl,
      siteName: props.webpageSiteName,
      author: props.webpageAuthor,
      excerpt: props.webpageExcerpt,
      archivedAt: props.archivedAt,
      totalEstimatedTokens: totalTokens,
      hasSections,
      sectionCount: hasSections ? sections.length : undefined,
      sections: hasSections
        ? sections.map((s) => ({
            index: s.index,
            heading: s.heading,
            estimatedTokens: s.estimatedTokens
          }))
        : undefined
    };
  } catch (error) {
    return {
      success: false,
      title: '',
      url: '',
      totalEstimatedTokens: 0,
      hasSections: false,
      error: error instanceof Error ? error.message : 'Failed to get webpage info'
    };
  }
}

/**
 * Get text content from webpage
 */
async function getWebpageContent(
  noteId: string,
  chunkType: 'full' | 'section' | 'token_chunk',
  sectionIndex?: number,
  chunkIndex?: number,
  maxTokens: number = TOKEN_LIMITS.CHUNK_DEFAULT
): Promise<WebpageContent> {
  maxTokens = Math.min(maxTokens, TOKEN_LIMITS.CHUNK_MAX);

  try {
    const webpageData = await getWebpageDataFromNote(noteId);
    if (!webpageData) {
      return {
        success: false,
        chunkRef: { type: 'full' },
        text: '',
        tokenCount: 0,
        truncated: false,
        position: { current: '', total: '' },
        error: 'Webpage not found or not accessible'
      };
    }

    const { htmlContent } = webpageData;
    const fullText = extractTextFromHtml(htmlContent);

    if (chunkType === 'full') {
      const { text, truncated, originalTokens } = truncateToTokenLimit(
        fullText,
        maxTokens
      );
      return {
        success: true,
        chunkRef: { type: 'full' },
        text,
        tokenCount: truncated ? maxTokens : estimateTokens(text),
        truncated,
        position: {
          current: 'Full page',
          total: `~${originalTokens} tokens`
        }
      };
    }

    if (chunkType === 'section') {
      if (sectionIndex === undefined) {
        return {
          success: false,
          chunkRef: { type: 'section', index: 0 },
          text: '',
          tokenCount: 0,
          truncated: false,
          position: { current: '', total: '' },
          error: 'sectionIndex is required for section type'
        };
      }

      const sections = extractSections(htmlContent);
      if (sectionIndex >= sections.length) {
        return {
          success: false,
          chunkRef: { type: 'section', index: sectionIndex },
          text: '',
          tokenCount: 0,
          truncated: false,
          position: { current: '', total: '' },
          error: `Section index ${sectionIndex} not found (only ${sections.length} sections available)`
        };
      }

      const section = sections[sectionIndex];
      const { text, truncated } = truncateToTokenLimit(section.text, maxTokens);

      return {
        success: true,
        chunkRef: { type: 'section', index: sectionIndex },
        text,
        tokenCount: truncated ? maxTokens : estimateTokens(text),
        truncated,
        nextChunkRef:
          sectionIndex < sections.length - 1
            ? { type: 'section', index: sectionIndex + 1 }
            : undefined,
        position: {
          current: section.heading || `Section ${sectionIndex + 1}`,
          total: `${sections.length} sections`
        }
      };
    }

    if (chunkType === 'token_chunk') {
      if (chunkIndex === undefined) {
        return {
          success: false,
          chunkRef: { type: 'token_chunk', index: 0 },
          text: '',
          tokenCount: 0,
          truncated: false,
          position: { current: '', total: '' },
          error: 'chunkIndex is required for token_chunk type'
        };
      }

      const chunkSize = TOKEN_LIMITS.CHUNK_DEFAULT * 3.5; // tokens to chars
      const totalChunks = Math.ceil(fullText.length / chunkSize);

      if (chunkIndex >= totalChunks) {
        return {
          success: false,
          chunkRef: { type: 'token_chunk', index: chunkIndex },
          text: '',
          tokenCount: 0,
          truncated: false,
          position: { current: '', total: '' },
          error: `Chunk index ${chunkIndex} not found (only ${totalChunks} chunks available)`
        };
      }

      const start = chunkIndex * chunkSize;
      const end = start + chunkSize;
      const chunkText = fullText.slice(start, end);

      const { text, truncated } = truncateToTokenLimit(chunkText, maxTokens);

      return {
        success: true,
        chunkRef: { type: 'token_chunk', index: chunkIndex },
        text,
        tokenCount: truncated ? maxTokens : estimateTokens(text),
        truncated,
        nextChunkRef:
          chunkIndex < totalChunks - 1
            ? { type: 'token_chunk', index: chunkIndex + 1 }
            : undefined,
        position: {
          current: `Chunk ${chunkIndex + 1}`,
          total: `${totalChunks} chunks`
        }
      };
    }

    return {
      success: false,
      chunkRef: { type: 'full' },
      text: '',
      tokenCount: 0,
      truncated: false,
      position: { current: '', total: '' },
      error: 'Unsupported chunk type'
    };
  } catch (error) {
    return {
      success: false,
      chunkRef: { type: 'full' },
      text: '',
      tokenCount: 0,
      truncated: false,
      position: { current: '', total: '' },
      error: error instanceof Error ? error.message : 'Failed to get webpage content'
    };
  }
}

/**
 * Search for text within webpage
 */
async function searchWebpageContent(
  noteId: string,
  query: string,
  maxResults: number = 10
): Promise<WebpageSearchResults> {
  maxResults = Math.min(maxResults, 50);

  try {
    const webpageData = await getWebpageDataFromNote(noteId);
    if (!webpageData) {
      return {
        success: false,
        results: [],
        totalMatches: 0,
        error: 'Webpage not found or not accessible'
      };
    }

    const { htmlContent } = webpageData;
    const fullText = extractTextFromHtml(htmlContent);
    const textLower = fullText.toLowerCase();
    const queryLower = query.toLowerCase();

    // Count total matches
    let totalMatches = 0;
    let pos = 0;
    while ((pos = textLower.indexOf(queryLower, pos)) !== -1) {
      totalMatches++;
      pos += queryLower.length;
    }

    if (totalMatches === 0) {
      return {
        success: true,
        results: [],
        totalMatches: 0
      };
    }

    // Extract snippets around matches
    const results: WebpageSearchResult[] = [];
    const sections = extractSections(htmlContent);
    const hasSections = sections.length > 1;

    // Build character offset map for sections
    const charOffsets: number[] = [];
    if (hasSections) {
      let offset = 0;
      for (const section of sections) {
        charOffsets.push(offset);
        offset += section.text.length + 2; // +2 for paragraph breaks
      }
    }

    pos = 0;
    while (
      (pos = textLower.indexOf(queryLower, pos)) !== -1 &&
      results.length < maxResults
    ) {
      const snippetStart = Math.max(0, pos - 100);
      const snippetEnd = Math.min(fullText.length, pos + query.length + 100);
      const snippet =
        (snippetStart > 0 ? '...' : '') +
        fullText.slice(snippetStart, snippetEnd) +
        (snippetEnd < fullText.length ? '...' : '');

      // Try to identify which section this match is in
      let sectionIndex: number | undefined;
      let sectionHeading: string | undefined;
      if (hasSections) {
        for (let i = charOffsets.length - 1; i >= 0; i--) {
          if (pos >= charOffsets[i]) {
            sectionIndex = i;
            sectionHeading = sections[i].heading;
            break;
          }
        }
      }

      results.push({
        snippet,
        matchCount: 1,
        sectionIndex,
        sectionHeading
      });

      pos += query.length;
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
      error: error instanceof Error ? error.message : 'Failed to search webpage'
    };
  }
}

/**
 * Create webpage tools for the AI chat agent
 */
export function createWebpageTools(): Record<string, Tool> {
  return {
    /**
     * Get webpage info (metadata and token estimate)
     */
    get_webpage_info: tool({
      description:
        'Get information about an archived webpage including metadata (title, author, site, URL) and content token estimate. Use this first to understand the webpage before reading its content.',
      inputSchema: z.object({
        noteId: z
          .string()
          .describe('The note ID of the archived webpage (format: n-xxxxxxxx)')
      }),
      execute: async ({ noteId }) => {
        return await getWebpageInfo(noteId);
      }
    }),

    /**
     * Get text content from a webpage
     */
    get_webpage_content: tool({
      description:
        'Get text content from an archived webpage. Can retrieve full content or specific sections if the page has headings. Use get_webpage_info first to see content size and whether sections are available.',
      inputSchema: z.object({
        noteId: z.string().describe('The note ID of the archived webpage'),
        chunkType: z
          .enum(['full', 'section', 'token_chunk'])
          .describe(
            'Type of content to retrieve: "full" for entire page, "section" for a specific section (by index), "token_chunk" for token-based chunking of large content'
          ),
        sectionIndex: z
          .number()
          .optional()
          .describe('Section index to retrieve (required for "section" type, 0-indexed)'),
        chunkIndex: z
          .number()
          .optional()
          .describe(
            'Chunk index for token-based chunking (required for "token_chunk" type, 0-indexed)'
          ),
        maxTokens: z
          .number()
          .optional()
          .default(TOKEN_LIMITS.CHUNK_DEFAULT)
          .describe(
            `Maximum tokens to return (default: ${TOKEN_LIMITS.CHUNK_DEFAULT}, max: ${TOKEN_LIMITS.CHUNK_MAX})`
          )
      }),
      execute: async ({ noteId, chunkType, sectionIndex, chunkIndex, maxTokens }) => {
        return await getWebpageContent(
          noteId,
          chunkType,
          sectionIndex,
          chunkIndex,
          maxTokens
        );
      }
    }),

    /**
     * Search for text within a webpage
     */
    search_webpage_text: tool({
      description:
        'Search for specific text within an archived webpage. Returns snippets showing where the text was found. Useful for finding specific topics, quotes, or references.',
      inputSchema: z.object({
        noteId: z.string().describe('The note ID of the archived webpage'),
        query: z.string().describe('The text to search for'),
        maxResults: z
          .number()
          .optional()
          .default(10)
          .describe('Maximum number of results to return (default: 10, max: 50)')
      }),
      execute: async ({ noteId, query, maxResults }) => {
        return await searchWebpageContent(noteId, query, maxResults);
      }
    })
  };
}
