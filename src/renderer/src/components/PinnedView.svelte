<script lang="ts">
  import type { NoteMetadata } from '../services/noteStore';
  import { pinnedNotesStore } from '../services/pinnedStore';
  import { notesStore } from '../services/noteStore';

  interface Props {
    onNoteSelect: (note: NoteMetadata) => void;
  }

  let { onNoteSelect }: Props = $props();

  let pinnedNotes = $state<NoteMetadata[]>([]);

  // Subscribe to both stores and update pinnedNotes reactively
  $effect(() => {
    const unsubscribePinned = pinnedNotesStore.subscribe((pinnedNotesList) => {
      const allNotes = $notesStore.notes;

      // Match pinned note IDs with full note metadata
      const matchedNotes = pinnedNotesList
        .map((pinnedNote) => {
          const fullNote = allNotes.find((note) => note.id === pinnedNote.id);
          return fullNote;
        })
        .filter((note) => note !== undefined) as NoteMetadata[];

      pinnedNotes = matchedNotes;
    });

    return unsubscribePinned;
  });

  function handleNoteClick(note: NoteMetadata): void {
    onNoteSelect(note);
  }

  function handleUnpin(noteId: string, event: Event): void {
    event.stopPropagation();
    pinnedNotesStore.unpinNote(noteId);
  }
</script>

<div class="pinned-view">
  <div class="pinned-header">
    <h2>Pinned Notes</h2>
    <span class="count">{pinnedNotes.length} pinned</span>
  </div>

  {#if pinnedNotes.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📌</div>
      <h3>No pinned notes yet</h3>
      <p>
        Pin your important notes for quick access by clicking the pin button in the note
        editor.
      </p>
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
          <div class="pin-indicator">
            <button
              class="unpin-btn"
              onclick={(e) => handleUnpin(note.id, e)}
              aria-label="Unpin note"
              title="Unpin note"
            >
              📌
            </button>
          </div>
          <div class="note-info">
            <h4 class="note-title">{note.title}</h4>
            <div class="note-details">
              <span class="note-type">{note.type}</span>
              <span class="note-modified">
                Modified {new Date(note.modified).toLocaleDateString()}
              </span>
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
    background: var(--bg-secondary);
  }

  .pinned-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-primary);
  }

  .pinned-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .count {
    font-size: 0.875rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0;
    color: var(--text-secondary);
    max-width: 300px;
    line-height: 1.5;
  }

  .pinned-list {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .pinned-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    margin-bottom: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .pinned-item:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
    box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.05);
  }

  .pin-indicator {
    flex-shrink: 0;
  }

  .unpin-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
    opacity: 0.7;
  }

  .unpin-btn:hover {
    opacity: 1;
    background: var(--bg-hover);
    transform: scale(1.1);
  }

  .note-info {
    flex: 1;
    min-width: 0;
  }

  .note-title {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-details {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .note-type {
    background: var(--accent-secondary-alpha);
    color: var(--accent-primary);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-weight: 500;
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  /* Custom scrollbar styling */
  .pinned-list::-webkit-scrollbar {
    width: 8px;
  }

  .pinned-list::-webkit-scrollbar-track {
    background: var(--bg-secondary);
    border-radius: 4px;
  }

  .pinned-list::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  .pinned-list::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }

  /* Firefox scrollbar styling */
  .pinned-list {
    scrollbar-width: thin;
    scrollbar-color: var(--border-light) var(--bg-secondary);
  }
</style>
