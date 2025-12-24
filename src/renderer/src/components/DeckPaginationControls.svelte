<script lang="ts">
  import { PAGE_SIZE_OPTIONS, type PageSize } from '../lib/automerge/deck';

  interface Props {
    /** Current page number (0-indexed) */
    currentPage: number;
    /** Total number of pages */
    totalPages: number;
    /** Number of items per page */
    pageSize: number;
    /** Total number of items across all pages */
    total: number;
    /** Called when page changes */
    onPageChange: (page: number) => void;
    /** Called when page size changes */
    onPageSizeChange: (size: PageSize) => void;
  }

  let {
    currentPage,
    totalPages,
    pageSize,
    total,
    onPageChange,
    onPageSizeChange
  }: Props = $props();

  // Derived: display range (1-indexed for users)
  const startItem = $derived(total === 0 ? 0 : currentPage * pageSize + 1);
  const endItem = $derived(Math.min((currentPage + 1) * pageSize, total));

  // Navigation state
  const canGoPrevious = $derived(currentPage > 0);
  const canGoNext = $derived(currentPage < totalPages - 1);

  function handlePrevious(): void {
    if (canGoPrevious) {
      onPageChange(currentPage - 1);
    }
  }

  function handleNext(): void {
    if (canGoNext) {
      onPageChange(currentPage + 1);
    }
  }

  function handlePageSizeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const newSize = parseInt(select.value, 10) as PageSize;
    onPageSizeChange(newSize);
  }
</script>

{#if total > 0}
  <div class="pagination-controls">
    <div class="pagination-nav">
      <button
        class="nav-button"
        type="button"
        disabled={!canGoPrevious}
        onclick={handlePrevious}
        title="Previous page"
      >
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
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <span class="page-info">
        {startItem}-{endItem} of {total}
      </span>

      <button
        class="nav-button"
        type="button"
        disabled={!canGoNext}
        onclick={handleNext}
        title="Next page"
      >
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
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>

    <div class="page-size-control">
      <label class="page-size-label" for="page-size-select">Show</label>
      <select
        id="page-size-select"
        class="page-size-select"
        value={pageSize}
        onchange={handlePageSizeChange}
      >
        {#each PAGE_SIZE_OPTIONS as size (size)}
          <option value={size}>{size}</option>
        {/each}
      </select>
    </div>
  </div>
{/if}

<style>
  .pagination-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0;
    gap: 1rem;
    border-top: 1px solid var(--border-light);
    margin-top: 0.5rem;
  }

  .pagination-nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .nav-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .nav-button:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
    color: var(--text-primary);
  }

  .nav-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
    min-width: 80px;
    text-align: center;
  }

  .page-size-control {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .page-size-label {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .page-size-select {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.75rem;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .page-size-select:hover {
    border-color: var(--border-medium);
  }

  .page-size-select:focus {
    border-color: var(--accent-primary);
  }
</style>
