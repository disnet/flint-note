<script lang="ts">
  /**
   * Enhanced search results component with highlighting
   */
  import type { NoteMetadata, SearchResult, TextSegment } from '../lib/automerge';
  import { highlightMatch } from '../lib/automerge';

  interface Props {
    results: SearchResult[];
    onSelect: (note: NoteMetadata) => void;
    maxResults?: number;
  }

  let { results, onSelect, maxResults = 10 }: Props = $props();

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
   */
  function getPreview(result: SearchResult): string {
    // Prefer content matches for preview (currently disabled)
    if (result.contentMatches.length > 0) {
      const match = result.contentMatches[0];
      const segments = highlightMatch(match);
      return renderSegments(segments);
    }
    // Fall back to title match
    if (result.titleMatches.length > 0) {
      const match = result.titleMatches[0];
      const segments = highlightMatch(match);
      return renderSegments(segments);
    }
    // No matches to highlight, just show title
    return escapeHtml(result.note.title || 'Untitled');
  }

  /**
   * Get note type icon and name
   */
  function getNoteTypeInfo(result: SearchResult): { icon: string; name: string } {
    if (result.matchedType) {
      return { icon: result.matchedType.icon, name: result.matchedType.name };
    }
    return { icon: '📝', name: 'Note' };
  }
</script>

<div class="search-results-container">
  {#each displayResults as result (result.note.id)}
    <button class="search-result-item" onclick={() => onSelect(result.note)}>
      <div class="result-icon">{getNoteTypeInfo(result).icon}</div>
      <div class="result-content">
        <div class="result-header">
          <span class="result-title">{result.note.title || 'Untitled'}</span>
          <span class="result-type">{getNoteTypeInfo(result).name}</span>
        </div>
        <div class="result-preview">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html getPreview(result)}
        </div>
        {#if result.contentMatches.length > 1}
          <div class="result-match-count">
            +{result.contentMatches.length - 1} more match{result.contentMatches.length >
            2
              ? 'es'
              : ''}
          </div>
        {/if}
      </div>
      <div class="result-score" title="Relevance score">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          />
        </svg>
        {result.score}
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

  .result-score {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .result-score svg {
    opacity: 0.5;
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
