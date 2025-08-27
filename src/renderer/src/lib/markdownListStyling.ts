import { ViewPlugin, Decoration, ViewUpdate } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { EditorView } from 'codemirror';
import type { Range } from '@codemirror/state';
import { parseListLine } from './markdownListParser';

class ListStylePlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    const doc = view.state.doc;
    const lines: string[] = [];

    // Extract all lines for context analysis
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      lines.push(line.text);
    }

    // Process each line
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const lineText = line.text;
      const lineInfo = parseListLine(lineText);

      const cssClasses: string[] = [];

      if (lineInfo.isMarkerLine) {
        // This is a marker line
        cssClasses.push('cm-list-marker-line');
        cssClasses.push(`cm-list-level-${lineInfo.level}`);
        if (lineInfo.markerType) {
          cssClasses.push(`cm-list-marker-${lineInfo.markerType}`);
        }

        if (cssClasses.length > 0) {
          decorations.push(
            Decoration.line({
              class: cssClasses.join(' ')
            }).range(line.from)
          );
        }
      }
    }

    return Decoration.set(decorations);
  }
}

export const markdownListStyling = ViewPlugin.fromClass(ListStylePlugin, {
  decorations: (plugin) => plugin.decorations
});

// CSS theme for list styling with custom properties using hanging indent
// Note: CodeMirror lines have default padding that we need to work with
export const listStylingTheme = EditorView.theme({
  // Level 0 list items - marker flush with normal text, wrapped text indented to align with content
  // We need to account for cm-line's existing padding
  '.cm-line.cm-list-level-0.cm-list-marker-line.cm-list-marker-dash': {
    textIndent: 'calc(-1 * var(--list-marker-dash-width, 1.5ch))',
    paddingLeft: 'calc(6px + var(--list-marker-dash-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-0.cm-list-marker-line.cm-list-marker-star': {
    textIndent: 'calc(-1 * var(--list-marker-star-width, 1.5ch))',
    paddingLeft: 'calc(6px + var(--list-marker-star-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-0.cm-list-marker-line.cm-list-marker-plus': {
    textIndent: 'calc(-1 * var(--list-marker-plus-width, 1.5ch))',
    paddingLeft: 'calc(6px + var(--list-marker-plus-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-0.cm-list-marker-line.cm-list-marker-num1': {
    textIndent: 'calc(-1 * var(--list-marker-num1-width, 2ch))',
    paddingLeft: 'calc(6px + var(--list-marker-num1-width, 2ch))'
  },

  '.cm-line.cm-list-level-0.cm-list-marker-line.cm-list-marker-num2': {
    textIndent: 'calc(-1 * var(--list-marker-num2-width, 3ch))',
    paddingLeft: 'calc(6px + var(--list-marker-num2-width, 3ch))'
  },

  '.cm-line.cm-list-level-0.cm-list-marker-line.cm-list-marker-num3': {
    textIndent: 'calc(-1 * var(--list-marker-num3-width, 4ch))',
    paddingLeft: 'calc(6px + var(--list-marker-num3-width, 4ch))'
  },

  // Level 1 list items - base indent plus hanging indent
  '.cm-line.cm-list-level-1.cm-list-marker-line.cm-list-marker-dash': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -1) - var(--list-marker-dash-width, 1.5ch))',
    paddingLeft:
      'calc(6px + var(--list-base-indent, 2ch) + var(--list-marker-dash-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-1.cm-list-marker-line.cm-list-marker-star': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -1) - var(--list-marker-star-width, 1.5ch))',
    paddingLeft:
      'calc(6px + var(--list-base-indent, 2ch) + var(--list-marker-star-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-1.cm-list-marker-line.cm-list-marker-plus': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -1) - var(--list-marker-plus-width, 1.5ch))',
    paddingLeft:
      'calc(6px + var(--list-base-indent, 2ch) + var(--list-marker-plus-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-1.cm-list-marker-line.cm-list-marker-num1': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -1) - var(--list-marker-num1-width, 2ch))',
    paddingLeft:
      'calc(6px + var(--list-base-indent, 2ch) + var(--list-marker-num1-width, 2ch))'
  },

  '.cm-line.cm-list-level-1.cm-list-marker-line.cm-list-marker-num2': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -1) - var(--list-marker-num2-width, 3ch))',
    paddingLeft:
      'calc(6px + var(--list-base-indent, 2ch) + var(--list-marker-num2-width, 3ch))'
  },

  '.cm-line.cm-list-level-1.cm-list-marker-line.cm-list-marker-num3': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -1) - var(--list-marker-num3-width, 4ch))',
    paddingLeft:
      'calc(6px + var(--list-base-indent, 2ch) + var(--list-marker-num3-width, 4ch))'
  },

  // Level 2 list items
  '.cm-line.cm-list-level-2.cm-list-marker-line.cm-list-marker-dash': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -2) - var(--list-marker-dash-width, 1.5ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 2) + var(--list-marker-dash-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-2.cm-list-marker-line.cm-list-marker-star': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -2) - var(--list-marker-star-width, 1.5ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 2) + var(--list-marker-star-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-2.cm-list-marker-line.cm-list-marker-plus': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -2) - var(--list-marker-plus-width, 1.5ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 2) + var(--list-marker-plus-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-2.cm-list-marker-line.cm-list-marker-num1': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -2) - var(--list-marker-num1-width, 2ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 2) + var(--list-marker-num1-width, 2ch))'
  },

  '.cm-line.cm-list-level-2.cm-list-marker-line.cm-list-marker-num2': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -2) - var(--list-marker-num2-width, 3ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 2) + var(--list-marker-num2-width, 3ch))'
  },

  '.cm-line.cm-list-level-2.cm-list-marker-line.cm-list-marker-num3': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -2) - var(--list-marker-num3-width, 4ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 2) + var(--list-marker-num3-width, 4ch))'
  },

  // Level 3 list items
  '.cm-line.cm-list-level-3.cm-list-marker-line.cm-list-marker-dash': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -3) - var(--list-marker-dash-width, 1.5ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 3) + var(--list-marker-dash-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-3.cm-list-marker-line.cm-list-marker-star': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -3) - var(--list-marker-star-width, 1.5ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 3) + var(--list-marker-star-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-3.cm-list-marker-line.cm-list-marker-plus': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -3) - var(--list-marker-plus-width, 1.5ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 3) + var(--list-marker-plus-width, 1.5ch))'
  },

  '.cm-line.cm-list-level-3.cm-list-marker-line.cm-list-marker-num1': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -3) - var(--list-marker-num1-width, 2ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 3) + var(--list-marker-num1-width, 2ch))'
  },

  '.cm-line.cm-list-level-3.cm-list-marker-line.cm-list-marker-num2': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -3) - var(--list-marker-num2-width, 3ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 3) + var(--list-marker-num2-width, 3ch))'
  },

  '.cm-line.cm-list-level-3.cm-list-marker-line.cm-list-marker-num3': {
    textIndent:
      'calc((var(--list-base-indent, 2ch) * -3) - var(--list-marker-num3-width, 4ch))',
    paddingLeft:
      'calc(6px + (var(--list-base-indent, 2ch) * 3) + var(--list-marker-num3-width, 4ch))'
  }
});
