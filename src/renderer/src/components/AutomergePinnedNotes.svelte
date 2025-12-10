<script lang="ts">
  /**
   * Pinned notes list for the Automerge sidebar
   * Shows notes that are pinned to the active workspace
   */
  import {
    getPinnedNotes,
    unpinNote,
    archiveNote,
    getNoteTypes,
    getActiveNoteId,
    type Note
  } from '../lib/automerge';

  interface Props {
    onNoteSelect: (note: Note) => void;
  }

  let { onNoteSelect }: Props = $props();

  let isCollapsed = $state(false);

  // Reactive state
  const pinnedNotes = $derived(getPinnedNotes());
  const activeNoteId = $derived(getActiveNoteId());
  const noteTypes = $derived(getNoteTypes());

  // Context menu state
  let contextMenuOpen = $state(false);
  let contextMenuNoteId = $state<string | null>(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });

  function toggleCollapsed(): void {
    isCollapsed = !isCollapsed;
  }

  function handleNoteClick(note: Note): void {
    onNoteSelect(note);
  }

  function getNoteDisplayText(note: Note): { text: string; isPreview: boolean } {
    if (note.title) {
      return { text: note.title, isPreview: false };
    }
    // Show preview from content
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
    const menuHeight = 100;
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

  function handleUnpin(): void {
    if (!contextMenuNoteId) return;
    unpinNote(contextMenuNoteId);
    closeContextMenu();
  }

  function handleArchive(): void {
    if (!contextMenuNoteId) return;
    archiveNote(contextMenuNoteId);
    closeContextMenu();
  }
</script>

<svelte:window onclick={handleGlobalClick} onkeydown={handleKeydown} />

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
      {#each pinnedNotes as note (note.id)}
        <div
          class="pinned-item"
          class:active={activeNoteId === note.id}
          onclick={() => handleNoteClick(note)}
          oncontextmenu={(e) => handleContextMenu(e, note.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && handleNoteClick(note)}
        >
          <div class="note-icon">
            <span class="emoji-icon">{getNoteIcon(note)}</span>
          </div>
          <span
            class="note-title"
            class:untitled-text={getNoteDisplayText(note).isPreview}
          >
            {getNoteDisplayText(note).text}
          </span>
        </div>
      {:else}
        <div class="empty-state">
          <p>No pinned notes</p>
          <p class="empty-hint">Pin notes to keep them handy</p>
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
    <button class="context-menu-item" onclick={handleUnpin} role="menuitem">
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
        <line x1="2" y1="2" x2="22" y2="22"></line>
      </svg>
      <span class="menu-item-label">Unpin</span>
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
  .section-header {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    padding: 0.3rem 1rem;
    background: var(--bg-secondary);
    color: var(--text-muted);
    cursor: pointer;
    user-select: none;
  }

  .section-header:hover {
    color: var(--text-secondary);
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
  }

  .empty-state p {
    margin: 0;
    color: var(--text-secondary);
  }

  .empty-hint {
    font-size: 0.75rem !important;
    margin-top: 0.5rem !important;
    opacity: 0.7;
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
