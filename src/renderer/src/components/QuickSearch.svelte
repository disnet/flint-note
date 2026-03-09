<script lang="ts">
  /**
   * Quick search panel — a mini-sidebar with system views, pinned notes,
   * recent notes, and search results. Matches shelf/chat panel styling on mobile.
   * Embeds the full SidebarItems component for drag/drop between pinned and recent.
   */
  import SearchResults from './SearchResults.svelte';
  import SidebarItems from './SidebarItems.svelte';
  import WorkspaceBar from './WorkspaceBar.svelte';
  import WorkspaceSwipeContainer from './WorkspaceSwipeContainer.svelte';
  import { scrollable } from '../lib/scrollable.svelte';
  import { deviceState } from '../stores/deviceState.svelte';
  import {
    getActiveSystemView,
    getReviewStats,
    isSessionAvailable,
    getUnprocessedCount,
    getRoutinesDueNow,
    updateVaultInState,
    isLegacyVault,
    getWorkspaces,
    getActiveWorkspace,
    setActiveWorkspace,
    type SidebarItem,
    type SystemView,
    type NoteMetadata,
    type SearchResult,
    type EnhancedSearchResult,
    type Vault
  } from '../lib/automerge';
  import { isCloudAuthenticated } from '../lib/automerge/cloud-sync.svelte';

  interface Props {
    isOpen: boolean;
    searchQuery: string;
    searchResults: (SearchResult | EnhancedSearchResult)[];
    selectedSearchIndex: number;
    isSearchingContent: boolean;
    onClose: () => void;
    onSearchChange: (query: string) => void;
    onSearchResultSelect: (note: NoteMetadata) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    onViewAllResults: () => void;
    onSystemViewSelect: (
      view: 'settings' | 'types' | 'daily' | 'review' | 'inbox' | 'routines' | null
    ) => void;
    onSidebarItemSelect: (item: SidebarItem) => void;
    onCreateNote?: () => void;
    onCreateDeck?: () => void;
    onCaptureWebpage?: () => void;
    vaults?: Vault[];
    activeVault?: Vault | null;
    onVaultSelect?: (vaultId: string) => void;
    onCreateVault?: () => void;
    onSyncFromCloud?: () => void;
  }

  let {
    isOpen,
    searchQuery,
    searchResults,
    selectedSearchIndex,
    isSearchingContent,
    onClose,
    onSearchChange,
    onSearchResultSelect,
    onKeyDown,
    onViewAllResults,
    onSystemViewSelect,
    onSidebarItemSelect,
    onCreateNote,
    onCreateDeck,
    onCaptureWebpage,
    vaults = [],
    activeVault = null,
    onVaultSelect,
    onCreateVault,
    onSyncFromCloud
  }: Props = $props();

  let inputElement = $state<HTMLInputElement | null>(null);

  const isMobile = $derived(deviceState.useMobileLayout);

  // Focus input when modal opens — only on desktop
  $effect(() => {
    if (isOpen && inputElement && !isMobile) {
      setTimeout(() => {
        inputElement?.focus();
      }, 10);
    }
  });

  // Detect platform for shortcut display
  const isMac = navigator.platform.startsWith('Mac');
  const modifierKey = isMac ? '⌘' : 'Ctrl';

  // Sidebar data
  const activeSystemView = $derived(getActiveSystemView());
  const reviewStats = $derived(getReviewStats());
  const sessionAvailable = $derived(isSessionAvailable());
  const reviewDueCount = $derived(sessionAvailable ? reviewStats.dueThisSession : 0);
  const inboxCount = $derived(getUnprocessedCount());
  const routinesDueCount = $derived(getRoutinesDueNow().length);

  const hasSearchQuery = $derived(searchQuery.trim().length > 0);

  // Workspace swipe state (mobile only)
  const allWorkspaces = $derived(getWorkspaces());
  const activeWs = $derived(getActiveWorkspace());
  const showSwipe = $derived(isMobile && allWorkspaces.length > 1 && !hasSearchQuery);
  let isDraggingItem = $state(false);
  let isSwipingWorkspace = $state(false);

  function handleWorkspaceSwipeChange(id: string): void {
    setActiveWorkspace(id);
  }

  // Vault switcher state (mobile only)
  let isVaultDropdownOpen = $state(false);
  const showVaultSwitcher = $derived(isMobile && vaults.length > 0);

  // Vault editing state
  let editingVaultId = $state<string | null>(null);
  let editingVaultName = $state('');

  function handleVaultSelect(vaultId: string): void {
    onVaultSelect?.(vaultId);
    isVaultDropdownOpen = false;
  }

  function handleCreateVault(): void {
    onCreateVault?.();
    isVaultDropdownOpen = false;
    onClose();
  }

  function handleSyncFromCloud(): void {
    onSyncFromCloud?.();
    isVaultDropdownOpen = false;
    onClose();
  }

  function handleArchiveVault(vault: Vault, event: MouseEvent): void {
    event.stopPropagation();
    if (vault.id === activeVault?.id) {
      if (vaults.length <= 1) return;
      const otherVault = vaults.find((v) => v.id !== vault.id);
      if (otherVault) {
        onVaultSelect?.(otherVault.id);
      }
    }
    updateVaultInState(vault.id, { archived: true });
    isVaultDropdownOpen = false;
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

  // System views definition
  type SystemViewDef = {
    id: Exclude<SystemView, null | 'expanded-search'>;
    label: string;
    icon: string;
    badge?: number;
  };

  const systemViews = $derived.by((): SystemViewDef[] => [
    {
      id: 'inbox',
      label: 'Inbox',
      icon: 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z M22 12 16 12 14 15 10 15 8 12 2 12',
      badge: inboxCount > 0 ? inboxCount : undefined
    },
    {
      id: 'daily',
      label: 'Daily',
      icon: 'M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18'
    },
    {
      id: 'review',
      label: 'Review',
      icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
      badge: reviewDueCount > 0 ? reviewDueCount : undefined
    },
    {
      id: 'routines',
      label: 'Routines',
      icon: 'M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2',
      badge: routinesDueCount > 0 ? routinesDueCount : undefined
    },
    {
      id: 'types',
      label: 'Note Types',
      icon: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: 'M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0 M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'
    }
  ]);

  // Filter system views by search query
  const filteredSystemViews = $derived.by(() => {
    if (!hasSearchQuery) return systemViews;
    const q = searchQuery.toLowerCase();
    return systemViews.filter((v) => v.label.toLowerCase().includes(q));
  });

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    // Only forward to parent when we have search results
    if (hasSearchQuery) {
      onKeyDown(event);

      if (
        event.key === 'Enter' &&
        searchResults.length > 0 &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        onClose();
      }
    }
  }

  // Close vault dropdown when modal closes
  $effect(() => {
    if (!isOpen) {
      isVaultDropdownOpen = false;
    }
  });

  function handleOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleResultSelect(note: NoteMetadata): void {
    onSearchResultSelect(note);
    onClose();
  }

  function handleViewAll(): void {
    onViewAllResults();
  }

  function handleSystemView(
    view: 'settings' | 'types' | 'daily' | 'review' | 'inbox' | 'routines'
  ): void {
    onSystemViewSelect(view);
    onClose();
  }

  function handleSidebarItemSelect(item: SidebarItem): void {
    onSidebarItemSelect(item);
    onClose();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="quick-search-overlay"
    onclick={handleOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="quick-search-modal" class:swipe-active={showSwipe}>
      <div class="search-input-wrapper">
        <svg
          class="search-icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.3-4.3"></path>
        </svg>
        <input
          bind:this={inputElement}
          type="text"
          class="search-input"
          placeholder="Search notes..."
          value={searchQuery}
          oninput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
          onkeydown={handleKeyDown}
        />
        {#if hasSearchQuery}
          <button class="shortcut-hint shortcut-hint-btn" onclick={handleViewAll}>
            {modifierKey}⇧↵ show all
          </button>
        {:else if !isMobile}
          <div class="shortcut-hint">{modifierKey}O</div>
        {/if}
      </div>

      <div class="panel-content" class:panel-content-swipe={showSwipe}>
        {#if hasSearchQuery && searchResults.length > 0}
          <!-- Search results mode -->
          <div class="search-results-scroll scrollable" use:scrollable>
            <SearchResults
              results={searchResults}
              onSelect={handleResultSelect}
              maxResults={8}
              selectedIndex={selectedSearchIndex}
              isLoading={isSearchingContent}
              showKeyboardHints={!isMobile}
            />
            {#if searchResults.length > 8}
              <button class="view-all-btn" onclick={handleViewAll}>
                View all {searchResults.length} results
              </button>
            {/if}
          </div>
        {:else if hasSearchQuery}
          <!-- Search with no note results — show filtered system views -->
          <div class="search-results-scroll scrollable" use:scrollable>
            {#if filteredSystemViews.length > 0}
              <div class="section">
                <div class="section-header">Views</div>
                {#each filteredSystemViews as view (view.id)}
                  <button
                    class="nav-item"
                    class:active={activeSystemView === view.id}
                    onclick={() => handleSystemView(view.id)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d={view.icon}></path>
                    </svg>
                    <span class="item-title">{view.label}</span>
                    {#if view.badge}
                      <span class="badge">{view.badge}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
            {#if filteredSystemViews.length === 0}
              <div class="no-results">No results for "{searchQuery}"</div>
            {/if}
          </div>
        {:else}
          <!-- Default: system views + full SidebarItems with drag/drop + workspaces -->
          <div class="section">
            <div class="section-header">
              <span>Views</span>
              {#if showVaultSwitcher}
                <div class="vault-switcher-inline">
                  <button
                    class="vault-switch-btn"
                    onclick={() => (isVaultDropdownOpen = !isVaultDropdownOpen)}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2l5 0 2 3h9a2 2 0 0 1 2 2z"
                      />
                    </svg>
                    <span>{activeVault?.name || 'Vault'}</span>
                    <svg
                      class="vault-chevron"
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
                    <div class="vault-dropdown-inline">
                      {#each vaults as vault (vault.id)}
                        <div class="vault-item-row" class:legacy={isLegacyVault(vault)}>
                          {#if editingVaultId === vault.id}
                            <div class="vault-dropdown-item editing">
                              <svg
                                width="12"
                                height="12"
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
                              class="vault-dropdown-item"
                              class:active={activeVault?.id === vault.id}
                              class:legacy={isLegacyVault(vault)}
                              onclick={() => handleVaultSelect(vault.id)}
                            >
                              <svg
                                width="12"
                                height="12"
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
                                <span class="legacy-badge">Import</span>
                              {/if}
                            </button>
                          {/if}
                          {#if !isLegacyVault(vault) && editingVaultId !== vault.id}
                            <button
                              class="vault-action-btn"
                              onclick={(e) => handleStartEditVault(vault, e)}
                              title="Rename vault"
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <path
                                  d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
                                />
                                <path d="m15 5 4 4" />
                              </svg>
                            </button>
                            <button
                              class="vault-action-btn"
                              onclick={(e) => handleArchiveVault(vault, e)}
                              title="Archive vault"
                            >
                              <svg
                                width="12"
                                height="12"
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

                      <button
                        class="vault-dropdown-item new-vault"
                        onclick={handleCreateVault}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path d="M12 5v14" />
                          <path d="m5 12 14 0" />
                        </svg>
                        <span>New Vault</span>
                      </button>

                      {#if isCloudAuthenticated()}
                        <button
                          class="vault-dropdown-item new-vault"
                          onclick={handleSyncFromCloud}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <path
                              d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"
                            />
                            <path d="M12 12v9" />
                            <path d="m8 17 4 4 4-4" />
                          </svg>
                          <span>Sync from Cloud</span>
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
            {#each systemViews as view (view.id)}
              <button
                class="nav-item"
                class:active={activeSystemView === view.id}
                onclick={() => handleSystemView(view.id)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d={view.icon}></path>
                </svg>
                <span class="item-title">{view.label}</span>
                {#if view.badge}
                  <span class="badge">{view.badge}</span>
                {/if}
              </button>
            {/each}
          </div>

          {#if showSwipe}
            <WorkspaceSwipeContainer
              workspaces={allWorkspaces}
              activeWorkspaceId={activeWs?.id}
              onWorkspaceChange={handleWorkspaceSwipeChange}
              disabled={isDraggingItem}
              onSwipeStateChange={(swiping) => (isSwipingWorkspace = swiping)}
            >
              {#snippet page(wsId)}
                <div class="sidebar-items-wrapper">
                  <SidebarItems
                    onItemSelect={handleSidebarItemSelect}
                    workspaceId={wsId === activeWs?.id ? undefined : wsId}
                    disableDrag={isSwipingWorkspace}
                    onDragStateChange={wsId === activeWs?.id
                      ? (dragging) => (isDraggingItem = dragging)
                      : undefined}
                  />
                </div>
              {/snippet}
            </WorkspaceSwipeContainer>
          {:else}
            <div class="sidebar-items-wrapper">
              <SidebarItems onItemSelect={handleSidebarItemSelect} />
            </div>
          {/if}
        {/if}
      </div>

      {#if !hasSearchQuery}
        <div class="workspace-bar-wrapper">
          <WorkspaceBar {onCreateNote} {onCreateDeck} {onCaptureWebpage} />
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .quick-search-overlay {
    position: fixed;
    inset: 0;
    background: transparent;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
  }

  .quick-search-modal {
    background: var(--bg-primary);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    width: 100%;
    max-width: 560px;
    overflow: hidden;
    animation: slideDown 0.15s ease-out;
    display: flex;
    flex-direction: column;
    max-height: 70vh;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
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
    font-size: 1rem;
    outline: none;
    padding: 0;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .shortcut-hint {
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
    flex-shrink: 0;
  }

  .shortcut-hint-btn {
    cursor: pointer;
    font-family: inherit;
    transition: background-color 0.15s ease;
  }

  .shortcut-hint-btn:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .panel-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .panel-content-swipe {
    display: flex;
    flex-direction: column;
    overflow-y: hidden;
  }

  .search-results-scroll {
    overflow-y: auto;
  }

  .section {
    padding: 4px 0;
  }

  .section-header {
    padding: 4px 16px 2px;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    line-height: 1;
  }

  .vault-switcher-inline {
    position: relative;
  }

  .vault-switch-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    height: 30px;
    min-height: 0;
    padding: 0 6px;
    border: 1px solid var(--border-light);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.6875rem;
    line-height: 1;
    font-weight: 500;
    cursor: pointer;
    text-transform: none;
    letter-spacing: normal;
  }

  .vault-switch-btn:active {
    background: var(--bg-hover);
  }

  .vault-chevron {
    transition: transform 0.15s ease;
  }

  .vault-chevron.rotated {
    transform: rotate(180deg);
  }

  .vault-dropdown-inline {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 160px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    z-index: 10;
    padding: 4px;
    text-transform: none;
    letter-spacing: normal;
  }

  .vault-item-row {
    display: flex;
    align-items: center;
  }

  .vault-dropdown-item {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
  }

  .vault-dropdown-item:active {
    background: var(--bg-hover);
  }

  .vault-dropdown-item.active {
    background: var(--accent-light);
    color: var(--text-primary);
  }

  .vault-dropdown-item.editing {
    gap: 8px;
    padding: 4px 10px;
  }

  .vault-item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-name-input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--border-light);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.8125rem;
    padding: 2px 6px;
    outline: none;
  }

  .vault-name-input:focus {
    border-color: var(--accent-primary);
  }

  .legacy-badge {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--accent-light);
    color: var(--accent-primary);
    text-transform: uppercase;
  }

  .vault-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    min-height: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
  }

  .vault-action-btn:active {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .vault-dropdown-item.new-vault {
    color: var(--text-muted);
  }

  .vault-dropdown-separator {
    height: 1px;
    background: var(--border-light);
    margin: 4px 0;
  }

  .nav-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 16px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .nav-item:active {
    background: var(--bg-hover);
  }

  .nav-item.active {
    background: var(--accent-light);
    color: var(--text-primary);
  }

  .nav-item svg {
    flex-shrink: 0;
  }

  .item-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    margin-left: auto;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .view-all-btn {
    width: 100%;
    padding: 0.75rem;
    border: none;
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    text-align: center;
  }

  .view-all-btn:hover {
    background: var(--bg-hover);
  }

  .no-results {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .workspace-bar-wrapper {
    border-top: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .sidebar-items-wrapper {
    flex: 1;
    min-height: 0;
  }

  /* Mobile: match shelf/chat panel styling */
  @media (max-width: 767px) {
    .quick-search-overlay {
      padding-top: 0;
      align-items: flex-end;
    }

    .quick-search-modal {
      max-width: none;
      margin: 0 12px calc(12px + var(--safe-area-bottom, 0px));
      max-height: calc(100vh - 100px);
      border: 1px solid var(--border-light);
      animation: slideUp 0.2s ease-out;
    }

    .quick-search-modal.swipe-active {
      height: calc(100vh - 100px);
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  }
</style>
