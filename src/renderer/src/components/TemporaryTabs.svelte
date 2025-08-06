<script lang="ts">
  import { temporaryTabsStore } from '../stores/temporaryTabsStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    onNoteSelect: (note: NoteMetadata) => void;
  }

  let { onNoteSelect }: Props = $props();

  function handleTabClick(noteId: string): void {
    const note = notesStore.notes.find((n) => n.id === noteId);
    if (note) {
      onNoteSelect(note);
      temporaryTabsStore.setActiveTab(noteId);
    }
  }

  function handleCloseTab(tabId: string, event: Event): void {
    event.stopPropagation();
    temporaryTabsStore.removeTab(tabId);
  }

  function handleClearAll(): void {
    temporaryTabsStore.clearAllTabs();
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
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
        </svg>`;
    }
  }
</script>

{#if temporaryTabsStore.tabs.length > 0}
  <div class="temporary-tabs">
    <div class="separator"></div>

    <div class="tabs-header">
      <span class="tabs-count">{temporaryTabsStore.tabs.length} recent</span>
      <button class="clear-all" onclick={handleClearAll}> close all </button>
    </div>

    <div class="tabs-list">
      {#each temporaryTabsStore.tabs as tab (tab.id)}
        <div
          class="tab-item"
          class:active={tab.id === temporaryTabsStore.activeTabId}
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
              width="12"
              height="12"
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
  </div>
{/if}

<style>
  .temporary-tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
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
    margin: 0.75rem 1.25rem;
  }

  .tabs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1.25rem;
  }

  .tabs-count {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .clear-all {
    background: none;
    border: none;
    color: var(--text-tertiary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: color 0.2s ease;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .clear-all:hover {
    color: var(--text-secondary);
  }

  .tabs-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .tab-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 1.25rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .tab-item:hover {
    background: var(--bg-hover);
  }

  .tab-item.active {
    background: var(--bg-selected);
    color: var(--accent-primary);
  }

  .tab-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  .tab-icon {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    flex-shrink: 0;
    opacity: 0.7;
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
