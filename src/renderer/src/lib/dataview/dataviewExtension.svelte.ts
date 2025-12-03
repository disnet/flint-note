/**
 * CodeMirror extension for rendering flint-query blocks as interactive widgets
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

import { dataviewTheme } from './dataview-theme';
import { parseQueryYaml, serializeQueryConfig } from './yaml-utils';
import type { FlintQueryConfig, FlintQueryBlock, DataviewHandlers } from './types';
import DataviewWidget from './DataviewWidget.svelte';

// Regex to match ```flint-query ... ``` blocks
// Matches opening fence, captures YAML content, and closing fence
const FLINT_QUERY_REGEX = /```flint-query\s*\n([\s\S]*?)```/g;

// StateEffect for forcing dataview re-render
const forceDataviewUpdate = StateEffect.define<boolean>();

// StateField for storing handlers
const dataviewHandlersField = StateField.define<DataviewHandlers | null>({
  create() {
    return null;
  },
  update(handlers) {
    return handlers;
  }
});

/**
 * Find all flint-query fenced code blocks in the document using regex
 */
function findFlintQueryBlocks(state: EditorState): FlintQueryBlock[] {
  const blocks: FlintQueryBlock[] = [];
  const text = state.doc.toString();

  // Reset regex state
  FLINT_QUERY_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FLINT_QUERY_REGEX.exec(text)) !== null) {
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
 */
function isCursorInRange(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) {
      return true;
    }
  }
  return false;
}

/**
 * Widget class for rendering dataview
 */
class DataviewWidgetType extends WidgetType {
  private component: ReturnType<typeof mount> | null = null;

  constructor(
    private config: FlintQueryConfig,
    private blockFrom: number,
    private blockTo: number,
    private handlers: DataviewHandlers
  ) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = 'dataview-widget-container';

    // Prevent editor from handling events inside the widget
    container.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    container.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    container.addEventListener('dblclick', (e) => {
      e.stopPropagation();
    });

    container.addEventListener('focusin', (e) => {
      e.stopPropagation();
    });

    container.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });

    // Mount Svelte component
    this.component = mount(DataviewWidget, {
      target: container,
      props: {
        config: this.config,
        onConfigChange: (newConfig: FlintQueryConfig) => {
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

  eq(other: DataviewWidgetType): boolean {
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
 * Create decorations for dataview blocks
 */
function decorateDataviewBlocks(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const handlers = state.field(dataviewHandlersField, false);

  if (!handlers) {
    return Decoration.set([]);
  }

  const blocks = findFlintQueryBlocks(state);

  for (const block of blocks) {
    // Skip if cursor is inside the block - show raw YAML for editing
    if (isCursorInRange(state, block.from, block.to)) {
      continue;
    }

    // Parse the YAML config
    const config = parseQueryYaml(block.yamlContent);
    if (!config) {
      // Invalid YAML - skip rendering widget, show raw
      continue;
    }

    const widget = new DataviewWidgetType(config, block.from, block.to, handlers);

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
 * State field for managing dataview decorations
 */
const dataviewField = StateField.define<DecorationSet>({
  create(state) {
    return decorateDataviewBlocks(state);
  },
  update(decorations, tr) {
    // Recalculate when document changes or selection changes
    if (tr.docChanged || tr.selection) {
      return decorateDataviewBlocks(tr.state);
    }

    // Check for force update effect
    for (const effect of tr.effects) {
      if (effect.is(forceDataviewUpdate)) {
        return decorateDataviewBlocks(tr.state);
      }
    }

    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f)
});

/**
 * Update a dataview block's YAML content
 */
export function updateDataviewBlock(
  view: EditorView,
  from: number,
  to: number,
  newConfig: FlintQueryConfig
): void {
  const newYaml = serializeQueryConfig(newConfig);
  const newBlock = '```flint-query\n' + newYaml + '```';

  view.dispatch({
    changes: { from, to, insert: newBlock }
  });
}

/**
 * Force refresh of all dataview widgets
 */
export function forceDataviewRefresh(view: EditorView): void {
  view.dispatch({
    effects: forceDataviewUpdate.of(true)
  });
}

/**
 * Create the dataview extension
 */
export function dataviewExtension(handlers: DataviewHandlers): Extension {
  return [dataviewTheme, dataviewHandlersField.init(() => handlers), dataviewField];
}

/**
 * Insert a new dataview block at the current cursor position
 */
export function insertDataviewBlock(
  view: EditorView,
  config?: Partial<FlintQueryConfig>
): void {
  const defaultConfig: FlintQueryConfig = {
    name: 'New Query',
    filters: [],
    sort: { field: 'updated', order: 'desc' },
    limit: 50,
    ...config
  };

  const yaml = serializeQueryConfig(defaultConfig);
  const block = '\n```flint-query\n' + yaml + '```\n';

  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, to: pos, insert: block },
    selection: { anchor: pos + block.length }
  });
}
