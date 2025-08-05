<script lang="ts">
  import SystemViews from './SystemViews.svelte';
  import PinnedNotes from './PinnedNotes.svelte';
  import TemporaryTabs from './TemporaryTabs.svelte';
  import VaultSwitcher from './VaultSwitcher.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    onNoteSelect: (note: NoteMetadata) => void;
    onCreateNote: () => void;
  }

  let { onNoteSelect, onCreateNote }: Props = $props();

  function toggleSidebar() {
    sidebarState.toggleLeftSidebar();
  }
</script>

<div class="left-sidebar" class:visible={sidebarState.leftSidebar.visible}>
  <div class="sidebar-header">
    <button class="hamburger" onclick={toggleSidebar} aria-label="Toggle sidebar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    </button>
    <VaultSwitcher />
  </div>

  <div class="sidebar-content">
    <SystemViews {onNoteSelect} {onCreateNote} />
    <PinnedNotes {onNoteSelect} />
    <TemporaryTabs {onNoteSelect} />
  </div>
</div>

<style>
  .left-sidebar {
    width: 300px;
    height: 100%;
    background: var(--bg-primary);
    border-right: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    transition: transform 0.3s ease;
  }

  .left-sidebar:not(.visible) {
    transform: translateX(-100%);
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .hamburger {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border: none;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .hamburger:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 1400px) {
    .left-sidebar {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 100;
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
    }
  }
</style>