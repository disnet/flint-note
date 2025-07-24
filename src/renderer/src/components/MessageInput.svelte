<script lang="ts">
  import ModelSelector from './ModelSelector.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState, StateEffect } from '@codemirror/state';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import {
    keymap,
    placeholder,
    highlightSpecialChars,
    drawSelection,
    rectangularSelection,
    crosshairCursor
  } from '@codemirror/view';
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { wikilinksExtension } from '../lib/wikilinks.svelte.js';

  let { onSend }: { onSend: (text: string) => void } = $props();

  let inputText = $state('');
  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;

  // Reactive theme state
  let isDarkMode = $state(false);
  let mediaQuery: MediaQueryList | null = null;

  function handleSubmit(): void {
    const text = inputText.trim();
    if (text) {
      onSend(text);
      inputText = '';
      // Clear the editor content
      if (editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: '' }
        });
      }
    }
  }

  function handleWikilinkClick(_noteId: string, _title: string): void {
    // For message input, we might want to handle this differently
    // For now, just focus back to the editor
    editorView?.focus();
  }

  function handleThemeChange(e: MediaQueryListEvent): void {
    isDarkMode = e.matches;
    updateEditorTheme();
  }

  function updateEditorTheme(): void {
    if (!editorView) return;

    // Create a new complete extension configuration with the appropriate theme
    const githubTheme = isDarkMode ? githubDark : githubLight;

    const extensions = [
      // Put the custom keymap FIRST to ensure it takes precedence over default keymaps
      keymap.of([
        {
          key: 'Enter',
          run: (view) => {
            const text = view.state.doc.toString().trim();
            if (text) {
              handleSubmit();
              return true;
            }
            return false;
          }
        },
        {
          key: 'Shift-Enter',
          run: (view) => {
            // Allow line breaks with Shift+Enter
            view.dispatch(view.state.replaceSelection('\n'));
            return true;
          }
        }
      ]),
      // Essential editor features
      highlightSpecialChars(),
      history(),
      drawSelection(),
      rectangularSelection(),
      crosshairCursor(),
      highlightSelectionMatches(),
      // Now add default keymaps AFTER our custom ones
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      placeholder('Type your message... Use [[note]] for wikilinks'),
      // GitHub theme
      githubTheme,
      // Custom styling theme
      EditorView.theme({
        '&': {
          fontSize: '0.875rem',
          fontFamily: 'inherit'
        },
        '.cm-editor': {
          borderRadius: '1rem',
          background: 'transparent'
        },
        '.cm-focused': {
          outline: 'none'
        },
        '.cm-content': {
          padding: '0.75rem 1rem',
          minHeight: '1.25rem',
          maxHeight: '120px',
          caretColor: 'var(--text-secondary)'
        },
        '.cm-line': {
          lineHeight: '1.4'
        }
      }),
      wikilinksExtension(handleWikilinkClick),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          inputText = update.state.doc.toString();
        }
      }),
      EditorView.lineWrapping
    ];

    editorView.dispatch({
      effects: StateEffect.reconfigure.of(extensions)
    });
  }

  onMount(() => {
    if (!editorContainer) return;

    // Initialize dark mode state
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    isDarkMode = mediaQuery.matches;

    // Listen for theme changes
    mediaQuery.addEventListener('change', handleThemeChange);

    const githubTheme = isDarkMode ? githubDark : githubLight;

    const startState = EditorState.create({
      doc: '',
      extensions: [
        // Put the custom keymap FIRST to ensure it takes precedence over default keymaps
        keymap.of([
          {
            key: 'Enter',
            run: (view) => {
              const text = view.state.doc.toString().trim();
              if (text) {
                handleSubmit();
                return true;
              }
              return false;
            }
          },
          {
            key: 'Shift-Enter',
            run: (view) => {
              // Allow line breaks with Shift+Enter
              view.dispatch(view.state.replaceSelection('\n'));
              return true;
            }
          }
        ]),
        // Essential editor features
        highlightSpecialChars(),
        history(),
        drawSelection(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        // Now add default keymaps AFTER our custom ones
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        placeholder('Type your message... Use [[note]] for wikilinks'),
        // GitHub theme
        githubTheme,
        // Custom styling theme
        EditorView.theme({
          '&': {
            fontSize: '0.875rem',
            fontFamily: 'inherit'
          },
          '.cm-editor': {
            borderRadius: '1rem',
            background: 'transparent'
          },
          '.cm-focused': {
            outline: 'none'
          },
          '.cm-content': {
            padding: '0.75rem 1rem',
            minHeight: '1.25rem',
            maxHeight: '120px',
            caretColor: 'var(--text-secondary)'
          },
          '.cm-line': {
            lineHeight: '1.4'
          }
        }),
        wikilinksExtension(handleWikilinkClick),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            inputText = update.state.doc.toString();
          }
        }),
        EditorView.lineWrapping
      ]
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    });

    // Focus the editor
    editorView.focus();

    return () => {
      editorView?.destroy();
    };
  });

  // Cleanup function
  onDestroy(() => {
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', handleThemeChange);
    }
  });
</script>

<div class="message-input">
  <div class="input-container">
    <div class="model-selector-wrapper">
      <ModelSelector />
    </div>
    <div bind:this={editorContainer} class="editor-field"></div>
    <button onclick={handleSubmit} disabled={!inputText.trim()} class="send-button">
      Send
    </button>
  </div>
</div>

<style>
  .message-input {
    padding: 1.5rem;
    max-width: 700px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .input-container {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 1.5rem;
    padding: 0.5rem;
    box-shadow: 0 1px 3px 0 var(--shadow-medium);
    transition: all 0.2s ease;
  }

  .model-selector-wrapper {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .input-container:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  .editor-field {
    flex: 1;
    border: none;
    border-radius: 1rem;
    background: transparent;
    color: var(--text-secondary);
    min-height: 1.25rem;
    max-height: 120px;
    overflow: hidden;
  }

  /* Wikilink styling for message input */
  .editor-field :global(.wikilink) {
    font-weight: 500;
    text-decoration: underline;
    transition: all 0.2s ease;
    border-radius: 2px;
    padding: 1px 2px;
    cursor: pointer;
  }

  .editor-field :global(.wikilink-exists) {
    color: var(--accent-primary);
    text-decoration-color: var(--accent-primary);
  }

  .editor-field :global(.wikilink-exists:hover) {
    background-color: var(--accent-light);
  }

  .editor-field :global(.wikilink-broken) {
    color: #d73a49;
    text-decoration: underline dotted;
  }

  /* CodeMirror placeholder styling */
  .editor-field :global(.cm-placeholder) {
    color: var(--text-placeholder);
    transition: color 0.2s ease;
  }

  .send-button {
    padding: 0.75rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .send-button:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  .send-button:disabled {
    background: var(--border-medium);
    cursor: not-allowed;
    transform: none;
  }

  .send-button:active:not(:disabled) {
    transform: translateY(0);
  }
</style>
