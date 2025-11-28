<script lang="ts">
  import { untrack } from 'svelte';
  import { notesStore } from '../services/noteStore.svelte';
  import { workspacesStore } from '../stores/workspacesStore.svelte';
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
  import { reviewStore } from '../stores/reviewStore.svelte';
  import { messageBus } from '../services/messageBus.svelte';

  interface Props {
    activeNote: NoteMetadata | null;
    onNoteSelect: (note: NoteMetadata) => void;
  }

  let { activeNote, onNoteSelect }: Props = $props();

  let isCollapsed = $state(false);
  let pinnedNotes = $state<NoteMetadata[]>([]);

  // Context menu state
  let contextMenuOpen = $state(false);
  let contextMenuNoteId = $state<string | null>(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });
  let contextMenuReviewEnabled = $state(false);
  let moveSubmenuOpen = $state(false);

  // Get all workspaces for move menu (current one will be shown as disabled)
  let allWorkspaces = $derived(workspacesStore.workspaces);

  // Content previews for untitled notes
  let contentPreviews = $state<Map<string, string>>(new Map());

  const dragState = globalDragState;

  // Check if notes are ready (for consistency with TemporaryTabs)
  let isNotesReady = $derived(!notesStore.loading && workspacesStore.isReady);

  // Use $effect to update pinnedNotes when workspacesStore or notesStore changes
  $effect(() => {
    const result = workspacesStore.pinnedNotes
      .map((pinnedInfo) => {
        // Find the corresponding note in notesStore (use allNotes to support archived notes)
        return notesStore.allNotes.find((note) => note.id === pinnedInfo.id);
      })
      .filter((note): note is NoteMetadata => note !== undefined);

    pinnedNotes = result;
  });

  // Helper to fetch and update content preview for a note
  async function fetchContentPreview(noteId: string): Promise<void> {
    const chatService = getChatService();
    const noteContent = await chatService.getNote({ identifier: noteId });
    const content = (noteContent?.content || '').trim();
    if (content.length > 0) {
      const preview = content.slice(0, 50) + (content.length > 50 ? '…' : '');
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- creating new Map for reactivity trigger
      contentPreviews = new Map(contentPreviews).set(noteId, preview);
    } else {
      // Content is empty, remove any existing preview so "Untitled" shows
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- creating new Map for reactivity trigger
      const newMap = new Map(contentPreviews);
      newMap.delete(noteId);
      contentPreviews = newMap;
    }
  }

  // Fetch content previews for untitled notes
  $effect(() => {
    const untitledNotes = pinnedNotes.filter((note) => !note.title);

    for (const note of untitledNotes) {
      // Skip if we already have a preview for this note
      // Use untrack to avoid creating a dependency on contentPreviews
      const hasPreview = untrack(() => contentPreviews.has(note.id));
      if (hasPreview) continue;

      // Fetch content asynchronously
      fetchContentPreview(note.id);
    }
  });

  // Subscribe to note updates to refresh previews reactively
  $effect(() => {
    const unsubscribe = messageBus.subscribe('note.updated', (event) => {
      // Check if this note is an untitled pinned note that needs preview refresh
      const note = pinnedNotes.find((n) => n.id === event.noteId && !n.title);
      if (note) {
        // Re-fetch the preview for this note
        fetchContentPreview(event.noteId);
      }
    });

    return unsubscribe;
  });

  // Helper to get display text for a note
  function getNoteDisplayText(note: NoteMetadata): { text: string; isPreview: boolean } {
    if (note.title) {
      return { text: note.title, isPreview: false };
    }
    const preview = contentPreviews.get(note.id);
    if (preview) {
      return { text: preview, isPreview: true };
    }
    return { text: 'Untitled', isPreview: true };
  }

  function toggleCollapsed(): void {
    isCollapsed = !isCollapsed;
  }

  async function handleNoteClick(
    event: MouseEvent | KeyboardEvent,
    note: NoteMetadata
  ): Promise<void> {
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

  // Context menu handlers
  async function handleContextMenu(event: MouseEvent, noteId: string): Promise<void> {
    event.preventDefault();
    contextMenuNoteId = noteId;

    // Check review status for this note
    contextMenuReviewEnabled = await reviewStore.isReviewEnabled(noteId);

    // Calculate position with viewport bounds checking
    const menuWidth = 180;
    const menuHeight = 160;
    const padding = 8;

    let x = event.clientX;
    let y = event.clientY;

    // Adjust if menu would overflow right edge
    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    // Adjust if menu would overflow bottom edge
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // Ensure menu doesn't go off left or top edge
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    contextMenuPosition = { x, y };
    contextMenuOpen = true;
  }

  async function handleMenuButtonClick(event: MouseEvent, noteId: string): Promise<void> {
    event.stopPropagation();
    contextMenuNoteId = noteId;

    // Capture button position before any async operations
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();

    // Check review status for this note
    contextMenuReviewEnabled = await reviewStore.isReviewEnabled(noteId);

    // Position menu relative to the button
    const menuWidth = 180;
    const menuHeight = 160;
    const padding = 8;

    let x = rect.right;
    let y = rect.top;

    // Adjust if menu would overflow right edge
    if (x + menuWidth + padding > window.innerWidth) {
      x = rect.left - menuWidth;
    }

    // Adjust if menu would overflow bottom edge
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // Ensure menu doesn't go off left or top edge
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    contextMenuPosition = { x, y };
    contextMenuOpen = true;
  }

  function closeContextMenu(): void {
    contextMenuOpen = false;
    contextMenuNoteId = null;
    moveSubmenuOpen = false;
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

  async function handleOpenInShelf(): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      const note = pinnedNotes.find((n) => n.id === contextMenuNoteId);
      if (!note) return;

      const chatService = getChatService();
      const noteContent = await chatService.getNote({ identifier: note.id });

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

    closeContextMenu();
  }

  async function handleArchive(): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      const chatService = getChatService();
      const vault = await chatService.getCurrentVault();
      if (!vault) {
        console.error('No vault available');
        return;
      }

      await chatService.archiveNote({
        vaultId: vault.id,
        identifier: contextMenuNoteId
      });
    } catch (error) {
      console.error('[PinnedNotes] Failed to archive note:', error);
    }

    closeContextMenu();
  }

  async function handleUnpin(): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      await workspacesStore.unpinNote(contextMenuNoteId);
    } catch (error) {
      console.error('[PinnedNotes] Failed to unpin note:', error);
    }

    closeContextMenu();
  }

  async function handleToggleReview(): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      if (contextMenuReviewEnabled) {
        await reviewStore.disableReview(contextMenuNoteId);
      } else {
        await reviewStore.enableReview(contextMenuNoteId);
      }
    } catch (error) {
      console.error('[PinnedNotes] Failed to toggle review:', error);
    }

    closeContextMenu();
  }

  async function handleMoveToWorkspace(workspaceId: string): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      await workspacesStore.moveNoteToWorkspace(contextMenuNoteId, workspaceId);
    } catch (error) {
      console.error('[PinnedNotes] Failed to move note to workspace:', error);
    }

    closeContextMenu();
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
        ? workspacesStore.pinnedNotes.findIndex((n) => n.id === id)
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
          await workspacesStore.reorderPinnedNotes(sourceIndex, dropIndex);
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
        <div
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
          oncontextmenu={(e) => handleContextMenu(e, note.id)}
          title={!isNotesReady ? 'Loading...' : note.title}
          role="button"
          tabindex={!isNotesReady ? -1 : 0}
          onkeydown={(e) => e.key === 'Enter' && handleNoteClick(e, note)}
        >
          <div class="note-icon">
            {#if getNoteIcon(note).type === 'emoji'}
              <span class="emoji-icon">{getNoteIcon(note).value}</span>
            {:else}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html getIconSvg(getNoteIcon(note).value)}
            {/if}
          </div>
          <span
            class="note-title"
            class:untitled-text={getNoteDisplayText(note).isPreview}
          >
            {getNoteDisplayText(note).text}
          </span>
          <button
            class="menu-button"
            onclick={(e) => handleMenuButtonClick(e, note.id)}
            aria-label="More options"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="19" cy="12" r="2"></circle>
            </svg>
          </button>
        </div>
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

<!-- Global event listeners for context menu -->
<svelte:window onclick={handleGlobalClick} onkeydown={handleKeydown} />

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
      <span class="menu-item-shortcut">⌘⇧P</span>
    </button>
    <button class="context-menu-item" onclick={handleOpenInShelf} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
      </svg>
      <span class="menu-item-label">Open in Shelf</span>
      <span class="menu-item-shortcut">⇧Click</span>
    </button>
    {#if allWorkspaces.length > 1}
      <div
        class="context-menu-item submenu-trigger"
        role="menuitem"
        tabindex="0"
        onmouseenter={() => (moveSubmenuOpen = true)}
        onmouseleave={() => (moveSubmenuOpen = false)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <polyline points="10 17 15 12 10 7"></polyline>
          <line x1="15" y1="12" x2="3" y2="12"></line>
        </svg>
        <span class="menu-item-label">Move to Workspace</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="submenu-arrow"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
        {#if moveSubmenuOpen}
          <div class="submenu" role="menu">
            {#each allWorkspaces as workspace (workspace.id)}
              <button
                class="context-menu-item"
                class:disabled={workspace.id === workspacesStore.activeWorkspaceId}
                onclick={() =>
                  workspace.id !== workspacesStore.activeWorkspaceId &&
                  handleMoveToWorkspace(workspace.id)}
                role="menuitem"
                disabled={workspace.id === workspacesStore.activeWorkspaceId}
              >
                <span class="workspace-icon">{workspace.icon}</span>
                <span class="menu-item-label">{workspace.name}</span>
                {#if workspace.id === workspacesStore.activeWorkspaceId}
                  <span class="current-indicator">(current)</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    <button class="context-menu-item" onclick={handleToggleReview} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      {contextMenuReviewEnabled ? 'Disable Review' : 'Enable Review'}
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

  .menu-button {
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

  .pinned-item:hover .menu-button {
    display: flex;
  }

  .menu-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
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

  .menu-item-shortcut {
    font-size: 0.6875rem;
    color: var(--text-muted);
    margin-left: auto;
  }

  /* Submenu styles */
  .submenu-trigger {
    position: relative;
    cursor: pointer;
  }

  .submenu-arrow {
    margin-left: auto;
    flex-shrink: 0;
  }

  .submenu {
    position: absolute;
    left: 100%;
    top: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 140px;
    padding: 0.25rem;
    z-index: 1001;
  }

  .workspace-icon {
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  .context-menu-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .context-menu-item.disabled:hover {
    background: transparent;
  }

  .current-indicator {
    font-size: 0.6875rem;
    color: var(--text-muted);
    margin-left: auto;
  }
</style>
