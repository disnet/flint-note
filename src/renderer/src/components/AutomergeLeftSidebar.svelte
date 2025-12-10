<script lang="ts">
  /**
   * Left sidebar component for the Automerge app
   * Contains system views, pinned notes, recent notes, and workspace bar
   */
  import { fly } from 'svelte/transition';
  import AutomergeSystemViews from './AutomergeSystemViews.svelte';
  import AutomergeSidebarNotes from './AutomergeSidebarNotes.svelte';
  import AutomergeWorkspaceBar from './AutomergeWorkspaceBar.svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import { getActiveWorkspace, type Note } from '../lib/automerge';

  interface Props {
    activeSystemView: 'notes' | 'settings' | null;
    onNoteSelect: (note: Note) => void;
    onSystemViewSelect: (view: 'notes' | 'settings' | null) => void;
    onCreateNote?: () => void;
  }

  let { onNoteSelect, onSystemViewSelect, activeSystemView, onCreateNote }: Props =
    $props();

  // Width state - track local width during resize
  let localWidth = $state<number | null>(null);

  // Use store width when not actively resizing
  let currentWidth = $derived(localWidth ?? sidebarState.leftSidebar.width);

  // Track workspace changes for slide direction
  let previousWorkspaceId: string | null = null;
  let slideDirection = $state(1);

  // Get active workspace reactively
  const activeWorkspace = $derived(getActiveWorkspace());

  // Update slide direction when workspace changes
  $effect.pre(() => {
    const currentId = activeWorkspace?.id ?? null;

    if (previousWorkspaceId && currentId && previousWorkspaceId !== currentId) {
      // Simple slide direction - positive when moving forward
      slideDirection = 1;
    }

    previousWorkspaceId = currentId;
  });

  // Shadow state for workspace bar
  let showShadow = $state(false);
  let contentElement = $state<HTMLElement | null>(null);

  function updateShadow(): void {
    if (contentElement) {
      const { scrollTop, scrollHeight, clientHeight } = contentElement;
      showShadow = scrollTop + clientHeight < scrollHeight - 1;
    }
  }

  // Watch for content size changes and update shadow
  $effect(() => {
    if (!contentElement) return;

    updateShadow();

    const resizeObserver = new ResizeObserver(() => {
      updateShadow();
    });

    resizeObserver.observe(contentElement);

    return () => {
      resizeObserver.disconnect();
    };
  });

  function handleResize(width: number): void {
    localWidth = width;

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      sidebarState.setLeftSidebarWidth(width);
      localWidth = null;
    }, 300);
  }

  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
</script>

<div
  class="left-sidebar"
  class:visible={sidebarState.leftSidebar.visible}
  class:resizing={localWidth !== null}
  style="--sidebar-width: {currentWidth}px"
>
  <ResizeHandle side="left" onResize={handleResize} minWidth={200} maxWidth={600} />
  <div class="sidebar-inner">
    <div class="sidebar-content" bind:this={contentElement} onscroll={updateShadow}>
      <AutomergeSystemViews {onSystemViewSelect} {activeSystemView} />
      {#key activeWorkspace?.id}
        <div
          class="workspace-content"
          in:fly={{ x: slideDirection * 50, duration: 150, delay: 75 }}
          out:fly={{ x: slideDirection * -50, duration: 75 }}
        >
          <AutomergeSidebarNotes {onNoteSelect} />
        </div>
      {/key}
    </div>
    <AutomergeWorkspaceBar {onCreateNote} {showShadow} />
  </div>
</div>

<style>
  .left-sidebar {
    position: relative;
    height: 100%;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    flex-shrink: 0;
    overflow: hidden;
    transition:
      width 0.2s ease-out,
      min-width 0.2s ease-out;
  }

  .left-sidebar.resizing {
    transition: none;
  }

  .left-sidebar:not(.visible) {
    width: 0;
    min-width: 0;
    border-right: 1px solid transparent;
  }

  .left-sidebar .sidebar-inner {
    opacity: 1;
    transition: opacity 0.15s ease-out;
  }

  .left-sidebar:not(.visible) .sidebar-inner {
    opacity: 0;
  }

  .sidebar-inner {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
    scrollbar-gutter: stable;
  }

  .workspace-content {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  /* Custom scrollbar styling */
  .sidebar-content::-webkit-scrollbar {
    width: 12px;
  }

  .sidebar-content::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 6px;
  }

  .sidebar-content::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    border: 2px solid transparent;
    background-clip: padding-box;
    transition: all 0.2s ease;
  }

  .sidebar-content::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.3);
    background-clip: padding-box;
  }

  .sidebar-content::-webkit-scrollbar-corner {
    background: transparent;
  }

  @media (prefers-color-scheme: dark) {
    .sidebar-content::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
    }

    .sidebar-content::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }

  /* Firefox scrollbar styling */
  .sidebar-content {
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  }

  @media (prefers-color-scheme: dark) {
    .sidebar-content {
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }
  }
</style>
