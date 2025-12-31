<script lang="ts">
  /**
   * Shared number input component with auto-sizing support
   * Saves on blur or Enter key
   */

  interface Props {
    /** Current value */
    value: number | null;
    /** Called when value changes */
    onChange: (value: number | null) => void;
    /** Placeholder text */
    placeholder?: string;
    /** Whether input is disabled */
    disabled?: boolean;
    /** Minimum value */
    min?: number;
    /** Maximum value */
    max?: number;
    /** Step increment */
    step?: number;
    /** CSS class for styling */
    class?: string;
  }

  let {
    value,
    onChange,
    placeholder = '',
    disabled = false,
    min,
    max,
    step,
    class: className = ''
  }: Props = $props();

  // Internal editing value as string for input binding - syncs from prop
  // eslint-disable-next-line svelte/prefer-writable-derived -- controlled input pattern
  let editValue = $state(value?.toString() ?? '');

  // Sync internal value when prop changes
  $effect(() => {
    editValue = value?.toString() ?? '';
  });

  function handleBlur(): void {
    const trimmed = editValue.trim();
    if (trimmed === '') {
      onChange(null);
    } else {
      const num = Number(trimmed);
      if (!isNaN(num)) {
        onChange(num);
      }
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.currentTarget as HTMLInputElement).blur();
    }
  }
</script>

<input
  type="number"
  class="number-input {className}"
  {disabled}
  {placeholder}
  {min}
  {max}
  {step}
  bind:value={editValue}
  onblur={handleBlur}
  onkeydown={handleKeydown}
/>

<style>
  .number-input {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: inherit;
    padding: 0.125rem 0.5rem;
    min-width: 3rem;
    outline: none;
    field-sizing: content;
  }

  .number-input:focus {
    background: var(--bg-primary);
  }

  .number-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Hide spin buttons */
  .number-input::-webkit-outer-spin-button,
  .number-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .number-input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
</style>
