<script lang="ts">
  import type { ReviewStats } from '../../../../server/core/review-manager';
  import ReviewNotesTable from './ReviewNotesTable.svelte';

  interface Props {
    stats: ReviewStats;
    onStartReview: () => void;
    onResumeSession?: () => void;
    onReviewNote: (noteId: string) => void;
    hasSavedSession?: boolean;
  }

  let {
    stats,
    onStartReview,
    onResumeSession,
    onReviewNote,
    hasSavedSession = false
  }: Props = $props();

  let showNotesTable = $state(false);
  let searchQuery = $state('');

  function handleSearchChange(query: string): void {
    searchQuery = query;
    // Auto-expand table when searching
    if (query.trim()) {
      showNotesTable = true;
    }
  }

  function toggleNotesTable(): void {
    showNotesTable = !showNotesTable;
  }
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

  <div class="review-actions">
    {#if hasSavedSession && onResumeSession}
      <div class="saved-session-notice">
        <p class="notice-text">You have a paused review session</p>
        <button class="start-review-btn resume" onclick={onResumeSession}>
          Resume Session
        </button>
      </div>
    {/if}

    {#if stats.dueToday > 0}
      <button class="start-review-btn primary" onclick={onStartReview}>
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

  <!-- All notes table (collapsible) -->
  <div class="notes-table-section">
    <button class="section-toggle" onclick={toggleNotesTable}>
      <svg
        class="toggle-icon"
        class:expanded={showNotesTable}
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
      <span class="section-title">All Review Notes ({stats.totalEnabled})</span>
    </button>

    {#if showNotesTable}
      <div class="table-content">
        <div class="filter-bar">
          <label for="note-filter" class="filter-label">Filter:</label>
          <input
            id="note-filter"
            type="text"
            class="filter-input"
            placeholder="Search notes..."
            bind:value={searchQuery}
            oninput={() => handleSearchChange(searchQuery)}
          />
        </div>
        <ReviewNotesTable {onReviewNote} {searchQuery} />
      </div>
    {/if}
  </div>
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
    background: var(--bg-secondary);
    border: 1px solid var(--border);
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
    border-left: 4px solid var(--accent-primary);
  }

  .stat-card.week {
    border-left: 4px solid var(--accent-secondary);
  }

  .stat-card.total {
    border-left: 4px solid var(--text-secondary);
  }

  .stat-value {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
    margin-bottom: 0.5rem;
  }

  .stat-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .review-actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }

  .saved-session-notice {
    width: 100%;
    max-width: 400px;
    text-align: center;
    padding: 1.5rem;
    background: var(--accent-light);
    border: 2px solid var(--accent-primary);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .notice-text {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--accent-primary);
  }

  .start-review-btn {
    border: none;
    border-radius: 8px;
    padding: 1rem 2rem;
    font-size: 1.125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
    max-width: 400px;
  }

  .start-review-btn.primary {
    background: var(--accent-primary);
    color: var(--bg-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .start-review-btn.primary:hover {
    background: var(--accent-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .start-review-btn.resume {
    background: var(--accent-primary);
    color: #ffffff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .start-review-btn.resume:hover {
    background: var(--accent-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .start-review-btn:active {
    transform: translateY(0);
  }

  .no-reviews {
    text-align: center;
    padding: 2rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px dashed var(--border);
  }

  .no-reviews p {
    margin: 0.5rem 0;
    font-size: 1.125rem;
    color: var(--text-primary);
  }

  .upcoming {
    font-size: 0.875rem !important;
    color: var(--text-secondary) !important;
  }

  /* Notes table section */
  .notes-table-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 1rem;
  }

  .section-toggle:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
  }

  .toggle-icon {
    transition: transform 0.2s;
    color: var(--text-secondary);
  }

  .toggle-icon.expanded {
    transform: rotate(180deg);
  }

  .section-title {
    font-weight: 600;
    color: var(--text-primary);
  }

  .table-content {
    padding: 0;
  }

  .filter-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }

  .filter-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .filter-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.875rem;
    color: var(--text-primary);
    font-family: inherit;
    transition: all 0.2s;
  }

  .filter-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(var(--accent-primary-rgb, 59, 130, 246), 0.1);
  }

  .filter-input::placeholder {
    color: var(--text-tertiary);
  }
</style>
