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
  RangeSet,
  RangeValue,
  EditorState,
  Prec,
  type Extension,
  type Range
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
import type { NoteMetadata, ConversationIndexEntry } from './types';
import {
  getAllNotes,
  getNoteTypes,
  getNoteType,
  getConversationEntry,
  getConversations
} from './state.svelte';

import { wikilinkTheme } from '../wikilink-theme';

// ID for the dynamically injected completion icon styles
const COMPLETION_ICON_STYLE_ID = 'wikilink-completion-icons';

// Type to distinguish link targets
export type WikilinkTargetType = 'note' | 'conversation' | 'type';

// Regex to match conversation IDs: conv-xxxxxxxx (8 hex chars)
const CONVERSATION_ID_REGEX = /^conv-[a-f0-9]{8}$/i;

// Regex to match note type IDs: type-xxxxxxxx (8 hex chars) or protected types like type-default, type-daily
const NOTE_TYPE_ID_REGEX = /^type-[a-z0-9]+$/i;

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
  targetType: WikilinkTargetType;
  conversationId?: string;
  typeId?: string;
}

export interface WikilinkClickHandler {
  (
    targetId: string,
    title: string,
    options?: {
      shouldCreate?: boolean;
      targetType?: WikilinkTargetType;
      from?: number;
      to?: number;
    }
  ): void;
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
      targetType: WikilinkTargetType;
      conversationId?: string;
      typeId?: string;
    } | null
  ): void;
}

export interface SelectedWikilink {
  from: number;
  to: number;
  identifier: string;
  title: string;
  exists: boolean;
  noteId?: string;
  targetType: WikilinkTargetType;
  conversationId?: string;
  typeId?: string;
}

export type WikilinkEditDisplayTextHandler = (wikilink: SelectedWikilink) => void;

// Effects
const setWikilinkHandler = StateEffect.define<WikilinkClickHandler>();
const setWikilinkHoverHandler = StateEffect.define<WikilinkHoverHandler>();
const forceWikilinkUpdate = StateEffect.define<boolean>();

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
          noteId: wikilink.noteId,
          targetType: wikilink.targetType,
          conversationId: wikilink.conversationId,
          typeId: wikilink.typeId
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

// State field to store the edit display text handler
const wikilinkEditDisplayTextHandlerField =
  StateField.define<WikilinkEditDisplayTextHandler | null>({
    create: () => null,
    update: (v) => v
  });

/**
 * Check if an identifier is a conversation ID
 */
function isConversationId(identifier: string): boolean {
  return CONVERSATION_ID_REGEX.test(identifier.trim());
}

/**
 * Check if an identifier is a note type ID
 */
function isNoteTypeId(identifier: string): boolean {
  return NOTE_TYPE_ID_REGEX.test(identifier.trim());
}

/**
 * Find a conversation by identifier (conversation ID only - no title matching)
 * Unlike notes, conversations can only be linked by ID
 */
function findConversationByIdentifier(identifier: string): ConversationIndexEntry | null {
  const normalizedId = identifier.toLowerCase().trim();

  // Only match by ID - conversations cannot be referenced by title
  if (isConversationId(normalizedId)) {
    return getConversationEntry(normalizedId) ?? null;
  }

  return null;
}

/**
 * Parse wikilinks from text content
 */
export function parseWikilinks(text: string, notes: NoteMetadata[]): WikilinkMatch[] {
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

    // Determine target type and look up existence
    let targetType: WikilinkTargetType = 'note';
    let exists = false;
    let noteId: string | undefined;
    let conversationId: string | undefined;
    let typeId: string | undefined;

    if (isConversationId(identifier)) {
      // This is a conversation link
      targetType = 'conversation';
      const conversation = findConversationByIdentifier(identifier);
      exists = !!conversation && !conversation.archived;
      conversationId = conversation?.id;
    } else if (isNoteTypeId(identifier)) {
      // This is a note type link
      targetType = 'type';
      const noteType = getNoteType(identifier);
      exists = !!noteType && !noteType.archived;
      typeId = noteType?.id;
    } else {
      // This is a note link
      targetType = 'note';
      const existingNote = findNoteByIdentifier(identifier, notes);
      exists = !!existingNote;
      noteId = existingNote?.id;
    }

    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      text: match[0],
      identifier,
      title,
      exists,
      noteId,
      targetType,
      conversationId,
      typeId
    });
  }

  return matches;
}

/**
 * Find a note by identifier (note ID or title)
 */
function findNoteByIdentifier(
  identifier: string,
  notes: NoteMetadata[]
): NoteMetadata | null {
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
  const normalizedQuery = query.toLowerCase().trim();

  // Get notes from automerge state, excluding archived
  const notes = getAllNotes().filter((note) => !note.archived);
  const noteTypes = getNoteTypes();

  // Get conversations from automerge state, excluding archived
  const conversations = getConversations().filter((conv) => !conv.archived);

  // Filter and sort notes
  const filteredNotes = query.trim()
    ? notes
        .filter(
          (note) =>
            note.title.toLowerCase().includes(normalizedQuery) ||
            note.id.toLowerCase().includes(normalizedQuery)
        )
        .sort((a, b) => {
          const aTitle = a.title.toLowerCase();
          const bTitle = b.title.toLowerCase();

          if (aTitle === normalizedQuery) return -1;
          if (bTitle === normalizedQuery) return 1;

          if (aTitle.startsWith(normalizedQuery) && !bTitle.startsWith(normalizedQuery))
            return -1;
          if (bTitle.startsWith(normalizedQuery) && !aTitle.startsWith(normalizedQuery))
            return 1;

          return aTitle.localeCompare(bTitle);
        })
        .slice(0, 6) // Reduced to make room for conversations
    : notes.slice(0, 6);

  // Filter and sort conversations
  const filteredConversations = query.trim()
    ? conversations
        .filter(
          (conv) =>
            conv.title.toLowerCase().includes(normalizedQuery) ||
            conv.id.toLowerCase().includes(normalizedQuery)
        )
        .sort((a, b) => {
          const aTitle = a.title.toLowerCase();
          const bTitle = b.title.toLowerCase();

          if (aTitle === normalizedQuery) return -1;
          if (bTitle === normalizedQuery) return 1;

          if (aTitle.startsWith(normalizedQuery) && !bTitle.startsWith(normalizedQuery))
            return -1;
          if (bTitle.startsWith(normalizedQuery) && !aTitle.startsWith(normalizedQuery))
            return 1;

          return aTitle.localeCompare(bTitle);
        })
        .slice(0, 4)
    : conversations.slice(0, 4);

  // Filter and sort note types (only non-archived)
  const filteredTypes = query.trim()
    ? noteTypes
        .filter(
          (type) =>
            type.name.toLowerCase().includes(normalizedQuery) ||
            type.id.toLowerCase().includes(normalizedQuery)
        )
        .sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();

          if (aName === normalizedQuery) return -1;
          if (bName === normalizedQuery) return 1;

          if (aName.startsWith(normalizedQuery) && !bName.startsWith(normalizedQuery))
            return -1;
          if (bName.startsWith(normalizedQuery) && !aName.startsWith(normalizedQuery))
            return 1;

          return aName.localeCompare(bName);
        })
        .slice(0, 4)
    : noteTypes.slice(0, 4);

  const options: { label: string; apply: string; type: string; detail?: string }[] = [];

  // Add note options with type-based CSS class for icons
  for (const note of filteredNotes) {
    const noteType = noteTypes.find((t) => t.id === note.type);
    const typeId = noteType?.id || 'default';
    options.push({
      label: note.title || 'Untitled',
      apply: `${note.id}]]`,
      type: `wikilink-note wikilink-note-${typeId}`,
      detail: `${noteType?.name || 'Note'}`
    });
  }

  // Add conversation options with conversation type for CSS icon
  for (const conv of filteredConversations) {
    options.push({
      label: conv.title || 'New Conversation',
      apply: `${conv.id}]]`,
      type: 'wikilink-conversation',
      detail: 'Conversation'
    });
  }

  // Add note type options
  for (const noteType of filteredTypes) {
    options.push({
      label: noteType.name,
      apply: `${noteType.id}]]`,
      type: 'wikilink-type',
      detail: 'Type'
    });
  }

  // Add option to create new note (not for conversations)
  if (
    query.trim() &&
    !filteredNotes.some((note) => note.title.toLowerCase() === normalizedQuery)
  ) {
    options.push({
      label: `Create "${query.trim()}"`,
      apply: `${query.trim()}]]`,
      type: 'wikilink-note-new',
      detail: 'New Note'
    });
  }

  return {
    from: word.from + 2,
    options
  };
}

/**
 * RangeValue for atomic cursor movement over wikilinks
 */
class AtomicRangeValue extends RangeValue {
  eq(other: RangeValue): boolean {
    return other instanceof AtomicRangeValue;
  }
}
const atomicValue = new AtomicRangeValue();

/**
 * Widget for rendering clickable wikilinks with inline text flow
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
    private icon: string,
    private targetType: WikilinkTargetType,
    private conversationId: string | undefined,
    private typeId: string | undefined
  ) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    const container = document.createElement('span');

    // Check if target is archived
    let isArchived = false;
    const notes = getAllNotes();
    if (this.targetType === 'note' && this.noteId) {
      const note = notes.find((n) => n.id === this.noteId);
      isArchived = note?.archived ?? false;
    } else if (this.targetType === 'conversation' && this.conversationId) {
      const conversation = getConversationEntry(this.conversationId);
      isArchived = conversation?.archived ?? false;
    } else if (this.targetType === 'type' && this.typeId) {
      const noteType = getNoteType(this.typeId);
      isArchived = noteType?.archived ?? false;
    }

    // Build class name - use wikilink- prefix for theme compatibility
    const classes = ['wikilink'];
    classes.push(this.exists ? 'wikilink-exists' : 'wikilink-broken');
    if (this.isSelected) {
      classes.push(this.exists ? 'wikilink-selected' : 'wikilink-selected-broken');
    }
    if (isArchived) {
      classes.push('wikilink-archived');
    }
    // Add target type class for potential future styling differentiation
    classes.push(`wikilink-${this.targetType}`);
    container.className = classes.join(' ');

    // Resolve display text from target if using ID-only syntax
    let displayText = this.displayTitle;
    if (this.exists && this.identifier === this.displayTitle) {
      if (this.targetType === 'note' && this.noteId) {
        const linkedNote = notes.find((n) => n.id === this.noteId);
        if (linkedNote) {
          displayText = linkedNote.title || 'Untitled';
        }
      } else if (this.targetType === 'conversation' && this.conversationId) {
        const conversation = getConversationEntry(this.conversationId);
        if (conversation) {
          displayText = conversation.title || 'New Conversation';
        }
      } else if (this.targetType === 'type' && this.typeId) {
        const noteType = getNoteType(this.typeId);
        if (noteType) {
          displayText = noteType.name;
        }
      }
    }

    // Click handler - different behavior for conversations and types
    const handleClick = (e: MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (this.clickHandler) {
        if (this.targetType === 'conversation') {
          // Conversations: only navigate if exists, never create
          if (this.exists && this.conversationId) {
            this.clickHandler(this.conversationId, this.displayTitle, {
              targetType: 'conversation'
            });
          }
          // For broken conversation links: do nothing (no creation)
        } else if (this.targetType === 'type') {
          // Types: only navigate if exists, never create
          if (this.exists && this.typeId) {
            this.clickHandler(this.typeId, this.displayTitle, {
              targetType: 'type'
            });
          }
          // For broken type links: do nothing (no creation)
        } else {
          // Notes: existing behavior
          if (this.exists && this.noteId) {
            this.clickHandler(this.noteId, this.displayTitle, {
              targetType: 'note'
            });
          } else {
            this.clickHandler(this.identifier, this.displayTitle, {
              shouldCreate: true,
              targetType: 'note',
              from: this.from,
              to: this.to
            });
          }
        }
      }
    };

    // Prevent editor from handling mousedown
    const handleMouseDown = (e: MouseEvent): void => {
      e.stopPropagation();
    };

    // Track hover state across segments
    let isHovering = false;

    // Calculate combined bounding rect from all segments
    const getWikilinkBoundingRect = (): DOMRect => {
      const segments = container.querySelectorAll('.wikilink-segment');
      if (segments.length === 0) {
        return container.getBoundingClientRect();
      }

      let minLeft = Infinity;
      let minTop = Infinity;
      let maxRight = -Infinity;
      let maxBottom = -Infinity;

      segments.forEach((segment) => {
        const rect = segment.getBoundingClientRect();
        minLeft = Math.min(minLeft, rect.left);
        minTop = Math.min(minTop, rect.top);
        maxRight = Math.max(maxRight, rect.right);
        maxBottom = Math.max(maxBottom, rect.bottom);
      });

      const firstRect = segments[0].getBoundingClientRect();

      return new DOMRect(firstRect.left, minTop, maxRight - minLeft, maxBottom - minTop);
    };

    const handleMouseEnter = (): void => {
      if (isHovering || !this.hoverHandler) return;
      isHovering = true;

      const rect = getWikilinkBoundingRect();
      this.hoverHandler({
        identifier: this.identifier,
        displayText: this.displayTitle,
        from: this.from,
        to: this.to,
        x: rect.left,
        y: rect.bottom,
        yTop: rect.top,
        exists: this.exists,
        noteId: this.noteId,
        targetType: this.targetType,
        conversationId: this.conversationId,
        typeId: this.typeId
      });
    };

    const handleMouseLeave = (e: MouseEvent): void => {
      if (!this.hoverHandler) return;
      // Check if we're moving to another segment within this wikilink
      const relatedTarget = e.relatedTarget as Element | null;
      if (relatedTarget && container.contains(relatedTarget)) {
        return; // Still within wikilink
      }

      isHovering = false;
      this.hoverHandler(null);
    };

    // Helper to attach all event handlers to a segment
    const attachSegmentHandlers = (segment: HTMLElement): void => {
      segment.addEventListener('click', handleClick);
      segment.addEventListener('mousedown', handleMouseDown);
      segment.addEventListener('mouseenter', handleMouseEnter);
      segment.addEventListener('mouseleave', handleMouseLeave);
    };

    // Single span with icon inside - shares background, wraps naturally
    const textSpan = document.createElement('span');
    textSpan.className = 'wikilink-segment wikilink-text';

    // Icon inside text span (inline-block prevents underline inheritance)
    const iconSpan = document.createElement('span');
    iconSpan.className = 'wikilink-icon';
    iconSpan.textContent = this.icon;
    textSpan.appendChild(iconSpan);

    // Space + text content
    textSpan.appendChild(document.createTextNode(' ' + (displayText || 'Untitled')));

    // Trailing anchor inside text span for cursor positioning when widget wraps
    const cursorAnchor = document.createElement('span');
    cursorAnchor.className = 'wikilink-cursor-anchor';
    cursorAnchor.textContent = '\u200B'; // Zero-width space
    textSpan.appendChild(cursorAnchor);

    attachSegmentHandlers(textSpan);
    container.appendChild(textSpan);

    return container;
  }

  eq(other: WikilinkWidget): boolean {
    return (
      this.identifier === other.identifier &&
      this.displayTitle === other.displayTitle &&
      this.exists === other.exists &&
      this.noteId === other.noteId &&
      this.isSelected === other.isSelected &&
      this.icon === other.icon &&
      this.targetType === other.targetType &&
      this.conversationId === other.conversationId &&
      this.typeId === other.typeId
    );
  }

  ignoreEvent(): boolean {
    return true;
  }

  // Override to provide cursor coordinates since container uses display:contents
  coordsAt(dom: HTMLElement, pos: number, side: number): { top: number; bottom: number; left: number; right: number } | null {
    const textSpan = dom.querySelector('.wikilink-text');
    if (!textSpan) return null;

    const rects = textSpan.getClientRects();
    if (rects.length === 0) return null;

    const firstRect = rects[0];
    const lastRect = rects[rects.length - 1];
    const widgetLength = this.to - this.from;

    // pos near end with side >= 0 means cursor after widget
    // pos near start with side <= 0 means cursor before widget
    const atEnd = pos >= widgetLength - 1 || (pos > widgetLength / 2 && side >= 0);
    const atStart = pos === 0 && side <= 0;

    if (atEnd && !atStart) {
      // Cursor after widget - use last line's right edge
      return { top: lastRect.top, bottom: lastRect.bottom, left: lastRect.right, right: lastRect.right };
    } else {
      // Cursor before widget - use first line's left edge
      return { top: firstRect.top, bottom: firstRect.bottom, left: firstRect.left, right: firstRect.left };
    }
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

    // Determine icon based on target type
    let icon = '📝';
    if (wikilink.targetType === 'conversation') {
      icon = '💬';
    } else if (wikilink.targetType === 'type') {
      icon = '🏷️';
    } else if (wikilink.exists && wikilink.noteId) {
      // Get icon from note type for notes
      const note = notes.find((n) => n.id === wikilink.noteId);
      if (note) {
        const noteType = noteTypes.find((t) => t.id === note.type);
        icon = noteType?.icon || '📝';
      }
    }

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
      isSelected,
      icon,
      wikilink.targetType,
      wikilink.conversationId,
      wikilink.typeId
    );

    decorations.push(
      Decoration.replace({
        widget,
        inclusive: false,
        block: false
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
 * Update the completion icon CSS based on current note types.
 * This should be called when note types change.
 */
export function updateCompletionIconStyles(): void {
  const noteTypes = getNoteTypes();

  // Generate CSS for each note type
  const noteTypeRules = noteTypes
    .map((noteType) => {
      const icon = noteType.icon || '📝';
      return `.cm-completionIcon-wikilink-note-${noteType.id}::after { content: '${icon}'; }`;
    })
    .join('\n');

  const css = `
/* Wikilink completion icon styles */
.cm-completionIcon-wikilink-note::after,
.cm-completionIcon-wikilink-note-default::after,
.cm-completionIcon-wikilink-note-new::after {
  content: '📝';
}

.cm-completionIcon-wikilink-conversation::after {
  content: '💬';
}

.cm-completionIcon-wikilink-type::after {
  content: '🏷️';
}

/* Note type specific icons */
${noteTypeRules}
`;

  // Find or create the style element
  let styleEl = document.getElementById(
    COMPLETION_ICON_STYLE_ID
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = COMPLETION_ICON_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = css;
}

/**
 * Create the wikilinks extension for automerge
 */
export function automergeWikilinksExtension(
  onWikilinkClick: WikilinkClickHandler,
  onWikilinkHover?: WikilinkHoverHandler,
  onWikilinkEditDisplayText?: WikilinkEditDisplayTextHandler
): Extension {
  // Initialize completion icon styles
  updateCompletionIconStyles();

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
              if (selected.targetType === 'conversation') {
                // Conversations: only navigate if exists, never create
                if (selected.exists && selected.conversationId) {
                  handler(selected.conversationId, selected.title, {
                    targetType: 'conversation'
                  });
                  return true;
                }
                // For broken conversation links: do nothing
                return false;
              } else {
                // Notes: existing behavior
                if (selected.exists && selected.noteId) {
                  handler(selected.noteId, selected.title, {
                    targetType: 'note'
                  });
                } else {
                  handler(selected.identifier, selected.title, {
                    shouldCreate: true,
                    targetType: 'note'
                  });
                }
                return true;
              }
            }
          }
          return false;
        }
      },
      // Alt-Enter to edit wikilink display text
      {
        key: 'Alt-Enter',
        run: (view) => {
          const selected = getSelectedWikilink(view);
          if (selected) {
            const handler = view.state.field(wikilinkEditDisplayTextHandlerField);
            if (handler) {
              handler(selected);
              return true;
            }
          }
          return false;
        }
      }
    ])
  );

  return [
    wikilinkTheme,
    wikilinkHandlerField.init(() => onWikilinkClick),
    wikilinkHoverHandlerField.init(() => onWikilinkHover || null),
    wikilinkEditDisplayTextHandlerField.init(() => onWikilinkEditDisplayText || null),
    selectedWikilinkField,
    wikilinkField,
    autocompletion({
      override: [wikilinkCompletion],
      activateOnTyping: true,
      closeOnBlur: true
    }),
    wikilinkKeymap,
    // Add atomic ranges for proper cursor movement (cursor jumps over widget as unit)
    EditorView.atomicRanges.of((view) => {
      const decorations = view.state.field(wikilinkField, false);
      if (!decorations) {
        return RangeSet.empty;
      }

      const ranges: ReturnType<typeof atomicValue.range>[] = [];

      try {
        decorations.between(0, view.state.doc.length, (from, to, value) => {
          if (value.spec.widget instanceof WikilinkWidget) {
            ranges.push(atomicValue.range(from, to));
          }
        });

        return ranges.length > 0 ? RangeSet.of(ranges) : RangeSet.empty;
      } catch (e) {
        console.warn('Error creating atomic ranges:', e);
        return RangeSet.empty;
      }
    })
  ];
}
