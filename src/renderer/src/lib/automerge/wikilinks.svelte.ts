/**
 * Wikilinks extension for CodeMirror that uses Automerge state
 *
 * This is a simplified version of the main wikilinks extension,
 * adapted to work with automerge state instead of notesStore.
 */
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import {
  StateField,
  StateEffect,
  Range,
  RangeSet,
  EditorState,
  Prec,
  type Extension
} from '@codemirror/state';
import {
  autocompletion,
  CompletionContext,
  moveCompletionSelection,
  completionStatus
} from '@codemirror/autocomplete';
import type { CompletionResult } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { Note } from './types';
import { getAllNotes, getNoteTypes } from './state.svelte';
import { wikilinkTheme } from '../wikilink-theme';

// Regular expression to match wikilinks: [[Note Title]] or [[identifier|title]]
const WIKILINK_REGEX = /\[\[([^[\]]+)\]\]/g;

export interface WikilinkMatch {
  from: number;
  to: number;
  text: string;
  identifier: string;
  title: string;
  exists: boolean;
  noteId?: string;
}

export interface WikilinkClickHandler {
  (noteId: string, title: string, shouldCreate?: boolean): void;
}

export interface WikilinkHoverHandler {
  (
    data: {
      identifier: string;
      displayText: string;
      from: number;
      to: number;
      x: number;
      y: number;
      yTop: number;
      exists: boolean;
      noteId?: string;
    } | null
  ): void;
}

// Effects
const setWikilinkHandler = StateEffect.define<WikilinkClickHandler>();
const setWikilinkHoverHandler = StateEffect.define<WikilinkHoverHandler>();
const forceWikilinkUpdate = StateEffect.define<boolean>();

// Interface for selected wikilink data
interface SelectedWikilink {
  from: number;
  to: number;
  identifier: string;
  title: string;
  exists: boolean;
  noteId?: string;
}

// State field to store the currently selected wikilink (cursor adjacent to it)
const selectedWikilinkField = StateField.define<SelectedWikilink | null>({
  create: () => null,
  update: (value, tr) => {
    if (!tr.docChanged && !tr.selection) {
      return value;
    }

    const cursorPos = tr.state.selection.main.head;
    const text = tr.state.doc.toString();
    const notes = getAllNotes();
    const wikilinks = parseWikilinks(text, notes);

    for (const wikilink of wikilinks) {
      if (cursorPos === wikilink.from || cursorPos === wikilink.to) {
        return {
          from: wikilink.from,
          to: wikilink.to,
          identifier: wikilink.identifier,
          title: wikilink.title,
          exists: wikilink.exists,
          noteId: wikilink.noteId
        };
      }
    }

    return null;
  }
});

// State field to store the click handler
const wikilinkHandlerField = StateField.define<WikilinkClickHandler | null>({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setWikilinkHandler)) {
        return effect.value;
      }
    }
    return value;
  }
});

// State field to store the hover handler
const wikilinkHoverHandlerField = StateField.define<WikilinkHoverHandler | null>({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setWikilinkHoverHandler)) {
        return effect.value;
      }
    }
    return value;
  }
});

/**
 * Parse wikilinks from text content
 */
export function parseWikilinks(text: string, notes: Note[]): WikilinkMatch[] {
  const matches: WikilinkMatch[] = [];
  let match;

  WIKILINK_REGEX.lastIndex = 0;

  while ((match = WIKILINK_REGEX.exec(text)) !== null) {
    const content = match[1].trim();

    const pipeIndex = content.indexOf('|');
    let identifier: string;
    let title: string;

    if (pipeIndex !== -1) {
      identifier = content.substring(0, pipeIndex).trim();
      title = content.substring(pipeIndex + 1).trim();
    } else {
      identifier = content;
      title = content;
    }

    const existingNote = findNoteByIdentifier(identifier, notes);

    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      text: match[0],
      identifier,
      title,
      exists: !!existingNote,
      noteId: existingNote?.id
    });
  }

  return matches;
}

/**
 * Find a note by identifier (note ID or title)
 */
function findNoteByIdentifier(identifier: string, notes: Note[]): Note | null {
  const normalizedIdentifier = identifier.toLowerCase().trim();

  // First try exact ID match
  const byId = notes.find((note) => note.id.toLowerCase() === normalizedIdentifier);
  if (byId) return byId;

  // Then try title match
  const byTitle = notes.find(
    (note) => note.title.toLowerCase().trim() === normalizedIdentifier
  );
  if (byTitle) return byTitle;

  return null;
}

/**
 * Autocomplete function for wikilinks
 */
export function wikilinkCompletion(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\[\[([^\]]*)/);

  if (!word) return null;

  const match = word.text.match(/\[\[([^\]]*)/);
  if (!match) return null;

  const query = match[1];

  // Get notes from automerge state, excluding archived
  const notes = getAllNotes().filter((note) => !note.archived);

  const filteredNotes = query.trim()
    ? notes
        .filter(
          (note) =>
            note.title.toLowerCase().includes(query.toLowerCase()) ||
            note.id.toLowerCase().includes(query.toLowerCase())
        )
        .sort((a, b) => {
          const aTitle = a.title.toLowerCase();
          const bTitle = b.title.toLowerCase();
          const normalizedQuery = query.toLowerCase();

          if (aTitle === normalizedQuery) return -1;
          if (bTitle === normalizedQuery) return 1;

          if (aTitle.startsWith(normalizedQuery) && !bTitle.startsWith(normalizedQuery))
            return -1;
          if (bTitle.startsWith(normalizedQuery) && !aTitle.startsWith(normalizedQuery))
            return 1;

          return aTitle.localeCompare(bTitle);
        })
        .slice(0, 10)
    : notes.slice(0, 10);

  const options = filteredNotes.map((note) => ({
    label: note.title || 'Untitled',
    apply: `${note.id}]]`,
    type: 'text'
  }));

  // Add option to create new note
  if (
    query.trim() &&
    !filteredNotes.some((note) => note.title.toLowerCase() === query.toLowerCase().trim())
  ) {
    options.push({
      label: `Create "${query.trim()}"`,
      apply: `${query.trim()}]]`,
      type: 'text'
    });
  }

  return {
    from: word.from + 2,
    options
  };
}

/**
 * Widget for rendering clickable wikilinks
 */
class WikilinkWidget extends WidgetType {
  constructor(
    private identifier: string,
    private displayTitle: string,
    private exists: boolean,
    private noteId: string | undefined,
    private clickHandler: WikilinkClickHandler | null,
    private hoverHandler: WikilinkHoverHandler | null,
    private from: number,
    private to: number,
    private isSelected: boolean,
    private noteIcon: string
  ) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    const span = document.createElement('span');

    // Check if note is archived
    const notes = getAllNotes();
    const note = this.noteId ? notes.find((n) => n.id === this.noteId) : null;
    const isArchived = note?.archived ?? false;

    span.className = `wikilink-widget ${this.exists ? 'exists' : 'broken'}${this.isSelected ? ' selected' : ''}${isArchived ? ' archived' : ''}`;

    // Add icon
    const iconSpan = document.createElement('span');
    iconSpan.className = 'wikilink-icon';
    iconSpan.textContent = this.noteIcon;
    span.appendChild(iconSpan);

    // Add title (use note's actual title for ID-only links)
    const titleSpan = document.createElement('span');
    titleSpan.className = 'wikilink-text';

    let displayText = this.displayTitle;
    if (this.exists && this.noteId && this.identifier === this.displayTitle) {
      const linkedNote = notes.find((n) => n.id === this.noteId);
      if (linkedNote) {
        displayText = linkedNote.title || 'Untitled';
      }
    }
    titleSpan.textContent = displayText;
    span.appendChild(titleSpan);

    // Click handler
    span.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.clickHandler) {
        if (this.exists && this.noteId) {
          this.clickHandler(this.noteId, this.displayTitle);
        } else {
          this.clickHandler(this.identifier, this.displayTitle, true);
        }
      }
    });

    // Prevent editor from handling mousedown
    span.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    // Hover handlers
    if (this.hoverHandler) {
      span.addEventListener('mouseenter', () => {
        const rect = span.getBoundingClientRect();
        this.hoverHandler!({
          identifier: this.identifier,
          displayText: this.displayTitle,
          from: this.from,
          to: this.to,
          x: rect.left,
          y: rect.bottom,
          yTop: rect.top,
          exists: this.exists,
          noteId: this.noteId
        });
      });

      span.addEventListener('mouseleave', () => {
        this.hoverHandler!(null);
      });
    }

    return span;
  }

  eq(other: WikilinkWidget): boolean {
    return (
      this.identifier === other.identifier &&
      this.displayTitle === other.displayTitle &&
      this.exists === other.exists &&
      this.noteId === other.noteId &&
      this.isSelected === other.isSelected &&
      this.noteIcon === other.noteIcon
    );
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Check if a position is inside a code context
 */
function isInCodeContext(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  let inCode = false;

  tree.iterate({
    from: pos,
    to: pos,
    enter: (node) => {
      const name = node.name;
      if (
        name === 'InlineCode' ||
        name === 'CodeBlock' ||
        name === 'FencedCode' ||
        name === 'CodeText' ||
        name === 'CodeInfo' ||
        name === 'CodeMark'
      ) {
        inCode = true;
        return false;
      }
      return undefined;
    }
  });

  return inCode;
}

/**
 * Create wikilink decorations for the document
 */
function createWikilinkDecorations(
  state: EditorState,
  clickHandler: WikilinkClickHandler | null,
  hoverHandler: WikilinkHoverHandler | null
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();
  const notes = getAllNotes();
  const noteTypes = getNoteTypes();
  const wikilinks = parseWikilinks(text, notes);
  const selectedWikilink = state.field(selectedWikilinkField);

  for (const wikilink of wikilinks) {
    // Skip wikilinks inside code blocks
    if (isInCodeContext(state, wikilink.from)) {
      continue;
    }

    // Get note icon
    let noteIcon = '📝';
    if (wikilink.exists && wikilink.noteId) {
      const note = notes.find((n) => n.id === wikilink.noteId);
      if (note) {
        const noteType = noteTypes.find((t) => t.id === note.type);
        noteIcon = noteType?.icon || '📝';
      }
    }

    const isSelected =
      selectedWikilink !== null &&
      selectedWikilink.from === wikilink.from &&
      selectedWikilink.to === wikilink.to;

    decorations.push(
      Decoration.replace({
        widget: new WikilinkWidget(
          wikilink.identifier,
          wikilink.title,
          wikilink.exists,
          wikilink.noteId,
          clickHandler,
          hoverHandler,
          wikilink.from,
          wikilink.to,
          isSelected,
          noteIcon
        )
      }).range(wikilink.from, wikilink.to)
    );
  }

  return RangeSet.of(decorations.sort((a, b) => a.from - b.from));
}

// State field for wikilink decorations
const wikilinkField = StateField.define<DecorationSet>({
  create: (state) => {
    const handler = state.field(wikilinkHandlerField);
    const hoverHandler = state.field(wikilinkHoverHandlerField);
    return createWikilinkDecorations(state, handler, hoverHandler);
  },
  update: (decorations, tr) => {
    // Check for force update effect
    for (const effect of tr.effects) {
      if (effect.is(forceWikilinkUpdate)) {
        const handler = tr.state.field(wikilinkHandlerField);
        const hoverHandler = tr.state.field(wikilinkHoverHandlerField);
        return createWikilinkDecorations(tr.state, handler, hoverHandler);
      }
    }

    // Only recalculate if document changed or selection changed
    if (tr.docChanged || tr.selection) {
      const handler = tr.state.field(wikilinkHandlerField);
      const hoverHandler = tr.state.field(wikilinkHoverHandlerField);
      return createWikilinkDecorations(tr.state, handler, hoverHandler);
    }

    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

/**
 * Force refresh wikilinks (call when notes change externally)
 */
export function forceWikilinkRefresh(view: EditorView): void {
  view.dispatch({
    effects: forceWikilinkUpdate.of(true)
  });
}

/**
 * Get selected wikilink from state
 */
export function getSelectedWikilink(view: EditorView): SelectedWikilink | null {
  return view.state.field(selectedWikilinkField);
}

/**
 * Create the wikilinks extension for automerge
 */
export function automergeWikilinksExtension(
  onWikilinkClick: WikilinkClickHandler,
  onWikilinkHover?: WikilinkHoverHandler
): Extension {
  // Keymap for navigating autocomplete with Ctrl-n/p
  const wikilinkKeymap = Prec.highest(
    keymap.of([
      {
        key: 'Ctrl-n',
        run: (view) => {
          if (completionStatus(view.state) === 'active') {
            moveCompletionSelection(true)(view);
            return true;
          }
          return false;
        }
      },
      {
        key: 'Ctrl-p',
        run: (view) => {
          if (completionStatus(view.state) === 'active') {
            moveCompletionSelection(false)(view);
            return true;
          }
          return false;
        }
      },
      // Enter/Cmd-Enter to navigate to selected wikilink
      {
        key: 'Mod-Enter',
        run: (view) => {
          const selected = getSelectedWikilink(view);
          if (selected) {
            const handler = view.state.field(wikilinkHandlerField);
            if (handler) {
              if (selected.exists && selected.noteId) {
                handler(selected.noteId, selected.title);
              } else {
                handler(selected.identifier, selected.title, true);
              }
              return true;
            }
          }
          return false;
        }
      }
    ])
  );

  // Initial effect to set handlers
  const initialEffects = [
    setWikilinkHandler.of(onWikilinkClick),
    ...(onWikilinkHover ? [setWikilinkHoverHandler.of(onWikilinkHover)] : [])
  ];

  return [
    selectedWikilinkField,
    wikilinkHandlerField,
    wikilinkHoverHandlerField,
    wikilinkField,
    autocompletion({
      override: [wikilinkCompletion],
      activateOnTyping: true,
      closeOnBlur: true
    }),
    wikilinkKeymap,
    wikilinkTheme,
    EditorView.updateListener.of((update) => {
      // Apply initial effects on first update
      if (update.view.state.field(wikilinkHandlerField) === null) {
        update.view.dispatch({ effects: initialEffects });
      }
    })
  ];
}
