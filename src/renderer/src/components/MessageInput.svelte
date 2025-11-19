<script lang="ts">
  import ModelSelector from './ModelSelector.svelte';
  import ContextUsageWidget from './ContextUsageWidget.svelte';
  import type { ContextUsage } from '../services/types';
  import { onMount, onDestroy } from 'svelte';
  import { EditorView } from '@codemirror/view';
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
  import { searchKeymap } from '@codemirror/search';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { wikilinksExtension } from '../lib/wikilinks.svelte.js';
  import { wikilinkService } from '../services/wikilinkService.svelte.js';

  interface Props {
    onSend: (text: string) => void;
    contextUsage?: ContextUsage | null;
    onStartNewThread?: () => void;
    isLoading?: boolean;
    onCancel?: () => void;
    refreshCredits?: () => Promise<void>;
    initialText?: string;
    onDraftChange?: (text: string) => void;
  }

  let {
    onSend,
    contextUsage = null,
    onStartNewThread,
    isLoading = false,
    onCancel,
    refreshCredits = $bindable(),
    initialText = '',
    onDraftChange
  }: Props = $props();

  let inputText = $state(initialText);

  // Track last external initialText to detect external changes (thread switching)
  let lastInitialText = initialText;
  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;

  // Reactive theme state
  let isDarkMode = $state(false);
  let mediaQuery: MediaQueryList | null = null;

  // OpenRouter credits state
  let creditsInfo = $state<{
    total_credits: number;
    used_credits: number;
    remaining_credits: number;
  } | null>(null);
  let creditsLoading = $state(false);

  // Sync editor content when initialText changes externally (thread switching)
  $effect(() => {
    if (initialText !== lastInitialText) {
      lastInitialText = initialText;
      inputText = initialText;
      // Update the editor content if it exists
      if (editorView) {
        const currentContent = editorView.state.doc.toString();
        if (currentContent !== initialText) {
          editorView.dispatch({
            changes: { from: 0, to: editorView.state.doc.length, insert: initialText }
          });
        }
      }
    }
  });

  // Notify parent of draft changes (debounced to avoid excessive updates)
  let draftChangeTimeout: number | null = null;
  let lastSavedDraft = initialText;

  $effect(() => {
    // Capture inputText in effect
    const text = inputText;

    // Clear any pending timeout
    if (draftChangeTimeout !== null) {
      clearTimeout(draftChangeTimeout);
    }

    // Debounce the draft change notification
    draftChangeTimeout = window.setTimeout(() => {
      onDraftChange?.(text);
      lastSavedDraft = text;
      draftChangeTimeout = null;
    }, 300);

    // Cleanup on effect re-run
    return () => {
      if (draftChangeTimeout !== null) {
        clearTimeout(draftChangeTimeout);
      }
    };
  });

  // Save draft immediately when component unmounts (e.g., switching to shelf)
  onDestroy(() => {
    if (draftChangeTimeout !== null) {
      clearTimeout(draftChangeTimeout);
    }
    // Save current draft if it's different from last saved
    if (inputText !== lastSavedDraft) {
      onDraftChange?.(inputText);
    }
  });

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
      // Immediately clear the draft (don't wait for debounce)
      onDraftChange?.('');
    }
  }

  function handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean
  ): void {
    // For message input, use stub implementation that doesn't navigate
    wikilinkService.handleWikilinkClickStub(noteId, title, shouldCreate);
    // Keep focus on the editor
    editorView?.focus();
  }

  function handleThemeChange(e: MediaQueryListEvent): void {
    isDarkMode = e.matches;
    updateEditorTheme();
  }

  async function fetchCredits(): Promise<void> {
    try {
      creditsLoading = true;
      const credits = await window.api?.getOpenRouterCredits();
      creditsInfo = credits;
    } catch (error) {
      console.error('Failed to fetch OpenRouter credits:', error);
      creditsInfo = null;
    } finally {
      creditsLoading = false;
    }
  }

  // Expose fetchCredits through bindable prop
  refreshCredits = fetchCredits;

  // Determine credit status color based on remaining balance
  const creditsStatusClass = $derived.by(() => {
    if (!creditsInfo) return '';
    const remaining = creditsInfo.remaining_credits;
    if (remaining < 2) return 'credits-critical';
    if (remaining < 5) return 'credits-warning';
    return 'credits-ok';
  });

  function createExtensions(): Extension {
    const githubTheme = isDarkMode ? githubDark : githubLight;

    return [
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
          padding: '6px 0',
          minHeight: '1.25rem',
          maxHeight: '400px',
          caretColor: 'var(--text-secondary)',
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
          lineHeight: '1.4'
        }
      }),
      wikilinksExtension(handleWikilinkClick),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          const newText = update.state.doc.toString();
          inputText = newText;
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
      doc: inputText,
      extensions: createExtensions()
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    });

    // Focus the editor
    editorView.focus();

    // Fetch OpenRouter credits
    fetchCredits();

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
    <div bind:this={editorContainer} class="editor-field editor-font"></div>
  </div>
  <div class="controls-row">
    <div class="model-selector-wrapper">
      <ModelSelector />
    </div>
    {#if creditsInfo && creditsInfo.remaining_credits !== undefined}
      <div class="credits-display {creditsStatusClass}" title="Credits info">
        ${Math.round(creditsInfo.remaining_credits)} left
        <div class="credits-tooltip">
          <div class="credits-tooltip-row">
            <span class="credits-label">Total:</span>
            <span class="credits-value">${creditsInfo.total_credits.toFixed(2)}</span>
          </div>
          <div class="credits-tooltip-row">
            <span class="credits-label">Used:</span>
            <span class="credits-value">${creditsInfo.used_credits.toFixed(2)}</span>
          </div>
          <div class="credits-tooltip-row">
            <span class="credits-label">Remaining:</span>
            <span class="credits-value">${creditsInfo.remaining_credits.toFixed(2)}</span>
          </div>
        </div>
      </div>
    {:else if creditsLoading}
      <div class="credits-display loading">loading...</div>
    {/if}
    <div class="spacer"></div>
    <ContextUsageWidget {contextUsage} onWarningClick={onStartNewThread} />
    {#if isLoading}
      <button onclick={onCancel} class="send-button cancel-button"> cancel </button>
    {:else}
      <button
        onclick={handleSubmit}
        disabled={!inputText.trim()}
        class="send-button"
        aria-label="Send message"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="12" y1="19" x2="12" y2="5"></line>
          <polyline points="5 12 12 5 19 12"></polyline>
        </svg>
      </button>
    {/if}
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
    align-items: center;
    gap: 0.75rem;
  }

  .model-selector-wrapper {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow: visible;
  }

  .spacer {
    flex: 1;
  }

  .credits-display {
    position: relative;
    font-size: 0.75rem;
    color: var(--text-tertiary);
    padding: 0.25rem 0.5rem;
    background: var(--bg-tertiary);
    border-radius: 0.375rem;
    white-space: nowrap;
    font-weight: 500;
    cursor: help;
    transition: all 0.2s ease;
  }

  .credits-display:hover {
    background: var(--bg-secondary);
    color: var(--text-secondary);
  }

  .credits-display.loading {
    opacity: 0.6;
  }

  .credits-display.credits-critical {
    background: #fee;
    color: #c00;
    border: 1px solid #fcc;
  }

  .credits-display.credits-warning {
    background: #ffc;
    color: #960;
    border: 1px solid #fed;
  }

  .credits-display.credits-ok {
    color: #060;
  }

  .credits-tooltip {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    padding: 0.75rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    opacity: 0;
    visibility: hidden;
    transition: all 0.2s ease;
    pointer-events: none;
    z-index: 1000;
    min-width: 180px;
  }

  .credits-display:hover .credits-tooltip {
    opacity: 1;
    visibility: visible;
  }

  .credits-tooltip-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.25rem 0;
  }

  .credits-tooltip-row:not(:last-child) {
    border-bottom: 1px solid var(--border-light);
  }

  .credits-label {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-weight: 500;
  }

  .credits-value {
    font-size: 0.75rem;
    color: var(--text-primary);
    font-weight: 600;
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
  }

  .editor-field {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    min-height: 1.25rem;
    max-height: 400px;
    overflow: hidden;
  }

  /* CodeMirror placeholder styling */
  .editor-field :global(.cm-placeholder) {
    color: var(--text-placeholder);
    transition: color 0.2s ease;
  }

  .send-button {
    padding: 0.5rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
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

  .cancel-button {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-medium);
  }

  .cancel-button:hover {
    background: var(--bg-secondary);
    border-color: var(--border-dark);
    color: var(--text-primary);
    transform: translateY(-1px);
  }

  .cancel-button:active {
    transform: translateY(0);
  }
</style>
