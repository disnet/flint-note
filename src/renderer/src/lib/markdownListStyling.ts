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

      if (lineInfo.isMarkerLine) {
        // Generate dynamic styles based on level and marker type
        const level = lineInfo.level;
        const markerType = lineInfo.markerType;

        if (markerType) {
          const markerVar = `--list-marker-${markerType}-width`;
          const baseIndentVar = '--list-base-indent';
          const linePaddingVar = '--cm-line-padding';

          // Calculate dynamic padding and text-indent using CSS calc
          const paddingLeft =
            level === 0
              ? `calc(var(${linePaddingVar}, 6px) + var(${markerVar}, 1.5ch))`
              : `calc(var(${linePaddingVar}, 6px) + (var(${baseIndentVar}, 2ch) * ${level}) + var(${markerVar}, 1.5ch))`;

          const textIndent =
            level === 0
              ? `calc(-1 * var(${markerVar}, 1.5ch))`
              : `calc((var(${baseIndentVar}, 2ch) * -${level}) - var(${markerVar}, 1.5ch))`;

          decorations.push(
            Decoration.line({
              class: 'cm-list-marker-line',
              attributes: {
                style: `text-indent: ${textIndent}; padding-left: ${paddingLeft};`
              }
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

// Simplified CSS theme - styles are now applied dynamically via inline styles
export const listStylingTheme = EditorView.theme({
  '.cm-list-marker-line': {
    // Base class for all list marker lines - individual styles applied via attributes
  }
});
