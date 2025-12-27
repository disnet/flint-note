<script lang="ts">
  /**
   * Left sidebar component for the Automerge app
   * Contains header with vault/search, system views, pinned notes, recent notes, and workspace bar
   */
  import { fly } from 'svelte/transition';
  import SystemViews from './SystemViews.svelte';
  import SidebarItems from './SidebarItems.svelte';
  import WorkspaceBar from './WorkspaceBar.svelte';
  import SearchResults from './SearchResults.svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import {
    getActiveWorkspace,
    updateVaultInState,
    type NoteMetadata,
    type Vault,
    type SearchResult,
    type SidebarItem
  } from '../lib/automerge';

  interface Props {
    activeSystemView:
      | 'notes'
      | 'settings'
      | 'search'
      | 'types'
      | 'daily'
      | 'conversations'
      | 'review'
      | 'inbox'
      | 'routines'
      | null;
    searchQuery: string;
    searchResults: SearchResult[];
    searchInputFocused: boolean;
    selectedSearchIndex: number;
    vaults: Vault[];
    activeVault: Vault | null;
    onItemSelect: (item: SidebarItem) => void;
    onSystemViewSelect: (
      view:
        | 'notes'
        | 'settings'
        | 'types'
        | 'daily'
        | 'conversations'
        | 'review'
        | 'inbox'
        | 'routines'
        | null
    ) => void;
    onCreateNote?: () => void;
    onCreateDeck?: () => void;
    onSearchChange: (query: string) => void;
    onSearchFocus: () => void;
    onSearchBlur: () => void;
    onSearchKeyDown: (event: KeyboardEvent) => void;
    onSearchResultSelect: (note: NoteMetadata) => void;
    onVaultSelect: (vaultId: string) => void;
    onCreateVault: () => void;
    onToggleSidebar: () => void;
    onViewAllResults: () => void;
  }

  let {
    onItemSelect,
    onSystemViewSelect,
    activeSystemView,
    onCreateNote,
    onCreateDeck,
    searchQuery,
    searchResults,
    searchInputFocused,
    selectedSearchIndex,
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

  // Vault dropdown state
  let isVaultDropdownOpen = $state(false);

  function toggleVaultDropdown(): void {
    isVaultDropdownOpen = !isVaultDropdownOpen;
  }

  function closeVaultDropdown(): void {
    isVaultDropdownOpen = false;
  }

  function handleVaultSelect(vaultId: string): void {
    onVaultSelect(vaultId);
    closeVaultDropdown();
  }

  function handleArchiveVault(vault: Vault, event: MouseEvent): void {
    event.stopPropagation();
    if (vault.id === activeVault?.id) {
      // Can't archive the active vault if it's the only one
      if (vaults.length <= 1) return;
      // Switch to another vault first
      const otherVault = vaults.find((v) => v.id !== vault.id);
      if (otherVault) {
        onVaultSelect(otherVault.id);
      }
    }
    updateVaultInState(vault.id, { archived: true });
    closeVaultDropdown();
  }

  function handleCreateVault(): void {
    onCreateVault();
    closeVaultDropdown();
  }

  // Close dropdown when clicking outside
  $effect(() => {
    if (!isVaultDropdownOpen) return;

    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Element;
      if (!target.closest('.vault-switcher')) {
        closeVaultDropdown();
      }
    }

    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 10);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
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
        <div class="vault-switcher">
          <button
            class="vault-button"
            class:open={isVaultDropdownOpen}
            onclick={toggleVaultDropdown}
          >
            <span class="vault-display">
              <svg
                class="vault-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2l5 0 2 3h9a2 2 0 0 1 2 2z"
                />
              </svg>
              <span class="vault-name">{activeVault?.name || 'Select vault'}</span>
            </span>
            <svg
              class="dropdown-arrow"
              class:rotated={isVaultDropdownOpen}
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {#if isVaultDropdownOpen}
            <div class="vault-dropdown">
              {#each vaults as vault (vault.id)}
                <div class="vault-item-container">
                  <button
                    class="vault-item"
                    class:active={activeVault?.id === vault.id}
                    onclick={() => handleVaultSelect(vault.id)}
                  >
                    <svg
                      class="vault-item-icon"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2l5 0 2 3h9a2 2 0 0 1 2 2z"
                      />
                    </svg>
                    <span class="vault-item-name">{vault.name}</span>
                  </button>
                  <button
                    class="archive-btn"
                    onclick={(e) => handleArchiveVault(vault, e)}
                    title="Archive vault"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <rect width="20" height="5" x="2" y="3" rx="1" />
                      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                      <path d="m9.5 11 5 0" />
                    </svg>
                  </button>
                </div>
              {/each}

              <div class="vault-dropdown-separator"></div>

              <button class="vault-item new-vault-item" onclick={handleCreateVault}>
                <svg
                  class="vault-item-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M12 5v14" />
                  <path d="m5 12 14 0" />
                </svg>
                <span class="vault-item-name">New Vault</span>
              </button>
            </div>
          {/if}
        </div>
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
        <div
          class="search-input-wrapper"
          class:active={searchInputFocused && searchQuery.trim()}
        >
          <svg
            class="search-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
          <input
            id="search-input"
            type="text"
            class="search-input"
            placeholder="Search notes... (⌘K)"
            value={searchQuery}
            oninput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
            onfocus={onSearchFocus}
            onblur={onSearchBlur}
            onkeydown={onSearchKeyDown}
          />
        </div>
        {#if searchInputFocused && searchQuery.trim()}
          <div class="search-dropdown">
            {#if searchResults.length > 0}
              <SearchResults
                results={searchResults}
                onSelect={onSearchResultSelect}
                maxResults={8}
                selectedIndex={selectedSearchIndex}
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
      <SystemViews {onSystemViewSelect} {activeSystemView} />
      {#key activeWorkspace?.id}
        <div
          class="workspace-content"
          in:fly={{ x: slideDirection * 50, duration: 150, delay: 75 }}
          out:fly={{ x: slideDirection * -50, duration: 75 }}
        >
          <SidebarItems {onItemSelect} />
        </div>
      {/key}
    </div>
    <WorkspaceBar {onCreateNote} {onCreateDeck} {showShadow} />
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
    min-height: 0; /* Important for nested flex containers */
    overflow: hidden;
  }

  /* Sidebar Header */
  .sidebar-header {
    flex-shrink: 0;
    padding: 0 0.75rem 0.5rem;
    -webkit-app-region: drag;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 38px; /* Match safe-zone height for traffic light alignment */
  }

  .traffic-light-space {
    width: 70px;
    flex-shrink: 0;
  }

  .vault-switcher {
    position: relative;
    -webkit-app-region: no-drag;
  }

  .vault-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    font-size: 0.75rem;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .vault-button:hover {
    border-color: var(--accent-primary);
    background: var(--bg-secondary);
  }

  .vault-button.open {
    border-color: var(--accent-primary);
    background: var(--bg-secondary);
  }

  .vault-display {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .vault-icon {
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .vault-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
  }

  .dropdown-arrow {
    flex-shrink: 0;
    color: var(--text-secondary);
    transition: transform 0.2s ease;
  }

  .dropdown-arrow.rotated {
    transform: rotate(180deg);
  }

  /* Vault Dropdown */
  .vault-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 100;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px var(--shadow-medium);
    margin-top: 0.25rem;
    min-width: 200px;
    max-width: 280px;
    overflow: hidden;
  }

  .vault-item-container {
    display: flex;
    align-items: stretch;
  }

  .vault-item-container:hover .vault-item {
    background: var(--bg-secondary);
  }

  .vault-item-container:hover .archive-btn {
    background: var(--bg-secondary);
    opacity: 1;
  }

  .vault-item-container:has(.vault-item.active):hover .vault-item,
  .vault-item-container:has(.vault-item.active):hover .archive-btn {
    background: var(--accent-light);
  }

  .vault-item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s ease;
  }

  .vault-item.active {
    background: var(--accent-light);
    color: var(--accent-primary);
  }

  .vault-item-container:has(.vault-item.active) .archive-btn {
    background: var(--accent-light);
    opacity: 1;
  }

  .vault-item-icon {
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .vault-item.active .vault-item-icon {
    color: var(--accent-primary);
  }

  .vault-item-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .archive-btn {
    padding: 0.5rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    opacity: 0.5;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .archive-btn:hover {
    background: var(--error-bg, #fee);
    color: var(--error-text, #dc2626);
    opacity: 1;
  }

  .vault-dropdown-separator {
    height: 1px;
    background: var(--border-light);
    margin: 0.25rem 0;
  }

  .new-vault-item {
    width: 100%;
  }

  .new-vault-item:hover {
    background: var(--bg-secondary);
  }

  .new-vault-item .vault-item-icon {
    color: var(--accent-primary);
  }

  .new-vault-item .vault-item-name {
    color: var(--accent-primary);
    font-weight: 500;
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

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
  }

  .search-input-wrapper:focus-within {
    border-color: var(--accent-primary);
  }

  .search-input-wrapper.active {
    border-color: var(--accent-primary);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .search-icon {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8125rem;
    outline: none;
    padding: 0;
  }

  .search-input::placeholder {
    color: var(--text-muted);
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
