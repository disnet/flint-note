<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import type { EpubTocItem } from '../lib/automerge';

  // Props
  let {
    toc = [],
    onNavigate = (_href: string) => {}
  }: {
    toc: EpubTocItem[];
    onNavigate?: (href: string) => void;
  } = $props();

  // Track expanded state for items with subitems
  let expandedItems = new SvelteSet<string>();

  function toggleExpanded(label: string): void {
    if (expandedItems.has(label)) {
      expandedItems.delete(label);
    } else {
      expandedItems.add(label);
    }
  }

  function handleClick(item: EpubTocItem): void {
    onNavigate(item.href);
  }
</script>

<div class="toc-container">
  <h3 class="toc-header">Contents</h3>

  {#if toc.length === 0}
    <p class="toc-empty">No table of contents available</p>
  {:else}
    <nav class="toc-nav">
      <ul class="toc-list">
        {#each toc as item (item.href)}
          <li class="toc-item">
            <div class="toc-item-row">
              {#if item.subitems && item.subitems.length > 0}
                <button
                  class="expand-button"
                  onclick={() => toggleExpanded(item.label)}
                  aria-label={expandedItems.has(item.label) ? 'Collapse' : 'Expand'}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class:rotated={expandedItems.has(item.label)}
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              {:else}
                <span class="expand-placeholder"></span>
              {/if}
              <button class="toc-link" onclick={() => handleClick(item)}>
                {item.label}
              </button>
            </div>

            {#if item.subitems && item.subitems.length > 0 && expandedItems.has(item.label)}
              <ul class="toc-sublist">
                {#each item.subitems as subitem (subitem.href)}
                  <li class="toc-subitem">
                    <button class="toc-link" onclick={() => handleClick(subitem)}>
                      {subitem.label}
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
</div>

<style>
  .toc-container {
    padding: 1rem;
  }

  .toc-header {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary, #666);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 1rem 0;
  }

  .toc-empty {
    color: var(--text-muted, #999);
    font-size: 0.875rem;
    font-style: italic;
  }

  .toc-nav {
    overflow-y: auto;
  }

  .toc-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .toc-item {
    margin-bottom: 2px;
  }

  .toc-item-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .expand-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-secondary, #666);
    flex-shrink: 0;
  }

  .expand-button:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  }

  .expand-button svg {
    transition: transform 0.15s ease;
  }

  .expand-button svg.rotated {
    transform: rotate(90deg);
  }

  .expand-placeholder {
    width: 20px;
    flex-shrink: 0;
  }

  .toc-link {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    font-size: 0.875rem;
    color: var(--text-primary, #333);
    line-height: 1.4;
    transition: background-color 0.15s;
  }

  .toc-link:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  }

  .toc-sublist {
    list-style: none;
    margin: 0;
    padding: 0 0 0 24px;
  }

  .toc-subitem {
    margin-bottom: 2px;
  }

  .toc-subitem .toc-link {
    font-size: 0.8125rem;
    color: var(--text-secondary, #666);
  }
</style>
