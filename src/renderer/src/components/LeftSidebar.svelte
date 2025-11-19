<script lang="ts">
  import SystemViews from './SystemViews.svelte';
  import PinnedNotes from './PinnedNotes.svelte';
  import TemporaryTabs from './TemporaryTabs.svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import WorkspaceBar from './WorkspaceBar.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
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
  style="--sidebar-width: {currentWidth}px"
>
  <ResizeHandle side="left" onResize={handleResize} minWidth={200} maxWidth={600} />
  <div class="sidebar-inner">
    <div class="sidebar-content" bind:this={contentElement} onscroll={updateShadow}>
      <SystemViews {onSystemViewSelect} {activeSystemView} />
      <PinnedNotes {activeNote} {onNoteSelect} />
      <TemporaryTabs {onNoteSelect} {onCreateNote} />
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
  }

  .left-sidebar:not(.visible) {
    width: 0;
    min-width: 0;
    border-right: none;
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
    display: flex;
    flex-direction: column;
    min-width: 0;
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
