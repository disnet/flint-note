<script lang="ts">
  import { workspacesStore } from '../stores/workspacesStore.svelte';
  import WorkspacePopover from './WorkspacePopover.svelte';

  interface Props {
    onCreateNote?: (noteType?: string) => void;
    showShadow?: boolean;
  }

  let { onCreateNote, showShadow = false }: Props = $props();

  let isPopoverOpen = $state(false);

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
  }
</script>

<div class="workspace-bar" class:shadow={showShadow}>
  <div class="workspace-icons">
    {#each workspacesStore.workspaces as workspace (workspace.id)}
      <button
        class="workspace-icon"
        class:active={workspacesStore.activeWorkspaceId === workspace.id}
        onclick={() => handleWorkspaceClick(workspace.id)}
        title={workspace.name}
        style={workspace.color ? `--workspace-color: ${workspace.color}` : ''}
      >
        {workspace.icon}
      </button>
    {/each}
    <button
      class="add-workspace-button"
      onclick={handleAddClick}
      title="New note or workspace"
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
    <WorkspacePopover {onCreateNote} onClose={closePopover} />
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 0.5rem;
    background: var(--bg-primary);
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .workspace-icon:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
  }

  .workspace-icon.active {
    border-color: var(--accent-primary);
    background: var(--accent-light);
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
</style>
