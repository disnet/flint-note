<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface SearchResult {
    id: string;
    title: string;
    snippet: string;
    type?: string;
    filename?: string;
  }

  interface ActionBarProps {
    onNoteSelect?: (note: NoteMetadata) => void;
  }

  let { onNoteSelect }: ActionBarProps = $props();

  // Mode type for future expansion: 'search' | 'actions' | 'agent'
  // Currently only 'search' mode is implemented

  let searchValue = $state('');
  let isSearchFocused = $state(false);
  let selectedIndex = $state(-1);

  // Search results from FTS API
  let ftsResults: SearchResult[] = $state([]);
  // Track which query the current FTS results are for
  let ftsResultsQuery = $state('');

  // Derive loading state synchronously - we're loading if query >= 3 and results don't match current query
  const isLoading = $derived(
    searchValue.trim().length >= 3 && ftsResultsQuery !== searchValue.trim()
  );

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Platform-specific keyboard shortcut display
  const isMacOS = $derived(navigator.platform.includes('Mac'));
  const shortcutKey = $derived(isMacOS ? '⌘K' : 'Ctrl+K');
  const placeholder = $derived(`Search notes... (${shortcutKey})`);

  // Quick client-side title filter (for all queries, used as fallback while FTS loads)
  const quickResults = $derived.by(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const allNotes = notesStore.notes;
    if (allNotes.length === 0) {
      return [];
    }

    return allNotes
      .filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.filename.toLowerCase().includes(query)
      )
      .sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        if (aTitle.startsWith(query) && !bTitle.startsWith(query)) return -1;
        if (bTitle.startsWith(query) && !aTitle.startsWith(query)) return 1;
        return aTitle.localeCompare(bTitle);
      })
      .slice(0, 10)
      .map((note) => ({
        id: note.id,
        title: note.title || 'Untitled',
        snippet: '',
        type: note.type,
        filename: note.filename
      }));
  });

  // Combined results: merge quick title matches with FTS content matches
  const searchResults = $derived.by(() => {
    const query = searchValue.trim();
    if (!query) return [];

    // For short queries, just use quick results
    if (query.length < 3) return quickResults;

    // For longer queries, merge quick results (title matches) with FTS results (content matches)
    // FTS results take priority since they have snippets
    if (isLoading) return quickResults; // Show quick results while FTS is loading

    // Merge: title matches first, then FTS content matches
    const quickIds = new Set(quickResults.map((r) => r.id));
    const contentOnlyMatches = ftsResults.filter((r) => !quickIds.has(r.id));

    // Title matches first, then content-only matches (with snippets)
    return [...quickResults, ...contentOnlyMatches].slice(0, 15);
  });

  // Trigger FTS search when query is 3+ chars
  $effect(() => {
    const query = searchValue.trim();

    // Cancel any pending search
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (query.length < 3) {
      // Clear FTS results for short queries
      ftsResults = [];
      ftsResultsQuery = '';
      return;
    }

    // Debounce the API call
    debounceTimer = setTimeout(async () => {
      try {
        const response = await window.api?.searchNotes({
          query,
          limit: 15
        });

        // API returns array directly, not { results: [...] }
        if (Array.isArray(response) && response.length > 0) {
          ftsResults = response.map(
            (r: {
              id: string;
              title: string;
              snippet: string;
              type?: string;
              filename?: string;
            }) => ({
              id: r.id,
              title: r.title || 'Untitled',
              snippet: r.snippet || '',
              type: r.type,
              filename: r.filename
            })
          );
        } else {
          ftsResults = [];
        }
        // Mark that results are now for this query
        ftsResultsQuery = query;
      } catch (error) {
        console.error('Search error:', error);
        ftsResults = [];
        ftsResultsQuery = query; // Still mark as completed even on error
      }
    }, 200);
  });

  // Auto-select first result when results change
  $effect(() => {
    if (searchResults.length > 0) {
      selectedIndex = 0;
    } else {
      selectedIndex = -1;
    }
  });

  function handleSearchFocus(): void {
    isSearchFocused = true;
  }

  function handleSearchBlur(): void {
    setTimeout(() => {
      isSearchFocused = false;
    }, 200);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const results = searchResults;

    if (
      event.key === 'ArrowDown' ||
      (event.key === 'n' && (event.ctrlKey || event.metaKey))
    ) {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    } else if (
      event.key === 'ArrowUp' ||
      (event.key === 'p' && (event.ctrlKey || event.metaKey))
    ) {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        selectResult(results[selectedIndex]);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      clearSearch();
      (event.target as HTMLInputElement).blur();
    }
  }

  function selectResult(result: SearchResult): void {
    // Find the full note metadata to pass to onNoteSelect
    const note = notesStore.notes.find((n) => n.id === result.id);
    if (note) {
      clearSearch();
      isSearchFocused = false;
      onNoteSelect?.(note);
    }
  }

  function clearSearch(): void {
    searchValue = '';
    selectedIndex = -1;
    ftsResults = [];
    ftsResultsQuery = '';
  }

  function handleClearClick(): void {
    clearSearch();
    // Re-focus the input after clearing
    const input = document.getElementById('action-bar-input');
    input?.focus();
  }
</script>

<div class="action-bar-container">
  <div class="action-bar-input-wrapper">
    <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
      <path
        fill-rule="evenodd"
        d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
        clip-rule="evenodd"
      />
    </svg>
    <input
      id="action-bar-input"
      type="text"
      {placeholder}
      bind:value={searchValue}
      onfocus={handleSearchFocus}
      onblur={handleSearchBlur}
      onkeydown={handleKeyDown}
      class="action-bar-input"
    />
    {#if searchValue}
      <button class="clear-button" onclick={handleClearClick} aria-label="Clear search">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    {/if}
    {#if isLoading}
      <div class="loading-indicator">
        <div class="spinner"></div>
      </div>
    {/if}
  </div>

  {#if isSearchFocused && searchValue.trim().length > 0}
    <div class="action-bar-dropdown">
      {#if searchResults.length > 0}
        <div class="search-results">
          {#each searchResults as result, index (result.id)}
            <button
              class="search-result-item"
              class:selected={index === selectedIndex}
              onclick={() => selectResult(result)}
            >
              <div class="result-title">
                {result.title || 'Untitled'}
              </div>
              {#if result.snippet}
                <div class="result-snippet">
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html result.snippet}
                </div>
              {/if}
              <div class="result-meta">
                {#if result.filename}
                  <span class="result-path">{result.filename}</span>
                {/if}
                {#if result.type}
                  <span class="result-type">{result.type}</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {:else}
        <div class="loading-placeholder">
          {#if searchValue.trim().length >= 3 && isLoading}
            Searching...
          {:else}
            No results
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .action-bar-container {
    position: relative;
    width: 100%;
    max-width: 500px;
    min-width: 200px;
  }

  .action-bar-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    width: 1rem;
    height: 1rem;
    color: var(--text-tertiary);
    pointer-events: none;
    z-index: 3;
  }

  .action-bar-input {
    width: 100%;
    padding: 0.5rem 2.5rem 0.5rem 2.25rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    height: 32px;
  }

  .action-bar-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow:
      0 0 0 2px rgba(99, 102, 241, 0.2),
      0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .action-bar-input::placeholder {
    color: var(--text-placeholder);
  }

  .clear-button {
    position: absolute;
    right: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .loading-indicator {
    position: absolute;
    right: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .action-bar-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    box-shadow:
      0 10px 25px rgba(0, 0, 0, 0.2),
      0 4px 10px rgba(0, 0, 0, 0.1);
    z-index: 1001;
    margin-top: 0.25rem;
    overflow: hidden;
  }

  .search-results {
    max-height: 400px;
    overflow-y: auto;
  }

  .search-results::-webkit-scrollbar {
    width: 8px;
  }

  .search-results::-webkit-scrollbar-track {
    background: transparent;
  }

  .search-results::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 4px;
  }

  .search-results::-webkit-scrollbar-thumb:hover {
    background: var(--text-tertiary);
  }

  .search-result-item {
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .search-result-item:last-child {
    border-bottom: none;
  }

  .search-result-item:hover,
  .search-result-item.selected {
    background: var(--bg-secondary);
  }

  .result-title {
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
  }

  .result-snippet {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-bottom: 0.375rem;
    line-height: 1.4;
    /* Truncate long snippets */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Highlight matched text in snippets */
  .result-snippet :global(mark) {
    background: var(--accent-secondary-alpha);
    color: var(--accent-primary);
    padding: 0.1em 0.2em;
    border-radius: 0.2em;
    font-weight: 500;
  }

  .result-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .result-path {
    font-size: 0.7rem;
    color: var(--text-tertiary);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-type {
    font-size: 0.625rem;
    color: var(--accent-primary);
    background: var(--accent-secondary-alpha);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    flex-shrink: 0;
  }

  .loading-placeholder {
    padding: 1rem;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.875rem;
  }

  @media (max-width: 768px) {
    .action-bar-container {
      max-width: 200px;
      min-width: 150px;
    }

    .action-bar-input {
      font-size: 0.8rem;
      padding: 0.4rem 2rem 0.4rem 2rem;
    }

    .search-icon {
      left: 0.6rem;
      width: 0.9rem;
      height: 0.9rem;
    }
  }
</style>
