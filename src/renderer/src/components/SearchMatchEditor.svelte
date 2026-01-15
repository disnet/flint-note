<script lang="ts">
  /**
   * Single-line CodeMirror editor for search match context
   * Similar to BacklinkLineEditor but loads the full line from the note
   * and syncs changes back via Automerge. Highlights search matches.
   */
  import { onMount } from 'svelte';
  import { EditorView, minimalSetup } from 'codemirror';
  import {
    EditorState,
    StateEffect,
    StateField,
    type Extension,
    type Range
  } from '@codemirror/state';
  import { keymap, Decoration, type DecorationSet } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import {
    getNoteContent,
    getNoteContentHandle,
    automergeWikilinksExtension,
    type WikilinkClickHandler
  } from '../lib/automerge';

  interface Props {
    noteId: string;
    /** 1-indexed line number from SearchMatch */
    lineNumber: number;
    /** Search query to highlight */
    searchQuery?: string;
    onWikilinkClick?: WikilinkClickHandler;
  }

  let { noteId, lineNumber, searchQuery, onWikilinkClick }: Props = $props();

  let editorContainer: HTMLElement | null = $state(null);
  let editorView: EditorView | null = null;
  let isDarkMode = $state(false);
  let mediaQuery: MediaQueryList | null = null;
  let lineText = $state<string | null>(null);
  let isLoading = $state(true);

  // Track if we're currently syncing to avoid feedback loops
  let isSyncing = false;

  // Load the full line content from the note
  async function loadLineContent(): Promise<void> {
    isLoading = true;
    try {
      const content = await getNoteContent(noteId);
      if (content) {
        const lines = content.split('\n');
        // lineNumber is 1-indexed, convert to 0-indexed
        const zeroIndexedLine = lineNumber - 1;
        if (zeroIndexedLine >= 0 && zeroIndexedLine < lines.length) {
          lineText = lines[zeroIndexedLine];
        } else {
          lineText = '';
        }
      } else {
        lineText = '';
      }
    } catch {
      lineText = '';
    }
    isLoading = false;
  }

  // Theme for single-line editor
  function getEditorTheme(): ReturnType<typeof EditorView.theme> {
    return EditorView.theme({
      '&': {
        fontSize: '0.875rem',
        fontFamily: 'var(--font-editor) !important',
        lineHeight: '1.5',
        backgroundColor: 'transparent'
      },
      '&.cm-editor': {
        backgroundColor: 'transparent'
      },
      '&.cm-focused': {
        outline: 'none',
        boxShadow: 'none !important'
      },
      '.cm-content': {
        fontFamily: 'var(--font-editor) !important',
        padding: '0.125rem 0',
        caretColor: 'var(--text-primary)'
      },
      '.cm-line': {
        fontFamily: 'var(--font-editor) !important',
        padding: '0'
      },
      '.cm-scroller': {
        overflow: 'hidden !important'
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--text-primary)'
      },
      // Search highlight styling
      '.cm-searchMatch': {
        backgroundColor: 'var(--highlight-bg, #fef08a)',
        color: 'var(--highlight-text, #713f12)',
        padding: '0 1px',
        borderRadius: '2px'
      }
    });
  }

  // Dark mode theme override for search highlights
  const darkSearchHighlightTheme = EditorView.theme(
    {
      '.cm-searchMatch': {
        backgroundColor: 'var(--highlight-bg-dark, #854d0e)',
        color: 'var(--highlight-text-dark, #fef9c3)'
      }
    },
    { dark: true }
  );

  /**
   * Create a StateField that highlights search matches in the document.
   * Splits multi-word queries and highlights each word separately.
   */
  function createSearchHighlightExtension(query: string): Extension {
    if (!query.trim()) return [];

    const searchMark = Decoration.mark({ class: 'cm-searchMatch' });

    // Split query into words and escape each one
    const words = query
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (words.length === 0) return [];

    // Escape special regex characters for each word
    const escapedWords = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // Create alternation pattern: word1|word2|word3
    const pattern = escapedWords.join('|');
    const searchRegex = new RegExp(pattern, 'gi');

    const searchHighlightField = StateField.define<DecorationSet>({
      create(state) {
        const decorations: Range<Decoration>[] = [];
        const text = state.doc.toString();
        let match;
        while ((match = searchRegex.exec(text)) !== null) {
          decorations.push(searchMark.range(match.index, match.index + match[0].length));
        }
        return Decoration.set(decorations);
      },
      update(decorations, tr) {
        if (!tr.docChanged) return decorations;
        // Rebuild decorations when document changes
        const newDecorations: Range<Decoration>[] = [];
        const text = tr.state.doc.toString();
        let match;
        // Reset regex lastIndex
        searchRegex.lastIndex = 0;
        while ((match = searchRegex.exec(text)) !== null) {
          newDecorations.push(
            searchMark.range(match.index, match.index + match[0].length)
          );
        }
        return Decoration.set(newDecorations);
      },
      provide: (f) => EditorView.decorations.from(f)
    });

    return searchHighlightField;
  }

  function getExtensions(): Extension[] {
    const extensions: Extension[] = [
      minimalSetup,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      EditorView.lineWrapping,
      isDarkMode ? githubDark : githubLight,
      getEditorTheme(),
      EditorView.contentAttributes.of({ spellcheck: 'true' })
    ];

    // Add dark mode theme override for search highlights
    if (isDarkMode) {
      extensions.push(darkSearchHighlightTheme);
    }

    // Add search highlighting if query provided
    if (searchQuery) {
      extensions.push(createSearchHighlightExtension(searchQuery));
    }

    // Add wikilinks if handler provided
    if (onWikilinkClick) {
      extensions.push(automergeWikilinksExtension(onWikilinkClick));
    }

    // Add update listener for syncing changes to source note
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !isSyncing) {
          syncToSource(update.state.doc.toString());
        }
      })
    );

    return extensions;
  }

  async function syncToSource(newLineText: string): Promise<void> {
    isSyncing = true;
    try {
      const handle = await getNoteContentHandle(noteId);
      if (!handle) return;

      const doc = handle.doc();
      if (!doc) return;

      const content = doc.content || '';
      const lines = content.split('\n');

      // lineNumber is 1-indexed, convert to 0-indexed
      const zeroIndexedLine = lineNumber - 1;

      // Make sure line number is still valid
      if (zeroIndexedLine < 0 || zeroIndexedLine >= lines.length) return;

      // Replace the line
      lines[zeroIndexedLine] = newLineText;
      const newContent = lines.join('\n');

      handle.change((d) => {
        d.content = newContent;
      });
    } finally {
      isSyncing = false;
    }
  }

  function handleThemeChange(e: MediaQueryListEvent): void {
    isDarkMode = e.matches;
    if (editorView) {
      editorView.dispatch({
        effects: StateEffect.reconfigure.of(getExtensions())
      });
    }
  }

  function createEditor(): void {
    if (!editorContainer || editorView || lineText === null) return;

    const startState = EditorState.create({
      doc: lineText,
      extensions: getExtensions()
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    });
  }

  onMount(() => {
    // Initialize theme detection
    if (typeof window !== 'undefined') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      isDarkMode = mediaQuery.matches;
      mediaQuery.addEventListener('change', handleThemeChange);
    }

    // Load the line content
    loadLineContent();

    return () => {
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }
      if (mediaQuery) {
        mediaQuery.removeEventListener('change', handleThemeChange);
      }
    };
  });

  // Create editor when container is available and content is loaded
  $effect(() => {
    if (editorContainer && !editorView && lineText !== null) {
      createEditor();
    }
  });

  // Update editor content when lineText changes externally
  $effect(() => {
    if (editorView && lineText !== null && !isSyncing) {
      const currentText = editorView.state.doc.toString();
      if (currentText !== lineText) {
        isSyncing = true;
        editorView.dispatch({
          changes: {
            from: 0,
            to: currentText.length,
            insert: lineText
          }
        });
        isSyncing = false;
      }
    }
  });
</script>

{#if isLoading}
  <span class="loading-text">Loading...</span>
{:else}
  <div class="search-match-editor editor-font" bind:this={editorContainer}></div>
{/if}

<style>
  .search-match-editor {
    flex: 1;
    min-width: 0;
  }

  .search-match-editor :global(.cm-editor) {
    background: transparent;
  }

  .search-match-editor :global(.cm-gutters) {
    display: none;
  }

  .loading-text {
    color: var(--text-muted);
    font-size: 0.875rem;
    font-style: italic;
  }
</style>
