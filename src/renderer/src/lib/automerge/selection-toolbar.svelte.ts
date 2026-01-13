/**
 * Selection toolbar extension for CodeMirror 6
 *
 * Detects text selection and provides callbacks for showing a formatting toolbar.
 */
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { useTouchInteractions } from '../../stores/deviceState.svelte';

export interface SelectionToolbarData {
  /** Screen X coordinate for toolbar positioning */
  x: number;
  /** Screen Y coordinate for toolbar positioning */
  y: number;
  /** Selection start position in document */
  from: number;
  /** Selection end position in document */
  to: number;
  /** The selected text */
  selectedText: string;
  /** Bounding rect of the selection for positioning adjustments */
  selectionRect: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export type SelectionToolbarHandler = (data: SelectionToolbarData | null) => void;

/**
 * Creates a CodeMirror extension that detects text selection
 * and calls the handler with position data for showing a toolbar.
 */
export function selectionToolbarExtension(
  onShowToolbar: SelectionToolbarHandler
): ReturnType<typeof EditorView.updateListener.of> {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSelectionEmpty = true;

  return EditorView.updateListener.of((update: ViewUpdate) => {
    // Only respond to selection changes
    if (!update.selectionSet && !update.docChanged) return;

    const { state, view } = update;
    const selection = state.selection.main;
    const hasSelection = !selection.empty;

    // If selection was cleared, hide toolbar immediately
    if (!hasSelection) {
      if (!lastSelectionEmpty) {
        lastSelectionEmpty = true;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        onShowToolbar(null);
      }
      return;
    }

    // Debounce on touch devices to avoid flickering during selection adjustment
    const debounceMs = useTouchInteractions() ? 150 : 0;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const showToolbar = (): void => {
      debounceTimer = null;
      lastSelectionEmpty = false;

      const { from, to } = selection;
      const selectedText = state.sliceDoc(from, to);

      // Get coordinates for the selection
      // Use the start of selection for positioning (top-left of selection)
      const fromCoords = view.coordsAtPos(from);
      const toCoords = view.coordsAtPos(to);

      if (!fromCoords || !toCoords) {
        onShowToolbar(null);
        return;
      }

      // Calculate the bounding rect of the entire selection
      const selectionRect = {
        top: Math.min(fromCoords.top, toCoords.top),
        bottom: Math.max(fromCoords.bottom, toCoords.bottom),
        left: Math.min(fromCoords.left, toCoords.left),
        right: Math.max(fromCoords.right, toCoords.right)
      };

      // Position toolbar above the selection, centered
      const x = (selectionRect.left + selectionRect.right) / 2;
      const y = selectionRect.top;

      onShowToolbar({
        x,
        y,
        from,
        to,
        selectedText,
        selectionRect
      });
    };

    if (debounceMs > 0) {
      debounceTimer = setTimeout(showToolbar, debounceMs);
    } else {
      showToolbar();
    }
  });
}

/**
 * Formatting utilities for the selection toolbar
 */

export type FormatType =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'wikilink';

/**
 * Wraps the current selection with the given markers
 */
export function wrapSelection(view: EditorView, before: string, after: string): void {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);

  view.dispatch({
    changes: { from, to, insert: `${before}${selectedText}${after}` },
    selection: { anchor: from + before.length, head: to + before.length }
  });
}

/**
 * Applies formatting to the current selection
 */
export function applyFormat(view: EditorView, format: FormatType): void {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);

  switch (format) {
    case 'bold':
      wrapSelection(view, '**', '**');
      break;
    case 'italic':
      wrapSelection(view, '*', '*');
      break;
    case 'strikethrough':
      wrapSelection(view, '~~', '~~');
      break;
    case 'code':
      wrapSelection(view, '`', '`');
      break;
    case 'link':
      // Insert markdown link with selected text as link text
      view.dispatch({
        changes: { from, to, insert: `[${selectedText}](url)` },
        // Position cursor at 'url' to allow user to type the URL
        selection: {
          anchor: from + selectedText.length + 3,
          head: from + selectedText.length + 6
        }
      });
      break;
    case 'wikilink':
      // Wrap in wikilink syntax
      wrapSelection(view, '[[', ']]');
      break;
  }
}
