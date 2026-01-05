<script lang="ts">
  /**
   * Workspace bar for the Automerge sidebar
   * Shows workspace icons and allows switching/creating workspaces
   * Supports drag-and-drop reordering with horizontal lock
   */
  import { tick } from 'svelte';
  import Tooltip from './Tooltip.svelte';
  import {
    getWorkspaces,
    getActiveWorkspace,
    setActiveWorkspace,
    createWorkspace,
    deleteWorkspace,
    updateWorkspace,
    reorderWorkspaces,
    importEpubFile,
    importPdfFile
  } from '../lib/automerge';

  interface Props {
    onCreateNote?: () => void;
    onCreateDeck?: () => void;
    onCaptureWebpage?: () => void;
    showShadow?: boolean;
  }

  let {
    onCreateNote,
    onCreateDeck,
    onCaptureWebpage,
    showShadow = false
  }: Props = $props();

  // Import state
  let isImporting = $state(false);

  // Platform detection for keyboard shortcuts
  const isMac = navigator.platform.startsWith('Mac');
  const modKey = isMac ? '⌘' : 'Ctrl';

  // Reactive state
  const workspaces = $derived(getWorkspaces());
  const activeWorkspace = $derived(getActiveWorkspace());

  // UI state for workspace form popover
  let isFormPopoverOpen = $state(false);
  let editingWorkspaceId = $state<string | null>(null);
  let newWorkspaceName = $state('');
  let newWorkspaceIcon = $state('');

  // UI state for add menu popover
  let isAddMenuOpen = $state(false);

  // Context menu state
  let contextMenuOpen = $state(false);
  let contextMenuWorkspaceId = $state<string | null>(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });

  // Drag state
  let draggedIndex = $state<number | null>(null);
  let draggedWorkspaceId = $state<string | null>(null);
  let dropTargetIndex = $state<number | null>(null);
  let dragOffsetX = $state(0);
  let dragStartX = $state(0);
  let itemWidth = $state(0);
  let isAnimating = $state(false);

  const ANIMATION_DURATION = 200;
  const ITEM_GAP = 8; // 0.5rem in pixels

  // List element ref
  let listElement: HTMLDivElement | undefined = $state();

  // Pre-create transparent drag image
  const emptyDragImage = new Image();
  emptyDragImage.src =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function getWorkspaceTooltip(name: string, index: number): string {
    if (index < 9) {
      return `${name} (Ctrl+${index + 1})`;
    }
    return name;
  }

  function handleWorkspaceClick(workspaceId: string): void {
    if (activeWorkspace?.id === workspaceId) {
      return;
    }
    setActiveWorkspace(workspaceId);
  }

  function handleAddClick(): void {
    isAddMenuOpen = !isAddMenuOpen;
  }

  function closeAddMenu(): void {
    isAddMenuOpen = false;
  }

  function openNewWorkspaceForm(): void {
    closeAddMenu();
    editingWorkspaceId = null;
    newWorkspaceName = '';
    newWorkspaceIcon = '📋';
    isFormPopoverOpen = true;
  }

  function handleNewNoteClick(): void {
    closeAddMenu();
    onCreateNote?.();
  }

  function handleNewDeckClick(): void {
    closeAddMenu();
    onCreateDeck?.();
  }

  async function handleImportFileClick(): Promise<void> {
    if (isImporting) return;
    closeAddMenu();

    // Create a combined file picker for both PDF and EPUB
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.epub,application/pdf,application/epub+zip';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      isImporting = true;
      try {
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext === 'pdf') {
          await importPdfFile(file);
        } else if (ext === 'epub') {
          await importEpubFile(file);
        }
      } finally {
        isImporting = false;
      }
    };

    input.click();
  }

  function handleCaptureWebpageClick(): void {
    closeAddMenu();
    onCaptureWebpage?.();
  }

  function closeFormPopover(): void {
    isFormPopoverOpen = false;
    editingWorkspaceId = null;
    newWorkspaceName = '';
    newWorkspaceIcon = '';
  }

  function handleCreateWorkspace(): void {
    if (!newWorkspaceName.trim()) return;

    createWorkspace({
      name: newWorkspaceName.trim(),
      icon: newWorkspaceIcon || '📋'
    });

    closeFormPopover();
  }

  function handleUpdateWorkspace(): void {
    if (!editingWorkspaceId || !newWorkspaceName.trim()) return;

    updateWorkspace(editingWorkspaceId, {
      name: newWorkspaceName.trim(),
      icon: newWorkspaceIcon || '📋'
    });

    closeFormPopover();
  }

  // Context menu handlers
  function handleContextMenu(event: MouseEvent, workspaceId: string): void {
    event.preventDefault();
    contextMenuWorkspaceId = workspaceId;

    const menuWidth = 120;
    const menuHeight = 80;
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
    contextMenuWorkspaceId = null;
  }

  function handleEditWorkspace(): void {
    if (!contextMenuWorkspaceId) return;

    const workspace = workspaces.find((w) => w.id === contextMenuWorkspaceId);
    if (workspace) {
      editingWorkspaceId = workspace.id;
      newWorkspaceName = workspace.name;
      newWorkspaceIcon = workspace.icon;
      isFormPopoverOpen = true;
    }
    closeContextMenu();
  }

  function handleDeleteWorkspace(): void {
    if (!contextMenuWorkspaceId) return;

    if (workspaces.length > 1) {
      deleteWorkspace(contextMenuWorkspaceId);
    }
    closeContextMenu();
  }

  function handleGlobalClick(event: MouseEvent): void {
    const target = event.target as Element;

    if (contextMenuOpen) {
      if (!target.closest('.context-menu')) {
        closeContextMenu();
      }
    }
    if (isFormPopoverOpen) {
      if (
        !target.closest('.workspace-popover') &&
        !target.closest('.add-workspace-button') &&
        !target.closest('.add-menu') &&
        !target.closest('.context-menu')
      ) {
        closeFormPopover();
      }
    }
    if (isAddMenuOpen) {
      if (!target.closest('.add-menu') && !target.closest('.add-workspace-button')) {
        closeAddMenu();
      }
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (contextMenuOpen) closeContextMenu();
      if (isFormPopoverOpen) closeFormPopover();
      if (isAddMenuOpen) closeAddMenu();
    }
  }

  // Drag handlers
  function handleDragStart(e: DragEvent, index: number, workspaceId: string): void {
    draggedIndex = index;
    draggedWorkspaceId = workspaceId;
    dropTargetIndex = index;
    dragOffsetX = 0;

    const item = (e.target as HTMLElement).closest(
      '[data-workspace-item]'
    ) as HTMLElement;
    if (item) {
      itemWidth = item.offsetWidth + ITEM_GAP;
    }

    dragStartX = e.clientX;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', workspaceId);
      e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
    }
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (draggedIndex === null || !listElement) return;

    // Update offset for visual feedback (horizontal only)
    dragOffsetX = e.clientX - dragStartX;

    // Determine target index based on X position
    const listRect = listElement.getBoundingClientRect();
    const x = e.clientX - listRect.left + listElement.scrollLeft;
    let newTargetIndex = Math.floor(x / itemWidth);
    newTargetIndex = Math.max(0, Math.min(workspaces.length - 1, newTargetIndex));

    dropTargetIndex = newTargetIndex;
  }

  function handleDragEnd(): void {
    finishDrag();
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    finishDrag();
  }

  async function finishDrag(): Promise<void> {
    if (
      draggedIndex === null ||
      dropTargetIndex === null ||
      draggedWorkspaceId === null
    ) {
      resetDragState();
      return;
    }

    const fromIndex = draggedIndex;
    const toIndex = dropTargetIndex;

    if (fromIndex === toIndex) {
      resetDragState();
      return;
    }

    // Save current visual positions for FLIP animation
    const draggedItemOffset = dragOffsetX;

    // Build a map of where each item visually appears right now
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Map used only for local computation, not reactive state
    const visualPositions = new Map<string, number>();
    for (let i = 0; i < workspaces.length; i++) {
      const workspace = workspaces[i];
      let visualIndex = i;
      if (i === fromIndex) {
        visualIndex = toIndex;
      } else if (fromIndex < toIndex && i > fromIndex && i <= toIndex) {
        visualIndex = i - 1;
      } else if (fromIndex > toIndex && i >= toIndex && i < fromIndex) {
        visualIndex = i + 1;
      }
      visualPositions.set(workspace.id, visualIndex);
    }

    // Enter animating state
    isAnimating = true;

    // Reset drag state
    resetDragState();

    // Perform the reorder
    reorderWorkspaces(fromIndex, toIndex);

    // Wait for DOM update
    await tick();

    if (!listElement) {
      isAnimating = false;
      return;
    }

    // Query fresh element references
    const freshElements = listElement.querySelectorAll<HTMLElement>(
      '[data-workspace-item]'
    );

    // Apply FLIP: position elements at their OLD visual position, then animate to new
    freshElements.forEach((el) => {
      const id = el.dataset.workspaceId;
      if (!id) return;

      // Find this element's new index
      const newIndex = Array.from(freshElements).indexOf(el);

      let deltaX: number;

      if (id === draggedWorkspaceId) {
        // The dragged item: calculate from its pixel position
        deltaX = (fromIndex - newIndex) * itemWidth + draggedItemOffset;
      } else {
        const oldVisualIndex = visualPositions.get(id);
        if (oldVisualIndex === undefined) return;
        deltaX = (oldVisualIndex - newIndex) * itemWidth;
      }

      // Apply inverse transform immediately (no transition)
      el.style.transition = 'none';
      el.style.transform = deltaX !== 0 ? `translateX(${deltaX}px)` : '';
    });

    // Force reflow
    void listElement.offsetHeight;

    // Disable pointer events during animation
    listElement.style.pointerEvents = 'none';

    // Animate to final position
    freshElements.forEach((el) => {
      el.style.transition = `transform ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0, 0, 1)`;
      el.style.transform = '';
    });

    // Clean up after animation
    setTimeout(() => {
      freshElements.forEach((el) => {
        el.style.transition = '';
      });
      if (listElement) {
        listElement.style.pointerEvents = '';
      }
      isAnimating = false;
    }, ANIMATION_DURATION);
  }

  function resetDragState(): void {
    draggedIndex = null;
    draggedWorkspaceId = null;
    dropTargetIndex = null;
    dragOffsetX = 0;
  }

  function getItemTransform(index: number): string | undefined {
    // During FLIP animation, transforms are controlled directly via el.style
    if (isAnimating) return undefined;

    if (draggedIndex === null || dropTargetIndex === null) return undefined;

    // The dragged item follows the cursor horizontally
    if (index === draggedIndex) {
      return `translateX(${dragOffsetX}px)`;
    }

    // Calculate shifts for other items
    if (draggedIndex < dropTargetIndex) {
      // Dragging right: items between drag and target shift left
      if (index > draggedIndex && index <= dropTargetIndex) {
        return `translateX(-${itemWidth}px)`;
      }
    } else {
      // Dragging left: items between target and drag shift right
      if (index >= dropTargetIndex && index < draggedIndex) {
        return `translateX(${itemWidth}px)`;
      }
    }

    return undefined;
  }

  function isDragging(index: number): boolean {
    return draggedIndex === index;
  }
</script>

<svelte:window onclick={handleGlobalClick} onkeydown={handleKeydown} />

<div class="workspace-bar" class:shadow={showShadow}>
  <div class="workspace-icons-container">
    <div
      class="workspace-icons"
      bind:this={listElement}
      ondragover={handleDragOver}
      ondrop={handleDrop}
      role="list"
    >
      {#each workspaces as workspace, index (workspace.id)}
        <Tooltip text={getWorkspaceTooltip(workspace.name, index)}>
          <button
            class="workspace-icon"
            class:active={activeWorkspace?.id === workspace.id}
            class:dragging={isDragging(index)}
            style:transform={getItemTransform(index)}
            onclick={() => handleWorkspaceClick(workspace.id)}
            oncontextmenu={(e) => handleContextMenu(e, workspace.id)}
            draggable="true"
            ondragstart={(e) => handleDragStart(e, index, workspace.id)}
            ondragend={handleDragEnd}
            data-workspace-item
            data-workspace-id={workspace.id}
          >
            {workspace.icon}
          </button>
        </Tooltip>
      {/each}
    </div>
    <Tooltip text="Add">
      <button class="add-workspace-button" onclick={handleAddClick} aria-label="Add">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </Tooltip>
  </div>

  <!-- Add menu -->
  {#if isAddMenuOpen}
    <div class="add-menu">
      {#if onCreateNote}
        <button class="add-menu-item" onclick={handleNewNoteClick}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14,2 14,8 20,8"></polyline>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
          <span class="add-menu-label">New Note</span>
          <span class="add-menu-shortcut">{modKey}⇧N</span>
        </button>
      {/if}
      {#if onCreateDeck}
        <button class="add-menu-item" onclick={handleNewDeckClick}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          <span class="add-menu-label">New Deck</span>
          <span class="add-menu-shortcut"></span>
        </button>
      {/if}
      <button class="add-menu-item" onclick={openNewWorkspaceForm}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="12" y1="8" x2="12" y2="16"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
        </svg>
        <span class="add-menu-label">New Workspace</span>
        <span class="add-menu-shortcut"></span>
      </button>
      <div class="add-menu-separator"></div>
      <button
        class="add-menu-item"
        onclick={handleImportFileClick}
        disabled={isImporting}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <span class="add-menu-label">{isImporting ? 'Importing...' : 'Import file'}</span>
        <span class="add-menu-shortcut"></span>
      </button>
      {#if onCaptureWebpage}
        <button class="add-menu-item" onclick={handleCaptureWebpageClick}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path
              d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            ></path>
          </svg>
          <span class="add-menu-label">Capture webpage</span>
          <span class="add-menu-shortcut"></span>
        </button>
      {/if}
    </div>
  {/if}

  <!-- Workspace form popover -->
  {#if isFormPopoverOpen}
    <div class="workspace-popover">
      <h4>{editingWorkspaceId ? 'Edit Workspace' : 'New Workspace'}</h4>
      <div class="popover-form">
        <div class="form-row">
          <input
            type="text"
            class="icon-input"
            placeholder="Icon"
            bind:value={newWorkspaceIcon}
            maxlength="2"
          />
          <input
            type="text"
            class="name-input"
            placeholder="Workspace name"
            bind:value={newWorkspaceName}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                editingWorkspaceId ? handleUpdateWorkspace() : handleCreateWorkspace();
              }
            }}
          />
        </div>
        <div class="form-actions">
          <button class="cancel-btn" onclick={closeFormPopover}>Cancel</button>
          <button
            class="create-btn"
            onclick={editingWorkspaceId ? handleUpdateWorkspace : handleCreateWorkspace}
            disabled={!newWorkspaceName.trim()}
          >
            {editingWorkspaceId ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if contextMenuOpen}
    <div
      class="context-menu"
      style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px;"
      role="menu"
    >
      <button class="context-menu-item" onclick={handleEditWorkspace} role="menuitem">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        Edit
      </button>
      <button
        class="context-menu-item danger"
        onclick={handleDeleteWorkspace}
        role="menuitem"
        disabled={workspaces.length <= 1}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="3 6 5 6 21 6"></polyline>
          <path
            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          ></path>
        </svg>
        Delete
      </button>
    </div>
  {/if}
</div>

<style>
  .workspace-bar {
    border-top: 1px solid var(--border-light);
    padding: 0.75rem;
    background: var(--bg-secondary);
    flex-shrink: 0;
    position: relative;
    transition: box-shadow 0.2s ease;
    -webkit-app-region: drag;
  }

  /* macOS vibrancy - transparent to inherit sidebar's frosted effect */
  :global([data-vibrancy='true']) .workspace-bar {
    background: transparent !important;
  }

  /* Match main note view background on mobile */
  @media (max-width: 767px) {
    .workspace-bar {
      background: var(--bg-primary);
    }
  }

  .workspace-bar.shadow {
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
  }

  @media (prefers-color-scheme: dark) {
    .workspace-bar.shadow {
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
    }
  }

  .workspace-icons-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    -webkit-app-region: no-drag;
  }

  .workspace-icons {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .workspace-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 0.5rem;
    background: transparent;
    font-size: 1rem;
    cursor: grab;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease;
    user-select: none;
  }

  .workspace-icon:hover {
    background: var(--bg-primary);
    border-color: var(--border-medium);
  }

  .workspace-icon.active {
    border-color: var(--accent-primary);
    background: var(--accent-light);
  }

  .workspace-icon.dragging {
    opacity: 0.9;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    background: var(--bg-secondary);
    cursor: grabbing;
    transition:
      opacity 0.15s,
      box-shadow 0.15s;
  }

  .add-workspace-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px dashed var(--border-medium);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-workspace-button:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  /* Add menu styles */
  .add-menu {
    position: absolute;
    bottom: 100%;
    left: 0.5rem;
    right: 0.5rem;
    margin-bottom: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 0.25rem;
    z-index: 100;
    -webkit-app-region: no-drag;
  }

  .add-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.15s ease;
    text-align: left;
  }

  .add-menu-item:hover {
    background: var(--bg-hover);
  }

  .add-menu-item svg {
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .add-menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .add-menu-label {
    flex: 1;
  }

  .add-menu-shortcut {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  .add-menu-separator {
    height: 1px;
    background: var(--border-light);
    margin: 0.25rem 0;
  }

  /* Popover styles */
  .workspace-popover {
    position: absolute;
    bottom: 100%;
    left: 0.5rem;
    right: 0.5rem;
    margin-bottom: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 1rem;
    z-index: 100;
    -webkit-app-region: no-drag;
  }

  .workspace-popover h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .popover-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-row {
    display: flex;
    gap: 0.5rem;
  }

  .icon-input {
    width: 3rem;
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 1rem;
    text-align: center;
  }

  .name-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .icon-input:focus,
  .name-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .cancel-btn,
  .create-btn {
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .cancel-btn {
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-secondary);
  }

  .cancel-btn:hover {
    background: var(--bg-hover);
  }

  .create-btn {
    border: none;
    background: var(--accent-primary);
    color: var(--accent-text, white);
  }

  .create-btn:hover:not(:disabled) {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  .create-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Context menu styles */
  .context-menu {
    position: fixed;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px var(--shadow-medium, rgba(0, 0, 0, 0.15));
    padding: 0.25rem;
    min-width: 120px;
    -webkit-app-region: no-drag;
  }

  .context-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: background-color 0.15s ease;
    text-align: left;
  }

  .context-menu-item:hover {
    background: var(--bg-secondary);
  }

  .context-menu-item.danger {
    color: var(--error);
  }

  .context-menu-item.danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
  }

  .context-menu-item:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 0.5;
  }

  .context-menu-item svg {
    opacity: 0.7;
  }
</style>
