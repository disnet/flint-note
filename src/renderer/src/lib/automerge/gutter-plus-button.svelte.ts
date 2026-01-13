/**
 * Gutter Plus Button extension for CodeMirror 6
 *
 * Shows a "+" button in the gutter on the line the mouse is hovering over.
 * Fades out when the user is typing.
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
 * Effect to update the hovered line number
 */
const setHoveredLineEffect = StateEffect.define<number | null>();

/**
 * Effect to indicate typing has occurred (to fade out button)
 */
const setTypingEffect = StateEffect.define<boolean>();

/**
 * StateField to track the hovered line number (1-indexed line number, not position)
 * null means mouse is not hovering over any line
 */
const hoveredLineField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setHoveredLineEffect)) {
        return e.value;
      }
    }
    return value;
  }
});

/**
 * StateField to track whether the user is currently typing
 * When true, the button should be hidden
 */
const isTypingField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setTypingEffect)) {
        return e.value;
      }
    }
    // If the document changed (typing), set isTyping to true
    if (tr.docChanged) {
      return true;
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
    button.setAttribute('aria-label', 'Insert block');

    // Create SVG plus icon
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 14 14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');

    // Horizontal line
    const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hLine.setAttribute('x1', '2');
    hLine.setAttribute('y1', '7');
    hLine.setAttribute('x2', '12');
    hLine.setAttribute('y2', '7');

    // Vertical line
    const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    vLine.setAttribute('x1', '7');
    vLine.setAttribute('y1', '2');
    vLine.setAttribute('x2', '7');
    vLine.setAttribute('y2', '12');

    svg.appendChild(hLine);
    svg.appendChild(vLine);
    button.appendChild(svg);

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
  // Make the overall gutters container transparent and borderless
  // Use longer selector chain for higher specificity to override theme styles
  '& .cm-scroller .cm-gutters': {
    background: 'transparent',
    backgroundColor: 'transparent',
    color: 'inherit',
    border: 'none',
    borderRight: 'none',
    padding: '0'
  },
  // Also ensure the active line gutter has no background
  '& .cm-scroller .cm-activeLineGutter': {
    background: 'transparent'
  },
  '& .cm-gutterElement': {
    paddingTop: '2px'
  },
  '.cm-gutter-plus': {
    width: '24px',
    flexShrink: '0',
    background: 'transparent',
    marginLeft: '-24px'
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
    cursor: 'pointer',
    opacity: '0',
    transition: 'opacity 0.15s ease, background-color 0.15s ease'
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
      height: '28px'
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
  // Track the previous hovered line to detect actual line changes
  let prevHoveredLine: number | null = null;

  return [
    hoveredLineField,
    isTypingField,
    gutterPlusTheme,
    // Mouse event handlers to track hover
    EditorView.domEventHandlers({
      mousemove(event, view) {
        // Get the line at the mouse position
        let lineNumber: number | null = null;

        // First try direct position lookup
        let pos = view.posAtCoords({ x: event.clientX, y: event.clientY });

        // If that fails (mouse in gutter/empty space), try using a point inside the content area
        if (pos === null) {
          const contentRect = view.contentDOM.getBoundingClientRect();
          // Use a point just inside the content area at the same Y level
          pos = view.posAtCoords({ x: contentRect.left + 1, y: event.clientY });
        }

        if (pos !== null) {
          lineNumber = view.state.doc.lineAt(pos).number;
        }

        if (lineNumber !== null) {
          const currentHoveredLine = view.state.field(hoveredLineField);
          const isTyping = view.state.field(isTypingField);
          // Update if line changed or need to clear typing state
          if (lineNumber !== currentHoveredLine || isTyping) {
            view.dispatch({
              effects: [
                setHoveredLineEffect.of(lineNumber),
                // Clear typing state when mouse moves
                setTypingEffect.of(false)
              ]
            });
          }
        }
        return false;
      },
      mouseleave(event, view) {
        // Check if we're moving to a child element (like the gutter button)
        // If so, don't hide the button
        const relatedTarget = event.relatedTarget as Node | null;
        if (relatedTarget && view.dom.contains(relatedTarget)) {
          return false;
        }
        view.dispatch({
          effects: setHoveredLineEffect.of(null)
        });
        return false;
      }
    }),
    gutter({
      class: 'cm-gutter-plus',
      lineMarker: (view, line) => {
        // Check if user is typing - hide the button
        const isTyping = view.state.field(isTypingField);
        if (isTyping) {
          return null;
        }

        // Get the hovered line number
        const hoveredLineNum = view.state.field(hoveredLineField);
        if (hoveredLineNum === null) {
          return null;
        }

        // Get the line number for this line
        const thisLineNum = view.state.doc.lineAt(line.from).number;

        // Only show on hovered line
        if (thisLineNum === hoveredLineNum) {
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
        // Rebuild markers when hovered line changes
        const newHoveredLine = update.state.field(hoveredLineField);
        const isTyping = update.state.field(isTypingField);
        const prevIsTyping = update.startState.field(isTypingField);

        // Rebuild if hover line changed or typing state changed
        if (newHoveredLine !== prevHoveredLine || isTyping !== prevIsTyping) {
          prevHoveredLine = newHoveredLine;
          return true;
        }
        return false;
      }
    })
  ];
}
