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
    /** Called when sort is toggled */
    onSort?: (field: string, order: 'asc' | 'desc') => void;
  }

  let { field, label, sort, onClick, onSort }: Props = $props();

  const isSorted = $derived(sort?.field === field);
  const sortOrder = $derived(isSorted ? sort?.order : null);

  function handleSortToggle(event: MouseEvent): void {
    event.stopPropagation();
    // If not sorted by this field, default to desc; otherwise toggle
    const newOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    onSort?.(field, newOrder);
  }
</script>

<div class="prop-chip-wrapper">
  <button
    class="prop-chip"
    class:sorted={isSorted}
    onclick={onClick}
    type="button"
    title={label}
  >
    <span class="prop-label">{label}</span>
  </button>
  <button
    class="sort-btn"
    class:active={isSorted}
    onclick={handleSortToggle}
    type="button"
    title={isSorted
      ? `Sorted ${sortOrder}ending - click to toggle`
      : 'Sort by this field'}
  >
    {#if sortOrder === 'asc'}
      ↑
    {:else}
      ↓
    {/if}
  </button>
</div>

<style>
  .prop-chip-wrapper {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--border-light);
    border-radius: 1rem;
    background: var(--bg-secondary);
    overflow: hidden;
    transition: border-color 0.15s ease;
  }

  .prop-chip-wrapper:hover {
    border-color: var(--border-medium);
  }

  .prop-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .prop-chip:hover {
    background: var(--bg-tertiary);
  }

  .prop-chip.sorted {
    background: var(--accent-primary);
    color: white;
  }

  .prop-label {
    white-space: nowrap;
  }

  .sort-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.375rem;
    border: none;
    border-left: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.65rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sort-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .sort-btn.active {
    background: var(--accent-primary);
    color: white;
  }
</style>
