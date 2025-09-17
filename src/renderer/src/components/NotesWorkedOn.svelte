<script lang="ts">
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface NoteWithActivity extends NoteMetadata {
    activity: 'created' | 'modified' | 'created and modified';
  }

  interface Props {
    notes: NoteWithActivity[];
    onNoteClick?: (noteId: string) => void;
  }

  let { notes, onNoteClick }: Props = $props();

  function handleNoteClick(noteId: string): void {
    onNoteClick?.(noteId);
  }

  function getActivityText(activity: string): string {
    switch (activity) {
      case 'created':
        return 'Created';
      case 'modified':
        return 'Modified';
      case 'created and modified':
        return 'Created & Modified';
      default:
        return 'Worked on';
    }
  }
</script>

<div class="notes-worked-on">
  <div class="section-header">
    <h3 class="section-title">Notes worked on this day</h3>
    <span class="notes-count">{notes.length}</span>
  </div>

  <div class="notes-list">
    {#each notes as note (note.id)}
      <button
        class="note-link"
        onclick={() => handleNoteClick(note.id)}
        title="Click to open {note.title} ({getActivityText(note.activity)})"
      >
        {note.title}
      </button>
    {/each}
  </div>
</div>

<style>
  .notes-worked-on {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 1rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .notes-count {
    background: var(--bg-tertiary);
    color: var(--text-tertiary);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    min-width: 20px;
    text-align: center;
  }

  .notes-list {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .notes-list::-webkit-scrollbar {
    width: 6px;
  }

  .notes-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .notes-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
    transition: background-color 0.2s ease;
  }

  .notes-list::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  .note-link {
    display: inline-block;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary);
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 25ch;
  }

  .note-link:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .section-title {
      font-size: 0.8125rem;
    }

    .note-link {
      padding: 0.375rem 0.5rem;
      font-size: 0.8125rem;
      max-width: 20ch;
    }
  }
</style>
