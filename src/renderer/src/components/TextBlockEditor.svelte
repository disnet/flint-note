<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, minimalSetup } from 'codemirror';
  import { keymap } from '@codemirror/view';
  import { EditorState, StateEffect, type Extension, Prec } from '@codemirror/state';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';

  interface Props {
    value: string;
    placeholder?: string;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    minHeight?: string;
  }

  let {
    value = '',
    placeholder = 'Enter text...',
    disabled = false,
    onValueChange,
    onKeyDown,
    minHeight = '120px'
  }: Props = $props();

  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;

  // DOM event handler for key events
  function handleDOMKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      if (onKeyDown) {
        onKeyDown(event);
      }
      return;
    }

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

  // Create theme extension for editor styling
  const editorTheme = EditorView.theme({
    '&': {
      fontSize: '0.875rem',
      fontFamily: 'inherit'
    },
    '.cm-content': {
      padding: '0.75rem',
      minHeight: minHeight,
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

    return [
      // Use minimalSetup instead of basicSetup (excludes line numbers)
      minimalSetup,
      // Custom keymap with highest precedence
      Prec.highest(
        keymap.of([
          {
            key: 'Escape',
            run: () => {
              if (onKeyDown) {
                const event = new KeyboardEvent('keydown', {
                  key: 'Escape',
                  bubbles: true,
                  cancelable: true
                });
                onKeyDown(event);
              }
              return true;
            }
          },
          {
            key: 'Mod-Enter',
            run: (_view) => {
              if (onKeyDown) {
                // Determine if we're on Mac (Cmd) or PC (Ctrl)
                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                const event = new KeyboardEvent('keydown', {
                  key: 'Enter',
                  ctrlKey: !isMac,
                  metaKey: isMac,
                  bubbles: true,
                  cancelable: true
                });
                onKeyDown(event);
                return true; // Prevent default CodeMirror behavior
              }
              return false;
            }
          }
        ])
      ),
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
      EditorView.lineWrapping,
      EditorState.readOnly.of(disabled)
    ];
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

<div class="textblock-editor" class:disabled>
  <div bind:this={editorContainer} class="editor-container"></div>
  <div class="editor-hint">
    {placeholder} • Cmd/Ctrl+Enter to confirm • Escape to cancel
  </div>
</div>

<style>
  .textblock-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .textblock-editor.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .editor-container {
    position: relative;
  }

  .editor-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-style: italic;
    text-align: right;
  }

  /* Global CodeMirror overrides for this component */
  .textblock-editor :global(.cm-editor) {
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
  }

  .textblock-editor :global(.cm-focused) {
    outline: none;
    border-color: var(--accent) !important;
    background: var(--bg-secondary) !important;
  }

  .textblock-editor :global(.cm-content) {
    padding: 0.75rem;
    min-height: 120px;
  }

  .textblock-editor :global(.cm-placeholder) {
    color: var(--text-placeholder);
  }
</style>
