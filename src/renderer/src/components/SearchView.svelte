<script lang="ts">
  /**
   * Search View component - displays full search results
   * Used when activeSystemView is 'search'
   */
  import SearchResults from './SearchResults.svelte';
  import type {
    SearchResult,
    EnhancedSearchResult,
    NoteMetadata
  } from '../lib/automerge';

  interface Props {
    searchResults: (SearchResult | EnhancedSearchResult)[];
    searchQuery: string;
    isSearchingContent: boolean;
    onClose: () => void;
    onSelect: (note: NoteMetadata) => void;
  }

  const { searchResults, searchQuery, isSearchingContent, onClose, onSelect }: Props =
    $props();
</script>

<div class="search-view">
  <div class="search-view-header">
    <h2>Search Results ({searchResults.length})</h2>
    <span class="search-query-label">for "{searchQuery}"</span>
    <button class="close-search-btn" onclick={onClose} aria-label="Close search">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>
  <div class="search-view-content">
    <SearchResults
      results={searchResults}
      {onSelect}
      maxResults={50}
      isLoading={isSearchingContent}
    />
  </div>
</div>

<style>
  .search-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .search-view-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .search-view-header h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .search-query-label {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .close-search-btn {
    margin-left: auto;
    padding: 0.375rem;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-search-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .search-view-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }
</style>
