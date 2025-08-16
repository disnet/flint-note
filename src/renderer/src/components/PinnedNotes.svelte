<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import {
    createDragState,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    calculateDropIndex
  } from '../utils/dragDrop.svelte';
  import { handleCrossSectionDrop } from '../utils/crossSectionDrag.svelte';

  interface Props {
    activeNote: NoteMetadata | null;
    onNoteSelect: (note: NoteMetadata) => void;
  }

  let { activeNote, onNoteSelect }: Props = $props();

  let isCollapsed = $state(false);
  let pinnedNotes = $state<NoteMetadata[]>([]);

  const dragState = createDragState();

  // Use $effect to update pinnedNotes when pinnedNotesStore or notesStore changes
  $effect(() => {
    const result = pinnedNotesStore.notes
      .map((pinnedInfo) => {
        // Find the corresponding note in notesStore
        const fullNote = notesStore.notes.find((note) => note.id === pinnedInfo.id);

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

    pinnedNotes = result;
  });

  function toggleCollapsed(): void {
    isCollapsed = !isCollapsed;
  }

  function handleNoteClick(note: NoteMetadata): void {
    onNoteSelect(note);
  }

  function getNoteIcon(note: NoteMetadata): string {
    // Determine icon based on note type or metadata
    if (note.title.includes('daily') || note.title.match(/\d{4}-\d{2}-\d{2}/)) {
      return 'calendar';
    }
    if (note.tags?.includes('project')) {
      return 'folder';
    }
    return 'document';
  }

  function getIconSvg(iconType: string): string {
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

  function onDragStart(event: DragEvent, note: NoteMetadata): void {
    handleDragStart(event, note.id, 'pinned', dragState);
  }

  function onDragOver(event: DragEvent, index: number, element: HTMLElement): void {
    handleDragOver(event, index, 'pinned', dragState, element);
  }

  function onDrop(event: DragEvent, targetIndex: number): void {
    event.preventDefault();

    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    const { id, type } = JSON.parse(data);
    const position = dragState.dragOverPosition || 'bottom';

    // Calculate the actual drop index based on position
    const sourceIndex =
      type === 'pinned'
        ? pinnedNotesStore.notes.findIndex((n) => n.id === id)
        : undefined;
    const dropIndex = calculateDropIndex(targetIndex, position, sourceIndex);

    // Handle cross-section drag
    if (handleCrossSectionDrop(id, type, 'pinned', dropIndex)) {
      handleDragEnd(dragState);
      return;
    }

    // Handle same-section reorder
    if (type === 'pinned' && sourceIndex !== undefined) {
      if (sourceIndex !== dropIndex) {
        pinnedNotesStore.reorderNotes(sourceIndex, dropIndex);
      }
    }

    handleDragEnd(dragState);
  }

  function onDragEnd(): void {
    handleDragEnd(dragState);
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
    Pinned
  </div>

  {#if !isCollapsed}
    <div class="pinned-list">
      {#each pinnedNotes as note, index (note.id)}
        <button
          class="pinned-item"
          class:active={activeNote?.id === note.id}
          class:dragging={dragState.draggedId === note.id}
          class:drag-over-top={dragState.dragOverIndex === index &&
            dragState.dragOverSection === 'pinned' &&
            dragState.dragOverPosition === 'top'}
          class:drag-over-bottom={dragState.dragOverIndex === index &&
            dragState.dragOverSection === 'pinned' &&
            dragState.dragOverPosition === 'bottom'}
          data-id={note.id}
          draggable="true"
          ondragstart={(e) => onDragStart(e, note)}
          ondragover={(e) => onDragOver(e, index, e.currentTarget)}
          ondrop={(e) => onDrop(e, index)}
          ondragend={onDragEnd}
          onclick={() => handleNoteClick(note)}
          title={note.title}
        >
          <div class="drag-handle">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="9" cy="12" r="1"></circle>
              <circle cx="15" cy="12" r="1"></circle>
              <circle cx="9" cy="5" r="1"></circle>
              <circle cx="15" cy="5" r="1"></circle>
              <circle cx="9" cy="19" r="1"></circle>
              <circle cx="15" cy="19" r="1"></circle>
            </svg>
          </div>
          <div class="note-icon">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
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
  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 1.65rem;
    background: var(--bg-secondary);
    color: var(--text-muted);
  }

  .collapse-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0;
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

  .pinned-list {
    display: flex;
    flex-direction: column;
    padding: 0 1.25rem;
  }

  .pinned-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.4rem;
    border-radius: 0.4rem;
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

  .pinned-item.active {
    background: var(--accent-light);
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
