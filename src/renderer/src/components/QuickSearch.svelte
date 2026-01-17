<script lang="ts">
  /**
   * Quick search modal that appears when Cmd/Ctrl+K is pressed
   * and the sidebar is closed
   */
  import SearchResults from './SearchResults.svelte';
  import { scrollable } from '../lib/scrollable.svelte';
  import type {
    NoteMetadata,
    SearchResult,
    EnhancedSearchResult
  } from '../lib/automerge';

  interface Props {
    isOpen: boolean;
    searchQuery: string;
    searchResults: (SearchResult | EnhancedSearchResult)[];
    selectedSearchIndex: number;
    isShowingRecent: boolean;
    isSearchingContent: boolean;
    onClose: () => void;
    onSearchChange: (query: string) => void;
    onSearchResultSelect: (note: NoteMetadata) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    onViewAllResults: () => void;
  }

  let {
    isOpen,
    searchQuery,
    searchResults,
    selectedSearchIndex,
    isShowingRecent,
    isSearchingContent,
    onClose,
    onSearchChange,
    onSearchResultSelect,
    onKeyDown,
    onViewAllResults
  }: Props = $props();

  let inputElement = $state<HTMLInputElement | null>(null);

  // Focus input when modal opens
  $effect(() => {
    if (isOpen && inputElement) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        inputElement?.focus();
      }, 10);
    }
  });

  // Detect platform for shortcut display
  const isMac = navigator.platform.startsWith('Mac');
  const modifierKey = isMac ? '⌘' : 'Ctrl';

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    // Forward other keyboard events to parent handler
    onKeyDown(event);

    // Close modal after Enter selection (parent handler processes the selection)
    // But NOT for Cmd/Ctrl+Shift+Enter (view all) or Cmd/Ctrl+Enter (add to shelf)
    if (
      event.key === 'Enter' &&
      searchResults.length > 0 &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      onClose();
    }
  }

  function handleOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleResultSelect(note: NoteMetadata): void {
    onSearchResultSelect(note);
    onClose();
  }

  function handleViewAll(): void {
    onViewAllResults();
    // Note: don't call onClose() here - onViewAllResults handles closing the modal
    // while preserving the search query for the expanded view
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="quick-search-overlay"
    onclick={handleOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="quick-search-modal" onclick={(e) => e.stopPropagation()}>
      <div class="search-input-wrapper">
        <svg
          class="search-icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.3-4.3"></path>
        </svg>
        <input
          bind:this={inputElement}
          type="text"
          class="search-input"
          placeholder="Search notes..."
          value={searchQuery}
          oninput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
          onkeydown={handleKeyDown}
        />
        {#if searchQuery.trim()}
          <button class="shortcut-hint shortcut-hint-btn" onclick={handleViewAll}>
            {modifierKey}⇧↵ show all
          </button>
        {:else}
          <div class="shortcut-hint">{modifierKey}O</div>
        {/if}
      </div>

      {#if searchQuery.trim() || searchResults.length > 0}
        <div class="search-results-container scrollable" use:scrollable>
          {#if searchResults.length > 0}
            {#if isShowingRecent}
              <div class="results-header">Recent</div>
            {/if}
            <SearchResults
              results={searchResults}
              onSelect={handleResultSelect}
              maxResults={8}
              selectedIndex={selectedSearchIndex}
              isLoading={isSearchingContent}
              showKeyboardHints={true}
            />
            {#if searchResults.length > 8 && !isShowingRecent}
              <button class="view-all-btn" onclick={handleViewAll}>
                View all {searchResults.length} results (Enter)
              </button>
            {/if}
          {:else if searchQuery.trim()}
            <div class="no-results">No matching notes found for "{searchQuery}"</div>
          {:else}
            <div class="no-results">No recent notes</div>
          {/if}
        </div>
      {:else}
        <div class="empty-state">
          <p>Type to search your notes</p>
          <div class="keyboard-hints">
            <span class="hint"><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span class="hint"><kbd>Enter</kbd> Open</span>
            <span class="hint"><kbd>{modifierKey}</kbd><kbd>Enter</kbd> Add to Shelf</span
            >
            <span class="hint"
              ><kbd>{modifierKey}</kbd><kbd>Shift</kbd><kbd>Enter</kbd> Expanded View</span
            >
            <span class="hint"><kbd>Esc</kbd> Close</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .quick-search-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .quick-search-modal {
    background: var(--bg-primary);
    border-radius: 0.75rem;
    box-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.25),
      0 0 0 1px var(--border-medium);
    width: 100%;
    max-width: 560px;
    overflow: hidden;
    animation: slideDown 0.15s ease-out;
    display: flex;
    flex-direction: column;
    max-height: 70vh;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .search-icon {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 1.125rem;
    outline: none;
    padding: 0;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .shortcut-hint {
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
    flex-shrink: 0;
  }

  .shortcut-hint-btn {
    cursor: pointer;
    font-family: inherit;
    transition: background-color 0.15s ease;
  }

  .shortcut-hint-btn:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .search-results-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .results-header {
    padding: 0.625rem 1rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .view-all-btn {
    width: 100%;
    padding: 0.75rem;
    border: none;
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    text-align: center;
  }

  .view-all-btn:hover {
    background: var(--bg-hover);
  }

  .no-results {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .empty-state {
    padding: 2rem 1rem;
    text-align: center;
  }

  .empty-state p {
    margin: 0 0 1rem;
    color: var(--text-secondary);
    font-size: 0.9375rem;
  }

  .keyboard-hints {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .hint {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .hint kbd {
    padding: 0.125rem 0.375rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    font-family: inherit;
    font-size: 0.6875rem;
  }
</style>
