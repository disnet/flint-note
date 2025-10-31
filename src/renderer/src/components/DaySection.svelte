<script lang="ts">
  import DailyNoteEditor from './DailyNoteEditor.svelte';
  import type { DayData } from '../stores/dailyViewStore.svelte';
  import { parseISODate } from '../utils/dateUtils.svelte';

  interface Props {
    dayData: DayData;
    dayHeader: string;
    isToday: boolean;
    onNoteClick?: (noteId: string) => void;
    onDailyNoteUpdate?: (date: string, content: string) => void;
    onDailyNoteTitleClick?: (date: string) => void;
    onDailyNoteTitleClickSidebar?: (date: string) => void;
  }

  let {
    dayData,
    dayHeader,
    isToday,
    onDailyNoteUpdate,
    onDailyNoteTitleClick,
    onDailyNoteTitleClickSidebar
  }: Props = $props();

  // Get short day name (Mon, Tue, Wed, etc.)
  const shortDayName = $derived.by(() => {
    const date = parseISODate(dayData.date);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  });

  function handleDailyNoteContentChange(content: string): void {
    // Only trigger update if content is not empty or if we're clearing existing content
    if (content.trim() || dayData.dailyNote) {
      onDailyNoteUpdate?.(dayData.date, content);
    }
  }

  function handleDayLabelClick(event: MouseEvent): void {
    if (event.shiftKey) {
      // Shift-click: open in sidebar
      onDailyNoteTitleClickSidebar?.(dayData.date);
    } else {
      // Regular click: open in main view
      onDailyNoteTitleClick?.(dayData.date);
    }
  }
</script>

<div class="day-section" class:is-today={isToday}>
  <div class="day-gutter">
    <button
      class="day-label"
      class:is-today={isToday}
      onclick={handleDayLabelClick}
      type="button"
      title="Open {dayHeader}"
    >
      {shortDayName}
    </button>
  </div>

  <div class="day-content">
    <DailyNoteEditor
      content={dayData.dailyNote?.content || ''}
      onContentChange={handleDailyNoteContentChange}
    />
    <!-- <div class="day-divider"></div> -->
  </div>
</div>

<style>
  .day-section {
    display: grid;
    grid-template-columns: 80px 1fr;
    /*min-height: 120px;*/
  }

  .day-gutter {
    position: sticky;
    top: 0;
    height: fit-content;
    padding: 1rem 0.5rem;
    z-index: 10;
  }

  .day-label {
    display: block;
    width: 100%;
    background: none;
    border: none;
    padding: 0.5rem;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    transition: color 0.2s ease;
    text-transform: uppercase;
    text-decoration: underline;
    letter-spacing: 0.05em;
  }

  .day-label:hover {
    color: var(--accent-primary);
  }

  .day-label.is-today {
    color: var(--accent-primary);
  }

  .day-content {
    padding: 1rem 0;
    /*min-height: 120px;*/
  }

  .day-divider {
    border-bottom: 1px solid var(--border-light);
    margin-top: 1rem;
    margin-bottom: 0;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .day-section {
      grid-template-columns: 60px 1fr;
    }

    .day-gutter {
      padding: 0.75rem 0.25rem;
    }

    .day-label {
      font-size: 0.75rem;
      padding: 0.25rem;
    }

    .day-content {
      padding: 0.75rem 0;
    }
  }
</style>
