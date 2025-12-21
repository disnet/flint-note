<script lang="ts">
  /**
   * PDF Outline/Bookmarks Component
   *
   * Displays the PDF's outline structure (bookmarks) in a navigable tree.
   */

  import type { PdfOutlineItem } from '../lib/automerge';

  // Props
  let {
    outline,
    currentPage = 1,
    onNavigate = (_pageNumber: number) => {}
  }: {
    outline: PdfOutlineItem[];
    currentPage?: number;
    onNavigate?: (pageNumber: number) => void;
  } = $props();

  // Track expanded state for items with children
  let expandedItems = $state<Set<string>>(new Set());

  // Generate a unique key for an outline item
  function getItemKey(item: PdfOutlineItem, path: string): string {
    return `${path}-${item.pageNumber}-${item.label.slice(0, 20)}`;
  }

  // Toggle expanded state
  function toggleExpanded(key: string): void {
    if (expandedItems.has(key)) {
      expandedItems.delete(key);
      expandedItems = new Set(expandedItems);
    } else {
      expandedItems.add(key);
      expandedItems = new Set(expandedItems);
    }
  }

  // Handle item click
  function handleItemClick(item: PdfOutlineItem, key: string): void {
    // If item has children, toggle expansion on click
    if (item.children && item.children.length > 0) {
      toggleExpanded(key);
    }
    // Always navigate to the page
    onNavigate(item.pageNumber);
  }

  // Check if an item is the current one (page range includes current page)
  function isCurrentItem(item: PdfOutlineItem): boolean {
    return item.pageNumber === currentPage;
  }
</script>

<div class="pdf-outline">
  <div class="outline-header">
    <h3>Contents</h3>
  </div>

  {#if outline.length === 0}
    <div class="empty-outline">
      <p>No outline available</p>
    </div>
  {:else}
    <div class="outline-list">
      {#snippet outlineItem(item: PdfOutlineItem, depth: number, path: string)}
        {@const key = getItemKey(item, path)}
        {@const hasChildren = item.children && item.children.length > 0}
        {@const isExpanded = expandedItems.has(key)}
        {@const isCurrent = isCurrentItem(item)}

        <div class="outline-item" style="--depth: {depth}">
          <button
            class="outline-item-button"
            class:current={isCurrent}
            class:has-children={hasChildren}
            onclick={() => handleItemClick(item, key)}
            title="Page {item.pageNumber}"
          >
            {#if hasChildren}
              <span class="expand-icon" class:expanded={isExpanded}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </span>
            {:else}
              <span class="expand-placeholder"></span>
            {/if}
            <span class="item-label">{item.label}</span>
            <span class="item-page">{item.pageNumber}</span>
          </button>

          {#if hasChildren && isExpanded}
            <div class="outline-children">
              {#each item.children as child, i (getItemKey(child, `${path}-${i}`))}
                {@render outlineItem(child, depth + 1, `${path}-${i}`)}
              {/each}
            </div>
          {/if}
        </div>
      {/snippet}

      {#each outline as item, i (getItemKey(item, `${i}`))}
        {@render outlineItem(item, 0, `${i}`)}
      {/each}
    </div>
  {/if}
</div>

<style>
  .pdf-outline {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .outline-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-light, #e0e0e0);
    flex-shrink: 0;
  }

  .outline-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  .empty-outline {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--text-muted, #999);
    font-size: 0.875rem;
  }

  .outline-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .outline-item {
    display: flex;
    flex-direction: column;
  }

  .outline-item-button {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 0.5rem;
    padding-left: calc(0.5rem + var(--depth) * 1rem);
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    font-size: 0.8125rem;
    color: var(--text-primary, #333);
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .outline-item-button:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  }

  .outline-item-button.current {
    background: var(--accent-bg, rgba(0, 123, 255, 0.1));
    color: var(--accent-primary, #007bff);
  }

  .expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--text-muted, #999);
    transition: transform 0.15s;
  }

  .expand-icon.expanded {
    transform: rotate(90deg);
  }

  .expand-placeholder {
    width: 16px;
    flex-shrink: 0;
  }

  .item-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-page {
    flex-shrink: 0;
    padding: 2px 6px;
    background: var(--bg-tertiary, #f0f0f0);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--text-muted, #999);
  }

  .outline-children {
    margin-left: 0;
  }
</style>
