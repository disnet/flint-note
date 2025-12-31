<script lang="ts">
  /**
   * Shared select input component
   * Dropdown from predefined options
   */

  interface Props {
    /** Current value */
    value: string | null;
    /** Available options */
    options: string[];
    /** Called when value changes */
    onChange: (value: string | null) => void;
    /** Placeholder for empty option */
    placeholder?: string;
    /** Whether input is disabled */
    disabled?: boolean;
    /** CSS class for styling */
    class?: string;
  }

  let {
    value,
    options,
    onChange,
    placeholder = '—',
    disabled = false,
    class: className = ''
  }: Props = $props();

  function handleChange(e: Event): void {
    const selected = (e.currentTarget as HTMLSelectElement).value;
    onChange(selected || null);
  }
</script>

<select
  class="select-input {className}"
  value={value ?? ''}
  {disabled}
  onchange={handleChange}
>
  <option value="">{placeholder}</option>
  {#each options as opt (opt)}
    <option value={opt}>{opt}</option>
  {/each}
</select>

<style>
  .select-input {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: inherit;
    padding: 0.125rem 0.5rem;
    padding-right: 0.25rem;
    outline: none;
    cursor: pointer;
  }

  .select-input:focus {
    background: var(--bg-primary);
  }

  .select-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
