<script lang="ts">
  /**
   * Inbox view component using Automerge for data storage
   * Shows unprocessed and processed notes with quick create and bulk actions
   */
  import {
    getUnprocessedNotes,
    getProcessedNotes,
    markNoteAsProcessed,
    unmarkNoteAsProcessed,
    markAllNotesAsProcessed,
    unmarkAllNotesAsProcessed,
    createNote,
    archiveNote,
    addItemToWorkspace,
    setActiveItem,
    setActiveSystemView,
    getWorkspaces,
    setActiveWorkspace,
    getNoteTypes,
    automergeShelfStore,
    enableReview,
    disableReview,
    getReviewData,
    type InboxNote,
    type Workspace
  } from '../lib/automerge';

  // Local state
  let newNoteTitle = $state('');
  let isCreatingNote = $state(false);
  let showProcessed = $state(false);

  // Context menu state
  let contextMenuOpen = $state(false);
  let contextMenuNoteId = $state<string | null>(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });
  let contextMenuReviewEnabled = $state(false);
  let moveSubmenuOpen = $state(false);
  let submenuOpenLeft = $state(false);

  // Reactive getters
  const notes: InboxNote[] = $derived(
    showProcessed ? getProcessedNotes() : getUnprocessedNotes()
  );
  const allWorkspaces: Workspace[] = $derived(getWorkspaces());
  const noteTypes = $derived(getNoteTypes());

  // Helper function to format relative time
  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins < 1) return 'just now';
        return `${diffMins} min ago`;
      }
      if (diffHours === 1) return '1 hour ago';
      return `${diffHours} hours ago`;
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // Helper function to get type icon
  function getTypeIcon(typeId: string): string | undefined {
    const noteType = noteTypes.find((t) => t.id === typeId);
    return noteType?.icon;
  }

  // Helper function to get type name
  function getTypeName(typeId: string): string {
    const noteType = noteTypes.find((t) => t.id === typeId);
    return noteType?.name ?? 'Note';
  }

  function handleSubmenuEnter(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const submenuWidth = 150;
    submenuOpenLeft = rect.right + submenuWidth > window.innerWidth;
    moveSubmenuOpen = true;
  }

  async function handleCreateNote(): Promise<void> {
    if (!newNoteTitle.trim() || isCreatingNote) {
      return;
    }

    isCreatingNote = true;

    try {
      createNote({
        title: newNoteTitle.trim(),
        content: ''
      });
      newNoteTitle = '';
    } catch (error) {
      console.error('Failed to create note:', error);
    } finally {
      isCreatingNote = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCreateNote();
    }
  }

  function handleMarkAsProcessed(noteId: string): void {
    markNoteAsProcessed(noteId);
  }

  function handleUnmarkAsProcessed(noteId: string): void {
    unmarkNoteAsProcessed(noteId);
  }

  function handleToggleView(): void {
    showProcessed = !showProcessed;
  }

  function handleMarkAllAsProcessed(): void {
    const noteIds = notes.map((note) => note.id);
    markAllNotesAsProcessed(noteIds);
  }

  function handleMarkAllAsUnprocessed(): void {
    const noteIds = notes.map((note) => note.id);
    unmarkAllNotesAsProcessed(noteIds);
  }

  function handleNoteClick(noteId: string): void {
    setActiveItem({ type: 'note', id: noteId });
    addItemToWorkspace({ type: 'note', id: noteId });
    setActiveSystemView(null);
  }

  // Context menu handlers
  function handleContextMenu(event: MouseEvent, noteId: string): void {
    event.preventDefault();
    contextMenuNoteId = noteId;

    // Check review status for this note
    const reviewData = getReviewData(noteId);
    contextMenuReviewEnabled = reviewData?.enabled ?? false;

    // Calculate position with viewport bounds checking
    const menuWidth = 180;
    const menuHeight = 200;
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

  function handleMenuButtonClick(event: MouseEvent, noteId: string): void {
    event.stopPropagation();
    contextMenuNoteId = noteId;

    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();

    const reviewData = getReviewData(noteId);
    contextMenuReviewEnabled = reviewData?.enabled ?? false;

    const menuWidth = 180;
    const menuHeight = 200;
    const padding = 8;

    let x = rect.right;
    let y = rect.top;

    if (x + menuWidth + padding > window.innerWidth) {
      x = rect.left - menuWidth;
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

  // Context menu action handlers
  function handleOpenInShelf(): void {
    if (!contextMenuNoteId) return;

    automergeShelfStore.addItem('note', contextMenuNoteId);
    closeContextMenu();
  }

  function handleArchive(): void {
    if (!contextMenuNoteId) return;

    archiveNote(contextMenuNoteId);
    closeContextMenu();
  }

  function handleToggleReview(): void {
    if (!contextMenuNoteId) return;

    if (contextMenuReviewEnabled) {
      disableReview(contextMenuNoteId);
    } else {
      enableReview(contextMenuNoteId);
    }
    closeContextMenu();
  }

  function handleOpenInWorkspace(workspaceId: string): void {
    if (!contextMenuNoteId) return;

    setActiveWorkspace(workspaceId);
    setActiveItem({ type: 'note', id: contextMenuNoteId });
    addItemToWorkspace({ type: 'note', id: contextMenuNoteId });
    setActiveSystemView(null);
    closeContextMenu();
  }
</script>

<div class="inbox-view">
  <div class="inbox-header">
    <h2>Inbox</h2>
    <div class="header-actions">
      {#if notes.length > 0}
        {#if showProcessed}
          <button
            class="action-button"
            onclick={handleMarkAllAsUnprocessed}
            title="Mark all as unprocessed"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            All
          </button>
        {:else}
          <button
            class="action-button"
            onclick={handleMarkAllAsProcessed}
            title="Mark all as processed"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            All
          </button>
        {/if}
      {/if}
      <button
        class="toggle-button"
        onclick={handleToggleView}
        title="Toggle between unprocessed and processed notes"
      >
        <span class="toggle-option" class:active={!showProcessed}>
          <span class="toggle-icon">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8"></circle>
            </svg>
          </span>
          Unprocessed
        </span>
        <span class="toggle-separator">|</span>
        <span class="toggle-option" class:active={showProcessed}>
          <span class="toggle-icon">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          Processed
        </span>
      </button>
    </div>
  </div>

  <div class="inbox-content">
    <!-- Quick create input -->
    <div class="quick-create">
      <input
        type="text"
        class="create-input"
        placeholder="enter title to create new note..."
        bind:value={newNoteTitle}
        onkeydown={handleKeyDown}
        disabled={isCreatingNote}
      />
    </div>

    <!-- Notes list -->
    <div class="notes-container">
      {#if notes.length > 0}
        <div class="notes-list">
          {#each notes as note (note.id)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="note-card" oncontextmenu={(e) => handleContextMenu(e, note.id)}>
              <div class="note-header">
                <button
                  class="note-title"
                  onclick={() => handleNoteClick(note.id)}
                  title="Open note"
                >
                  {note.title || 'Untitled'}
                </button>
                <div class="note-actions">
                  <button
                    class="menu-button"
                    onclick={(e) => handleMenuButtonClick(e, note.id)}
                    title="More options"
                    aria-label="More options"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2"></circle>
                      <circle cx="12" cy="12" r="2"></circle>
                      <circle cx="12" cy="19" r="2"></circle>
                    </svg>
                  </button>
                  {#if showProcessed}
                    <button
                      class="check-button"
                      onclick={() => handleUnmarkAsProcessed(note.id)}
                      title="Move back to unprocessed"
                      aria-label="Move note back to unprocessed"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                      </svg>
                    </button>
                  {:else}
                    <button
                      class="check-button"
                      onclick={() => handleMarkAsProcessed(note.id)}
                      title="Mark as processed"
                      aria-label="Mark note as processed"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </button>
                  {/if}
                </div>
              </div>
              <div class="note-meta">
                <span class="meta-date">{formatRelativeTime(note.created)}</span>
                {#if getTypeIcon(note.type)}
                  <span class="type-icon">{getTypeIcon(note.type)}</span>
                {/if}
                <span class="type-name">{getTypeName(note.type)}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <p>{showProcessed ? 'No processed notes' : 'No unprocessed notes'}</p>
          <p class="empty-hint">
            {showProcessed
              ? 'Notes you process will appear here'
              : 'Create a note above or notes you create will appear here'}
          </p>
        </div>
      {/if}
    </div>
  </div>
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
      <span class="menu-item-shortcut">Shift+Click</span>
    </button>
    {#if allWorkspaces.length > 0}
      <div
        class="context-menu-item submenu-trigger"
        role="menuitem"
        tabindex="0"
        onmouseenter={handleSubmenuEnter}
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
        <span class="menu-item-label">Open in Workspace</span>
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
          <div class="submenu" class:submenu-left={submenuOpenLeft} role="menu">
            {#each allWorkspaces as workspace (workspace.id)}
              <button
                class="context-menu-item"
                onclick={() => handleOpenInWorkspace(workspace.id)}
                role="menuitem"
              >
                <span class="workspace-icon">{workspace.icon}</span>
                <span class="menu-item-label">{workspace.name}</span>
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
  .inbox-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    padding: 0.5rem;
  }

  .inbox-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .inbox-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .action-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
  }

  .action-button:hover {
    background: var(--accent-light);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .toggle-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toggle-button:hover {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
  }

  .toggle-option {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    color: var(--text-secondary);
    transition: all 0.2s ease;
    font-weight: 500;
    min-width: 5.5rem;
    white-space: nowrap;
  }

  .toggle-option.active {
    background: var(--accent-primary);
    color: white;
  }

  .toggle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
  }

  .toggle-option.active .toggle-icon {
    opacity: 1;
  }

  .toggle-separator {
    color: var(--border-medium);
    font-weight: 300;
  }

  .inbox-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 0 0.5rem;
    padding-bottom: 0.5rem;
  }

  .quick-create {
    margin-bottom: 1rem;
  }

  .create-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .create-input::placeholder {
    color: var(--text-placeholder);
  }

  .create-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    background: var(--bg-primary);
  }

  .create-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .notes-container {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .notes-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: fadeIn 0.2s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .note-card {
    background: var(--bg-secondary);
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .note-card:hover {
    border-color: var(--accent-primary);
  }

  .note-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }

  .note-title {
    margin: 0;
    padding: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.4;
    flex: 1;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: color 0.2s;
  }

  .note-title:hover {
    color: var(--accent-primary);
    text-decoration: underline;
  }

  .note-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .check-button,
  .menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .check-button:hover,
  .menu-button:hover {
    background: var(--accent-light);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .note-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .meta-date {
    font-weight: 500;
  }

  .type-icon {
    font-size: 0.875rem;
  }

  .type-name {
    font-weight: 500;
    text-transform: capitalize;
  }

  .empty-state {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary);
    animation: fadeIn 0.2s ease-in-out;
  }

  .empty-state p {
    margin: 0.25rem 0;
  }

  .empty-hint {
    font-size: 0.875rem;
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

  .submenu.submenu-left {
    left: auto;
    right: 100%;
  }

  .workspace-icon {
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }
</style>
