<script lang="ts">
  import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import {
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    calculateDropIndex
  } from '../utils/dragDrop.svelte';
  import { handleCrossSectionDrop } from '../utils/crossSectionDrag.svelte';
  import { globalDragState } from '../stores/dragState.svelte';

  interface Props {
    onNoteSelect: (note: NoteMetadata) => void;
    onCreateNote?: (noteType?: string) => void;
  }

  let { onNoteSelect, onCreateNote }: Props = $props();

  const dragState = globalDragState;

  // Dropdown state
  let isDropdownOpen = $state(false);

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

  async function handleTabClick(noteId: string): Promise<void> {
    const note = notesStore.notes.find((n) => n.id === noteId);
    if (note) {
      onNoteSelect(note);
      // Find the tab ID that corresponds to this note ID
      const tab = temporaryTabsStore.tabs.find((t) => t.noteId === noteId);
      if (tab) {
        await temporaryTabsStore.setActiveTab(tab.id);
      }
    }
  }

  async function handleCloseTab(tabId: string, event: Event): Promise<void> {
    event.stopPropagation();
    await temporaryTabsStore.removeTab(tabId);
  }

  async function handleClearAll(): Promise<void> {
    await temporaryTabsStore.clearAllTabs();
  }

  function truncateTitle(title: string, maxLength: number = 30): string {
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  }

  function getSourceIcon(source: string): string {
    switch (source) {
      case 'search':
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>`;
      case 'wikilink':
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>`;
      default:
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
        </svg>`;
    }
  }

  function onDragStart(
    event: DragEvent,
    tab: { id: string; noteId: string; title: string; source: string }
  ): void {
    handleDragStart(event, tab.id, 'temporary', dragState);
  }

  function onDragOver(event: DragEvent, index: number, element: HTMLElement): void {
    handleDragOver(event, index, 'temporary', dragState, element);
  }

  async function onDrop(event: DragEvent, targetIndex: number): Promise<void> {
    event.preventDefault();

    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    const { id, type } = JSON.parse(data);
    const position = dragState.dragOverPosition || 'bottom';

    // Handle cross-section drag (no source index adjustment needed)
    if (type !== 'temporary') {
      let dropIndex = targetIndex;
      if (position === 'bottom') {
        dropIndex = targetIndex + 1;
      }
      if (await handleCrossSectionDrop(id, type, 'temporary', dropIndex)) {
        handleDragEnd(dragState);
        return;
      }
    }

    // Handle same-section reorder for temporary tabs
    if (type === 'temporary') {
      const sourceIndex = temporaryTabsStore.tabs.findIndex((t) => t.id === id);
      if (sourceIndex !== -1) {
        const finalDropIndex = calculateDropIndex(targetIndex, position, sourceIndex);
        if (sourceIndex !== finalDropIndex) {
          await temporaryTabsStore.reorderTabs(sourceIndex, finalDropIndex);
        }
      }
    }

    handleDragEnd(dragState);
  }

  function onDragEnd(): void {
    handleDragEnd(dragState);
  }

  // Close dropdown when clicking outside
  $effect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Element;
      if (isDropdownOpen && !target.closest('.create-note-section')) {
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

<div class="temporary-tabs">
  <div class="tabs-header">
    <div class="separator"></div>
    {#if temporaryTabsStore.tabs.length > 0}
      <button class="clear-all" onclick={handleClearAll}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="down-arrow"
        >
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <polyline points="7,14 12,19 17,14"></polyline>
        </svg>
        close all
      </button>
    {/if}
  </div>

  <!-- Create New Note Button (always visible) -->
  <div class="create-note-section">
    <div class="create-note-button-group">
      <button
        class="create-note-button main-button"
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
        class="create-note-button dropdown-button"
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
            <span class="note-type-name">{noteType.name}</span>
            <span class="note-type-count">({noteType.count})</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if temporaryTabsStore.tabs.length > 0}
    <div class="tabs-list">
      {#each temporaryTabsStore.tabs as tab, index (tab.id)}
        <div
          class="tab-item"
          class:active={tab.id === temporaryTabsStore.activeTabId}
          class:dragging={dragState.draggedId === tab.id}
          class:drag-over-top={dragState.dragOverIndex === index &&
            dragState.dragOverSection === 'temporary' &&
            dragState.dragOverPosition === 'top'}
          class:drag-over-bottom={dragState.dragOverIndex === index &&
            dragState.dragOverSection === 'temporary' &&
            dragState.dragOverPosition === 'bottom'}
          data-id={tab.id}
          draggable="true"
          ondragstart={(e) => onDragStart(e, tab)}
          ondragover={(e) => onDragOver(e, index, e.currentTarget)}
          ondrop={(e) => onDrop(e, index)}
          ondragend={onDragEnd}
          onclick={() => handleTabClick(tab.noteId)}
          title={tab.title}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && handleTabClick(tab.noteId)}
        >
          <div class="tab-content">
            <div class="tab-icon">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html getSourceIcon(tab.source)}
            </div>
            <span class="tab-title">{truncateTitle(tab.title)}</span>
          </div>
          <button
            class="close-tab"
            onclick={(e) => handleCloseTab(tab.id, e)}
            aria-label="Close tab"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .create-note-section {
    padding: 0.75rem;
    position: relative;
  }

  .create-note-button-group {
    display: flex;
    width: 100%;
  }

  .create-note-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px dashed var(--border-light);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .create-note-button.main-button {
    flex: 1;
    border-radius: 0.5rem 0 0 0.5rem;
    border-right: none;
  }

  .create-note-button.dropdown-button {
    padding: 0.5rem;
    border-radius: 0 0.5rem 0.5rem 0;
    min-width: 2rem;
    width: 2rem;
  }

  .create-note-button:hover:not(:disabled) {
    background: var(--bg-secondary);
    border-color: var(--border-medium);
    color: var(--text-primary);
  }

  .create-note-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .create-note-button .rotated {
    transform: rotate(180deg);
  }

  .note-type-dropdown {
    position: absolute;
    top: 100%;
    left: 0.75rem;
    right: 0.75rem;
    z-index: 100;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px var(--shadow-medium);
    margin-top: 0.25rem;
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

  .note-type-name {
    font-weight: 500;
  }

  .note-type-count {
    color: var(--text-secondary);
    font-size: 0.75rem;
  }

  .temporary-tabs {
    display: flex;
    flex-direction: column;
  }

  .separator {
    height: 1px;
    background: repeating-linear-gradient(
      to right,
      var(--border-light) 0,
      var(--border-light) 4px,
      transparent 4px,
      transparent 8px
    );
    width: 100%;
  }

  .tabs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
  }

  .clear-all {
    background: none;
    border: none;
    color: var(--text-tertiary);
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.2s ease;
    text-decoration: underline;
    text-underline-offset: 2px;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .clear-all:hover {
    color: var(--text-secondary);
  }

  .down-arrow {
    flex-shrink: 0;
  }

  .tabs-list {
    padding: 0 0.75rem;
  }

  .tab-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.4rem;
    border-radius: 0.4rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .tab-item.active {
    background: var(--accent-light);
  }

  .tab-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 0.4rem;
    flex: 1;
    min-width: 0;
  }

  .tab-icon {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .tab-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close-tab {
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .tab-item:hover .close-tab {
    display: flex;
  }

  .close-tab:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
</style>
