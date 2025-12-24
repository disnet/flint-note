<script lang="ts">
  import {
    getReviewQueueNotes,
    isSessionAvailable,
    navigateToNote
  } from '../lib/automerge';
  import type { Note, ReviewData } from '../lib/automerge/types';
  import { isPassingRating } from '../lib/automerge/review-scheduler';
  import AutomergeReviewHistoryPanel from './AutomergeReviewHistoryPanel.svelte';

  interface Props {
    onReviewNote: (noteId: string) => void;
    searchQuery?: string;
  }

  let { onReviewNote, searchQuery = '' }: Props = $props();

  interface EnrichedReviewItem {
    note: Note;
    review: ReviewData;
    estimatedDue: Date;
    isOverdue: boolean;
    isDueToday: boolean;
    lastResult: 'passed' | 'failed' | null;
  }

  let expandedNoteId = $state<string | null>(null);

  // Get review queue notes from Automerge state
  const reviewItems = $derived.by((): EnrichedReviewItem[] => {
    const queueNotes = getReviewQueueNotes();
    const sessionAvailable = isSessionAvailable();

    /* eslint-disable svelte/prefer-svelte-reactivity -- local computation variables */
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return queueNotes.map(({ note, review, estimatedDue, isOverdue }) => {
      const history = review.reviewHistory || [];
      const lastEntry = history.length > 0 ? history[history.length - 1] : null;

      // Check if estimated due is today
      const dueDate = new Date(estimatedDue);
      dueDate.setHours(0, 0, 0, 0);
      const isDueToday = dueDate.getTime() === today.getTime() && sessionAvailable;

      return {
        note,
        review,
        estimatedDue,
        isOverdue,
        isDueToday,
        lastResult: lastEntry
          ? isPassingRating(lastEntry.rating)
            ? 'passed'
            : 'failed'
          : null
      };
    });
    /* eslint-enable svelte/prefer-svelte-reactivity */
  });

  // Filtered items based on search query
  const filteredItems = $derived.by(() => {
    if (!searchQuery.trim()) {
      return reviewItems;
    }
    const query = searchQuery.toLowerCase();
    return reviewItems.filter((item) => item.note.title.toLowerCase().includes(query));
  });

  function toggleExpand(noteId: string): void {
    expandedNoteId = expandedNoteId === noteId ? null : noteId;
  }

  function handleCardClick(noteId: string, event: MouseEvent | KeyboardEvent): void {
    // Don't expand if clicking on a button or interactive element
    const target = event.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    const item = reviewItems.find((i) => i.note.id === noteId);
    if (item && item.review.reviewHistory.length > 0) {
      toggleExpand(noteId);
    }
  }

  function handleCardKeyDown(noteId: string, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCardClick(noteId, event);
    }
  }

  function openNote(noteId: string, title: string, event: MouseEvent): void {
    event.stopPropagation();
    navigateToNote(noteId, title);
  }

  function formatDate(date: Date): string {
    /* eslint-disable svelte/prefer-svelte-reactivity -- local computation variables */
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    /* eslint-enable svelte/prefer-svelte-reactivity */

    const diffDays = Math.round(
      (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Past or today - just show "Due"
    if (diffDays <= 0) return 'Due';

    // Future dates - show relative
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 6) return `In ${diffDays} days`;
    if (diffDays <= 13) return 'Next week';
    if (diffDays <= 20) return 'In 2 weeks';
    if (diffDays <= 27) return 'In 3 weeks';

    // Further out - show month
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<div class="review-notes-list">
  {#if filteredItems.length === 0}
    <div class="empty-state">
      <p>
        {searchQuery.trim()
          ? 'No notes found matching your search.'
          : 'No notes marked for review yet.'}
      </p>
    </div>
  {:else}
    <div class="notes-container">
      {#each filteredItems as item (item.note.id)}
        {@const hasHistory = item.review.reviewHistory.length > 0}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="note-card"
          class:has-history={hasHistory}
          role={hasHistory ? 'button' : undefined}
          tabindex={hasHistory ? 0 : undefined}
          onclick={(e) => handleCardClick(item.note.id, e)}
          onkeydown={(e) => handleCardKeyDown(item.note.id, e)}
        >
          <div class="note-header">
            <button
              class="note-title"
              onclick={(e) => openNote(item.note.id, item.note.title, e)}
            >
              {item.note.title}
            </button>
            {#if hasHistory}
              <button
                class="expand-btn"
                onclick={() => toggleExpand(item.note.id)}
                aria-label="Toggle history"
              >
                <svg
                  class="expand-icon"
                  class:expanded={expandedNoteId === item.note.id}
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
            {/if}
          </div>

          <div class="note-meta">
            <span
              class="date-badge"
              class:overdue={item.isOverdue}
              class:today={item.isDueToday}
            >
              {formatDate(item.estimatedDue)}
            </span>

            {#if item.review.status === 'retired'}
              <span class="status-badge retired">Retired</span>
            {:else if item.lastResult}
              <span class="result-badge" class:passed={item.lastResult === 'passed'}>
                {item.lastResult === 'passed' ? 'Passed' : 'Failed'}
              </span>
            {/if}

            <span class="review-count">
              {item.review.reviewCount} review{item.review.reviewCount !== 1 ? 's' : ''}
            </span>

            {#if item.review.status !== 'retired'}
              <button class="review-btn" onclick={() => onReviewNote(item.note.id)}>
                Review Now
              </button>
            {/if}
          </div>

          {#if expandedNoteId === item.note.id && hasHistory}
            <div class="history-content">
              <AutomergeReviewHistoryPanel
                history={item.review.reviewHistory}
                compact={true}
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .review-notes-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    gap: 1rem;
  }

  .empty-state p {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin: 0;
  }

  .notes-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .note-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .note-card.has-history {
    cursor: pointer;
  }

  .note-card:hover {
    border-color: var(--accent-primary);
    box-shadow:
      0 2px 12px rgba(0, 0, 0, 0.1),
      0 0 0 1px var(--accent-primary);
  }

  .note-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .note-title {
    margin: 0;
    padding: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.4;
    flex: 1;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: color 0.2s;
  }

  .note-title:hover {
    color: var(--accent-primary);
    text-decoration: underline;
  }

  .expand-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: color 0.2s;
    flex-shrink: 0;
  }

  .expand-btn:hover {
    color: var(--text-primary);
  }

  .expand-icon {
    transition: transform 0.2s;
  }

  .expand-icon.expanded {
    transform: rotate(180deg);
  }

  .note-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .date-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--bg-primary);
    color: var(--text-secondary);
  }

  .date-badge.today {
    background: var(--accent-light);
    color: var(--accent-primary);
    font-weight: 600;
  }

  .date-badge.overdue {
    background: var(--warning-light);
    color: var(--warning);
    font-weight: 600;
  }

  .result-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .result-badge.passed {
    background: var(--success-light);
    color: var(--success);
  }

  .result-badge:not(.passed) {
    background: var(--warning-light);
    color: var(--warning);
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-badge.retired {
    background: var(--bg-primary);
    color: var(--text-muted);
  }

  .review-count {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .review-btn {
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: var(--bg-primary);
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    margin-left: auto;
  }

  .review-btn:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  .review-btn:active {
    transform: translateY(0);
  }

  .history-content {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
  }
</style>
