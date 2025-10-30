<script lang="ts">
  import WeekNavigation from './WeekNavigation.svelte';
  import DaySection from './DaySection.svelte';
  import LoadingMessage from './LoadingMessage.svelte';
  import { dailyViewStore } from '../stores/dailyViewStore.svelte';
  import { formatDayHeader, isToday } from '../utils/dateUtils.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    onNoteSelect?: (note: NoteMetadata) => void;
  }

  let { onNoteSelect }: Props = $props();

  // Reactive getters from store
  const weekData = $derived(dailyViewStore.weekData);
  const loading = $derived(dailyViewStore.loading);

  function handleNoteClick(noteId: string): void {
    // Find the note from our week data (including daily notes)
    const weekData = dailyViewStore.weekData;
    if (!weekData) return;

    for (const day of weekData.days) {
      // Check daily note first
      if (day.dailyNote?.id === noteId) {
        onNoteSelect?.(day.dailyNote);
        return;
      }

      // Then check created/modified notes
      const allNotes = [...day.createdNotes, ...day.modifiedNotes];
      const note = allNotes.find((n) => n.id === noteId);
      if (note) {
        onNoteSelect?.(note);
        return;
      }
    }
  }

  function handleDailyNoteUpdate(date: string, content: string): void {
    // Update the daily note content
    dailyViewStore.updateDailyNote(date, content);
  }

  async function handleDailyNoteTitleClick(date: string): Promise<void> {
    // Open the daily note, creating it if necessary
    const dailyNote = await dailyViewStore.openDailyNote(date);
    if (dailyNote) {
      onNoteSelect?.(dailyNote);
    }
  }

  // Reload data when the component becomes active
  // This ensures fresh data when navigating back to daily view
  $effect(() => {
    // This effect runs when the component is mounted/re-mounted
    // and when reactive dependencies change
    dailyViewStore.loadCurrentWeek();
  });
</script>

<div class="daily-view">
  {#if loading}
    <div class="loading-container">
      <LoadingMessage />
    </div>
  {:else if weekData}
    <WeekNavigation {weekData} />

    <div class="timeline-container">
      <div class="timeline">
        {#each weekData.days as dayData (dayData.date)}
          <DaySection
            {dayData}
            dayHeader={formatDayHeader(dayData.date)}
            isToday={isToday(dayData.date)}
            onNoteClick={handleNoteClick}
            onDailyNoteUpdate={handleDailyNoteUpdate}
            onDailyNoteTitleClick={handleDailyNoteTitleClick}
          />
        {/each}
      </div>
    </div>
  {:else}
    <div class="error-state">
      <div class="error-content">
        <div class="error-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h2>Failed to load daily view</h2>
        <p>There was an error loading your daily notes. Please try refreshing.</p>
        <button onclick={() => dailyViewStore.loadCurrentWeek()}> Refresh </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .daily-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-primary);
    overflow: hidden;
  }

  .loading-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .timeline-container {
    flex: 1;
    overflow: visible;
    padding: 0 1.5rem;
  }

  .timeline {
    max-width: 900px;
    margin: 0 auto;
    padding: 1rem 0 2rem;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .error-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .error-content {
    text-align: center;
    max-width: 400px;
  }

  .error-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
    color: var(--text-tertiary);
  }

  .error-content h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .error-content p {
    margin: 0 0 1.5rem 0;
    color: var(--text-tertiary);
    line-height: 1.5;
  }

  .error-content button {
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    padding: 0.75rem 1.5rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .error-content button:hover {
    background: var(--accent-primary-dark);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .timeline-container {
      padding: 0 1rem;
    }

    .timeline {
      padding: 0.5rem 0 1rem;
      gap: 1rem;
    }
  }
</style>
