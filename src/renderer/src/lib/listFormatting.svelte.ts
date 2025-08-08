import {
  ViewPlugin,
  Decoration,
  ViewUpdate,
  EditorView,
  WidgetType
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { Range } from '@codemirror/state';

class BulletWidget extends WidgetType {
  constructor(private indentLevel: number = 0) {
    super();
  }

  toDOM(): HTMLElement {
    const bullet = document.createElement('span');
    bullet.textContent = '•';
    bullet.className = 'cm-list-bullet';
    bullet.style.color = 'var(--text-secondary, #666)';
    bullet.style.fontWeight = 'bold';
    bullet.style.marginRight = '0.5em';

    // Add left margin for nested lists
    if (this.indentLevel > 0) {
      bullet.style.marginLeft = `${this.indentLevel * 1.5}em`;
    }

    return bullet;
  }

  eq(other: BulletWidget): boolean {
    return other.indentLevel === this.indentLevel;
  }
}

function createListDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc;

  for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
    const line = doc.line(lineNum);
    const text = line.text;

    // Match list items: optional whitespace, then "- ", then content
    const listMatch = text.match(/^(\s*)- (.*)$/);

    if (listMatch) {
      const [, indent] = listMatch;
      const indentLevel = Math.floor(indent.length / 2); // 2 spaces per indent level
      const markerStart = line.from + indent.length;
      const markerEnd = markerStart + 2; // "- " is 2 characters

      // Add line decoration for hanging indent styling
      decorations.push(
        Decoration.line({
          class: 'cm-list-line'
        }).range(line.from)
      );

      // Add bullet widget before the marker
      decorations.push(
        Decoration.widget({
          widget: new BulletWidget(indentLevel),
          side: -1
        }).range(markerStart)
      );

      // Hide the original "- " marker with a mark decoration instead of replace
      decorations.push(
        Decoration.mark({
          attributes: {
            style: 'opacity: 0; font-size: 0; width: 0; display: inline-block; overflow: hidden;'
          }
        }).range(markerStart, markerEnd)
      );
    }
  }

  // Sort decorations by position to ensure proper ordering
  decorations.sort((a, b) => {
    if (a.from !== b.from) {
      return a.from - b.from;
    }
    // If same position, put line decorations first, then widgets, then marks
    const aIsLine = !!a.value.spec.class;
    const bIsLine = !!b.value.spec.class;
    if (aIsLine && !bIsLine) return -1;
    if (!aIsLine && bIsLine) return 1;
    
    const aIsWidget = !!a.value.spec.widget;
    const bIsWidget = !!b.value.spec.widget;
    if (aIsWidget && !bIsWidget) return -1;
    if (!aIsWidget && bIsWidget) return 1;
    
    return 0;
  });

  return Decoration.set(decorations);
}

const listFormattingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = createListDecorations(view);
    }

    update(update: ViewUpdate): void {
      // Only recreate decorations if the document changed
      if (update.docChanged || update.viewportChanged) {
        this.decorations = createListDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations
  }
);

// Theme for list formatting  
const listFormattingTheme = EditorView.theme({
  '.cm-list-line': {
    paddingLeft: '1.5em',
    textIndent: '-1.5em',
    position: 'relative'
  },
  '.cm-list-line .wikilink': {
    textIndent: '0',
    position: 'relative'
  },
  '.cm-list-bullet': {
    userSelect: 'none',
    pointerEvents: 'none',
    textIndent: '0',
    display: 'inline-block'
  }
});

// Export the complete extension
export function listFormattingExtension(): (
  | typeof listFormattingPlugin
  | typeof listFormattingTheme
)[] {
  return [listFormattingPlugin, listFormattingTheme];
}
