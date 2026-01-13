/**
 * Gutter Plus Button extension for CodeMirror 6
 *
 * Shows a "+" button in the gutter on the focused line.
 * Clicking it opens a menu for inserting blocks (same as slash commands).
 */
import { gutter, GutterMarker, EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { StateField, StateEffect } from '@codemirror/state';

export interface GutterMenuData {
  /** Screen X coordinate for menu positioning */
  x: number;
  /** Screen Y coordinate for menu positioning */
  y: number;
  /** The line position in the document */
  linePos: number;
}

export type GutterMenuHandler = (data: GutterMenuData | null) => void;

/**
 * Effect to update the current cursor line number
 */
const setCursorLineEffect = StateEffect.define<number>();

/**
 * StateField to track the cursor line number (1-indexed line number, not position)
 */
const cursorLineField = StateField.define<number>({
  create: (state) => state.doc.lineAt(state.selection.main.head).number,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setCursorLineEffect)) {
        return e.value;
      }
    }
    // Recalculate when selection changes (check if transaction has selection)
    if (tr.selection) {
      return tr.state.doc.lineAt(tr.state.selection.main.head).number;
    }
    return value;
  }
});

/**
 * Plus button gutter marker
 */
class PlusButtonMarker extends GutterMarker {
  constructor(
    private onClick: (e: MouseEvent, element: HTMLElement) => void,
    private lineFrom: number
  ) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return other instanceof PlusButtonMarker && other.lineFrom === this.lineFrom;
  }

  toDOM(): HTMLElement {
    const button = document.createElement('button');
    button.className = 'gutter-plus-button visible';
    button.type = 'button';
    button.title = 'Insert block';
    button.textContent = '+';
    button.setAttribute('aria-label', 'Insert block');

    // Use mousedown to capture before blur
    button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick(e, button);
    });

    return button;
  }
}

/**
 * CSS theme for the gutter plus button
 */
const gutterPlusTheme = EditorView.theme({
  '.cm-gutter-plus': {
    width: '24px',
    flexShrink: '0'
  },
  '.gutter-plus-button': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    margin: '2px',
    padding: '0',
    border: 'none',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: '16px',
    fontWeight: '300',
    cursor: 'pointer',
    opacity: '0',
    transition: 'opacity 0.15s ease, background-color 0.15s ease',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  '.gutter-plus-button.visible': {
    opacity: '1'
  },
  '.gutter-plus-button:hover': {
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)'
  },
  '.gutter-plus-button:active': {
    background: 'var(--bg-tertiary)'
  },
  // Touch device styles - larger touch target
  '@media (hover: none)': {
    '.gutter-plus-button.visible': {
      width: '28px',
      height: '28px',
      fontSize: '18px'
    }
  }
});

/**
 * Creates a gutter plus button extension for CodeMirror.
 *
 * @param onShowMenu - Callback when the plus button is clicked
 * @returns CodeMirror extension
 */
export function gutterPlusButtonExtension(onShowMenu: GutterMenuHandler): Extension {
  // Track the previous cursor line to detect actual line changes
  let prevCursorLine = -1;

  return [
    cursorLineField,
    gutterPlusTheme,
    gutter({
      class: 'cm-gutter-plus',
      lineMarker: (view, line) => {
        // Get the current cursor line
        const cursorLine = view.state.doc.lineAt(view.state.selection.main.head);

        // Only show on cursor line
        if (line.from === cursorLine.from) {
          return new PlusButtonMarker((_e, element) => {
            const rect = element.getBoundingClientRect();
            onShowMenu({
              x: rect.right + 4,
              y: rect.top,
              linePos: line.from
            });
          }, line.from);
        }

        return null;
      },
      lineMarkerChange: (update) => {
        // Only rebuild markers when cursor moves to a different line
        if (update.selectionSet) {
          const newLine = update.state.doc.lineAt(
            update.state.selection.main.head
          ).number;
          if (newLine !== prevCursorLine) {
            prevCursorLine = newLine;
            return true;
          }
        }
        return false;
      }
    })
  ];
}
