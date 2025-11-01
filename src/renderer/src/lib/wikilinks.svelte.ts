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
import type { NoteMetadata } from '../services/noteStore.svelte';
import { notesStore } from '../services/noteStore.svelte';
import { wikilinkTheme } from './wikilink-theme';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Inject CSS for note type completion icons
 */
function injectNoteTypeCompletionStyles(): void {
  const styleId = 'wikilink-completion-icons';
  let styleElement = document.getElementById(styleId) as HTMLStyleElement;

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
    document.head.appendChild(styleElement);
  }

  // Get current note types and generate CSS
  const noteTypes = notesStore.noteTypes;
  const cssRules = noteTypes
    .filter((noteType) => noteType.icon)
    .map((noteType) => {
      // Escape the note type name for use in CSS selector
      const escapedName = CSS.escape(noteType.name);
      return `.cm-completionIcon-note-type-${escapedName}::before {
        content: '${noteType.icon}';
        margin-right: 0.5em;
      }`;
    })
    .join('\n');

  styleElement.textContent = cssRules;
}

// Regular expression to match wikilinks: [[Note Title]] or [[identifier|title]]
const WIKILINK_REGEX = /\[\[([^[\]]+)\]\]/g;

export interface WikilinkMatch {
  from: number;
  to: number;
  text: string; // The full [[...]] text
  identifier: string; // The identifier part (before | if present, otherwise same as title)
  title: string; // The display title (after | if present, otherwise same as identifier)
  exists: boolean; // Whether a note with this identifier exists
  noteId?: string; // The ID of the matching note if it exists
}

export interface WikilinkClickHandler {
  (noteId: string, title: string, shouldCreate?: boolean, shiftKey?: boolean): void;
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

export interface WikilinkEditHandler {
  (): void;
}

// Effect to update wikilink click handler
const setWikilinkHandler = StateEffect.define<WikilinkClickHandler>();

// Effect to update wikilink hover handler
const setWikilinkHoverHandler = StateEffect.define<WikilinkHoverHandler>();

// Effect to update wikilink edit handler
const setWikilinkEditHandler = StateEffect.define<WikilinkEditHandler>();

// Effect to force wikilink re-rendering (when notes store updates)
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
    // Only recalculate on selection changes or document changes
    if (!tr.docChanged && !tr.selection) {
      return value;
    }

    const cursorPos = tr.state.selection.main.head;

    // Find all wikilinks in the document
    const text = tr.state.doc.toString();
    const notes = notesStore.notes;
    const wikilinks = parseWikilinks(text, notes);

    // Check if cursor is adjacent to any wikilink (at from or to position)
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

// State field to store the current click handler
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

// State field to store the current hover handler
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

// State field to store the current edit handler
const wikilinkEditHandlerField = StateField.define<WikilinkEditHandler | null>({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setWikilinkEditHandler)) {
        return effect.value;
      }
    }
    return value;
  }
});

/**
 * Parse wikilinks from text content
 */
export function parseWikilinks(text: string, notes: NoteMetadata[]): WikilinkMatch[] {
  const matches: WikilinkMatch[] = [];
  let match;

  WIKILINK_REGEX.lastIndex = 0; // Reset regex state

  while ((match = WIKILINK_REGEX.exec(text)) !== null) {
    const content = match[1].trim();

    // Check if it's in the format "identifier|title"
    const pipeIndex = content.indexOf('|');
    let identifier: string;
    let title: string;

    if (pipeIndex !== -1) {
      // Format: [[identifier|title]]
      identifier = content.substring(0, pipeIndex).trim();
      title = content.substring(pipeIndex + 1).trim();
    } else {
      // Format: [[title]] - use title as both identifier and title
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
 * Find a note by identifier (which can be note ID, title, type/filename path, or filename)
 */
function findNoteByIdentifier(
  identifier: string,
  notes: NoteMetadata[]
): NoteMetadata | null {
  const normalizedIdentifier = identifier.toLowerCase().trim();

  // First, try to match by note ID (exact match)
  const byId = notes.find((note) => note.id.toLowerCase() === normalizedIdentifier);
  if (byId) return byId;

  // Then try to match by type/filename format (e.g., "sketch/what-makes-a-good-thinking-system")
  if (normalizedIdentifier.includes('/')) {
    const [type, ...filenameParts] = normalizedIdentifier.split('/');
    const filename = filenameParts.join('/'); // Handle nested paths if any

    const byTypePath = notes.find(
      (note) =>
        note.type.toLowerCase() === type &&
        note.filename.toLowerCase().replace(/\.md$/, '').trim() === filename
    );
    if (byTypePath) return byTypePath;
  }

  // Then try to match by title (case-insensitive)
  const byTitle = notes.find(
    (note) => note.title.toLowerCase().trim() === normalizedIdentifier
  );
  if (byTitle) return byTitle;

  // Finally, try to match by filename without .md extension
  const byFilename = notes.find(
    (note) =>
      note.filename.toLowerCase().replace(/\.md$/, '').trim() === normalizedIdentifier
  );
  if (byFilename) return byFilename;

  return null;
}

/**
 * Autocomplete function for wikilinks
 */
/**
 * Process wikilinks in content - convert them to readable text
 */
function processWikilinks(text: string): string {
  // Replace [[note-id|display text]] with just "display text"
  // Replace [[note-id]] with just "note-id"
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, noteId, displayText) => {
    return displayText || noteId;
  });
}

/**
 * Render markdown content as HTML snippet
 */
async function renderMarkdownSnippet(content: string): Promise<string> {
  if (!content || !content.trim()) {
    return '<em>(empty note)</em>';
  }

  // Process wikilinks first
  const processedContent = processWikilinks(content);

  // Take first few paragraphs (limit content length for performance)
  const lines = processedContent.split('\n');
  const limitedContent = lines.slice(0, 10).join('\n');

  // Render markdown to HTML
  let html: string;
  const parsedResult = marked.parse(limitedContent);
  if (typeof parsedResult === 'string') {
    html = parsedResult;
  } else {
    // If it's a promise, await it
    html = await parsedResult;
  }

  // Sanitize HTML - allow basic formatting
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'strong',
      'b',
      'em',
      'i',
      'code',
      'pre',
      'ul',
      'ol',
      'li',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'br'
    ],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  });

  return sanitized;
}

/**
 * Async function to fetch note content and create info DOM
 */
async function createNoteInfo(
  noteId: string,
  _noteType: string
): Promise<{ dom: HTMLElement; destroy?: () => void }> {
  const container = document.createElement('div');
  container.className = 'wikilink-completion-info';

  // Add loading indicator
  const snippetContainer = document.createElement('div');
  snippetContainer.className = 'wikilink-completion-info-snippet';
  snippetContainer.textContent = 'Loading...';
  container.appendChild(snippetContainer);

  // Fetch note content asynchronously
  try {
    const result = await window.api?.getNote({ identifier: noteId });
    if (result) {
      // renderMarkdownSnippet handles empty content by returning "(empty note)"
      const renderedHtml = await renderMarkdownSnippet(result.content || '');
      snippetContainer.innerHTML = renderedHtml;

      // Check if content overflows - if so, show gradient
      // Use setTimeout to allow DOM to render before checking dimensions
      setTimeout(() => {
        if (container.scrollHeight > container.clientHeight) {
          container.classList.add('has-overflow');
        }
      }, 0);
    } else {
      snippetContainer.innerHTML = '<em>(unable to load content)</em>';
    }
  } catch (error) {
    console.error('Error fetching note content for autocomplete:', error);
    snippetContainer.innerHTML = '<em>(error loading content)</em>';
  }

  return { dom: container };
}

export function wikilinkCompletion(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\[\[([^\]]*)/);

  if (!word) return null;

  // Extract the query from inside the brackets
  const match = word.text.match(/\[\[([^\]]*)/);
  if (!match) return null;

  const query = match[1];

  // Inject CSS for note type icons
  injectNoteTypeCompletionStyles();

  // Get current notes from store
  const notes = notesStore.notes;

  // Filter and sort notes based on query
  const filteredNotes = query.trim()
    ? notes
        .filter(
          (note) =>
            note.title.toLowerCase().includes(query.toLowerCase()) ||
            note.filename.toLowerCase().includes(query.toLowerCase()) ||
            note.id.toLowerCase().includes(query.toLowerCase())
        )
        .sort((a, b) => {
          const aTitle = a.title.toLowerCase();
          const bTitle = b.title.toLowerCase();
          const aId = a.id.toLowerCase();
          const bId = b.id.toLowerCase();
          const normalizedQuery = query.toLowerCase();

          // Exact title match has highest priority
          if (aTitle === normalizedQuery) return -1;
          if (bTitle === normalizedQuery) return 1;

          // Exact ID match has second priority
          if (aId === normalizedQuery) return -1;
          if (bId === normalizedQuery) return 1;

          // Title starts with query
          if (aTitle.startsWith(normalizedQuery) && !bTitle.startsWith(normalizedQuery))
            return -1;
          if (bTitle.startsWith(normalizedQuery) && !aTitle.startsWith(normalizedQuery))
            return 1;

          // ID starts with query
          if (aId.startsWith(normalizedQuery) && !bId.startsWith(normalizedQuery))
            return -1;
          if (bId.startsWith(normalizedQuery) && !aId.startsWith(normalizedQuery))
            return 1;

          return aTitle.localeCompare(bTitle);
        })
        .slice(0, 10)
    : notes.slice(0, 10);

  // Create completion options with the correct format [[type/filename|title]]
  const options = filteredNotes.map((note) => {
    const linkTarget = `${note.type}/${note.filename.replace(/\.md$/, '')}`;
    return {
      label: note.title,
      apply: `${linkTarget}|${note.title}]]`,
      info: () => createNoteInfo(note.id, note.type || 'unknown'),
      type: `note-type-${note.type}` // Use note type as completion type for icon
    };
  });

  // Add option to create new note if query doesn't match exactly
  if (
    query.trim() &&
    !filteredNotes.some((note) => note.title.toLowerCase() === query.toLowerCase().trim())
  ) {
    options.push({
      label: `Create "${query.trim()}"`,
      apply: `${query.trim()}]]`, // For new notes, just use title format until created
      info: async () => {
        const container = document.createElement('div');
        container.textContent = 'Create new note';
        return { dom: container };
      },
      type: 'text'
    });
  }

  return {
    from: word.from + 2, // Start after "[["
    options
  };
}

/**
 * Widget for rendering clickable wikilinks
 */
class WikilinkWidget extends WidgetType {
  constructor(
    private identifier: string,
    private title: string,
    private exists: boolean,
    private noteId: string | undefined,
    private clickHandler: WikilinkClickHandler | null,
    private hoverHandler: WikilinkHoverHandler | null,
    private from: number,
    private to: number,
    private isSelected: boolean
  ) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    const span = document.createElement('span');

    // Determine class based on selection state and existence
    if (this.isSelected) {
      span.className = this.exists
        ? 'wikilink wikilink-selected'
        : 'wikilink wikilink-selected-broken';
    } else {
      span.className = this.exists
        ? 'wikilink wikilink-exists'
        : 'wikilink wikilink-broken';
    }

    // Get note type icon if the note exists
    if (this.exists && this.noteId) {
      const notes = notesStore.notes;
      const note = notes.find((n) => n.id === this.noteId);
      if (note) {
        const noteTypes = notesStore.noteTypes;
        const noteType = noteTypes.find((t) => t.name === note.type);
        if (noteType?.icon) {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'wikilink-icon';
          iconSpan.textContent = noteType.icon;
          span.appendChild(iconSpan);
        }
      }
    }

    // Display only the title part (no brackets), which is more user-friendly
    // Wrap text in a span so we can apply underline only to text, not icon
    const textSpan = document.createElement('span');
    textSpan.className = 'wikilink-text';
    textSpan.textContent = this.title;
    span.appendChild(textSpan);

    span.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (this.clickHandler) {
        if (this.exists && this.noteId) {
          this.clickHandler(this.noteId, this.title, false, e.shiftKey);
        } else {
          // Handle broken link - create new note with this title
          console.log('Creating new note for broken wikilink:', this.title);
          this.clickHandler(this.identifier, this.title, true, e.shiftKey);
        }
      }
    });

    // Add hover event listeners
    span.addEventListener('mouseenter', () => {
      if (this.hoverHandler) {
        // Get the actual bounding rect of the wikilink span element
        const rect = span.getBoundingClientRect();
        this.hoverHandler({
          identifier: this.identifier,
          displayText: this.title,
          from: this.from,
          to: this.to,
          x: rect.left,
          y: rect.bottom,
          yTop: rect.top,
          exists: this.exists,
          noteId: this.noteId
        });
      }
    });

    span.addEventListener('mouseleave', () => {
      // Signal that mouse left the wikilink
      if (this.hoverHandler) {
        this.hoverHandler(null);
      }
    });

    return span;
  }

  eq(other: WikilinkWidget): boolean {
    return (
      this.identifier === other.identifier &&
      this.title === other.title &&
      this.exists === other.exists &&
      this.noteId === other.noteId &&
      this.from === other.from &&
      this.to === other.to &&
      this.isSelected === other.isSelected
    );
  }

  updateDOM(): boolean {
    return false; // Always recreate for simplicity
  }
}

/**
 * State field for managing wikilink decorations
 */
const wikilinkField = StateField.define<DecorationSet>({
  create(state) {
    return decorateWikilinks(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return decorateWikilinks(tr.state);
    }

    // Re-decorate if selection changed (to update selected wikilink highlighting)
    if (tr.selection) {
      return decorateWikilinks(tr.state);
    }

    // Check if there's a force update effect
    for (const effect of tr.effects) {
      if (effect.is(forceWikilinkUpdate)) {
        return decorateWikilinks(tr.state);
      }
    }

    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f)
});

/**
 * Check if a position is inside a code context (inline code or code block)
 */
function isInCodeContext(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  let inCode = false;

  tree.iterate({
    from: pos,
    to: pos,
    enter: (node) => {
      // Check for inline code (InlineCode) or code blocks (FencedCode, CodeBlock)
      if (
        node.name === 'InlineCode' ||
        node.name === 'FencedCode' ||
        node.name === 'CodeBlock' ||
        node.name === 'CodeText'
      ) {
        inCode = true;
      }
    }
  });

  return inCode;
}

/**
 * Create decorations for wikilinks in the document
 */
function decorateWikilinks(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();

  // Get current notes from store
  const notes = notesStore.notes; // Immediately unsubscribe since we just want current value

  // Get current handlers
  const clickHandler = state.field(wikilinkHandlerField, false) || null;
  const hoverHandler = state.field(wikilinkHoverHandlerField, false) || null;

  // Get currently selected wikilink
  const selectedWikilink = state.field(selectedWikilinkField, false) || null;

  const wikilinks = parseWikilinks(text, notes);

  for (const wikilink of wikilinks) {
    // Skip wikilinks that are inside code contexts
    if (isInCodeContext(state, wikilink.from)) {
      continue;
    }

    // Check if this wikilink is currently selected
    const isSelected =
      selectedWikilink !== null &&
      selectedWikilink.from === wikilink.from &&
      selectedWikilink.to === wikilink.to;

    const widget = new WikilinkWidget(
      wikilink.identifier,
      wikilink.title,
      wikilink.exists,
      wikilink.noteId,
      clickHandler,
      hoverHandler,
      wikilink.from,
      wikilink.to,
      isSelected
    );

    decorations.push(
      Decoration.replace({
        widget,
        inclusive: false,
        block: false
      }).range(wikilink.from, wikilink.to)
    );
  }

  return Decoration.set(decorations);
}

/**
 * Extension that adds wikilink support to CodeMirror
 */
/**
 * Wikilinks extension without autocomplete (for use when combining with other autocomplete sources)
 */
export function wikilinksWithoutAutocomplete(
  clickHandler: WikilinkClickHandler,
  hoverHandler?: WikilinkHoverHandler,
  editHandler?: WikilinkEditHandler
): Extension {
  return [
    wikilinkTheme,
    wikilinkHandlerField.init(() => clickHandler),
    wikilinkHoverHandlerField.init(() => hoverHandler || null),
    wikilinkEditHandlerField.init(() => editHandler || null),
    selectedWikilinkField,
    wikilinkField,
    // Add Cmd/Ctrl-Enter key handler to open selected wikilinks
    Prec.high(
      keymap.of([
        {
          key: 'Mod-Enter',
          run: (view) => {
            const selectedWikilink = view.state.field(selectedWikilinkField, false);
            if (selectedWikilink) {
              const handler = view.state.field(wikilinkHandlerField, false);
              if (handler) {
                if (selectedWikilink.exists && selectedWikilink.noteId) {
                  handler(selectedWikilink.noteId, selectedWikilink.title);
                } else {
                  // Handle broken link - create new note
                  handler(selectedWikilink.identifier, selectedWikilink.title, true);
                }
                return true; // Prevent default behavior
              }
            }
            return false; // Allow normal behavior
          }
        },
        {
          key: 'Alt-Enter',
          run: (view) => {
            const selectedWikilink = view.state.field(selectedWikilinkField, false);
            if (selectedWikilink) {
              const handler = view.state.field(wikilinkEditHandlerField, false);
              if (handler) {
                handler();
                return true; // Prevent default behavior
              }
            }
            return false; // Allow normal behavior
          }
        }
      ])
    ),
    // Add atomic ranges for proper cursor movement
    EditorView.atomicRanges.of((view) => {
      const decorations = view.state.field(wikilinkField, false);
      if (!decorations) {
        return RangeSet.empty;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ranges: Range<any>[] = [];

      try {
        decorations.between(0, view.state.doc.length, (from, to, value) => {
          if (value.spec.widget instanceof WikilinkWidget) {
            ranges.push({ from, to, value: true });
          }
        });

        // Sort ranges by position before creating RangeSet
        ranges.sort((a, b) => a.from - b.from);

        return ranges.length > 0 ? RangeSet.of(ranges) : RangeSet.empty;
      } catch (e) {
        console.warn('Error creating atomic ranges:', e);
        return RangeSet.empty;
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.view.state.field(wikilinkHandlerField) !== clickHandler) {
        update.view.dispatch({
          effects: setWikilinkHandler.of(clickHandler)
        });
      }
      if (
        hoverHandler &&
        update.view.state.field(wikilinkHoverHandlerField) !== hoverHandler
      ) {
        update.view.dispatch({
          effects: setWikilinkHoverHandler.of(hoverHandler)
        });
      }
      if (
        editHandler &&
        update.view.state.field(wikilinkEditHandlerField) !== editHandler
      ) {
        update.view.dispatch({
          effects: setWikilinkEditHandler.of(editHandler)
        });
      }
    })
  ];
}

export function wikilinksExtension(
  clickHandler: WikilinkClickHandler,
  hoverHandler?: WikilinkHoverHandler,
  editHandler?: WikilinkEditHandler
): Extension {
  const baseExtensions = wikilinksWithoutAutocomplete(
    clickHandler,
    hoverHandler,
    editHandler
  );
  return [
    ...(Array.isArray(baseExtensions) ? baseExtensions : [baseExtensions]),
    autocompletion({
      override: [wikilinkCompletion]
    }),
    Prec.high(
      keymap.of([
        {
          key: 'Ctrl-n',
          run: (view) => {
            const status = completionStatus(view.state);
            if (status === 'active') {
              return moveCompletionSelection(true)(view);
            }
            return false; // Let default handler take over
          }
        },
        {
          key: 'Ctrl-p',
          run: (view) => {
            const status = completionStatus(view.state);
            if (status === 'active') {
              return moveCompletionSelection(false)(view);
            }
            return false; // Let default handler take over
          }
        }
      ])
    )
  ];
}

/**
 * Function to update the click handler for an existing editor
 */
export function updateWikilinkHandler(
  view: EditorView,
  clickHandler: WikilinkClickHandler
): void {
  view.dispatch({
    effects: setWikilinkHandler.of(clickHandler)
  });
}

/**
 * Function to force wikilink re-rendering (when notes store updates)
 */
export function forceWikilinkRefresh(view: EditorView): void {
  view.dispatch({
    effects: forceWikilinkUpdate.of(true)
  });
}

/**
 * Get the currently selected wikilink (cursor adjacent to it)
 */
export function getSelectedWikilink(view: EditorView): SelectedWikilink | null {
  return view.state.field(selectedWikilinkField, false) || null;
}

/**
 * Export the SelectedWikilink type for use in components
 */
export type { SelectedWikilink };
