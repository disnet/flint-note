<script lang="ts">
  /**
   * Daily view component for the Automerge version
   * Shows a week view with daily note editors for each day
   */
  import AutomergeWeekNavigation from './AutomergeWeekNavigation.svelte';
  import AutomergeDaySection from './AutomergeDaySection.svelte';
  import LoadingMessage from './LoadingMessage.svelte';
  import {
    getWeekData,
    updateDailyNote,
    getOrCreateDailyNote,
    setActiveNoteId,
    addNoteToWorkspace,
    type Note,
    type WeekData
  } from '../lib/automerge';
  import {
    formatDayHeader,
    isToday,
    getCurrentWeek,
    getPreviousWeek,
    getNextWeek
  } from '../utils/dateUtils';

  interface Props {
    onNoteSelect?: (note: Note) => void;
  }

  let { onNoteSelect }: Props = $props();

  // Week state
  let currentWeekStart = $state(getCurrentWeek().startDate);

  // Reactive week data
  const weekData: WeekData = $derived(getWeekData(currentWeekStart));

  // References to day sections for keyboard shortcuts
  let daySectionRefs = $state<Record<number, AutomergeDaySection>>({});

  function handleNavigateToWeek(startDate: string): void {
    currentWeekStart = startDate;
  }

  function handleDailyNoteUpdate(date: string, content: string): void {
    updateDailyNote(date, content);
  }

  function handleDailyNoteTitleClick(date: string): void {
    // Open the daily note, creating it if necessary
    const dailyNote = getOrCreateDailyNote(date);
    if (dailyNote) {
      setActiveNoteId(dailyNote.id);
      addNoteToWorkspace(dailyNote.id);
      onNoteSelect?.(dailyNote);
    }
  }

  function handleDailyNoteTitleClickSidebar(date: string): void {
    // For Automerge version, just open the note
    // Shelf functionality can be added later if needed
    handleDailyNoteTitleClick(date);
  }

  // Focus today's entry
  function focusToday(): void {
    const todayIndex = weekData?.days.findIndex((day) => isToday(day.date));
    if (todayIndex !== undefined && todayIndex !== -1) {
      daySectionRefs[todayIndex]?.focus();
    }
  }

  // Navigate to previous week
  function navigateToPreviousWeek(): void {
    const weekRange = {
      startDate: currentWeekStart,
      endDate: weekData.endDate,
      year: new Date(currentWeekStart).getFullYear(),
      weekNumber: 1
    };
    const previousWeek = getPreviousWeek(weekRange);
    currentWeekStart = previousWeek.startDate;
  }

  // Navigate to next week
  function navigateToNextWeek(): void {
    const weekRange = {
      startDate: currentWeekStart,
      endDate: weekData.endDate,
      year: new Date(currentWeekStart).getFullYear(),
      weekNumber: 1
    };
    const nextWeek = getNextWeek(weekRange);
    currentWeekStart = nextWeek.startDate;
  }

  // Listen for focus-today event (triggered by menu navigation)
  $effect(() => {
    function handleFocusToday(): void {
      // Wait for data to load, then focus
      const attemptFocus = (attempts = 0): void => {
        if (weekData && weekData.days.length > 0) {
          focusToday();
        } else if (attempts < 10) {
          setTimeout(() => attemptFocus(attempts + 1), 100);
        }
      };
      attemptFocus();
    }

    document.addEventListener('daily-view-focus-today', handleFocusToday);
    return () => document.removeEventListener('daily-view-focus-today', handleFocusToday);
  });

  // Keyboard shortcuts for daily view
  $effect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Don't trigger shortcuts if user is typing in an input/textarea
      const target = event.target as HTMLElement;
      const isEditableElement =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('.cm-editor'); // CodeMirror editor

      // Escape: blur focused editor (even if in editor)
      if (event.key === 'Escape') {
        if (isEditableElement) {
          event.preventDefault();
          (document.activeElement as HTMLElement)?.blur();
        }
        return;
      }

      // Don't process other shortcuts if typing
      if (isEditableElement) {
        return;
      }

      // T: Focus today's entry
      if (event.key === 't' || event.key === 'T') {
        event.preventDefault();
        focusToday();
        return;
      }

      // [: Previous week
      if (event.key === '[') {
        event.preventDefault();
        navigateToPreviousWeek();
        return;
      }

      // ]: Next week
      if (event.key === ']') {
        event.preventDefault();
        navigateToNextWeek();
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });
</script>

<div class="daily-view">
  {#if weekData}
    <AutomergeWeekNavigation {weekData} onNavigateToWeek={handleNavigateToWeek} />

    <div class="timeline-container">
      <div class="timeline">
        {#each weekData.days as dayData, index (dayData.date)}
          <AutomergeDaySection
            bind:this={daySectionRefs[index]}
            {dayData}
            dayHeader={formatDayHeader(dayData.date)}
            isToday={isToday(dayData.date)}
            onDailyNoteUpdate={handleDailyNoteUpdate}
            onDailyNoteTitleClick={handleDailyNoteTitleClick}
            onDailyNoteTitleClickSidebar={handleDailyNoteTitleClickSidebar}
          />
        {/each}
      </div>
    </div>
  {:else}
    <div class="loading-container">
      <LoadingMessage />
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
    overflow-y: auto;
    padding: 0;
  }

  .timeline {
    max-width: 900px;
    margin: 0 auto;
    padding: 1rem 0 2rem;
    display: flex;
    flex-direction: column;
    gap: 0;
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
