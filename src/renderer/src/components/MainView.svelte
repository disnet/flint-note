<script lang="ts">
  /**
   * Main view component using Automerge for data storage
   * Contains the left sidebar, note list/editor, and workspace management
   */
  import {
    getAllNotes,
    getNoteTypes,
    getActiveItem,
    getActiveNote,
    getActiveConversationEntry,
    setActiveItem,
    getActiveSystemView,
    setActiveSystemView,
    createNote,
    updateNote,
    archiveNote,
    addItemToWorkspace,
    getNonArchivedVaults,
    getActiveVault,
    createVault,
    switchVault,
    searchNotesEnhanced,
    searchNotesAsync,
    searchIndex,
    getNoteContent,
    automergeShelfStore,
    getRoutine,
    EPUB_NOTE_TYPE_ID,
    PDF_NOTE_TYPE_ID,
    WEBPAGE_NOTE_TYPE_ID,
    DECK_NOTE_TYPE_ID,
    createDeckNote,
    type NoteMetadata,
    type SearchResult,
    type EnhancedSearchResult,
    type ConversationIndexEntry,
    type SidebarItem,
    type SystemView
  } from '../lib/automerge';
  import LeftSidebar from './LeftSidebar.svelte';
  import NoteEditor from './NoteEditor.svelte';
  import SearchResults from './SearchResults.svelte';
  import NoteTypesView from './NoteTypesView.svelte';
  import EpubViewer from './EpubViewer.svelte';
  import PdfViewer from './PdfViewer.svelte';
  import WebpageViewer from './WebpageViewer.svelte';
  import DeckViewer from './DeckViewer.svelte';
  import DailyView from './DailyView.svelte';
  import VaultSyncSettings from './VaultSyncSettings.svelte';
  import FABMenu from './FABMenu.svelte';
  import ChatPanel from './ChatPanel.svelte';
  import ShelfPanel from './ShelfPanel.svelte';
  import APIKeySettings from './APIKeySettings.svelte';
  import DebugSettings from './DebugSettings.svelte';
  import ConversationList from './ConversationList.svelte';
  import ConversationView from './ConversationView.svelte';
  import ReviewView from './ReviewView.svelte';
  import InboxView from './InboxView.svelte';
  import RoutinesView from './RoutinesView.svelte';
  import ImportWebpageModal from './ImportWebpageModal.svelte';
  import LegacyMigrationModal from './LegacyMigrationModal.svelte';
  import QuickSearch from './QuickSearch.svelte';
  import { initializeState } from '../lib/automerge';
  import { settingsStore } from '../stores/settingsStore.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';

  // Derived state
  const allNotes = $derived(getAllNotes());
  const noteTypes = $derived(getNoteTypes());
  const activeItem = $derived(getActiveItem());
  const activeNote = $derived(getActiveNote());
  const activeConversation = $derived(getActiveConversationEntry());
  const vaults = $derived(getNonArchivedVaults());
  const activeVault = $derived(getActiveVault());

  // Build note types record for search
  const noteTypesRecord = $derived(Object.fromEntries(noteTypes.map((t) => [t.id, t])));

  // Check if active note is an EPUB, PDF, Webpage, or Deck
  const isActiveNoteEpub = $derived(activeNote?.type === EPUB_NOTE_TYPE_ID);
  const isActiveNotePdf = $derived(activeNote?.type === PDF_NOTE_TYPE_ID);
  const isActiveNoteWebpage = $derived(activeNote?.type === WEBPAGE_NOTE_TYPE_ID);
  const isActiveNoteDeck = $derived(activeNote?.type === DECK_NOTE_TYPE_ID);

  // UI state
  let searchQuery = $state('');
  // activeSystemView is now persisted in Automerge document
  const activeSystemView: SystemView = $derived(getActiveSystemView());
  let showCreateVaultModal = $state(false);
  let showArchiveWebpageModal = $state(false);
  let showLegacyMigrationModal = $state(false);
  let newVaultName = $state('');
  let searchInputFocused = $state(false);
  let selectedNoteTypeId = $state<string | null>(null);
  let selectedConversationId = $state<string | null>(null);
  let selectedSearchIndex = $state(0);
  let chatPanelOpen = $state(false);
  let shelfPanelOpen = $state(false);
  let pendingChatMessage = $state<string | null>(null);
  let quickSearchOpen = $state(false);

  // Font settings state
  let systemFonts = $state<string[]>([]);
  let loadingFonts = $state(false);

  // Load system fonts when custom font option is selected
  async function loadSystemFonts(): Promise<void> {
    if (systemFonts.length > 0 || loadingFonts) return;
    loadingFonts = true;
    try {
      const fonts = await window.api?.getSystemFonts();
      if (fonts) {
        systemFonts = fonts;
      }
    } catch (error) {
      console.error('Failed to load system fonts:', error);
    } finally {
      loadingFonts = false;
    }
  }

  // Watch for custom preset selection to load fonts
  $effect(() => {
    if (settingsStore.settings.appearance.font?.preset === 'custom') {
      loadSystemFonts();
    }
  });

  // Handle font preset change
  async function handleFontPresetChange(
    preset: 'sans-serif' | 'serif' | 'monospace' | 'custom'
  ): Promise<void> {
    await settingsStore.updateFont({
      preset,
      customFont:
        preset === 'custom'
          ? settingsStore.settings.appearance.font?.customFont
          : undefined
    });
  }

  // Handle custom font selection
  async function handleCustomFontChange(fontName: string): Promise<void> {
    await settingsStore.updateFont({
      preset: 'custom',
      customFont: fontName
    });
  }

  // Handle font size change
  async function handleFontSizeChange(size: number): Promise<void> {
    await settingsStore.updateSettings({
      appearance: {
        ...settingsStore.settings.appearance,
        fontSize: size
      }
    });
  }

  // Open shelf panel (used by "Add to Shelf" buttons)
  function openShelfPanel(): void {
    shelfPanelOpen = true;
    chatPanelOpen = false; // Mutual exclusion
  }

  // Add current active item to shelf
  function handleAddToShelf(): void {
    if (activeItem) {
      automergeShelfStore.addItem(activeItem.type, activeItem.id);
      openShelfPanel();
    }
  }

  // Check if current item is on shelf
  const isOnShelf = $derived(
    activeItem ? automergeShelfStore.isOnShelf(activeItem.type, activeItem.id) : false
  );

  // Search results with progressive loading (title first, then content)
  let searchResults = $state<(SearchResult | EnhancedSearchResult)[]>([]);
  let isSearchingContent = $state(false);
  let isShowingRecent = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Get recently opened notes sorted by lastOpened (most recent first)
  function getRecentlyOpenedNotes(): SearchResult[] {
    // Get the currently active note ID to exclude it
    const activeNoteId = activeItem?.type === 'note' ? activeItem.id : null;

    // Filter to non-archived notes that have been opened, excluding current note
    const openedNotes = allNotes
      .filter((note) => !note.archived && note.lastOpened && note.id !== activeNoteId)
      .sort((a, b) => {
        // Sort by lastOpened descending (most recent first)
        const aTime = a.lastOpened ? new Date(a.lastOpened).getTime() : 0;
        const bTime = b.lastOpened ? new Date(b.lastOpened).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 8);

    return openedNotes.map((note) => ({
      note,
      score: 0,
      titleMatches: [],
      contentMatches: [],
      matchedType: noteTypesRecord[note.type]
    }));
  }

  // Effect to handle progressive search
  $effect(() => {
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }

    if (!searchQuery.trim()) {
      // When focused with empty query, show recently opened notes
      if (searchInputFocused) {
        searchResults = getRecentlyOpenedNotes();
        isShowingRecent = true;
      } else {
        searchResults = [];
        isShowingRecent = false;
      }
      isSearchingContent = false;
      return;
    }

    isShowingRecent = false;

    // Phase 1: Immediate title search (synchronous)
    const immediateResults = searchNotesEnhanced(allNotes, searchQuery, {
      noteTypes: noteTypesRecord
    });
    searchResults = immediateResults;

    // Phase 2: Debounced full search including content (150ms delay)
    searchTimeout = setTimeout(async () => {
      isSearchingContent = true;
      try {
        const fullResults = await searchNotesAsync(
          allNotes,
          searchQuery,
          { noteTypes: noteTypesRecord, contentLoader: getNoteContent },
          searchIndex
        );
        searchResults = fullResults;
      } finally {
        isSearchingContent = false;
      }
    }, 150);

    // Cleanup
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  });

  // Handlers
  function handleItemSelect(item: SidebarItem): void {
    setActiveItem({ type: item.type, id: item.id });
    addItemToWorkspace({ type: item.type, id: item.id });
    setActiveSystemView(null); // Clear system view when selecting an item
    searchQuery = ''; // Clear search when selecting an item
    searchInputFocused = false;
  }

  function handleNoteSelect(note: NoteMetadata): void {
    setActiveItem({ type: 'note', id: note.id });
    addItemToWorkspace({ type: 'note', id: note.id });
    setActiveSystemView(null);
    searchQuery = '';
    searchInputFocused = false;
  }

  function handleSearchResultSelect(note: NoteMetadata): void {
    handleNoteSelect(note);
  }

  function handleSearchFocus(): void {
    searchInputFocused = true;
  }

  function handleSearchBlur(): void {
    // Delay to allow click events on results to fire
    setTimeout(() => {
      searchInputFocused = false;
    }, 200);
  }

  function handleSearchKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      searchQuery = '';
      searchInputFocused = false;
      selectedSearchIndex = 0;
      (event.target as HTMLInputElement)?.blur();
    }

    const maxIndex = Math.min(searchResults.length, 8);

    // Cmd/Ctrl+N or ArrowDown: Select next result
    if (
      (((event.metaKey || event.ctrlKey) && event.key === 'n') ||
        event.key === 'ArrowDown') &&
      searchResults.length > 0
    ) {
      event.preventDefault();
      selectedSearchIndex = (selectedSearchIndex + 1) % maxIndex;
    }

    // Cmd/Ctrl+P or ArrowUp: Select previous result
    if (
      (((event.metaKey || event.ctrlKey) && event.key === 'p') ||
        event.key === 'ArrowUp') &&
      searchResults.length > 0
    ) {
      event.preventDefault();
      selectedSearchIndex = (selectedSearchIndex - 1 + maxIndex) % maxIndex;
    }

    // Enter selects the highlighted result, or opens search view if no selection
    if (event.key === 'Enter' && searchResults.length > 0) {
      event.preventDefault();
      if (selectedSearchIndex < maxIndex) {
        handleSearchResultSelect(searchResults[selectedSearchIndex].note);
      } else if (searchQuery.trim()) {
        // Only open search view if there's an actual query
        setActiveSystemView('search');
        setActiveItem(null);
      }
    }
  }

  async function handleCreateNote(): Promise<void> {
    const id = await createNote({ title: '' });
    setActiveItem({ type: 'note', id });
    setActiveSystemView(null);
  }

  async function handleCreateDeck(): Promise<void> {
    const id = await createDeckNote('');
    setActiveItem({ type: 'note', id });
    setActiveSystemView(null);
  }

  function handleArchiveNote(noteId: string): void {
    archiveNote(noteId);
  }

  function handleSystemViewSelect(
    view:
      | 'settings'
      | 'types'
      | 'daily'
      | 'conversations'
      | 'review'
      | 'inbox'
      | 'routines'
      | null
  ): void {
    setActiveSystemView(view);
    if (view) {
      setActiveItem(null); // Clear active item when viewing system views
    }
    // Reset selected note type when leaving types view
    if (view !== 'types') {
      selectedNoteTypeId = null;
    }
    // Reset selected conversation when leaving conversations view
    if (view !== 'conversations') {
      selectedConversationId = null;
    }
  }

  // Handle conversation selection from conversations view
  function handleConversationSelectFromView(conv: ConversationIndexEntry): void {
    setActiveItem({ type: 'conversation', id: conv.id });
    selectedConversationId = conv.id;
    // Stay in conversations view to show the conversation in main area
  }

  // Handle navigating to settings from conversation view
  function handleGoToSettingsFromConversation(): void {
    setActiveSystemView('settings');
    selectedConversationId = null;
  }

  // Handle legacy migration
  async function handleLegacyMigrationComplete(): Promise<void> {
    showLegacyMigrationModal = false;
    // Re-initialize state to load the newly created vault
    await initializeState();
  }

  function handleLegacyMigrationCancel(): void {
    showLegacyMigrationModal = false;
  }

  // Handle new conversation from conversations view
  function handleNewConversationFromView(): void {
    // Clear active conversation - ChatService will create new on first message
    setActiveItem(null);
    chatPanelOpen = true;
    setActiveSystemView(null);
  }

  function handleNoteTypeSelect(typeId: string | null): void {
    selectedNoteTypeId = typeId;
  }

  function handleNoteSelectFromTypes(_noteId: string): void {
    // Navigate to the note from the types view
    // The note is already selected via setActiveNoteId in the NoteTypesView
    setActiveSystemView(null);
    selectedNoteTypeId = null;
  }

  async function handleVaultSelect(vaultId: string): Promise<void> {
    await switchVault(vaultId);
    setActiveItem(null);
  }

  function handleCreateVault(): void {
    newVaultName = '';
    showCreateVaultModal = true;
  }

  function submitCreateVault(): void {
    if (newVaultName.trim()) {
      createVault(newVaultName.trim());
      showCreateVaultModal = false;
      newVaultName = '';
    }
  }

  function toggleLeftSidebar(): void {
    sidebarState.toggleLeftSidebar();
  }

  // Keyboard shortcuts
  const isMac = navigator.platform.startsWith('Mac');

  function handleKeyDown(event: KeyboardEvent): void {
    // Use Cmd on macOS, Ctrl on Windows/Linux
    const modifierPressed = isMac ? event.metaKey : event.ctrlKey;

    // Cmd/Ctrl + Shift + N: New note
    if (modifierPressed && event.shiftKey && event.key === 'N') {
      event.preventDefault();
      handleCreateNote();
    }
    // Cmd/Ctrl + K: Focus search or open quick search
    if (modifierPressed && event.key === 'k') {
      event.preventDefault();
      if (sidebarState.leftSidebar.visible) {
        // Sidebar is open - focus the sidebar search input
        const searchInput = document.getElementById('search-input');
        searchInput?.focus();
      } else {
        // Sidebar is closed - open quick search modal
        quickSearchOpen = true;
        searchInputFocused = true; // Trigger the search effect to show recent notes
      }
    }
    // Cmd/Ctrl + B: Toggle sidebar
    if (modifierPressed && event.key === 'b') {
      event.preventDefault();
      toggleLeftSidebar();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="main-view">
  <!-- Main Layout -->
  <div class="app-layout">
    <!-- Left Sidebar -->
    <LeftSidebar
      {activeSystemView}
      {searchQuery}
      {searchResults}
      {searchInputFocused}
      {selectedSearchIndex}
      {isShowingRecent}
      {vaults}
      activeVault={activeVault ?? null}
      onItemSelect={handleItemSelect}
      onSystemViewSelect={handleSystemViewSelect}
      onCreateNote={handleCreateNote}
      onCreateDeck={handleCreateDeck}
      onSearchChange={(query) => {
        searchQuery = query;
        selectedSearchIndex = 0;
      }}
      onSearchFocus={handleSearchFocus}
      onSearchBlur={handleSearchBlur}
      onSearchKeyDown={handleSearchKeyDown}
      onSearchResultSelect={handleSearchResultSelect}
      onVaultSelect={handleVaultSelect}
      onCreateVault={handleCreateVault}
      onToggleSidebar={toggleLeftSidebar}
      onViewAllResults={() => {
        setActiveSystemView('search');
        setActiveItem(null);
      }}
    />

    <!-- Main Content -->
    <div class="main-content">
      <!-- Safe zone for window dragging (macOS traffic lights area) -->
      <div class="safe-zone">
        {#if !sidebarState.leftSidebar.visible}
          <button
            class="floating-sidebar-toggle"
            onclick={toggleLeftSidebar}
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
        {/if}
        <div class="safe-zone-actions">
          {#if activeItem}
            <button
              class="safe-zone-button"
              class:on-shelf={isOnShelf}
              onclick={handleAddToShelf}
              disabled={isOnShelf}
              title={isOnShelf ? 'On Shelf' : 'Add to Shelf'}
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
                <path d="M22 12h-6l-2 3h-4l-2-3H2"></path>
                <path
                  d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
                ></path>
              </svg>
            </button>
          {/if}
          <button class="more-menu-button" title="More options">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="12" cy="19" r="2"></circle>
            </svg>
          </button>
        </div>
      </div>

      <div
        class="scroll-container"
        class:no-scroll={isActiveNoteEpub || isActiveNotePdf || isActiveNoteDeck}
      >
        <div
          class="content-wrapper"
          class:full-width-content={isActiveNoteEpub ||
            isActiveNotePdf ||
            isActiveNoteDeck}
        >
          {#if activeSystemView === 'settings'}
            <div class="settings-panel">
              <h2>Settings</h2>
              <div class="settings-group">
                <label>
                  <span>Theme</span>
                  <select bind:value={settingsStore.settings.appearance.theme}>
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
              </div>

              <div class="settings-group">
                <label>
                  <span>Editor Font</span>
                  <select
                    value={settingsStore.settings.appearance.font?.preset || 'sans-serif'}
                    onchange={(e) =>
                      handleFontPresetChange(
                        e.currentTarget.value as
                          | 'sans-serif'
                          | 'serif'
                          | 'monospace'
                          | 'custom'
                      )}
                  >
                    <option value="sans-serif">Sans-serif</option>
                    <option value="serif">Serif</option>
                    <option value="monospace">Monospace</option>
                    <option value="custom">Custom...</option>
                  </select>
                </label>
              </div>

              {#if settingsStore.settings.appearance.font?.preset === 'custom'}
                <div class="settings-group">
                  <label>
                    <span>Custom Font</span>
                    <select
                      value={settingsStore.settings.appearance.font?.customFont || ''}
                      onchange={(e) => handleCustomFontChange(e.currentTarget.value)}
                      disabled={loadingFonts}
                    >
                      <option value=""
                        >{loadingFonts ? 'Loading fonts...' : 'Select a font...'}</option
                      >
                      {#each systemFonts as fontName (fontName)}
                        <option value={fontName}>{fontName}</option>
                      {/each}
                    </select>
                  </label>
                  {#if settingsStore.settings.appearance.font?.customFont}
                    <div
                      class="font-preview"
                      style="font-family: '{settingsStore.settings.appearance.font
                        .customFont}'"
                    >
                      The quick brown fox jumps over the lazy dog.
                    </div>
                  {/if}
                </div>
              {/if}

              <div class="settings-group">
                <label>
                  <span>Font Size</span>
                  <div class="font-size-control">
                    <input
                      type="range"
                      min="12"
                      max="24"
                      step="1"
                      value={settingsStore.settings.appearance.fontSize ?? 16}
                      oninput={(e) =>
                        handleFontSizeChange(parseInt(e.currentTarget.value))}
                    />
                    <span class="font-size-value"
                      >{settingsStore.settings.appearance.fontSize ?? 16}px</span
                    >
                  </div>
                </label>
              </div>

              <div class="settings-divider"></div>

              <!-- API Key Settings -->
              <APIKeySettings />

              <div class="settings-divider"></div>

              <!-- File Sync Settings -->
              <VaultSyncSettings />

              <div class="settings-divider"></div>

              <!-- Debug / Performance Settings -->
              <DebugSettings />

              <div class="settings-divider"></div>

              <!-- Legacy Vault Import -->
              <div class="import-section">
                <h3>Import Legacy Vault</h3>
                <p class="import-description">
                  Import notes from an older Flint vault (before the Automerge update).
                  Your original files will not be modified.
                </p>
                <button
                  class="action-button primary"
                  onclick={() => (showLegacyMigrationModal = true)}
                >
                  Import Legacy Vault...
                </button>
              </div>

              <button class="close-settings" onclick={() => setActiveSystemView(null)}
                >Close</button
              >
            </div>
          {:else if activeSystemView === 'search'}
            <!-- Dedicated Search View -->
            <div class="search-view">
              <div class="search-view-header">
                <h2>Search Results ({searchResults.length})</h2>
                <span class="search-query-label">for "{searchQuery}"</span>
                <button
                  class="close-search-btn"
                  onclick={() => setActiveSystemView(null)}
                  aria-label="Close search"
                >
                  <svg
                    width="16"
                    height="16"
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
              <div class="search-view-content">
                <SearchResults
                  results={searchResults}
                  onSelect={handleSearchResultSelect}
                  maxResults={50}
                  isLoading={isSearchingContent}
                />
              </div>
            </div>
          {:else if activeSystemView === 'types'}
            <!-- Note Types View -->
            <NoteTypesView
              selectedTypeId={selectedNoteTypeId}
              onTypeSelect={handleNoteTypeSelect}
              onNoteSelect={handleNoteSelectFromTypes}
            />
          {:else if activeSystemView === 'daily'}
            <!-- Daily View -->
            <DailyView onNoteSelect={handleNoteSelect} />
          {:else if activeSystemView === 'conversations'}
            <!-- Conversations View -->
            {#if selectedConversationId}
              <!-- Single Conversation View -->
              <ConversationView
                conversationId={selectedConversationId}
                onGoToSettings={handleGoToSettingsFromConversation}
              />
            {:else}
              <!-- Conversations List -->
              <div class="conversations-view">
                <div class="conversations-view-header">
                  <h2>Conversations</h2>
                  <button class="create-btn" onclick={handleNewConversationFromView}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    New Chat
                  </button>
                </div>
                <div class="conversations-list-wrapper">
                  <ConversationList
                    activeConversationId={activeItem?.type === 'conversation'
                      ? activeItem.id
                      : null}
                    onConversationSelect={handleConversationSelectFromView}
                    onNewConversation={handleNewConversationFromView}
                  />
                </div>
              </div>
            {/if}
          {:else if activeSystemView === 'review'}
            <!-- Review View -->
            <ReviewView />
          {:else if activeSystemView === 'inbox'}
            <!-- Inbox View -->
            <InboxView />
          {:else if activeSystemView === 'routines'}
            <!-- Routines View -->
            <RoutinesView
              onExecuteRoutine={(routineId) => {
                // Get routine details and start chat with execution context
                const routine = getRoutine(routineId);
                if (routine) {
                  pendingChatMessage = `Execute the routine "${routine.name}". First read the routine details using get_routine to understand the full instructions, then follow them to complete the routine.`;
                  chatPanelOpen = true;
                }
              }}
            />
          {:else if activeItem?.type === 'conversation' && activeConversation}
            <!-- Conversation selected from sidebar -->
            <ConversationView
              conversationId={activeConversation.id}
              onGoToSettings={() => {
                setActiveSystemView('settings');
                setActiveItem(null);
              }}
            />
          {:else if activeNote}
            {#if isActiveNoteEpub}
              <EpubViewer
                note={activeNote}
                onTitleChange={(title) => updateNote(activeNote.id, { title })}
              />
            {:else if isActiveNotePdf}
              <PdfViewer
                note={activeNote}
                onTitleChange={(title) => updateNote(activeNote.id, { title })}
              />
            {:else if isActiveNoteWebpage}
              <WebpageViewer
                note={activeNote}
                onTitleChange={(title) => updateNote(activeNote.id, { title })}
              />
            {:else if isActiveNoteDeck}
              <DeckViewer
                note={activeNote}
                onNoteOpen={(noteId) => {
                  setActiveItem({ type: 'note', id: noteId });
                  addItemToWorkspace({ type: 'note', id: noteId });
                }}
                onTitleChange={(title) => updateNote(activeNote.id, { title })}
              />
            {:else}
              <NoteEditor
                note={activeNote}
                onTitleChange={(title) => updateNote(activeNote.id, { title })}
                onArchive={() => handleArchiveNote(activeNote.id)}
              />
            {/if}
          {:else}
            <div class="empty-editor">
              <div class="empty-editor-content">
                <h2>Select a note to edit</h2>
                <p>Or create a new note with ⌘N</p>
                <button class="create-note-btn" onclick={handleCreateNote}>
                  Create Note
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Create Vault Modal -->
{#if showCreateVaultModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    onclick={() => (showCreateVaultModal = false)}
    onkeydown={(e) => e.key === 'Escape' && (showCreateVaultModal = false)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h3>Create New Vault</h3>
      <input
        type="text"
        class="modal-input"
        placeholder="Vault name"
        bind:value={newVaultName}
        onkeydown={(e) => e.key === 'Enter' && submitCreateVault()}
      />
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick={() => (showCreateVaultModal = false)}
          >Cancel</button
        >
        <button class="modal-btn primary" onclick={submitCreateVault}>Create</button>
      </div>
    </div>
  </div>
{/if}

<!-- FAB Menu and Panels -->
<FABMenu
  chatOpen={chatPanelOpen}
  shelfOpen={shelfPanelOpen}
  onToggleChat={() => {
    chatPanelOpen = !chatPanelOpen;
    if (chatPanelOpen) shelfPanelOpen = false; // Mutual exclusion
  }}
  onToggleShelf={() => {
    shelfPanelOpen = !shelfPanelOpen;
    if (shelfPanelOpen) chatPanelOpen = false; // Mutual exclusion
  }}
  onArchiveWebpage={() => {
    showArchiveWebpageModal = true;
  }}
/>

<ChatPanel
  isOpen={chatPanelOpen}
  onClose={() => (chatPanelOpen = false)}
  onGoToSettings={() => {
    setActiveSystemView('settings');
    chatPanelOpen = false;
  }}
  initialMessage={pendingChatMessage ?? undefined}
  onInitialMessageConsumed={() => (pendingChatMessage = null)}
/>

<ShelfPanel
  isOpen={shelfPanelOpen}
  onClose={() => (shelfPanelOpen = false)}
  onNavigate={(type, id) => {
    setActiveItem({ type, id });
    addItemToWorkspace({ type, id });
    setActiveSystemView(null);
    shelfPanelOpen = false;
  }}
/>

<!-- Archive Webpage Modal -->
<ImportWebpageModal
  isOpen={showArchiveWebpageModal}
  onClose={() => (showArchiveWebpageModal = false)}
/>

<!-- Quick Search Modal (when sidebar is closed) -->
<QuickSearch
  isOpen={quickSearchOpen}
  {searchQuery}
  {searchResults}
  {selectedSearchIndex}
  {isShowingRecent}
  {isSearchingContent}
  onClose={() => {
    quickSearchOpen = false;
    searchQuery = '';
    searchInputFocused = false;
    selectedSearchIndex = 0;
  }}
  onSearchChange={(query) => {
    searchQuery = query;
    selectedSearchIndex = 0;
  }}
  onSearchResultSelect={(note) => {
    handleSearchResultSelect(note);
    quickSearchOpen = false;
    searchQuery = '';
    searchInputFocused = false;
    selectedSearchIndex = 0;
  }}
  onKeyDown={handleSearchKeyDown}
  onViewAllResults={() => {
    setActiveSystemView('search');
    setActiveItem(null);
    quickSearchOpen = false;
  }}
/>

{#if showLegacyMigrationModal}
  <LegacyMigrationModal
    onComplete={handleLegacyMigrationComplete}
    onCancel={handleLegacyMigrationCancel}
  />
{/if}

<style>
  .main-view {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    color: var(--text-primary);
    overflow: hidden; /* Prevent any scroll propagation */
  }

  /* App Layout */
  .app-layout {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden; /* Prevent any scroll propagation */
  }

  /* Safe zone for window dragging */
  .safe-zone {
    height: 38px;
    -webkit-app-region: drag;
    user-select: none;
    flex-shrink: 0;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-left: 70px; /* Space for traffic lights on macOS */
    padding-right: 0.5rem;
  }

  .floating-sidebar-toggle {
    padding: 0.25rem;
    margin-left: 0.5rem;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    -webkit-app-region: no-drag;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .floating-sidebar-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .safe-zone-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
    -webkit-app-region: no-drag;
  }

  .safe-zone-button {
    padding: 0.25rem;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .safe-zone-button:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .safe-zone-button:disabled {
    cursor: default;
  }

  .safe-zone-button.on-shelf {
    color: var(--accent-primary);
  }

  .more-menu-button {
    padding: 0.25rem;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .more-menu-button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* Search View */
  .search-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .search-view-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .search-view-header h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .search-query-label {
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .close-search-btn {
    margin-left: auto;
    padding: 0.375rem;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-search-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .search-view-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  /* Main Content */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0; /* Important for nested flex containers */
    overflow: hidden;
  }

  /* Scroll container - full width, handles scrolling */
  .scroll-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0; /* Important for flex child with overflow */
    scrollbar-gutter: stable; /* Prevent layout shift when scrollbar appears */
  }

  /* Disable scrolling for PDF/EPUB viewers that handle their own scrolling */
  .scroll-container.no-scroll {
    overflow: hidden;
  }

  /* Thin overlay scrollbar styling */
  .scroll-container::-webkit-scrollbar {
    width: 8px;
    background: transparent;
  }

  .scroll-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .scroll-container::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }

  .scroll-container::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  :global(.dark) .scroll-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
  }

  :global(.dark) .scroll-container::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  /* Content wrapper for centering with max-width */
  .content-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 70ch;
    margin: 0 auto;
    padding: 0 1rem;
    min-height: 100%;
  }

  /* Allow full width for PDF and EPUB viewers */
  .content-wrapper.full-width-content {
    max-width: none;
    padding: 0;
    height: 100%;
    min-height: 0; /* Allow shrinking in flex context */
  }

  .empty-editor {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-editor-content {
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-editor-content h2 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .empty-editor-content p {
    margin: 0 0 1.5rem;
  }

  .create-note-btn {
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: var(--accent-text, white);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
  }

  .create-note-btn:hover {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  /* Settings Panel */
  .settings-panel {
    padding: 2rem;
    max-width: 600px;
    margin: 0 auto;
  }

  .settings-panel h2 {
    margin: 0 0 1.5rem;
  }

  .settings-group {
    margin-bottom: 1rem;
  }

  .settings-group label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
  }

  .settings-group select {
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .font-preview {
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 0.375rem;
    font-size: 1rem;
    line-height: 1.5;
    color: var(--text-primary);
  }

  .font-size-control {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .font-size-control input[type='range'] {
    width: 120px;
    accent-color: var(--accent-primary);
  }

  .font-size-value {
    min-width: 3rem;
    text-align: right;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .settings-divider {
    height: 1px;
    background: var(--border-light);
    margin: 1.5rem 0;
  }

  .close-settings {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--bg-tertiary, var(--bg-hover));
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    color: var(--text-primary);
    cursor: pointer;
  }

  /* Import Section */
  .import-section {
    padding: 1rem;
  }

  .import-section h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: var(--text-primary);
  }

  .import-description {
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0 0 1rem 0;
  }

  .action-button {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background-color 0.15s ease;
  }

  .action-button.primary {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .action-button.primary:hover {
    background: var(--accent-primary-hover);
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-primary);
    border-radius: 0.5rem;
    padding: 1.5rem;
    min-width: 300px;
    max-width: 400px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .modal h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .modal-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 1rem;
    outline: none;
    box-sizing: border-box;
  }

  .modal-input:focus {
    border-color: var(--accent-primary);
  }

  .modal-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }

  .modal-btn {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .modal-btn.cancel {
    background: var(--bg-tertiary, var(--bg-hover));
    color: var(--text-primary);
  }

  .modal-btn.cancel:hover {
    background: var(--bg-hover);
  }

  .modal-btn.primary {
    background: var(--accent-primary);
    color: var(--accent-text, white);
  }

  .modal-btn.primary:hover {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  /* Conversations View */
  .conversations-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 1.5rem;
    max-width: 600px;
  }

  .conversations-view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }

  .conversations-view-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .conversations-list-wrapper {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
  }
</style>
