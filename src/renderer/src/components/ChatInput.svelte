<script lang="ts">
  /**
   * Chat input component using CodeMirror with wikilink autocomplete
   *
   * Provides a multi-line input that supports:
   * - Wikilink autocomplete for note references ([[note]])
   * - Enter to submit, Shift+Enter for newline
   * - Dark mode support
   */
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, minimalSetup } from 'codemirror';
  import { placeholder, keymap, tooltips } from '@codemirror/view';
  import { EditorState, StateEffect, Prec, type Extension } from '@codemirror/state';
  import { completionStatus } from '@codemirror/autocomplete';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import {
    automergeWikilinksExtension,
    type WikilinkClickHandler
  } from '../lib/automerge/wikilinks.svelte';

  interface Props {
    /** Current input value */
    value: string;
    /** Placeholder text */
    placeholder?: string;
    /** Whether input is disabled */
    disabled?: boolean;
    /** Called when value changes */
    onValueChange?: (value: string) => void;
    /** Called when Enter is pressed (without Shift) to submit */
    onSubmit?: () => void;
    /** Called when a wikilink is clicked */
    onWikilinkClick?: WikilinkClickHandler;
    /** Additional CSS class */
    class?: string;
  }

  let {
    value = '',
    placeholder: placeholderText = 'Type a message...',
    disabled = false,
    onValueChange,
    onSubmit,
    onWikilinkClick,
    class: className
  }: Props = $props();

  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;

  // Reactive theme state
  let isDarkMode = $state(false);
  let mediaQuery: MediaQueryList | null = null;

  // Create theme extension for chat input styling
  const editorTheme = EditorView.theme({
    '&': {
      fontSize: '0.875rem',
      fontFamily: 'inherit'
    },
    '.cm-content': {
      padding: '10px 14px',
      minHeight: '40px',
      maxHeight: '300px',
      lineHeight: '1.4'
    },
    '.cm-focused': {
      outline: 'none'
    },
    '.cm-editor': {
      borderRadius: '8px',
      border: '1px solid var(--border-light)',
      backgroundColor: 'var(--bg-secondary)'
    },
    '.cm-editor.cm-focused': {
      borderColor: 'var(--accent-primary)',
      backgroundColor: 'var(--bg-secondary)'
    },
    '&.cm-editor.cm-focused': {
      outline: 'none'
    },
    '.cm-scroller': {
      overflow: 'auto'
    },
    '.cm-line': {
      padding: '0'
    },
    '.cm-placeholder': {
      color: 'var(--text-muted)'
    }
  });

  // Dark mode scrollbar theme
  const darkEditorTheme = EditorView.theme({
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

  function handleThemeChange(e: MediaQueryListEvent): void {
    isDarkMode = e.matches;
    updateEditorTheme();
  }

  function updateEditorTheme(): void {
    if (!editorView) return;

    editorView.dispatch({
      effects: StateEffect.reconfigure.of(createExtensions())
    });
  }

  // Default wikilink click handler (no-op if not provided)
  const defaultWikilinkClick: WikilinkClickHandler = () => {};

  function createExtensions(): Extension[] {
    const theme = isDarkMode ? githubDark : githubLight;

    const extensions: Extension[] = [
      minimalSetup,
      placeholder(placeholderText),
      theme,
      editorTheme,
      ...(isDarkMode ? [darkEditorTheme] : []),
      // Update listener for value changes
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          if (onValueChange && newValue !== value) {
            onValueChange(newValue);
          }
        }
      }),
      // Readonly state based on disabled prop
      EditorState.readOnly.of(disabled),
      // Line wrapping for multi-line input
      EditorView.lineWrapping,
      // Wikilink autocomplete extension
      automergeWikilinksExtension(onWikilinkClick ?? defaultWikilinkClick),
      // Render tooltips in document.body so they escape container overflow
      tooltips({
        parent: document.body,
        tooltipSpace: () => ({
          top: 0,
          left: 0,
          bottom: window.innerHeight,
          right: window.innerWidth
        })
      }),
      // Custom keymap for Enter handling (highest precedence to override default newline behavior)
      Prec.highest(
        keymap.of([
          {
            key: 'Enter',
            run: (view) => {
              // If autocomplete is active, let it handle Enter
              if (completionStatus(view.state) === 'active') {
                return false;
              }
              // Submit on Enter
              if (onSubmit) {
                onSubmit();
              }
              return true;
            }
          },
          {
            key: 'Shift-Enter',
            run: () => {
              // Allow Shift+Enter for newline (return false to let default handle it)
              return false;
            }
          }
        ])
      )
    ];

    return extensions;
  }

  onMount(() => {
    // Initialize dark mode state
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    isDarkMode = mediaQuery.matches;

    // Listen for theme changes
    mediaQuery.addEventListener('change', handleThemeChange);

    const startState = EditorState.create({
      doc: value,
      extensions: createExtensions()
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    });
  });

  onDestroy(() => {
    if (editorView) {
      editorView.destroy();
    }
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', handleThemeChange);
    }
  });

  // Update editor when value changes externally
  $effect(() => {
    if (editorView && value !== editorView.state.doc.toString()) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: value }
      });
    }
  });

  // Update readonly state when disabled changes
  $effect(() => {
    if (editorView) {
      editorView.dispatch({
        effects: StateEffect.reconfigure.of(createExtensions())
      });
    }
  });

  /** Focus the editor */
  export function focus(): void {
    if (editorView) {
      editorView.focus();
    }
  }

  /** Blur the editor */
  export function blur(): void {
    if (editorView) {
      editorView.contentDOM.blur();
    }
  }

  /** Check if editor is focused */
  export function isFocused(): boolean {
    return editorView?.hasFocus ?? false;
  }

  /** Clear the editor content */
  export function clear(): void {
    if (editorView) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: '' }
      });
    }
  }
</script>

<div class="chat-input-wrapper {className || ''}" class:disabled>
  <div bind:this={editorContainer} class="editor-container"></div>
</div>

<style>
  .chat-input-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .chat-input-wrapper.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .editor-container {
    position: relative;
    flex: 1;
  }

  /* Global CodeMirror overrides for this component */
  .chat-input-wrapper :global(.cm-editor) {
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-secondary);
  }

  .chat-input-wrapper :global(.cm-focused) {
    outline: none;
    border-color: var(--accent-primary) !important;
  }

  .chat-input-wrapper :global(.cm-content) {
    padding: 10px 14px;
    min-height: 40px;
    max-height: 300px;
    line-height: 1.4;
  }

  .chat-input-wrapper :global(.cm-placeholder) {
    color: var(--text-muted);
  }

  .chat-input-wrapper :global(.cm-scroller) {
    overflow: auto !important;
  }

  /* Autocomplete tooltip styling - rendered in document.body */
  :global(.cm-tooltip-autocomplete) {
    z-index: 1100 !important;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    background: var(--bg-primary);
  }
</style>
