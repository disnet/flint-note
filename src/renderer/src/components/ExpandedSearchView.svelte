<script lang="ts">
  /**
   * Expanded Search View - shows all search results with all matches per note
   * in a collapsible format. Uses CodeMirror editors for each match line.
   */
  import { onMount, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type {
    NoteMetadata,
    NoteType,
    EnhancedSearchResult,
    WikilinkClickHandler
  } from '../lib/automerge';
  import {
    searchNotesAsync,
    searchIndex,
    getNoteContent,
    getNoteType,
    setActiveItem,
    createSavedSearch,
    updateSavedSearch,
    getSavedSearch
  } from '../lib/automerge';
  import SearchMatchEditor from './SearchMatchEditor.svelte';

  interface Props {
    searchQuery: string;
    allNotes: NoteMetadata[];
    noteTypes: Record<string, NoteType>;
    onClose: () => void;
    onSelect: (note: NoteMetadata) => void;
    /** Optional saved search ID when viewing an existing saved search */
    savedSearchId?: string;
  }

  let {
    searchQuery: initialQuery,
    allNotes,
    noteTypes,
    onClose,
    onSelect,
    savedSearchId
  }: Props = $props();

  /**
   * Handle wikilink click - navigate to the linked note
   */
  const handleWikilinkClick: WikilinkClickHandler = (targetId) => {
    setActiveItem({ type: 'note', id: targetId });
    onClose();
  };

  // State
  let expandedResults = $state<EnhancedSearchResult[]>([]);
  let isLoading = $state(true);
  let expandedNotes = new SvelteSet<string>();

  // Local editable query state
  let localQuery = $state(initialQuery);
  let searchInputRef = $state<HTMLInputElement | null>(null);

  // The query used for actual searching (debounced)
  let activeQuery = $state(initialQuery);

  // Track the previous initialQuery to detect prop changes
  let prevInitialQuery = $state(initialQuery);

  // Sync localQuery when the prop changes (e.g., new search from sidebar)
  $effect(() => {
    if (initialQuery !== prevInitialQuery) {
      localQuery = initialQuery;
      activeQuery = initialQuery;
      prevInitialQuery = initialQuery;
    }
  });

  // Debounce search query changes
  $effect(() => {
    const query = localQuery;
    const timer = setTimeout(() => {
      activeQuery = query;
    }, 200);
    return () => clearTimeout(timer);
  });

  // Check if this is a saved search
  const savedSearch = $derived(savedSearchId ? getSavedSearch(savedSearchId) : undefined);
  const isSaved = $derived(!!savedSearch);

  // Sync query changes to saved search (with debounce)
  $effect(() => {
    if (!savedSearchId || !activeQuery.trim()) return;

    // Capture values to use in timeout (avoid accessing reactive vars after cleanup)
    const searchId = savedSearchId;
    const query = activeQuery;
    // Generate title from query (same logic as createSavedSearch)
    const title = query.length > 50 ? query.slice(0, 47) + '...' : query;

    const timer = setTimeout(() => {
      // Update the saved search with new query and title
      updateSavedSearch(searchId, { query, title });
    }, 500);

    // Cleanup timer when effect re-runs or component unmounts
    return () => clearTimeout(timer);
  });

  /**
   * Save the current search as a new saved search
   */
  function handleSaveSearch(): void {
    if (!activeQuery.trim()) return;

    // Create a new saved search (title auto-generated from query)
    const id = createSavedSearch({ query: activeQuery });

    // Set as active item to show in sidebar
    setActiveItem({ type: 'saved-search', id });
  }

  // Focus the search input on mount
  onMount(() => {
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      searchInputRef?.focus();
      searchInputRef?.select();
    }, 50);
  });

  // Load results when activeQuery changes or when search index finishes building
  // Use untrack to prevent tracking allNotes/noteTypes props, which would cause
  // unnecessary re-runs when those props get new object references
  $effect(() => {
    // Track searchIndex.isBuilding - when it becomes false, re-run the search
    // This handles the case where saved search opens before index is ready
    void searchIndex.isBuilding;

    if (activeQuery.trim()) {
      untrack(() => loadExpandedResults());
    } else {
      expandedResults = [];
      isLoading = false;
    }
  });

  async function loadExpandedResults(): Promise<void> {
    isLoading = true;
    expandedNotes.clear();

    try {
      const results = await searchNotesAsync(
        allNotes,
        activeQuery,
        {
          noteTypes,
          contentLoader: getNoteContent,
          maxMatchesPerNote: 100,
          maxResults: 100
        },
        searchIndex
      );
      expandedResults = results;
      // Start with all results collapsed for performance
    } catch (error) {
      console.error('Error loading expanded search results:', error);
      expandedResults = [];
    }

    isLoading = false;
  }

  function toggleNote(noteId: string): void {
    if (expandedNotes.has(noteId)) {
      expandedNotes.delete(noteId);
    } else {
      expandedNotes.add(noteId);
    }
  }

  function handleNoteClick(note: NoteMetadata): void {
    onSelect(note);
  }

  function getNoteIcon(note: NoteMetadata): string {
    if (note.type) {
      const noteType = getNoteType(note.type);
      return noteType?.icon || '📝';
    }
    return '📝';
  }

  /**
   * Get total match count for a result
   */
  function getMatchCount(result: EnhancedSearchResult): number {
    return result.contentMatches.length + result.titleMatches.length;
  }
</script>

<div class="expanded-search-view">
  <!-- Header -->
  <div class="search-header">
    <div class="header-left">
      <div class="search-input-wrapper">
        <svg
          class="search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.3-4.3"></path>
        </svg>
        <input
          bind:this={searchInputRef}
          bind:value={localQuery}
          type="text"
          class="search-input"
          placeholder="Search..."
          aria-label="Search query"
        />
      </div>
      {#if !isLoading}
        <span class="result-count">{expandedResults.length} notes</span>
      {/if}
    </div>
    <div class="header-controls">
      {#if isSaved}
        <span class="saved-indicator" title="This search is saved">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>Saved</span>
        </span>
      {:else}
        <button
          class="save-btn"
          onclick={handleSaveSearch}
          title="Save search"
          aria-label="Save search"
          disabled={!activeQuery.trim()}
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
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>Save Search</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Results -->
  <div class="results-container">
    {#if isLoading}
      <div class="loading">
        <span class="loading-spinner"></span>
        Loading search results...
      </div>
    {:else if expandedResults.length === 0}
      <div class="no-results">No matching notes found</div>
    {:else}
      <div class="results-list">
        {#each expandedResults as result (result.note.id)}
          <div class="note-section">
            <!-- Note header row -->
            <button
              class="note-row"
              onclick={() => toggleNote(result.note.id)}
              aria-expanded={expandedNotes.has(result.note.id)}
            >
              <span
                class="disclosure-arrow"
                class:expanded={expandedNotes.has(result.note.id)}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </span>
              <span class="note-icon">{getNoteIcon(result.note)}</span>
              <span
                class="note-title"
                role="link"
                onclick={(e) => {
                  e.stopPropagation();
                  handleNoteClick(result.note);
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    handleNoteClick(result.note);
                  }
                }}
                tabindex="0"
              >
                {result.note.title || 'Untitled'}
              </span>
              <span class="row-spacer"></span>
              <span class="match-count"
                >{getMatchCount(result)} match{getMatchCount(result) !== 1
                  ? 'es'
                  : ''}</span
              >
            </button>

            <!-- Expanded matches -->
            {#if expandedNotes.has(result.note.id)}
              <div class="matches-list">
                {#each result.contentMatches as match, idx (idx)}
                  <div class="match-line">
                    <span class="line-gutter">|</span>
                    <SearchMatchEditor
                      noteId={result.note.id}
                      lineNumber={match.lineNumber}
                      searchQuery={activeQuery}
                      onWikilinkClick={handleWikilinkClick}
                    />
                  </div>
                {/each}
                {#if result.contentMatches.length === 0 && result.titleMatches.length > 0}
                  <div class="match-line title-match">
                    <span class="line-gutter">|</span>
                    <span class="match-context muted">Title match</span>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .expanded-search-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .search-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
    max-width: 400px;
    padding: 0.375rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    transition: border-color 0.15s ease;
  }

  .search-input-wrapper:focus-within {
    border-color: var(--accent-primary);
  }

  .search-icon {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .search-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-primary);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted);
    font-weight: 400;
  }

  .result-count {
    flex-shrink: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .save-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0 6px 12px;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px;
    font-size: 0.875rem;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .save-btn:hover:not(:disabled) {
    color: var(--accent-primary);
    background: var(--bg-hover);
  }

  .save-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .saved-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0 6px 12px;
    color: var(--accent-primary);
    font-size: 0.875rem;
  }

  /* Results container */
  .results-container {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--text-muted);
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
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

  .no-results {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
  }

  /* Note section */
  .note-section {
    margin-top: 0.25rem;
  }

  .note-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0.5rem 1rem;
    width: 100%;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    border-radius: 4px;
    transition: background 0.15s ease;
  }

  .note-row:hover {
    background: var(--bg-hover);
  }

  .disclosure-arrow {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    transition: transform 0.15s ease;
  }

  .disclosure-arrow.expanded {
    transform: rotate(90deg);
  }

  .note-icon {
    flex-shrink: 0;
    font-size: 14px;
    line-height: 1;
  }

  .note-title {
    color: var(--text-primary);
    font-size: 1rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .note-title:hover {
    text-decoration: underline;
    color: var(--accent-primary);
  }

  .row-spacer {
    flex: 1;
  }

  .match-count {
    flex-shrink: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* Matches list */
  .matches-list {
    padding: 0 1rem 0.5rem 2.75rem;
  }

  .match-line {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 0.25rem 0;
  }

  .line-gutter {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1.5;
    user-select: none;
    opacity: 0.5;
  }

  .match-context {
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
    word-break: break-word;
  }

  .match-context.muted {
    color: var(--text-muted);
    font-style: italic;
  }

  .match-context :global(.search-highlight) {
    background-color: var(--highlight-bg, #fef08a);
    color: var(--highlight-text, #713f12);
    padding: 0 0.125rem;
    border-radius: 0.125rem;
    font-weight: 500;
  }

  :global([data-theme='dark']) .match-context :global(.search-highlight) {
    background-color: var(--highlight-bg-dark, #854d0e);
    color: var(--highlight-text-dark, #fef9c3);
  }
</style>
