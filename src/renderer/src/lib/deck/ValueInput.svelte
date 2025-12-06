<script lang="ts">
  import type { FilterOperator } from './types';
  import { EMPTY_FILTER_VALUE } from './types';
  import type { MetadataFieldType } from '../../../../server/core/metadata-schema';

  interface Props {
    fieldType: MetadataFieldType | 'system';
    operator: FilterOperator;
    value: string | string[];
    options?: string[];
    suggestions?: string[];
    onChange: (value: string | string[]) => void;
    placeholder?: string;
  }

  let {
    fieldType,
    operator,
    value,
    options = [],
    suggestions = [],
    onChange,
    placeholder = 'Value...'
  }: Props = $props();

  // Alias for empty filter value marker
  const EMPTY_MARKER = EMPTY_FILTER_VALUE;

  let showSuggestions = $state(false);
  let highlightedIndex = $state(0);
  let tagInput = $state('');
  let textInput = $state(''); // Local state for text input to enable filtering while typing

  // Determine if we need multi-value input (for IN/NOT IN operators)
  const isMultiValue = $derived(operator === 'IN' || operator === 'NOT IN');

  // Determine if we need BETWEEN input (two values)
  const isBetween = $derived(operator === 'BETWEEN');

  // Ensure value is always correct type
  const normalizedValue = $derived.by(() => {
    if (isBetween) {
      // BETWEEN expects [min, max] tuple
      if (Array.isArray(value) && value.length >= 2) {
        return value.slice(0, 2);
      }
      return ['', ''];
    }
    if (isMultiValue) {
      return Array.isArray(value) ? value : value ? [value] : [];
    }
    return Array.isArray(value) ? value[0] || '' : value;
  });

  // Handle BETWEEN value changes
  function handleBetweenChange(index: 0 | 1, newValue: string): void {
    const current = Array.isArray(value) ? [...value] : ['', ''];
    current[index] = newValue;
    onChange(current);
  }

  // Sync local text input with parent value when it changes externally
  $effect(() => {
    if (!isMultiValue && !isBetween) {
      textInput = normalizedValue as string;
    }
  });

  // Filter suggestions based on input (use local textInput for real-time filtering)
  const filteredSuggestions = $derived.by(() => {
    const currentInput = isMultiValue ? tagInput : textInput;
    const source = effectiveSuggestions;
    if (!currentInput.trim()) return source.slice(0, 10);
    const query = currentInput.toLowerCase();
    return source
      .filter((s) => {
        // For the empty marker, also match on "empty" text
        if (s === EMPTY_MARKER) {
          return 'empty'.includes(query) || '<empty>'.includes(query);
        }
        return s.toLowerCase().includes(query);
      })
      .slice(0, 10);
  });

  // Get display text for a value (handles the empty marker)
  function getDisplayText(val: string): string {
    return val === EMPTY_MARKER ? '<empty>' : val;
  }

  // Check if we have options available (for select fields or fields with suggestions)
  const hasOptions = $derived(options && options.length > 0);

  // For multi-value operators with available options, show checkboxes
  const isMultiSelectCheckbox = $derived(isMultiValue && hasOptions);

  // For single-value select dropdown (only when fieldType is 'select' and has options)
  const selectOptions = $derived(
    fieldType === 'select' && options && options.length > 0 ? options : null
  );

  // Handle checkbox toggle for multi-select
  function handleCheckboxToggle(optionValue: string, checked: boolean): void {
    const vals = normalizedValue as string[];
    if (checked) {
      if (!vals.includes(optionValue)) {
        onChange([...vals, optionValue]);
      }
    } else {
      onChange(vals.filter((v) => v !== optionValue));
    }
  }

  // For select fields, add <empty> option to suggestions
  const effectiveSuggestions = $derived.by(() => {
    if (fieldType === 'select' && options && options.length > 0) {
      // Add <empty> at the start, then the select options
      return [EMPTY_MARKER, ...options];
    }
    return suggestions;
  });

  // Handle text input as user types (updates local state for filtering)
  function handleTextInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    textInput = target.value;
    showSuggestions = true;
  }

  // Handle committing the value (on blur or change)
  function handleTextCommit(): void {
    onChange(textInput);
  }

  function handleInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const newValue = target.value;

    if (isMultiValue) {
      tagInput = newValue;
    } else {
      onChange(newValue);
    }
    showSuggestions = true;
  }

  function handleSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    onChange(target.value);
  }

  function handleBooleanChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    onChange(target.checked ? 'true' : 'false');
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      showSuggestions = false;
      event.stopPropagation();
      return;
    }

    if (isMultiValue && event.key === 'Enter' && tagInput.trim()) {
      event.preventDefault();
      addTag(tagInput.trim());
      return;
    }

    if (isMultiValue && event.key === 'Backspace' && !tagInput) {
      const vals = normalizedValue as string[];
      if (vals.length > 0) {
        event.preventDefault();
        removeTag(vals.length - 1);
      }
      return;
    }

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
        return;
      }
    }

    // Enter always commits the current value (even if no suggestions)
    if (!isMultiValue && event.key === 'Enter') {
      event.preventDefault();
      onChange(textInput);
      showSuggestions = false;
    }
  }

  function selectSuggestion(suggestion: string): void {
    if (isMultiValue) {
      addTag(suggestion);
    } else {
      textInput = suggestion;
      onChange(suggestion);
    }
    showSuggestions = false;
    highlightedIndex = 0;
  }

  function addTag(tag: string): void {
    const vals = normalizedValue as string[];
    if (!vals.includes(tag)) {
      onChange([...vals, tag]);
    }
    tagInput = '';
    showSuggestions = false;
  }

  function removeTag(index: number): void {
    const vals = normalizedValue as string[];
    onChange(vals.filter((_, i) => i !== index));
  }

  function handleBlur(): void {
    // Delay hiding to allow click on suggestion
    setTimeout(() => {
      showSuggestions = false;
    }, 200);
    // Commit the text input value on blur (if not multi-value)
    if (!isMultiValue) {
      handleTextCommit();
    }
  }

  function handleFocus(): void {
    if ((suggestions.length > 0 || selectOptions) && !isMultiValue) {
      showSuggestions = true;
    }
  }

  // Reset highlighted index when suggestions change
  $effect(() => {
    void filteredSuggestions;
    highlightedIndex = 0;
  });
</script>

<div class="value-input">
  {#if fieldType === 'boolean'}
    <!-- Boolean toggle -->
    <label class="boolean-toggle">
      <input
        type="checkbox"
        checked={normalizedValue === 'true'}
        onchange={handleBooleanChange}
      />
      <span class="toggle-label">{normalizedValue === 'true' ? 'Yes' : 'No'}</span>
    </label>
  {:else if isBetween}
    <!-- BETWEEN two-value input -->
    <div class="between-inputs">
      {#if fieldType === 'date'}
        <input
          type="date"
          class="text-input between-input"
          value={(normalizedValue as string[])[0] || ''}
          onchange={(e) => handleBetweenChange(0, (e.target as HTMLInputElement).value)}
        />
        <span class="between-separator">to</span>
        <input
          type="date"
          class="text-input between-input"
          value={(normalizedValue as string[])[1] || ''}
          onchange={(e) => handleBetweenChange(1, (e.target as HTMLInputElement).value)}
        />
      {:else}
        <input
          type="number"
          class="text-input between-input"
          value={(normalizedValue as string[])[0] || ''}
          onchange={(e) => handleBetweenChange(0, (e.target as HTMLInputElement).value)}
          placeholder="Min"
        />
        <span class="between-separator">to</span>
        <input
          type="number"
          class="text-input between-input"
          value={(normalizedValue as string[])[1] || ''}
          onchange={(e) => handleBetweenChange(1, (e.target as HTMLInputElement).value)}
          placeholder="Max"
        />
      {/if}
    </div>
  {:else if isMultiSelectCheckbox}
    <!-- Checkbox list for IN/NOT IN with available options -->
    <div class="checkbox-list">
      <label class="checkbox-item">
        <input
          type="checkbox"
          checked={(normalizedValue as string[]).includes(EMPTY_MARKER)}
          onchange={(e) =>
            handleCheckboxToggle(EMPTY_MARKER, (e.target as HTMLInputElement).checked)}
        />
        <span class="checkbox-label">&lt;empty&gt;</span>
      </label>
      {#each options as opt (opt)}
        <label class="checkbox-item">
          <input
            type="checkbox"
            checked={(normalizedValue as string[]).includes(opt)}
            onchange={(e) =>
              handleCheckboxToggle(opt, (e.target as HTMLInputElement).checked)}
          />
          <span class="checkbox-label">{opt}</span>
        </label>
      {/each}
    </div>
  {:else if selectOptions && !isMultiValue}
    <!-- Select dropdown -->
    <select class="select-input" value={normalizedValue} onchange={handleSelectChange}>
      <option value="">Select...</option>
      <option value={EMPTY_MARKER}>&lt;empty&gt;</option>
      {#each selectOptions as opt (opt)}
        <option value={opt}>{opt}</option>
      {/each}
    </select>
  {:else if isMultiValue}
    <!-- Multi-value tag input -->
    <div class="tag-input-container">
      <div class="tags">
        {#each normalizedValue as tag, i (i)}
          <span class="tag">
            {getDisplayText(tag)}
            <button
              class="tag-remove"
              onclick={() => removeTag(i)}
              type="button"
              aria-label="Remove {getDisplayText(tag)}"
            >
              &times;
            </button>
          </span>
        {/each}
        <input
          type="text"
          class="tag-text-input"
          value={tagInput}
          oninput={handleInputChange}
          onkeydown={handleKeyDown}
          onblur={handleBlur}
          onfocus={() => (showSuggestions = true)}
          placeholder={(normalizedValue as string[]).length === 0
            ? placeholder
            : 'Add value...'}
        />
      </div>

      {#if showSuggestions && filteredSuggestions.length > 0}
        <div class="suggestions-dropdown">
          {#each filteredSuggestions as suggestion, index (suggestion)}
            <button
              class="suggestion-item"
              class:highlighted={index === highlightedIndex}
              onclick={() => selectSuggestion(suggestion)}
              type="button"
            >
              {getDisplayText(suggestion)}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else if fieldType === 'number'}
    <!-- Number input -->
    <input
      type="number"
      class="text-input"
      value={normalizedValue}
      onchange={handleInputChange}
      {placeholder}
    />
  {:else if fieldType === 'date'}
    <!-- Date input -->
    <input
      type="date"
      class="text-input date-input"
      value={normalizedValue}
      onchange={handleInputChange}
    />
  {:else}
    <!-- Text input with suggestions -->
    <div class="text-input-container">
      <input
        type="text"
        class="text-input"
        value={textInput}
        oninput={handleTextInput}
        onkeydown={handleKeyDown}
        onblur={handleBlur}
        onfocus={handleFocus}
        {placeholder}
      />

      {#if showSuggestions && filteredSuggestions.length > 0}
        <div class="suggestions-dropdown">
          {#each filteredSuggestions as suggestion, index (suggestion)}
            <button
              class="suggestion-item"
              class:highlighted={index === highlightedIndex}
              onclick={() => selectSuggestion(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .value-input {
    flex: 1;
    min-width: 100px;
  }

  .text-input-container,
  .tag-input-container {
    position: relative;
  }

  .text-input,
  .select-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.2s ease;
  }

  .text-input::placeholder {
    color: var(--text-muted);
  }

  .text-input:focus,
  .select-input:focus {
    border-color: var(--accent-primary);
  }

  .date-input {
    font-family: inherit;
  }

  .select-input {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    padding-right: 1.5rem;
  }

  /* Boolean toggle */
  .boolean-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    padding: 0.375rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .boolean-toggle input[type='checkbox'] {
    width: 1rem;
    height: 1rem;
    accent-color: var(--accent-primary);
    cursor: pointer;
  }

  .toggle-label {
    color: var(--text-primary);
  }

  /* Tag input for multi-value */
  .tag-input-container .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    min-height: 2rem;
    align-items: center;
  }

  .tag-input-container:focus-within .tags {
    border-color: var(--accent-primary);
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    background: var(--accent-primary-alpha, rgba(59, 130, 246, 0.1));
    color: var(--accent-primary);
    border-radius: 0.25rem;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .tag-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--accent-primary);
    cursor: pointer;
    font-size: 0.875rem;
    line-height: 1;
    opacity: 0.7;
    transition: opacity 0.2s ease;
  }

  .tag-remove:hover {
    opacity: 1;
  }

  .tag-text-input {
    flex: 1;
    min-width: 60px;
    padding: 0.125rem 0.25rem;
    background: transparent;
    border: none;
    font-size: 0.75rem;
    color: var(--text-primary);
    outline: none;
  }

  .tag-text-input::placeholder {
    color: var(--text-muted);
  }

  /* Suggestions dropdown */
  .suggestions-dropdown {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    max-height: 12rem;
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
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.75rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .suggestion-item:hover,
  .suggestion-item.highlighted {
    background: var(--bg-secondary);
  }

  /* BETWEEN two-value input */
  .between-inputs {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .between-input {
    flex: 1;
    min-width: 80px;
  }

  .between-separator {
    font-size: 0.7rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  /* Checkbox list for multi-value select */
  .checkbox-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    max-height: 10rem;
    overflow-y: auto;
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.125rem 0;
  }

  .checkbox-item:hover {
    background: var(--bg-tertiary);
    margin: 0 -0.5rem;
    padding: 0.125rem 0.5rem;
    border-radius: 0.125rem;
  }

  .checkbox-item input[type='checkbox'] {
    width: 0.875rem;
    height: 0.875rem;
    accent-color: var(--accent-primary);
    cursor: pointer;
    flex-shrink: 0;
  }

  .checkbox-label {
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
