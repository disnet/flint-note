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

  let { onNoteSelect }: Props = $props();

  const dragState = globalDragState;

  // Check if notes are still loading
  let isNotesLoading = $derived(notesStore.loading);

  // Check if tabs are ready to display (validated and hydrated)
  let isTabsReady = $derived(temporaryTabsStore.isReady);

  // Hydrate tabs with metadata from notesStore
  let hydratedTabs = $derived(
    temporaryTabsStore.tabs.map((tab) => {
      const note = notesStore.notes.find((n) => n.id === tab.noteId);
      if (!note && !isNotesLoading && isTabsReady) {
        // Only warn if we're supposedly ready but still missing notes
        console.warn('[TemporaryTabs] Tab hydration failed - note not found:', {
          tabId: tab.id,
          noteId: tab.noteId,
          source: tab.source,
          openedAt: tab.openedAt,
          lastAccessed: tab.lastAccessed,
          totalNotesInStore: notesStore.notes.length,
          availableNoteIds: notesStore.notes.map((n) => n.id).slice(0, 5),
          reactivityCheck: {
            storeTabsLength: temporaryTabsStore.tabs.length,
            notesStoreLength: notesStore.notes.length,
            isNotesLoading,
            isTabsReady
          }
        });
      }
      return {
        ...tab,
        title: note?.title || ''
      };
    })
  );

  async function handleTabClick(noteId: string): Promise<void> {
    // Don't allow clicks while tabs are not ready
    if (!isTabsReady || isNotesLoading) {
      console.log(
        '[TemporaryTabs] Click blocked - tabs not ready or notes still loading'
      );
      return;
    }

    console.log('[TemporaryTabs] Tab clicked:', { noteId });
    const note = notesStore.notes.find((n) => n.id === noteId);
    if (note) {
      console.log('[TemporaryTabs] Note found, opening:', {
        noteId: note.id,
        title: note.title
      });
      onNoteSelect(note);
      // Find the tab ID that corresponds to this note ID
      const tab = temporaryTabsStore.tabs.find((t) => t.noteId === noteId);
      if (tab) {
        await temporaryTabsStore.setActiveTab(tab.id);
      }
    } else {
      console.error(
        '[TemporaryTabs] ❌ CRITICAL: Click on tab with missing note - cannot open:',
        {
          noteId,
          notesStoreState: {
            loading: notesStore.loading,
            totalNotes: notesStore.notes.length,
            noteTypes: notesStore.noteTypes,
            firstTenNoteIds: notesStore.notes.map((n) => n.id).slice(0, 10)
          },
          tabInfo: temporaryTabsStore.tabs.find((t) => t.noteId === noteId),
          allTabs: temporaryTabsStore.tabs.map((t) => ({ id: t.id, noteId: t.noteId }))
        }
      );

      // Try to fetch the note directly from the API to see if it exists in database
      try {
        const fetchedNote = await window.api?.getNote({ identifier: noteId });
        console.error('[TemporaryTabs] Direct API fetch result:', {
          success: !!fetchedNote,
          note: fetchedNote
        });
      } catch (error) {
        console.error('[TemporaryTabs] Direct API fetch failed:', error);
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

  function getTabIcon(
    noteId: string,
    source: string
  ): { type: 'emoji' | 'svg'; value: string } {
    // Check for custom note type icon first
    const note = notesStore.notes.find((n) => n.id === noteId);
    if (note) {
      const noteType = notesStore.noteTypes.find((t) => t.name === note.type);
      if (noteType?.icon) {
        return { type: 'emoji', value: noteType.icon };
      }
    }

    // Fall back to source-based icon logic
    return { type: 'svg', value: source };
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

  // Auto-scroll to active tab when it changes
  $effect(() => {
    const activeId = temporaryTabsStore.activeTabId;
    if (activeId && isTabsReady) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        const activeElement = document.querySelector(
          `.tab-item[data-id="${activeId}"]`
        ) as HTMLElement;
        if (activeElement) {
          activeElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
          });
        }
      }, 50);
    }
  });
</script>

<div class="temporary-tabs">
  <div class="tabs-header">
    <div class="separator"></div>
    {#if temporaryTabsStore.tabs.length > 0 && isTabsReady}
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

  {#if !isTabsReady}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <span class="loading-text">Loading tabs...</span>
    </div>
  {:else if hydratedTabs.length > 0}
    <div class="tabs-list">
      {#each hydratedTabs as tab, index (tab.id)}
        <div
          class="tab-item"
          class:active={tab.id === temporaryTabsStore.activeTabId}
          class:loading={!isTabsReady}
          class:dragging={dragState.draggedId === tab.id}
          class:drag-over-top={dragState.dragOverIndex === index &&
            dragState.dragOverSection === 'temporary' &&
            dragState.dragOverPosition === 'top'}
          class:drag-over-bottom={dragState.dragOverIndex === index &&
            dragState.dragOverSection === 'temporary' &&
            dragState.dragOverPosition === 'bottom'}
          data-id={tab.id}
          draggable={isTabsReady}
          ondragstart={(e) => onDragStart(e, tab)}
          ondragover={(e) => onDragOver(e, index, e.currentTarget)}
          ondrop={(e) => onDrop(e, index)}
          ondragend={onDragEnd}
          onclick={() => handleTabClick(tab.noteId)}
          title={!isTabsReady ? 'Loading...' : tab.title}
          role="button"
          tabindex={!isTabsReady ? -1 : 0}
          onkeydown={(e) => e.key === 'Enter' && handleTabClick(tab.noteId)}
        >
          <div class="tab-content">
            <div class="tab-icon">
              {#if getTabIcon(tab.noteId, tab.source).type === 'emoji'}
                <span class="emoji-icon">{getTabIcon(tab.noteId, tab.source).value}</span>
              {:else}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html getSourceIcon(getTabIcon(tab.noteId, tab.source).value)}
              {/if}
            </div>
            <span class="tab-title">
              {#if tab.title}
                {truncateTitle(tab.title)}
              {:else}
                <span class="untitled-text">Untitled</span>
              {/if}
            </span>
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

  .tab-item.loading {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
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

  .emoji-icon {
    font-size: 12px;
    line-height: 1;
  }

  .tab-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .untitled-text {
    color: var(--text-placeholder);
    font-style: italic;
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

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .loading-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-text {
    font-size: 0.75rem;
    opacity: 0.7;
  }
</style>
