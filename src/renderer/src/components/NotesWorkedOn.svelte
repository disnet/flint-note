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

  function getActivityIcon(activity: string): string {
    switch (activity) {
      case 'created':
        return '✨'; // Sparkles for new
      case 'modified':
        return '✏️'; // Pencil for edited
      case 'created and modified':
        return '🆕'; // New badge for both
      default:
        return '📝'; // Note for default
    }
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
        class="note-item"
        onclick={() => handleNoteClick(note.id)}
        title="Click to open {note.title}"
      >
        <div class="note-content">
          <span class="activity-icon" title={getActivityText(note.activity)}>
            {getActivityIcon(note.activity)}
          </span>
          <span class="note-title">[{note.title}]</span>
          {#if note.tags && note.tags.length > 0}
            <div class="note-tags">
              {#each note.tags.slice(0, 3) as tag, index (index)}
                <span class="tag">#{tag}</span>
              {/each}
              {#if note.tags.length > 3}
                <span class="tag-more">+{note.tags.length - 3}</span>
              {/if}
            </div>
          {/if}
        </div>

        <div class="note-meta">
          <span class="activity-text">{getActivityText(note.activity)}</span>
          {#if note.size}
            <span class="note-size">{Math.round(note.size / 100) / 10}k</span>
          {/if}
        </div>
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
    flex-direction: column;
    gap: 0.5rem;
  }

  .note-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
  }

  .note-item:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .note-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0; /* Allow text truncation */
  }

  .activity-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .note-title {
    color: var(--accent-primary);
    font-weight: 500;
    font-size: 0.875rem;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .note-tags {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .tag {
    background: var(--accent-light);
    color: var(--accent-primary);
    font-size: 0.625rem;
    font-weight: 500;
    padding: 0.125rem 0.375rem;
    border-radius: 0.125rem;
    white-space: nowrap;
  }

  .tag-more {
    color: var(--text-tertiary);
    font-size: 0.625rem;
    font-weight: 500;
  }

  .note-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .activity-text {
    font-weight: 500;
  }

  .note-size {
    opacity: 0.7;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .note-item {
      padding: 0.5rem;
      gap: 0.75rem;
    }

    .note-content {
      gap: 0.5rem;
    }

    .note-tags {
      display: none; /* Hide tags on mobile to save space */
    }

    .note-meta {
      flex-direction: column;
      align-items: flex-end;
      gap: 0.125rem;
    }

    .section-title {
      font-size: 0.8125rem;
    }
  }

  @media (max-width: 480px) {
    .note-size {
      display: none; /* Hide file size on very small screens */
    }
  }
</style>
