<script lang="ts">
  import type { EpubHighlight } from '../lib/automerge';

  // Props
  let {
    highlights = [],
    onNavigate = (_cfi: string) => {},
    onDelete = (_id: string) => {}
  }: {
    highlights: EpubHighlight[];
    onNavigate?: (cfi: string) => void;
    onDelete?: (id: string) => void;
  } = $props();

  function formatDate(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  }

  function truncateText(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  }
</script>

<div class="highlights-container">
  <h3 class="highlights-header">Highlights</h3>

  {#if highlights.length === 0}
    <p class="highlights-empty">
      No highlights yet. Select text while reading to create highlights.
    </p>
  {:else}
    <ul class="highlights-list">
      {#each highlights as highlight (highlight.id)}
        <li class="highlight-item">
          <button class="highlight-content" onclick={() => onNavigate(highlight.cfi)}>
            <blockquote class="highlight-text">
              "{truncateText(highlight.text)}"
            </blockquote>
            <span class="highlight-date">{formatDate(highlight.createdAt)}</span>
          </button>
          <button
            class="delete-button"
            onclick={(e) => {
              e.stopPropagation();
              onDelete(highlight.id);
            }}
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
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .highlights-container {
    padding: 1rem;
  }

  .highlights-header {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary, #666);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 1rem 0;
  }

  .highlights-empty {
    color: var(--text-muted, #999);
    font-size: 0.875rem;
    font-style: italic;
    line-height: 1.5;
  }

  .highlights-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .highlight-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    background: var(--bg-elevated, white);
    border-radius: 8px;
    border: 1px solid var(--border-light, #e0e0e0);
    overflow: hidden;
  }

  .highlight-content {
    flex: 1;
    padding: 0.75rem;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s;
  }

  .highlight-content:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.02));
  }

  .highlight-text {
    margin: 0 0 0.5rem 0;
    padding: 0;
    padding-left: 0.75rem;
    border-left: 3px solid #ffeb3b;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--text-primary, #333);
    font-style: italic;
  }

  .highlight-date {
    font-size: 0.75rem;
    color: var(--text-muted, #999);
  }

  .delete-button {
    padding: 0.5rem;
    margin: 0.5rem 0.5rem 0 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted, #999);
    opacity: 0;
    transition:
      opacity 0.15s,
      color 0.15s,
      background-color 0.15s;
  }

  .highlight-item:hover .delete-button {
    opacity: 1;
  }

  .delete-button:hover {
    background: var(--error-bg, #ffebee);
    color: var(--error-color, #dc3545);
  }
</style>
