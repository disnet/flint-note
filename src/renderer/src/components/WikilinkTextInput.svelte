<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, minimalSetup } from 'codemirror';
  import { placeholder } from '@codemirror/view';
  import { EditorState, StateEffect, type Extension } from '@codemirror/state';
  import { completionStatus } from '@codemirror/autocomplete';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import { wikilinksExtension, type WikilinkClickHandler } from '../lib/wikilinks.svelte';

  interface Props {
    value: string;
    placeholder?: string;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    onWikilinkClick?: WikilinkClickHandler;
    class?: string;
  }

  let {
    value = '',
    placeholder: placeholderText,
    disabled = false,
    onValueChange,
    onKeyDown,
    onWikilinkClick,
    class: className
  }: Props = $props();

  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;

  // DOM event handler for key events
  function handleDOMKeyDown(event: KeyboardEvent): void {
    // For Enter key, check if autocompletion is active first
    if (event.key === 'Enter') {
      if (editorView) {
        const completion = completionStatus(editorView.state);
        if (completion === 'active') {
          // Let CodeMirror handle Enter for autocompletion
          return;
        }
      }
      // Handle Enter for parameter navigation only when completion is not active
      event.preventDefault();
      event.stopPropagation();
      if (onKeyDown) {
        onKeyDown(event);
      }
      return;
    }

    // For Tab key, check if autocompletion is active first
    if (event.key === 'Tab') {
      if (editorView) {
        const completion = completionStatus(editorView.state);
        if (completion === 'active') {
          // Let CodeMirror handle Tab for autocompletion
          return;
        }
      }
      // Handle Tab for parameter navigation only when completion is not active
      event.preventDefault();
      event.stopPropagation();
      if (onKeyDown) {
        onKeyDown(event);
      }
      return;
    }

    // For Escape, always handle for parameter navigation
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (onKeyDown) {
        onKeyDown(event);
      }
      return;
    }
  }

  // Reactive theme state
  let isDarkMode = $state(false);
  let mediaQuery: MediaQueryList | null = null;

  // Create theme extension for single-line editor styling
  const editorTheme = EditorView.theme({
    '&': {
      fontSize: '0.875rem',
      fontFamily: 'inherit'
    },
    '.cm-content': {
      padding: '0.5rem 0.75rem',
      minHeight: '2.5rem',
      maxHeight: '2.5rem',
      lineHeight: '1.5'
    },
    '.cm-focused': {
      outline: 'none'
    },
    '.cm-editor': {
      borderRadius: '0.375rem',
      border: '1px solid var(--border-light)',
      backgroundColor: 'var(--bg-primary)'
    },
    '.cm-editor.cm-focused': {
      borderColor: 'var(--accent)',
      backgroundColor: 'var(--bg-secondary)'
    },
    '&.cm-editor.cm-focused': {
      outline: 'none'
    },
    '.cm-scroller': {
      overflow: 'hidden' // Prevent scrolling for single line
    }
  });

  // Dark mode theme extension
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

  function createExtensions(): Extension[] {
    const theme = isDarkMode ? githubDark : githubLight;

    const extensions: Extension[] = [
      // Use minimalSetup instead of basicSetup (excludes line numbers)
      minimalSetup,
      // Placeholder extension
      placeholder(placeholderText || 'Enter text...'),
      // Apply the appropriate theme
      theme,
      // Apply editor styling theme
      editorTheme,
      ...(isDarkMode ? [darkEditorTheme] : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          if (onValueChange && newValue !== value) {
            onValueChange(newValue);
          }
        }
      }),
      // Disable line wrapping for single line input
      EditorState.readOnly.of(disabled)
    ];

    // Add wikilinks extension if click handler is provided
    if (onWikilinkClick) {
      extensions.push(wikilinksExtension(onWikilinkClick));
    }

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

    // Add DOM event listener for key events
    editorContainer.addEventListener('keydown', handleDOMKeyDown, true);
  });

  onDestroy(() => {
    if (editorView) {
      editorView.destroy();
    }
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', handleThemeChange);
    }
    if (editorContainer) {
      editorContainer.removeEventListener('keydown', handleDOMKeyDown, true);
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

  export function focus(): void {
    if (editorView) {
      editorView.focus();
    }
  }
</script>

<div class="wikilink-text-input {className || ''}" class:disabled>
  <div bind:this={editorContainer} class="editor-container"></div>
</div>

<style>
  .wikilink-text-input {
    display: flex;
    flex-direction: column;
  }

  .wikilink-text-input.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .editor-container {
    position: relative;
  }

  /* Global CodeMirror overrides for this component */
  .wikilink-text-input :global(.cm-editor) {
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
  }

  .wikilink-text-input :global(.cm-focused) {
    outline: none;
    border-color: var(--accent) !important;
    background: var(--bg-secondary) !important;
  }

  .wikilink-text-input :global(.cm-content) {
    padding: 0.5rem 0.75rem;
    min-height: 2.5rem;
    max-height: 2.5rem;
    overflow: hidden;
  }

  .wikilink-text-input :global(.cm-placeholder) {
    color: var(--text-placeholder);
  }
</style>
