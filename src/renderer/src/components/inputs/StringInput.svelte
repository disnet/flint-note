<script lang="ts">
  /**
   * Shared string input component with auto-sizing support
   * Saves on blur or Enter key
   */

  interface Props {
    /** Current value */
    value: string | null;
    /** Called when value changes */
    onChange: (value: string | null) => void;
    /** Placeholder text */
    placeholder?: string;
    /** Whether input is disabled */
    disabled?: boolean;
    /** CSS class for styling */
    class?: string;
    /** Max width CSS value */
    maxWidth?: string;
  }

  let {
    value,
    onChange,
    placeholder = '',
    disabled = false,
    class: className = '',
    maxWidth = '200px'
  }: Props = $props();

  // Internal editing value - syncs from prop but can be modified locally
  // eslint-disable-next-line svelte/prefer-writable-derived -- controlled input pattern
  let editValue = $state(value ?? '');

  // Sync internal value when prop changes
  $effect(() => {
    editValue = value ?? '';
  });

  function handleBlur(): void {
    const trimmed = editValue.trim();
    onChange(trimmed || null);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.currentTarget as HTMLInputElement).blur();
    }
  }
</script>

<input
  type="text"
  class="string-input {className}"
  style:max-width={maxWidth}
  {disabled}
  {placeholder}
  bind:value={editValue}
  onblur={handleBlur}
  onkeydown={handleKeydown}
/>

<style>
  .string-input {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: inherit;
    padding: 0.125rem 0.5rem;
    min-width: 2rem;
    outline: none;
    field-sizing: content;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .string-input:focus {
    background: var(--bg-primary);
    max-width: none !important;
  }

  .string-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
