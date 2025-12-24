<script lang="ts">
  import { getAllReviewHistory, navigateToNote } from '../lib/automerge';
  import { RATING_LABELS } from '../lib/automerge/review-scheduler';

  let filterText = $state('');
  let filterStatus = $state<'all' | 'passed' | 'failed'>('all');

  // Get all review history
  const allReviewHistory = $derived(getAllReviewHistory());

  // Filter and sort history entries
  const filteredHistory = $derived.by(() => {
    if (!allReviewHistory || allReviewHistory.length === 0) {
      return [];
    }

    let result = allReviewHistory;

    // Filter by note title
    if (filterText.trim()) {
      const query = filterText.toLowerCase();
      result = result.filter((item) => item.noteTitle.toLowerCase().includes(query));
    }

    // Filter by status
    if (filterStatus === 'passed') {
      result = result.filter((item) => item.entry.rating >= 2);
    } else if (filterStatus === 'failed') {
      result = result.filter((item) => item.entry.rating < 2);
    }

    // Sort by date (most recent first)
    return [...result].sort(
      (a, b) => new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime()
    );
  });

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return (
        'Today ' +
        date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      );
    } else if (diffDays === 1) {
      return (
        'Yesterday ' +
        date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      );
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  }

  function handleNoteClick(noteId: string, title: string): void {
    navigateToNote(noteId, title);
  }

  function clearFilters(): void {
    filterText = '';
    filterStatus = 'all';
  }
</script>

<div class="review-history-view">
  <div class="history-header">
    <h2>Review History</h2>
    <p class="subtitle">All your past review attempts across all notes</p>
  </div>

  <div class="filters">
    <input
      type="text"
      class="filter-input"
      placeholder="Filter by note title..."
      bind:value={filterText}
    />

    <div class="filter-buttons">
      <button
        class="filter-btn"
        class:active={filterStatus === 'all'}
        onclick={() => (filterStatus = 'all')}
      >
        All
      </button>
      <button
        class="filter-btn passed"
        class:active={filterStatus === 'passed'}
        onclick={() => (filterStatus = 'passed')}
      >
        Passed
      </button>
      <button
        class="filter-btn failed"
        class:active={filterStatus === 'failed'}
        onclick={() => (filterStatus = 'failed')}
      >
        Failed
      </button>
    </div>

    {#if filterText || filterStatus !== 'all'}
      <button class="clear-filters" onclick={clearFilters}> Clear Filters </button>
    {/if}
  </div>

  {#if filteredHistory.length === 0}
    <div class="empty-state">
      {#if allReviewHistory.length === 0}
        <p>No review history yet</p>
        <p class="hint">Complete some reviews to see your history here</p>
      {:else}
        <p>No reviews match your filters</p>
        <button class="clear-filters-btn" onclick={clearFilters}> Clear Filters </button>
      {/if}
    </div>
  {:else}
    <div class="history-list">
      <div class="list-header">
        <span class="count">
          {filteredHistory.length} review{filteredHistory.length !== 1 ? 's' : ''}
        </span>
      </div>

      {#each filteredHistory as item (`${item.noteId}-${item.entry.date}`)}
        <div class="history-item">
          <div class="item-header">
            <button
              class="note-title"
              onclick={() => handleNoteClick(item.noteId, item.noteTitle)}
            >
              {item.noteTitle}
            </button>
            <div class="item-meta">
              <span
                class="badge rating-{item.entry.rating}"
                class:passed={item.entry.rating >= 2}
                class:failed={item.entry.rating < 2}
              >
                {RATING_LABELS[item.entry.rating]}
              </span>
              <span class="timestamp">{formatTimestamp(item.entry.date)}</span>
            </div>
          </div>

          {#if item.entry.prompt || item.entry.response || item.entry.feedback}
            <div class="item-content">
              {#if item.entry.prompt}
                <div class="content-section">
                  <h4>Prompt</h4>
                  <div class="content-text">{item.entry.prompt}</div>
                </div>
              {/if}

              {#if item.entry.response}
                <div class="content-section">
                  <h4>Response</h4>
                  <div class="content-text">{item.entry.response}</div>
                </div>
              {/if}

              {#if item.entry.feedback}
                <div class="content-section">
                  <h4>Agent Feedback</h4>
                  <div class="content-text feedback-text">
                    {item.entry.feedback}
                  </div>
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
  .review-history-view {
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .history-header {
    margin-bottom: 2rem;
  }

  .history-header h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.75rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .filters {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .filter-input {
    flex: 1;
    min-width: 200px;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.9rem;
    font-family: inherit;
  }

  .filter-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .filter-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .filter-btn {
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-btn:hover {
    background: var(--bg-hover);
  }

  .filter-btn.active {
    background: var(--accent-primary);
    color: #ffffff;
    border-color: var(--accent-primary);
  }

  .filter-btn.passed.active {
    background: var(--success);
    border-color: var(--success);
  }

  .filter-btn.failed.active {
    background: var(--warning);
    border-color: var(--warning);
  }

  .clear-filters,
  .clear-filters-btn {
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-filters:hover,
  .clear-filters-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    background: var(--bg-secondary);
    border: 1px dashed var(--border-light);
    border-radius: 8px;
  }

  .empty-state p {
    margin: 0.5rem 0;
    color: var(--text-primary);
  }

  .empty-state .hint {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .list-header {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-light);
    margin-bottom: 0.5rem;
  }

  .count {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .history-item {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    overflow: hidden;
    transition: box-shadow 0.2s;
  }

  .history-item:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .note-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--accent-primary);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
    transition: opacity 0.2s;
  }

  .note-title:hover {
    opacity: 0.8;
    text-decoration: underline;
  }

  .item-meta {
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

  .item-content {
    padding: 0 1rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border-top: 1px solid var(--border-light);
    padding-top: 1rem;
  }

  .content-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .content-section h4 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .content-text {
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.5;
    font-size: 0.875rem;
  }

  .feedback-text {
    background: var(--bg-secondary);
    border-left: 3px solid var(--accent-primary);
  }
</style>
