<script lang="ts">
  /**
   * Shared list dropdown for arrays and notelinks
   * Shows items with remove buttons and an add section
   */
  import type { Snippet } from 'svelte';

  interface Props {
    /** Array of items */
    items: string[];
    /** Called when an item should be removed */
    onRemove: (item: string) => void;
    /** Called when an item is clicked (for navigation) */
    onItemClick?: (item: string) => void;
    /** Position of the dropdown */
    position: { top: number; left: number };
    /** Called when mouse enters dropdown (to cancel close timeout) */
    onMouseEnter?: () => void;
    /** Called when mouse leaves dropdown */
    onMouseLeave?: () => void;
    /** Whether items are clickable (for notelinks) */
    clickable?: boolean;
    /** Function to render item display text */
    renderItem?: (item: string) => string;
    /** Slot for add section */
    addSection?: Snippet;
    /** Reference to the items container for scrolling */
    itemsContainerRef?: (el: HTMLDivElement | null) => void;
  }

  let {
    items,
    onRemove,
    onItemClick,
    position,
    onMouseEnter,
    onMouseLeave,
    clickable = false,
    renderItem = (item: string) => item,
    addSection,
    itemsContainerRef
  }: Props = $props();

  let containerRef = $state<HTMLDivElement | null>(null);

  // Pass container ref to parent
  $effect(() => {
    itemsContainerRef?.(containerRef);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="list-dropdown"
  style="top: {position.top}px; left: {position.left}px;"
  onmouseenter={onMouseEnter}
  onmouseleave={onMouseLeave}
>
  <div class="list-dropdown-items" bind:this={containerRef}>
    {#if items.length > 0}
      {#each items as item (item)}
        <div class="list-dropdown-item">
          {#if clickable && onItemClick}
            <button
              type="button"
              class="list-item-link"
              onclick={() => onItemClick(item)}
            >
              {renderItem(item)}
            </button>
          {:else}
            <span class="list-item-text">{renderItem(item)}</span>
          {/if}
          <button type="button" class="list-item-remove" onclick={() => onRemove(item)}>
            &times;
          </button>
        </div>
      {/each}
    {:else}
      <div class="list-dropdown-empty">No items</div>
    {/if}
  </div>
  {#if addSection}
    <div class="list-dropdown-add">
      {@render addSection()}
    </div>
  {/if}
</div>

<style>
  .list-dropdown {
    position: fixed;
    z-index: 9999;
    width: 240px;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    overflow: hidden;
  }

  .list-dropdown-items {
    max-height: 200px;
    overflow-y: auto;
  }

  .list-dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .list-dropdown-item:last-child {
    border-bottom: none;
  }

  .list-item-text {
    flex: 1;
    font-size: 0.8rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-item-link {
    flex: 1;
    background: none;
    border: none;
    padding: 0;
    color: var(--accent-primary);
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-item-link:hover {
    text-decoration: underline;
  }

  .list-item-remove {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0 0.25rem;
    color: var(--text-muted);
    font-size: 1rem;
    cursor: pointer;
    line-height: 1;
  }

  .list-item-remove:hover {
    color: var(--error-color, #ef4444);
  }

  .list-dropdown-empty {
    padding: 0.5rem;
    color: var(--text-muted);
    font-size: 0.8rem;
    text-align: center;
  }

  .list-dropdown-add {
    display: flex;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }
</style>
