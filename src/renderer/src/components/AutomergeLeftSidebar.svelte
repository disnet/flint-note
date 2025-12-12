<script lang="ts">
  /**
   * Left sidebar component for the Automerge app
   * Contains header with vault/search, system views, pinned notes, recent notes, and workspace bar
   */
  import { fly } from 'svelte/transition';
  import AutomergeSystemViews from './AutomergeSystemViews.svelte';
  import AutomergeSidebarNotes from './AutomergeSidebarNotes.svelte';
  import AutomergeWorkspaceBar from './AutomergeWorkspaceBar.svelte';
  import AutomergeSearchResults from './AutomergeSearchResults.svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import {
    getActiveWorkspace,
    type Note,
    type Vault,
    type SearchResult
  } from '../lib/automerge';

  interface Props {
    activeSystemView: 'notes' | 'settings' | 'search' | 'types' | 'daily' | null;
    searchQuery: string;
    searchResults: SearchResult[];
    searchInputFocused: boolean;
    vaults: Vault[];
    activeVault: Vault | null;
    onNoteSelect: (note: Note) => void;
    onSystemViewSelect: (view: 'notes' | 'settings' | 'types' | 'daily' | null) => void;
    onCreateNote?: () => void;
    onSearchChange: (query: string) => void;
    onSearchFocus: () => void;
    onSearchBlur: () => void;
    onSearchKeyDown: (event: KeyboardEvent) => void;
    onSearchResultSelect: (note: Note) => void;
    onVaultSelect: (vaultId: string) => void;
    onCreateVault: () => void;
    onToggleSidebar: () => void;
    onViewAllResults: () => void;
  }

  let {
    onNoteSelect,
    onSystemViewSelect,
    activeSystemView,
    onCreateNote,
    searchQuery,
    searchResults,
    searchInputFocused,
    vaults,
    activeVault,
    onSearchChange,
    onSearchFocus,
    onSearchBlur,
    onSearchKeyDown,
    onSearchResultSelect,
    onVaultSelect,
    onCreateVault,
    onToggleSidebar,
    onViewAllResults
  }: Props = $props();

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
    <!-- Header row with traffic light space, vault switcher, and sidebar toggle -->
    <div class="sidebar-header">
      <div class="header-row">
        <div class="traffic-light-space"></div>
        {#if vaults.length > 1}
          <select
            class="vault-select"
            value={activeVault?.id}
            onchange={(e) => onVaultSelect((e.target as HTMLSelectElement).value)}
          >
            {#each vaults as vault (vault.id)}
              <option value={vault.id}>{vault.name}</option>
            {/each}
          </select>
        {:else if activeVault}
          <span class="vault-name">{activeVault.name}</span>
        {/if}
        <button class="add-vault-btn" onclick={onCreateVault} title="New vault">
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
        </button>
        <div class="header-spacer"></div>
        <button
          class="sidebar-toggle"
          onclick={onToggleSidebar}
          title="Toggle sidebar (⌘B)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <line x1="9" y1="3" x2="9" y2="21"></line>
          </svg>
        </button>
      </div>
      <!-- Search bar -->
      <div class="search-container">
        <input
          id="search-input"
          type="text"
          class="search-input"
          class:active={searchInputFocused && searchQuery.trim()}
          placeholder="Search notes... (⌘K)"
          value={searchQuery}
          oninput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
          onfocus={onSearchFocus}
          onblur={onSearchBlur}
          onkeydown={onSearchKeyDown}
        />
        {#if searchInputFocused && searchQuery.trim()}
          <div class="search-dropdown">
            {#if searchResults.length > 0}
              <AutomergeSearchResults
                results={searchResults}
                onSelect={onSearchResultSelect}
                maxResults={8}
              />
              {#if searchResults.length > 8}
                <button class="view-all-btn" onclick={onViewAllResults}>
                  View all {searchResults.length} results (Enter)
                </button>
              {/if}
            {:else}
              <div class="no-results-dropdown">
                No matching notes found for "{searchQuery}"
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

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

  /* Sidebar Header */
  .sidebar-header {
    flex-shrink: 0;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-light);
    -webkit-app-region: drag;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 28px;
    margin-bottom: 0.5rem;
  }

  .traffic-light-space {
    width: 70px;
    flex-shrink: 0;
  }

  .vault-select {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    -webkit-app-region: no-drag;
    max-width: 120px;
    text-overflow: ellipsis;
  }

  .vault-name {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
  }

  .add-vault-btn {
    padding: 0.25rem;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    -webkit-app-region: no-drag;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .add-vault-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .header-spacer {
    flex: 1;
  }

  .sidebar-toggle {
    padding: 0.25rem;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    -webkit-app-region: no-drag;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sidebar-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* Search */
  .search-container {
    position: relative;
    -webkit-app-region: no-drag;
  }

  .search-input {
    width: 100%;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.8125rem;
    box-sizing: border-box;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .search-input.active {
    border-color: var(--accent-primary);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .search-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--accent-primary);
    border-top: none;
    border-bottom-left-radius: 0.5rem;
    border-bottom-right-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    max-height: 400px;
    overflow-y: auto;
  }

  .view-all-btn {
    width: 100%;
    padding: 0.625rem;
    border: none;
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
    color: var(--accent-primary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    text-align: center;
  }

  .view-all-btn:hover {
    background: var(--bg-hover);
  }

  .no-results-dropdown {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8125rem;
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
