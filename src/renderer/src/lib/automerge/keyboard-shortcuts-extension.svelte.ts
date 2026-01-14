/**
 * Keyboard shortcuts extension for CodeMirror 6
 *
 * Provides formatting shortcuts and selection-aware behaviors:
 * - Cmd+B: Toggle bold
 * - Cmd+I: Toggle italic
 * - Cmd+K: Insert link and open edit popover
 * - [ with selection: Wrap as wikilink
 * - Paste URL with selection: Convert to markdown link
 */
import { EditorView, keymap } from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';
import type { SelectedMarkdownLink } from './markdown-links.svelte';

/**
 * Handler called when a new link is created via keyboard shortcut
 */
export type LinkCreatedHandler = (link: SelectedMarkdownLink) => void;

/**
 * Check if a string is a valid HTTP(S) URL
 */
function isValidUrl(text: string): boolean {
  const trimmed = text.trim();
  // Check for http(s) protocol
  if (!/^https?:\/\//i.test(trimmed)) return false;

  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the word boundaries around the cursor position.
 * Returns null if cursor is surrounded by whitespace.
 */
function findWordAtCursor(
  doc: string,
  pos: number
): { from: number; to: number; word: string } | null {
  // Check if we're in whitespace
  const charBefore = pos > 0 ? doc[pos - 1] : '';
  const charAfter = pos < doc.length ? doc[pos] : '';

  const isWhitespaceBefore = !charBefore || /\s/.test(charBefore);
  const isWhitespaceAfter = !charAfter || /\s/.test(charAfter);

  // If surrounded by whitespace, no word to select
  if (isWhitespaceBefore && isWhitespaceAfter) {
    return null;
  }

  // Find word boundaries (word = non-whitespace characters)
  let from = pos;
  let to = pos;

  // Expand backwards
  while (from > 0 && !/\s/.test(doc[from - 1])) {
    from--;
  }

  // Expand forwards
  while (to < doc.length && !/\s/.test(doc[to])) {
    to++;
  }

  if (from === to) {
    return null;
  }

  return { from, to, word: doc.slice(from, to) };
}

/**
 * Check if text is wrapped with the given markers and return unwrapped content.
 * Returns null if not wrapped.
 */
function getUnwrappedText(text: string, before: string, after: string): string | null {
  if (
    text.startsWith(before) &&
    text.endsWith(after) &&
    text.length >= before.length + after.length
  ) {
    return text.slice(before.length, text.length - after.length);
  }
  return null;
}

/**
 * Find a formatted region containing the cursor position.
 * Searches outward from cursor to find matching markers.
 * Returns the region bounds and inner content, or null if not found.
 */
function findFormattedRegionAtCursor(
  doc: string,
  pos: number,
  before: string,
  after: string
): { from: number; to: number; innerText: string } | null {
  // Search backwards for opening marker, forwards for closing marker
  // Start from a reasonable distance (e.g., 100 chars) to avoid scanning entire doc
  const searchRadius = 100;
  const searchStart = Math.max(0, pos - searchRadius);
  const searchEnd = Math.min(doc.length, pos + searchRadius);

  // Find potential opening markers before cursor
  let markerStart = -1;
  for (let i = pos - 1; i >= searchStart; i--) {
    if (doc.slice(i, i + before.length) === before) {
      // Check this isn't part of a longer marker (e.g., *** for bold+italic)
      // For bold (**), make sure it's not actually ***
      if (before === '**' && i > 0 && doc[i - 1] === '*') continue;
      if (before === '*' && doc[i + 1] === '*') continue; // This is actually **
      markerStart = i;
      break;
    }
  }

  if (markerStart === -1) return null;

  // Find potential closing marker after cursor
  let markerEnd = -1;
  for (let i = pos; i <= searchEnd - after.length; i++) {
    if (doc.slice(i, i + after.length) === after) {
      // Check this isn't part of a longer marker
      if (
        after === '**' &&
        i + after.length < doc.length &&
        doc[i + after.length] === '*'
      )
        continue;
      if (after === '*' && i > 0 && doc[i - 1] === '*') continue; // This is actually **
      markerEnd = i + after.length;
      break;
    }
  }

  if (markerEnd === -1) return null;

  // Verify the markers are properly paired (no unmatched markers in between)
  const innerText = doc.slice(markerStart + before.length, markerEnd - after.length);

  // Make sure cursor is actually inside the formatted region (after opening, before closing)
  if (pos <= markerStart + before.length || pos > markerEnd - after.length) {
    // Cursor might be at the boundary - allow if cursor is right after opening or right before closing
    if (pos !== markerStart + before.length && pos !== markerEnd - after.length) {
      return null;
    }
  }

  return {
    from: markerStart,
    to: markerEnd,
    innerText
  };
}

/**
 * Toggle formatting on the current selection or word.
 * If text is already formatted, removes formatting.
 * If not formatted, applies formatting.
 * If no selection and no word at cursor, inserts empty markers with cursor inside.
 */
function toggleFormat(view: EditorView, before: string, after: string): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc.toString();

  // Case 1: Has selection
  if (from !== to) {
    const selectedText = doc.slice(from, to);

    // Check if already formatted
    const unwrapped = getUnwrappedText(selectedText, before, after);
    if (unwrapped !== null) {
      // Remove formatting
      view.dispatch({
        changes: { from, to, insert: unwrapped },
        selection: { anchor: from, head: from + unwrapped.length }
      });
    } else {
      // Check if the surrounding text has the markers (selection is inside formatted text)
      const expandedFrom = from - before.length;
      const expandedTo = to + after.length;
      if (expandedFrom >= 0 && expandedTo <= doc.length) {
        const expandedText = doc.slice(expandedFrom, expandedTo);
        const expandedUnwrapped = getUnwrappedText(expandedText, before, after);
        if (expandedUnwrapped !== null && expandedUnwrapped === selectedText) {
          // Remove the surrounding markers
          view.dispatch({
            changes: { from: expandedFrom, to: expandedTo, insert: selectedText },
            selection: { anchor: expandedFrom, head: expandedFrom + selectedText.length }
          });
          return true;
        }
      }

      // Add formatting
      view.dispatch({
        changes: { from, to, insert: `${before}${selectedText}${after}` },
        selection: { anchor: from + before.length, head: to + before.length }
      });
    }
    return true;
  }

  // Case 2: No selection - first check if cursor is inside a formatted region
  const formattedRegion = findFormattedRegionAtCursor(doc, from, before, after);

  if (formattedRegion) {
    // Cursor is inside formatted text - remove the formatting
    const { from: regionFrom, to: regionTo, innerText } = formattedRegion;
    // Calculate new cursor position (adjust for removed opening marker)
    const cursorOffset = from - regionFrom - before.length;
    const newCursorPos =
      regionFrom + Math.max(0, Math.min(cursorOffset, innerText.length));

    view.dispatch({
      changes: { from: regionFrom, to: regionTo, insert: innerText },
      selection: { anchor: newCursorPos }
    });
    return true;
  }

  // Case 3: No selection and not in formatted region - find word at cursor
  const wordInfo = findWordAtCursor(doc, from);

  if (wordInfo) {
    const { from: wordFrom, to: wordTo, word } = wordInfo;

    // The word might include markers if cursor was at boundary
    // Check if it's already a formatted word (starts and ends with markers)
    const unwrapped = getUnwrappedText(word, before, after);
    if (unwrapped !== null) {
      // Word includes markers - remove them
      const cursorOffset = from - wordFrom - before.length;
      const newCursorPos =
        wordFrom + Math.max(0, Math.min(cursorOffset, unwrapped.length));

      view.dispatch({
        changes: { from: wordFrom, to: wordTo, insert: unwrapped },
        selection: { anchor: newCursorPos }
      });
      return true;
    }

    // Add formatting around the word
    view.dispatch({
      changes: { from: wordFrom, to: wordTo, insert: `${before}${word}${after}` },
      // Position cursor at same relative position
      selection: { anchor: from + before.length }
    });
    return true;
  }

  // Case 4: No selection and no word - insert empty markers with cursor inside
  view.dispatch({
    changes: { from, to: from, insert: `${before}${after}` },
    selection: { anchor: from + before.length }
  });
  return true;
}

/**
 * Insert a markdown link and trigger the edit popover
 */
function insertLink(view: EditorView, onLinkCreated?: LinkCreatedHandler): boolean {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc.toString();

  let displayText = '';
  let insertFrom = from;
  let insertTo = to;

  // If we have a selection, use it as display text
  if (from !== to) {
    displayText = doc.slice(from, to);
  } else {
    // No selection - check for word at cursor
    const wordInfo = findWordAtCursor(doc, from);
    if (wordInfo) {
      displayText = wordInfo.word;
      insertFrom = wordInfo.from;
      insertTo = wordInfo.to;
    }
  }

  // Create the link with empty URL
  const linkText = `[${displayText}]()`;

  view.dispatch({
    changes: { from: insertFrom, to: insertTo, insert: linkText },
    // Position cursor inside the parentheses (where URL goes)
    selection: { anchor: insertFrom + displayText.length + 3 }
  });

  // Call the edit handler to open the popover
  if (onLinkCreated) {
    // Calculate the position of the inserted link
    const linkFrom = insertFrom;
    const linkTo = insertFrom + linkText.length;

    onLinkCreated({
      from: linkFrom,
      to: linkTo,
      displayText,
      url: ''
    });
  }

  return true;
}

/**
 * Keymap for formatting shortcuts
 * Uses Prec.high to take precedence over default keymaps when editor is focused
 */
function createFormattingKeymap(onLinkCreated?: LinkCreatedHandler): Extension {
  return Prec.high(
    keymap.of([
      {
        key: 'Mod-b',
        run: (view) => toggleFormat(view, '**', '**')
      },
      {
        key: 'Mod-i',
        run: (view) => toggleFormat(view, '*', '*')
      },
      {
        key: 'Mod-k',
        run: (view) => insertLink(view, onLinkCreated)
      }
    ])
  );
}

/**
 * Input handler for bracket-based wikilink wrapping
 * When `[` is typed with text selected, wrap as `[[selectedText]]`
 */
function createBracketWrapHandler(): Extension {
  return EditorView.inputHandler.of((view, _from, _to, text) => {
    // Only handle '[' character
    if (text !== '[') return false;

    // Check if there's a selection
    const selection = view.state.selection.main;
    if (selection.empty) return false; // No selection, let default behavior handle

    // Wrap selection as wikilink
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: `[[${selectedText}]]`
      },
      selection: {
        anchor: selection.from + 2,
        head: selection.from + 2 + selectedText.length
      }
    });

    return true; // Handled
  });
}

/**
 * DOM event handler for URL paste with selection
 * When text is selected and a URL is pasted, create a markdown link
 */
function createUrlPasteHandler(): Extension {
  return EditorView.domEventHandlers({
    paste: (event: ClipboardEvent, view: EditorView) => {
      if (!event.clipboardData) return false;

      // Check if there's a selection
      const { from, to } = view.state.selection.main;
      if (from === to) return false; // No selection, let other handlers try

      // Get plain text from clipboard
      const pastedText = event.clipboardData.getData('text/plain');
      if (!pastedText) return false;

      // Check if it's a URL
      if (!isValidUrl(pastedText)) return false;

      // Get selected text
      const selectedText = view.state.sliceDoc(from, to);

      // Create markdown link
      const markdownLink = `[${selectedText}](${pastedText.trim()})`;

      event.preventDefault();
      view.dispatch({
        changes: { from, to, insert: markdownLink },
        selection: { anchor: from + markdownLink.length }
      });

      return true;
    }
  });
}

/**
 * CodeMirror extension for keyboard shortcuts and selection-aware behaviors
 *
 * Includes:
 * - Cmd/Ctrl+B for toggling bold
 * - Cmd/Ctrl+I for toggling italic
 * - Cmd/Ctrl+K for inserting markdown links with edit popover
 * - Typing `[` with selection wraps as wikilink
 * - Pasting URL with selection creates markdown link
 *
 * @param onLinkCreated - Optional callback when a link is created via Cmd+K
 *
 * Note: The URL paste handler should be registered before richPasteExtension
 * so it takes precedence for plain URL pastes with selection.
 */
export function keyboardShortcutsExtension(
  onLinkCreated?: LinkCreatedHandler
): Extension[] {
  return [
    createFormattingKeymap(onLinkCreated),
    createBracketWrapHandler(),
    createUrlPasteHandler()
  ];
}
