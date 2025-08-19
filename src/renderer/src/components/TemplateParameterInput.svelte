<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, minimalSetup } from 'codemirror';
  import { placeholder } from '@codemirror/view';
  import { EditorState, StateEffect, type Extension } from '@codemirror/state';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import {
    createParameterCompletions,
    validateTemplate
  } from '../lib/templateParameters.svelte';
  import type { SlashCommandParameter } from '../stores/slashCommandsStore.svelte';
  import {
    wikilinksWithoutAutocomplete,
    wikilinkCompletion,
    type WikilinkClickHandler
  } from '../lib/wikilinks.svelte';
  import { autocompletion } from '@codemirror/autocomplete';

  interface Props {
    value: string;
    parameters: SlashCommandParameter[];
    placeholder?: string;
    disabled?: boolean;
    rows?: number;
    onValueChange?: (value: string) => void;
    onParameterSuggestion?: (parameterName: string, suggestedType: string) => void;
    onWikilinkClick?: WikilinkClickHandler;
    class?: string;
  }

  let {
    value = $bindable(''),
    parameters = [],
    placeholder: placeholderText,
    disabled = false,
    rows = 3,
    onValueChange,
    onParameterSuggestion,
    onWikilinkClick,
    class: className
  }: Props = $props();

  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;
  let validation = $derived(validateTemplate(value, parameters));

  // Create combined autocomplete extension
  function createCombinedAutocomplete(): Extension {
    const completionSources = [createParameterCompletions(parameters)];

    // Add wikilink completion if click handler is provided
    if (onWikilinkClick) {
      completionSources.push(wikilinkCompletion);
    }

    return autocompletion({
      override: completionSources,
      activateOnTyping: true,
      maxRenderedOptions: 10
    });
  }

  // Create extensions for the editor
  function createExtensions(): Extension[] {
    const theme = document.documentElement.classList.contains('dark')
      ? githubDark
      : githubLight;

    const extensions = [
      minimalSetup,
      theme,
      createCombinedAutocomplete(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          value = newValue;
          if (onValueChange) {
            onValueChange(newValue);
          }
        }
      })
    ];

    // Add wikilinks extension (for decorations and click handling) if click handler is provided
    if (onWikilinkClick) {
      extensions.push(wikilinksWithoutAutocomplete(onWikilinkClick));
    }

    if (placeholderText) {
      extensions.push(placeholder(placeholderText));
    }

    if (disabled) {
      extensions.push(EditorState.readOnly.of(true));
    }

    return extensions;
  }

  // Initialize editor on mount
  onMount(() => {
    if (!editorContainer) return;

    const state = EditorState.create({
      doc: value,
      extensions: createExtensions()
    });

    editorView = new EditorView({
      state,
      parent: editorContainer
    });

    // Set initial height based on rows
    editorView.dom.style.minHeight = `${rows * 1.2}em`;
  });

  // Update editor when value changes externally
  $effect(() => {
    if (editorView && value !== editorView.state.doc.toString()) {
      const transaction = editorView.state.update({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: value
        }
      });
      editorView.dispatch(transaction);
    }
  });

  // Update extensions when parameters change
  $effect(() => {
    if (editorView) {
      const newExtensions = createExtensions();
      editorView.dispatch({
        effects: StateEffect.reconfigure.of(newExtensions)
      });
    }
  });

  // Cleanup on destroy
  onDestroy(() => {
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
  });

  function handleCreateParameter(parameterName: string): void {
    if (onParameterSuggestion) {
      const suggestedType = inferParameterType(parameterName);
      onParameterSuggestion(parameterName, suggestedType);
    }
  }

  function inferParameterType(parameterName: string): string {
    const name = parameterName.toLowerCase();

    if (
      name.includes('count') ||
      name.includes('number') ||
      name.includes('limit') ||
      name.includes('max') ||
      name.includes('min')
    ) {
      return 'number';
    }

    if (
      name.includes('content') ||
      name.includes('description') ||
      name.includes('text') ||
      name.includes('body') ||
      name.includes('notes')
    ) {
      return 'textblock';
    }

    if (
      name.includes('type') ||
      name.includes('category') ||
      name.includes('status') ||
      name.includes('priority')
    ) {
      return 'selection';
    }

    return 'text';
  }
</script>

<div class="template-parameter-input {className || ''}">
  <div bind:this={editorContainer} class="editor-container"></div>

  {#if validation.errors.length > 0}
    <div class="validation-errors">
      {#each validation.errors as error (error)}
        <div class="validation-error">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          {error}
        </div>
      {/each}
    </div>
  {/if}

  {#if validation.undefinedPlaceholders.length > 0}
    <div class="parameter-suggestions">
      <div class="suggestions-header">Create missing parameters:</div>
      {#each validation.undefinedPlaceholders as paramName (paramName)}
        <button
          type="button"
          class="create-parameter-button"
          onclick={() => handleCreateParameter(paramName)}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create "{paramName}" parameter
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .template-parameter-input {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .editor-container {
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    transition: border-color 0.2s ease;
  }

  .editor-container:focus-within {
    border-color: var(--accent);
  }

  .editor-container :global(.cm-editor) {
    font-size: 0.875rem;
    font-family: inherit;
  }

  .editor-container :global(.cm-focused) {
    outline: none;
  }

  .editor-container :global(.cm-content) {
    padding: 0.5rem 0.75rem;
    min-height: inherit;
  }

  .editor-container :global(.cm-placeholder) {
    color: var(--text-tertiary);
  }

  .validation-errors {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .validation-error {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    background: var(--error-light);
    color: var(--error);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .validation-error svg {
    flex-shrink: 0;
  }

  .parameter-suggestions {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .suggestions-header {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .create-parameter-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .create-parameter-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--accent);
  }

  .create-parameter-button svg {
    flex-shrink: 0;
  }
</style>
