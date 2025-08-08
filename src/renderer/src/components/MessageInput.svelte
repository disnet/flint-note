<script lang="ts">
  import ModelSelector from './ModelSelector.svelte';
  import SlashCommandAutocomplete from './SlashCommandAutocomplete.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState, StateEffect, type Extension } from '@codemirror/state';
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
  import {
    slashCommandsStore,
    type SlashCommand
  } from '../stores/slashCommandsStore.svelte.ts';

  let { onSend }: { onSend: (text: string) => void } = $props();

  let inputText = $state('');
  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;

  // Reactive theme state
  let isDarkMode = $state(false);
  let mediaQuery: MediaQueryList | null = null;

  // Slash command autocomplete state
  let showAutocomplete = $state(false);
  let autocompleteQuery = $state('');
  let selectedCommandIndex = $state(0);
  let slashCommandStart = $state(0);

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

  function detectSlashCommand(text: string, cursorPos: number): void {
    // Find the last slash before the cursor
    const beforeCursor = text.substring(0, cursorPos);
    const lastSlashIndex = beforeCursor.lastIndexOf('/');

    if (lastSlashIndex === -1) {
      hideAutocomplete();
      return;
    }

    // Check if there's a word boundary before the slash (start of line or whitespace)
    const charBeforeSlash = lastSlashIndex > 0 ? beforeCursor[lastSlashIndex - 1] : null;
    if (charBeforeSlash !== null && charBeforeSlash !== ' ' && charBeforeSlash !== '\n') {
      hideAutocomplete();
      return;
    }

    // Get text after slash up to cursor
    const afterSlash = beforeCursor.substring(lastSlashIndex + 1);

    // Check if there are any spaces after the slash (which would end the command)
    if (afterSlash.includes(' ') || afterSlash.includes('\n')) {
      hideAutocomplete();
      return;
    }

    // Show autocomplete with the query
    slashCommandStart = lastSlashIndex;
    autocompleteQuery = afterSlash;
    showAutocomplete = true;
    selectedCommandIndex = 0;
  }

  function hideAutocomplete(): void {
    showAutocomplete = false;
    autocompleteQuery = '';
    selectedCommandIndex = 0;
    slashCommandStart = 0;
  }

  function handleCommandSelect(command: SlashCommand): void {
    if (!editorView) return;

    const cursorPos = editorView.state.selection.main.head;
    const text = editorView.state.doc.toString();

    // Replace from slash to cursor with the command instruction
    const beforeSlash = text.substring(0, slashCommandStart);
    const afterCursor = text.substring(cursorPos);
    const newText = beforeSlash + command.instruction + afterCursor;

    editorView.dispatch({
      changes: { from: 0, to: text.length, insert: newText },
      selection: { anchor: beforeSlash.length + command.instruction.length }
    });

    hideAutocomplete();
    editorView.focus();
  }

  function handleAutocompleteCancel(): void {
    hideAutocomplete();
    editorView?.focus();
  }

  function handleAutocompleteKeyDown(event: KeyboardEvent): boolean {
    if (!showAutocomplete) return false;

    const filteredCommands = autocompleteQuery
      ? slashCommandsStore.searchCommands(autocompleteQuery)
      : slashCommandsStore.allCommands.slice(0, 5);

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        selectedCommandIndex =
          selectedCommandIndex > 0
            ? selectedCommandIndex - 1
            : filteredCommands.length - 1;
        return true;

      case 'ArrowDown':
        event.preventDefault();
        selectedCommandIndex =
          selectedCommandIndex < filteredCommands.length - 1
            ? selectedCommandIndex + 1
            : 0;
        return true;

      case 'Enter':
      case 'Tab':
        event.preventDefault();
        if (filteredCommands[selectedCommandIndex]) {
          handleCommandSelect(filteredCommands[selectedCommandIndex]);
        }
        return true;

      case 'Escape':
        event.preventDefault();
        hideAutocomplete();
        return true;

      default:
        return false;
    }
  }

  function handleThemeChange(e: MediaQueryListEvent): void {
    isDarkMode = e.matches;
    updateEditorTheme();
  }

  function createExtensions(): Extension {
    const githubTheme = isDarkMode ? githubDark : githubLight;

    return [
      // Put the custom keymap FIRST to ensure it takes precedence over default keymaps
      keymap.of([
        {
          key: 'Enter',
          run: (view) => {
            // Check if autocomplete is showing and should handle this
            if (showAutocomplete) {
              const filteredCommands = autocompleteQuery
                ? slashCommandsStore.searchCommands(autocompleteQuery)
                : slashCommandsStore.allCommands.slice(0, 5);
              if (filteredCommands[selectedCommandIndex]) {
                handleCommandSelect(filteredCommands[selectedCommandIndex]);
                return true;
              }
            }

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
        },
        {
          key: 'Escape',
          run: (_view) => {
            if (showAutocomplete) {
              hideAutocomplete();
              return true;
            }
            return false;
          }
        },
        {
          key: 'ArrowUp',
          run: (_view) => {
            return handleAutocompleteKeyDown(
              new KeyboardEvent('keydown', { key: 'ArrowUp' })
            );
          }
        },
        {
          key: 'ArrowDown',
          run: (_view) => {
            return handleAutocompleteKeyDown(
              new KeyboardEvent('keydown', { key: 'ArrowDown' })
            );
          }
        },
        {
          key: 'Tab',
          run: (_view) => {
            return handleAutocompleteKeyDown(
              new KeyboardEvent('keydown', { key: 'Tab' })
            );
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
      placeholder('Ask Flint anything...use [[ to link notes'),
      // GitHub theme
      githubTheme,
      // Custom styling theme
      EditorView.theme({
        '&': {
          fontSize: '0.875rem',
          fontFamily: 'inherit'
        },
        '&.cm-editor': {
          backgroundColor: 'var(--bg-primary)'
        },
        '.cm-editor': {
          borderRadius: '1rem',
          background: 'transparent'
        },
        '.cm-focused': {
          outline: 'none'
        },
        '.cm-content': {
          padding: '0',
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
        if (update.docChanged || update.selectionSet) {
          const newText = update.state.doc.toString();
          inputText = newText;

          // Detect slash commands on text change or cursor movement
          const cursorPos = update.state.selection.main.head;
          detectSlashCommand(newText, cursorPos);
        }
      }),
      EditorView.lineWrapping
    ];
  }

  function updateEditorTheme(): void {
    if (!editorView) return;

    editorView.dispatch({
      effects: StateEffect.reconfigure.of(createExtensions())
    });
  }

  onMount(() => {
    if (!editorContainer) return;

    // Initialize dark mode state
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    isDarkMode = mediaQuery.matches;

    // Listen for theme changes
    mediaQuery.addEventListener('change', handleThemeChange);

    const startState = EditorState.create({
      doc: '',
      extensions: createExtensions()
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
    <div bind:this={editorContainer} class="editor-field"></div>
    {#if showAutocomplete}
      <SlashCommandAutocomplete
        query={autocompleteQuery}
        onSelect={handleCommandSelect}
        onCancel={handleAutocompleteCancel}
        selectedIndex={selectedCommandIndex}
      />
    {/if}
  </div>
  <div class="controls-row">
    <div class="model-selector-wrapper">
      <ModelSelector />
    </div>
    <button onclick={handleSubmit} disabled={!inputText.trim()} class="send-button">
      submit ↵
    </button>
  </div>
</div>

<style>
  .message-input {
    padding: 0.25rem;
    padding-bottom: 0.5rem;
    max-width: 700px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .input-container {
    position: relative;
    background: var(--bg-primary);
    /*border: 1px solid var(--border-light);*/
    /*border-radius: 1.5rem;*/
    padding: 0.5rem 0;
    transition: all 0.2s ease;
  }

  .controls-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .model-selector-wrapper {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .editor-field {
    width: 100%;
    border: none;
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
    padding: 0.375rem 0.75rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 50px;
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
