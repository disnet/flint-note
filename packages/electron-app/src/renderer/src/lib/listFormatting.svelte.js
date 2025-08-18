import { ViewPlugin, Decoration, ViewUpdate, EditorView, WidgetType } from '@codemirror/view';
import { Range } from '@codemirror/state';
class BulletWidget extends WidgetType {
    indentLevel;
    constructor(indentLevel = 0) {
        super();
        this.indentLevel = indentLevel;
    }
    toDOM() {
        const bullet = document.createElement('span');
        bullet.textContent = '•';
        bullet.className = 'cm-list-bullet';
        bullet.style.color = 'var(--text-secondary, #666)';
        bullet.style.fontWeight = 'bold';
        bullet.style.width = '1.5ch';
        bullet.style.textAlign = 'left';
        return bullet;
    }
    eq(other) {
        return other.indentLevel === this.indentLevel;
    }
}
class NumberWidget extends WidgetType {
    number;
    indentLevel;
    constructor(number, indentLevel = 0) {
        super();
        this.number = number;
        this.indentLevel = indentLevel;
    }
    toDOM() {
        const numberSpan = document.createElement('span');
        numberSpan.textContent = this.number;
        numberSpan.className = 'cm-list-number';
        numberSpan.style.color = 'var(--text-secondary, #666)';
        numberSpan.style.fontWeight = 'bold';
        numberSpan.style.width = '2.5ch';
        numberSpan.style.textAlign = 'left';
        numberSpan.style.display = 'inline-block';
        return numberSpan;
    }
    eq(other) {
        return other.number === this.number && other.indentLevel === this.indentLevel;
    }
}
function createListDecorations(view) {
    const decorations = [];
    const doc = view.state.doc;
    for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
        const line = doc.line(lineNum);
        const text = line.text;
        // Match unordered list items: optional whitespace, then "- ", then content
        const unorderedMatch = text.match(/^(\s*)- (.*)$/);
        // Match ordered list items: optional whitespace, then number+dot+space, then content
        const orderedMatch = text.match(/^(\s*)(\d+)\. (.*)$/);
        if (unorderedMatch) {
            const [, indent] = unorderedMatch;
            const indentLevel = Math.floor(indent.length / 2); // 2 spaces per indent level
            const markerStart = line.from + indent.length;
            const markerEnd = markerStart + 2; // "- " is 2 characters
            // Add line decoration for hanging indent styling
            decorations.push(Decoration.line({
                class: `cm-list-line cm-list-unordered cm-list-indent-${indentLevel}`
            }).range(line.from));
            // Replace the original "- " marker with bullet widget
            decorations.push(Decoration.replace({
                widget: new BulletWidget(indentLevel)
            }).range(markerStart, markerEnd));
        }
        else if (orderedMatch) {
            const [, indent, number] = orderedMatch;
            const indentLevel = Math.floor(indent.length / 2); // 2 spaces per indent level
            const markerStart = line.from + indent.length;
            const markerEnd = markerStart + number.length + 2; // number + ". "
            // Add line decoration for hanging indent styling
            decorations.push(Decoration.line({
                class: `cm-list-line cm-list-ordered cm-list-indent-${indentLevel}`
            }).range(line.from));
            // Replace the original number marker with number widget
            decorations.push(Decoration.replace({
                widget: new NumberWidget(`${number}.`, indentLevel)
            }).range(markerStart, markerEnd));
        }
    }
    // Sort decorations by position to ensure proper ordering
    decorations.sort((a, b) => {
        if (a.from !== b.from) {
            return a.from - b.from;
        }
        // If same position, put line decorations first, then widgets, then replacements
        const aIsLine = !!a.value.spec.class;
        const bIsLine = !!b.value.spec.class;
        if (aIsLine && !bIsLine)
            return -1;
        if (!aIsLine && bIsLine)
            return 1;
        const aIsWidget = !!a.value.spec.widget;
        const bIsWidget = !!b.value.spec.widget;
        if (aIsWidget && !bIsWidget)
            return -1;
        if (!aIsWidget && bIsWidget)
            return 1;
        return 0;
    });
    return Decoration.set(decorations);
}
const listFormattingPlugin = ViewPlugin.fromClass(class {
    decorations;
    constructor(view) {
        this.decorations = createListDecorations(view);
    }
    update(update) {
        // Only recreate decorations if the document changed
        if (update.docChanged || update.viewportChanged) {
            this.decorations = createListDecorations(update.view);
        }
    }
}, {
    decorations: (plugin) => plugin.decorations
});
// Theme for list formatting
const listFormattingTheme = EditorView.theme({
    // Base list styling
    '.cm-list-line': {
        position: 'relative'
    },
    // Unordered lists (bullets) - narrower spacing
    '.cm-list-unordered': {
        paddingLeft: '1.5ch',
        textIndent: '-1.5ch'
    },
    '.cm-list-unordered.cm-list-indent-0': {
        paddingLeft: '1.5ch',
        textIndent: '-1.5ch'
    },
    '.cm-list-unordered.cm-list-indent-1': {
        paddingLeft: 'calc(2ch + 1.5ch)',
        textIndent: 'calc(-2ch - 1.5ch)',
        marginLeft: '2ch'
    },
    '.cm-list-unordered.cm-list-indent-2': {
        paddingLeft: 'calc(4ch + 1.5ch)',
        textIndent: 'calc(-4ch - 1.5ch)',
        marginLeft: '4ch'
    },
    '.cm-list-unordered.cm-list-indent-3': {
        paddingLeft: 'calc(6ch + 1.5ch)',
        textIndent: 'calc(-6ch - 1.5ch)',
        marginLeft: '6ch'
    },
    // Ordered lists (numbers) - wider spacing for numbers
    '.cm-list-ordered': {
        paddingLeft: '2.5ch',
        textIndent: '-2.5ch'
    },
    '.cm-list-ordered.cm-list-indent-0': {
        paddingLeft: '2.5ch',
        textIndent: '-2.5ch'
    },
    '.cm-list-ordered.cm-list-indent-1': {
        paddingLeft: 'calc(2ch + 2.5ch)',
        textIndent: 'calc(-2ch - 2.5ch)',
        marginLeft: '2ch'
    },
    '.cm-list-ordered.cm-list-indent-2': {
        paddingLeft: 'calc(4ch + 2.5ch)',
        textIndent: 'calc(-4ch - 2.5ch)',
        marginLeft: '4ch'
    },
    '.cm-list-ordered.cm-list-indent-3': {
        paddingLeft: 'calc(6ch + 2.5ch)',
        textIndent: 'calc(-6ch - 2.5ch)',
        marginLeft: '6ch'
    },
    // Wikilink compatibility
    '.cm-list-line .wikilink': {
        textIndent: '0',
        position: 'relative'
    },
    // Widget styling
    '.cm-list-bullet': {
        userSelect: 'none',
        pointerEvents: 'none',
        textIndent: '0',
        display: 'inline-block'
    },
    '.cm-list-number': {
        userSelect: 'none',
        pointerEvents: 'none',
        textIndent: '0',
        display: 'inline-block'
    }
});
// Export the complete extension
export function listFormattingExtension() {
    return [listFormattingPlugin, listFormattingTheme];
}
