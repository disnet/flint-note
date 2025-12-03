<script lang="ts">
  import type { DeckSort } from './types';

  interface Props {
    /** Field name */
    field: string;
    /** Display label */
    label: string;
    /** Current sort config */
    sort?: DeckSort;
    /** Called when chip is clicked */
    onClick: (event: MouseEvent) => void;
  }

  let { field, label, sort, onClick }: Props = $props();

  const isSorted = $derived(sort?.field === field);
  const sortOrder = $derived(isSorted ? sort?.order : null);
</script>

<button
  class="prop-chip"
  class:sorted={isSorted}
  onclick={onClick}
  type="button"
  title={label}
>
  <span class="prop-label">{label}</span>
  {#if isSorted}
    <span class="sort-indicator">{sortOrder === 'asc' ? '↑' : '↓'}</span>
  {/if}
</button>

<style>
  .prop-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 1rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .prop-chip:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
  }

  .prop-chip.sorted {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }

  .prop-label {
    white-space: nowrap;
  }

  .sort-indicator {
    font-size: 0.65rem;
    opacity: 0.8;
  }
</style>
