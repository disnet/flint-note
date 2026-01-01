<script lang="ts">
  import type { ReviewConfig } from '../lib/automerge/types';
  import type { ReviewStats } from '../lib/automerge/review-scheduler';
  import { getOrdinal } from '../lib/automerge/review-scheduler';
  import ReviewNotesTable from './ReviewNotesTable.svelte';

  interface Props {
    stats: ReviewStats;
    config: ReviewConfig;
    onStartReview: () => void;
    onResumeSession?: () => void;
    onReviewNote: (noteId: string) => void;
    onUpdateConfig: (config: Partial<ReviewConfig>) => void;
    hasSavedSession?: boolean;
    nextSessionAvailableAt?: Date | null;
    isOffline?: boolean;
  }

  let {
    stats,
    config,
    onStartReview,
    onResumeSession,
    onReviewNote,
    onUpdateConfig,
    hasSavedSession = false,
    nextSessionAvailableAt = null,
    isOffline = false
  }: Props = $props();

  let showNotesTable = $state(false);
  let showSettings = $state(false);
  let searchQuery = $state('');

  function handleConfigChange(key: keyof ReviewConfig, value: number): void {
    onUpdateConfig({ [key]: value });
  }

  function handleSearchChange(query: string): void {
    searchQuery = query;
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
    <div class="stat-card session">
      <div class="stat-value">{getOrdinal(stats.currentSessionNumber)}</div>
      <div class="stat-label">Session</div>
    </div>

    <div class="stat-card today">
      <div class="stat-value">{nextSessionAvailableAt ? 0 : stats.dueThisSession}</div>
      <div class="stat-label">Due Now</div>
    </div>

    <div class="stat-card total">
      <div class="stat-value">{stats.totalEnabled}</div>
      <div class="stat-label">Active</div>
    </div>

    <div class="stat-card retired">
      <div class="stat-value">{stats.retired}</div>
      <div class="stat-label">Retired</div>
    </div>
  </div>

  <div class="review-actions">
    {#if isOffline}
      <div class="offline-notice">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>
        <span>You're offline - review requires an internet connection</span>
      </div>
    {/if}

    {#if hasSavedSession && onResumeSession}
      <div class="saved-session-notice">
        <p class="notice-text">You have a paused review session</p>
        <button
          class="start-review-btn resume"
          onclick={onResumeSession}
          disabled={isOffline}
        >
          Resume Session
        </button>
      </div>
    {/if}

    {#if stats.dueThisSession > 0 && !nextSessionAvailableAt}
      <button
        class="start-review-btn primary"
        onclick={onStartReview}
        disabled={isOffline}
      >
        Start Review ({stats.dueThisSession})
      </button>
    {:else if nextSessionAvailableAt}
      <div class="no-reviews">
        <p>Session complete!</p>
        <p class="upcoming">Next session available tomorrow</p>
      </div>
    {:else}
      <div class="no-reviews">
        <p>No notes due for review!</p>
        <p class="upcoming">Enable review on notes to get started</p>
      </div>
    {/if}
  </div>

  <!-- How it works section -->
  <div class="how-it-works-section">
    <div class="how-it-works-content">
      <div class="explanation-block">
        <h4>Deep Engagement Over Time</h4>
        <p>
          Review mode helps you <strong>deeply engage</strong> with your notes on a recurring
          basis. The goal isn't memorization - it's to actively work with ideas until they become
          part of how you think. Each review challenges you to explain, connect, and apply what
          you've captured.
        </p>
      </div>

      <div class="explanation-block">
        <h4>Rate Your Engagement</h4>
        <p>After each review, reflect on how the session went:</p>
        <ul class="rating-list">
          <li>
            <span class="rating-badge need-more">1</span>
            <strong>Need more time</strong> - This idea needs more work. You'll see it again
            soon.
          </li>
          <li>
            <span class="rating-badge productive">2</span>
            <strong>Productive</strong> - Good engagement. The idea is developing well.
          </li>
          <li>
            <span class="rating-badge familiar">3</span>
            <strong>Already familiar</strong> - You know this well. Less frequent review needed.
          </li>
          <li>
            <span class="rating-badge processed">4</span>
            <strong>Fully processed</strong> - This idea is now part of your thinking. Stop
            reviewing it.
          </li>
        </ul>
      </div>

      <div class="explanation-block">
        <h4>Work at Your Own Pace</h4>
        <p>
          Sessions are flexible - complete them daily, weekly, or whenever you have time.
          Notes that need more attention appear more frequently. As ideas become
          integrated, they naturally fade from review, making room for new material.
        </p>
      </div>
    </div>
  </div>

  <!-- Settings section (collapsible) -->
  <div class="settings-section">
    <button class="section-toggle" onclick={() => (showSettings = !showSettings)}>
      <svg
        class="toggle-icon"
        class:expanded={showSettings}
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
      <span class="section-title">Settings</span>
    </button>

    {#if showSettings}
      <div class="settings-content">
        <div class="setting-item">
          <label for="session-size">
            <span class="setting-label">Notes per session</span>
            <span class="setting-description">
              Lower for shorter, more frequent sessions. Higher if you prefer longer,
              deeper review periods.
            </span>
          </label>
          <input
            id="session-size"
            type="number"
            min="1"
            max="50"
            value={config.sessionSize}
            onchange={(e) =>
              handleConfigChange('sessionSize', parseInt(e.currentTarget.value))}
          />
        </div>

        <div class="setting-item">
          <label for="sessions-per-week">
            <span class="setting-label">Sessions per week</span>
            <span class="setting-description">
              Used to estimate review dates. Increase if you review daily, decrease for
              weekly reviews.
            </span>
          </label>
          <input
            id="sessions-per-week"
            type="number"
            min="1"
            max="14"
            value={config.sessionsPerWeek}
            onchange={(e) =>
              handleConfigChange('sessionsPerWeek', parseInt(e.currentTarget.value))}
          />
        </div>

        <div class="setting-item">
          <label for="max-interval">
            <span class="setting-label">Max interval (sessions)</span>
            <span class="setting-description">
              Caps how long between reviews. Lower keeps notes fresher, higher lets
              well-known ideas rest longer.
            </span>
          </label>
          <input
            id="max-interval"
            type="number"
            min="1"
            max="100"
            value={config.maxIntervalSessions}
            onchange={(e) =>
              handleConfigChange('maxIntervalSessions', parseInt(e.currentTarget.value))}
          />
        </div>

        <div class="setting-item">
          <label for="min-interval-days">
            <span class="setting-label">Min interval (days)</span>
            <span class="setting-description">
              Prevents seeing the same note too soon. Useful if you do multiple sessions
              per day.
            </span>
          </label>
          <input
            id="min-interval-days"
            type="number"
            min="0"
            max="30"
            value={config.minIntervalDays}
            onchange={(e) =>
              handleConfigChange('minIntervalDays', parseInt(e.currentTarget.value))}
          />
        </div>
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
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 1rem;
  }

  .stat-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
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

  .stat-card.session {
    border-left: 4px solid var(--text-muted);
  }

  .stat-card.today {
    border-left: 4px solid var(--accent-primary);
  }

  .stat-card.total {
    border-left: 4px solid var(--success);
  }

  .stat-card.retired {
    border-left: 4px solid var(--text-muted);
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

  .start-review-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .start-review-btn:disabled:hover {
    transform: none;
    box-shadow: none;
  }

  .offline-notice {
    width: 100%;
    max-width: 400px;
    padding: 12px 16px;
    background: var(--warning-bg, #fffbeb);
    color: var(--warning-text, #b45309);
    border-radius: 8px;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
  }

  .no-reviews {
    text-align: center;
    padding: 2rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px dashed var(--border-light);
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
    border: 1px solid var(--border-light);
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
    border-bottom: 1px solid var(--border-light);
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
    border: 1px solid var(--border-light);
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
    color: var(--text-muted);
  }

  /* How it works section */
  .how-it-works-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .how-it-works-content {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .explanation-block h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .explanation-block p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .rating-list {
    margin: 0.75rem 0 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .rating-list li {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .rating-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 4px;
    font-size: 0.6875rem;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .rating-badge.need-more {
    background: var(--warning);
    color: #ffffff;
  }

  .rating-badge.productive {
    background: var(--success);
    color: #ffffff;
  }

  .rating-badge.familiar {
    background: var(--accent-primary);
    color: #ffffff;
  }

  .rating-badge.processed {
    background: var(--text-muted);
    color: #ffffff;
  }

  /* Settings section */
  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .settings-content {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .setting-item label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .setting-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .setting-description {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .setting-item input[type='number'] {
    width: 80px;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    font-size: 0.875rem;
    color: var(--text-primary);
    font-family: inherit;
    text-align: center;
  }

  .setting-item input[type='number']:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(var(--accent-primary-rgb, 59, 130, 246), 0.1);
  }
</style>
