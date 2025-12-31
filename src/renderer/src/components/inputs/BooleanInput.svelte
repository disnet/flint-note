<script lang="ts">
  /**
   * Shared boolean input component (checkbox)
   */

  interface Props {
    /** Current value */
    value: boolean;
    /** Called when value changes */
    onChange: (value: boolean) => void;
    /** Whether input is disabled */
    disabled?: boolean;
    /** CSS class for styling */
    class?: string;
  }

  let { value, onChange, disabled = false, class: className = '' }: Props = $props();

  function handleChange(e: Event): void {
    const checked = (e.currentTarget as HTMLInputElement).checked;
    onChange(checked);
  }
</script>

<input
  type="checkbox"
  class="boolean-input {className}"
  checked={value}
  {disabled}
  onchange={handleChange}
/>

<style>
  .boolean-input {
    margin: 0 0.5rem;
    cursor: pointer;
  }

  .boolean-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
