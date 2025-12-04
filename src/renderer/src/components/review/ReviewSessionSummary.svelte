<script lang="ts">
  import type { ReviewSessionSummary } from '../../types/review';
  import { RATING_LABELS } from '../../types/review';

  interface Props {
    summary: ReviewSessionSummary;
    onBackToDashboard: () => void;
  }

  let { summary, onBackToDashboard }: Props = $props();
</script>

<div class="session-summary">
  <div class="header">
    <div class="icon">🎉</div>
    <h2>Review Session Complete!</h2>
    <p class="subtitle">Session #{summary.sessionNumber + 1} finished</p>
  </div>

  <div class="stats-grid">
    <div class="stat-item">
      <div class="stat-value">{summary.totalNotes}</div>
      <div class="stat-label">Notes Reviewed</div>
    </div>

    <div class="stat-item need-more">
      <div class="stat-value">{summary.ratingCounts[1]}</div>
      <div class="stat-label">Need More Time</div>
    </div>

    <div class="stat-item productive">
      <div class="stat-value">{summary.ratingCounts[2]}</div>
      <div class="stat-label">Productive</div>
    </div>

    <div class="stat-item familiar">
      <div class="stat-value">{summary.ratingCounts[3]}</div>
      <div class="stat-label">Already Familiar</div>
    </div>

    {#if summary.ratingCounts[4] > 0}
      <div class="stat-item retired">
        <div class="stat-value">{summary.ratingCounts[4]}</div>
        <div class="stat-label">Retired</div>
      </div>
    {/if}

    <div class="stat-item">
      <div class="stat-value">{summary.durationMinutes}</div>
      <div class="stat-label">Minutes</div>
    </div>

    {#if summary.skippedCount > 0}
      <div class="stat-item secondary">
        <div class="stat-value">{summary.skippedCount}</div>
        <div class="stat-label">Skipped</div>
      </div>
    {/if}
  </div>

  <div class="actions">
    <button class="back-btn" onclick={onBackToDashboard}> Back to Dashboard </button>
  </div>

  {#if summary.results.length > 0}
    <details class="session-details">
      <summary>View Session Details</summary>
      <div class="results-list">
        {#each summary.results as result (result.noteId)}
          <div class="result-item rating-{result.rating}">
            <div class="result-header">
              <span class="result-rating">{result.rating}</span>
              <span class="result-title">{result.noteTitle}</span>
              <span class="result-label">{RATING_LABELS[result.rating]}</span>
            </div>
          </div>
        {/each}
      </div>
    </details>
  {/if}
</div>

<style>
  .session-summary {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 3rem 2rem;
    max-width: 800px;
    margin: 0 auto;
  }

  .header {
    text-align: center;
  }

  .icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .header h2 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0;
    color: var(--text-secondary);
    font-size: 1rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 1rem;
  }

  .stat-item {
    background: var(--bg-secondary);
    border: 2px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    transition: transform 0.2s;
  }

  .stat-item:hover {
    transform: translateY(-2px);
  }

  .stat-item.need-more {
    border-color: var(--warning);
  }

  .stat-item.productive {
    border-color: var(--success);
  }

  .stat-item.familiar {
    border-color: var(--accent-secondary);
  }

  .stat-item.retired {
    border-color: var(--text-muted);
  }

  .stat-item.secondary {
    border-color: var(--text-muted);
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
    margin-bottom: 0.5rem;
  }

  .stat-item.need-more .stat-value {
    color: var(--warning);
  }

  .stat-item.productive .stat-value {
    color: var(--success);
  }

  .stat-item.familiar .stat-value {
    color: var(--accent-secondary);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .actions {
    display: flex;
    justify-content: center;
  }

  .back-btn {
    background: var(--accent-primary);
    color: var(--bg-primary);
    border: none;
    border-radius: 8px;
    padding: 1rem 2rem;
    font-size: 1.125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .back-btn:hover {
    background: var(--accent-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .session-details {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    background: var(--bg-secondary);
  }

  .session-details summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--text-primary);
    padding: 0.5rem;
    user-select: none;
  }

  .session-details summary:hover {
    color: var(--accent-primary);
  }

  .results-list {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .result-item {
    padding: 0.75rem 1rem;
    border-radius: 4px;
    border-left: 3px solid;
    background: var(--bg-primary);
  }

  .result-item.rating-1 {
    border-left-color: var(--warning);
  }

  .result-item.rating-2 {
    border-left-color: var(--success);
  }

  .result-item.rating-3 {
    border-left-color: var(--accent-secondary);
  }

  .result-item.rating-4 {
    border-left-color: var(--text-muted);
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .result-rating {
    font-weight: bold;
    font-size: 0.875rem;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .result-item.rating-1 .result-rating {
    background: var(--warning);
    color: white;
  }

  .result-item.rating-2 .result-rating {
    background: var(--success);
    color: white;
  }

  .result-item.rating-3 .result-rating {
    background: var(--accent-secondary);
    color: white;
  }

  .result-item.rating-4 .result-rating {
    background: var(--text-muted);
    color: white;
  }

  .result-title {
    flex: 1;
    color: var(--text-primary);
    font-weight: 500;
  }

  .result-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
</style>
