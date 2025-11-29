import { join } from 'path';
import { promises as fs } from 'fs';
import AdmZip from 'adm-zip';
import { JSDOM } from 'jsdom';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { NoteService } from './note-service';
import { logger } from './logger';
import type { NoteKind } from '../server/core/system-fields';

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
    if (node.nodeType === 3) {
      // Text node
      const text = node.textContent?.trim();
      if (text) {
        results.push(text);
      }
    } else if (node.nodeType === 1) {
      // Element node
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
    .replace(/\n{3,}/g, '\n\n') // Max 2 newlines in a row
    .trim();
}

// Types for document structure
export interface TocItem {
  index: number;
  label: string;
  href?: string; // For EPUB chapters
  pageNumber?: number; // For PDF pages
  estimatedTokens: number;
  children?: TocItem[];
}

export interface DocumentStructure {
  success: boolean;
  documentType: NoteKind;
  title: string;
  structure: {
    type: 'toc' | 'outline' | 'single' | 'token_chunks';
    items: TocItem[];
    totalPages?: number; // PDF only
    totalChunks?: number; // For token-chunked content
  };
  totalEstimatedTokens: number;
  error?: string;
}

// Chunk reference types
export type ChunkReference =
  | { type: 'chapter'; index: number }
  | { type: 'page'; pageNumber: number }
  | { type: 'pages'; start: number; end: number }
  | { type: 'full' }
  | { type: 'token_chunk'; index: number }; // For flat EPUBs split by tokens

export interface DocumentChunk {
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

export interface SearchResult {
  chunkRef: ChunkReference;
  snippet: string;
  matchCount: number;
}

export interface SearchResults {
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

export class DocumentTextService {
  constructor(private noteService: NoteService) {}

  /**
   * Get document structure (TOC/outline) for a document note
   */
  async getDocumentStructure(noteId: string): Promise<DocumentStructure> {
    try {
      const { note, vaultPath } = await this.getNoteAndVaultPath(noteId);
      const kind = note.kind;

      if (kind === 'markdown') {
        return {
          success: false,
          documentType: kind,
          title: note.title,
          structure: { type: 'single', items: [] },
          totalEstimatedTokens: 0,
          error: 'Markdown notes do not have document structure. Use get_note instead.'
        };
      }

      switch (kind) {
        case 'epub':
          return await this.getEpubStructure(note, vaultPath);
        case 'pdf':
          return await this.getPdfStructure(note, vaultPath);
        case 'webpage':
          return await this.getWebpageStructure(note, vaultPath);
        default:
          return {
            success: false,
            documentType: kind,
            title: note.title,
            structure: { type: 'single', items: [] },
            totalEstimatedTokens: 0,
            error: `Unknown document type: ${kind}`
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get document structure', { noteId, error: errorMessage });
      return {
        success: false,
        documentType: 'markdown',
        title: '',
        structure: { type: 'single', items: [] },
        totalEstimatedTokens: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Get text from a specific chunk of a document
   */
  async getDocumentChunk(
    noteId: string,
    chunkRef: ChunkReference,
    maxTokens: number = TOKEN_LIMITS.CHUNK_DEFAULT
  ): Promise<DocumentChunk> {
    // Enforce hard limit
    maxTokens = Math.min(maxTokens, TOKEN_LIMITS.CHUNK_MAX);

    try {
      const { note, vaultPath } = await this.getNoteAndVaultPath(noteId);
      const kind = note.kind;

      if (kind === 'markdown') {
        return {
          success: false,
          chunkRef,
          text: '',
          tokenCount: 0,
          truncated: false,
          position: { current: '', total: '' },
          error: 'Markdown notes do not support chunk retrieval. Use get_note instead.'
        };
      }

      switch (kind) {
        case 'epub':
          return await this.getEpubChunk(note, vaultPath, chunkRef, maxTokens);
        case 'pdf':
          return await this.getPdfChunk(note, vaultPath, chunkRef, maxTokens);
        case 'webpage':
          return await this.getWebpageChunk(note, vaultPath, chunkRef, maxTokens);
        default:
          return {
            success: false,
            chunkRef,
            text: '',
            tokenCount: 0,
            truncated: false,
            position: { current: '', total: '' },
            error: `Unknown document type: ${kind}`
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get document chunk', {
        noteId,
        chunkRef,
        error: errorMessage
      });
      return {
        success: false,
        chunkRef,
        text: '',
        tokenCount: 0,
        truncated: false,
        position: { current: '', total: '' },
        error: errorMessage
      };
    }
  }

  /**
   * Search for text within a document
   */
  async searchDocument(
    noteId: string,
    query: string,
    maxResults: number = 10
  ): Promise<SearchResults> {
    maxResults = Math.min(maxResults, 50);

    try {
      const { note, vaultPath } = await this.getNoteAndVaultPath(noteId);
      const kind = note.kind;

      if (kind === 'markdown') {
        return {
          success: false,
          results: [],
          totalMatches: 0,
          error:
            'Markdown notes do not support document search. Use search_notes instead.'
        };
      }

      switch (kind) {
        case 'epub':
          return await this.searchEpub(note, vaultPath, query, maxResults);
        case 'pdf':
          return await this.searchPdf(note, vaultPath, query, maxResults);
        case 'webpage':
          return await this.searchWebpage(note, vaultPath, query, maxResults);
        default:
          return {
            success: false,
            results: [],
            totalMatches: 0,
            error: `Unknown document type: ${kind}`
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to search document', { noteId, query, error: errorMessage });
      return {
        success: false,
        results: [],
        totalMatches: 0,
        error: errorMessage
      };
    }
  }

  // ============================================
  // Private helper methods
  // ============================================

  private async getNoteAndVaultPath(noteId: string): Promise<{
    note: { kind: NoteKind; title: string; metadata: Record<string, unknown> };
    vaultPath: string;
  }> {
    const currentVault = await this.noteService.getCurrentVault();
    if (!currentVault) {
      throw new Error('No vault available');
    }

    const flintApi = this.noteService.getFlintNoteApi();
    const note = await flintApi.getNote(currentVault.id, noteId);

    return {
      note: {
        kind: note.kind,
        title: note.title,
        metadata: note.metadata as Record<string, unknown>
      },
      vaultPath: currentVault.path
    };
  }

  // ============================================
  // EPUB Implementation
  // ============================================

  private async getEpubStructure(
    note: { kind: NoteKind; title: string; metadata: Record<string, unknown> },
    vaultPath: string
  ): Promise<DocumentStructure> {
    const epubPath = note.metadata.flint_epubPath as string;
    if (!epubPath) {
      return {
        success: false,
        documentType: 'epub',
        title: note.title,
        structure: { type: 'toc', items: [] },
        totalEstimatedTokens: 0,
        error: 'EPUB path not found in note metadata'
      };
    }

    const fullPath = join(vaultPath, epubPath);
    const zip = new AdmZip(fullPath);

    // Parse EPUB structure
    const { toc, spine } = await this.parseEpubStructure(zip);

    // If no TOC or empty TOC, return token-chunked structure
    if (!toc || toc.length === 0) {
      // Extract all text and estimate chunks
      const allText = await this.extractAllEpubText(zip, spine);
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
        documentType: 'epub',
        title: note.title,
        structure: {
          type: 'token_chunks',
          items,
          totalChunks: chunkCount
        },
        totalEstimatedTokens: totalTokens
      };
    }

    // Build TOC items with token estimates
    const items = await this.buildTocItemsWithEstimates(zip, toc);
    const totalTokens = items.reduce((sum, item) => sum + item.estimatedTokens, 0);

    return {
      success: true,
      documentType: 'epub',
      title: note.title,
      structure: {
        type: 'toc',
        items
      },
      totalEstimatedTokens: totalTokens
    };
  }

  private async parseEpubStructure(
    zip: AdmZip
  ): Promise<{ toc: EpubTocEntry[]; spine: EpubSpineItem[] }> {
    // Read container.xml to find content.opf
    const containerEntry = zip.getEntry('META-INF/container.xml');
    if (!containerEntry) {
      throw new Error('Invalid EPUB: container.xml not found');
    }

    const containerXml = containerEntry.getData().toString('utf8');
    const containerDom = new JSDOM(containerXml, { contentType: 'text/xml' });
    const rootfileEl = containerDom.window.document.querySelector('rootfile');
    const opfPath = rootfileEl?.getAttribute('full-path');

    if (!opfPath) {
      throw new Error('Invalid EPUB: could not find content.opf path');
    }

    // Read content.opf
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) {
      throw new Error(`Invalid EPUB: ${opfPath} not found`);
    }

    const opfXml = opfEntry.getData().toString('utf8');
    const opfDom = new JSDOM(opfXml, { contentType: 'text/xml' });
    const opfDoc = opfDom.window.document;

    // Get the base directory for resolving relative paths
    const opfDir = opfPath.includes('/')
      ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
      : '';

    // Extract spine items
    const spine: EpubSpineItem[] = [];
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
        const navEntry = zip.getEntry(navPath);
        if (navEntry) {
          const navHtml = navEntry.getData().toString('utf8');
          toc = this.parseNavToc(navHtml, opfDir);
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
          const ncxEntry = zip.getEntry(ncxPath);
          if (ncxEntry) {
            const ncxXml = ncxEntry.getData().toString('utf8');
            toc = this.parseNcxToc(ncxXml, opfDir);
          }
        }
      }
    }

    return { toc, spine };
  }

  private parseNavToc(navHtml: string, baseDir: string): EpubTocEntry[] {
    const dom = new JSDOM(navHtml);
    const doc = dom.window.document;

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

  private parseNcxToc(ncxXml: string, baseDir: string): EpubTocEntry[] {
    const dom = new JSDOM(ncxXml, { contentType: 'text/xml' });
    const doc = dom.window.document;

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

  private async buildTocItemsWithEstimates(
    zip: AdmZip,
    toc: EpubTocEntry[]
  ): Promise<TocItem[]> {
    const items: TocItem[] = [];
    let index = 0;

    const processEntry = async (
      entry: EpubTocEntry,
      depth: number = 0
    ): Promise<TocItem> => {
      // Get href without fragment
      const hrefWithoutFragment = entry.href.split('#')[0];

      // Try to find and extract text for this chapter
      let estimatedTokens = 0;
      const entryFile = zip.getEntry(hrefWithoutFragment);
      if (entryFile) {
        try {
          const html = entryFile.getData().toString('utf8');
          const dom = new JSDOM(html);
          const text = extractTextFromDom(dom.window.document.body);
          estimatedTokens = estimateTokens(text);
        } catch {
          // Ignore extraction errors
        }
      }

      const item: TocItem = {
        index: index++,
        label: entry.label,
        href: entry.href,
        estimatedTokens
      };

      if (entry.children && entry.children.length > 0) {
        item.children = [];
        for (const child of entry.children) {
          item.children.push(await processEntry(child, depth + 1));
        }
      }

      return item;
    };

    for (const entry of toc) {
      items.push(await processEntry(entry));
    }

    return items;
  }

  private async extractAllEpubText(zip: AdmZip, spine: EpubSpineItem[]): Promise<string> {
    const texts: string[] = [];

    for (const item of spine) {
      const entry = zip.getEntry(item.href);
      if (entry) {
        try {
          const html = entry.getData().toString('utf8');
          const dom = new JSDOM(html);
          const text = extractTextFromDom(dom.window.document.body);
          if (text) {
            texts.push(text);
          }
        } catch {
          // Ignore extraction errors
        }
      }
    }

    return texts.join('\n\n');
  }

  private async getEpubChunk(
    note: { kind: NoteKind; title: string; metadata: Record<string, unknown> },
    vaultPath: string,
    chunkRef: ChunkReference,
    maxTokens: number
  ): Promise<DocumentChunk> {
    const epubPath = note.metadata.flint_epubPath as string;
    if (!epubPath) {
      return {
        success: false,
        chunkRef,
        text: '',
        tokenCount: 0,
        truncated: false,
        position: { current: '', total: '' },
        error: 'EPUB path not found in note metadata'
      };
    }

    const fullPath = join(vaultPath, epubPath);
    const zip = new AdmZip(fullPath);
    const { toc, spine } = await this.parseEpubStructure(zip);

    // Handle token_chunk type for flat EPUBs
    if (chunkRef.type === 'token_chunk') {
      const allText = await this.extractAllEpubText(zip, spine);
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
      const entry = zip.getEntry(hrefWithoutFragment);

      if (!entry) {
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

      const html = entry.getData().toString('utf8');
      const dom = new JSDOM(html);
      const rawText = extractTextFromDom(dom.window.document.body);
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
      const allText = await this.extractAllEpubText(zip, spine);
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
      error: `Unsupported chunk reference type for EPUB: ${(chunkRef as { type: string }).type}`
    };
  }

  private async searchEpub(
    note: { kind: NoteKind; title: string; metadata: Record<string, unknown> },
    vaultPath: string,
    query: string,
    maxResults: number
  ): Promise<SearchResults> {
    const epubPath = note.metadata.flint_epubPath as string;
    if (!epubPath) {
      return {
        success: false,
        results: [],
        totalMatches: 0,
        error: 'EPUB path not found in note metadata'
      };
    }

    const fullPath = join(vaultPath, epubPath);
    const zip = new AdmZip(fullPath);
    const { toc, spine } = await this.parseEpubStructure(zip);

    const results: SearchResult[] = [];
    let totalMatches = 0;
    const queryLower = query.toLowerCase();

    // Search through spine items
    for (let i = 0; i < spine.length && results.length < maxResults; i++) {
      const item = spine[i];
      const entry = zip.getEntry(item.href);
      if (!entry) continue;

      try {
        const html = entry.getData().toString('utf8');
        const dom = new JSDOM(html);
        const text = extractTextFromDom(dom.window.document.body);
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
      } catch {
        // Ignore extraction errors
      }
    }

    return {
      success: true,
      results,
      totalMatches
    };
  }

  // ============================================
  // PDF Implementation
  // ============================================

  private async getPdfStructure(
    note: { kind: NoteKind; title: string; metadata: Record<string, unknown> },
    vaultPath: string
  ): Promise<DocumentStructure> {
    const pdfPath = note.metadata.flint_pdfPath as string;
    if (!pdfPath) {
      return {
        success: false,
        documentType: 'pdf',
        title: note.title,
        structure: { type: 'outline', items: [] },
        totalEstimatedTokens: 0,
        error: 'PDF path not found in note metadata'
      };
    }

    const fullPath = join(vaultPath, pdfPath);
    const buffer = await fs.readFile(fullPath);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

    const totalPages = doc.numPages;
    const outline = await doc.getOutline();

    // Estimate tokens per page (rough estimate)
    const tokensPerPage = 500; // Conservative estimate

    const items: TocItem[] = [];

    if (outline && outline.length > 0) {
      // Build structure from outline
      let index = 0;

      const processOutlineItem = async (item: {
        title: string;
        dest?: unknown;
        items?: unknown[];
      }): Promise<TocItem> => {
        let pageNumber: number | undefined;

        // Try to get page number from destination
        if (item.dest) {
          try {
            const dest = Array.isArray(item.dest)
              ? item.dest
              : await doc.getDestination(item.dest as string);
            if (dest && Array.isArray(dest)) {
              const ref = dest[0];
              pageNumber = (await doc.getPageIndex(ref)) + 1;
            }
          } catch {
            // Ignore destination resolution errors
          }
        }

        const tocItem: TocItem = {
          index: index++,
          label: item.title,
          pageNumber,
          estimatedTokens: tokensPerPage
        };

        if (item.items && Array.isArray(item.items) && item.items.length > 0) {
          tocItem.children = [];
          for (const child of item.items) {
            tocItem.children.push(
              await processOutlineItem(
                child as { title: string; dest?: unknown; items?: unknown[] }
              )
            );
          }
        }

        return tocItem;
      };

      for (const item of outline) {
        items.push(
          await processOutlineItem(
            item as { title: string; dest?: unknown; items?: unknown[] }
          )
        );
      }
    } else {
      // No outline, create page-based structure
      for (let i = 1; i <= totalPages; i++) {
        items.push({
          index: i - 1,
          label: `Page ${i}`,
          pageNumber: i,
          estimatedTokens: tokensPerPage
        });
      }
    }

    await doc.destroy();

    return {
      success: true,
      documentType: 'pdf',
      title: note.title,
      structure: {
        type: outline && outline.length > 0 ? 'outline' : 'single',
        items,
        totalPages
      },
      totalEstimatedTokens: totalPages * tokensPerPage
    };
  }

  private async getPdfChunk(
    note: { kind: NoteKind; title: string; metadata: Record<string, unknown> },
    vaultPath: string,
    chunkRef: ChunkReference,
    maxTokens: number
  ): Promise<DocumentChunk> {
    const pdfPath = note.metadata.flint_pdfPath as string;
    if (!pdfPath) {
      return {
        success: false,
        chunkRef,
        text: '',
        tokenCount: 0,
        truncated: false,
        position: { current: '', total: '' },
        error: 'PDF path not found in note metadata'
      };
    }

    const fullPath = join(vaultPath, pdfPath);
    const buffer = await fs.readFile(fullPath);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const totalPages = doc.numPages;

    try {
      if (chunkRef.type === 'page') {
        const pageNum = chunkRef.pageNumber;
        if (pageNum < 1 || pageNum > totalPages) {
          return {
            success: false,
            chunkRef,
            text: '',
            tokenCount: 0,
            truncated: false,
            position: { current: '', total: '' },
            error: `Page ${pageNum} out of range (1-${totalPages})`
          };
        }

        const text = await this.extractPdfPageText(doc, pageNum);
        const { text: truncatedText, truncated } = truncateToTokenLimit(text, maxTokens);

        return {
          success: true,
          chunkRef,
          text: truncatedText,
          tokenCount: truncated ? maxTokens : estimateTokens(truncatedText),
          truncated,
          nextChunkRef:
            pageNum < totalPages ? { type: 'page', pageNumber: pageNum + 1 } : undefined,
          position: {
            current: `Page ${pageNum}`,
            total: `${totalPages} pages`
          }
        };
      }

      if (chunkRef.type === 'pages') {
        const start = Math.max(1, chunkRef.start);
        const end = Math.min(totalPages, chunkRef.end);

        const texts: string[] = [];
        for (let i = start; i <= end; i++) {
          const pageText = await this.extractPdfPageText(doc, i);
          texts.push(`--- Page ${i} ---\n${pageText}`);
        }

        const combinedText = texts.join('\n\n');
        const { text: truncatedText, truncated } = truncateToTokenLimit(
          combinedText,
          maxTokens
        );

        return {
          success: true,
          chunkRef,
          text: truncatedText,
          tokenCount: truncated ? maxTokens : estimateTokens(truncatedText),
          truncated,
          nextChunkRef:
            end < totalPages
              ? {
                  type: 'pages',
                  start: end + 1,
                  end: Math.min(totalPages, end + (end - start + 1))
                }
              : undefined,
          position: {
            current: `Pages ${start}-${end}`,
            total: `${totalPages} pages`
          }
        };
      }

      if (chunkRef.type === 'full') {
        const texts: string[] = [];
        for (let i = 1; i <= totalPages; i++) {
          const pageText = await this.extractPdfPageText(doc, i);
          texts.push(`--- Page ${i} ---\n${pageText}`);
        }

        const combinedText = texts.join('\n\n');
        const {
          text: truncatedText,
          truncated,
          originalTokens
        } = truncateToTokenLimit(combinedText, maxTokens);

        return {
          success: true,
          chunkRef,
          text: truncatedText,
          tokenCount: truncated ? maxTokens : estimateTokens(truncatedText),
          truncated,
          position: {
            current: 'Full document',
            total: `${totalPages} pages (~${originalTokens} tokens)`
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
        error: `Unsupported chunk reference type for PDF: ${(chunkRef as { type: string }).type}`
      };
    } finally {
      await doc.destroy();
    }
  }

  private async extractPdfPageText(
    doc: pdfjs.PDFDocumentProxy,
    pageNum: number
  ): Promise<string> {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Join text items with appropriate spacing
    const items = textContent.items as Array<{ str: string; transform?: number[] }>;
    const lines: string[] = [];
    let currentLine: string[] = [];
    let lastY: number | null = null;

    for (const item of items) {
      const y = item.transform ? item.transform[5] : null;

      // Check if we're on a new line (Y position changed significantly)
      if (lastY !== null && y !== null && Math.abs(lastY - y) > 5) {
        if (currentLine.length > 0) {
          lines.push(currentLine.join(' '));
          currentLine = [];
        }
      }

      if (item.str.trim()) {
        currentLine.push(item.str);
      }

      lastY = y;
    }

    // Don't forget the last line
    if (currentLine.length > 0) {
      lines.push(currentLine.join(' '));
    }

    return lines.join('\n');
  }

  private async searchPdf(
    note: { kind: NoteKind; title: string; metadata: Record<string, unknown> },
    vaultPath: string,
    query: string,
    maxResults: number
  ): Promise<SearchResults> {
    const pdfPath = note.metadata.flint_pdfPath as string;
    if (!pdfPath) {
      return {
        success: false,
        results: [],
        totalMatches: 0,
        error: 'PDF path not found in note metadata'
      };
    }

    const fullPath = join(vaultPath, pdfPath);
    const buffer = await fs.readFile(fullPath);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const totalPages = doc.numPages;

    const results: SearchResult[] = [];
    let totalMatches = 0;
    const queryLower = query.toLowerCase();

    try {
      for (let i = 1; i <= totalPages && results.length < maxResults; i++) {
        const text = await this.extractPdfPageText(doc, i);
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

          // Find first match position for snippet
          const firstMatchPos = textLower.indexOf(queryLower);
          const snippetStart = Math.max(0, firstMatchPos - 100);
          const snippetEnd = Math.min(text.length, firstMatchPos + query.length + 100);
          const snippet =
            (snippetStart > 0 ? '...' : '') +
            text.slice(snippetStart, snippetEnd) +
            (snippetEnd < text.length ? '...' : '');

          results.push({
            chunkRef: { type: 'page', pageNumber: i },
            snippet,
            matchCount
          });
        }
      }
    } finally {
      await doc.destroy();
    }

    return {
      success: true,
      results,
      totalMatches
    };
  }

  // ============================================
  // Webpage Implementation
  // ============================================

  private async getWebpageStructure(
    note: { kind: NoteKind; title: string; metadata: Record<string, unknown> },
    vaultPath: string
  ): Promise<DocumentStructure> {
    const webpagePath = note.metadata.flint_webpagePath as string;
    if (!webpagePath) {
      return {
        success: false,
        documentType: 'webpage',
        title: note.title,
        structure: { type: 'single', items: [] },
        totalEstimatedTokens: 0,
        error: 'Webpage path not found in note metadata'
      };
    }

    const fullPath = join(vaultPath, webpagePath);
    const html = await fs.readFile(fullPath, 'utf8');
    const dom = new JSDOM(html);
    const text = extractTextFromDom(dom.window.document.body);
    const totalTokens = estimateTokens(text);

    // Webpages are typically small enough to be a single chunk
    return {
      success: true,
      documentType: 'webpage',
      title: note.title,
      structure: {
        type: 'single',
        items: [
          {
            index: 0,
            label: 'Full article',
            estimatedTokens: totalTokens
          }
        ]
      },
      totalEstimatedTokens: totalTokens
    };
  }

  private async getWebpageChunk(
    note: { kind: NoteKind; title: string; metadata: Record<string, unknown> },
    vaultPath: string,
    chunkRef: ChunkReference,
    maxTokens: number
  ): Promise<DocumentChunk> {
    const webpagePath = note.metadata.flint_webpagePath as string;
    if (!webpagePath) {
      return {
        success: false,
        chunkRef,
        text: '',
        tokenCount: 0,
        truncated: false,
        position: { current: '', total: '' },
        error: 'Webpage path not found in note metadata'
      };
    }

    const fullPath = join(vaultPath, webpagePath);
    const html = await fs.readFile(fullPath, 'utf8');
    const dom = new JSDOM(html);
    const rawText = extractTextFromDom(dom.window.document.body);

    const { text, truncated, originalTokens } = truncateToTokenLimit(rawText, maxTokens);

    return {
      success: true,
      chunkRef: { type: 'full' },
      text,
      tokenCount: truncated ? maxTokens : estimateTokens(text),
      truncated,
      position: {
        current: 'Full article',
        total: `~${originalTokens} tokens`
      }
    };
  }

  private async searchWebpage(
    note: { kind: NoteKind; title: string; metadata: Record<string, unknown> },
    vaultPath: string,
    query: string,
    maxResults: number
  ): Promise<SearchResults> {
    const webpagePath = note.metadata.flint_webpagePath as string;
    if (!webpagePath) {
      return {
        success: false,
        results: [],
        totalMatches: 0,
        error: 'Webpage path not found in note metadata'
      };
    }

    const fullPath = join(vaultPath, webpagePath);
    const html = await fs.readFile(fullPath, 'utf8');
    const dom = new JSDOM(html);
    const text = extractTextFromDom(dom.window.document.body);
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();

    // Count all matches
    let totalMatches = 0;
    let pos = 0;
    const matchPositions: number[] = [];
    while ((pos = textLower.indexOf(queryLower, pos)) !== -1) {
      totalMatches++;
      matchPositions.push(pos);
      pos += queryLower.length;
    }

    // Create result snippets for up to maxResults matches
    const results: SearchResult[] = [];
    for (let i = 0; i < Math.min(matchPositions.length, maxResults); i++) {
      const matchPos = matchPositions[i];
      const snippetStart = Math.max(0, matchPos - 100);
      const snippetEnd = Math.min(text.length, matchPos + query.length + 100);
      const snippet =
        (snippetStart > 0 ? '...' : '') +
        text.slice(snippetStart, snippetEnd) +
        (snippetEnd < text.length ? '...' : '');

      results.push({
        chunkRef: { type: 'full' },
        snippet,
        matchCount: 1
      });
    }

    return {
      success: true,
      results,
      totalMatches
    };
  }
}
