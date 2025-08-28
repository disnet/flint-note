<script lang="ts">
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';

  interface Props {
    onNoteSelect: (note: NoteMetadata) => void;
  }

  let { onNoteSelect }: Props = $props();

  let pinnedNotes = $state<NoteMetadata[]>([]);

  // Update pinnedNotes reactively based on both stores
  $effect(() => {
    const allNotes = notesStore.notes;
    const pinnedNotesList = pinnedNotesStore.notes;

    // Match pinned note IDs with full note metadata
    const matchedNotes = pinnedNotesList
      .map((pinnedNote) => {
        const fullNote = allNotes.find((note) => note.id === pinnedNote.id);
        return fullNote;
      })
      .filter((note) => note !== undefined) as NoteMetadata[];

    pinnedNotes = matchedNotes;
  });

  function handleNoteClick(note: NoteMetadata): void {
    onNoteSelect(note);
  }

  async function handleUnpin(noteId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await pinnedNotesStore.unpinNote(noteId);
    } catch (error) {
      console.error('Failed to unpin note:', error);
    }
  }
</script>

<div class="pinned-view">
  <div class="pinned-header">
    <h2>📌 Pinned</h2>
    <span class="count">{pinnedNotes.length}</span>
  </div>

  {#if pinnedNotes.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📌</div>
      <p>Pin notes for quick access</p>
    </div>
  {:else}
    <div class="pinned-list">
      {#each pinnedNotes as note (note.id)}
        <div
          class="pinned-item"
          role="button"
          tabindex="0"
          onclick={() => handleNoteClick(note)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleNoteClick(note);
            }
          }}
        >
          <div class="note-content">
            <div class="note-header">
              <h4 class="note-title" title={note.title}>{note.title}</h4>
              <button
                class="unpin-btn"
                onclick={(e) => handleUnpin(note.id, e)}
                aria-label="Unpin note"
                title="Unpin note"
              >
                ×
              </button>
            </div>
            <div class="note-meta">
              <span class="note-type">{note.type}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pinned-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
  }

  .pinned-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-primary);
  }

  .pinned-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .count {
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0.125rem 0.5rem;
    border-radius: 0.75rem;
    min-width: 1.5rem;
    text-align: center;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 1rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .pinned-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .pinned-item {
    padding: 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    margin-bottom: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .pinned-item:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  }

  .note-content {
    width: 100%;
  }

  .note-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .note-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
    line-height: 1.2;
  }

  .unpin-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0;
    color: var(--text-tertiary);
    transition: all 0.2s ease;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .unpin-btn:hover {
    color: var(--text-primary);
    transform: scale(1.1);
  }

  .note-meta {
    display: flex;
    align-items: center;
  }

  .note-type {
    background: var(--accent-secondary-alpha);
    color: var(--accent-primary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-weight: 500;
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  /* Custom scrollbar styling - narrower for the panel */
  .pinned-list::-webkit-scrollbar {
    width: 4px;
  }

  .pinned-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .pinned-list::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 2px;
    transition: background 0.2s ease;
  }

  .pinned-list::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }

  /* Firefox scrollbar styling */
  .pinned-list {
    scrollbar-width: thin;
    scrollbar-color: var(--border-light) transparent;
  }
</style>
