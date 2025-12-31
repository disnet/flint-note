<script lang="ts">
  /**
   * Shared date input component
   * Works with ISO date strings
   */

  interface Props {
    /** Current value (ISO date string) */
    value: string | null;
    /** Called when value changes */
    onChange: (value: string | null) => void;
    /** Whether input is disabled */
    disabled?: boolean;
    /** CSS class for styling */
    class?: string;
  }

  let { value, onChange, disabled = false, class: className = '' }: Props = $props();

  // Get date portion from ISO string for the input
  const dateValue = $derived(value ? value.split('T')[0] : '');

  function handleChange(e: Event): void {
    const inputValue = (e.currentTarget as HTMLInputElement).value;
    // Store as ISO date string (just the date portion)
    onChange(inputValue || null);
  }
</script>

<input
  type="date"
  class="date-input {className}"
  value={dateValue}
  {disabled}
  onchange={handleChange}
/>

<style>
  .date-input {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: inherit;
    padding: 0.125rem 0.5rem;
    min-width: 7rem;
    outline: none;
  }

  .date-input:focus {
    background: var(--bg-primary);
  }

  .date-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
