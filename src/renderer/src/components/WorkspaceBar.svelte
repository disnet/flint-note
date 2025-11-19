<script lang="ts">
  import { workspacesStore } from '../stores/workspacesStore.svelte';
  import WorkspacePopover from './WorkspacePopover.svelte';

  interface Props {
    onCreateNote?: (noteType?: string) => void;
    showShadow?: boolean;
  }

  let { onCreateNote, showShadow = false }: Props = $props();

  let isPopoverOpen = $state(false);
  let editingWorkspaceId = $state<string | null>(null);

  // Context menu state
  let contextMenuOpen = $state(false);
  let contextMenuWorkspaceId = $state<string | null>(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });

  function getWorkspaceTooltip(name: string, index: number): string {
    if (index < 9) {
      return `${name} (Ctrl+${index + 1})`;
    }
    return name;
  }

  function handleWorkspaceClick(workspaceId: string): void {
    if (workspacesStore.activeWorkspaceId === workspaceId) {
      // Clicking active workspace opens popover
      isPopoverOpen = !isPopoverOpen;
    } else {
      // Switch to different workspace
      workspacesStore.switchWorkspace(workspaceId);
    }
  }

  function handleAddClick(): void {
    isPopoverOpen = !isPopoverOpen;
  }

  function closePopover(): void {
    isPopoverOpen = false;
    editingWorkspaceId = null;
  }

  function handleContextMenu(event: MouseEvent, workspaceId: string): void {
    event.preventDefault();
    contextMenuWorkspaceId = workspaceId;

    // Calculate position with viewport bounds checking
    const menuWidth = 120;
    const menuHeight = 80;
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

  function closeContextMenu(): void {
    contextMenuOpen = false;
    contextMenuWorkspaceId = null;
  }

  function handleEditWorkspace(): void {
    if (contextMenuWorkspaceId) {
      editingWorkspaceId = contextMenuWorkspaceId;
      isPopoverOpen = true;
    }
    closeContextMenu();
  }

  async function handleDeleteWorkspace(): Promise<void> {
    if (contextMenuWorkspaceId) {
      await workspacesStore.deleteWorkspace(contextMenuWorkspaceId);
    }
    closeContextMenu();
  }

  // Close context menu on click outside
  function handleGlobalClick(event: MouseEvent): void {
    if (contextMenuOpen) {
      const target = event.target as Element;
      if (!target.closest('.context-menu')) {
        closeContextMenu();
      }
    }
  }

  // Close context menu on escape
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && contextMenuOpen) {
      closeContextMenu();
    }
  }

  // Handle workspace menu events from app menu
  function handleMenuNewWorkspace(): void {
    editingWorkspaceId = null;
    isPopoverOpen = true;
  }

  function handleMenuEditWorkspace(): void {
    // Edit the currently active workspace
    editingWorkspaceId = workspacesStore.activeWorkspaceId;
    isPopoverOpen = true;
  }

  async function handleMenuDeleteWorkspace(): Promise<void> {
    // Delete the currently active workspace
    if (workspacesStore.workspaces.length > 1) {
      await workspacesStore.deleteWorkspace(workspacesStore.activeWorkspaceId);
    }
  }

  // Listen for menu events
  $effect(() => {
    const handleNew = (): void => handleMenuNewWorkspace();
    const handleEdit = (): void => handleMenuEditWorkspace();
    const handleDelete = (): void => {
      handleMenuDeleteWorkspace();
    };

    document.addEventListener('workspace-menu-new', handleNew);
    document.addEventListener('workspace-menu-edit', handleEdit);
    document.addEventListener('workspace-menu-delete', handleDelete);

    return () => {
      document.removeEventListener('workspace-menu-new', handleNew);
      document.removeEventListener('workspace-menu-edit', handleEdit);
      document.removeEventListener('workspace-menu-delete', handleDelete);
    };
  });
</script>

<svelte:window onclick={handleGlobalClick} onkeydown={handleKeydown} />

<div class="workspace-bar" class:shadow={showShadow}>
  <div class="workspace-icons">
    {#each workspacesStore.workspaces as workspace, index (workspace.id)}
      <button
        class="workspace-icon"
        class:active={workspacesStore.activeWorkspaceId === workspace.id}
        onclick={() => handleWorkspaceClick(workspace.id)}
        oncontextmenu={(e) => handleContextMenu(e, workspace.id)}
        style={workspace.color ? `--workspace-color: ${workspace.color}` : ''}
      >
        {workspace.icon}
        <span class="tooltip">{getWorkspaceTooltip(workspace.name, index)}</span>
      </button>
    {/each}
    <button
      class="add-workspace-button"
      onclick={handleAddClick}
      title="New note or workspace"
      aria-label="New note or workspace"
    >
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
  </div>

  {#if isPopoverOpen}
    <WorkspacePopover {onCreateNote} onClose={closePopover} {editingWorkspaceId} />
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
        disabled={workspacesStore.workspaces.length <= 1}
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
  }

  .workspace-bar.shadow {
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
  }

  @media (prefers-color-scheme: dark) {
    .workspace-bar.shadow {
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
    }
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
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .workspace-icon:hover {
    background: var(--bg-primary);
    border-color: var(--border-medium);
  }

  .workspace-icon.active {
    border-color: var(--accent-primary);
    background: var(--accent-light);
  }

  .tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.375rem 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    margin-bottom: 0.5rem;
    z-index: 1000;
  }

  /* Prevent tooltip from clipping at left edge */
  .workspace-icon:first-child .tooltip {
    left: 0;
    transform: translateX(0);
  }

  .workspace-icon:hover .tooltip {
    opacity: 1;
    visibility: visible;
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
    margin-left: auto;
  }

  .add-workspace-button:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  /* Context menu styles */
  .context-menu {
    position: fixed;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px var(--shadow-medium);
    padding: 0.25rem;
    min-width: 120px;
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
    color: var(--text-tertiary);
    cursor: not-allowed;
    opacity: 0.5;
  }

  .context-menu-item svg {
    opacity: 0.7;
  }
</style>
