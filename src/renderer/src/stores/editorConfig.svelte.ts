import { EditorView, minimalSetup } from 'codemirror';
import { type Extension, Prec } from '@codemirror/state';
import { dropCursor, keymap, placeholder } from '@codemirror/view';
import { indentOnInput } from '@codemirror/language';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { githubLight } from '@fsegurai/codemirror-theme-github-light';
import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
import { markdownListStyling, listStylingTheme } from '../lib/markdownListStyling';
import {
  wikilinksExtension,
  type WikilinkHoverHandler,
  type WikilinkEditHandler,
  getSelectedWikilink
} from '../lib/wikilinks.svelte.js';

export interface EditorConfigOptions {
  onWikilinkClick?: (
    noteId: string,
    title: string,
    shouldCreate?: boolean,
    shiftKey?: boolean
  ) => Promise<void>;
  onWikilinkHover?: WikilinkHoverHandler;
  onWikilinkEdit?: WikilinkEditHandler;
  onContentChange?: (content: string) => void;
  onCursorChange?: () => void;
  onEnterKey?: () => void;
  onHoverPopoverEnter?: () => boolean;
  onHoverPopoverAltEnter?: () => boolean;
  placeholder?: string;
  variant?: 'default' | 'daily-note' | 'backlink-context' | 'sidebar-note';
}

export class EditorConfig {
  isDarkMode = $state(false);

  private mediaQuery: MediaQueryList | null = null;

  constructor(private options: EditorConfigOptions = {}) {}

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
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
      },
      '&.cm-focused': {
        outline: 'none',
        boxShadow: 'none !important'
      },
      '.cm-content': {
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
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

  // Default variant theme (for regular note editor)
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
        paddingRight: '40px'
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

  // Dark mode theme extension
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

  // Daily note variant theme
  private getDailyNoteTheme(): Extension {
    return EditorView.theme({
      '&.cm-editor': {
        border: 'none',
        borderRadius: '0.375rem'
      },
      '.cm-scroller': {
        width: '100%',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(0, 0, 0, 0.2) transparent',
        padding: '0.25rem',
        marginBottom: '0', // NO 25vh margin for daily notes
        overflow: 'visible',
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
      },
      '.cm-content': {
        padding: '0'
      },
      '.cm-line': {
        lineHeight: '1.6'
      },
      '.cm-scroller::-webkit-scrollbar': {
        width: '8px'
      },
      '.cm-scroller::-webkit-scrollbar-track': {
        background: 'transparent'
      },
      '.cm-scroller::-webkit-scrollbar-thumb': {
        background: 'var(--scrollbar-thumb)',
        borderRadius: '4px'
      },
      '.cm-scroller::-webkit-scrollbar-thumb:hover': {
        background: 'var(--scrollbar-thumb-hover)'
      }
    });
  }

  // Backlink context variant theme (minimal single-line)
  private getBacklinkContextTheme(): Extension {
    return EditorView.theme({
      '&': {
        height: 'auto'
      },
      '&.cm-editor': {
        border: 'none',
        backgroundColor: 'transparent'
      },
      '&.cm-focused': {
        outline: '1px solid var(--border-light)',
        borderRadius: '2px'
      },
      '.cm-scroller': {
        overflow: 'hidden',
        marginBottom: '0',
        padding: '0',
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
      },
      '.cm-content': {
        padding: '0',
        minHeight: '1.5rem'
      },
      '.cm-line': {
        padding: '0',
        lineHeight: '1.4'
      }
    });
  }

  // Sidebar note variant theme (compact multi-line editor)
  private getSidebarNoteTheme(): Extension {
    return EditorView.theme({
      '&.cm-editor': {
        border: 'none',
        borderRadius: '0.375rem'
      },
      '.cm-scroller': {
        width: '100%',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(0, 0, 0, 0.2) transparent',
        marginBottom: '0', // NO 25vh margin for sidebar notes
        overflow: 'visible',
        fontFamily:
          "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
      },
      '.cm-content': {
        padding: '0.5rem'
      },
      '.cm-line': {
        lineHeight: '1.6'
      },
      '.cm-scroller::-webkit-scrollbar': {
        width: '8px'
      },
      '.cm-scroller::-webkit-scrollbar-track': {
        background: 'transparent'
      },
      '.cm-scroller::-webkit-scrollbar-thumb': {
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '4px'
      },
      '.cm-scroller::-webkit-scrollbar-thumb:hover': {
        background: 'rgba(0, 0, 0, 0.3)'
      }
    });
  }

  // Placeholder theme extension
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

    // Create hover popover keyboard handlers with high precedence (checked before wikilinks)
    const hoverPopoverKeymap =
      this.options.onHoverPopoverEnter || this.options.onHoverPopoverAltEnter
        ? Prec.high(
            keymap.of([
              {
                key: 'Mod-Enter',
                run: () => {
                  // Check if hover popover should handle it
                  if (this.options.onHoverPopoverEnter?.()) {
                    return true; // Consumed by hover popover
                  }
                  return false; // Let other handlers process it
                }
              },
              {
                key: 'Alt-Enter',
                run: () => {
                  // Check if hover popover should handle it
                  if (this.options.onHoverPopoverAltEnter?.()) {
                    return true; // Consumed by hover popover
                  }
                  return false; // Let other handlers process it
                }
              }
            ])
          )
        : null;

    // Create custom Enter key handler for backlink context with highest precedence
    const enterKeymap =
      this.options.variant === 'backlink-context' && this.options.onEnterKey
        ? Prec.highest(
            keymap.of([
              {
                key: 'Enter',
                run: (view) => {
                  // Check if there's a selected wikilink first - if so, let wikilinks handle it
                  const selectedWikilink = getSelectedWikilink(view);
                  if (selectedWikilink) {
                    return false; // Let wikilinks extension handle it
                  }
                  // Otherwise, navigate to source
                  this.options.onEnterKey?.();
                  return true; // Prevent default newline behavior
                }
              }
            ])
          )
        : null;

    const extensions: Extension[] = [
      minimalSetup,
      dropCursor(),
      indentOnInput(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      highlightSelectionMatches(),
      markdown(),
      EditorView.lineWrapping,
      this.isDarkMode ? githubDark : githubLight,
      ...(this.isDarkMode ? [this.darkEditorTheme] : []),
      // Base theme shared by all variants
      this.getBaseTheme(),
      // Variant-specific theme
      this.options.variant === 'daily-note'
        ? this.getDailyNoteTheme()
        : this.options.variant === 'backlink-context'
          ? this.getBacklinkContextTheme()
          : this.options.variant === 'sidebar-note'
            ? this.getSidebarNoteTheme()
            : this.getDefaultTheme(),
      markdownListStyling,
      listStylingTheme,
      ...(this.options.onWikilinkClick
        ? [
            wikilinksExtension(
              this.options.onWikilinkClick,
              this.options.onWikilinkHover,
              this.options.onWikilinkEdit
            )
          ]
        : []),
      EditorView.contentAttributes.of({ spellcheck: 'true' }),
      EditorView.editable.of(true),
      updateListener,
      // Add hover popover keymap before wikilinks but after other handlers
      ...(hoverPopoverKeymap ? [hoverPopoverKeymap] : []),
      // Add custom Enter key handler last for highest precedence
      ...(enterKeymap ? [enterKeymap] : [])
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
