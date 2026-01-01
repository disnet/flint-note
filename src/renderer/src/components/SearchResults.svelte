<script lang="ts">
  /**
   * Enhanced search results component with highlighting
   */
  import { SvelteMap } from 'svelte/reactivity';
  import type {
    NoteMetadata,
    SearchResult,
    EnhancedSearchResult,
    TextSegment
  } from '../lib/automerge';
  import { highlightMatch, getNoteType } from '../lib/automerge';

  type AnySearchResult = SearchResult | EnhancedSearchResult;

  interface Props {
    results: AnySearchResult[];
    onSelect: (note: NoteMetadata) => void;
    maxResults?: number;
    selectedIndex?: number;
    isLoading?: boolean;
  }

  let {
    results,
    onSelect,
    maxResults = 10,
    selectedIndex = -1,
    isLoading = false
  }: Props = $props();

  // Track element refs for scrolling
  let itemElements = new SvelteMap<number, HTMLElement>();

  // Action to register element refs
  function registerElement(node: HTMLElement, index: number): { destroy: () => void } {
    itemElements.set(index, node);
    return {
      destroy() {
        itemElements.delete(index);
      }
    };
  }

  // Scroll selected item into view when selectedIndex changes
  $effect(() => {
    if (selectedIndex >= 0) {
      const element = itemElements.get(selectedIndex);
      if (element) {
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  });

  function isEnhancedResult(result: AnySearchResult): result is EnhancedSearchResult {
    return 'isContentMatch' in result;
  }

  const displayResults = $derived(results.slice(0, maxResults));

  /**
   * Render segments with highlighting
   */
  function renderSegments(segments: TextSegment[]): string {
    return segments
      .map((seg) =>
        seg.highlight
          ? `<mark class="search-highlight">${escapeHtml(seg.text)}</mark>`
          : escapeHtml(seg.text)
      )
      .join('');
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Get the best match preview for a result
   * Returns the content snippet with highlighted matches
   */
  function getPreview(result: AnySearchResult): string {
    if (result.contentMatches.length > 0) {
      const match = result.contentMatches[0];
      const segments = highlightMatch(match);
      return renderSegments(segments);
    }
    return '';
  }

  /**
   * Check if we should show the preview section
   * Show preview if we have content matches (snippets)
   */
  function hasPreview(result: AnySearchResult): boolean {
    return result.contentMatches.length > 0;
  }

  /**
   * Get note type icon and name
   * Always looks up current note type from state to ensure fresh data
   */
  function getNoteTypeInfo(result: AnySearchResult): { icon: string; name: string } {
    // Always look up current note type from state for fresh data
    const currentType = getNoteType(result.note.type);
    if (currentType) {
      return { icon: currentType.icon, name: currentType.name };
    }
    // Fallback to cached matchedType if state lookup fails
    if (result.matchedType) {
      return { icon: result.matchedType.icon, name: result.matchedType.name };
    }
    return { icon: '📝', name: 'Note' };
  }
</script>

<div class="search-results-container">
  {#if isLoading}
    <div class="search-loading">
      <span class="loading-spinner"></span>
      Searching content...
    </div>
  {/if}
  {#each displayResults as result, index (result.note.id)}
    <button
      use:registerElement={index}
      class="search-result-item"
      class:selected={index === selectedIndex}
      onclick={() => onSelect(result.note)}
    >
      <div class="result-icon">{getNoteTypeInfo(result).icon}</div>
      <div class="result-content">
        <div class="result-header">
          <span class="result-title">{result.note.title || 'Untitled'}</span>
          {#if isEnhancedResult(result) && result.isContentMatch}
            <span class="content-match-badge">Content</span>
          {/if}
          <span class="result-type">{getNoteTypeInfo(result).name}</span>
        </div>
        {#if hasPreview(result)}
          <div class="result-preview">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html getPreview(result)}
          </div>
        {/if}
        {#if result.contentMatches.length > 1}
          <div class="result-match-count">
            +{result.contentMatches.length - 1} more match{result.contentMatches.length >
            2
              ? 'es'
              : ''}
          </div>
        {/if}
      </div>
    </button>
  {/each}
  {#if results.length > maxResults}
    <div class="results-overflow">
      Showing {maxResults} of {results.length} results
    </div>
  {/if}
  {#if results.length === 0}
    <div class="no-results">No matching notes found</div>
  {/if}
</div>

<style>
  .search-results-container {
    display: flex;
    flex-direction: column;
  }

  .search-result-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
    border-bottom: 1px solid var(--border-light);
    transition: background-color 0.15s ease;
  }

  .search-result-item:hover {
    background: var(--bg-hover);
  }

  .search-result-item.selected {
    background: var(--accent-light);
  }

  .search-result-item:last-of-type {
    border-bottom: none;
  }

  .result-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
    padding-top: 0.125rem;
  }

  .result-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }

  .result-title {
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-type {
    font-size: 0.7rem;
    color: var(--text-muted);
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .content-match-badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: var(--accent-light, #e0f2fe);
    color: var(--accent-primary, #0284c7);
    border-radius: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
    flex-shrink: 0;
  }

  :global([data-theme='dark']) .content-match-badge {
    background: var(--accent-light-dark, #1e3a5f);
    color: var(--accent-primary-dark, #38bdf8);
  }

  .search-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .loading-spinner {
    width: 12px;
    height: 12px;
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

  .result-preview {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .result-preview :global(.search-highlight) {
    background-color: var(--highlight-bg, #fef08a);
    color: var(--highlight-text, #713f12);
    padding: 0 0.125rem;
    border-radius: 0.125rem;
    font-weight: 500;
  }

  :global([data-theme='dark']) .result-preview :global(.search-highlight) {
    background-color: var(--highlight-bg-dark, #854d0e);
    color: var(--highlight-text-dark, #fef9c3);
  }

  .result-match-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .results-overflow {
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
    border-top: 1px solid var(--border-light);
  }

  .no-results {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
