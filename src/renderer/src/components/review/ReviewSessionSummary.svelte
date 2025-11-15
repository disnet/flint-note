<script lang="ts">
  import type { ReviewSessionSummary } from '../../types/review';

  interface Props {
    summary: ReviewSessionSummary;
    onBackToDashboard: () => void;
  }

  let { summary, onBackToDashboard }: Props = $props();

  // Calculate success rate
  const successRate = $derived(
    summary.totalNotes > 0
      ? Math.round((summary.passedCount / summary.totalNotes) * 100)
      : 0
  );
</script>

<div class="session-summary">
  <div class="header">
    <div class="icon">🎉</div>
    <h2>Review Session Complete!</h2>
    <p class="subtitle">Great work on building your understanding</p>
  </div>

  <div class="stats-grid">
    <div class="stat-item">
      <div class="stat-value">{summary.totalNotes}</div>
      <div class="stat-label">Notes Reviewed</div>
    </div>

    <div class="stat-item success">
      <div class="stat-value">{summary.passedCount}</div>
      <div class="stat-label">Passed</div>
    </div>

    <div class="stat-item warning">
      <div class="stat-value">{summary.failedCount}</div>
      <div class="stat-label">For Review Tomorrow</div>
    </div>

    <div class="stat-item">
      <div class="stat-value">{successRate}%</div>
      <div class="stat-label">Success Rate</div>
    </div>

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

  {#if summary.failedCount > 0}
    <div class="next-review">
      <div class="next-review-label">Tomorrow's Review:</div>
      <div class="next-review-value">
        {summary.failedCount} note{summary.failedCount === 1 ? '' : 's'}
      </div>
    </div>
  {/if}

  <div class="actions">
    <button class="back-btn" onclick={onBackToDashboard}> Back to Dashboard </button>
  </div>

  {#if summary.results.length > 0}
    <details class="session-details">
      <summary>View Session Details</summary>
      <div class="results-list">
        {#each summary.results as result (result.noteId)}
          <div
            class="result-item"
            class:passed={result.passed}
            class:failed={!result.passed}
          >
            <div class="result-header">
              <span class="result-icon">{result.passed ? '✓' : '✗'}</span>
              <span class="result-title">{result.noteTitle}</span>
              <span class="result-schedule">Next: {result.scheduledFor}</span>
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

  .stat-item.success {
    border-color: var(--success);
  }

  .stat-item.warning {
    border-color: var(--warning);
  }

  .stat-item.secondary {
    border-color: var(--text-tertiary);
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
    margin-bottom: 0.5rem;
  }

  .stat-item.success .stat-value {
    color: var(--success);
  }

  .stat-item.warning .stat-value {
    color: var(--warning);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .next-review {
    background: var(--bg-secondary);
    border-left: 4px solid var(--warning);
    padding: 1rem 1.5rem;
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .next-review-label {
    font-weight: 600;
    color: var(--text-primary);
  }

  .next-review-value {
    color: var(--warning);
    font-weight: 700;
    font-size: 1.125rem;
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
  }

  .result-item.passed {
    background: var(--success-background, rgba(0, 200, 100, 0.1));
    border-left-color: var(--success);
  }

  .result-item.failed {
    background: var(--warning-background, rgba(255, 165, 0, 0.1));
    border-left-color: var(--warning);
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .result-icon {
    font-weight: bold;
    font-size: 1.125rem;
  }

  .result-item.passed .result-icon {
    color: var(--success);
  }

  .result-item.failed .result-icon {
    color: var(--warning);
  }

  .result-title {
    flex: 1;
    color: var(--text-primary);
    font-weight: 500;
  }

  .result-schedule {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
</style>
