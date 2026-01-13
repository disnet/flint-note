/**
 * Markdown links extension for CodeMirror
 *
 * Provides styled, interactive rendering of markdown links [text](url)
 * with atomic cursor movement, click-to-open, and alt+enter editing.
 */
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import {
  StateField,
  StateEffect,
  RangeSet,
  RangeValue,
  EditorState,
  Prec,
  type Extension,
  type Range
} from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

import { markdownLinkTheme } from '../markdown-link-theme';

// Regex to match markdown links [text](url)
// Negative lookbehind excludes images ![...] and wikilinks [[...]]
// URL part handles balanced parentheses (one level) for URLs like Wikipedia
// e.g., https://en.wikipedia.org/wiki/Parenthesis_(disambiguation)
// eslint-disable-next-line no-useless-escape
const MARKDOWN_LINK_REGEX = /(?<![!\[])\[([^\[\]]+)\]\(((?:[^()]|\([^()]*\))+)\)/g;

export interface MarkdownLinkMatch {
  from: number;
  to: number;
  text: string; // Full match: [display](url)
  displayText: string; // Text inside brackets
  url: string; // URL inside parentheses
}

export interface SelectedMarkdownLink {
  from: number;
  to: number;
  displayText: string;
  url: string;
}

export type MarkdownLinkClickHandler = (url: string) => void;

export interface MarkdownLinkHoverData {
  displayText: string;
  url: string;
  from: number;
  to: number;
  x: number;
  y: number;
  yTop: number;
}

export type MarkdownLinkHoverHandler = (data: MarkdownLinkHoverData | null) => void;
export type MarkdownLinkEditHandler = (link: SelectedMarkdownLink) => void;

// Effects
const setMarkdownLinkHandler = StateEffect.define<MarkdownLinkClickHandler>();
const setMarkdownLinkHoverHandler = StateEffect.define<MarkdownLinkHoverHandler>();
const forceMarkdownLinkUpdate = StateEffect.define<boolean>();

/**
 * Extract the URL from a markdown link target that may include a title.
 * Handles formats like:
 * - url
 * - url "title"
 * - url 'title'
 * - url (title)
 * - <url>
 * - <url> "title"
 */
function extractUrl(linkTarget: string): string {
  const trimmed = linkTarget.trim();

  // Handle angle brackets: <url> or <url> "title"
  if (trimmed.startsWith('<')) {
    const closeAngle = trimmed.indexOf('>');
    if (closeAngle !== -1) {
      return trimmed.substring(1, closeAngle);
    }
  }

  // Look for title delimiter: space followed by " or ' or (
  const titleStart = trimmed.search(/\s+["'(]/);
  if (titleStart !== -1) {
    return trimmed.substring(0, titleStart);
  }

  // No title, return the whole thing
  return trimmed;
}

/**
 * Parse markdown links from text content
 */
export function parseMarkdownLinks(text: string): MarkdownLinkMatch[] {
  const matches: MarkdownLinkMatch[] = [];

  MARKDOWN_LINK_REGEX.lastIndex = 0;

  let match;
  while ((match = MARKDOWN_LINK_REGEX.exec(text)) !== null) {
    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      text: match[0],
      displayText: match[1],
      url: extractUrl(match[2])
    });
  }

  return matches;
}

// State field to store the currently selected markdown link (cursor adjacent to it)
const selectedMarkdownLinkField = StateField.define<SelectedMarkdownLink | null>({
  create: () => null,
  update: (value, tr) => {
    if (!tr.docChanged && !tr.selection) {
      return value;
    }

    const cursorPos = tr.state.selection.main.head;
    const text = tr.state.doc.toString();
    const links = parseMarkdownLinks(text);

    for (const link of links) {
      if (cursorPos === link.from || cursorPos === link.to) {
        return {
          from: link.from,
          to: link.to,
          displayText: link.displayText,
          url: link.url
        };
      }
    }

    return null;
  }
});

// State field to store the click handler
const markdownLinkHandlerField = StateField.define<MarkdownLinkClickHandler | null>({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setMarkdownLinkHandler)) {
        return effect.value;
      }
    }
    return value;
  }
});

// State field to store the hover handler
const markdownLinkHoverHandlerField = StateField.define<MarkdownLinkHoverHandler | null>({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setMarkdownLinkHoverHandler)) {
        return effect.value;
      }
    }
    return value;
  }
});

// State field to store the edit handler
const markdownLinkEditHandlerField = StateField.define<MarkdownLinkEditHandler | null>({
  create: () => null,
  update: (v) => v
});

/**
 * RangeValue for atomic cursor movement over markdown links
 */
class AtomicRangeValue extends RangeValue {
  eq(other: RangeValue): boolean {
    return other instanceof AtomicRangeValue;
  }
}
const atomicValue = new AtomicRangeValue();

/**
 * Widget for rendering clickable markdown links with inline text flow
 */
class MarkdownLinkWidget extends WidgetType {
  constructor(
    private displayText: string,
    private url: string,
    private clickHandler: MarkdownLinkClickHandler | null,
    private hoverHandler: MarkdownLinkHoverHandler | null,
    private from: number,
    private to: number,
    private isSelected: boolean
  ) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    const container = document.createElement('span');

    // Build class name
    const classes = ['markdown-link'];
    if (this.isSelected) {
      classes.push('markdown-link-selected');
    }
    container.className = classes.join(' ');

    // Click handler - open external URL
    const handleClick = (e: MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      this.clickHandler?.(this.url);
    };

    // Prevent editor from handling mousedown
    const handleMouseDown = (e: MouseEvent): void => {
      e.stopPropagation();
    };

    // Track hover state
    let isHovering = false;

    // Calculate bounding rect using getClientRects for proper multi-line support
    const getMarkdownLinkBoundingRect = (): DOMRect => {
      const segmentSpan = container.querySelector('.markdown-link-segment');
      if (!segmentSpan) {
        return container.getBoundingClientRect();
      }

      const rects = segmentSpan.getClientRects();
      if (rects.length === 0) {
        return segmentSpan.getBoundingClientRect();
      }

      const firstRect = rects[0];
      const lastRect = rects[rects.length - 1];

      return new DOMRect(
        lastRect.left,
        firstRect.top,
        lastRect.width,
        lastRect.bottom - firstRect.top
      );
    };

    const handleMouseEnter = (): void => {
      if (isHovering || !this.hoverHandler) return;
      isHovering = true;

      const rect = getMarkdownLinkBoundingRect();
      this.hoverHandler({
        displayText: this.displayText,
        url: this.url,
        from: this.from,
        to: this.to,
        x: rect.left,
        y: rect.bottom,
        yTop: rect.top
      });
    };

    const handleMouseLeave = (e: MouseEvent): void => {
      if (!this.hoverHandler) return;
      const relatedTarget = e.relatedTarget as Element | null;
      if (relatedTarget && container.contains(relatedTarget)) {
        return;
      }

      isHovering = false;
      this.hoverHandler(null);
    };

    // Outer span for background/styling (no underline)
    const segmentSpan = document.createElement('span');
    segmentSpan.className = 'markdown-link-segment';

    // Inner span for display text (with underline)
    const textSpan = document.createElement('span');
    textSpan.className = 'markdown-link-text';
    const text = this.displayText || 'Link';
    textSpan.appendChild(document.createTextNode(text));
    segmentSpan.appendChild(textSpan);

    // Icon wrapper (no underline) - keeps icon with last word
    const iconWrapper = document.createElement('span');
    iconWrapper.className = 'markdown-link-icon-wrapper';
    iconWrapper.style.whiteSpace = 'nowrap';

    // Non-breaking space before icon
    iconWrapper.appendChild(document.createTextNode('\u00A0'));

    // Icon span
    const iconSpan = document.createElement('span');
    iconSpan.className = 'markdown-link-icon';
    iconSpan.textContent = '\u{1F517}'; // Link emoji
    iconWrapper.appendChild(iconSpan);

    segmentSpan.appendChild(iconWrapper);

    // Trailing anchor for cursor positioning when widget wraps
    const cursorAnchor = document.createElement('span');
    cursorAnchor.className = 'markdown-link-cursor-anchor';
    cursorAnchor.textContent = '\u200B'; // Zero-width space
    segmentSpan.appendChild(cursorAnchor);

    // Attach event handlers to the segment span
    segmentSpan.addEventListener('click', handleClick);
    segmentSpan.addEventListener('mousedown', handleMouseDown);
    segmentSpan.addEventListener('mouseenter', handleMouseEnter);
    segmentSpan.addEventListener('mouseleave', handleMouseLeave);

    container.appendChild(segmentSpan);

    return container;
  }

  eq(other: MarkdownLinkWidget): boolean {
    return (
      this.displayText === other.displayText &&
      this.url === other.url &&
      this.isSelected === other.isSelected
    );
  }

  ignoreEvent(): boolean {
    return true;
  }

  // Override to provide cursor coordinates since container uses display:contents
  coordsAt(
    dom: HTMLElement,
    pos: number,
    side: number
  ): { top: number; bottom: number; left: number; right: number } | null {
    const segmentSpan = dom.querySelector('.markdown-link-segment');
    if (!segmentSpan) return null;

    const rects = segmentSpan.getClientRects();
    if (rects.length === 0) return null;

    const firstRect = rects[0];
    const lastRect = rects[rects.length - 1];
    const widgetLength = this.to - this.from;

    const atEnd = pos >= widgetLength - 1 || (pos > widgetLength / 2 && side >= 0);
    const atStart = pos === 0 && side <= 0;

    if (atEnd && !atStart) {
      return {
        top: lastRect.top,
        bottom: lastRect.bottom,
        left: lastRect.right,
        right: lastRect.right
      };
    } else {
      return {
        top: firstRect.top,
        bottom: firstRect.bottom,
        left: firstRect.left,
        right: firstRect.left
      };
    }
  }
}

/**
 * Check if a position is inside a code context
 */
function isInCodeContext(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  let inCode = false;

  tree.iterate({
    from: pos,
    to: pos,
    enter: (node) => {
      const name = node.name;
      if (
        name === 'InlineCode' ||
        name === 'CodeBlock' ||
        name === 'FencedCode' ||
        name === 'CodeText' ||
        name === 'CodeInfo' ||
        name === 'CodeMark'
      ) {
        inCode = true;
        return false;
      }
      return undefined;
    }
  });

  return inCode;
}

/**
 * Create markdown link decorations for the document
 */
function createMarkdownLinkDecorations(
  state: EditorState,
  clickHandler: MarkdownLinkClickHandler | null,
  hoverHandler: MarkdownLinkHoverHandler | null
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();
  const links = parseMarkdownLinks(text);
  const selectedLink = state.field(selectedMarkdownLinkField);

  for (const link of links) {
    // Skip links inside code blocks
    if (isInCodeContext(state, link.from)) {
      continue;
    }

    const isSelected =
      selectedLink !== null &&
      selectedLink.from === link.from &&
      selectedLink.to === link.to;

    const widget = new MarkdownLinkWidget(
      link.displayText,
      link.url,
      clickHandler,
      hoverHandler,
      link.from,
      link.to,
      isSelected
    );

    decorations.push(
      Decoration.replace({
        widget,
        inclusive: false,
        block: false
      }).range(link.from, link.to)
    );
  }

  return RangeSet.of(decorations.sort((a, b) => a.from - b.from));
}

// State field for markdown link decorations
const markdownLinkField = StateField.define<DecorationSet>({
  create: (state) => {
    const handler = state.field(markdownLinkHandlerField);
    const hoverHandler = state.field(markdownLinkHoverHandlerField);
    return createMarkdownLinkDecorations(state, handler, hoverHandler);
  },
  update: (decorations, tr) => {
    // Check for force update effect
    for (const effect of tr.effects) {
      if (effect.is(forceMarkdownLinkUpdate)) {
        const handler = tr.state.field(markdownLinkHandlerField);
        const hoverHandler = tr.state.field(markdownLinkHoverHandlerField);
        return createMarkdownLinkDecorations(tr.state, handler, hoverHandler);
      }
    }

    // Only recalculate if document changed or selection changed
    if (tr.docChanged || tr.selection) {
      const handler = tr.state.field(markdownLinkHandlerField);
      const hoverHandler = tr.state.field(markdownLinkHoverHandlerField);
      return createMarkdownLinkDecorations(tr.state, handler, hoverHandler);
    }

    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

/**
 * Force refresh markdown links (call when needed externally)
 */
export function forceMarkdownLinkRefresh(view: EditorView): void {
  view.dispatch({
    effects: forceMarkdownLinkUpdate.of(true)
  });
}

/**
 * Get selected markdown link from state
 */
export function getSelectedMarkdownLink(view: EditorView): SelectedMarkdownLink | null {
  return view.state.field(selectedMarkdownLinkField);
}

/**
 * Create the markdown links extension
 */
export function markdownLinksExtension(
  onLinkClick: MarkdownLinkClickHandler,
  onLinkHover?: MarkdownLinkHoverHandler,
  onLinkEdit?: MarkdownLinkEditHandler
): Extension {
  const markdownLinkKeymap = Prec.highest(
    keymap.of([
      // Mod-Enter to open URL in external browser
      {
        key: 'Mod-Enter',
        run: (view) => {
          const selected = view.state.field(selectedMarkdownLinkField);
          if (selected) {
            const handler = view.state.field(markdownLinkHandlerField);
            handler?.(selected.url);
            return true;
          }
          return false;
        }
      },
      // Alt-Enter to edit markdown link
      {
        key: 'Alt-Enter',
        run: (view) => {
          const selected = view.state.field(selectedMarkdownLinkField);
          if (selected) {
            const handler = view.state.field(markdownLinkEditHandlerField);
            if (handler) {
              handler(selected);
              return true;
            }
          }
          return false;
        }
      }
    ])
  );

  return [
    markdownLinkTheme,
    markdownLinkHandlerField.init(() => onLinkClick),
    markdownLinkHoverHandlerField.init(() => onLinkHover || null),
    markdownLinkEditHandlerField.init(() => onLinkEdit || null),
    selectedMarkdownLinkField,
    markdownLinkField,
    markdownLinkKeymap,
    // Add atomic ranges for proper cursor movement (cursor jumps over widget as unit)
    EditorView.atomicRanges.of((view) => {
      const decorations = view.state.field(markdownLinkField, false);
      if (!decorations) {
        return RangeSet.empty;
      }

      const ranges: ReturnType<typeof atomicValue.range>[] = [];

      try {
        decorations.between(0, view.state.doc.length, (from, to, value) => {
          if (value.spec.widget instanceof MarkdownLinkWidget) {
            ranges.push(atomicValue.range(from, to));
          }
        });

        return ranges.length > 0 ? RangeSet.of(ranges) : RangeSet.empty;
      } catch (e) {
        console.warn('Error creating atomic ranges:', e);
        return RangeSet.empty;
      }
    })
  ];
}
