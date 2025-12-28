<script lang="ts">
  /**
   * Single-line CodeMirror editor for backlink context
   * Syncs changes back to the source note via Automerge
   */
  import { onMount } from 'svelte';
  import { EditorView, minimalSetup } from 'codemirror';
  import { EditorState, StateEffect, type Extension } from '@codemirror/state';
  import { keymap } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import {
    getNoteContentHandle,
    automergeWikilinksExtension,
    type WikilinkClickHandler
  } from '../lib/automerge';

  interface Props {
    sourceNoteId: string;
    lineNumber: number;
    initialText: string;
    onWikilinkClick?: WikilinkClickHandler;
  }

  let { sourceNoteId, lineNumber, initialText, onWikilinkClick }: Props = $props();

  let editorContainer: HTMLElement | null = $state(null);
  let editorView: EditorView | null = null;
  let isDarkMode = $state(false);
  let mediaQuery: MediaQueryList | null = null;

  // Track if we're currently syncing to avoid feedback loops
  let isSyncing = false;

  // Theme for single-line editor
  function getEditorTheme(): ReturnType<typeof EditorView.theme> {
    return EditorView.theme({
      '&': {
        fontSize: '1rem',
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
        padding: '0.25rem 0',
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
      }
    });
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
      const handle = await getNoteContentHandle(sourceNoteId);
      if (!handle) return;

      const doc = handle.doc();
      if (!doc) return;

      const content = doc.content || '';
      const lines = content.split('\n');

      // Make sure line number is still valid
      if (lineNumber < 0 || lineNumber >= lines.length) return;

      // Replace the line
      lines[lineNumber] = newLineText;
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
    if (!editorContainer || editorView) return;

    const startState = EditorState.create({
      doc: initialText,
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

  // Create editor when container is available
  $effect(() => {
    if (editorContainer && !editorView) {
      createEditor();
    }
  });

  // Update editor content when initialText changes (e.g., from external edits)
  $effect(() => {
    if (editorView && !isSyncing) {
      const currentText = editorView.state.doc.toString();
      if (currentText !== initialText) {
        isSyncing = true;
        editorView.dispatch({
          changes: {
            from: 0,
            to: currentText.length,
            insert: initialText
          }
        });
        isSyncing = false;
      }
    }
  });
</script>

<div class="backlink-line-editor editor-font" bind:this={editorContainer}></div>

<style>
  .backlink-line-editor {
    flex: 1;
    min-width: 0;
  }

  .backlink-line-editor :global(.cm-editor) {
    background: transparent;
  }

  .backlink-line-editor :global(.cm-gutters) {
    display: none;
  }
</style>
