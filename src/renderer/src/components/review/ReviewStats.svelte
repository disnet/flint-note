<script lang="ts">
  import type { ReviewStats } from '../../../../server/core/review-manager';

  interface Props {
    stats: ReviewStats;
    onStartReview: () => void;
  }

  let { stats, onStartReview }: Props = $props();
</script>

<div class="review-stats">
  <div class="stats-cards">
    <div class="stat-card today">
      <div class="stat-value">{stats.dueToday}</div>
      <div class="stat-label">Due Today</div>
    </div>

    <div class="stat-card week">
      <div class="stat-value">{stats.dueThisWeek}</div>
      <div class="stat-label">This Week</div>
    </div>

    <div class="stat-card total">
      <div class="stat-value">{stats.totalEnabled}</div>
      <div class="stat-label">Total Notes</div>
    </div>
  </div>

  {#if stats.dueToday > 0}
    <button class="start-review-btn" onclick={onStartReview}>
      Start Today's Review ({stats.dueToday})
    </button>
  {:else}
    <div class="no-reviews">
      <p>No notes due for review today! 🎉</p>
      {#if stats.dueThisWeek > 0}
        <p class="upcoming">Next review: {stats.dueThisWeek} notes this week</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .review-stats {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 2rem;
  }

  .stats-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
  }

  .stat-card {
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .stat-card.today {
    border-left: 4px solid var(--color-accent);
  }

  .stat-card.week {
    border-left: 4px solid var(--color-accent-secondary);
  }

  .stat-card.total {
    border-left: 4px solid var(--color-text-secondary);
  }

  .stat-value {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-text-primary);
    line-height: 1;
    margin-bottom: 0.5rem;
  }

  .stat-label {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .start-review-btn {
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 1rem 2rem;
    font-size: 1.125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    align-self: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .start-review-btn:hover {
    background: var(--color-accent-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .start-review-btn:active {
    transform: translateY(0);
  }

  .no-reviews {
    text-align: center;
    padding: 2rem;
    background: var(--color-background-secondary);
    border-radius: 8px;
    border: 1px dashed var(--color-border);
  }

  .no-reviews p {
    margin: 0.5rem 0;
    font-size: 1.125rem;
    color: var(--color-text-primary);
  }

  .upcoming {
    font-size: 0.875rem !important;
    color: var(--color-text-secondary) !important;
  }
</style>
