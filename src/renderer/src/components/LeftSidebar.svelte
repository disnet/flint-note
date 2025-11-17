<script lang="ts">
  import SystemViews from './SystemViews.svelte';
  import PinnedNotes from './PinnedNotes.svelte';
  import TemporaryTabs from './TemporaryTabs.svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import { notesStore } from '../services/noteStore.svelte';
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

  // Dropdown state
  let isDropdownOpen = $state(false);

  // Width state - track local width during resize
  let localWidth = $state<number | null>(null);

  // Track if content is scrollable and not at bottom
  let showShadow = $state(false);
  let contentElement: HTMLDivElement | null = $state(null);

  // Use store width when not actively resizing
  let currentWidth = $derived(localWidth ?? sidebarState.leftSidebar.width);

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

  function toggleDropdown(): void {
    isDropdownOpen = !isDropdownOpen;
  }

  function closeDropdown(): void {
    isDropdownOpen = false;
  }

  function handleCreateNoteWithType(noteType?: string): void {
    if (onCreateNote) {
      onCreateNote(noteType);
    }
    closeDropdown();
  }

  // Check if content is scrollable and show shadow when not at bottom
  $effect(() => {
    function checkShadow(): void {
      if (contentElement) {
        const isScrollable = contentElement.scrollHeight > contentElement.clientHeight;
        const isAtBottom =
          contentElement.scrollHeight - contentElement.scrollTop - contentElement.clientHeight <
          1; // Small threshold for rounding
        showShadow = isScrollable && !isAtBottom;
      }
    }

    // Initial check
    checkShadow();

    // Check again after a short delay to ensure content is fully rendered
    const timeoutId = setTimeout(checkShadow, 100);

    // Re-check on scroll
    if (contentElement) {
      contentElement.addEventListener('scroll', checkShadow);
    }

    // Re-check on resize
    const resizeObserver = new ResizeObserver(checkShadow);
    if (contentElement) {
      resizeObserver.observe(contentElement);
    }

    // Re-check when child elements are added/removed/modified
    const mutationObserver = new MutationObserver(checkShadow);
    if (contentElement) {
      mutationObserver.observe(contentElement, {
        childList: true,
        subtree: true,
        attributes: false
      });
    }

    return () => {
      clearTimeout(timeoutId);
      if (contentElement) {
        contentElement.removeEventListener('scroll', checkShadow);
      }
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  });

  // Close dropdown when clicking outside
  $effect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Element;
      if (isDropdownOpen && !target.closest('.sidebar-footer')) {
        closeDropdown();
      }
    }

    if (isDropdownOpen) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 10);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return () => {};
  });
</script>

<div
  class="left-sidebar"
  class:visible={sidebarState.leftSidebar.visible}
  style="--sidebar-width: {currentWidth}px"
>
  <ResizeHandle side="left" onResize={handleResize} minWidth={200} maxWidth={600} />
  <div class="sidebar-inner">
    <div class="sidebar-content" bind:this={contentElement}>
      <SystemViews {onSystemViewSelect} {activeSystemView} />
      <PinnedNotes {activeNote} {onNoteSelect} />
      <TemporaryTabs {onNoteSelect} {onCreateNote} />
    </div>
    <div class="sidebar-footer" class:has-scroll={showShadow}>
      <div class="create-note-button-group">
        <button
          class="new-note-button main-button"
          onclick={() => handleCreateNoteWithType()}
          disabled={!onCreateNote}
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
          New Note
        </button>
        <button
          class="new-note-button dropdown-button"
          onclick={toggleDropdown}
          disabled={!onCreateNote}
          aria-label="Choose note type"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class:rotated={isDropdownOpen}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {#if isDropdownOpen && notesStore.noteTypes.length > 0}
        <div class="note-type-dropdown">
          {#each notesStore.noteTypes as noteType (noteType.name)}
            <button
              class="note-type-option"
              onclick={() => handleCreateNoteWithType(noteType.name)}
            >
              <div class="note-type-main">
                {#if noteType.icon}
                  <span class="note-type-icon">{noteType.icon}</span>
                {/if}
                <span class="note-type-name">{noteType.name}</span>
              </div>
              <span class="note-type-count">({noteType.count})</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
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

  .sidebar-footer {
    border-top: 1px solid var(--border-light);
    padding: 0.75rem;
    background: var(--bg-secondary);
    flex-shrink: 0;
    position: relative;
    box-shadow: none;
    transition: box-shadow 0.2s ease;
  }

  .sidebar-footer.has-scroll {
    box-shadow: 0 -4px 8px rgba(0, 0, 0, 0.06);
  }

  @media (prefers-color-scheme: dark) {
    .sidebar-footer.has-scroll {
      box-shadow: 0 -4px 8px rgba(0, 0, 0, 0.3);
    }
  }

  .create-note-button-group {
    display: flex;
    width: 100%;
  }

  .new-note-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-medium);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .new-note-button.main-button {
    flex: 1;
    border-radius: 0.5rem 0 0 0.5rem;
    border-right: none;
  }

  .new-note-button.dropdown-button {
    padding: 0.5rem;
    border-radius: 0 0.5rem 0.5rem 0;
    min-width: 2rem;
    width: 2rem;
  }

  .new-note-button:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  .new-note-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .new-note-button .rotated {
    transform: rotate(180deg);
  }

  .note-type-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0.75rem;
    right: 0.75rem;
    z-index: 100;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px var(--shadow-medium);
    margin-bottom: 0.25rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .note-type-option {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
    text-align: left;
  }

  .note-type-option:hover {
    background: var(--bg-secondary);
  }

  .note-type-option:first-child {
    border-radius: 0.5rem 0.5rem 0 0;
  }

  .note-type-option:last-child {
    border-radius: 0 0 0.5rem 0.5rem;
  }

  .note-type-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .note-type-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .note-type-name {
    font-weight: 500;
  }

  .note-type-count {
    color: var(--text-secondary);
    font-size: 0.75rem;
  }
</style>
