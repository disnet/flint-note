<script lang="ts">
  import type { WeekData } from '../stores/dailyViewStore.svelte';
  import { dailyViewStore } from '../stores/dailyViewStore.svelte';
  import { formatWeekRange, getCurrentWeek, isSameWeek } from '../utils/dateUtils';

  interface Props {
    weekData: WeekData;
  }

  let { weekData }: Props = $props();

  // Check if this is the current week
  const currentWeek = getCurrentWeek();
  const isCurrentWeek = $derived(isSameWeek(weekData.startDate, currentWeek.startDate));

  async function handlePreviousWeek(): Promise<void> {
    await dailyViewStore.navigateToPreviousWeek();
  }

  async function handleNextWeek(): Promise<void> {
    await dailyViewStore.navigateToNextWeek();
  }

  async function handleTodayClick(): Promise<void> {
    if (!isCurrentWeek) {
      await dailyViewStore.loadCurrentWeek();
    }
  }

  // Format the week range for display
  const weekRangeText = $derived.by(() => {
    const weekRange = {
      startDate: weekData.startDate,
      endDate: weekData.endDate,
      year: new Date(weekData.startDate).getFullYear(),
      weekNumber: 1 // Mock value for Phase 0
    };
    return formatWeekRange(weekRange, 'short');
  });
</script>

<div class="week-navigation">
  <div class="nav-container">
    <button class="nav-button" onclick={handlePreviousWeek} title="Previous week">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="15,18 9,12 15,6"></polyline>
      </svg>
      <span class="nav-text">Previous</span>
    </button>

    <div class="week-display">
      <h1 class="week-title">{weekRangeText}</h1>
      {#if !isCurrentWeek}
        <button
          class="today-button"
          onclick={handleTodayClick}
          title="Jump to current week"
        >
          Today
        </button>
      {/if}
    </div>

    <button class="nav-button" onclick={handleNextWeek} title="Next week">
      <span class="nav-text">Next</span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="9,18 15,12 9,6"></polyline>
      </svg>
    </button>
  </div>
</div>

<style>
  .week-navigation {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-primary);
    flex-shrink: 0;
  }

  .nav-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 800px;
    gap: 1rem;
  }

  .nav-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 80px;
  }

  .nav-button:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
  }

  .nav-text {
    font-size: 0.875rem;
  }

  .week-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
    text-align: center;
  }

  .week-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .today-button {
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.25rem;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .today-button:hover {
    background: var(--accent-primary-dark);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .week-navigation {
      padding: 0.75rem 1rem;
    }

    .nav-container {
      gap: 0.75rem;
    }

    .nav-button {
      min-width: 70px;
      padding: 0.5rem;
    }

    .nav-text {
      display: none;
    }

    .week-title {
      font-size: 1.25rem;
    }
  }

  @media (max-width: 480px) {
    .nav-button {
      min-width: 48px;
      padding: 0.5rem 0.25rem;
    }

    .week-title {
      font-size: 1.125rem;
    }
  }
</style>
