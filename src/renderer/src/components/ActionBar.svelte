<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { searchActions, type Action } from '../services/actionRegistry.svelte';
  import { navigationHistoryStore } from '../stores/navigationHistoryStore.svelte';

  interface SearchResult {
    id: string;
    title: string;
    snippet: string;
    type?: string;
    filename?: string;
  }

  // Mode switcher items for keyboard navigation
  interface ModeSwitcher {
    id: string;
    itemType: 'mode-switcher';
    targetMode: '/' | '@';
    label: string;
  }

  type SelectableItem = SearchResult | Action | ModeSwitcher;

  const modeSwitchers: ModeSwitcher[] = [
    {
      id: 'mode-actions',
      itemType: 'mode-switcher',
      targetMode: '/',
      label: 'Search Actions & Commands'
    },
    {
      id: 'mode-agent',
      itemType: 'mode-switcher',
      targetMode: '@',
      label: 'Chat with Agent'
    }
  ];

  interface ActionBarProps {
    onNoteSelect?: (note: NoteMetadata) => void;
    onExecuteAction?: (actionId: string) => void;
  }

  let { onNoteSelect, onExecuteAction }: ActionBarProps = $props();

  // Mode: 'search' (default), 'actions' (/ prefix), 'agent' (@ prefix)
  type Mode = 'search' | 'actions' | 'agent';

  let inputValue = $state('');
  let isInputFocused = $state(false);
  let selectedIndex = $state(-1);

  // Derive mode from input prefix
  const mode = $derived.by((): Mode => {
    if (inputValue.startsWith('/')) return 'actions';
    if (inputValue.startsWith('@')) return 'agent';
    return 'search';
  });

  // Get the actual query without the mode prefix
  const query = $derived.by(() => {
    if (mode === 'actions') return inputValue.slice(1);
    if (mode === 'agent') return inputValue.slice(1);
    return inputValue;
  });

  // Search results from FTS API (for search mode)
  let ftsResults: SearchResult[] = $state([]);
  // Track which query the current FTS results are for
  let ftsResultsQuery = $state('');

  // Derive loading state synchronously - we're loading if query >= 3 and results don't match current query
  const isLoading = $derived(
    mode === 'search' && query.trim().length >= 3 && ftsResultsQuery !== query.trim()
  );

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Platform-specific keyboard shortcut display
  const isMacOS = $derived(navigator.platform.includes('Mac'));
  const shortcutKey = $derived(isMacOS ? '⌘K' : 'Ctrl+K');

  // Placeholder changes based on mode
  const placeholder = $derived.by(() => {
    if (mode === 'actions') return 'Search actions...';
    if (mode === 'agent') return 'Ask the agent...';
    return `Search notes... (${shortcutKey})`;
  });

  // Actions filtered by query (for actions mode)
  const filteredActions = $derived.by(() => {
    if (mode !== 'actions') return [];
    return searchActions(query.trim());
  });

  // Recent notes for empty search state (based on recently opened, not modified)
  const recentNotes = $derived.by(() => {
    const allNotes = notesStore.notes;
    if (allNotes.length === 0) return [];

    // Get recently opened notes from navigation history
    const recentEntries = navigationHistoryStore.getRecentNotes(5);

    // Map to SearchResult format, looking up full metadata from notesStore
    const results: SearchResult[] = [];
    for (const entry of recentEntries) {
      const note = allNotes.find((n) => n.id === entry.noteId);
      if (note) {
        results.push({
          id: note.id,
          title: note.title || 'Untitled',
          snippet: '',
          type: note.type,
          filename: note.filename
        });
      }
    }

    return results;
  });

  // Quick client-side title filter (for search mode, used as fallback while FTS loads)
  const quickResults = $derived.by(() => {
    if (mode !== 'search') return [];
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    const allNotes = notesStore.notes;
    if (allNotes.length === 0) {
      return [];
    }

    return allNotes
      .filter(
        (note) =>
          note.title.toLowerCase().includes(q) || note.filename.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        if (aTitle.startsWith(q) && !bTitle.startsWith(q)) return -1;
        if (bTitle.startsWith(q) && !aTitle.startsWith(q)) return 1;
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

  // Combined results: merge quick title matches with FTS content matches (search mode only)
  const searchResults = $derived.by(() => {
    if (mode !== 'search') return [];
    const q = query.trim();
    if (!q) return [];

    // For short queries, just use quick results
    if (q.length < 3) return quickResults;

    // For longer queries, merge quick results (title matches) with FTS results (content matches)
    // FTS results take priority since they have snippets
    if (isLoading) return quickResults; // Show quick results while FTS is loading

    // Merge: title matches first, then FTS content matches
    const quickIds = new Set(quickResults.map((r) => r.id));
    const contentOnlyMatches = ftsResults.filter((r) => !quickIds.has(r.id));

    // Title matches first, then content-only matches (with snippets)
    return [...quickResults, ...contentOnlyMatches].slice(0, 15);
  });

  // Trigger FTS search when query is 3+ chars (search mode only)
  $effect(() => {
    const currentMode = mode;
    const q = query.trim();

    // Cancel any pending search
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Only run FTS in search mode
    if (currentMode !== 'search' || q.length < 3) {
      // Clear FTS results
      ftsResults = [];
      ftsResultsQuery = '';
      return;
    }

    // Debounce the API call
    debounceTimer = setTimeout(async () => {
      try {
        const response = await window.api?.searchNotes({
          query: q,
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
        ftsResultsQuery = q;
      } catch (error) {
        console.error('Search error:', error);
        ftsResults = [];
        ftsResultsQuery = q; // Still mark as completed even on error
      }
    }, 200);
  });

  // Whether we're showing empty state (no query entered)
  const isEmptyState = $derived(query.trim().length === 0);

  // Get all selectable items based on mode (includes mode switchers in empty search state)
  const allSelectableItems = $derived.by((): SelectableItem[] => {
    if (mode === 'actions') {
      // Show all actions when empty, filtered when searching
      return isEmptyState ? searchActions('') : filteredActions;
    }
    if (mode === 'search') {
      if (isEmptyState) {
        // In empty state: mode switchers + recent notes
        return [...modeSwitchers, ...recentNotes];
      }
      return searchResults;
    }
    return []; // agent mode - no items yet
  });

  // Helper to check if an item is a mode switcher
  function isModeSwitcher(item: SelectableItem): item is ModeSwitcher {
    return 'itemType' in item && item.itemType === 'mode-switcher';
  }

  // Index where recent notes start (after mode switchers)
  const recentNotesStartIndex = $derived(
    mode === 'search' && isEmptyState ? modeSwitchers.length : 0
  );

  // Auto-select first recent note when in empty state, otherwise first item
  $effect(() => {
    if (allSelectableItems.length > 0) {
      // In empty search state, start selection at first recent note (if any)
      if (mode === 'search' && isEmptyState && recentNotes.length > 0) {
        selectedIndex = recentNotesStartIndex;
      } else {
        selectedIndex = 0;
      }
    } else {
      selectedIndex = -1;
    }
  });

  function handleInputFocus(): void {
    isInputFocused = true;
    // Reset selection to appropriate starting position
    if (mode === 'search' && isEmptyState && recentNotes.length > 0) {
      selectedIndex = recentNotesStartIndex;
    } else if (allSelectableItems.length > 0) {
      selectedIndex = 0;
    } else {
      selectedIndex = -1;
    }
  }

  function handleInputBlur(): void {
    setTimeout(() => {
      isInputFocused = false;
    }, 200);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const items = allSelectableItems;

    if (
      event.key === 'ArrowDown' ||
      (event.key === 'n' && (event.ctrlKey || event.metaKey))
    ) {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    } else if (
      event.key === 'ArrowUp' ||
      (event.key === 'p' && (event.ctrlKey || event.metaKey))
    ) {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedIndex >= 0 && items[selectedIndex]) {
        const item = items[selectedIndex];
        if (isModeSwitcher(item)) {
          // Switch to the target mode
          inputValue = item.targetMode;
        } else if (mode === 'actions') {
          executeAction(item as Action);
        } else if (mode === 'search') {
          selectResult(item as SearchResult);
        }
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      clearInput();
      (event.target as HTMLInputElement).blur();
    }
  }

  function blurInput(): void {
    const input = document.getElementById('action-bar-input');
    input?.blur();
  }

  function selectResult(result: SearchResult): void {
    // Find the full note metadata to pass to onNoteSelect
    const note = notesStore.notes.find((n) => n.id === result.id);
    if (note) {
      clearInput();
      blurInput();
      onNoteSelect?.(note);
    }
  }

  function executeAction(action: Action): void {
    clearInput();
    blurInput();
    // Execute the action
    action.execute();
    // Also notify parent if needed
    onExecuteAction?.(action.id);
  }

  function clearInput(): void {
    inputValue = '';
    selectedIndex = -1;
    ftsResults = [];
    ftsResultsQuery = '';
  }

  function handleClearClick(): void {
    clearInput();
    // Re-focus the input after clearing
    const input = document.getElementById('action-bar-input');
    input?.focus();
  }
</script>

<div class="action-bar-container" class:dropdown-open={isInputFocused}>
  <div class="action-bar-input-wrapper">
    <!-- Icon changes based on mode -->
    {#if mode === 'actions'}
      <svg class="mode-icon" viewBox="0 0 20 20" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    {:else if mode === 'agent'}
      <svg class="mode-icon" viewBox="0 0 20 20" fill="currentColor">
        <path
          d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"
        />
      </svg>
    {:else}
      <svg class="mode-icon" viewBox="0 0 20 20" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
          clip-rule="evenodd"
        />
      </svg>
    {/if}
    <input
      id="action-bar-input"
      type="text"
      {placeholder}
      bind:value={inputValue}
      onfocus={handleInputFocus}
      onblur={handleInputBlur}
      onkeydown={handleKeyDown}
      class="action-bar-input"
    />
    {#if inputValue}
      <button class="clear-button" onclick={handleClearClick} aria-label="Clear input">
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

  {#if isInputFocused}
    <div class="action-bar-dropdown">
      <!-- Search mode -->
      {#if mode === 'search'}
        {#if isEmptyState}
          <!-- Empty state: mode switchers and recent notes -->
          <div class="mode-switchers">
            <button
              class="mode-switch-item"
              class:selected={selectedIndex === 0}
              onclick={() => {
                inputValue = '/';
              }}
            >
              <span class="mode-switch-label">Search Actions & Commands</span>
              <span class="mode-switch-key">/</span>
            </button>
            <button
              class="mode-switch-item"
              class:selected={selectedIndex === 1}
              onclick={() => {
                inputValue = '@';
              }}
            >
              <span class="mode-switch-label">Chat with Agent</span>
              <span class="mode-switch-key">@</span>
            </button>
          </div>
          {#if recentNotes.length > 0}
            <div class="section-header">Recent Notes</div>
            <div class="search-results">
              {#each recentNotes as result, index (result.id)}
                <button
                  class="search-result-item"
                  class:selected={index + recentNotesStartIndex === selectedIndex}
                  onclick={() => selectResult(result)}
                >
                  <div class="result-title">
                    {result.title || 'Untitled'}
                  </div>
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
          {/if}
        {:else if searchResults.length > 0}
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
            {#if query.trim().length >= 3 && isLoading}
              Searching...
            {:else}
              No results
            {/if}
          </div>
        {/if}

        <!-- Actions mode -->
      {:else if mode === 'actions'}
        {#if isEmptyState}
          <div class="section-header">All Actions</div>
        {/if}
        {#if allSelectableItems.length > 0}
          <div class="action-results">
            {#each allSelectableItems as item, index (item.id)}
              {@const action = item as Action}
              <button
                class="action-item"
                class:selected={index === selectedIndex}
                onclick={() => executeAction(action)}
              >
                <div class="action-main">
                  <span class="action-label">{action.label}</span>
                  {#if action.shortcut}
                    <span class="action-shortcut">{action.shortcut}</span>
                  {/if}
                </div>
                {#if action.description}
                  <div class="action-description">{action.description}</div>
                {/if}
                <div class="action-meta">
                  <span class="action-category">{action.category}</span>
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="loading-placeholder">No matching actions</div>
        {/if}

        <!-- Agent mode (placeholder for now) -->
      {:else if mode === 'agent'}
        <div class="agent-placeholder">
          <div class="agent-message">Agent mode coming soon...</div>
          <div class="agent-hint">Type your question and press Enter</div>
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

  /* Unified container styling when dropdown is open */
  .action-bar-container.dropdown-open {
    border-radius: 0.5rem;
    box-shadow:
      0 10px 25px rgba(0, 0, 0, 0.2),
      0 4px 10px rgba(0, 0, 0, 0.1);
  }

  .action-bar-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .mode-icon {
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
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    height: 32px;
  }

  .action-bar-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  /* When dropdown is open, connect input to dropdown */
  .dropdown-open .action-bar-input {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom: none;
    box-shadow: none;
  }

  .dropdown-open .action-bar-input:focus {
    box-shadow: none;
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
    border: 1px solid var(--accent-primary);
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    border-bottom-left-radius: 0.5rem;
    border-bottom-right-radius: 0.5rem;
    box-shadow: none;
    z-index: 1001;
    margin-top: 0;
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

  /* Mode switchers for empty state */
  .mode-switchers {
    border-bottom: 1px solid var(--border-light);
  }

  .mode-switch-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 1rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .mode-switch-item:last-child {
    border-bottom: none;
  }

  .mode-switch-item:hover,
  .mode-switch-item.selected {
    background: var(--bg-secondary);
  }

  .mode-switch-label {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .mode-switch-key {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent-primary);
    background: var(--accent-secondary-alpha);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-family: var(--font-mono, monospace);
  }

  .section-header {
    padding: 0.5rem 1rem;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
  }

  /* Actions mode styles */
  .action-results {
    max-height: 400px;
    overflow-y: auto;
  }

  .action-results::-webkit-scrollbar {
    width: 8px;
  }

  .action-results::-webkit-scrollbar-track {
    background: transparent;
  }

  .action-results::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 4px;
  }

  .action-results::-webkit-scrollbar-thumb:hover {
    background: var(--text-tertiary);
  }

  .action-item {
    width: 100%;
    padding: 0.625rem 1rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .action-item:last-child {
    border-bottom: none;
  }

  .action-item:hover,
  .action-item.selected {
    background: var(--bg-secondary);
  }

  .action-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .action-label {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .action-shortcut {
    font-size: 0.7rem;
    color: var(--text-tertiary);
    background: var(--bg-tertiary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-family: var(--font-mono, monospace);
    flex-shrink: 0;
  }

  .action-description {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
    line-height: 1.3;
  }

  .action-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .action-category {
    font-size: 0.625rem;
    color: var(--accent-primary);
    background: var(--accent-secondary-alpha);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  /* Agent mode styles */
  .agent-placeholder {
    padding: 1.5rem 1rem;
    text-align: center;
  }

  .agent-message {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  .agent-hint {
    color: var(--text-tertiary);
    font-size: 0.75rem;
  }

  /* Mode toggle footer */
  .mode-toggle-footer {
    display: flex;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.5rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .mode-toggle-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-toggle-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .mode-toggle-btn.active {
    background: var(--accent-secondary-alpha);
    color: var(--accent-primary);
  }

  .mode-toggle-icon {
    width: 0.75rem;
    height: 0.75rem;
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

    .mode-icon {
      left: 0.6rem;
      width: 0.9rem;
      height: 0.9rem;
    }
  }
</style>
