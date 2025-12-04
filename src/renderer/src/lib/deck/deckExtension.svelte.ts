/**
 * CodeMirror extension for rendering flint-deck blocks as interactive widgets
 */

import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import {
  StateField,
  StateEffect,
  Range,
  EditorState,
  Annotation,
  type Extension
} from '@codemirror/state';
import { mount, unmount } from 'svelte';

import { deckTheme } from './deck-theme';
import { parseDeckYaml, serializeDeckConfig } from './yaml-utils';
import type { DeckConfig, DeckBlock, DeckHandlers } from './types';
import DeckWidget from './DeckWidget.svelte';

// Regex to match ```flint-deck ... ``` blocks
// Matches opening fence, captures YAML content, and closing fence
const FLINT_DECK_REGEX = /```flint-deck\s*\n([\s\S]*?)```/g;

// StateEffect for forcing deck re-render
const forceDeckUpdate = StateEffect.define<boolean>();

// Annotation to mark transactions that originate from widget config changes
// When present, we skip re-decoration to avoid recreating the widget
const deckWidgetUpdate = Annotation.define<boolean>();

// Flag to skip eq() comparison during widget-initiated updates
// This prevents widget recreation when the widget updates its own YAML
let skipWidgetComparison = false;

// Track active widgets to ensure proper cleanup
const activeWidgets = new Set<DeckWidgetType>();

// StateField for storing handlers
const deckHandlersField = StateField.define<DeckHandlers | null>({
  create() {
    return null;
  },
  update(handlers) {
    return handlers;
  }
});

/**
 * Find all flint-deck fenced code blocks in the document using regex
 */
function findDeckBlocks(state: EditorState): DeckBlock[] {
  const blocks: DeckBlock[] = [];
  const text = state.doc.toString();

  // Reset regex state
  FLINT_DECK_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FLINT_DECK_REGEX.exec(text)) !== null) {
    const fullMatch = match[0];
    const yamlContent = match[1];
    const from = match.index;
    const to = from + fullMatch.length;

    // Calculate content boundaries (after opening fence, before closing fence)
    const openingFenceEnd = text.indexOf('\n', from) + 1;
    const closingFenceStart = to - 3; // "```".length

    blocks.push({
      from,
      to,
      contentFrom: openingFenceEnd,
      contentTo: closingFenceStart,
      yamlContent: yamlContent.trim()
    });
  }

  return blocks;
}

/**
 * Check if cursor/selection overlaps with a range
 * Uses strict inequalities so cursor at block boundaries (start/end) is not considered "inside"
 * This prevents the widget from showing raw YAML when cursor lands at boundary after config updates
 */
function isCursorInRange(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    // Use strict inequalities: cursor at exactly from or to is not "inside"
    if (range.from < to && range.to > from) {
      return true;
    }
  }
  return false;
}

/**
 * Widget class for rendering deck
 */
class DeckWidgetType extends WidgetType {
  private component: ReturnType<typeof mount> | null = null;
  private view: EditorView | null = null;
  // Public for cleanup tracking - stores the YAML content this widget represents
  public yamlContent: string;

  constructor(
    private config: DeckConfig,
    yamlContent: string,
    private handlers: DeckHandlers
  ) {
    super();
    this.yamlContent = yamlContent;
  }

  /**
   * Find the current position of this deck block by searching for its YAML content
   */
  private findCurrentBlockPosition(): { from: number; to: number } | null {
    if (!this.view) return null;

    const blocks = findDeckBlocks(this.view.state);
    for (const block of blocks) {
      if (block.yamlContent === this.yamlContent) {
        return { from: block.from, to: block.to };
      }
    }
    return null;
  }

  toDOM(view: EditorView): HTMLElement {
    this.view = view;

    // Register this widget as active
    activeWidgets.add(this);

    const container = document.createElement('div');
    container.className = 'deck-widget-container';

    // Prevent mousedown from reaching CodeMirror and causing selection changes
    // This is critical to prevent the widget from being replaced with raw YAML
    container.addEventListener('mousedown', (e) => {
      // Don't prevent default for interactive elements
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (!['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON'].includes(tag)) {
        e.preventDefault();
      }
      e.stopPropagation();
    });

    // Mount Svelte component
    this.component = mount(DeckWidget, {
      target: container,
      props: {
        config: this.config,
        onConfigChange: (newConfig: DeckConfig) => {
          // Find current block position (may have shifted since widget was created)
          const pos = this.findCurrentBlockPosition();
          if (pos) {
            this.handlers.onConfigChange(pos.from, pos.to, newConfig);
            // Update our yamlContent to match the new config for future lookups
            this.yamlContent = serializeDeckConfig(newConfig).trim();
          }
        },
        onNoteOpen: (noteId: string) => {
          this.handlers.onNoteOpen(noteId);
        }
      }
    });

    return container;
  }

  destroy(): void {
    // Unregister from active widgets
    activeWidgets.delete(this);
    if (this.component) {
      unmount(this.component);
      this.component = null;
    }
  }

  eq(other: DeckWidgetType): boolean {
    // During widget-initiated updates, always return true to preserve the widget
    if (skipWidgetComparison) {
      return true;
    }
    // Compare YAML content instead of positions - positions shift when editing elsewhere
    return this.yamlContent === other.yamlContent;
  }

  get estimatedHeight(): number {
    return 200; // Estimated for scrolling calculations
  }

  ignoreEvent(): boolean {
    // Let the widget handle all events
    return true;
  }
}

/**
 * Create decorations for deck blocks
 * Also cleans up any stale widgets that won't be reused
 */
function decorateDeckBlocks(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const handlers = state.field(deckHandlersField, false);

  if (!handlers) {
    // No handlers - clean up all active widgets
    for (const widget of activeWidgets) {
      widget.destroy();
    }
    return Decoration.set([]);
  }

  const blocks = findDeckBlocks(state);

  // Track which yamlContent values we're creating widgets for
  const newYamlContents = new Set<string>();

  for (const block of blocks) {
    // Skip if cursor is inside the block - show raw YAML for editing
    if (isCursorInRange(state, block.from, block.to)) {
      continue;
    }

    // Parse the YAML config
    const config = parseDeckYaml(block.yamlContent);
    if (!config) {
      // Invalid YAML - skip rendering widget, show raw
      continue;
    }

    newYamlContents.add(block.yamlContent);
    const widget = new DeckWidgetType(config, block.yamlContent, handlers);

    decorations.push(
      Decoration.replace({
        widget,
        block: true,
        inclusive: false
      }).range(block.from, block.to)
    );
  }

  // Clean up stale widgets that won't be reused
  // (their yamlContent doesn't match any current block)
  for (const widget of activeWidgets) {
    if (!newYamlContents.has(widget.yamlContent)) {
      widget.destroy();
    }
  }

  return Decoration.set(decorations, true);
}

/**
 * State field for managing deck decorations
 */
const deckField = StateField.define<DecorationSet>({
  create(state) {
    return decorateDeckBlocks(state);
  },
  update(decorations, tr) {
    // Check for force update effect
    for (const effect of tr.effects) {
      if (effect.is(forceDeckUpdate)) {
        return decorateDeckBlocks(tr.state);
      }
    }

    // Skip re-decoration if this change originated from a widget config update
    // The widget's internal state is already updated, no need to recreate
    if (tr.annotation(deckWidgetUpdate)) {
      return decorations.map(tr.changes);
    }

    // Recalculate when document changes or selection changes
    if (tr.docChanged || tr.selection) {
      return decorateDeckBlocks(tr.state);
    }

    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f)
});

/**
 * Update a deck block's YAML content
 * Marks the transaction as a widget update to avoid re-creating the widget
 */
export function updateDeckBlock(
  view: EditorView,
  from: number,
  to: number,
  newConfig: DeckConfig
): void {
  const newYaml = serializeDeckConfig(newConfig);
  const newBlock = '```flint-deck\n' + newYaml + '```';

  // Set flag to skip widget comparison during this update
  skipWidgetComparison = true;
  try {
    view.dispatch({
      changes: { from, to, insert: newBlock },
      annotations: deckWidgetUpdate.of(true)
    });
  } finally {
    // Clear the flag after dispatch completes
    skipWidgetComparison = false;
  }
}

/**
 * Force refresh of all deck widgets
 */
export function forceDeckRefresh(view: EditorView): void {
  view.dispatch({
    effects: forceDeckUpdate.of(true)
  });
}

/**
 * Create the deck extension
 */
export function deckExtension(handlers: DeckHandlers): Extension {
  return [deckTheme, deckHandlersField.init(() => handlers), deckField];
}

/**
 * Insert a new deck block at the current cursor position
 */
export function insertDeckBlock(view: EditorView, config?: Partial<DeckConfig>): void {
  const defaultConfig: DeckConfig = {
    name: 'New Deck',
    filters: [],
    sort: { field: 'updated', order: 'desc' },
    limit: 50,
    ...config
  };

  const yaml = serializeDeckConfig(defaultConfig);
  const block = '\n```flint-deck\n' + yaml + '```\n';

  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, to: pos, insert: block },
    selection: { anchor: pos + block.length }
  });
}
