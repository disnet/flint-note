/**
 * AI SDK Tool Definitions for EPUB Document Operations
 *
 * These tools allow the AI chat agent to access EPUB content stored in OPFS.
 * They execute directly in the renderer process with no IPC overhead.
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { unzipSync } from 'fflate';
import { getNote } from './state.svelte';
import * as opfsStorage from './opfs-storage.svelte';
import type { EpubNoteProps } from './types';

// Token limits for safe context management
const TOKEN_LIMITS = {
  STRUCTURE_MAX: 5000, // Max tokens for TOC/outline responses
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

// Types for document structure
interface TocItem {
  index: number;
  label: string;
  href?: string;
  estimatedTokens: number;
  children?: TocItem[];
}

interface DocumentStructure {
  success: boolean;
  title: string;
  structure: {
    type: 'toc' | 'token_chunks';
    items: TocItem[];
    totalChunks?: number;
  };
  totalEstimatedTokens: number;
  error?: string;
}

// Chunk reference types
type ChunkReference =
  | { type: 'chapter'; index: number }
  | { type: 'token_chunk'; index: number }
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
  chunkRef: ChunkReference;
  snippet: string;
  matchCount: number;
}

interface SearchResults {
  success: boolean;
  results: SearchResult[];
  totalMatches: number;
  error?: string;
}

// Internal types for EPUB parsing
interface EpubSpineItem {
  id: string;
  href: string;
}

interface EpubTocEntry {
  label: string;
  href: string;
  children?: EpubTocEntry[];
}

// Parse EPUB from ArrayBuffer using fflate
function parseEpubZip(data: ArrayBuffer): Record<string, Uint8Array> {
  const uint8 = new Uint8Array(data);
  return unzipSync(uint8);
}

// Get file content from parsed zip as string
function getZipFileAsString(
  zip: Record<string, Uint8Array>,
  path: string
): string | null {
  const entry = zip[path];
  if (!entry) return null;
  return new TextDecoder().decode(entry);
}

// Parse EPUB structure (TOC and spine)
function parseEpubStructure(zip: Record<string, Uint8Array>): {
  toc: EpubTocEntry[];
  spine: EpubSpineItem[];
} {
  // Read container.xml to find content.opf
  const containerXml = getZipFileAsString(zip, 'META-INF/container.xml');
  if (!containerXml) {
    throw new Error('Invalid EPUB: container.xml not found');
  }

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'text/xml');
  const rootfileEl = containerDoc.querySelector('rootfile');
  const opfPath = rootfileEl?.getAttribute('full-path');

  if (!opfPath) {
    throw new Error('Invalid EPUB: could not find content.opf path');
  }

  // Read content.opf
  const opfXml = getZipFileAsString(zip, opfPath);
  if (!opfXml) {
    throw new Error(`Invalid EPUB: ${opfPath} not found`);
  }

  const opfDoc = parser.parseFromString(opfXml, 'text/xml');

  // Get the base directory for resolving relative paths
  const opfDir = opfPath.includes('/')
    ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
    : '';

  // Extract spine items
  const spine: EpubSpineItem[] = [];
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local variable in non-reactive context
  const manifest: Map<string, string> = new Map();

  // Build manifest map
  const manifestItems = opfDoc.querySelectorAll('manifest item');
  for (const item of manifestItems) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) {
      manifest.set(id, opfDir + href);
    }
  }

  // Build spine
  const spineItems = opfDoc.querySelectorAll('spine itemref');
  for (const itemref of spineItems) {
    const idref = itemref.getAttribute('idref');
    if (idref && manifest.has(idref)) {
      spine.push({
        id: idref,
        href: manifest.get(idref)!
      });
    }
  }

  // Try to find TOC
  let toc: EpubTocEntry[] = [];

  // Try EPUB 3 nav document first
  const navItem = opfDoc.querySelector('manifest item[properties*="nav"]');
  if (navItem) {
    const navHref = navItem.getAttribute('href');
    if (navHref) {
      const navPath = opfDir + navHref;
      const navHtml = getZipFileAsString(zip, navPath);
      if (navHtml) {
        toc = parseNavToc(navHtml, opfDir);
      }
    }
  }

  // Fall back to NCX if no nav toc found
  if (toc.length === 0) {
    const ncxItem = opfDoc.querySelector(
      'manifest item[media-type="application/x-dtbncx+xml"]'
    );
    if (ncxItem) {
      const ncxHref = ncxItem.getAttribute('href');
      if (ncxHref) {
        const ncxPath = opfDir + ncxHref;
        const ncxXml = getZipFileAsString(zip, ncxPath);
        if (ncxXml) {
          toc = parseNcxToc(ncxXml, opfDir);
        }
      }
    }
  }

  return { toc, spine };
}

function parseNavToc(navHtml: string, baseDir: string): EpubTocEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(navHtml, 'text/html');

  // Find the toc nav element
  const tocNav = doc.querySelector(
    'nav[epub\\:type="toc"], nav[role="doc-toc"], nav#toc'
  );
  if (!tocNav) {
    return [];
  }

  const parseList = (ol: Element): EpubTocEntry[] => {
    const entries: EpubTocEntry[] = [];
    const items = ol.querySelectorAll(':scope > li');

    for (const li of items) {
      const anchor = li.querySelector(':scope > a');
      if (!anchor) continue;

      const label = anchor.textContent?.trim() || '';
      const href = anchor.getAttribute('href') || '';

      const entry: EpubTocEntry = {
        label,
        href: baseDir + href
      };

      // Check for nested list
      const nestedOl = li.querySelector(':scope > ol');
      if (nestedOl) {
        entry.children = parseList(nestedOl);
      }

      entries.push(entry);
    }

    return entries;
  };

  const ol = tocNav.querySelector('ol');
  return ol ? parseList(ol) : [];
}

function parseNcxToc(ncxXml: string, baseDir: string): EpubTocEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(ncxXml, 'text/xml');

  const parseNavPoints = (parent: Element): EpubTocEntry[] => {
    const entries: EpubTocEntry[] = [];
    const navPoints = parent.querySelectorAll(':scope > navPoint');

    for (const navPoint of navPoints) {
      const labelEl = navPoint.querySelector(':scope > navLabel > text');
      const contentEl = navPoint.querySelector(':scope > content');

      const label = labelEl?.textContent?.trim() || '';
      const src = contentEl?.getAttribute('src') || '';

      const entry: EpubTocEntry = {
        label,
        href: baseDir + src
      };

      // Check for nested navPoints
      const nestedNavPoints = navPoint.querySelectorAll(':scope > navPoint');
      if (nestedNavPoints.length > 0) {
        entry.children = parseNavPoints(navPoint);
      }

      entries.push(entry);
    }

    return entries;
  };

  const navMap = doc.querySelector('navMap');
  return navMap ? parseNavPoints(navMap) : [];
}

// Extract text from HTML content in zip
function extractTextFromHtmlInZip(zip: Record<string, Uint8Array>, path: string): string {
  const html = getZipFileAsString(zip, path);
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return extractTextFromDom(doc.body);
}

// Extract all text from EPUB
function extractAllEpubText(
  zip: Record<string, Uint8Array>,
  spine: EpubSpineItem[]
): string {
  const texts: string[] = [];

  for (const item of spine) {
    const text = extractTextFromHtmlInZip(zip, item.href);
    if (text) {
      texts.push(text);
    }
  }

  return texts.join('\n\n');
}

// Build TOC items with token estimates
function buildTocItemsWithEstimates(
  zip: Record<string, Uint8Array>,
  toc: EpubTocEntry[]
): TocItem[] {
  const items: TocItem[] = [];
  let index = 0;

  const processEntry = (entry: EpubTocEntry): TocItem => {
    // Get href without fragment
    const hrefWithoutFragment = entry.href.split('#')[0];

    // Try to find and extract text for this chapter
    const text = extractTextFromHtmlInZip(zip, hrefWithoutFragment);
    const estimatedTokens = estimateTokens(text);

    const item: TocItem = {
      index: index++,
      label: entry.label,
      href: entry.href,
      estimatedTokens
    };

    if (entry.children && entry.children.length > 0) {
      item.children = entry.children.map((child) => processEntry(child));
    }

    return item;
  };

  for (const entry of toc) {
    items.push(processEntry(entry));
  }

  return items;
}

// Get EPUB props from note
async function getEpubDataFromNote(noteId: string): Promise<{
  zip: Record<string, Uint8Array>;
  props: EpubNoteProps;
  title: string;
} | null> {
  const note = getNote(noteId);
  if (!note) return null;

  const props = note.props as EpubNoteProps | undefined;
  if (!props?.epubHash) return null;

  const data = await opfsStorage.retrieve(props.epubHash);
  if (!data) return null;

  const zip = parseEpubZip(data);
  return { zip, props, title: note.title };
}

/**
 * Get EPUB document structure (TOC with token estimates)
 */
async function getEpubDocumentStructure(noteId: string): Promise<DocumentStructure> {
  try {
    const epubData = await getEpubDataFromNote(noteId);
    if (!epubData) {
      return {
        success: false,
        title: '',
        structure: { type: 'toc', items: [] },
        totalEstimatedTokens: 0,
        error: 'EPUB not found or not accessible'
      };
    }

    const { zip, title } = epubData;
    const { toc, spine } = parseEpubStructure(zip);

    // If no TOC or empty TOC, return token-chunked structure
    if (!toc || toc.length === 0) {
      const allText = extractAllEpubText(zip, spine);
      const totalTokens = estimateTokens(allText);
      const chunkCount = Math.ceil(totalTokens / TOKEN_LIMITS.CHUNK_DEFAULT);

      const items: TocItem[] = [];
      for (let i = 0; i < chunkCount; i++) {
        items.push({
          index: i,
          label: `Chunk ${i + 1}`,
          estimatedTokens: Math.min(
            TOKEN_LIMITS.CHUNK_DEFAULT,
            totalTokens - i * TOKEN_LIMITS.CHUNK_DEFAULT
          )
        });
      }

      return {
        success: true,
        title,
        structure: {
          type: 'token_chunks',
          items,
          totalChunks: chunkCount
        },
        totalEstimatedTokens: totalTokens
      };
    }

    // Build TOC items with token estimates
    const items = buildTocItemsWithEstimates(zip, toc);
    const totalTokens = items.reduce((sum, item) => sum + item.estimatedTokens, 0);

    return {
      success: true,
      title,
      structure: {
        type: 'toc',
        items
      },
      totalEstimatedTokens: totalTokens
    };
  } catch (error) {
    return {
      success: false,
      title: '',
      structure: { type: 'toc', items: [] },
      totalEstimatedTokens: 0,
      error: error instanceof Error ? error.message : 'Failed to get document structure'
    };
  }
}

/**
 * Get text chunk from EPUB
 */
async function getEpubDocumentChunk(
  noteId: string,
  chunkRef: ChunkReference,
  maxTokens: number = TOKEN_LIMITS.CHUNK_DEFAULT
): Promise<DocumentChunk> {
  // Enforce hard limit
  maxTokens = Math.min(maxTokens, TOKEN_LIMITS.CHUNK_MAX);

  try {
    const epubData = await getEpubDataFromNote(noteId);
    if (!epubData) {
      return {
        success: false,
        chunkRef,
        text: '',
        tokenCount: 0,
        truncated: false,
        position: { current: '', total: '' },
        error: 'EPUB not found or not accessible'
      };
    }

    const { zip } = epubData;
    const { toc, spine } = parseEpubStructure(zip);

    // Handle token_chunk type for flat EPUBs
    if (chunkRef.type === 'token_chunk') {
      const allText = extractAllEpubText(zip, spine);
      const chunkSize = TOKEN_LIMITS.CHUNK_DEFAULT * 3.5; // Convert tokens to chars
      const start = chunkRef.index * chunkSize;
      const end = start + chunkSize;
      const chunkText = allText.slice(start, end);

      const totalChunks = Math.ceil(allText.length / chunkSize);
      const { text, truncated } = truncateToTokenLimit(chunkText, maxTokens);

      return {
        success: true,
        chunkRef,
        text,
        tokenCount: truncated ? maxTokens : estimateTokens(text),
        truncated,
        nextChunkRef:
          chunkRef.index < totalChunks - 1
            ? { type: 'token_chunk', index: chunkRef.index + 1 }
            : undefined,
        position: {
          current: `Chunk ${chunkRef.index + 1}`,
          total: `${totalChunks} chunks`
        }
      };
    }

    // Handle chapter type
    if (chunkRef.type === 'chapter') {
      // Find the chapter in TOC
      let targetEntry: EpubTocEntry | null = null;
      let currentIndex = 0;

      const findEntry = (entries: EpubTocEntry[]): EpubTocEntry | null => {
        for (const entry of entries) {
          if (currentIndex === chunkRef.index) {
            return entry;
          }
          currentIndex++;
          if (entry.children) {
            const found = findEntry(entry.children);
            if (found) return found;
          }
        }
        return null;
      };

      targetEntry = findEntry(toc);

      if (!targetEntry) {
        return {
          success: false,
          chunkRef,
          text: '',
          tokenCount: 0,
          truncated: false,
          position: { current: '', total: '' },
          error: `Chapter index ${chunkRef.index} not found`
        };
      }

      // Extract text from the chapter file
      const hrefWithoutFragment = targetEntry.href.split('#')[0];
      const rawText = extractTextFromHtmlInZip(zip, hrefWithoutFragment);

      if (!rawText) {
        return {
          success: false,
          chunkRef,
          text: '',
          tokenCount: 0,
          truncated: false,
          position: { current: '', total: '' },
          error: `Chapter file not found: ${hrefWithoutFragment}`
        };
      }

      const { text, truncated } = truncateToTokenLimit(rawText, maxTokens);

      // Count total chapters
      let totalChapters = 0;
      const countEntries = (entries: EpubTocEntry[]): void => {
        for (const e of entries) {
          totalChapters++;
          if (e.children) countEntries(e.children);
        }
      };
      countEntries(toc);

      return {
        success: true,
        chunkRef,
        text,
        tokenCount: truncated ? maxTokens : estimateTokens(text),
        truncated,
        nextChunkRef:
          chunkRef.index < totalChapters - 1
            ? { type: 'chapter', index: chunkRef.index + 1 }
            : undefined,
        position: {
          current: `Chapter: ${targetEntry.label}`,
          total: `${totalChapters} chapters`
        }
      };
    }

    // Handle full type
    if (chunkRef.type === 'full') {
      const allText = extractAllEpubText(zip, spine);
      const { text, truncated, originalTokens } = truncateToTokenLimit(
        allText,
        maxTokens
      );

      return {
        success: true,
        chunkRef,
        text,
        tokenCount: truncated ? maxTokens : estimateTokens(text),
        truncated,
        position: {
          current: 'Full document',
          total: `~${originalTokens} tokens`
        }
      };
    }

    return {
      success: false,
      chunkRef,
      text: '',
      tokenCount: 0,
      truncated: false,
      position: { current: '', total: '' },
      error: 'Unsupported chunk reference type'
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
 * Search for text within EPUB
 */
async function searchEpubDocument(
  noteId: string,
  query: string,
  maxResults: number = 10
): Promise<SearchResults> {
  maxResults = Math.min(maxResults, 50);

  try {
    const epubData = await getEpubDataFromNote(noteId);
    if (!epubData) {
      return {
        success: false,
        results: [],
        totalMatches: 0,
        error: 'EPUB not found or not accessible'
      };
    }

    const { zip } = epubData;
    const { toc, spine } = parseEpubStructure(zip);

    const results: SearchResult[] = [];
    let totalMatches = 0;
    const queryLower = query.toLowerCase();

    // Search through spine items
    for (let i = 0; i < spine.length && results.length < maxResults; i++) {
      const item = spine[i];
      const text = extractTextFromHtmlInZip(zip, item.href);
      if (!text) continue;

      const textLower = text.toLowerCase();

      // Count matches in this section
      let matchCount = 0;
      let pos = 0;
      while ((pos = textLower.indexOf(queryLower, pos)) !== -1) {
        matchCount++;
        pos += queryLower.length;
      }

      if (matchCount > 0) {
        totalMatches += matchCount;

        // Find first match position for snippet
        const firstMatchPos = textLower.indexOf(queryLower);
        const snippetStart = Math.max(0, firstMatchPos - 100);
        const snippetEnd = Math.min(text.length, firstMatchPos + query.length + 100);
        const snippet =
          (snippetStart > 0 ? '...' : '') +
          text.slice(snippetStart, snippetEnd) +
          (snippetEnd < text.length ? '...' : '');

        // Try to find chapter index
        let chapterIndex = i; // Default to spine index
        if (toc.length > 0) {
          // Try to match spine item to TOC entry
          let currentIndex = 0;
          const findTocIndex = (entries: EpubTocEntry[]): number | null => {
            for (const tocEntry of entries) {
              const tocHref = tocEntry.href.split('#')[0];
              if (tocHref === item.href) {
                return currentIndex;
              }
              currentIndex++;
              if (tocEntry.children) {
                const found = findTocIndex(tocEntry.children);
                if (found !== null) return found;
              }
            }
            return null;
          };
          const tocIndex = findTocIndex(toc);
          if (tocIndex !== null) {
            chapterIndex = tocIndex;
          }
        }

        results.push({
          chunkRef:
            toc.length > 0
              ? { type: 'chapter', index: chapterIndex }
              : { type: 'token_chunk', index: i },
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
 * Create EPUB tools for the AI chat agent
 */
export function createEpubTools(): Record<string, Tool> {
  return {
    /**
     * Get EPUB document structure (TOC with token estimates)
     */
    get_document_structure: tool({
      description:
        'Get the structure (table of contents) of an EPUB book. Returns chapters with estimated token counts. Use this first to understand the book structure before reading specific chapters.',
      inputSchema: z.object({
        noteId: z.string().describe('The note ID of the EPUB book (format: n-xxxxxxxx)')
      }),
      execute: async ({ noteId }) => {
        return await getEpubDocumentStructure(noteId);
      }
    }),

    /**
     * Get text from a specific chunk of an EPUB
     */
    get_document_chunk: tool({
      description:
        'Get text content from a specific chapter or chunk of an EPUB book. Use get_document_structure first to see available chapters, then use this to read specific content.',
      inputSchema: z.object({
        noteId: z.string().describe('The note ID of the EPUB book'),
        chunkType: z
          .enum(['chapter', 'token_chunk', 'full'])
          .describe(
            'Type of chunk: "chapter" for TOC-based chapters, "token_chunk" for flat EPUBs, "full" for entire document'
          ),
        chunkIndex: z
          .number()
          .optional()
          .describe(
            'Index of the chapter or chunk (required for chapter and token_chunk types)'
          ),
        maxTokens: z
          .number()
          .optional()
          .default(TOKEN_LIMITS.CHUNK_DEFAULT)
          .describe(
            `Maximum tokens to return (default: ${TOKEN_LIMITS.CHUNK_DEFAULT}, max: ${TOKEN_LIMITS.CHUNK_MAX})`
          )
      }),
      execute: async ({ noteId, chunkType, chunkIndex, maxTokens }) => {
        let chunkRef: ChunkReference;

        if (chunkType === 'chapter') {
          if (chunkIndex === undefined) {
            return {
              success: false,
              error: 'chunkIndex is required for chapter type'
            };
          }
          chunkRef = { type: 'chapter', index: chunkIndex };
        } else if (chunkType === 'token_chunk') {
          if (chunkIndex === undefined) {
            return {
              success: false,
              error: 'chunkIndex is required for token_chunk type'
            };
          }
          chunkRef = { type: 'token_chunk', index: chunkIndex };
        } else {
          chunkRef = { type: 'full' };
        }

        return await getEpubDocumentChunk(noteId, chunkRef, maxTokens);
      }
    }),

    /**
     * Search for text within an EPUB
     */
    search_document_text: tool({
      description:
        'Search for specific text within an EPUB book. Returns snippets showing where the text was found. Useful for finding specific topics, quotes, or references.',
      inputSchema: z.object({
        noteId: z.string().describe('The note ID of the EPUB book'),
        query: z.string().describe('The text to search for'),
        maxResults: z
          .number()
          .optional()
          .default(10)
          .describe('Maximum number of results to return (default: 10, max: 50)')
      }),
      execute: async ({ noteId, query, maxResults }) => {
        return await searchEpubDocument(noteId, query, maxResults);
      }
    })
  };
}
