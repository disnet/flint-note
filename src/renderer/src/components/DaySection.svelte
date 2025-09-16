<script lang="ts">
  import DailyNoteEditor from './DailyNoteEditor.svelte';
  import NotesWorkedOn from './NotesWorkedOn.svelte';
  import type { DayData } from '../stores/dailyViewStore.svelte';

  interface Props {
    dayData: DayData;
    dayHeader: string;
    isToday: boolean;
    onNoteClick?: (noteId: string) => void;
    onDailyNoteUpdate?: (date: string, content: string) => void;
  }

  let { dayData, dayHeader, isToday, onNoteClick, onDailyNoteUpdate }: Props = $props();

  // Combine created and modified notes, removing duplicates
  const allNotesWorkedOn = $derived.by(() => {
    const noteMap = new Map();

    // Add created notes
    dayData.createdNotes.forEach((note) => {
      noteMap.set(note.id, { ...note, activity: 'created' });
    });

    // Add modified notes (will overwrite if same note was also created)
    dayData.modifiedNotes.forEach((note) => {
      if (noteMap.has(note.id)) {
        // Note was both created and modified
        noteMap.set(note.id, { ...note, activity: 'created and modified' });
      } else {
        noteMap.set(note.id, { ...note, activity: 'modified' });
      }
    });

    return Array.from(noteMap.values());
  });

  function handleNoteClick(noteId: string): void {
    onNoteClick?.(noteId);
  }

  function handleDailyNoteContentChange(content: string): void {
    // Only trigger update if content is not empty or if we're clearing existing content
    if (content.trim() || dayData.dailyNote) {
      onDailyNoteUpdate?.(dayData.date, content);
    }
  }

  function handleDayTitleClick(): void {
    if (dayData.dailyNote?.id) {
      onNoteClick?.(dayData.dailyNote.id);
    }
  }
</script>

<div class="day-section" class:is-today={isToday}>
  <div class="day-header">
    {#if dayData.dailyNote?.id}
      <button
        class="day-title clickable"
        class:is-today={isToday}
        onclick={handleDayTitleClick}
        type="button"
      >
        {dayHeader}
      </button>
    {:else}
      <h2 class="day-title" class:is-today={isToday}>{dayHeader}</h2>
    {/if}
    {#if isToday}
      <span class="today-badge">Today</span>
    {/if}
  </div>

  <div class="day-content">
    <!-- Daily Note Editor -->
    <div class="daily-note-section">
      <DailyNoteEditor
        content={dayData.dailyNote?.content || ''}
        onContentChange={handleDailyNoteContentChange}
      />
    </div>

    <!-- Notes Worked On -->
    {#if allNotesWorkedOn.length > 0}
      <div class="notes-section">
        <NotesWorkedOn notes={allNotesWorkedOn} onNoteClick={handleNoteClick} />
      </div>
    {/if}
  </div>
</div>

<style>
  .day-section {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .day-section.is-today {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px var(--accent-primary);
  }

  .day-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-light);
  }

  .day-section.is-today .day-header {
    background: var(--accent-light);
  }

  .day-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .day-title.clickable {
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
    transition: color 0.2s ease;
    font-family: inherit;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .day-title.clickable:hover {
    color: var(--accent-primary);
  }

  .day-title.is-today {
    color: var(--accent-primary);
  }

  .day-title.clickable.is-today:hover {
    color: var(--accent-secondary);
  }

  .today-badge {
    background: var(--accent-primary);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .day-content {
    display: flex;
    flex-direction: column;
  }

  .daily-note-section {
    padding: 0;
  }

  .notes-section {
    padding: 0 1.5rem 1.5rem;
    border-top: 1px solid var(--border-light);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .day-header {
      padding: 0.75rem 1rem;
    }

    .day-title {
      font-size: 1.125rem;
    }

    .daily-note-section,
    .notes-section {
      padding-left: 1rem;
      padding-right: 1rem;
    }

    .daily-note-section {
      padding-top: 1rem;
      padding-bottom: 1rem;
    }

    .notes-section {
      padding-bottom: 1rem;
    }
  }
</style>
