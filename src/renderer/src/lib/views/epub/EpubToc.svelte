<script lang="ts">
  import type { TocItem } from './types';

  let {
    toc = [],
    currentHref = '',
    onNavigate = (_href: string) => {},
    onClose = () => {}
  }: {
    toc: TocItem[];
    currentHref?: string;
    onNavigate?: (href: string) => void;
    onClose?: () => void;
  } = $props();

  let expandedItems = $state<Set<string>>(new Set());

  function toggleExpand(href: string): void {
    const newSet = new Set(expandedItems);
    if (newSet.has(href)) {
      newSet.delete(href);
    } else {
      newSet.add(href);
    }
    expandedItems = newSet;
  }

  function handleItemClick(item: TocItem): void {
    onNavigate(item.href);
  }
</script>

<div class="epub-toc">
  <div class="toc-header">
    <h3>Table of Contents</h3>
    <button class="close-button" onclick={onClose} aria-label="Close table of contents">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 4L12 12M4 12L12 4"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>

  <div class="toc-content">
    {#if toc.length === 0}
      <p class="empty-toc">No table of contents available</p>
    {:else}
      <ul class="toc-list">
        {#each toc as item, idx (`${idx}-${item.href}`)}
          {@render tocItem(item, 0, `${idx}`)}
        {/each}
      </ul>
    {/if}
  </div>
</div>

{#snippet tocItem(item: TocItem, level: number, keyPrefix: string)}
  <li class="toc-item" style="--indent: {level}">
    <div class="toc-item-row" class:current={item.href === currentHref}>
      {#if item.subitems && item.subitems.length > 0}
        <button
          class="expand-button"
          class:expanded={expandedItems.has(item.href)}
          onclick={() => toggleExpand(item.href)}
          aria-label={expandedItems.has(item.href) ? 'Collapse' : 'Expand'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M4 2L8 6L4 10"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      {:else}
        <span class="expand-placeholder"></span>
      {/if}
      <button class="toc-link" onclick={() => handleItemClick(item)}>
        {item.label}
      </button>
    </div>

    {#if item.subitems && item.subitems.length > 0 && expandedItems.has(item.href)}
      <ul class="toc-sublist">
        {#each item.subitems as subitem, subIdx (`${keyPrefix}-${subIdx}-${subitem.href}`)}
          {@render tocItem(subitem, level + 1, `${keyPrefix}-${subIdx}`)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<style>
  .epub-toc {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary, #fff);
    border-right: 1px solid var(--border-light, #e0e0e0);
  }

  .toc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border-light, #e0e0e0);
  }

  .toc-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  .close-button {
    padding: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary, #666);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-button:hover {
    background: var(--bg-secondary, #f5f5f5);
    color: var(--text-primary, #333);
  }

  .toc-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .empty-toc {
    padding: 1rem;
    color: var(--text-muted, #999);
    font-style: italic;
    text-align: center;
  }

  .toc-list,
  .toc-sublist {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .toc-item {
    display: flex;
    flex-direction: column;
  }

  .toc-item-row {
    display: flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    padding-left: calc(0.5rem + var(--indent, 0) * 1rem);
    gap: 0.25rem;
  }

  .toc-item-row:hover {
    background: var(--bg-secondary, #f5f5f5);
  }

  .toc-item-row.current {
    background: var(--accent-bg, #e3f2fd);
  }

  .toc-item-row.current .toc-link {
    color: var(--accent-primary, #007bff);
    font-weight: 500;
  }

  .expand-button {
    padding: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary, #666);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: transform 0.15s ease;
    flex-shrink: 0;
  }

  .expand-button:hover {
    background: var(--bg-hover, #e0e0e0);
  }

  .expand-button.expanded {
    transform: rotate(90deg);
  }

  .expand-placeholder {
    width: 20px;
    flex-shrink: 0;
  }

  .toc-link {
    flex: 1;
    text-align: left;
    padding: 0.25rem 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-primary, #333);
    font-size: 0.875rem;
    line-height: 1.4;
    word-break: break-word;
  }

  .toc-link:hover {
    color: var(--accent-primary, #007bff);
  }
</style>
