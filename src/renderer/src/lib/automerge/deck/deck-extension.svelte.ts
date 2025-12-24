/**
 * CodeMirror extension for rendering flint-deck blocks as interactive widgets
 *
 * Supports two modes:
 * 1. Embed syntax: ```flint-deck\nn-<note-id>\n``` - embeds a deck note
 * 2. Inline YAML (deprecated): Shows error message
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
import {
  parseDeckYamlWithWarnings,
  serializeDeckConfig,
  type DeckValidationWarning
} from '../../../../../shared/deck-yaml-utils';
import type { DeckConfig } from './deck-types';
import DeckWidget from '../../../components/DeckWidget.svelte';
import { getNote, getNoteType, updateNote } from '../state.svelte';

/**
 * Handlers for deck events
 */
export interface DeckHandlers {
  /** Called when a note should be opened */
  onNoteOpen: (noteId: string) => void;
  /** Called when config changes (for inline decks) */
  onConfigChange: (from: number, to: number, config: DeckConfig) => void;
}

// Regex to match ```flint-deck ... ``` blocks
// Matches opening fence, captures content, and closing fence
const FLINT_DECK_REGEX = /```flint-deck\s*\n([\s\S]*?)```/g;

// Regex to detect embed syntax: n-<note-id>
const EMBED_SYNTAX_REGEX = /^n-([a-zA-Z0-9_-]+)$/;

// StateEffect for forcing deck re-render
const forceDeckUpdate = StateEffect.define<boolean>();

// Annotation to mark transactions that originate from widget config changes
// When present, we skip re-decoration to avoid recreating the widget
const deckWidgetUpdate = Annotation.define<boolean>();

// Flag to skip eq() comparison during widget-initiated updates
// This prevents widget recreation when the widget updates its own YAML
let skipWidgetComparison = false;

// Track active widgets to ensure proper cleanup (CodeMirror context, not reactive)
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const activeWidgets = new Set<
  DeckWidgetType | EmbeddedDeckWidgetType | DeckErrorWidgetType
>();

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
 * Deck block information
 */
interface DeckBlock {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  yamlContent: string;
}

/**
 * Parsed deck block with type information
 */
interface ParsedDeckBlock extends DeckBlock {
  type: 'embed' | 'inline-yaml';
  noteId?: string; // For embed type
}

/**
 * Find all flint-deck fenced code blocks in the document using regex
 */
function findDeckBlocks(state: EditorState): ParsedDeckBlock[] {
  const blocks: ParsedDeckBlock[] = [];
  const text = state.doc.toString();

  // Reset regex state
  FLINT_DECK_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FLINT_DECK_REGEX.exec(text)) !== null) {
    const fullMatch = match[0];
    const content = match[1].trim();
    const from = match.index;
    const to = from + fullMatch.length;

    // Calculate content boundaries (after opening fence, before closing fence)
    const openingFenceEnd = text.indexOf('\n', from) + 1;
    const closingFenceStart = to - 3; // "```".length

    // Check if content is embed syntax
    const embedMatch = content.match(EMBED_SYNTAX_REGEX);
    if (embedMatch) {
      blocks.push({
        from,
        to,
        contentFrom: openingFenceEnd,
        contentTo: closingFenceStart,
        yamlContent: content,
        type: 'embed',
        noteId: embedMatch[1]
      });
    } else {
      // Inline YAML (deprecated)
      blocks.push({
        from,
        to,
        contentFrom: openingFenceEnd,
        contentTo: closingFenceStart,
        yamlContent: content,
        type: 'inline-yaml'
      });
    }
  }

  return blocks;
}

/**
 * Check if cursor/selection overlaps with a range
 * Uses strict inequalities so cursor at block boundaries (start/end) is not considered "inside"
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
 * Error widget shown for deprecated inline YAML syntax
 */
class DeckErrorWidgetType extends WidgetType {
  public yamlContent: string;

  constructor(yamlContent: string) {
    super();
    this.yamlContent = yamlContent;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'deck-error-widget';
    container.innerHTML = `
      <div class="deck-error-content">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div class="deck-error-text">
          <strong>Inline deck configuration is deprecated</strong>
          <p>Create a standalone deck note and embed it using <code>n-&lt;note-id&gt;</code></p>
        </div>
      </div>
    `;

    // Prevent mousedown from reaching CodeMirror
    container.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    return container;
  }

  destroy(): void {
    activeWidgets.delete(this);
  }

  eq(other: DeckErrorWidgetType): boolean {
    return this.yamlContent === other.yamlContent;
  }

  get estimatedHeight(): number {
    return 60;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Widget class for embedded deck (references a deck note)
 */
class EmbeddedDeckWidgetType extends WidgetType {
  private component: ReturnType<typeof mount> | null = null;
  public yamlContent: string;
  private config: DeckConfig | null = null;
  private validationWarnings: DeckValidationWarning[] = [];
  private loadError: string | null = null;

  constructor(
    yamlContent: string,
    private noteId: string,
    private handlers: DeckHandlers
  ) {
    super();
    this.yamlContent = yamlContent;
  }

  /**
   * Load the deck config from Automerge document
   */
  private loadDeckConfig(): void {
    try {
      const note = getNote(this.noteId);
      if (!note) {
        this.loadError = `Deck not found: ${this.noteId}`;
        return;
      }

      // Check if note is actually a deck (by note type)
      const noteType = getNoteType(note.type);
      if (!noteType || noteType.name !== 'Deck') {
        // Try checking props for kind
        const kind = note.props?.flint_kind;
        if (kind !== 'deck') {
          this.loadError = `Note "${this.noteId}" is not a deck`;
          return;
        }
      }

      // Parse the deck note's content as YAML (with warnings)
      const result = parseDeckYamlWithWarnings(note.content || '');
      if (!result) {
        this.loadError = 'Invalid deck configuration';
        return;
      }

      this.config = result.config;
      this.validationWarnings = result.warnings;
    } catch (err) {
      this.loadError = `Failed to load deck: ${err}`;
    }
  }

  /**
   * Save config changes back to the source deck note
   */
  private saveConfigToSourceNote(newConfig: DeckConfig): void {
    try {
      const yamlContent = serializeDeckConfig(newConfig);
      updateNote(this.noteId, { content: yamlContent });
      this.config = newConfig;
    } catch (err) {
      console.error('Failed to save deck config:', err);
    }
  }

  toDOM(): HTMLElement {
    // Register this widget as active
    activeWidgets.add(this);

    const container = document.createElement('div');
    container.className = 'deck-widget-container deck-embedded';

    // Prevent mousedown from reaching CodeMirror and causing selection changes
    container.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (!['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON'].includes(tag)) {
        e.preventDefault();
      }
      e.stopPropagation();
    });

    // Load the deck config synchronously from Automerge
    this.loadDeckConfig();

    if (this.loadError) {
      container.innerHTML = `
        <div class="deck-error-widget">
          <div class="deck-error-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div class="deck-error-text">
              <strong>${this.loadError}</strong>
            </div>
          </div>
        </div>
      `;
      return container;
    }

    if (!this.config) {
      container.innerHTML = `
        <div class="deck-loading">
          <span class="deck-loading-text">No deck configuration found</span>
        </div>
      `;
      return container;
    }

    // Mount the component
    this.component = mount(DeckWidget, {
      target: container,
      props: {
        config: this.config,
        validationWarnings: this.validationWarnings,
        onConfigChange: (newConfig: DeckConfig) => {
          // Save to source deck note
          this.saveConfigToSourceNote(newConfig);
        },
        onNoteOpen: (noteId: string) => {
          this.handlers.onNoteOpen(noteId);
        }
      }
    });

    return container;
  }

  destroy(): void {
    activeWidgets.delete(this);
    if (this.component) {
      unmount(this.component);
      this.component = null;
    }
  }

  eq(other: EmbeddedDeckWidgetType): boolean {
    if (skipWidgetComparison) {
      return true;
    }
    // Compare note IDs for embedded decks
    return this.noteId === other.noteId;
  }

  get estimatedHeight(): number {
    return 200;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Widget class for direct deck (legacy - kept for reference but deprecated)
 */
class DeckWidgetType extends WidgetType {
  private component: ReturnType<typeof mount> | null = null;
  private view: EditorView | null = null;
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
    container.addEventListener('mousedown', (e) => {
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
    activeWidgets.delete(this);
    if (this.component) {
      unmount(this.component);
      this.component = null;
    }
  }

  eq(other: DeckWidgetType): boolean {
    if (skipWidgetComparison) {
      return true;
    }
    return this.yamlContent === other.yamlContent;
  }

  get estimatedHeight(): number {
    return 200;
  }

  ignoreEvent(): boolean {
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

  // Track which content values we're creating widgets for (temporary, not reactive)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const newContents = new Set<string>();

  for (const block of blocks) {
    // Skip if cursor is inside the block - show raw content for editing
    if (isCursorInRange(state, block.from, block.to)) {
      continue;
    }

    let widget: WidgetType;

    if (block.type === 'embed' && block.noteId) {
      // Embed syntax - create embedded deck widget
      newContents.add(`embed:${block.noteId}`);
      widget = new EmbeddedDeckWidgetType(block.yamlContent, block.noteId, handlers);
    } else {
      // Inline YAML (deprecated) - show error
      newContents.add(`error:${block.yamlContent}`);
      widget = new DeckErrorWidgetType(block.yamlContent);
    }

    decorations.push(
      Decoration.replace({
        widget,
        block: true,
        inclusive: false
      }).range(block.from, block.to)
    );
  }

  // Clean up stale widgets that won't be reused
  for (const widget of activeWidgets) {
    let key: string;
    if (widget instanceof EmbeddedDeckWidgetType) {
      key = `embed:${widget.yamlContent.match(EMBED_SYNTAX_REGEX)?.[1]}`;
    } else if (widget instanceof DeckErrorWidgetType) {
      key = `error:${widget.yamlContent}`;
    } else {
      key = `inline:${widget.yamlContent}`;
    }

    if (!newContents.has(key)) {
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
 * Insert a deck embed block at the current cursor position
 */
export function insertDeckEmbed(view: EditorView, noteId: string): void {
  const block = `\n\`\`\`flint-deck\nn-${noteId}\n\`\`\`\n`;

  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, to: pos, insert: block },
    selection: { anchor: pos + block.length }
  });
}

/**
 * Insert a new deck block at the current cursor position (deprecated - for backward compatibility)
 */
export function insertDeckBlock(view: EditorView, config?: Partial<DeckConfig>): void {
  const defaultConfig: DeckConfig = {
    views: [
      {
        name: 'Default',
        filters: [],
        sort: { field: 'updated', order: 'desc' }
      }
    ],
    activeView: 0,
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
