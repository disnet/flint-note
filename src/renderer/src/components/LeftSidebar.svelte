<script lang="ts">
  import SystemViews from './SystemViews.svelte';
  import PinnedNotes from './PinnedNotes.svelte';
  import TemporaryTabs from './TemporaryTabs.svelte';
  import VaultSwitcher from './VaultSwitcher.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    activeNote: NoteMetadata | null;
    activeSystemView: 'inbox' | 'notes' | 'settings' | 'slash-commands' | null;
    onNoteSelect: (note: NoteMetadata) => void;
    onSystemViewSelect: (
      view: 'inbox' | 'notes' | 'settings' | 'slash-commands' | null
    ) => void;
    onNoteClose: () => void;
  }

  let {
    activeNote,
    onNoteSelect,
    onSystemViewSelect,
    activeSystemView,
    onNoteClose
  }: Props = $props();

  function toggleSidebar(): void {
    sidebarState.toggleLeftSidebar();
  }
</script>

<!-- Floating hamburger button when sidebar is hidden -->
{#if !sidebarState.leftSidebar.visible}
  <button class="floating-hamburger" onclick={toggleSidebar} aria-label="Open sidebar">
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <line x1="3" y1="12" x2="21" y2="12"></line>
      <line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>
  </button>
{/if}

<div class="left-sidebar" class:visible={sidebarState.leftSidebar.visible}>
  <div class="sidebar-header">
    <button class="hamburger" onclick={toggleSidebar} aria-label="Toggle sidebar">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    </button>
    <VaultSwitcher {onNoteClose} />
  </div>

  <div class="sidebar-content">
    <SystemViews {onSystemViewSelect} {activeSystemView} />
    <PinnedNotes {activeNote} {onNoteSelect} />
    <TemporaryTabs {onNoteSelect} />
  </div>
</div>

<style>
  .left-sidebar {
    width: 300px;
    height: 100vh;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    transition: all 0.3s ease;
  }

  .left-sidebar:not(.visible) {
    width: 0;
    min-width: 0;
    overflow: hidden;
    border-right: none;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1.25rem;
  }

  .hamburger {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
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

  .floating-hamburger {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border-light);
  }

  .floating-hamburger:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
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
