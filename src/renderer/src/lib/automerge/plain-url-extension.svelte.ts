/**
 * Plain URL extension for CodeMirror
 *
 * Makes plain URLs clickable without requiring markdown link syntax.
 * URLs like https://example.com become clickable links that open in the browser.
 * Uses mark decorations to allow cursor movement inside the URL.
 */
import { EditorView, Decoration } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import {
  StateField,
  StateEffect,
  RangeSet,
  EditorState,
  type Extension,
  type Range
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

import { plainUrlTheme } from '../plain-url-theme';

// Regex to match plain URLs
// Matches:
// 1. URLs with protocol: http:// or https://
// 2. URLs starting with www.
// 3. Domain-like patterns with common TLDs
// Excludes trailing punctuation that's likely not part of the URL
// eslint-disable-next-line no-useless-escape
const PROTOCOL_URL_REGEX = /(?<!\]\()(?<!\[)https?:\/\/[^\s<>\[\]"'`\)]+(?<![.,;:!?\)])/g;

// Matches www.domain.tld or domain.tld patterns
// Common TLDs to avoid false positives
/* eslint-disable no-useless-escape */
const BARE_URL_REGEX =
  /(?<!\]\()(?<!\[)(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:[-a-zA-Z0-9._~:/?#\[\]@!$&'()*+,;=%]*[a-zA-Z0-9/])?(?<![.,;:!?\)])/g;
/* eslint-enable no-useless-escape */

export interface PlainUrlMatch {
  from: number;
  to: number;
  url: string;
}

export type PlainUrlClickHandler = (url: string) => void;

// Effects
const setPlainUrlHandler = StateEffect.define<PlainUrlClickHandler>();
const forcePlainUrlUpdate = StateEffect.define<boolean>();

/**
 * Parse plain URLs from text content, excluding those inside markdown links
 */
export function parsePlainUrls(text: string): PlainUrlMatch[] {
  const matches: PlainUrlMatch[] = [];

  // First, find all markdown links to exclude their URL portions
  // Matches [text](url) pattern
  // eslint-disable-next-line no-useless-escape
  const markdownLinkRegex = /\[([^\[\]]+)\]\(([^)]+)\)/g;
  const excludeRanges: { from: number; to: number }[] = [];

  let mdMatch;
  while ((mdMatch = markdownLinkRegex.exec(text)) !== null) {
    // Exclude the entire markdown link
    excludeRanges.push({
      from: mdMatch.index,
      to: mdMatch.index + mdMatch[0].length
    });
  }

  // Also exclude wikilinks
  // eslint-disable-next-line no-useless-escape
  const wikilinkRegex = /\[\[([^\[\]]+)\]\]/g;
  let wlMatch;
  while ((wlMatch = wikilinkRegex.exec(text)) !== null) {
    excludeRanges.push({
      from: wlMatch.index,
      to: wlMatch.index + wlMatch[0].length
    });
  }

  // Find URLs with protocol
  PROTOCOL_URL_REGEX.lastIndex = 0;
  let match;
  while ((match = PROTOCOL_URL_REGEX.exec(text)) !== null) {
    const from = match.index;
    const to = from + match[0].length;

    const isExcluded = excludeRanges.some(
      (range) => from >= range.from && to <= range.to
    );

    if (!isExcluded) {
      matches.push({
        from,
        to,
        url: match[0]
      });
    }
  }

  // Find bare URLs (www.example.com or example.com)
  BARE_URL_REGEX.lastIndex = 0;
  while ((match = BARE_URL_REGEX.exec(text)) !== null) {
    const from = match.index;
    const to = from + match[0].length;

    // Check if this overlaps with an already-found URL (with protocol)
    const overlapsExisting = matches.some(
      (existing) =>
        (from >= existing.from && from < existing.to) ||
        (to > existing.from && to <= existing.to)
    );

    if (overlapsExisting) {
      continue;
    }

    const isExcluded = excludeRanges.some(
      (range) => from >= range.from && to <= range.to
    );

    if (!isExcluded) {
      // Store the URL as-is, we'll add protocol when opening
      matches.push({
        from,
        to,
        url: match[0]
      });
    }
  }

  // Sort by position
  matches.sort((a, b) => a.from - b.from);

  return matches;
}

// State field to store the click handler
const plainUrlHandlerField = StateField.define<PlainUrlClickHandler | null>({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setPlainUrlHandler)) {
        return effect.value;
      }
    }
    return value;
  }
});

// Mark decoration for styling URLs
const urlMark = Decoration.mark({ class: 'plain-url' });

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
 * Create plain URL decorations for the document
 */
function createPlainUrlDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();
  const urls = parsePlainUrls(text);

  for (const urlMatch of urls) {
    // Skip URLs inside code blocks
    if (isInCodeContext(state, urlMatch.from)) {
      continue;
    }

    decorations.push(urlMark.range(urlMatch.from, urlMatch.to));
  }

  return RangeSet.of(decorations.sort((a, b) => a.from - b.from));
}

// State field for plain URL decorations
const plainUrlField = StateField.define<DecorationSet>({
  create: (state) => {
    return createPlainUrlDecorations(state);
  },
  update: (decorations, tr) => {
    // Check for force update effect
    for (const effect of tr.effects) {
      if (effect.is(forcePlainUrlUpdate)) {
        return createPlainUrlDecorations(tr.state);
      }
    }

    // Only recalculate if document changed
    if (tr.docChanged) {
      return createPlainUrlDecorations(tr.state);
    }

    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

/**
 * State field to store parsed URLs for click detection
 */
const plainUrlMatchesField = StateField.define<PlainUrlMatch[]>({
  create: (state) => {
    const text = state.doc.toString();
    return parsePlainUrls(text).filter((url) => !isInCodeContext(state, url.from));
  },
  update: (matches, tr) => {
    if (tr.docChanged) {
      const text = tr.state.doc.toString();
      return parsePlainUrls(text).filter((url) => !isInCodeContext(tr.state, url.from));
    }
    return matches;
  }
});

/**
 * Find URL at a given position
 */
function findUrlAtPos(matches: PlainUrlMatch[], pos: number): PlainUrlMatch | null {
  for (const match of matches) {
    if (pos >= match.from && pos <= match.to) {
      return match;
    }
  }
  return null;
}

/**
 * Force refresh plain URLs (call when needed externally)
 */
export function forcePlainUrlRefresh(view: EditorView): void {
  view.dispatch({
    effects: forcePlainUrlUpdate.of(true)
  });
}

/**
 * Create the plain URL extension
 */
export function plainUrlExtension(onUrlClick: PlainUrlClickHandler): Extension {
  return [
    plainUrlTheme,
    plainUrlHandlerField.init(() => onUrlClick),
    plainUrlField,
    plainUrlMatchesField,
    // Click handler for URLs
    // Regular click opens URL, Alt+click positions cursor for editing
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        // Alt+click allows cursor positioning inside the URL
        if (event.altKey) {
          return false;
        }

        // Check if clicking on a URL element
        const target = event.target as HTMLElement;
        const urlElement = target.closest('.plain-url');
        if (!urlElement) {
          return false;
        }

        // Get click position in document
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) {
          return false;
        }

        // Find if there's a URL at this position
        const matches = view.state.field(plainUrlMatchesField);
        const urlMatch = findUrlAtPos(matches, pos);

        if (urlMatch) {
          const handler = view.state.field(plainUrlHandlerField);
          if (handler) {
            event.preventDefault();
            event.stopPropagation();
            // Add protocol if missing
            const url = urlMatch.url.match(/^https?:\/\//)
              ? urlMatch.url
              : `https://${urlMatch.url}`;
            handler(url);
            return true;
          }
        }

        return false;
      }
    })
  ];
}
