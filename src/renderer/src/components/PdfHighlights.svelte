<script lang="ts">
  /**
   * PDF Highlights List Component
   *
   * Displays all highlights in a PDF with navigation and delete functionality.
   */

  import type { PdfHighlight } from '../lib/automerge';

  // Props
  let {
    highlights,
    onNavigate = (_pageNumber: number) => {},
    onDelete = (_id: string) => {}
  }: {
    highlights: PdfHighlight[];
    onNavigate?: (pageNumber: number) => void;
    onDelete?: (id: string) => void;
  } = $props();

  // Sort highlights by page number, then by creation time
  const sortedHighlights = $derived(
    [...highlights].sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) {
        return a.pageNumber - b.pageNumber;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
  );

  // Format relative time
  function formatRelativeTime(dateString: string): string {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours === 0) {
          const diffMins = Math.floor(diffMs / (1000 * 60));
          if (diffMins <= 1) return 'just now';
          return `${diffMins}m ago`;
        }
        return `${diffHours}h ago`;
      } else if (diffDays === 1) {
        return 'yesterday';
      } else if (diffDays < 7) {
        return `${diffDays}d ago`;
      } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks}w ago`;
      } else {
        return date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        });
      }
    } catch {
      return '';
    }
  }

  // Truncate text for display
  function truncateText(text: string, maxLength: number = 150): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  }
</script>

<div class="pdf-highlights">
  <div class="highlights-header">
    <h3>Highlights</h3>
    {#if highlights.length > 0}
      <span class="highlights-count">{highlights.length}</span>
    {/if}
  </div>

  {#if highlights.length === 0}
    <div class="empty-highlights">
      <p>No highlights yet</p>
      <p class="hint">Select text to create highlights</p>
    </div>
  {:else}
    <div class="highlights-list">
      {#each sortedHighlights as highlight (highlight.id)}
        <div class="highlight-item">
          <button
            class="highlight-content"
            onclick={() => onNavigate(highlight.pageNumber)}
            title="Go to page {highlight.pageNumber}"
          >
            <span class="highlight-text">"{truncateText(highlight.text)}"</span>
            <div class="highlight-meta">
              <span class="highlight-page">Page {highlight.pageNumber}</span>
              {#if formatRelativeTime(highlight.createdAt)}
                <span class="highlight-time"
                  >{formatRelativeTime(highlight.createdAt)}</span
                >
              {/if}
            </div>
          </button>
          <button
            class="delete-button"
            onclick={() => onDelete(highlight.id)}
            title="Delete highlight"
          >
            <svg
              width="14"
              height="14"
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
      {/each}
    </div>
  {/if}
</div>

<style>
  .pdf-highlights {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .highlights-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    border-bottom: 1px solid var(--border-light, #e0e0e0);
    flex-shrink: 0;
  }

  .highlights-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  .highlights-count {
    padding: 2px 8px;
    background: var(--accent-bg, rgba(0, 123, 255, 0.1));
    color: var(--accent-primary, #007bff);
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .empty-highlights {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: var(--text-muted, #999);
  }

  .empty-highlights p {
    margin: 0;
  }

  .empty-highlights .hint {
    font-size: 0.75rem;
    margin-top: 0.5rem;
  }

  .highlights-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .highlight-item {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    padding: 0.5rem;
    border-radius: 8px;
    transition: background-color 0.15s;
  }

  .highlight-item:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  }

  .highlight-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
  }

  .highlight-content:hover {
    background: var(--bg-secondary, #f5f5f5);
  }

  .highlight-text {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--text-primary, #333);
    font-style: italic;
    background: linear-gradient(
      to right,
      rgba(255, 235, 59, 0.3),
      rgba(255, 235, 59, 0.3)
    );
    padding: 2px 0;
    border-radius: 2px;
  }

  .highlight-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted, #999);
  }

  .highlight-page {
    padding: 2px 6px;
    background: var(--bg-tertiary, #f0f0f0);
    border-radius: 4px;
  }

  .delete-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-muted, #999);
    opacity: 0;
    transition:
      opacity 0.15s,
      background-color 0.15s,
      color 0.15s;
  }

  .highlight-item:hover .delete-button {
    opacity: 1;
  }

  .delete-button:hover {
    background: var(--error-bg, #ffebee);
    color: var(--error-color, #dc3545);
  }
</style>
