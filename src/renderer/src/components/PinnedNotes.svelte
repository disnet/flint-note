<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import {
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    calculateDropIndex
  } from '../utils/dragDrop.svelte';
  import { handleCrossSectionDrop } from '../utils/crossSectionDrag.svelte';
  import { globalDragState } from '../stores/dragState.svelte';
  import { getChatService } from '../services/chatService';
  import { notesShelfStore } from '../stores/notesShelfStore.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';

  interface Props {
    activeNote: NoteMetadata | null;
    onNoteSelect: (note: NoteMetadata) => void;
  }

  let { activeNote, onNoteSelect }: Props = $props();

  let isCollapsed = $state(false);
  let pinnedNotes = $state<NoteMetadata[]>([]);

  const dragState = globalDragState;

  // Check if notes are ready (for consistency with TemporaryTabs)
  let isNotesReady = $derived(!notesStore.loading);

  // Use $effect to update pinnedNotes when pinnedNotesStore or notesStore changes
  $effect(() => {
    const result = pinnedNotesStore.notes
      .map((pinnedInfo) => {
        // Find the corresponding note in notesStore (use allNotes to support archived notes)
        return notesStore.allNotes.find((note) => note.id === pinnedInfo.id);
      })
      .filter((note): note is NoteMetadata => note !== undefined);

    pinnedNotes = result;
  });

  function toggleCollapsed(): void {
    isCollapsed = !isCollapsed;
  }

  async function handleNoteClick(event: MouseEvent, note: NoteMetadata): Promise<void> {
    // Don't allow clicks while notes are loading
    if (!isNotesReady) {
      console.log('[PinnedNotes] Click blocked - notes are not ready');
      return;
    }

    // If shift key is pressed, add to shelf instead of navigating
    if (event.shiftKey) {
      try {
        // Fetch the note content
        const chatService = getChatService();
        const noteContent = await chatService.getNote({ identifier: note.id });

        // Add to shelf (only proceed if we successfully fetched the note)
        if (noteContent) {
          await notesShelfStore.addNote(note.id, note.title, noteContent.content);

          // Open the right sidebar in notes mode if not already visible
          if (
            !sidebarState.rightSidebar.visible ||
            sidebarState.rightSidebar.mode !== 'notes'
          ) {
            await sidebarState.setRightSidebarMode('notes');
            if (!sidebarState.rightSidebar.visible) {
              await sidebarState.toggleRightSidebar();
            }
          }
        }
      } catch (error) {
        console.error('[PinnedNotes] Failed to add note to shelf:', error);
      }
      return;
    }

    onNoteSelect(note);
  }

  function getNoteIcon(note: NoteMetadata): { type: 'emoji' | 'svg'; value: string } {
    // Check for custom note type icon first
    const noteType = notesStore.noteTypes.find((t) => t.name === note.type);
    if (noteType?.icon) {
      return { type: 'emoji', value: noteType.icon };
    }

    // Fall back to smart icon logic based on note metadata
    if (note.title.includes('daily') || note.title.match(/\d{4}-\d{2}-\d{2}/)) {
      return { type: 'svg', value: 'calendar' };
    }
    if (note.tags?.includes('project')) {
      return { type: 'svg', value: 'folder' };
    }
    return { type: 'svg', value: 'document' };
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

  async function onDrop(event: DragEvent, targetIndex: number): Promise<void> {
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
    if (await handleCrossSectionDrop(id, type, 'pinned', dropIndex)) {
      handleDragEnd(dragState);
      return;
    }

    // Handle same-section reorder
    if (type === 'pinned' && sourceIndex !== undefined) {
      if (sourceIndex !== dropIndex) {
        try {
          await pinnedNotesStore.reorderNotes(sourceIndex, dropIndex);
        } catch (error) {
          console.error('Failed to reorder notes:', error);
        }
      }
    }

    handleDragEnd(dragState);
  }

  function onDragEnd(): void {
    handleDragEnd(dragState);
  }

  // Auto-scroll to active note when it changes
  $effect(() => {
    const activeId = activeNote?.id;
    if (activeId && isNotesReady && !isCollapsed) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        const activeElement = document.querySelector(
          `.pinned-item[data-id="${activeId}"]`
        ) as HTMLElement;
        if (activeElement) {
          activeElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
          });
        }
      }, 50);
    }
  });
</script>

<div class="pinned-notes">
  <div
    class="section-header"
    onclick={toggleCollapsed}
    onkeydown={(e) => e.key === 'Enter' && toggleCollapsed()}
    role="button"
    tabindex="0"
  >
    Pinned
    <button class="collapse-toggle" aria-label="Toggle pinned notes section">
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
  </div>

  {#if !isCollapsed}
    <div class="pinned-list">
      {#each pinnedNotes as note, index (note.id)}
        <button
          class="pinned-item"
          class:active={activeNote?.id === note.id}
          class:loading={!isNotesReady}
          class:archived={note.archived}
          class:dragging={dragState.draggedId === note.id}
          class:drag-over-top={dragState.dragOverIndex === index &&
            dragState.dragOverSection === 'pinned' &&
            dragState.dragOverPosition === 'top'}
          class:drag-over-bottom={dragState.dragOverIndex === index &&
            dragState.dragOverSection === 'pinned' &&
            dragState.dragOverPosition === 'bottom'}
          data-id={note.id}
          draggable={isNotesReady}
          ondragstart={(e) => onDragStart(e, note)}
          ondragover={(e) => onDragOver(e, index, e.currentTarget)}
          ondrop={(e) => onDrop(e, index)}
          ondragend={onDragEnd}
          onclick={(e) => handleNoteClick(e, note)}
          title={!isNotesReady ? 'Loading...' : note.title}
        >
          <div class="note-icon">
            {#if getNoteIcon(note).type === 'emoji'}
              <span class="emoji-icon">{getNoteIcon(note).value}</span>
            {:else}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html getIconSvg(getNoteIcon(note).value)}
            {/if}
          </div>
          <span class="note-title">
            {#if note.title}
              {note.title}
            {:else}
              <span class="untitled-text">Untitled</span>
            {/if}
          </span>
        </button>
      {:else}
        <div
          class="empty-state"
          class:drag-target={dragState.isDragging &&
            dragState.draggedType === 'temporary' &&
            dragState.dragOverSection === 'pinned'}
          role="button"
          tabindex="-1"
          ondragover={(e) => {
            e.preventDefault();
            if (dragState.draggedType === 'temporary') {
              dragState.dragOverSection = 'pinned';
              dragState.dragOverIndex = 0;
            }
          }}
          ondragleave={(e) => {
            // Only clear if we're actually leaving the empty state area
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;
            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
              dragState.dragOverSection = null;
              dragState.dragOverIndex = null;
            }
          }}
          ondrop={(e) => onDrop(e, 0)}
        >
          <p>No pinned notes</p>
          <p class="empty-hint">
            {#if dragState.isDragging && dragState.draggedType === 'temporary'}
              Drop here to pin note
            {:else}
              Pin notes to keep them handy
            {/if}
          </p>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .section-header {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    padding: 0.3rem 1rem;
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
    padding: 0 0.75rem;
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

  .pinned-item.loading {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }

  .pinned-item.archived {
    opacity: 0.6;
  }

  .pinned-item.archived:hover {
    opacity: 0.8;
  }

  .pinned-item.archived .note-title {
    font-style: italic;
  }

  .note-icon {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .emoji-icon {
    font-size: 14px;
    line-height: 1;
  }

  .note-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .untitled-text {
    color: var(--text-placeholder);
    font-style: italic;
  }

  .empty-state {
    padding: 1.5rem 1.25rem;
    text-align: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 0.75rem;
    min-height: 4rem;
    border: 2px solid transparent;
    position: relative;
    overflow: hidden;
  }

  .empty-state::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, var(--accent-light), transparent);
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .empty-state.drag-target {
    background: var(--accent-light);
    border-color: var(--accent-primary);
    border-style: dashed;
    box-shadow: 0 2px 12px rgba(0, 123, 255, 0.15);
  }

  .empty-state.drag-target::before {
    opacity: 0.1;
  }

  .empty-state p {
    margin: 0;
    color: var(--text-secondary);
    transition: all 0.3s ease;
    position: relative;
    z-index: 1;
  }

  .empty-state.drag-target p {
    color: var(--accent-primary);
  }

  .empty-hint {
    font-size: 0.75rem !important;
    margin-top: 0.5rem !important;
    opacity: 0.7;
    transition: all 0.3s ease;
    position: relative;
    z-index: 1;
  }

  .empty-state.drag-target .empty-hint {
    opacity: 1;
    color: var(--accent-primary) !important;
  }
</style>
