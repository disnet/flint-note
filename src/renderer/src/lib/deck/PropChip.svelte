<script lang="ts">
  import type { DeckSort } from './types';

  interface Props {
    /** Field name */
    field: string;
    /** Display label */
    label: string;
    /** Whether this column is visible in the list */
    visible?: boolean;
    /** Current sort config */
    sort?: DeckSort;
    /** Called when chip is clicked */
    onClick: (event: MouseEvent) => void;
    /** Called when visibility is toggled */
    onVisibilityToggle?: (field: string, visible: boolean) => void;
    /** Called when sort is toggled */
    onSort?: (field: string, order: 'asc' | 'desc') => void;
  }

  let {
    field,
    label,
    visible = true,
    sort,
    onClick,
    onVisibilityToggle,
    onSort
  }: Props = $props();

  const isSorted = $derived(sort?.field === field);
  const sortOrder = $derived(isSorted ? sort?.order : null);

  function handleVisibilityToggle(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    onVisibilityToggle?.(field, !visible);
  }

  function handleSortToggle(event: MouseEvent): void {
    event.stopPropagation();
    // If not sorted by this field, default to desc; otherwise toggle
    const newOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    onSort?.(field, newOrder);
  }
</script>

<div class="prop-chip-wrapper" class:hidden={!visible}>
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
    class="visibility-btn"
    class:hidden={!visible}
    class:sorted={isSorted}
    onclick={handleVisibilityToggle}
    onmousedown={(e) => e.stopPropagation()}
    type="button"
    title={visible ? 'Hide from list' : 'Show in list'}
  >
    {#if visible}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    {:else}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    {/if}
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

  .visibility-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.25rem;
    border: none;
    border-left: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .visibility-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .visibility-btn.hidden {
    color: var(--text-muted);
    opacity: 0.6;
  }

  .visibility-btn.sorted {
    background: var(--accent-primary);
    color: white;
  }

  .visibility-btn.sorted.hidden {
    opacity: 1;
    color: rgba(255, 255, 255, 0.7);
  }

  .visibility-btn svg {
    stroke: currentColor;
  }

  .prop-chip-wrapper.hidden {
    opacity: 0.6;
    border-style: dashed;
  }

  .prop-chip-wrapper.hidden:has(.sorted) {
    opacity: 1;
    border-style: solid;
  }

  .prop-chip-wrapper.hidden .prop-chip {
    color: var(--text-muted);
  }

  .prop-chip-wrapper.hidden .prop-chip.sorted {
    color: white;
  }
</style>
