<script lang="ts">
  import { onMount } from 'svelte';
  import { reviewStore } from '../stores/reviewStore.svelte';
  import type { ReviewNote } from '../stores/reviewStore.svelte';

  interface Props {
    onStartReview?: (noteId: string, noteTitle: string) => void;
  }

  let { onStartReview }: Props = $props();

  // Load review data on mount
  onMount(() => {
    reviewStore.loadStats();
    reviewStore.loadNotesForReview();
  });

  /**
   * Refresh review data
   */
  function refresh() {
    reviewStore.loadStats();
    reviewStore.loadNotesForReview();
  }

  /**
   * Toggle showing all notes vs today's notes
   */
  function toggleShowAll() {
    reviewStore.toggleShowAll();
  }

  /**
   * Start reviewing a note
   */
  function handleStartReview(note: ReviewNote) {
    onStartReview?.(note.id, note.title);
  }
</script>

<div class="review-view">
  <!-- Review dashboard -->
  <div class="review-dashboard">
    <div class="review-header">
      <h1>Review Mode</h1>
      <div class="header-buttons">
        <button class="toggle-button" onclick={toggleShowAll}>
          {reviewStore.showAllNotes ? 'Show Today Only' : 'Show All Notes'}
        </button>
        <button class="refresh-button" onclick={refresh}>Refresh</button>
      </div>
    </div>

    {#if reviewStore.error}
      <div class="error-banner">
        <p>{reviewStore.error}</p>
      </div>
    {/if}

    <!-- Review Statistics -->
    <div class="review-stats">
      <div class="stat-card">
        <div class="stat-value">{reviewStore.stats.dueToday}</div>
        <div class="stat-label">Due Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{reviewStore.stats.dueThisWeek}</div>
        <div class="stat-label">Due This Week</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{reviewStore.stats.totalEnabled}</div>
        <div class="stat-label">Total in Review</div>
      </div>
    </div>

    <!-- Notes due for review -->
    <div class="review-queue">
      <h2>{reviewStore.showAllNotes ? 'All Review Notes' : 'Notes Due Today'}</h2>

      {#if reviewStore.isLoadingNotes}
        <div class="loading-state">
          <p>Loading notes...</p>
        </div>
      {:else if reviewStore.notesForReview.length === 0}
        <div class="empty-state">
          {#if reviewStore.showAllNotes}
            <p>📚 No notes in review system</p>
            <p class="empty-state-subtitle">
              Enable review on notes by clicking the review button when editing them.
            </p>
          {:else}
            <p>🎉 No notes due for review today!</p>
            <p class="empty-state-subtitle">
              Great job staying on top of your reviews. Check back tomorrow or add more
              notes to your review system.
            </p>
          {/if}
        </div>
      {:else}
        <div class="notes-list">
          {#each reviewStore.notesForReview as note (note.id)}
            <button class="note-item" onclick={() => handleStartReview(note)}>
              <div class="note-info">
                <div class="note-title">{note.title}</div>
                <div class="note-meta">
                  {#if note.reviewCount === 0}
                    <span class="badge new">First Review</span>
                  {:else}
                    <span class="badge">Reviewed {note.reviewCount} times</span>
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        </div>

        <div class="review-actions">
          <p class="review-hint">
            Click on a note to start reviewing it with the AI Assistant. The AI will guide
            you through an interactive review session with personalized prompts.
          </p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .review-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .review-dashboard {
    height: 100%;
    padding: 2rem;
    overflow-y: auto;
  }

  .review-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .review-header h1,
  .review-header h2 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .header-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .refresh-button,
  .toggle-button,
  .exit-button {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--color-border);
    background: var(--color-background-secondary);
    color: var(--color-text);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .refresh-button:hover,
  .toggle-button:hover,
  .exit-button:hover {
    background: var(--color-background-hover);
  }

  .error-banner {
    margin-bottom: 1rem;
    padding: 1rem;
    border-radius: 0.5rem;
    background: var(--color-error-background, #fee);
    border: 1px solid var(--color-error-border, #fcc);
    color: var(--color-error-text, #c00);
  }

  .review-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    padding: 1.5rem;
    border-radius: 0.75rem;
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border);
    text-align: center;
  }

  .stat-value {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-primary);
    margin-bottom: 0.5rem;
  }

  .stat-label {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .review-queue h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: var(--color-text);
  }

  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--color-text-secondary);
  }

  .empty-state p:first-child {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .empty-state-subtitle {
    font-size: 0.875rem;
    max-width: 500px;
    margin: 0 auto;
  }

  .notes-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .note-item {
    width: 100%;
    padding: 1rem;
    border-radius: 0.5rem;
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border);
    transition: all 0.2s;
    cursor: pointer;
    text-align: left;
  }

  .note-item:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
  }

  .note-item:active {
    transform: translateY(0);
  }

  .note-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .note-title {
    font-size: 1rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .note-meta {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    background: var(--color-background-tertiary);
    color: var(--color-text-secondary);
  }

  .badge.new {
    background: var(--color-primary-faded, #e3f2fd);
    color: var(--color-primary);
    font-weight: 500;
  }

  .review-actions {
    display: flex;
    justify-content: center;
    padding: 1.5rem 0;
  }

  .start-review-button {
    padding: 0.75rem 2rem;
    border-radius: 0.5rem;
    border: none;
    background: var(--color-primary);
    color: white;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .start-review-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .start-review-button:active {
    transform: translateY(0);
  }

  .review-session {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .review-session .review-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .review-session .review-header h2 {
    font-size: 1.25rem;
  }

  .review-assistant {
    flex: 1;
    overflow: hidden;
  }
</style>
