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

export interface AutomergeEditorConfigOptions {
  onWikilinkClick?: WikilinkClickHandler;
  onWikilinkHover?: WikilinkHoverHandler;
  onContentChange?: (content: string) => void;
  onCursorChange?: () => void;
  placeholder?: string;
  variant?: 'default' | 'daily-note';
}

export class AutomergeEditorConfig {
  isDarkMode = $state(false);

  private mediaQuery: MediaQueryList | null = null;

  constructor(private options: AutomergeEditorConfigOptions = {}) {}

  // Base theme shared by all variants
  private getBaseTheme(): Extension {
    return EditorView.theme({
      '&': {
        height: '100%',
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
        caretColor: 'var(--text-primary)'
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
    return EditorView.theme({
      '.cm-scroller': {
        width: '100%',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(0, 0, 0, 0.2) transparent',
        marginBottom: '25vh',
        overflow: 'visible',
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important",
        paddingRight: '20px'
      },
      '.cm-scroller::-webkit-scrollbar': {
        width: '12px'
      },
      '.cm-scroller::-webkit-scrollbar-track': {
        background: 'transparent',
        borderRadius: '6px'
      },
      '.cm-scroller::-webkit-scrollbar-thumb': {
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '6px',
        border: '2px solid transparent',
        backgroundClip: 'padding-box',
        transition: 'all 0.2s ease'
      },
      '.cm-scroller::-webkit-scrollbar-thumb:hover': {
        background: 'rgba(0, 0, 0, 0.3)',
        backgroundClip: 'padding-box'
      },
      '.cm-scroller::-webkit-scrollbar-corner': {
        background: 'transparent'
      }
    });
  }

  // Dark mode scrollbar theme
  private darkEditorTheme = EditorView.theme({
    '.cm-scroller': {
      scrollbarColor: 'rgba(255, 255, 255, 0.2) transparent'
    },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      background: 'rgba(255, 255, 255, 0.2)'
    },
    '.cm-scroller::-webkit-scrollbar-thumb:hover': {
      background: 'rgba(255, 255, 255, 0.3)'
    }
  });

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
      ...(this.isDarkMode ? [this.darkEditorTheme] : []),
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
