<script lang="ts">
  import type {
    DeckFilter,
    FilterOperator,
    FilterFieldInfo
  } from '../lib/automerge/deck';
  import {
    getOperatorsForType,
    getOperatorLabel,
    EMPTY_FILTER_VALUE
  } from '../lib/automerge/deck';

  // Display text for the empty marker
  const EMPTY_MARKER = EMPTY_FILTER_VALUE;
  const EMPTY_DISPLAY = '<empty>';

  interface Props {
    /** Whether the popup is open */
    isOpen: boolean;
    /** The filter being edited */
    filter: DeckFilter | null;
    /** Field info for the filter */
    fieldInfo: FilterFieldInfo | null;
    /** Position for the popup */
    position: { top: number; left: number };
    /** Options for select fields (e.g., note type names for type field) */
    options?: string[];
    /** Called when filter is updated */
    onUpdate: (filter: DeckFilter) => void;
    /** Called when filter is removed */
    onRemove: () => void;
    /** Called when popup should close */
    onClose: () => void;
  }

  let {
    isOpen,
    filter,
    fieldInfo,
    position,
    options = [],
    onUpdate,
    onRemove,
    onClose
  }: Props = $props();

  // Effective options: use passed options if available, otherwise fall back to fieldInfo.options
  const effectiveOptions = $derived(
    options.length > 0 ? options : fieldInfo?.options || []
  );

  let popupRef = $state<HTMLDivElement | null>(null);

  // Selected values derived from filter (for multi-select checkboxes)
  const selectedValues = $derived.by(() => {
    if (!filter?.value) return [] as string[];
    if (Array.isArray(filter.value)) return filter.value;
    return filter.value ? [filter.value] : [];
  });

  // Get available operators for this field type
  const availableOperators = $derived.by(() => {
    if (!fieldInfo) return ['=', '!=', 'LIKE'] as FilterOperator[];
    return getOperatorsForType(fieldInfo.type);
  });

  // Current operator (default to '=' if not set)
  const currentOperator = $derived((filter?.operator || '=') as FilterOperator);

  // Current value as string (for single value inputs)
  const currentValue = $derived(
    Array.isArray(filter?.value) ? filter?.value.join(', ') : filter?.value || ''
  );

  // Check if we should show multi-select (IN or NOT IN operator with options)
  const showMultiSelect = $derived(
    (currentOperator === 'IN' || currentOperator === 'NOT IN') &&
      effectiveOptions.length > 0
  );

  // Close when clicking outside - use mousedown to detect before any state changes
  function handleMouseDownOutside(event: MouseEvent): void {
    if (popupRef && !popupRef.contains(event.target as Node)) {
      onClose();
    }
  }

  $effect(() => {
    if (isOpen) {
      // Use a small delay to avoid closing immediately when popup opens
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleMouseDownOutside, true);
      }, 10);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleMouseDownOutside, true);
      };
    }
    return undefined;
  });

  function handleOperatorChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const newOperator = select.value as FilterOperator;
    if (filter) {
      // When switching to IN or NOT IN, convert value to array if needed
      const isMultiValueOp = newOperator === 'IN' || newOperator === 'NOT IN';
      const wasMultiValueOp = filter.operator === 'IN' || filter.operator === 'NOT IN';
      let newValue: string | string[] = filter.value;
      if (isMultiValueOp && !Array.isArray(filter.value)) {
        newValue = filter.value ? [filter.value] : [];
      } else if (!isMultiValueOp && wasMultiValueOp && Array.isArray(filter.value)) {
        newValue = filter.value[0] || '';
      }
      onUpdate({
        ...filter,
        operator: newOperator,
        value: newValue
      });
    }
  }

  function handleValueChange(event: Event): void {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    const newValue = input.value;
    if (filter) {
      // For IN/NOT IN operator without options, split by comma
      const isMultiValueOp = currentOperator === 'IN' || currentOperator === 'NOT IN';
      const value = isMultiValueOp ? newValue.split(',').map((v) => v.trim()) : newValue;
      onUpdate({
        ...filter,
        value
      });
    }
  }

  function handleCheckboxChange(option: string, checked: boolean): void {
    if (!filter) return;
    let newValues: string[];
    if (checked) {
      newValues = [...selectedValues, option];
    } else {
      newValues = selectedValues.filter((v) => v !== option);
    }
    onUpdate({
      ...filter,
      value: newValues
    });
  }

  function handleRemove(): void {
    onRemove();
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
      event.preventDefault();
      event.stopPropagation();
    }
  }
</script>

{#if isOpen && filter}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={popupRef}
    class="prop-filter-popup"
    style="top: {position.top}px; left: {position.left}px;"
    onmousedown={(e) => {
      const tag = (e.target as HTMLElement).tagName;
      // Allow interactive elements to work normally
      if (!['INPUT', 'SELECT', 'OPTION', 'BUTTON', 'LABEL'].includes(tag)) {
        e.preventDefault();
      }
      e.stopPropagation();
    }}
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeyDown}
  >
    <!-- Header row: name, operator, delete -->
    <div class="header-row">
      <span class="field-name">{fieldInfo?.label || filter.field}</span>
      <select
        class="operator-select"
        value={currentOperator}
        onchange={handleOperatorChange}
      >
        {#each availableOperators as op (op)}
          <option value={op}>{getOperatorLabel(op)}</option>
        {/each}
      </select>
      <button class="delete-btn" onclick={handleRemove} type="button" title="Remove">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path
            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          />
        </svg>
      </button>
    </div>

    <!-- Value row -->
    <div class="value-row">
      {#if fieldInfo?.type === 'notelink' || fieldInfo?.type === 'notelinks'}
        <!-- Notelink(s) - simplified to text input for now -->
        <input
          type="text"
          class="value-input"
          value={currentValue}
          placeholder="Enter note ID..."
          onchange={handleValueChange}
        />
      {:else if showMultiSelect}
        <!-- Multi-select checkboxes for IN operator with options -->
        <div class="checkbox-list">
          <!-- Empty option first -->
          <label class="checkbox-item">
            <input
              type="checkbox"
              checked={selectedValues.includes(EMPTY_MARKER)}
              onchange={(e) =>
                handleCheckboxChange(
                  EMPTY_MARKER,
                  (e.target as HTMLInputElement).checked
                )}
            />
            <span class="checkbox-label empty-label">{EMPTY_DISPLAY}</span>
          </label>
          {#each effectiveOptions as option (option)}
            <label class="checkbox-item">
              <input
                type="checkbox"
                checked={selectedValues.includes(option)}
                onchange={(e) =>
                  handleCheckboxChange(option, (e.target as HTMLInputElement).checked)}
              />
              {#if fieldInfo?.optionIcons}
                <span class="option-icon">{fieldInfo.optionIcons[option] || ''}</span>
              {/if}
              <span class="checkbox-label">{option}</span>
            </label>
          {/each}
        </div>
      {:else if fieldInfo?.type === 'boolean'}
        <select class="value-input" value={currentValue} onchange={handleValueChange}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      {:else if effectiveOptions.length > 0}
        <select class="value-input" value={currentValue} onchange={handleValueChange}>
          <option value="">Select...</option>
          <option value={EMPTY_MARKER}>{EMPTY_DISPLAY}</option>
          {#each effectiveOptions as option (option)}
            <option value={option}
              >{fieldInfo?.optionIcons
                ? `${fieldInfo.optionIcons[option] || ''} ${option}`
                : option}</option
            >
          {/each}
        </select>
      {:else if fieldInfo?.type === 'date'}
        <input
          type="date"
          class="value-input"
          value={currentValue}
          onchange={handleValueChange}
        />
      {:else if fieldInfo?.type === 'number'}
        <input
          type="number"
          class="value-input"
          value={currentValue}
          placeholder="Enter number..."
          onchange={handleValueChange}
        />
      {:else}
        <input
          type="text"
          class="value-input"
          value={currentValue}
          placeholder={currentOperator === 'IN' || currentOperator === 'NOT IN'
            ? 'value1, value2, ...'
            : 'Enter value...'}
          onchange={handleValueChange}
        />
      {/if}
    </div>
  </div>
{/if}

<style>
  .prop-filter-popup {
    position: fixed;
    min-width: 220px;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    animation: slideDown 0.15s ease-out;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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

  .header-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .field-name {
    font-weight: 500;
    font-size: 0.75rem;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .operator-select {
    flex: 1;
    padding: 0.25rem 0.375rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    font-size: 0.7rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
    cursor: pointer;
    min-width: 0;
  }

  .operator-select:focus {
    border-color: var(--accent-primary);
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .delete-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: var(--accent-error, #ef4444);
  }

  .value-row {
    display: flex;
  }

  .value-input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.15s ease;
    width: 100%;
  }

  .value-input:focus {
    border-color: var(--accent-primary);
  }

  .value-input::placeholder {
    color: var(--text-muted);
  }

  /* Checkbox list for multi-select */
  .checkbox-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 150px;
    overflow-y: auto;
    width: 100%;
    padding: 0.25rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-secondary);
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .checkbox-item:hover {
    background: var(--bg-tertiary);
  }

  .checkbox-item input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .checkbox-label {
    font-size: 0.75rem;
    color: var(--text-primary);
  }

  .checkbox-label.empty-label {
    font-style: italic;
    color: var(--text-muted);
  }

  .option-icon {
    font-size: 0.875rem;
    line-height: 1;
  }

  /* For date inputs */
  input[type='date'].value-input {
    cursor: pointer;
  }

  input[type='date'].value-input::-webkit-calendar-picker-indicator {
    cursor: pointer;
    opacity: 0.6;
  }

  input[type='date'].value-input::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
  }
</style>
