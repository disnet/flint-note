<script lang="ts">
  /**
   * Day section component for the Automerge daily view
   * Shows a single day with its daily note editor
   */
  import DailyNoteEditor from './DailyNoteEditor.svelte';
  import type { DayData } from '../lib/automerge';
  import { parseISODate } from '../utils/dateUtils';

  interface Props {
    dayData: DayData;
    dayHeader: string;
    isToday: boolean;
    onDailyNoteTitleClick?: (date: string) => void;
    onDailyNoteTitleClickSidebar?: (date: string) => void;
  }

  let {
    dayData,
    dayHeader,
    isToday,
    onDailyNoteTitleClick,
    onDailyNoteTitleClickSidebar
  }: Props = $props();

  // Reference to the daily note editor
  let editorRef: DailyNoteEditor;
  // Reference to the container element for scrolling
  let containerRef: HTMLDivElement;

  // Get short day name (Mon, Tue, Wed, etc.)
  const shortDayName = $derived.by(() => {
    const date = parseISODate(dayData.date);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  });

  function handleDayLabelClick(event: MouseEvent): void {
    if (event.shiftKey) {
      // Shift-click: open in sidebar (if supported)
      onDailyNoteTitleClickSidebar?.(dayData.date);
    } else {
      // Regular click: open in main view
      onDailyNoteTitleClick?.(dayData.date);
    }
  }

  // Public method to focus this day's editor and scroll into view
  export function focus(): void {
    // Scroll the section into view with smooth animation
    containerRef?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    // Focus the editor after a brief delay to allow scroll to start
    setTimeout(() => {
      editorRef?.focus();
    }, 100);
  }
</script>

<div bind:this={containerRef} class="day-section" class:is-today={isToday}>
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
    {#if dayData.dailyNote}
      <DailyNoteEditor bind:this={editorRef} noteId={dayData.dailyNote.id} />
    {/if}
  </div>
</div>

<style>
  .day-section {
    display: grid;
    grid-template-columns: 80px 1fr;
  }

  .day-gutter {
    position: sticky;
    top: 0;
    height: fit-content;
    padding: 0.5rem;
    z-index: 10;
  }

  .day-label {
    display: block;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
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
    padding-bottom: 1rem;
    padding-right: 0.5rem;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .day-section {
      grid-template-columns: 60px 1fr;
    }

    .day-gutter {
      padding: 0.5rem 0.25rem;
    }

    .day-label {
      font-size: 0.75rem;
    }

    .day-content {
      padding-bottom: 0.75rem;
    }
  }
</style>
