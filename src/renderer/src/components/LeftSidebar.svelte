<script lang="ts">
  import { fly } from 'svelte/transition';
  import SystemViews from './SystemViews.svelte';
  import PinnedNotes from './PinnedNotes.svelte';
  import TemporaryTabs from './TemporaryTabs.svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import WorkspaceBar from './WorkspaceBar.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import { workspacesStore } from '../stores/workspacesStore.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    activeNote: NoteMetadata | null;
    activeSystemView:
      | 'inbox'
      | 'daily'
      | 'notes'
      | 'settings'
      | 'workflows'
      | 'review'
      | null;
    onNoteSelect: (note: NoteMetadata) => void;
    onSystemViewSelect: (
      view: 'inbox' | 'daily' | 'notes' | 'settings' | 'workflows' | 'review' | null
    ) => void;
    onCreateNote?: (noteType?: string) => void;
  }

  let {
    activeNote,
    onNoteSelect,
    onSystemViewSelect,
    activeSystemView,
    onCreateNote
  }: Props = $props();

  // Width state - track local width during resize
  let localWidth = $state<number | null>(null);

  // Use store width when not actively resizing
  let currentWidth = $derived(localWidth ?? sidebarState.leftSidebar.width);

  // Track workspace changes for slide direction (use non-reactive variable for previous)
  let previousWorkspaceId: string | null = null;
  let slideDirection = $state(1); // 1 = slide left (going right), -1 = slide right (going left)

  // Update slide direction when workspace changes
  $effect.pre(() => {
    const currentId = workspacesStore.activeWorkspaceId;

    if (previousWorkspaceId && currentId && previousWorkspaceId !== currentId) {
      const prevIndex = workspacesStore.workspaces.findIndex(
        (w) => w.id === previousWorkspaceId
      );
      const currentIndex = workspacesStore.workspaces.findIndex(
        (w) => w.id === currentId
      );

      if (prevIndex >= 0 && currentIndex >= 0) {
        slideDirection = currentIndex > prevIndex ? 1 : -1;
      }
    }

    previousWorkspaceId = currentId;
  });

  // Shadow state for workspace bar
  let showShadow = $state(false);
  let contentElement = $state<HTMLElement | null>(null);

  function updateShadow(): void {
    if (contentElement) {
      const { scrollTop, scrollHeight, clientHeight } = contentElement;
      // Show shadow when there's content below the viewport
      showShadow = scrollTop + clientHeight < scrollHeight - 1;
    }
  }

  // Watch for content size changes and update shadow
  $effect(() => {
    if (!contentElement) return;

    updateShadow();

    // Use ResizeObserver to detect content size changes
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

    // Debounce persisting to storage during resize
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      sidebarState.setLeftSidebarWidth(width);
      localWidth = null; // Reset to use store value
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
      <SystemViews {onSystemViewSelect} {activeSystemView} />
      {#key workspacesStore.activeWorkspaceId}
        <div
          class="workspace-content"
          in:fly={{ x: slideDirection * 50, duration: 150, delay: 75 }}
          out:fly={{ x: slideDirection * -50, duration: 75 }}
        >
          <PinnedNotes {activeNote} {onNoteSelect} />
          <TemporaryTabs {onNoteSelect} {onCreateNote} />
        </div>
      {/key}
    </div>
    <WorkspaceBar {onCreateNote} {showShadow} />
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
