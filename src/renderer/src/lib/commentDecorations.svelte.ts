import { EditorView, ViewPlugin } from '@codemirror/view';
import type { ViewUpdate, PluginValue } from '@codemirror/view';
import { StateField, StateEffect, type Extension } from '@codemirror/state';
import type { NoteSuggestion } from '../../../server/types';

/**
 * State effect to update suggestions
 */
export const updateSuggestionsEffect = StateEffect.define<NoteSuggestion[]>();

/**
 * State effect to set expanded suggestion IDs
 */
export const setExpandedEffect = StateEffect.define<Set<string>>();

/**
 * State field that manages comment markers
 */
const commentStateField = StateField.define<{
  suggestions: NoteSuggestion[];
  expanded: Set<string>;
}>({
  create() {
    return {
      suggestions: [],
      expanded: new Set()
    };
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(updateSuggestionsEffect)) {
        return { ...value, suggestions: effect.value };
      }
      if (effect.is(setExpandedEffect)) {
        return { ...value, expanded: effect.value };
      }
    }

    return value;
  }
});

/**
 * Get the highest priority from a list of suggestions
 */
function getHighestPriority(suggestions: NoteSuggestion[]): 'high' | 'medium' | 'low' {
  if (suggestions.some((s) => s.priority === 'high')) return 'high';
  if (suggestions.some((s) => s.priority === 'medium')) return 'medium';
  return 'low';
}

/**
 * Check if any of the suggestions are expanded
 */
function hasExpandedSuggestion(suggestionIds: string[], expanded: Set<string>): boolean {
  return suggestionIds.some((id) => expanded.has(id));
}

/**
 * ViewPlugin that creates a right-side overlay with comment markers
 */
class CommentMarkersPlugin implements PluginValue {
  container: HTMLElement;
  onMarkerClick: (lineNumber: number) => void;

  constructor(view: EditorView, onMarkerClick: (lineNumber: number) => void) {
    this.onMarkerClick = onMarkerClick;

    // Create container inside the editor, positioned on the right
    this.container = document.createElement('div');
    this.container.className = 'cm-comment-markers-container';
    view.dom.appendChild(this.container);

    // Initial render
    this.updateMarkers(view);
  }

  update(update: ViewUpdate): void {
    // Update markers if suggestions changed, document changed, or viewport changed
    const stateChanged = update.transactions.some((tr) =>
      tr.effects.some((e) => e.is(updateSuggestionsEffect) || e.is(setExpandedEffect))
    );

    if (
      stateChanged ||
      update.docChanged ||
      update.viewportChanged ||
      update.geometryChanged
    ) {
      // Use requestMeasure to properly separate read and write phases
      update.view.requestMeasure({
        read: (view) => this.readMarkerPositions(view),
        write: (positions) => this.writeMarkers(positions)
      });
    }
  }

  readMarkerPositions(view: EditorView): Array<{
    lineNumber: number;
    suggestions: NoteSuggestion[];
    priority: 'high' | 'medium' | 'low';
    isExpanded: boolean;
    top: number;
  }> {
    const state = view.state.field(commentStateField);
    const { suggestions, expanded } = state;

    // Group suggestions by line number
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation in function
    const suggestionsByLine = new Map<number, NoteSuggestion[]>();

    for (const suggestion of suggestions) {
      const lineNumber = suggestion.lineNumber ?? 1;
      const lineSuggestions = suggestionsByLine.get(lineNumber) || [];
      lineSuggestions.push(suggestion);
      suggestionsByLine.set(lineNumber, lineSuggestions);
    }

    // Read layout information
    const positions: Array<{
      lineNumber: number;
      suggestions: NoteSuggestion[];
      priority: 'high' | 'medium' | 'low';
      isExpanded: boolean;
      top: number;
    }> = [];

    for (const [lineNumber, lineSuggestions] of suggestionsByLine) {
      try {
        const line = view.state.doc.line(lineNumber);
        const coords = view.coordsAtPos(line.from);

        if (!coords) continue;

        const suggestionIds = lineSuggestions.map((s) => s.id);
        const priority = getHighestPriority(lineSuggestions);
        const isExpanded = hasExpandedSuggestion(suggestionIds, expanded);

        // coords.top is viewport position
        // We need position relative to the editor
        const editorTop = view.dom.getBoundingClientRect().top;
        const relativeTop = coords.top - editorTop;

        positions.push({
          lineNumber,
          suggestions: lineSuggestions,
          priority,
          isExpanded,
          top: relativeTop
        });
      } catch (error) {
        console.warn(`Line ${lineNumber} is out of range`, error);
      }
    }

    return positions;
  }

  writeMarkers(
    positions: Array<{
      lineNumber: number;
      suggestions: NoteSuggestion[];
      priority: 'high' | 'medium' | 'low';
      isExpanded: boolean;
      top: number;
    }>
  ): void {
    // Clear existing markers
    this.container.innerHTML = '';

    // Create markers
    for (const { lineNumber, priority, isExpanded, top } of positions) {
      const marker = document.createElement('div');

      marker.className = `cm-comment-marker priority-${priority}`;
      if (isExpanded) {
        marker.classList.add('expanded');
      }

      marker.style.top = `${top}px`;

      // Create icon
      const icon = document.createElement('span');
      icon.className = 'cm-comment-icon';
      icon.textContent = 'ⓘ';
      marker.appendChild(icon);

      // Add click handler
      marker.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onMarkerClick(lineNumber);
      };

      this.container.appendChild(marker);
    }
  }

  // Legacy method for initial render (when not in a transaction)
  updateMarkers(view: EditorView): void {
    const positions = this.readMarkerPositions(view);
    this.writeMarkers(positions);
  }

  destroy(): void {
    this.container.remove();
  }
}

/**
 * Theme for comment markers
 */
const commentTheme = EditorView.baseTheme({
  '.cm-editor': {
    position: 'relative', // For absolute positioning
    '& .cm-scroller': {
      paddingRight: '48px' // Make room for markers
    }
  },
  '.cm-comment-markers-container': {
    position: 'absolute',
    right: '0',
    top: '0',
    bottom: '0',
    width: '20px',
    pointerEvents: 'none',
    overflow: 'visible',
    zIndex: '100'
  },
  '.cm-comment-marker': {
    position: 'absolute',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    fontSize: '14px',
    borderRadius: '3px',
    padding: '2px',
    transition: 'background-color 0.2s',
    // opacity: '0.6',
    pointerEvents: 'auto',
    height: '20px',
    width: '100%',
    '&:hover': {
      opacity: '1',
      backgroundColor: '#e5e7eb'
    },
    '&.expanded': {
      opacity: '1',
      backgroundColor: '#dbeafe'
    }
  },
  '.cm-comment-icon': {
    lineHeight: '1',
    color: '#6b7280'
  },
  '.cm-comment-count': {
    fontSize: '10px',
    fontWeight: '600',
    lineHeight: '1',
    minWidth: '14px',
    height: '14px',
    borderRadius: '7px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '0 3px'
  },
  '.cm-comment-marker.priority-high .cm-comment-icon': {
    color: '#dc2626'
  },
  '.cm-comment-marker.priority-medium .cm-comment-icon': {
    color: '#f59e0b'
  },
  '.cm-comment-marker.priority-low .cm-comment-icon': {
    color: '#3b82f6'
  },
  // Dark mode styles
  '.cm-editor.cm-focused .cm-comment-marker:hover': {
    backgroundColor: '#374151'
  },
  '.cm-editor.cm-focused .cm-comment-marker.expanded': {
    backgroundColor: '#1e3a8a'
  },
  '@media (prefers-color-scheme: dark)': {
    '.cm-comment-marker:hover': {
      backgroundColor: '#374151'
    },
    '.cm-comment-marker.expanded': {
      backgroundColor: '#1e3a8a'
    },
    '.cm-comment-icon': {
      color: '#9ca3af'
    }
  }
});

/**
 * Create the complete comment decoration extension
 */
export function commentDecorations(
  onMarkerClick: (lineNumber: number) => void
): Extension {
  return [
    commentStateField,
    ViewPlugin.define((view) => new CommentMarkersPlugin(view, onMarkerClick)),
    commentTheme
  ];
}

/**
 * Get suggestions for a specific line number
 */
export function getSuggestionsForLine(
  view: EditorView,
  lineNumber: number
): NoteSuggestion[] {
  const state = view.state.field(commentStateField);
  return state.suggestions.filter((s) => (s.lineNumber ?? 1) === lineNumber);
}

/**
 * Get all suggestions that don't have line numbers (general suggestions)
 */
export function getGeneralSuggestions(view: EditorView): NoteSuggestion[] {
  const state = view.state.field(commentStateField);
  return state.suggestions.filter((s) => s.lineNumber === undefined);
}

/**
 * Get current expanded state
 */
export function getExpandedState(view: EditorView): Set<string> {
  const state = view.state.field(commentStateField);
  return state.expanded;
}
