/**
 * Rich paste extension for CodeMirror 6
 *
 * Converts HTML clipboard content to markdown when pasting.
 * Handles content from webpages, Google Docs, Word, and other rich text sources.
 */
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/**
 * Context for tracking state during HTML-to-markdown conversion
 */
interface ConversionContext {
  /** Current list nesting depth (0 = not in a list) */
  listDepth: number;
  /** Whether the current list is ordered (at each depth level) */
  orderedAtDepth: boolean[];
  /** Counter for ordered list items at each depth */
  orderedCounters: number[];
  /** Whether we're inside a code block */
  inCodeBlock: boolean;
  /** Whether we're inside a blockquote */
  inBlockquote: boolean;
}

/**
 * Create initial conversion context
 */
function createContext(): ConversionContext {
  return {
    listDepth: 0,
    orderedAtDepth: [],
    orderedCounters: [],
    inCodeBlock: false,
    inBlockquote: false
  };
}

/**
 * Clean DOM before conversion - remove scripts, styles, etc.
 */
function cleanDom(element: Element): void {
  const toRemove = element.querySelectorAll(
    'script, style, noscript, svg, head, meta, link'
  );
  toRemove.forEach((el) => el.remove());
}

/**
 * Check if an element has bold styling via inline styles (Google Docs pattern)
 */
function hasBoldStyle(el: Element): boolean {
  const style = el.getAttribute('style') || '';
  return /font-weight:\s*(700|800|900|bold)/i.test(style);
}

/**
 * Check if an element has italic styling via inline styles (Google Docs pattern)
 */
function hasItalicStyle(el: Element): boolean {
  const style = el.getAttribute('style') || '';
  return /font-style:\s*italic/i.test(style);
}

/**
 * Get text content, collapsing whitespace
 */
function getTextContent(node: Node): string {
  return (node.textContent || '').replace(/\s+/g, ' ');
}

/**
 * Convert children of an element to markdown
 */
function convertChildren(el: Element, ctx: ConversionContext): string {
  let result = '';
  for (const child of el.childNodes) {
    result += convertNode(child, ctx);
  }
  return result;
}

/**
 * Convert a link element to markdown
 */
function convertLink(el: Element, ctx: ConversionContext): string {
  const href = el.getAttribute('href') || '';
  const text = convertChildren(el, ctx).trim();

  // Skip empty links or anchor-only links
  if (!href || href.startsWith('#')) {
    return text;
  }

  // If text is empty, use the URL as text
  if (!text) {
    return `[${href}](${href})`;
  }

  return `[${text}](${href})`;
}

/**
 * Convert an image element to markdown
 */
function convertImage(el: Element): string {
  const src = el.getAttribute('src') || '';
  const alt = el.getAttribute('alt') || '';

  // Skip data URIs (too large) and empty sources
  if (!src || src.startsWith('data:')) {
    return alt || '';
  }

  return `![${alt}](${src})`;
}

/**
 * Convert a code block (pre element) to markdown
 */
function convertCodeBlock(el: Element): string {
  const codeEl = el.querySelector('code');
  const code = codeEl ? codeEl.textContent : el.textContent;

  // Try to detect language from class (common pattern: class="language-javascript")
  let language = '';
  if (codeEl) {
    const className = codeEl.className || '';
    const langMatch = className.match(/language-(\w+)/);
    if (langMatch) {
      language = langMatch[1];
    }
  }

  return `\`\`\`${language}\n${code?.trim() || ''}\n\`\`\`\n\n`;
}

/**
 * Convert a blockquote to markdown
 */
function convertBlockquote(el: Element, ctx: ConversionContext): string {
  const newCtx = { ...ctx, inBlockquote: true };
  const content = convertChildren(el, newCtx).trim();

  // Add > prefix to each line
  const lines = content.split('\n');
  const quoted = lines.map((line) => `> ${line}`).join('\n');
  return quoted + '\n\n';
}

/**
 * Convert a list (ul/ol) to markdown
 */
function convertList(el: Element, ctx: ConversionContext, ordered: boolean): string {
  const newCtx: ConversionContext = {
    ...ctx,
    listDepth: ctx.listDepth + 1,
    orderedAtDepth: [...ctx.orderedAtDepth, ordered],
    orderedCounters: [...ctx.orderedCounters, 1]
  };

  let result = '';
  for (const child of el.children) {
    if (child.tagName.toLowerCase() === 'li') {
      result += convertListItem(child, newCtx);
    }
  }

  // Add trailing newline only at top level
  if (ctx.listDepth === 0) {
    result += '\n';
  }

  return result;
}

/**
 * Convert a list item to markdown
 */
function convertListItem(el: Element, ctx: ConversionContext): string {
  const indent = '  '.repeat(ctx.listDepth - 1);
  const isOrdered = ctx.orderedAtDepth[ctx.listDepth - 1];
  const counter = ctx.orderedCounters[ctx.listDepth - 1];

  const bullet = isOrdered ? `${counter}. ` : '- ';

  // Increment counter for next item
  ctx.orderedCounters[ctx.listDepth - 1]++;

  // Separate nested lists from inline content
  let inlineContent = '';
  let nestedLists = '';

  for (const child of el.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as Element;
      const tag = childEl.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        nestedLists += convertList(childEl, ctx, tag === 'ol');
      } else {
        inlineContent += convertNode(child, ctx);
      }
    } else {
      inlineContent += convertNode(child, ctx);
    }
  }

  return `${indent}${bullet}${inlineContent.trim()}\n${nestedLists}`;
}

/**
 * Convert a table to markdown
 */
function convertTable(el: Element, ctx: ConversionContext): string {
  const rows: string[][] = [];

  // Extract all rows from thead, tbody, tfoot
  const tableRows = el.querySelectorAll('tr');
  for (const row of tableRows) {
    const cells: string[] = [];
    const tableCells = row.querySelectorAll('th, td');
    for (const cell of tableCells) {
      // Escape pipes in cell content
      const cellContent = convertChildren(cell, ctx)
        .trim()
        .replace(/\|/g, '\\|')
        .replace(/\n/g, ' ');
      cells.push(cellContent);
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) return '';

  // Normalize column count
  const maxCols = Math.max(...rows.map((r) => r.length));
  const normalizedRows = rows.map((r) => {
    while (r.length < maxCols) r.push('');
    return r;
  });

  // Build markdown table
  let result = '| ' + normalizedRows[0].join(' | ') + ' |\n';
  result += '| ' + normalizedRows[0].map(() => '---').join(' | ') + ' |\n';

  for (let i = 1; i < normalizedRows.length; i++) {
    result += '| ' + normalizedRows[i].join(' | ') + ' |\n';
  }

  return result + '\n';
}

/**
 * Convert a header element to markdown
 */
function convertHeader(el: Element, ctx: ConversionContext, level: number): string {
  const content = convertChildren(el, ctx).trim();
  if (!content) return '';
  return `${'#'.repeat(level)} ${content}\n\n`;
}

/**
 * Convert an element node to markdown
 */
function convertElement(el: Element, ctx: ConversionContext): string {
  const tag = el.tagName.toLowerCase();

  // Check for Google Docs style-based formatting on spans
  if (tag === 'span') {
    const isBold = hasBoldStyle(el);
    const isItalic = hasItalicStyle(el);
    const content = convertChildren(el, ctx);

    if (isBold && isItalic) {
      return `***${content}***`;
    } else if (isBold) {
      return `**${content}**`;
    } else if (isItalic) {
      return `*${content}*`;
    }
    return content;
  }

  switch (tag) {
    // Block elements
    case 'p':
      return convertChildren(el, ctx).trim() + '\n\n';
    case 'div':
    case 'article':
    case 'section':
    case 'main':
    case 'header':
    case 'footer':
    case 'nav':
    case 'aside':
      return convertChildren(el, ctx) + '\n';
    case 'br':
      return '\n';

    // Headers
    case 'h1':
      return convertHeader(el, ctx, 1);
    case 'h2':
      return convertHeader(el, ctx, 2);
    case 'h3':
      return convertHeader(el, ctx, 3);
    case 'h4':
      return convertHeader(el, ctx, 4);
    case 'h5':
      return convertHeader(el, ctx, 5);
    case 'h6':
      return convertHeader(el, ctx, 6);

    // Inline formatting
    case 'strong':
    case 'b':
      return `**${convertChildren(el, ctx)}**`;
    case 'em':
    case 'i':
      return `*${convertChildren(el, ctx)}*`;
    case 'code':
      // In code blocks, don't wrap with backticks
      if (ctx.inCodeBlock) {
        return getTextContent(el);
      }
      return `\`${getTextContent(el)}\``;
    case 'del':
    case 's':
    case 'strike':
      return `~~${convertChildren(el, ctx)}~~`;
    case 'u':
      // No standard markdown for underline, just return content
      return convertChildren(el, ctx);
    case 'mark':
      // No standard markdown for highlight, just return content
      return convertChildren(el, ctx);

    // Links and media
    case 'a':
      return convertLink(el, ctx);
    case 'img':
      return convertImage(el);

    // Code blocks
    case 'pre':
      return convertCodeBlock(el);

    // Lists
    case 'ul':
      return convertList(el, ctx, false);
    case 'ol':
      return convertList(el, ctx, true);
    case 'li':
      // This shouldn't be called directly, but handle it gracefully
      return convertListItem(el, ctx);

    // Blockquotes
    case 'blockquote':
      return convertBlockquote(el, ctx);

    // Tables
    case 'table':
      return convertTable(el, ctx);
    case 'thead':
    case 'tbody':
    case 'tfoot':
    case 'tr':
    case 'th':
    case 'td':
      // These are handled by convertTable
      return convertChildren(el, ctx);

    // Horizontal rule
    case 'hr':
      return '\n---\n\n';

    // Definition lists - convert to simple format
    case 'dl':
      return convertChildren(el, ctx) + '\n';
    case 'dt':
      return `**${convertChildren(el, ctx).trim()}**\n`;
    case 'dd':
      return convertChildren(el, ctx).trim() + '\n\n';

    // Default: just convert children
    default:
      return convertChildren(el, ctx);
  }
}

/**
 * Convert a DOM node to markdown
 */
function convertNode(node: Node, ctx: ConversionContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // Get text content and collapse whitespace
    const text = (node.textContent || '').replace(/\s+/g, ' ');
    return text;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return convertElement(node as Element, ctx);
  }

  // Skip other node types (comments, etc.)
  return '';
}

/**
 * Clean up the final markdown output
 */
function cleanMarkdown(markdown: string): string {
  return (
    markdown
      // Collapse multiple blank lines to double
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing whitespace from lines
      .replace(/[ \t]+$/gm, '')
      // Remove leading/trailing whitespace
      .trim()
  );
}

/**
 * Convert HTML string to markdown
 */
export function htmlToMarkdown(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Clean up the DOM first
  cleanDom(doc.body);

  // Convert to markdown
  const ctx = createContext();
  const markdown = convertChildren(doc.body, ctx);

  // Clean up and return
  return cleanMarkdown(markdown);
}

/**
 * Create DOM event handlers for rich paste
 */
function createRichPasteDomEventHandlers(): Extension {
  return EditorView.domEventHandlers({
    paste: (event: ClipboardEvent, view: EditorView) => {
      if (!event.clipboardData) return false;

      // Check for HTML content
      const html = event.clipboardData.getData('text/html');
      if (!html) return false; // Let other handlers (like image) try

      // Convert HTML to markdown
      const markdown = htmlToMarkdown(html);

      // If conversion produced nothing useful, fall back to default behavior
      if (!markdown.trim()) return false;

      // Prevent default handling
      event.preventDefault();

      // Get cursor position (or selection)
      const { from, to } = view.state.selection.main;

      // Insert markdown, replacing any selection
      view.dispatch({
        changes: { from, to, insert: markdown },
        selection: { anchor: from + markdown.length }
      });

      return true;
    }
  });
}

/**
 * CodeMirror extension for rich paste (HTML to markdown conversion)
 *
 * Intercepts paste events containing HTML and converts to markdown.
 * Should be added after imageExtension so image pastes take precedence.
 */
export function richPasteExtension(): Extension {
  return createRichPasteDomEventHandlers();
}
