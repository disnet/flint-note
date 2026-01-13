/**
 * Editor configuration for Automerge-based note editing
 *
 * Simplified version of EditorConfig that works with automerge state
 */
import { EditorView, minimalSetup } from 'codemirror';
import type { Extension } from '@codemirror/state';
import { dropCursor, keymap, placeholder, type ViewUpdate } from '@codemirror/view';
import { indentOnInput } from '@codemirror/language';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { githubLight } from '@fsegurai/codemirror-theme-github-light';
import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
import { markdownListStyling, listStylingTheme } from '../markdownListStyling';
import {
  automergeWikilinksExtension,
  type WikilinkClickHandler,
  type WikilinkHoverHandler,
  type WikilinkEditDisplayTextHandler
} from './wikilinks.svelte';
import {
  markdownLinksExtension,
  type MarkdownLinkClickHandler,
  type MarkdownLinkHoverHandler,
  type MarkdownLinkEditHandler
} from './markdown-links.svelte';
import { deckExtension } from './deck';
import { imageExtension } from './image-extension.svelte';
import { richPasteExtension } from './rich-paste-extension.svelte';
import {
  selectionToolbarExtension,
  applyFormat,
  type SelectionToolbarData,
  type SelectionToolbarHandler,
  type FormatType
} from './selection-toolbar.svelte';
import {
  slashMenuExtension,
  type SlashCommand,
  type SlashMenuData,
  type SlashMenuHandler
} from './slash-commands.svelte';
import {
  gutterPlusButtonExtension,
  type GutterMenuData,
  type GutterMenuHandler
} from './gutter-plus-button.svelte';
import { automergeSyncPlugin } from '@automerge/automerge-codemirror';
import type { DocHandle } from '@automerge/automerge-repo';
import type { NotesDocument } from './types';

export interface EditorConfigOptions {
  onWikilinkClick?: WikilinkClickHandler;
  onWikilinkHover?: WikilinkHoverHandler;
  /** Handler for editing wikilink display text (Alt-Enter) */
  onWikilinkEditDisplayText?: WikilinkEditDisplayTextHandler;
  /** Handler for clicking markdown links - opens external URL */
  onMarkdownLinkClick?: MarkdownLinkClickHandler;
  /** Handler for hovering over markdown links */
  onMarkdownLinkHover?: MarkdownLinkHoverHandler;
  /** Handler for editing markdown links (Alt-Enter) */
  onMarkdownLinkEdit?: MarkdownLinkEditHandler;
  /** @deprecated Use automergeSync instead for CRDT text editing */
  onContentChange?: (content: string) => void;
  onCursorChange?: () => void;
  placeholder?: string;
  variant?: 'default' | 'daily-note';
  /** Handler for opening notes from deck widgets */
  onDeckNoteOpen?: (noteId: string) => void;
  /** Automerge sync configuration for CRDT text editing */
  automergeSync?: {
    handle: DocHandle<NotesDocument>;
    path: (string | number)[];
  };
  /** Handler for document changes (called on every update) */
  onDocChange?: (update: ViewUpdate) => void;
  /** Handler for showing/hiding the selection toolbar */
  onShowSelectionToolbar?: SelectionToolbarHandler;
  /** Handler for showing the slash command menu */
  onShowSlashMenu?: SlashMenuHandler;
  /** Handler for showing the gutter menu */
  onShowGutterMenu?: GutterMenuHandler;
}

// Re-export types and utilities for consumers
export type { SelectionToolbarData, SelectionToolbarHandler, FormatType };
export type { SlashMenuData, SlashMenuHandler, SlashCommand };
export type { GutterMenuData, GutterMenuHandler };
export { applyFormat };

export class EditorConfig {
  isDarkMode = $state(false);

  private mediaQuery: MediaQueryList | null = null;

  constructor(private options: EditorConfigOptions = {}) {}

  // Base theme shared by all variants
  private getBaseTheme(): Extension {
    const isDailyNote = this.options.variant === 'daily-note';
    return EditorView.theme({
      '&': {
        height: 'auto',
        minHeight: isDailyNote ? '0' : '300px',
        fontFamily: 'var(--font-editor) !important',
        fontSize: 'var(--font-editor-size) !important',
        lineHeight: '1.6',
        width: '100%'
      },
      '&.cm-editor': {
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-editor) !important'
      },
      '&.cm-focused': {
        outline: 'none',
        boxShadow: 'none !important'
      },
      '.cm-content': {
        fontFamily: 'var(--font-editor) !important',
        color: 'var(--text-primary)',
        caretColor: 'var(--text-primary)',
        ...(isDailyNote ? { padding: '0' } : {})
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--text-primary)'
      },
      '.cm-tooltip': {
        fontFamily: 'var(--font-editor) !important'
      },
      '.cm-tooltip-autocomplete': {
        fontFamily: 'var(--font-editor) !important'
      },
      '.cm-completionLabel': {
        fontFamily: 'var(--font-editor) !important'
      },
      '.cm-line': {
        fontFamily: 'var(--font-editor) !important'
      }
    });
  }

  // Default variant theme
  private getDefaultTheme(): Extension {
    const isDailyNote = this.options.variant === 'daily-note';
    return EditorView.theme({
      '.cm-scroller': {
        width: '100%',
        overflow: 'visible !important',
        fontFamily: 'var(--font-editor) !important',
        paddingBottom: isDailyNote ? '0' : '25vh'
      }
    });
  }

  // Placeholder theme
  private placeholderTheme = EditorView.theme({
    '.cm-placeholder': {
      color: 'var(--text-placeholder)',
      fontStyle: 'italic',
      opacity: '0.7'
    }
  });

  private handleThemeChange = (e: MediaQueryListEvent): void => {
    this.isDarkMode = e.matches;
  };

  initializeTheme(): void {
    if (typeof window !== 'undefined') {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.isDarkMode = this.mediaQuery.matches;
      this.mediaQuery.addEventListener('change', this.handleThemeChange);
    }
  }

  getExtensions(): Extension[] {
    const extensions: Extension[] = [
      minimalSetup,
      dropCursor(),
      indentOnInput(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      markdown(),
      EditorView.lineWrapping,
      this.isDarkMode ? githubDark : githubLight,
      this.getBaseTheme(),
      this.getDefaultTheme(),
      markdownListStyling,
      listStylingTheme,
      // Wikilinks extension
      ...(this.options.onWikilinkClick
        ? [
            automergeWikilinksExtension(
              this.options.onWikilinkClick,
              this.options.onWikilinkHover,
              this.options.onWikilinkEditDisplayText
            )
          ]
        : []),
      // Markdown links extension
      ...(this.options.onMarkdownLinkClick
        ? [
            markdownLinksExtension(
              this.options.onMarkdownLinkClick,
              this.options.onMarkdownLinkHover,
              this.options.onMarkdownLinkEdit
            )
          ]
        : []),
      // Slash menu extension
      ...(this.options.onShowSlashMenu
        ? [slashMenuExtension(this.options.onShowSlashMenu)]
        : []),
      // Deck extension for flint-deck code blocks
      ...(this.options.onDeckNoteOpen
        ? [
            deckExtension({
              onNoteOpen: this.options.onDeckNoteOpen,
              onConfigChange: (_from, _to, _config) => {
                // Config changes are handled by the widget itself via updateDeckBlock
                // This is called when inline deck YAML changes (deprecated)
              }
            })
          ]
        : []),
      // Image extension for inline OPFS images
      imageExtension(),
      // Rich paste extension for HTML to markdown conversion
      richPasteExtension(),
      // Selection toolbar extension
      ...(this.options.onShowSelectionToolbar
        ? [selectionToolbarExtension(this.options.onShowSelectionToolbar)]
        : []),
      // Gutter plus button extension
      ...(this.options.onShowGutterMenu
        ? [gutterPlusButtonExtension(this.options.onShowGutterMenu)]
        : []),
      EditorView.contentAttributes.of({ spellcheck: 'true' }),
      EditorView.editable.of(true)
    ];

    // Add automerge sync plugin for CRDT text editing
    if (this.options.automergeSync) {
      extensions.push(
        automergeSyncPlugin({
          handle: this.options.automergeSync.handle,
          path: this.options.automergeSync.path
        })
      );
    }

    // Add legacy update listener for onContentChange and onCursorChange callbacks
    if (this.options.onContentChange || this.options.onCursorChange) {
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.selectionSet && !update.docChanged) {
          this.options.onCursorChange?.();
        }
        if (update.docChanged) {
          this.options.onContentChange?.(update.state.doc.toString());
        }
      });
      extensions.push(updateListener);
    }

    // Add update listener for onDocChange callback
    if (this.options.onDocChange) {
      extensions.push(EditorView.updateListener.of(this.options.onDocChange));
    }

    // Add placeholder if provided
    if (this.options.placeholder) {
      extensions.push(placeholder(this.options.placeholder));
      extensions.push(this.placeholderTheme);
    }

    return extensions;
  }

  destroy(): void {
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener('change', this.handleThemeChange);
    }
  }
}
