<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import type { PinnedNoteInfo } from '../services/types';

  interface Props {
    onNoteSelect: (note: NoteMetadata) => void;
  }

  let { onNoteSelect }: Props = $props();

  let isCollapsed = $state(false);
  let pinnedNoteInfos = $state<PinnedNoteInfo[]>([]);
  let pinnedNotes = $state<NoteMetadata[]>([]);

  console.log('PinnedNotes: Component loaded, pinnedNotesStore:', pinnedNotesStore);

  // Initialize with current value and subscribe to changes
  pinnedNotesStore.subscribe((pinnedNotesFromStore) => {
    console.log('PinnedNotes: Store subscription fired with:', pinnedNotesFromStore);
    pinnedNoteInfos = pinnedNotesFromStore;
  });

  // Use $effect to update pinnedNotes when pinnedNoteInfos or notesStore changes
  $effect(() => {
    console.log('PinnedNotes: Effect triggered - deriving notes');
    console.log('PinnedNotes: pinnedNoteInfos:', pinnedNoteInfos);
    console.log('PinnedNotes: Available notes in notesStore:', notesStore.notes.length);

    const result = pinnedNoteInfos
      .map((pinnedInfo) => {
        console.log('PinnedNotes: Processing pinned note:', pinnedInfo);
        // Find the corresponding note in notesStore
        const fullNote = notesStore.notes.find((note) => note.id === pinnedInfo.id);
        console.log(
          'PinnedNotes: Found full note:',
          fullNote ? fullNote.title : 'NOT FOUND'
        );
        return (
          fullNote ||
          ({
            // Fallback using pinned info if note not found in notesStore
            id: pinnedInfo.id,
            title: pinnedInfo.title,
            filename: pinnedInfo.filename,
            type: 'unknown',
            created: pinnedInfo.pinnedAt,
            modified: pinnedInfo.pinnedAt,
            size: 0,
            tags: [],
            path: ''
          } as NoteMetadata)
        );
      })
      .filter((note) => note !== null);

    console.log('PinnedNotes: Final result:', result);
    pinnedNotes = result;
  });

  function toggleCollapsed() {
    isCollapsed = !isCollapsed;
  }

  function handleNoteClick(note: NoteMetadata) {
    onNoteSelect(note);
  }

  function getNoteIcon(note: NoteMetadata) {
    // Determine icon based on note type or metadata
    if (note.title.includes('daily') || note.title.match(/\d{4}-\d{2}-\d{2}/)) {
      return 'calendar';
    }
    if (note.tags?.includes('project')) {
      return 'folder';
    }
    return 'document';
  }

  function getIconSvg(iconType: string) {
    switch (iconType) {
      case 'calendar':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>`;
      case 'folder':
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"></path>
        </svg>`;
      default:
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
        </svg>`;
    }
  }
</script>

<div class="pinned-notes">
  <div class="section-header">
    <button
      class="collapse-toggle"
      onclick={toggleCollapsed}
      aria-label="Toggle pinned notes section"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class:rotated={!isCollapsed}
      >
        <polyline points="9,18 15,12 9,6"></polyline>
      </svg>
    </button>
    <h3>Pinned</h3>
  </div>

  {#if !isCollapsed}
    <div class="pinned-list">
      {#each pinnedNotes as note (note.id)}
        <button
          class="pinned-item"
          onclick={() => handleNoteClick(note)}
          title={note.title}
        >
          <div class="note-icon">
            {@html getIconSvg(getNoteIcon(note))}
          </div>
          <span class="note-title">{note.title}</span>
        </button>
      {:else}
        <div class="empty-state">
          <p>No pinned notes</p>
          <p class="empty-hint">Pin notes to keep them handy</p>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pinned-notes {
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-primary);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
  }

  .collapse-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 0.25rem;
  }

  .collapse-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .collapse-toggle svg {
    transition: transform 0.2s ease;
  }

  .collapse-toggle svg.rotated {
    transform: rotate(90deg);
  }

  .section-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .pinned-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .pinned-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1.25rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .pinned-item:hover {
    background: var(--bg-hover);
  }

  .note-icon {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .note-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-state {
    padding: 1.5rem 1.25rem;
    text-align: center;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .empty-hint {
    font-size: 0.75rem !important;
    margin-top: 0.25rem !important;
    opacity: 0.7;
  }
</style>
