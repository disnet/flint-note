<script lang="ts">
  import type { PdfHighlight } from './types';

  let {
    highlights = [],
    onNavigate = (_pageNumber: number) => {},
    onDelete = (_id: string) => {},
    onClose = () => {}
  }: {
    highlights: PdfHighlight[];
    onNavigate?: (pageNumber: number) => void;
    onDelete?: (id: string) => void;
    onClose?: () => void;
  } = $props();

  function formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  // Sort highlights by page number, then by startOffset
  let sortedHighlights = $derived(
    [...highlights].sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) {
        return a.pageNumber - b.pageNumber;
      }
      return a.startOffset - b.startOffset;
    })
  );
</script>

<div class="pdf-highlights">
  <div class="highlights-header">
    <h3>Highlights ({highlights.length})</h3>
    <button class="close-button" onclick={onClose} aria-label="Close highlights panel">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 4L12 12M4 12L12 4"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>

  <div class="highlights-content">
    {#if highlights.length === 0}
      <p class="empty-highlights">
        No highlights yet. Select text in the PDF to highlight it.
      </p>
    {:else}
      <ul class="highlights-list">
        {#each sortedHighlights as highlight (highlight.id)}
          <li class="highlight-item">
            <button
              class="highlight-text"
              onclick={() => onNavigate(highlight.pageNumber)}
            >
              "{highlight.text}"
            </button>
            <div class="highlight-meta">
              <span class="highlight-page">Page {highlight.pageNumber}</span>
              <span class="highlight-date">{formatDate(highlight.createdAt)}</span>
              <button
                class="delete-button"
                onclick={() => onDelete(highlight.id)}
                aria-label="Delete highlight"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 4H12M5 4V3C5 2.44772 5.44772 2 6 2H8C8.55228 2 9 2.44772 9 3V4M11 4V11C11 11.5523 10.5523 12 10 12H4C3.44772 12 3 11.5523 3 11V4"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .pdf-highlights {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary, #fff);
    border-right: 1px solid var(--border-light, #e0e0e0);
  }

  .highlights-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border-light, #e0e0e0);
  }

  .highlights-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  .close-button {
    padding: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary, #666);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-button:hover {
    background: var(--bg-secondary, #f5f5f5);
    color: var(--text-primary, #333);
  }

  .highlights-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .empty-highlights {
    padding: 1rem;
    color: var(--text-muted, #999);
    font-style: italic;
    text-align: center;
    font-size: 0.875rem;
  }

  .highlights-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .highlight-item {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-light, #e0e0e0);
  }

  .highlight-item:last-child {
    border-bottom: none;
  }

  .highlight-text {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0;
    margin: 0 0 0.5rem 0;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--text-primary, #333);
    font-style: italic;
  }

  .highlight-text:hover {
    color: var(--accent-primary, #007bff);
  }

  .highlight-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .highlight-page {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
    font-weight: 500;
  }

  .highlight-date {
    font-size: 0.75rem;
    color: var(--text-muted, #999);
    flex: 1;
  }

  .delete-button {
    padding: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted, #999);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition:
      opacity 0.15s ease,
      color 0.15s ease;
  }

  .delete-button:hover {
    opacity: 1;
    color: var(--error-color, #dc3545);
  }
</style>
