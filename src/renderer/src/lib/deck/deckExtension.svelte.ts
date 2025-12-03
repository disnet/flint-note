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

  constructor(
    private config: DeckConfig,
    private blockFrom: number,
    private blockTo: number,
    private handlers: DeckHandlers
  ) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
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
          this.handlers.onConfigChange(this.blockFrom, this.blockTo, newConfig);
        },
        onNoteClick: (noteId: string, shiftKey?: boolean) => {
          this.handlers.onNoteClick(noteId, shiftKey);
        }
      }
    });

    return container;
  }

  destroy(): void {
    if (this.component) {
      unmount(this.component);
      this.component = null;
    }
  }

  eq(other: DeckWidgetType): boolean {
    return (
      JSON.stringify(this.config) === JSON.stringify(other.config) &&
      this.blockFrom === other.blockFrom &&
      this.blockTo === other.blockTo
    );
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
 */
function decorateDeckBlocks(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const handlers = state.field(deckHandlersField, false);

  if (!handlers) {
    return Decoration.set([]);
  }

  const blocks = findDeckBlocks(state);

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

    const widget = new DeckWidgetType(config, block.from, block.to, handlers);

    decorations.push(
      Decoration.replace({
        widget,
        block: true,
        inclusive: false
      }).range(block.from, block.to)
    );
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
    // Recalculate when document changes or selection changes
    if (tr.docChanged || tr.selection) {
      return decorateDeckBlocks(tr.state);
    }

    // Check for force update effect
    for (const effect of tr.effects) {
      if (effect.is(forceDeckUpdate)) {
        return decorateDeckBlocks(tr.state);
      }
    }

    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f)
});

/**
 * Update a deck block's YAML content
 */
export function updateDeckBlock(
  view: EditorView,
  from: number,
  to: number,
  newConfig: DeckConfig
): void {
  const newYaml = serializeDeckConfig(newConfig);
  const newBlock = '```flint-deck\n' + newYaml + '```';

  view.dispatch({
    changes: { from, to, insert: newBlock }
  });
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
