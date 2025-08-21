<script lang="ts">
  import SystemViews from './SystemViews.svelte';
  import PinnedNotes from './PinnedNotes.svelte';
  import TemporaryTabs from './TemporaryTabs.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    activeNote: NoteMetadata | null;
    activeSystemView: 'notes' | 'settings' | 'slash-commands' | null;
    onNoteSelect: (note: NoteMetadata) => void;
    onSystemViewSelect: (view: 'notes' | 'settings' | 'slash-commands' | null) => void;
  }

  let { activeNote, onNoteSelect, onSystemViewSelect, activeSystemView }: Props =
    $props();
</script>

<div class="left-sidebar" class:visible={sidebarState.leftSidebar.visible}>
  <div class="sidebar-content">
    <SystemViews {onSystemViewSelect} {activeSystemView} />
    <PinnedNotes {activeNote} {onNoteSelect} />
    <TemporaryTabs {onNoteSelect} />
  </div>
</div>

<style>
  .left-sidebar {
    height: 100%;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    width: 300px;
    min-width: 300px;
    flex-shrink: 0;
    overflow: hidden;
  }

  .left-sidebar:not(.visible) {
    width: 0;
    min-width: 0;
    border-right: none;
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    width: 300px;
    min-width: 300px;
    will-change: transform;
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
