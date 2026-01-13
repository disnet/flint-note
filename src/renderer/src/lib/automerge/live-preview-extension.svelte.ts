/**
 * Live Preview Extension for CodeMirror
 *
 * Implements Obsidian-style markdown live preview:
 * - When cursor is away from formatted text, hide syntax markers and show styled content
 * - When cursor is near/inside formatted text, reveal the raw markdown for editing
 */
import {
  EditorView,
  Decoration,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { Range, Extension, EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef } from '@lezer/common';
import { livePreviewTheme, livePreviewDarkTheme } from '../live-preview-theme';

/**
 * Widget for rendering task list checkboxes
 * Stores position info to enable click-to-toggle functionality
 */
class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly checkboxFrom: number, // Position of [ or [x in the document
    readonly checkboxTo: number // Position after ] in the document
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = `live-preview-task-checkbox ${this.checked ? 'checked' : 'unchecked'}`;

    // Use an inner box element for styled checkbox
    const box = document.createElement('span');
    box.className = 'checkbox-box';

    if (this.checked) {
      // Create SVG checkmark using DOM methods
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 12 12');
      svg.setAttribute('fill', 'none');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M2.5 6L5 8.5L9.5 4');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
      box.appendChild(svg);
    }

    span.appendChild(box);

    // Store position data for click handling
    span.dataset.checkboxFrom = String(this.checkboxFrom);
    span.dataset.checkboxTo = String(this.checkboxTo);
    span.dataset.checked = String(this.checked);
    return span;
  }

  eq(other: TaskCheckboxWidget): boolean {
    return (
      this.checked === other.checked &&
      this.checkboxFrom === other.checkboxFrom &&
      this.checkboxTo === other.checkboxTo
    );
  }

  // Don't ignore events on this widget so clicks work
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Types of markdown formatting we handle
 */
type FormattingType =
  | 'bold'
  | 'italic'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'code'
  | 'strikethrough'
  | 'horizontalrule'
  | 'blockquote'
  | 'task-unchecked'
  | 'task-checked';

/**
 * Represents a formatted region in the document
 */
interface FormattedRange {
  from: number; // Start of entire formatted region (including markers)
  to: number; // End of entire formatted region
  contentFrom: number; // Start of content (after opening marker)
  contentTo: number; // End of content (before closing marker)
  openMarkerFrom: number; // Opening marker start
  openMarkerTo: number; // Opening marker end
  closeMarkerFrom: number; // Closing marker start (same as to if no closing marker)
  closeMarkerTo: number; // Closing marker end
  type: FormattingType;
  isLineLevel: boolean; // True for headings (applies to whole line)
}

/**
 * Check if cursor position is within or at the boundaries of a range
 */
function isCursorNear(cursorPos: number, from: number, to: number): boolean {
  return cursorPos >= from && cursorPos <= to;
}

/**
 * Check if a selection overlaps with a range
 */
function selectionOverlaps(
  selFrom: number,
  selTo: number,
  rangeFrom: number,
  rangeTo: number
): boolean {
  return !(selTo < rangeFrom || selFrom > rangeTo);
}

/**
 * Check if a node is inside a code block (fenced code or code block)
 */
function isInsideCodeBlock(node: SyntaxNodeRef): boolean {
  let current = node.node.parent;
  while (current) {
    if (current.name === 'FencedCode' || current.name === 'CodeBlock') {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Parse emphasis nodes (bold, italic, strikethrough)
 * These have symmetric opening and closing markers
 */
function parseEmphasis(
  node: SyntaxNodeRef,
  type: FormattingType,
  markerLen: number
): FormattedRange {
  return {
    from: node.from,
    to: node.to,
    contentFrom: node.from + markerLen,
    contentTo: node.to - markerLen,
    openMarkerFrom: node.from,
    openMarkerTo: node.from + markerLen,
    closeMarkerFrom: node.to - markerLen,
    closeMarkerTo: node.to,
    type,
    isLineLevel: false
  };
}

/**
 * Parse heading nodes
 * These only have an opening marker (# ## ### etc) followed by space
 */
function parseHeading(
  node: SyntaxNodeRef,
  type: FormattingType,
  doc: string
): FormattedRange | null {
  // Find the HeaderMark child to get exact marker position
  const text = doc.slice(node.from, node.to);
  const match = text.match(/^(#{1,6})\s/);

  if (!match) {
    return null;
  }

  const markerLen = match[1].length + 1; // # chars plus space

  return {
    from: node.from,
    to: node.to,
    contentFrom: node.from + markerLen,
    contentTo: node.to,
    openMarkerFrom: node.from,
    openMarkerTo: node.from + markerLen,
    closeMarkerFrom: node.to, // No closing marker
    closeMarkerTo: node.to,
    type,
    isLineLevel: true
  };
}

/**
 * Parse horizontal rule nodes
 * These are line-level elements with no content (---, ***, ___)
 */
function parseHorizontalRule(node: SyntaxNodeRef): FormattedRange {
  return {
    from: node.from,
    to: node.to,
    contentFrom: node.from, // No content - entire thing is the marker
    contentTo: node.from, // Empty content range
    openMarkerFrom: node.from,
    openMarkerTo: node.to,
    closeMarkerFrom: node.to, // No closing marker
    closeMarkerTo: node.to,
    type: 'horizontalrule',
    isLineLevel: true
  };
}

/**
 * Parse inline code nodes
 * These have backticks on each side
 */
function parseInlineCode(node: SyntaxNodeRef, doc: string): FormattedRange | null {
  const text = doc.slice(node.from, node.to);

  // Count opening backticks (could be ` or `` or more)
  const openMatch = text.match(/^(`+)/);
  if (!openMatch) {
    return null;
  }

  const markerLen = openMatch[1].length;

  // Verify closing backticks match
  const closeMatch = text.match(/(`+)$/);
  if (!closeMatch || closeMatch[1].length !== markerLen) {
    return null;
  }

  return {
    from: node.from,
    to: node.to,
    contentFrom: node.from + markerLen,
    contentTo: node.to - markerLen,
    openMarkerFrom: node.from,
    openMarkerTo: node.from + markerLen,
    closeMarkerFrom: node.to - markerLen,
    closeMarkerTo: node.to,
    type: 'code',
    isLineLevel: false
  };
}

/**
 * Represents a blockquote line marker (the > character)
 */
interface BlockquoteMarker {
  lineFrom: number; // Start of the line
  markerFrom: number; // Start of the > marker
  markerTo: number; // End of the > marker (including space)
}

/**
 * Find all blockquote markers (> ) in the viewport
 * Returns line-by-line markers rather than the full blockquote range
 */
function findBlockquoteMarkers(
  state: EditorState,
  viewFrom: number,
  viewTo: number
): BlockquoteMarker[] {
  const markers: BlockquoteMarker[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    from: viewFrom,
    to: viewTo,
    enter: (node) => {
      if (node.name === 'QuoteMark') {
        // QuoteMark is the > character
        // Find the line this is on
        const line = state.doc.lineAt(node.from);
        markers.push({
          lineFrom: line.from,
          markerFrom: node.from,
          markerTo: node.to + 1 // Include the space after >
        });
      }
    }
  });

  return markers;
}

/**
 * Represents a task list item
 */
interface TaskItem {
  from: number; // Start of the task marker (- [ ] or - [x])
  to: number; // End of the task marker
  checked: boolean;
  lineFrom: number; // Start of the line
  checkboxFrom: number; // Position of the [ character
  checkboxTo: number; // Position after the ] character
}

/**
 * Find all task list items in the viewport using regex
 * (doesn't rely on GFM syntax tree support)
 */
function findTaskItems(state: EditorState, viewFrom: number, viewTo: number): TaskItem[] {
  const items: TaskItem[] = [];
  const doc = state.doc;

  // Get the line range that overlaps with the viewport
  const startLine = doc.lineAt(viewFrom);
  const endLine = doc.lineAt(viewTo);

  // Scan each line for task list patterns
  for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
    const line = doc.line(lineNum);
    const lineText = line.text;

    // Match task list pattern: optional indent, list marker (- * +), space, [ ] or [x]
    const match = lineText.match(/^(\s*)([-*+])\s+(\[([xX ])\])/);

    if (match) {
      const indent = match[1].length;
      const listMarker = match[2];
      const checkChar = match[4];
      const checked = checkChar === 'x' || checkChar === 'X';

      // Calculate positions
      const fullMarkerStart = line.from + indent;
      const fullMarkerEnd = line.from + match[0].length;

      // Position of [ ] or [x] specifically
      const checkboxStart = line.from + indent + listMarker.length + 1; // after "- "
      const checkboxEnd = checkboxStart + 3; // [ ] is 3 characters

      items.push({
        from: fullMarkerStart,
        to: fullMarkerEnd,
        checked,
        lineFrom: line.from,
        checkboxFrom: checkboxStart,
        checkboxTo: checkboxEnd
      });
    }
  }

  return items;
}

/**
 * Map syntax tree node to formatted range
 */
function nodeToFormattedRange(node: SyntaxNodeRef, doc: string): FormattedRange | null {
  // Skip nodes inside code blocks
  if (isInsideCodeBlock(node)) {
    return null;
  }

  switch (node.name) {
    case 'StrongEmphasis':
      return parseEmphasis(node, 'bold', 2); // **

    case 'Emphasis':
      return parseEmphasis(node, 'italic', 1); // *

    case 'ATXHeading1':
      return parseHeading(node, 'heading1', doc);

    case 'ATXHeading2':
      return parseHeading(node, 'heading2', doc);

    case 'ATXHeading3':
      return parseHeading(node, 'heading3', doc);

    case 'ATXHeading4':
      return parseHeading(node, 'heading4', doc);

    case 'ATXHeading5':
      return parseHeading(node, 'heading5', doc);

    case 'ATXHeading6':
      return parseHeading(node, 'heading6', doc);

    case 'InlineCode':
      return parseInlineCode(node, doc);

    case 'Strikethrough':
      return parseEmphasis(node, 'strikethrough', 2); // ~~

    case 'HorizontalRule':
      return parseHorizontalRule(node);

    default:
      return null;
  }
}

/**
 * ViewPlugin that manages live preview decorations
 */
class LivePreviewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate): void {
    // Rebuild decorations when document, selection, or viewport changes
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    const state = view.state;
    const doc = state.doc.toString();
    const tree = syntaxTree(state);

    // Get cursor position and selection
    const selection = state.selection.main;
    const cursorPos = selection.head;
    const selFrom = selection.from;
    const selTo = selection.to;

    // Collect all formatted ranges in visible viewport
    const ranges: FormattedRange[] = [];
    const { from: viewFrom, to: viewTo } = view.viewport;

    tree.iterate({
      from: viewFrom,
      to: viewTo,
      enter: (node) => {
        const range = nodeToFormattedRange(node, doc);
        if (range) {
          ranges.push(range);
        }
      }
    });

    // Sort ranges by start position
    ranges.sort((a, b) => a.from - b.from);

    // Track which ranges are being edited (cursor or selection near them)
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local variable, not reactive state
    const editingRanges = new Set<FormattedRange>();
    for (const range of ranges) {
      const cursorNear = isCursorNear(cursorPos, range.from, range.to);
      const selectionNear = selectionOverlaps(selFrom, selTo, range.from, range.to);

      if (cursorNear || selectionNear) {
        editingRanges.add(range);

        // For nested formatting, mark parent ranges as editing too
        for (const otherRange of ranges) {
          if (
            otherRange !== range &&
            otherRange.from <= range.from &&
            otherRange.to >= range.to
          ) {
            editingRanges.add(otherRange);
          }
        }
      }
    }

    // Build decorations for each range
    for (const range of ranges) {
      const isEditing = editingRanges.has(range);

      if (isEditing) {
        // Cursor/selection is near - show raw markdown with muted markers
        // Style the markers as muted
        if (range.openMarkerFrom < range.openMarkerTo) {
          decorations.push(
            Decoration.mark({ class: 'live-preview-marker' }).range(
              range.openMarkerFrom,
              range.openMarkerTo
            )
          );
        }
        if (range.closeMarkerFrom < range.closeMarkerTo) {
          decorations.push(
            Decoration.mark({ class: 'live-preview-marker' }).range(
              range.closeMarkerFrom,
              range.closeMarkerTo
            )
          );
        }
      } else {
        // Cursor is away - hide markers and style content
        // Special case: horizontal rules have no content (entire line is marker)
        if (range.type === 'horizontalrule') {
          // Hide the --- text and add a line decoration for the horizontal rule
          decorations.push(
            Decoration.replace({}).range(range.openMarkerFrom, range.openMarkerTo)
          );
          // Add line decoration for the styled horizontal rule
          decorations.push(
            Decoration.line({ class: 'live-preview-horizontalrule' }).range(range.from)
          );
        } else if (range.contentFrom < range.contentTo) {
          // Normal case: hide markers and style content
          // Hide opening marker
          if (range.openMarkerFrom < range.openMarkerTo) {
            decorations.push(
              Decoration.replace({}).range(range.openMarkerFrom, range.openMarkerTo)
            );
          }

          // Hide closing marker
          if (range.closeMarkerFrom < range.closeMarkerTo) {
            decorations.push(
              Decoration.replace({}).range(range.closeMarkerFrom, range.closeMarkerTo)
            );
          }

          // Style the content
          const className = `live-preview-${range.type}`;
          decorations.push(
            Decoration.mark({ class: className }).range(
              range.contentFrom,
              range.contentTo
            )
          );
        }
      }
    }

    // Handle blockquote markers (> at start of lines)
    const blockquoteMarkers = findBlockquoteMarkers(state, viewFrom, viewTo);
    for (const marker of blockquoteMarkers) {
      const line = state.doc.lineAt(marker.lineFrom);
      const cursorOnLine = cursorPos >= line.from && cursorPos <= line.to;
      const selectionOnLine = selectionOverlaps(selFrom, selTo, line.from, line.to);

      if (cursorOnLine || selectionOnLine) {
        // Cursor on this line - show muted marker
        decorations.push(
          Decoration.mark({ class: 'live-preview-marker' }).range(
            marker.markerFrom,
            Math.min(marker.markerTo, line.to)
          )
        );
      } else {
        // Cursor away - hide marker and add line styling
        decorations.push(
          Decoration.replace({}).range(
            marker.markerFrom,
            Math.min(marker.markerTo, line.to)
          )
        );
        decorations.push(
          Decoration.line({ class: 'live-preview-blockquote' }).range(line.from)
        );
      }
    }

    // Handle task list items (- [ ] or - [x])
    const taskItems = findTaskItems(state, viewFrom, viewTo);
    for (const task of taskItems) {
      const line = state.doc.lineAt(task.lineFrom);
      const cursorOnLine = cursorPos >= line.from && cursorPos <= line.to;
      const selectionOnLine = selectionOverlaps(selFrom, selTo, line.from, line.to);

      if (cursorOnLine || selectionOnLine) {
        // Cursor on this line - show muted marker
        decorations.push(
          Decoration.mark({ class: 'live-preview-marker' }).range(task.from, task.to)
        );
      } else {
        // Cursor away - replace with checkbox widget
        decorations.push(
          Decoration.replace({
            widget: new TaskCheckboxWidget(
              task.checked,
              task.checkboxFrom,
              task.checkboxTo
            )
          }).range(task.from, task.to)
        );

        // Add strikethrough to checked task text
        if (task.checked && task.to < line.to) {
          decorations.push(
            Decoration.mark({ class: 'live-preview-task-checked-text' }).range(
              task.to,
              line.to
            )
          );
        }
      }
    }

    // Sort decorations by position (required by CodeMirror)
    return Decoration.set(
      decorations.sort((a, b) => a.from - b.from),
      true
    );
  }
}

/**
 * Create the live preview ViewPlugin
 */
const livePreviewPlugin = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (plugin) => plugin.decorations
});

/**
 * DOM event handler for checkbox clicks
 * Toggles the task checkbox state when clicked
 * Uses mousedown to intercept before focus/cursor placement
 */
const taskCheckboxClickHandler = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    const target = event.target as HTMLElement;

    // Check if the click was on a task checkbox or any of its children
    const checkbox = target.closest('.live-preview-task-checkbox') as HTMLElement | null;
    if (checkbox) {
      // Prevent default immediately to stop cursor placement
      event.preventDefault();
      event.stopPropagation();

      const checkboxFrom = checkbox.dataset.checkboxFrom;
      const checkboxTo = checkbox.dataset.checkboxTo;
      const isChecked = checkbox.dataset.checked === 'true';

      if (checkboxFrom && checkboxTo) {
        const from = parseInt(checkboxFrom, 10);
        const to = parseInt(checkboxTo, 10);

        // Toggle the checkbox: [ ] -> [x] or [x] -> [ ]
        const newText = isChecked ? '[ ]' : '[x]';

        view.dispatch({
          changes: { from, to, insert: newText }
        });

        return true;
      }
    }

    return false;
  }
});

/**
 * Main extension export - includes plugin and themes
 */
export function livePreviewExtension(): Extension {
  return [
    livePreviewPlugin,
    livePreviewTheme,
    livePreviewDarkTheme,
    taskCheckboxClickHandler
  ];
}
