<script lang="ts">
  import { emojiData } from '../lib/emoji/emoji-data.svelte';
  import type { EmojiCategory, EmojiSearchResult } from '../lib/emoji/types';
  import { EMOJI_GROUP_ORDER, EMOJI_GROUPS } from '../lib/emoji/types';

  interface Props {
    value?: string;
    onselect: (emoji: string) => void;
  }

  let { value = $bindable(''), onselect }: Props = $props();

  let searchQuery = $state('');
  let debouncedQuery = $state('');
  let isOpen = $state(false);
  let buttonRef = $state<HTMLButtonElement | null>(null);
  let scrollContainer = $state<HTMLDivElement | null>(null);
  let dropdownPosition = $state({ top: 0, left: 0, openUpward: false });
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Load emoji data when picker opens
  $effect(() => {
    if (isOpen && !emojiData.isLoaded && !emojiData.isLoading) {
      emojiData.load();
    }
  });

  // Debounce search input
  $effect(() => {
    // Read searchQuery synchronously to track it as a dependency
    const query = searchQuery;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debouncedQuery = query;
    }, 150);

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  });

  // Get search results or categories
  let searchResults = $derived.by((): EmojiSearchResult[] | null => {
    if (!debouncedQuery.trim() || !emojiData.isLoaded) return null;
    return emojiData.search(debouncedQuery);
  });

  let categories = $derived.by((): EmojiCategory[] => {
    if (!emojiData.isLoaded) return [];
    return emojiData.getCategories();
  });

  function selectEmoji(emoji: string): void {
    value = emoji;
    onselect(emoji);
    isOpen = false;
    searchQuery = '';
    debouncedQuery = '';
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      isOpen = false;
      searchQuery = '';
      debouncedQuery = '';
    }
  }

  function scrollToCategory(groupId: number): void {
    const element = scrollContainer?.querySelector(`[data-group="${groupId}"]`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function calculatePosition(): void {
    if (!buttonRef) return;

    const rect = buttonRef.getBoundingClientRect();
    const dropdownHeight = 450;
    const dropdownWidth = 360;
    const padding = 8;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < dropdownHeight + padding && spaceAbove > spaceBelow;

    let top: number;
    if (openUpward) {
      top = rect.top - dropdownHeight - 4;
    } else {
      top = rect.bottom + 4;
    }

    let left = rect.left;
    if (left + dropdownWidth > window.innerWidth - padding) {
      left = window.innerWidth - dropdownWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    dropdownPosition = { top, left, openUpward };
  }

  function togglePicker(): void {
    if (!isOpen) {
      calculatePosition();
    }
    isOpen = !isOpen;
    if (!isOpen) {
      searchQuery = '';
      debouncedQuery = '';
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Element;
    if (
      !target.closest('.emoji-picker-container') &&
      !target.closest('.emoji-picker-dropdown')
    ) {
      isOpen = false;
      searchQuery = '';
      debouncedQuery = '';
    }
  }

  $effect(() => {
    if (!isOpen) return;

    const updatePosition = (): void => calculatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('click', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="emoji-picker-container">
  <button type="button" class="emoji-button" bind:this={buttonRef} onclick={togglePicker}>
    {value || '😀'} <span class="arrow">{isOpen ? '▲' : '▼'}</span>
  </button>
</div>

{#if isOpen}
  <div
    class="emoji-picker-dropdown"
    style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px;"
    onkeydown={handleKeydown}
    role="dialog"
    aria-label="Emoji picker"
    tabindex="-1"
  >
    <div class="search-box">
      <input
        type="text"
        placeholder="Search emoji..."
        bind:value={searchQuery}
        class="search-input"
      />
    </div>

    {#if !debouncedQuery.trim() && emojiData.isLoaded}
      <div class="category-tabs">
        {#each EMOJI_GROUP_ORDER as groupId (groupId)}
          <button
            type="button"
            class="category-tab"
            onclick={() => scrollToCategory(groupId)}
            title={EMOJI_GROUPS[groupId]?.name}
          >
            {EMOJI_GROUPS[groupId]?.icon}
          </button>
        {/each}
      </div>
    {/if}

    <div class="emoji-content" bind:this={scrollContainer}>
      {#if emojiData.isLoading}
        <div class="loading-state">Loading emojis...</div>
      {:else if searchResults}
        {#if searchResults.length === 0}
          <div class="empty-state">No emojis found for "{debouncedQuery}"</div>
        {:else}
          <div class="emoji-category">
            <div class="category-name">Search Results</div>
            <div class="emoji-grid">
              {#each searchResults as result (result.emoji)}
                <button
                  type="button"
                  class="emoji-item"
                  onclick={() => selectEmoji(result.emoji)}
                  title={result.label}
                >
                  {result.emoji}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        {#each categories as category (category.id)}
          <div class="emoji-category" data-group={category.id}>
            <div class="category-name">{category.name}</div>
            <div class="emoji-grid">
              {#each category.emojis as emoji (emoji.hexcode)}
                <button
                  type="button"
                  class="emoji-item"
                  onclick={() => selectEmoji(emoji.emoji)}
                  title={emoji.label}
                >
                  {emoji.emoji}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .emoji-picker-container {
    position: relative;
    display: inline-block;
  }

  .emoji-button {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    font-size: 20px;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .emoji-button:hover {
    background: var(--bg-hover);
    border-color: var(--border-medium);
  }

  .arrow {
    font-size: 10px;
    color: var(--text-muted);
  }

  .emoji-picker-dropdown {
    position: fixed;
    z-index: 10000;
    width: 360px;
    max-height: 450px;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .search-box {
    padding: 12px;
    border-bottom: 1px solid var(--border-medium);
    flex-shrink: 0;
  }

  .search-input {
    width: 100%;
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid var(--border-medium);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
  }

  .search-input:focus {
    border-color: var(--accent-primary);
  }

  .category-tabs {
    display: flex;
    gap: 2px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-medium);
    flex-shrink: 0;
    overflow-x: auto;
  }

  .category-tab {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .category-tab:hover {
    background: var(--bg-hover);
  }

  .emoji-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px 8px;
  }

  .emoji-category {
    margin-bottom: 16px;
  }

  .category-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    position: sticky;
    top: 0;
    background: var(--bg-primary);
    padding: 8px 0 4px;
    z-index: 1;
  }

  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
    gap: 4px;
  }

  .emoji-item {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .emoji-item:hover {
    background: var(--bg-hover);
    transform: scale(1.1);
  }

  .emoji-item:active {
    transform: scale(0.95);
  }

  .loading-state,
  .empty-state {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
    font-size: 14px;
  }
</style>
