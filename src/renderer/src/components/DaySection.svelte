<script lang="ts">
  /**
   * Day section component for the Automerge daily view
   * Shows a single day with its daily note editor
   */
  import DailyNoteEditor from './DailyNoteEditor.svelte';
  import type { DayData } from '../lib/automerge';

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
  let editorRef: DailyNoteEditor | undefined = $state();
  // Reference to the container element for scrolling
  let containerRef: HTMLDivElement | undefined = $state();

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
  <button
    class="day-label"
    class:is-today={isToday}
    onclick={handleDayLabelClick}
    type="button"
    title="Open {dayHeader}"
  >
    {dayHeader}
  </button>

  <div class="day-content">
    <DailyNoteEditor bind:this={editorRef} date={dayData.date} />
  </div>
</div>

<style>
  .day-section {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--border-secondary, rgba(128, 128, 128, 0.15));
    padding-bottom: 0.5rem;
  }

  .day-label {
    display: block;
    background: none;
    border: none;
    padding: 0.5rem 0 0.25rem;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary);
    transition: color 0.2s ease;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .day-label:hover {
    color: var(--accent-primary);
  }

  .day-label.is-today {
    color: var(--accent-primary);
  }

  .day-content {
    padding-bottom: 0.5rem;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .day-label {
      font-size: 0.75rem;
    }

    .day-content {
      padding-bottom: 0.25rem;
    }
  }
</style>
