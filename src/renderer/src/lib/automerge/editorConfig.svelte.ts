/**
 * Editor configuration for Automerge-based note editing
 *
 * Simplified version of EditorConfig that works with automerge state
 */
import { EditorView, minimalSetup } from 'codemirror';
import type { Extension } from '@codemirror/state';
import { dropCursor, keymap, placeholder } from '@codemirror/view';
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
  type WikilinkHoverHandler
} from './wikilinks.svelte';
import { deckExtension } from './deck';

export interface EditorConfigOptions {
  onWikilinkClick?: WikilinkClickHandler;
  onWikilinkHover?: WikilinkHoverHandler;
  onContentChange?: (content: string) => void;
  onCursorChange?: () => void;
  placeholder?: string;
  variant?: 'default' | 'daily-note';
  /** Handler for opening notes from deck widgets */
  onDeckNoteOpen?: (noteId: string) => void;
}

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
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important",
        fontSize: 'var(--font-editor-size) !important',
        lineHeight: '1.6',
        width: '100%'
      },
      '&.cm-editor': {
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
      },
      '&.cm-focused': {
        outline: 'none',
        boxShadow: 'none !important'
      },
      '.cm-content': {
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important",
        color: 'var(--text-primary)',
        caretColor: 'var(--text-primary)',
        ...(isDailyNote ? { padding: '0' } : {})
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--text-primary)'
      },
      '.cm-tooltip': {
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
      },
      '.cm-tooltip-autocomplete': {
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
      },
      '.cm-completionLabel': {
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
      },
      '.cm-line': {
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
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
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important",
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
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.selectionSet && !update.docChanged) {
        this.options.onCursorChange?.();
      }
      if (update.docChanged) {
        this.options.onContentChange?.(update.state.doc.toString());
      }
    });

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
              this.options.onWikilinkHover
            )
          ]
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
      EditorView.contentAttributes.of({ spellcheck: 'true' }),
      EditorView.editable.of(true),
      updateListener
    ];

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
