<script lang="ts">
  import type { FieldType } from '../lib/automerge/deck';
  import {
    NumberInput,
    BooleanInput,
    DateInput,
    SelectInput,
    NoteLinkInput,
    NoteLinksInput
  } from './inputs';

  interface Props {
    value: unknown;
    fieldType: FieldType;
    field: string;
    onChange: (value: unknown) => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    autoFocus?: boolean;
    /** Options for select fields */
    options?: string[];
    /** Suggestions for text fields (shown as dropdown) */
    suggestions?: string[];
    /** Called when a linked note is clicked for navigation */
    onNoteClick?: (noteId: string) => void;
    /** Current note ID to exclude from picker */
    excludeNoteId?: string;
  }

  let {
    value,
    fieldType,
    field,
    onChange,
    onKeyDown,
    autoFocus = false,
    options = [],
    suggestions = [],
    onNoteClick,
    excludeNoteId
  }: Props = $props();

  let inputRef = $state<HTMLInputElement | HTMLSelectElement | null>(null);
  let showSuggestions = $state(false);
  let highlightedIndex = $state(0);
  let textValue = $state(''); // Local text input state for filtering

  // Sync local text input with parent value
  $effect(() => {
    if (
      fieldType !== 'select' &&
      fieldType !== 'boolean' &&
      fieldType !== 'notelink' &&
      fieldType !== 'notelinks'
    ) {
      textValue = value === null || value === undefined ? '' : String(value);
    }
  });

  // Filter suggestions based on input
  const filteredSuggestions = $derived.by(() => {
    if (!textValue.trim()) return suggestions.slice(0, 10);
    const query = textValue.toLowerCase();
    return suggestions.filter((s) => s.toLowerCase().includes(query)).slice(0, 10);
  });

  // Focus input when autoFocus is true
  $effect(() => {
    if (autoFocus && inputRef) {
      inputRef.focus();
      if (inputRef instanceof HTMLInputElement && inputRef.type !== 'checkbox') {
        inputRef.select();
      }
    }
  });

  function handleTextInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    textValue = input.value;
    showSuggestions = suggestions.length > 0;
  }

  function handleTextCommit(): void {
    let newValue: unknown = textValue;
    if (fieldType === 'number') {
      newValue = textValue === '' ? null : Number(textValue);
    }
    onChange(newValue);
  }

  function handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let newValue: unknown = input.value;

    // Convert value based on field type
    if (fieldType === 'number') {
      newValue = input.value === '' ? null : Number(input.value);
    } else if (fieldType === 'boolean') {
      newValue = input.checked;
    }

    onChange(newValue);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    // Handle suggestion navigation
    if (showSuggestions && filteredSuggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        highlightedIndex = (highlightedIndex + 1) % filteredSuggestions.length;
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        highlightedIndex =
          (highlightedIndex - 1 + filteredSuggestions.length) %
          filteredSuggestions.length;
        return;
      }
      if (event.key === 'Enter' && highlightedIndex >= 0) {
        event.preventDefault();
        selectSuggestion(filteredSuggestions[highlightedIndex]);
        onKeyDown?.(event); // Still notify parent for save
        return;
      }
    }

    if (event.key === 'Escape' && showSuggestions) {
      showSuggestions = false;
      event.stopPropagation();
      return;
    }

    // Commit text value on Enter (for non-suggestion cases)
    if (event.key === 'Enter' && !showSuggestions) {
      handleTextCommit();
    }

    onKeyDown?.(event);
  }

  function selectSuggestion(suggestion: string): void {
    textValue = suggestion;
    onChange(suggestion);
    showSuggestions = false;
    highlightedIndex = 0;
  }

  function handleBlur(): void {
    // Delay hiding to allow click on suggestion
    setTimeout(() => {
      showSuggestions = false;
    }, 150);
    // Commit text value on blur
    if (
      fieldType !== 'select' &&
      fieldType !== 'boolean' &&
      fieldType !== 'notelink' &&
      fieldType !== 'notelinks'
    ) {
      handleTextCommit();
    }
  }

  function handleFocus(): void {
    if (suggestions.length > 0 && fieldType !== 'select' && fieldType !== 'boolean') {
      showSuggestions = true;
    }
  }

  // Reset highlighted index when suggestions change
  $effect(() => {
    void filteredSuggestions;
    highlightedIndex = 0;
  });

  // Get input type based on field type
  function getInputType(): string {
    switch (fieldType) {
      case 'number':
        return 'number';
      case 'date':
        return 'date';
      case 'boolean':
        return 'checkbox';
      default:
        return 'text';
    }
  }

  // Format value for input
  function getInputValue(): string {
    if (value === null || value === undefined) return '';
    if (fieldType === 'date' && typeof value === 'string') {
      // Convert ISO date to input format (YYYY-MM-DD)
      try {
        const date = new Date(value);
        return date.toISOString().split('T')[0];
      } catch {
        return '';
      }
    }
    return String(value);
  }
</script>

<span
  class="editable-cell"
  role="presentation"
  onmousedown={(e) => e.stopPropagation()}
  onclick={(e) => e.stopPropagation()}
>
  {#if fieldType === 'notelink'}
    <div class="cell-notelink">
      <NoteLinkInput
        value={value as string | null}
        onChange={(v) => onChange(v)}
        {onNoteClick}
        {excludeNoteId}
        class="cell-notelink-input"
      />
    </div>
  {:else if fieldType === 'notelinks'}
    <div class="cell-notelinks">
      <NoteLinksInput
        value={Array.isArray(value) ? (value as string[]) : []}
        onChange={(v) => onChange(v)}
        {onNoteClick}
        {excludeNoteId}
        class="cell-notelinks-input"
      />
    </div>
  {:else if fieldType === 'boolean'}
    <BooleanInput
      value={Boolean(value)}
      onChange={(v) => onChange(v)}
      class="cell-checkbox"
    />
  {:else if fieldType === 'select' && options.length > 0}
    <SelectInput
      value={value as string | null}
      {options}
      onChange={(v) => onChange(v)}
      placeholder="Select..."
      class="cell-select"
    />
  {:else if fieldType === 'number'}
    <NumberInput
      value={value as number | null}
      onChange={(v) => onChange(v)}
      class="cell-input"
    />
  {:else if fieldType === 'date'}
    <DateInput
      value={value as string | null}
      onChange={(v) => onChange(v)}
      class="cell-input"
    />
  {:else if suggestions.length > 0}
    <!-- Text input with suggestions dropdown -->
    <div class="cell-input-container">
      <input
        bind:this={inputRef}
        type={getInputType()}
        value={textValue}
        oninput={handleTextInput}
        onkeydown={handleKeyDown}
        onblur={handleBlur}
        onfocus={handleFocus}
        class="cell-input"
        class:title-input={field === 'title'}
        placeholder={field === 'title' ? 'Note title...' : ''}
      />
      {#if showSuggestions && filteredSuggestions.length > 0}
        <div class="suggestions-dropdown">
          {#each filteredSuggestions as suggestion, index (suggestion)}
            <button
              class="suggestion-item"
              class:highlighted={index === highlightedIndex}
              onmousedown={() => selectSuggestion(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <input
      bind:this={inputRef}
      type={getInputType()}
      value={getInputValue()}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      class="cell-input"
      class:title-input={field === 'title'}
      placeholder={field === 'title' ? 'Note title...' : ''}
    />
  {/if}
</span>

<style>
  .editable-cell {
    display: flex;
    align-items: center;
    width: 100%;
  }

  .cell-input-container {
    position: relative;
    width: 100%;
  }

  .cell-input {
    width: 100%;
    padding: 0.25rem 0.375rem;
    border: 1px solid var(--accent-primary, #2196f3);
    border-radius: 0.25rem;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #333);
    font-size: inherit;
    font-family: inherit;
    outline: none;
  }

  .cell-input:focus {
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
  }

  .cell-input.title-input {
    padding: 0.125rem 0.25rem;
    border: none;
    background: transparent;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .cell-input.title-input:focus {
    box-shadow: none;
  }

  .cell-input::placeholder {
    color: var(--text-muted, #999);
  }

  /* Wrappers for shared input components */
  .cell-notelink,
  .cell-notelinks {
    width: 100%;
  }

  /* Global styles for shared inputs in cell context */
  :global(.cell-notelink .notelink-input-container) {
    width: 100%;
  }

  :global(.cell-notelinks .notelinks-trigger) {
    width: 100%;
    padding: 0.25rem 0.375rem;
  }

  :global(.editable-cell .cell-select) {
    width: 100%;
    padding: 0.25rem 0.375rem;
    border: 1px solid var(--accent-primary, #2196f3);
    border-radius: 0.25rem;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #333);
    font-size: inherit;
    font-family: inherit;
    outline: none;
    cursor: pointer;
  }

  :global(.editable-cell .cell-select:focus) {
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
  }

  :global(.editable-cell .cell-checkbox) {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }

  /* Suggestions dropdown */
  .suggestions-dropdown {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    right: 0;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-medium, #ddd);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    max-height: 10rem;
    overflow-y: auto;
    animation: slideDown 0.15s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .suggestion-item {
    display: block;
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--text-primary, #333);
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .suggestion-item:hover,
  .suggestion-item.highlighted {
    background: var(--bg-secondary, #f5f5f5);
  }
</style>
