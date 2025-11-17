<script lang="ts">
  import type { ReviewHistoryEntry } from '../../types/review';

  interface Props {
    history: ReviewHistoryEntry[];
    compact?: boolean;
  }

  let { history, compact = false }: Props = $props();

  // Track which entries are expanded
  let expandedEntries = $state<Set<number>>(new Set());

  function toggleEntry(index: number): void {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    expandedEntries = newExpanded;
  }

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return (
        'Today at ' +
        date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      );
    } else if (diffDays === 1) {
      return (
        'Yesterday at ' +
        date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      );
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  }
</script>

<div class="review-history-panel" class:compact>
  {#if history.length === 0}
    <div class="empty-state">
      <p>No review history yet</p>
    </div>
  {:else}
    <div class="history-list">
      {#each history as entry, index (entry.date)}
        <div class="history-entry" class:expanded={expandedEntries.has(index)}>
          <button
            class="entry-header"
            onclick={() => toggleEntry(index)}
            aria-expanded={expandedEntries.has(index)}
          >
            <div class="header-left">
              <span
                class="badge"
                class:passed={entry.passed}
                class:failed={!entry.passed}
              >
                {entry.passed ? 'Pass' : 'Fail'}
              </span>
              <span class="timestamp">{formatTimestamp(entry.date)}</span>
            </div>
            <svg
              class="expand-icon"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          {#if expandedEntries.has(index)}
            <div class="entry-content">
              {#if entry.prompt}
                <div class="content-section">
                  <h4>Prompt</h4>
                  <div class="content-text">{entry.prompt}</div>
                </div>
              {/if}

              {#if entry.response}
                <div class="content-section">
                  <h4>Your Response</h4>
                  <div class="content-text">{entry.response}</div>
                </div>
              {/if}

              {#if entry.feedback}
                <div class="content-section">
                  <h4>Agent Feedback</h4>
                  <div class="content-text feedback-text">{entry.feedback}</div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .review-history-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .review-history-panel.compact {
    font-size: 0.9rem;
  }

  .empty-state {
    padding: 2rem;
    text-align: center;
    background: var(--bg-secondary);
    border: 1px dashed var(--border);
    border-radius: 8px;
    color: var(--text-secondary);
  }

  .empty-state p {
    margin: 0;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .history-entry {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s;
  }

  .history-entry:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  .entry-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.2s;
  }

  .entry-header:hover {
    background: var(--bg-hover);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .badge.passed {
    background: var(--success);
    color: #ffffff;
  }

  .badge.failed {
    background: var(--warning);
    color: #ffffff;
  }

  .timestamp {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .expand-icon {
    color: var(--text-secondary);
    transition: transform 0.2s;
  }

  .history-entry.expanded .expand-icon {
    transform: rotate(180deg);
  }

  .entry-content {
    padding: 0 1rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .content-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .content-section h4 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .content-text {
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.5;
  }

  .feedback-text {
    background: var(--bg-secondary);
    border-left: 3px solid var(--accent-primary);
  }

  .compact .entry-header {
    padding: 0.5rem 0.75rem;
  }

  .compact .badge {
    padding: 0.2rem 0.6rem;
    font-size: 0.7rem;
  }

  .compact .timestamp {
    font-size: 0.8rem;
  }

  .compact .content-text {
    font-size: 0.85rem;
    padding: 0.5rem;
  }
</style>
