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
  import Tooltip from './Tooltip.svelte';
  import HamburgerMenu from './HamburgerMenu.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import {
    getActiveWorkspace,
    updateVaultInState,
    isLegacyVault,
    type NoteMetadata,
    type Vault,
    type SearchResult,
    type SidebarItem
  } from '../lib/automerge';
  import { isWeb } from '../lib/platform.svelte';
  import { scrollable } from '../lib/scrollable.svelte';

  interface Props {
    activeSystemView:
      | 'settings'
      | 'search'
      | 'types'
      | 'daily'
      | 'review'
      | 'inbox'
      | 'routines'
      | null;
    searchQuery: string;
    searchResults: SearchResult[];
    searchInputFocused: boolean;
    selectedSearchIndex: number;
    isShowingRecent: boolean;
    vaults: Vault[];
    activeVault: Vault | null;
    onItemSelect: (item: SidebarItem) => void;
    onSystemViewSelect: (
      view: 'settings' | 'types' | 'daily' | 'review' | 'inbox' | 'routines' | null
    ) => void;
    onCreateNote?: () => void;
    onCreateDeck?: () => void;
    onCaptureWebpage?: () => void;
    onSearchChange: (query: string) => void;
    onSearchFocus: () => void;
    onSearchBlur: () => void;
    onSearchKeyDown: (event: KeyboardEvent) => void;
    onSearchResultSelect: (note: NoteMetadata) => void;
    onVaultSelect: (vaultId: string) => void;
    onCreateVault: () => void;
    onToggleSidebar: () => void;
    onViewAllResults: () => void;
    isMobile?: boolean;
    mobileDrawerOpen?: boolean;
  }

  let {
    onItemSelect,
    onSystemViewSelect,
    activeSystemView,
    onCreateNote,
    onCreateDeck,
    onCaptureWebpage,
    searchQuery,
    searchResults,
    searchInputFocused,
    selectedSearchIndex,
    isShowingRecent,
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
    onViewAllResults,
    isMobile = false,
    mobileDrawerOpen = false
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

  // Update slide direction and reset shadow when workspace changes
  $effect.pre(() => {
    const currentId = activeWorkspace?.id ?? null;

    if (previousWorkspaceId && currentId && previousWorkspaceId !== currentId) {
      // Simple slide direction - positive when moving forward
      slideDirection = 1;
      // Reset shadow until new content transition completes (onintroend will recalculate)
      showShadow = false;
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
    // Update mobile search dropdown position on scroll
    if (isMobile && searchInputFocused) {
      updateMobileSearchDropdownPosition();
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
  let vaultButtonElement = $state<HTMLElement | null>(null);
  let dropdownPosition = $state({ top: 0, left: 0 });

  // Vault editing state
  let editingVaultId = $state<string | null>(null);
  let editingVaultName = $state('');

  function toggleVaultDropdown(): void {
    if (!isVaultDropdownOpen && vaultButtonElement) {
      const rect = vaultButtonElement.getBoundingClientRect();
      dropdownPosition = {
        top: rect.bottom + 4, // 4px gap below button
        left: rect.left
      };
    }
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

  function handleStartEditVault(vault: Vault, event: MouseEvent): void {
    event.stopPropagation();
    editingVaultId = vault.id;
    editingVaultName = vault.name;
  }

  function handleSaveVaultName(vaultId: string): void {
    const trimmedName = editingVaultName.trim();
    if (trimmedName) {
      updateVaultInState(vaultId, { name: trimmedName });
    }
    editingVaultId = null;
    editingVaultName = '';
  }

  function handleCancelEditVault(): void {
    editingVaultId = null;
    editingVaultName = '';
  }

  function handleVaultNameKeyDown(event: KeyboardEvent, vaultId: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSaveVaultName(vaultId);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelEditVault();
    }
  }

  // Mobile search dropdown positioning
  let mobileSearchWrapperRef = $state<HTMLDivElement | null>(null);
  let mobileSearchDropdownPosition = $state<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  function updateMobileSearchDropdownPosition(): void {
    if (mobileSearchWrapperRef && isMobile) {
      const rect = mobileSearchWrapperRef.getBoundingClientRect();
      mobileSearchDropdownPosition = {
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      };
    }
  }

  // Handle search focus with dropdown position update
  function handleSearchFocusWithPosition(): void {
    onSearchFocus();
    if (isMobile) {
      // Small delay to ensure layout is stable
      requestAnimationFrame(() => {
        updateMobileSearchDropdownPosition();
      });
    }
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
  class:mobile={isMobile}
  class:mobile-open={mobileDrawerOpen}
  style="--sidebar-width: {currentWidth}px"
>
  <div class="sidebar-inner">
    <!-- Header row with traffic light space, vault switcher, and sidebar toggle -->
    {#if !isMobile}
      <div class="sidebar-header">
        <div class="header-row">
          {#if !isWeb()}
            <div class="traffic-light-space"></div>
          {/if}
          <div class="hamburger-menu-container">
            <HamburgerMenu />
          </div>
          <div class="vault-switcher">
            <button
              class="vault-button"
              class:open={isVaultDropdownOpen}
              onclick={toggleVaultDropdown}
              bind:this={vaultButtonElement}
              data-vault-dropdown
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
              <div
                class="vault-dropdown"
                style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px;"
              >
                {#each vaults as vault (vault.id)}
                  <div class="vault-item-container" class:legacy={isLegacyVault(vault)}>
                    {#if editingVaultId === vault.id}
                      <div class="vault-item editing">
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
                        <!-- svelte-ignore a11y_autofocus -->
                        <input
                          type="text"
                          class="vault-name-input"
                          bind:value={editingVaultName}
                          onkeydown={(e) => handleVaultNameKeyDown(e, vault.id)}
                          onblur={() => handleSaveVaultName(vault.id)}
                          autofocus
                        />
                      </div>
                    {:else}
                      <button
                        class="vault-item"
                        class:active={activeVault?.id === vault.id}
                        class:legacy={isLegacyVault(vault)}
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
                        {#if isLegacyVault(vault)}
                          <span class="legacy-badge" title="Click to import this vault"
                            >Import</span
                          >
                        {/if}
                      </button>
                    {/if}
                    {#if !isLegacyVault(vault) && editingVaultId !== vault.id}
                      <button
                        class="edit-btn"
                        onclick={(e) => handleStartEditVault(vault, e)}
                        title="Rename vault"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          <path d="m15 5 4 4" />
                        </svg>
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
                    {/if}
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
          {#if !isMobile}
            <div class="header-spacer"></div>
            <Tooltip text="Toggle sidebar (⌘B)" position="bottom">
              <button
                class="sidebar-toggle"
                onclick={onToggleSidebar}
                aria-label="Toggle sidebar"
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
            </Tooltip>
          {/if}
        </div>
        <!-- Search bar (desktop only - mobile has it in scrollable content) -->
        {#if !isMobile}
          <div class="search-container">
            <div
              class="search-input-wrapper"
              class:active={searchInputFocused &&
                (searchQuery.trim() || searchResults.length > 0)}
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
                placeholder="Search notes... (⌘O)"
                value={searchQuery}
                oninput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
                onfocus={onSearchFocus}
                onblur={onSearchBlur}
                onkeydown={onSearchKeyDown}
              />
            </div>
            {#if searchInputFocused && (searchQuery.trim() || searchResults.length > 0)}
              <div class="search-dropdown">
                {#if searchResults.length > 0}
                  {#if isShowingRecent}
                    <div class="search-dropdown-header">Recent</div>
                  {/if}
                  <SearchResults
                    results={searchResults}
                    onSelect={onSearchResultSelect}
                    maxResults={8}
                    selectedIndex={selectedSearchIndex}
                    showKeyboardHints={true}
                  />
                  {#if searchResults.length > 8 && !isShowingRecent}
                    <button class="view-all-btn" onclick={onViewAllResults}>
                      View all {searchResults.length} results (Enter)
                    </button>
                  {/if}
                {:else if searchQuery.trim()}
                  <div class="no-results-dropdown">
                    No matching notes found for "{searchQuery}"
                  </div>
                {:else}
                  <div class="no-results-dropdown">No recent notes</div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <div
      class="sidebar-content scrollable"
      bind:this={contentElement}
      onscroll={updateShadow}
      use:scrollable
    >
      <!-- Mobile search bar (scrolls with content) -->
      {#if isMobile}
        <div class="mobile-search-container">
          <div
            class="search-input-wrapper"
            class:active={searchInputFocused &&
              (searchQuery.trim() || searchResults.length > 0)}
            bind:this={mobileSearchWrapperRef}
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
              id="search-input-mobile"
              type="text"
              class="search-input"
              placeholder="Search notes..."
              value={searchQuery}
              oninput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
              onfocus={handleSearchFocusWithPosition}
              onblur={onSearchBlur}
              onkeydown={onSearchKeyDown}
            />
          </div>
          {#if searchInputFocused && (searchQuery.trim() || searchResults.length > 0) && mobileSearchDropdownPosition}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="search-dropdown mobile-search-dropdown"
              style="position: fixed; top: {mobileSearchDropdownPosition.top}px; left: {mobileSearchDropdownPosition.left}px; width: {mobileSearchDropdownPosition.width}px;"
              onpointerdown={(e) => e.preventDefault()}
            >
              {#if searchResults.length > 0}
                {#if isShowingRecent}
                  <div class="search-dropdown-header">Recent</div>
                {/if}
                <SearchResults
                  results={searchResults}
                  onSelect={onSearchResultSelect}
                  maxResults={8}
                  selectedIndex={selectedSearchIndex}
                  showKeyboardHints={true}
                />
                {#if searchResults.length > 8 && !isShowingRecent}
                  <button class="view-all-btn" onclick={onViewAllResults}>
                    View all {searchResults.length} results
                  </button>
                {/if}
              {:else if searchQuery.trim()}
                <div class="no-results-dropdown">
                  No matching notes found for "{searchQuery}"
                </div>
              {:else}
                <div class="no-results-dropdown">No recent notes</div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
      <SystemViews {onSystemViewSelect} {activeSystemView} />
      {#key activeWorkspace?.id}
        <div
          class="workspace-content"
          in:fly={{ x: slideDirection * 50, duration: 150, delay: 75 }}
          out:fly={{ x: slideDirection * -50, duration: 75 }}
          onintroend={updateShadow}
        >
          <SidebarItems {onItemSelect} />
        </div>
      {/key}
    </div>
    <WorkspaceBar {onCreateNote} {onCreateDeck} {onCaptureWebpage} {showShadow} />
  </div>
  <ResizeHandle side="left" onResize={handleResize} minWidth={200} maxWidth={600} />
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

  /* macOS vibrancy - semi-transparent sidebar to show native blur effect with tint */
  :global([data-vibrancy='true']) .left-sidebar {
    background: rgba(255, 255, 255, 0.8) !important;
  }

  :global([data-vibrancy='true'][data-theme='dark']) .left-sidebar {
    background: rgba(30, 30, 30, 0.8) !important;
  }

  @media (prefers-color-scheme: dark) {
    :global([data-vibrancy='true']:not([data-theme='light'])) .left-sidebar {
      background: rgba(30, 30, 30, 0.8) !important;
    }
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
    -webkit-app-region: drag;
  }

  /* Sidebar Header */
  .sidebar-header {
    flex-shrink: 0;
    padding: 0 0.75rem 0.5rem 0; /* No left padding - handled by traffic-light-space or platform margin */
    -webkit-app-region: drag;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 38px; /* Match safe-zone height for traffic light alignment */
  }

  .traffic-light-space {
    width: 70px; /* Space for macOS traffic lights */
    flex-shrink: 0;
  }

  /* Hide traffic light space on Windows/Linux/Web (no traffic lights) */
  :global([data-platform='windows']) .traffic-light-space,
  :global([data-platform='linux']) .traffic-light-space,
  :global([data-platform='web']) .traffic-light-space {
    display: none;
  }

  /* Hamburger menu container - hidden on macOS, visible on Windows/Linux/Web */
  .hamburger-menu-container {
    display: none;
    -webkit-app-region: no-drag;
  }

  :global([data-platform='windows']) .hamburger-menu-container,
  :global([data-platform='linux']) .hamburger-menu-container,
  :global([data-platform='web']) .hamburger-menu-container {
    display: flex;
    align-items: center;
    margin-left: 0.75rem;
  }

  .vault-switcher {
    position: relative;
    -webkit-app-region: no-drag;
    margin-left: 0.5rem; /* Align with toggle button (70px + 0.5rem on macOS) */
  }

  /* On Windows/Linux/Web, reduce margin since hamburger menu provides left spacing */
  :global([data-platform='windows']) .vault-switcher,
  :global([data-platform='linux']) .vault-switcher,
  :global([data-platform='web']) .vault-switcher {
    margin-left: 0.5rem;
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
    position: fixed;
    z-index: 100;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px var(--shadow-medium);
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

  /* Legacy vault styling */
  .vault-item.legacy {
    opacity: 0.9;
  }

  .legacy-badge {
    font-size: 0.65rem;
    padding: 0.125rem 0.375rem;
    background: var(--accent-light);
    color: var(--accent-primary);
    border-radius: 0.25rem;
    margin-left: auto;
    font-weight: 500;
    flex-shrink: 0;
  }

  .vault-item-container.legacy:hover .legacy-badge {
    background: var(--accent-primary);
    color: var(--accent-text, white);
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

  .edit-btn {
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

  .vault-item-container:hover .edit-btn {
    background: var(--bg-secondary);
    opacity: 1;
  }

  .vault-item-container:has(.vault-item.active):hover .edit-btn {
    background: var(--accent-light);
  }

  .vault-item-container:has(.vault-item.active) .edit-btn {
    background: var(--accent-light);
    opacity: 1;
  }

  .edit-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    opacity: 1;
  }

  .vault-item.editing {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
  }

  .vault-name-input {
    flex: 1;
    padding: 0.125rem 0.25rem;
    border: 1px solid var(--accent-primary);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.8125rem;
    font-family: inherit;
    outline: none;
  }

  .vault-name-input:focus {
    box-shadow: 0 0 0 2px var(--accent-light);
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
    padding-left: 0.75rem;
  }

  /* Mobile search container - inside scrollable content */
  .mobile-search-container {
    position: relative;
    padding: 0.5rem;
  }

  .mobile-search-container .search-input-wrapper.active {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .mobile-search-dropdown {
    /* Position is set inline via JavaScript for fixed positioning */
    background: var(--bg-primary);
    border: 1px solid var(--accent-primary);
    border-top: none;
    border-bottom-left-radius: 0.5rem;
    border-bottom-right-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000; /* High z-index to appear above other elements */
    max-height: 300px;
    overflow-y: auto;
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

  /* Prevent Safari auto-zoom on input focus */
  @media (max-width: 767px) {
    .search-input {
      font-size: 16px;
    }
  }

  .search-dropdown {
    position: absolute;
    top: 100%;
    left: 0.75rem;
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

  .search-dropdown-header {
    padding: 0.5rem 0.75rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-light);
  }

  .no-results-dropdown {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .sidebar-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    -webkit-app-region: no-drag;
  }

  .workspace-content {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  /* Mobile drawer styles - sidebar is full-screen underneath the main content */
  .left-sidebar.mobile {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    min-width: 100%;
    height: 100%;
    z-index: 1; /* Below main content */
    transform: none;
    border-right: none;
    /* Match main note view background on mobile */
    background: var(--bg-primary);
    /* Extend into safe areas with internal padding */
    padding-top: var(--safe-area-top, 0px);
    padding-bottom: var(--safe-area-bottom, 0px);
    padding-left: var(--safe-area-left, 0px);
    padding-right: var(--safe-area-right, 0px);
  }

  /* Override visibility controls on mobile - always visible */
  .left-sidebar.mobile:not(.visible) {
    width: 100%;
    min-width: 100%;
    border-right: none;
  }

  .left-sidebar.mobile:not(.visible) .sidebar-inner {
    opacity: 1;
  }

  /* Hide resize handle on mobile */
  .left-sidebar.mobile :global(.resize-handle) {
    display: none;
  }

  /* Adjust header for mobile - no traffic light space needed */
  .left-sidebar.mobile .traffic-light-space {
    display: none;
  }

  /* On macOS Electron mobile, add top padding for traffic lights */
  :global([data-platform='macos']) .left-sidebar.mobile .mobile-search-container {
    padding-top: 38px; /* Match safe-zone height for traffic light alignment */
  }
</style>
