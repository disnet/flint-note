<script lang="ts">
  /**
   * Recent notes list for the Automerge sidebar
   * Shows notes that are recently accessed in the active workspace but not pinned
   * Supports drag-and-drop reordering with smooth animations
   */
  import {
    getRecentNotes,
    removeNoteFromWorkspace,
    pinNote,
    archiveNote,
    getNoteTypes,
    getActiveNoteId,
    reorderWorkspaceNotes,
    type Note
  } from '../lib/automerge';
  import { useSortableList } from '../lib/useSortableList.svelte';

  interface Props {
    onNoteSelect: (note: Note) => void;
  }

  let { onNoteSelect }: Props = $props();

  // Reactive state
  const recentNotes = $derived(getRecentNotes());
  const activeNoteId = $derived(getActiveNoteId());
  const noteTypes = $derived(getNoteTypes());

  // Drag and drop
  let listElement: HTMLDivElement | undefined = $state();
  const sortable = useSortableList({
    getItems: () => recentNotes,
    onReorder: (from, to) => reorderWorkspaceNotes(from, to)
  });

  $effect(() => {
    if (listElement) {
      sortable.setListElement(listElement);
    }
  });

  // Context menu state
  let contextMenuOpen = $state(false);
  let contextMenuNoteId = $state<string | null>(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });

  function handleTabClick(note: Note): void {
    onNoteSelect(note);
  }

  function handleCloseTab(noteId: string, event: Event): void {
    event.stopPropagation();
    removeNoteFromWorkspace(noteId);
  }

  function handleClearAll(): void {
    // Close all recent notes
    for (const note of recentNotes) {
      removeNoteFromWorkspace(note.id);
    }
  }

  function getTabDisplayText(note: Note): { text: string; isPreview: boolean } {
    if (note.title) {
      return { text: note.title, isPreview: false };
    }
    const preview = note.content.trim().slice(0, 50);
    if (preview) {
      return { text: preview + (note.content.length > 50 ? '...' : ''), isPreview: true };
    }
    return { text: 'Untitled', isPreview: true };
  }

  function getNoteIcon(note: Note): string {
    const noteType = noteTypes.find((t) => t.id === note.type);
    return noteType?.icon || '📝';
  }

  // Context menu handlers
  function handleContextMenu(event: MouseEvent, noteId: string): void {
    event.preventDefault();
    contextMenuNoteId = noteId;

    const menuWidth = 160;
    const menuHeight = 120;
    const padding = 8;

    let x = event.clientX;
    let y = event.clientY;

    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    x = Math.max(padding, x);
    y = Math.max(padding, y);

    contextMenuPosition = { x, y };
    contextMenuOpen = true;
  }

  function closeContextMenu(): void {
    contextMenuOpen = false;
    contextMenuNoteId = null;
  }

  function handleGlobalClick(event: MouseEvent): void {
    if (contextMenuOpen) {
      const target = event.target as Element;
      if (!target.closest('.context-menu')) {
        closeContextMenu();
      }
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && contextMenuOpen) {
      closeContextMenu();
    }
  }

  function handlePin(): void {
    if (!contextMenuNoteId) return;
    pinNote(contextMenuNoteId);
    closeContextMenu();
  }

  function handleArchive(): void {
    if (!contextMenuNoteId) return;
    archiveNote(contextMenuNoteId);
    closeContextMenu();
  }

  function handleClose(): void {
    if (!contextMenuNoteId) return;
    removeNoteFromWorkspace(contextMenuNoteId);
    closeContextMenu();
  }
</script>

<svelte:window onclick={handleGlobalClick} onkeydown={handleKeydown} />

<div class="recent-notes">
  <div class="notes-header">
    <div class="separator"></div>
    {#if recentNotes.length > 0}
      <button class="clear-all" onclick={handleClearAll}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="down-arrow"
        >
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <polyline points="7,14 12,19 17,14"></polyline>
        </svg>
        close all
      </button>
    {/if}
  </div>

  {#if recentNotes.length > 0}
    <div class="notes-list" bind:this={listElement} {...sortable.getListProps()}>
      {#each recentNotes as note, index (note.id)}
        <div
          class="note-item"
          class:active={activeNoteId === note.id}
          class:dragging={sortable.isDragging(index)}
          style:transform={sortable.getItemTransform(index)}
          onclick={() => handleTabClick(note)}
          oncontextmenu={(e) => handleContextMenu(e, note.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && handleTabClick(note)}
          {...sortable.getItemProps(index, note.id)}
        >
          <div class="note-content">
            <div class="note-icon">
              <span class="emoji-icon">{getNoteIcon(note)}</span>
            </div>
            <span
              class="note-title"
              class:untitled-text={getTabDisplayText(note).isPreview}
            >
              {getTabDisplayText(note).text}
            </span>
          </div>
          <button
            class="close-note"
            onclick={(e) => handleCloseTab(note.id, e)}
            aria-label="Remove from recent"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Context menu -->
{#if contextMenuOpen}
  <div
    class="context-menu"
    style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px;"
    role="menu"
  >
    <button class="context-menu-item" onclick={handlePin} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 17v5"></path>
        <path
          d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
        ></path>
      </svg>
      <span class="menu-item-label">Pin</span>
    </button>
    <button class="context-menu-item" onclick={handleClose} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      <span class="menu-item-label">Close</span>
    </button>
    <button class="context-menu-item" onclick={handleArchive} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="21 8 21 21 3 21 3 8"></polyline>
        <rect x="1" y="3" width="22" height="5"></rect>
        <line x1="10" y1="12" x2="14" y2="12"></line>
      </svg>
      Archive
    </button>
  </div>
{/if}

<style>
  .recent-notes {
    display: flex;
    flex-direction: column;
    padding-bottom: 0.5rem;
  }

  .separator {
    height: 1px;
    background: repeating-linear-gradient(
      to right,
      var(--border-light) 0,
      var(--border-light) 4px,
      transparent 4px,
      transparent 8px
    );
    width: 100%;
  }

  .notes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
  }

  .clear-all {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.2s ease;
    text-decoration: underline;
    text-underline-offset: 2px;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .clear-all:hover {
    color: var(--text-secondary);
  }

  .down-arrow {
    flex-shrink: 0;
  }

  .notes-list {
    padding: 0 0.75rem;
  }

  .note-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.4rem;
    border-radius: 0.4rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
    text-align: left;
    position: relative;
    z-index: 1;
  }

  .note-item:hover {
    background: var(--bg-hover);
  }

  .note-item.active {
    background: var(--accent-light);
  }

  .note-item.dragging {
    opacity: 0.9;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    background: var(--bg-secondary);
    /* No transition on transform so it follows cursor immediately */
    transition:
      opacity 0.15s,
      box-shadow 0.15s;
  }

  .note-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 0.4rem;
    flex: 1;
    min-width: 0;
  }

  .note-icon {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .emoji-icon {
    font-size: 12px;
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

  .close-note {
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .note-item:hover .close-note {
    display: flex;
  }

  .close-note:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  /* Context menu styles */
  .context-menu {
    position: fixed;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 160px;
    padding: 0.25rem;
  }

  .context-menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    border-radius: 0.25rem;
    text-align: left;
    transition: background-color 0.15s ease;
  }

  .context-menu-item:hover {
    background: var(--bg-secondary);
  }

  .context-menu-item svg {
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .menu-item-label {
    flex: 1;
  }
</style>
