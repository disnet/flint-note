<script lang="ts">
  import { reviewStore } from '../../stores/reviewStore.svelte';
  import { notesStore } from '../../services/noteStore.svelte';
  import { wikilinkService } from '../../services/wikilinkService.svelte';
  import ReviewHistoryPanel from './ReviewHistoryPanel.svelte';
  import type { ReviewItem } from '../../types/review';

  interface Props {
    onReviewNote: (noteId: string) => void;
    searchQuery?: string;
  }

  let { onReviewNote, searchQuery = '' }: Props = $props();

  interface EnrichedReviewItem extends ReviewItem {
    noteTitle: string;
    isOverdue: boolean;
    isDueToday: boolean;
    lastResult: 'passed' | 'failed' | null;
    estimatedDueDate: string; // Queue-adjusted estimated due date
    queuePosition: number; // Position in the review queue
  }

  let reviewItems = $state<EnrichedReviewItem[]>([]);
  let isLoading = $state(false);
  let expandedNoteId = $state<string | null>(null);

  // Filtered and sorted items (always sorted by estimated due date, ascending)
  const filteredItems = $derived.by(() => {
    let items = reviewItems;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter((item) => item.noteTitle.toLowerCase().includes(query));
    }

    // Sort by estimated due date (queue-adjusted), then by queue position
    items = [...items].sort((a, b) => {
      const dateCompare = a.estimatedDueDate.localeCompare(b.estimatedDueDate);
      if (dateCompare !== 0) return dateCompare;
      return a.queuePosition - b.queuePosition;
    });

    return items;
  });

  // Load and reload when session availability or stats change
  $effect(() => {
    // Access reactive values to create dependencies - reading them creates the dependency
    const isAvailable = reviewStore.isSessionAvailable;
    const sessionNumber = reviewStore.stats.currentSessionNumber;
    const isLoading = reviewStore.isLoadingStats;

    // Only load once stats have been fetched and are not still loading
    // This ensures we have the correct isSessionAvailable value from the backend
    if (!isLoading && sessionNumber > 0) {
      void isAvailable; // Ensure we track this dependency
      loadReviewItems();
    }
  });

  /**
   * Calculate queue-adjusted due dates for all items
   * Takes into account session size limits and session availability
   */
  function calculateQueueAdjustedDates(
    items: Array<
      ReviewItem & { noteTitle: string; lastResult: 'passed' | 'failed' | null }
    >,
    currentSession: number,
    sessionSize: number,
    sessionsPerWeek: number,
    isSessionAvailable: boolean
  ): EnrichedReviewItem[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Sort items by priority: session number first, then by how overdue (most overdue first)
    const sortedItems = [...items].sort((a, b) => {
      // First by session number
      if (a.nextSessionNumber !== b.nextSessionNumber) {
        return a.nextSessionNumber - b.nextSessionNumber;
      }
      // Then by next review date (earlier = more overdue = higher priority)
      return a.nextReview.localeCompare(b.nextReview);
    });

    // Group items by which session they'll actually be reviewed in
    // accounting for session size limits
    const result: EnrichedReviewItem[] = [];

    // If session is not available (completed for today), next available is tomorrow
    // So we start counting from session + 1, and base date is tomorrow
    const baseSession = isSessionAvailable ? currentSession : currentSession + 1;
    const baseDate = new Date(today);
    if (!isSessionAvailable) {
      baseDate.setDate(baseDate.getDate() + 1);
    }

    let currentQueueSession = baseSession;
    let itemsInCurrentSession = 0;

    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];

      // Determine the earliest session this item could be reviewed
      const itemEarliestSession = Math.max(item.nextSessionNumber, baseSession);

      // If this item's earliest session is beyond our current queue session, jump to it
      if (itemEarliestSession > currentQueueSession) {
        currentQueueSession = itemEarliestSession;
        itemsInCurrentSession = 0;
      }

      // If we've filled the current session, move to the next
      if (itemsInCurrentSession >= sessionSize) {
        currentQueueSession++;
        itemsInCurrentSession = 0;
      }

      // Calculate estimated date based on which session this item will actually be in
      const sessionsAway = currentQueueSession - baseSession;
      const daysAway = Math.round((sessionsAway / sessionsPerWeek) * 7);
      const estimatedDate = new Date(baseDate);
      estimatedDate.setDate(estimatedDate.getDate() + daysAway);
      // Use local date string to avoid timezone issues (YYYY-MM-DD in local time)
      const estimatedDueDate = `${estimatedDate.getFullYear()}-${String(estimatedDate.getMonth() + 1).padStart(2, '0')}-${String(estimatedDate.getDate()).padStart(2, '0')}`;

      result.push({
        ...item,
        isOverdue: item.nextSessionNumber < currentSession || item.nextReview < todayStr,
        isDueToday: estimatedDueDate === todayStr && isSessionAvailable,
        estimatedDueDate,
        queuePosition: i + 1
      });

      itemsInCurrentSession++;
    }

    return result;
  }

  async function loadReviewItems(): Promise<void> {
    isLoading = true;
    try {
      const items = await reviewStore.getAllReviewHistory();
      const currentSession = reviewStore.stats.currentSessionNumber;
      const sessionSize = reviewStore.config.sessionSize;
      const sessionsPerWeek = reviewStore.config.sessionsPerWeek;
      const isSessionAvailable = reviewStore.isSessionAvailable;

      // First pass: add note titles and last result
      const enrichedItems = items.map((item) => {
        const note = notesStore.allNotes.find((n) => n.id === item.noteId);
        const lastHistoryEntry =
          item.reviewHistory.length > 0
            ? item.reviewHistory[item.reviewHistory.length - 1]
            : null;

        return {
          ...item,
          noteTitle: note?.title || 'Unknown Note',
          lastResult: (lastHistoryEntry
            ? lastHistoryEntry.rating >= 2
              ? 'passed'
              : 'failed'
            : null) as 'passed' | 'failed' | null
        };
      });

      // Calculate queue-adjusted dates
      reviewItems = calculateQueueAdjustedDates(
        enrichedItems,
        currentSession,
        sessionSize,
        sessionsPerWeek,
        isSessionAvailable
      );
    } catch (error) {
      console.error('Failed to load review items:', error);
    } finally {
      isLoading = false;
    }
  }

  function toggleExpand(noteId: string): void {
    expandedNoteId = expandedNoteId === noteId ? null : noteId;
  }

  function handleCardClick(noteId: string, event: MouseEvent | KeyboardEvent): void {
    // Don't expand if clicking on a button or interactive element
    const target = event.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    toggleExpand(noteId);
  }

  function handleCardKeyDown(noteId: string, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCardClick(noteId, event);
    }
  }

  function openNote(noteId: string, event: MouseEvent): void {
    const note = notesStore.allNotes.find((n) => n.id === noteId);
    if (note) {
      wikilinkService.handleWikilinkClick(noteId, note.title, false, event.shiftKey);
    }
  }

  function formatDate(dateString: string): string {
    // Parse YYYY-MM-DD as local date (not UTC)
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.round(
      (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
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
  {#if isLoading}
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>Loading notes...</p>
    </div>
  {:else if filteredItems.length === 0}
    <div class="empty-state">
      <p>
        {searchQuery.trim()
          ? 'No notes found matching your search.'
          : 'No notes marked for review yet.'}
      </p>
    </div>
  {:else}
    <div class="notes-container">
      {#each filteredItems as item (item.id)}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="note-card"
          class:has-history={item.reviewHistory.length > 0}
          role={item.reviewHistory.length > 0 ? 'button' : undefined}
          tabindex={item.reviewHistory.length > 0 ? 0 : undefined}
          onclick={(e) => handleCardClick(item.noteId, e)}
          onkeydown={(e) => handleCardKeyDown(item.noteId, e)}
        >
          <div class="note-header">
            <button class="note-title" onclick={(e) => openNote(item.noteId, e)}>
              {item.noteTitle}
            </button>
            {#if item.reviewHistory.length > 0}
              <button
                class="expand-btn"
                onclick={() => toggleExpand(item.noteId)}
                aria-label="Toggle history"
              >
                <svg
                  class="expand-icon"
                  class:expanded={expandedNoteId === item.noteId}
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
              {formatDate(item.estimatedDueDate)}
            </span>

            {#if item.lastResult}
              <span class="result-badge" class:passed={item.lastResult === 'passed'}>
                {item.lastResult === 'passed' ? '✓ Passed' : '✗ Failed'}
              </span>
            {/if}

            <button class="review-btn" onclick={() => onReviewNote(item.noteId)}>
              Review Now
            </button>
          </div>

          {#if expandedNoteId === item.noteId && item.reviewHistory.length > 0}
            <div class="history-content">
              <ReviewHistoryPanel history={item.reviewHistory} compact={true} />
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
    margin-top: 1.5rem;
  }

  .loading,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    gap: 1rem;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading p,
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
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .note-card.has-history {
    cursor: pointer;
  }

  .note-card:hover {
    border-color: var(--accent-primary);
    box-shadow:
      0 2px 12px rgba(0, 0, 0, 0.1),
      0 0 0 1px var(--accent-primary),
      0 0 20px rgba(var(--accent-primary-rgb, 59, 130, 246), 0.15);
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
    background: var(--bg-secondary);
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
    border-top: 1px solid var(--border);
  }
</style>
