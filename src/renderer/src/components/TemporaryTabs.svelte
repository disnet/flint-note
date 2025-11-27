<script lang="ts">
  import { untrack } from 'svelte';
  import { workspacesStore } from '../stores/workspacesStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';
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
    onNoteSelect: (note: NoteMetadata) => void;
    onCreateNote?: (noteType?: string) => void;
  }

  let { onNoteSelect }: Props = $props();

  const dragState = globalDragState;

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

  // Check if notes are still loading
  let isNotesLoading = $derived(notesStore.loading);

  // Check if tabs are ready to display (validated and hydrated)
  let isTabsReady = $derived(workspacesStore.isReady);

  // Hydrate tabs with metadata from notesStore
  let hydratedTabs = $derived(
    workspacesStore.temporaryTabs.map((tab) => {
      const note = notesStore.allNotes.find((n) => n.id === tab.noteId);
      if (!note && !isNotesLoading && isTabsReady) {
        // Only warn if we're supposedly ready but still missing notes
        console.warn('[TemporaryTabs] Tab hydration failed - note not found:', {
          tabId: tab.id,
          noteId: tab.noteId,
          source: tab.source,
          openedAt: tab.openedAt,
          lastAccessed: tab.lastAccessed,
          totalNotesInStore: notesStore.allNotes.length,
          availableNoteIds: notesStore.allNotes.map((n) => n.id).slice(0, 5),
          reactivityCheck: {
            storeTabsLength: workspacesStore.temporaryTabs.length,
            notesStoreLength: notesStore.allNotes.length,
            isNotesLoading,
            isTabsReady
          }
        });
      }
      return {
        ...tab,
        title: note?.title || '',
        archived: note?.archived || false
      };
    })
  );

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
    const untitledTabs = hydratedTabs.filter((tab) => !tab.title);

    for (const tab of untitledTabs) {
      // Skip if we already have a preview for this note
      // Use untrack to avoid creating a dependency on contentPreviews
      const hasPreview = untrack(() => contentPreviews.has(tab.noteId));
      if (hasPreview) continue;

      // Fetch content asynchronously
      fetchContentPreview(tab.noteId);
    }
  });

  // Subscribe to note updates to refresh previews reactively
  $effect(() => {
    const unsubscribe = messageBus.subscribe('note.updated', (event) => {
      // Check if this note is an untitled tab that needs preview refresh
      const tab = hydratedTabs.find((t) => t.noteId === event.noteId && !t.title);
      if (tab) {
        // Re-fetch the preview for this note
        fetchContentPreview(event.noteId);
      }
    });

    return unsubscribe;
  });

  // Helper to get display text for a tab
  function getTabDisplayText(tab: { noteId: string; title: string }): {
    text: string;
    isPreview: boolean;
  } {
    if (tab.title) {
      return { text: tab.title, isPreview: false };
    }
    const preview = contentPreviews.get(tab.noteId);
    if (preview) {
      return { text: preview, isPreview: true };
    }
    return { text: 'Untitled', isPreview: true };
  }

  async function handleTabClick(
    event: MouseEvent | KeyboardEvent,
    noteId: string
  ): Promise<void> {
    // Don't allow clicks while tabs are not ready
    if (!isTabsReady || isNotesLoading) {
      console.log(
        '[TemporaryTabs] Click blocked - tabs not ready or notes still loading'
      );
      return;
    }

    console.log('[TemporaryTabs] Tab clicked:', { noteId });
    const note = notesStore.allNotes.find((n) => n.id === noteId);
    if (note) {
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
          console.error('[TemporaryTabs] Failed to add note to shelf:', error);
        }
        return;
      }

      console.log('[TemporaryTabs] Note found, opening:', {
        noteId: note.id,
        title: note.title
      });
      onNoteSelect(note);
      // Find the tab ID that corresponds to this note ID
      const tab = workspacesStore.temporaryTabs.find((t) => t.noteId === noteId);
      if (tab) {
        await workspacesStore.setActiveTab(tab.id);
      }
    } else {
      console.error(
        '[TemporaryTabs] ❌ CRITICAL: Click on tab with missing note - cannot open:',
        {
          noteId,
          notesStoreState: {
            loading: notesStore.loading,
            totalNotes: notesStore.allNotes.length,
            noteTypes: notesStore.noteTypes,
            firstTenNoteIds: notesStore.allNotes.map((n) => n.id).slice(0, 10)
          },
          tabInfo: workspacesStore.temporaryTabs.find((t) => t.noteId === noteId),
          allTabs: workspacesStore.temporaryTabs.map((t) => ({
            id: t.id,
            noteId: t.noteId
          }))
        }
      );

      // Try to fetch the note directly from the API to see if it exists in database
      try {
        const fetchedNote = await window.api?.getNote({ identifier: noteId });
        console.error('[TemporaryTabs] Direct API fetch result:', {
          success: !!fetchedNote,
          note: fetchedNote
        });
      } catch (error) {
        console.error('[TemporaryTabs] Direct API fetch failed:', error);
      }
    }
  }

  async function handleCloseTab(tabId: string, event: Event): Promise<void> {
    event.stopPropagation();
    await workspacesStore.removeTab(tabId);
  }

  async function handleClearAll(): Promise<void> {
    await workspacesStore.clearAllTabs();
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
      const note = notesStore.allNotes.find((n) => n.id === contextMenuNoteId);
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
      console.error('[TemporaryTabs] Failed to add note to shelf:', error);
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
      console.error('[TemporaryTabs] Failed to archive note:', error);
    }

    closeContextMenu();
  }

  async function handlePin(): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      await workspacesStore.pinNote(contextMenuNoteId);
    } catch (error) {
      console.error('[TemporaryTabs] Failed to pin note:', error);
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
      console.error('[TemporaryTabs] Failed to toggle review:', error);
    }

    closeContextMenu();
  }

  async function handleMoveToWorkspace(workspaceId: string): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      await workspacesStore.moveNoteToWorkspace(contextMenuNoteId, workspaceId);
    } catch (error) {
      console.error('[TemporaryTabs] Failed to move note to workspace:', error);
    }

    closeContextMenu();
  }

  function getTabIcon(
    noteId: string,
    source: string
  ): { type: 'emoji' | 'svg'; value: string } {
    // Check for custom note type icon first
    const note = notesStore.allNotes.find((n) => n.id === noteId);
    if (note) {
      const noteType = notesStore.noteTypes.find((t) => t.name === note.type);
      if (noteType?.icon) {
        return { type: 'emoji', value: noteType.icon };
      }
    }

    // Fall back to source-based icon logic
    return { type: 'svg', value: source };
  }

  function getSourceIcon(source: string): string {
    switch (source) {
      case 'search':
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>`;
      case 'wikilink':
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>`;
      default:
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
        </svg>`;
    }
  }

  function onDragStart(
    event: DragEvent,
    tab: { id: string; noteId: string; title: string; source: string }
  ): void {
    handleDragStart(event, tab.id, 'temporary', dragState);
  }

  function onDragOver(event: DragEvent, index: number, element: HTMLElement): void {
    handleDragOver(event, index, 'temporary', dragState, element);
  }

  async function onDrop(event: DragEvent, targetIndex: number): Promise<void> {
    event.preventDefault();

    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    const { id, type } = JSON.parse(data);
    const position = dragState.dragOverPosition || 'bottom';

    // Handle cross-section drag (no source index adjustment needed)
    if (type !== 'temporary') {
      let dropIndex = targetIndex;
      if (position === 'bottom') {
        dropIndex = targetIndex + 1;
      }
      if (await handleCrossSectionDrop(id, type, 'temporary', dropIndex)) {
        handleDragEnd(dragState);
        return;
      }
    }

    // Handle same-section reorder for temporary tabs
    if (type === 'temporary') {
      const sourceIndex = workspacesStore.temporaryTabs.findIndex((t) => t.id === id);
      if (sourceIndex !== -1) {
        const finalDropIndex = calculateDropIndex(targetIndex, position, sourceIndex);
        if (sourceIndex !== finalDropIndex) {
          await workspacesStore.reorderTabs(sourceIndex, finalDropIndex);
        }
      }
    }

    handleDragEnd(dragState);
  }

  function onDragEnd(): void {
    handleDragEnd(dragState);
  }

  // Auto-scroll to active tab when it changes
  $effect(() => {
    const activeId = workspacesStore.currentActiveTabId;
    if (activeId && isTabsReady) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        const activeElement = document.querySelector(
          `.tab-item[data-id="${activeId}"]`
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

<div class="temporary-tabs">
  <div class="tabs-header">
    <div class="separator"></div>
    {#if workspacesStore.temporaryTabs.length > 0 && isTabsReady}
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

  {#if !isTabsReady}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <span class="loading-text">Loading tabs...</span>
    </div>
  {:else if hydratedTabs.length > 0}
    <div class="tabs-list">
      {#each hydratedTabs as tab, index (tab.id)}
        <div
          class="tab-item"
          class:active={tab.id === workspacesStore.currentActiveTabId}
          class:loading={!isTabsReady}
          class:archived={tab.archived}
          class:dragging={dragState.draggedId === tab.id}
          class:drag-over-top={dragState.dragOverIndex === index &&
            dragState.dragOverSection === 'temporary' &&
            dragState.dragOverPosition === 'top'}
          class:drag-over-bottom={dragState.dragOverIndex === index &&
            dragState.dragOverSection === 'temporary' &&
            dragState.dragOverPosition === 'bottom'}
          data-id={tab.id}
          draggable={isTabsReady}
          ondragstart={(e) => onDragStart(e, tab)}
          ondragover={(e) => onDragOver(e, index, e.currentTarget)}
          ondrop={(e) => onDrop(e, index)}
          ondragend={onDragEnd}
          onclick={(e) => handleTabClick(e, tab.noteId)}
          oncontextmenu={(e) => handleContextMenu(e, tab.noteId)}
          title={!isTabsReady ? 'Loading...' : tab.title}
          role="button"
          tabindex={!isTabsReady ? -1 : 0}
          onkeydown={(e) => e.key === 'Enter' && handleTabClick(e, tab.noteId)}
        >
          <div class="tab-content">
            <div class="tab-icon">
              {#if getTabIcon(tab.noteId, tab.source).type === 'emoji'}
                <span class="emoji-icon">{getTabIcon(tab.noteId, tab.source).value}</span>
              {:else}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html getSourceIcon(getTabIcon(tab.noteId, tab.source).value)}
              {/if}
            </div>
            <span
              class="tab-title"
              class:untitled-text={getTabDisplayText(tab).isPreview}
            >
              {getTabDisplayText(tab).text}
            </span>
          </div>
          <button
            class="menu-button"
            onclick={(e) => handleMenuButtonClick(e, tab.noteId)}
            aria-label="More options"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="19" cy="12" r="2"></circle>
            </svg>
          </button>
          <button
            class="close-tab"
            onclick={(e) => handleCloseTab(tab.id, e)}
            aria-label="Close tab"
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

<!-- Global event listeners for context menu -->
<svelte:window onclick={handleGlobalClick} onkeydown={handleKeydown} />

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
  .temporary-tabs {
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

  .tabs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
  }

  .clear-all {
    background: none;
    border: none;
    color: var(--text-tertiary);
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

  .tabs-list {
    padding: 0 0.75rem;
  }

  .tab-item {
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
    transition: all 0.2s ease;
    text-align: left;
  }

  .tab-item.active {
    background: var(--accent-light);
  }

  .tab-item.loading {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }

  .tab-item.archived {
    opacity: 0.6;
  }

  .tab-item.archived:hover {
    opacity: 0.8;
  }

  .tab-item.archived .tab-title {
    font-style: italic;
  }

  .tab-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 0.4rem;
    flex: 1;
    min-width: 0;
  }

  .tab-icon {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .emoji-icon {
    font-size: 12px;
    line-height: 1;
  }

  .tab-title {
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

  .menu-button,
  .close-tab {
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

  .tab-item:hover .menu-button,
  .tab-item:hover .close-tab {
    display: flex;
  }

  .menu-button:hover,
  .close-tab:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .loading-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-text {
    font-size: 0.75rem;
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
