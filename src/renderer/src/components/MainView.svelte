<script lang="ts">
  /**
   * Main view component using Automerge for data storage
   * Contains the left sidebar, note list/editor, and workspace management
   */
  import { onMount } from 'svelte';
  import {
    getAllNotes,
    getNoteTypes,
    getNoteType,
    getActiveItem,
    getActiveNote,
    setActiveItem,
    getActiveSystemView,
    setActiveSystemView,
    getSelectedNoteTypeId,
    setSelectedNoteTypeId,
    createNote,
    updateNote,
    archiveNote,
    unarchiveNote,
    addItemToWorkspace,
    getNonArchivedVaults,
    getActiveVault,
    createVaultWithOptions,
    VAULT_TEMPLATES,
    ONBOARDING_OPTIONS,
    switchVault,
    searchNotesEnhanced,
    searchNotesAsync,
    searchIndex,
    getNoteContent,
    automergeShelfStore,
    getRoutine,
    getSourceFormat,
    createDeckNote,
    pinItem,
    unpinItem,
    isItemPinned,
    enableReview,
    disableReview,
    getReviewData,
    getWorkspaces,
    getActiveWorkspace,
    setActiveWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    importEpubFile,
    importPdfFile,
    isLegacyVault,
    finalizeLegacyVaultMigration,
    selectSyncDirectory,
    type NoteMetadata,
    type SearchResult,
    type EnhancedSearchResult,
    type SidebarItem,
    type SystemView,
    type Vault
  } from '../lib/automerge';
  import {
    migrateLegacyVault,
    getMigrationProgress,
    resetMigrationState
  } from '../lib/automerge/legacy-migration.svelte';
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
  import AboutSettings from './AboutSettings.svelte';
  import ChangelogModal from './ChangelogModal.svelte';
  import ReviewView from './ReviewView.svelte';
  import InboxView from './InboxView.svelte';
  import RoutinesView from './RoutinesView.svelte';
  import ImportWebpageModal from './ImportWebpageModal.svelte';
  import LegacyMigrationModal from './LegacyMigrationModal.svelte';
  import QuickSearch from './QuickSearch.svelte';
  import NoteActionsMenu from './NoteActionsMenu.svelte';
  import UpdateWidget from './UpdateWidget.svelte';
  import Tooltip from './Tooltip.svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import { initializeState } from '../lib/automerge';
  import { settingsStore } from '../stores/settingsStore.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';

  // Derived state
  const allNotes = $derived(getAllNotes());
  const noteTypes = $derived(getNoteTypes());
  const activeItem = $derived(getActiveItem());
  const activeNote = $derived(getActiveNote());
  const vaults = $derived(getNonArchivedVaults());
  const activeVault = $derived(getActiveVault());

  // Build note types record for search
  const noteTypesRecord = $derived(Object.fromEntries(noteTypes.map((t) => [t.id, t])));

  // Check if active note is an EPUB, PDF, Webpage, or Deck using source format
  const activeNoteSourceFormat = $derived(
    activeNote ? getSourceFormat(activeNote) : 'markdown'
  );
  const isActiveNoteEpub = $derived(activeNoteSourceFormat === 'epub');
  const isActiveNotePdf = $derived(activeNoteSourceFormat === 'pdf');
  const isActiveNoteWebpage = $derived(activeNoteSourceFormat === 'webpage');
  const isActiveNoteDeck = $derived(activeNoteSourceFormat === 'deck');

  // UI state
  let searchQuery = $state('');
  // activeSystemView is now persisted in Automerge document
  const activeSystemView: SystemView = $derived(getActiveSystemView());
  // selectedNoteTypeId is now managed in centralized state
  const selectedNoteTypeId = $derived(getSelectedNoteTypeId());
  let showCreateVaultModal = $state(false);
  let showArchiveWebpageModal = $state(false);
  let showLegacyMigrationModal = $state(false);
  let showChangelogModal = $state(false);
  let newVaultName = $state('');
  let newVaultSyncDirectory = $state<string | null>(null);
  let newVaultTemplateId = $state('empty');
  let newVaultOnboardingIds = $state<string[]>(['welcome']);

  // Lazy legacy vault migration state
  let isMigratingLegacyVault = $state(false);
  let migratingVault = $state<Vault | null>(null);
  let migrationError = $state<string | null>(null);
  const migrationProgress = $derived(getMigrationProgress());
  let searchInputFocused = $state(false);
  let selectedSearchIndex = $state(0);
  let pendingChatMessage = $state<string | null>(null);

  // Right sidebar state (from store)
  const rightSidebarExpanded = $derived(sidebarState.rightSidebar.visible);
  const rightSidebarWidth = $derived(sidebarState.rightSidebar.width);
  const chatPanelOpen = $derived(
    sidebarState.rightSidebar.panelOpen &&
      sidebarState.rightSidebar.activePanel === 'chat'
  );
  const shelfPanelOpen = $derived(
    sidebarState.rightSidebar.panelOpen &&
      sidebarState.rightSidebar.activePanel === 'shelf'
  );
  let quickSearchOpen = $state(false);
  let moreMenuOpen = $state(false);
  let moreMenuPosition = $state({ x: 0, y: 0 });
  let isPreviewMode = $state(false);

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
    sidebarState.openPanel('shelf');
  }

  // Toggle panel expanded state (floating vs sidebar)
  function togglePanelExpanded(): void {
    sidebarState.toggleRightSidebar();
  }

  // Track local width during resize for right sidebar
  let rightSidebarLocalWidth = $state<number | null>(null);
  const currentRightSidebarWidth = $derived(rightSidebarLocalWidth ?? rightSidebarWidth);

  function handleRightSidebarResize(width: number): void {
    rightSidebarLocalWidth = width;

    if (rightSidebarSaveTimeout) clearTimeout(rightSidebarSaveTimeout);
    rightSidebarSaveTimeout = setTimeout(() => {
      sidebarState.setRightSidebarWidth(width);
      rightSidebarLocalWidth = null;
    }, 300);
  }

  let rightSidebarSaveTimeout: ReturnType<typeof setTimeout> | null = null;

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

  // Check if current item is pinned
  const isPinned = $derived(activeItem ? isItemPinned(activeItem) : false);

  // Check if current note has review enabled
  const isReviewEnabled = $derived.by(() => {
    if (!activeNote) return false;
    const reviewData = getReviewData(activeNote.id);
    return reviewData?.enabled ?? false;
  });

  // Clear preview mode when active note changes
  $effect(() => {
    if (activeNote) {
      isPreviewMode = false;
    }
  });

  // More menu handlers
  function handleMoreButtonClick(event: MouseEvent): void {
    const button = event.currentTarget as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    moreMenuPosition = { x: rect.right - 180, y: rect.bottom + 4 };
    moreMenuOpen = true;
  }

  function handlePin(): void {
    if (activeItem) {
      // Create plain object to avoid Automerge proxy issues
      pinItem({ type: activeItem.type, id: activeItem.id });
    }
  }

  function handleUnpin(): void {
    if (activeItem) {
      // Create plain object to avoid Automerge proxy issues
      unpinItem({ type: activeItem.type, id: activeItem.id });
    }
  }

  function handleTogglePreview(): void {
    isPreviewMode = !isPreviewMode;
  }

  function handleToggleReview(): void {
    if (!activeNote) return;
    if (isReviewEnabled) {
      disableReview(activeNote.id);
    } else {
      enableReview(activeNote.id);
    }
  }

  function handleArchiveFromMenu(): void {
    if (activeNote) {
      archiveNote(activeNote.id);
    }
  }

  function handleUnarchiveFromMenu(): void {
    if (activeNote) {
      unarchiveNote(activeNote.id);
    }
  }

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

  function handleUnarchiveNote(noteId: string): void {
    unarchiveNote(noteId);
  }

  function handleSystemViewSelect(
    view: 'settings' | 'types' | 'daily' | 'review' | 'inbox' | 'routines' | null
  ): void {
    setActiveSystemView(view);
    if (view) {
      setActiveItem(null); // Clear active item when viewing system views
    }
    // Reset selected note type when leaving types view
    if (view !== 'types') {
      setSelectedNoteTypeId(null);
    }
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

  function handleNoteTypeSelect(typeId: string | null): void {
    setSelectedNoteTypeId(typeId);
  }

  function handleNoteSelectFromTypes(_noteId: string): void {
    // Navigate to the note from the types view
    // The note is already selected via setActiveNoteId in the NoteTypesView
    setActiveSystemView(null);
    setSelectedNoteTypeId(null);
  }

  async function handleVaultSelect(vaultId: string): Promise<void> {
    const vault = vaults.find((v) => v.id === vaultId);
    if (!vault) return;

    // Check if this is a legacy vault that needs migration
    if (isLegacyVault(vault)) {
      await migrateAndSwitchToVault(vault);
    } else {
      await switchVault(vaultId);
      setActiveItem(null);
    }
  }

  /**
   * Migrate a legacy vault and switch to it after migration completes
   */
  async function migrateAndSwitchToVault(vault: Vault): Promise<void> {
    if (!vault.legacyPath) return;

    isMigratingLegacyVault = true;
    migratingVault = vault;
    migrationError = null;

    try {
      const result = await migrateLegacyVault(vault.legacyPath, vault.name);

      if (result.success && result.vault) {
        // Update the vault entry with migration results
        finalizeLegacyVaultMigration(
          vault.id,
          result.vault.docUrl,
          result.vault.baseDirectory
        );

        // Switch to the now-migrated vault
        await switchVault(vault.id);
        setActiveItem(null);
      } else {
        // Handle migration failure
        const errorMsg =
          result.errors?.[0]?.message ?? 'Migration failed for unknown reason';
        migrationError = errorMsg;
        console.error('Migration failed:', result.errors);
      }
    } catch (error) {
      migrationError = error instanceof Error ? error.message : String(error);
      console.error('Migration error:', error);
    } finally {
      isMigratingLegacyVault = false;
      migratingVault = null;
      resetMigrationState();
    }
  }

  /**
   * Cancel/dismiss migration error
   */
  function dismissMigrationError(): void {
    migrationError = null;
  }

  function handleCreateVault(): void {
    newVaultName = '';
    newVaultSyncDirectory = null;
    newVaultTemplateId = 'empty';
    newVaultOnboardingIds = ['welcome'];
    showCreateVaultModal = true;
  }

  function toggleNewVaultOnboarding(id: string): void {
    if (newVaultOnboardingIds.includes(id)) {
      newVaultOnboardingIds = newVaultOnboardingIds.filter((o) => o !== id);
    } else {
      newVaultOnboardingIds = [...newVaultOnboardingIds, id];
    }
  }

  async function handleSelectSyncDirectory(): Promise<void> {
    const directory = await selectSyncDirectory();
    if (directory) {
      newVaultSyncDirectory = directory;
    }
  }

  async function submitCreateVault(): Promise<void> {
    if (newVaultName.trim()) {
      showCreateVaultModal = false;
      const vault = await createVaultWithOptions(
        newVaultName.trim(),
        newVaultSyncDirectory ?? undefined,
        {
          templateId: newVaultTemplateId,
          onboardingIds: newVaultOnboardingIds
        }
      );
      newVaultName = '';
      newVaultSyncDirectory = null;
      newVaultTemplateId = 'empty';
      newVaultOnboardingIds = ['welcome'];
      await switchVault(vault.id);
    }
  }

  /**
   * Browse for a vault directory to import
   */
  async function handleBrowseForVault(): Promise<void> {
    try {
      const selectedPath = await window.api?.legacyMigration.browseForVault();
      if (!selectedPath) return;

      // Close the create vault modal
      showCreateVaultModal = false;

      // Detect if it's a valid legacy vault
      const detectedVault = await window.api?.legacyMigration.detectLegacyVaultAtPath({
        vaultPath: selectedPath,
        existingVaults: vaults.map((v) => ({ baseDirectory: v.baseDirectory }))
      });

      if (detectedVault) {
        // Start migration
        isMigratingLegacyVault = true;
        migratingVault = {
          id: '',
          name: detectedVault.name,
          docUrl: '',
          archived: false,
          created: new Date().toISOString(),
          legacyPath: detectedVault.path
        };
        migrationError = null;

        try {
          const result = await migrateLegacyVault(detectedVault.path, detectedVault.name);

          if (result.success && result.vault) {
            // Re-initialize state to pick up the new vault
            await initializeState();
            // Switch to the new vault
            await switchVault(result.vault.id);
            setActiveItem(null);
          } else {
            const errorMsg =
              result.errors?.[0]?.message ?? 'Migration failed for unknown reason';
            migrationError = errorMsg;
            console.error('Migration failed:', result.errors);
          }
        } catch (error) {
          migrationError = error instanceof Error ? error.message : String(error);
          console.error('Migration error:', error);
        } finally {
          isMigratingLegacyVault = false;
          migratingVault = null;
          resetMigrationState();
        }
      } else {
        migrationError = 'No valid vault found at the selected location';
      }
    } catch (error) {
      migrationError = error instanceof Error ? error.message : String(error);
      console.error('Browse error:', error);
    }
  }

  function toggleLeftSidebar(): void {
    sidebarState.toggleLeftSidebar();
  }

  // State for workspace editing modal
  let showWorkspaceModal = $state(false);
  let editingWorkspaceId = $state<string | null>(null);
  let workspaceModalName = $state('');
  let workspaceModalIcon = $state('');

  // File import state
  let isImporting = $state(false);

  // Workspace actions
  function openNewWorkspaceModal(): void {
    editingWorkspaceId = null;
    workspaceModalName = '';
    workspaceModalIcon = '📋';
    showWorkspaceModal = true;
  }

  function openEditWorkspaceModal(): void {
    const workspace = getActiveWorkspace();
    if (workspace) {
      editingWorkspaceId = workspace.id;
      workspaceModalName = workspace.name;
      workspaceModalIcon = workspace.icon;
      showWorkspaceModal = true;
    }
  }

  function handleWorkspaceModalSubmit(): void {
    if (!workspaceModalName.trim()) return;

    if (editingWorkspaceId) {
      updateWorkspace(editingWorkspaceId, {
        name: workspaceModalName.trim(),
        icon: workspaceModalIcon || '📋'
      });
    } else {
      createWorkspace({
        name: workspaceModalName.trim(),
        icon: workspaceModalIcon || '📋'
      });
    }
    showWorkspaceModal = false;
  }

  function handleDeleteCurrentWorkspace(): void {
    const allWorkspaces = getWorkspaces();
    const workspace = getActiveWorkspace();
    if (allWorkspaces.length > 1 && workspace) {
      // Switch to another workspace first
      const otherWorkspace = allWorkspaces.find((w) => w.id !== workspace.id);
      if (otherWorkspace) {
        setActiveWorkspace(otherWorkspace.id);
      }
      deleteWorkspace(workspace.id);
    }
  }

  // File import handler
  async function handleImportFile(): Promise<void> {
    if (isImporting) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.epub,application/pdf,application/epub+zip';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      isImporting = true;
      try {
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext === 'pdf') {
          await importPdfFile(file);
        } else if (ext === 'epub') {
          await importEpubFile(file);
        }
      } finally {
        isImporting = false;
      }
    };

    input.click();
  }

  // Show in Finder handler - reveals the note file in Finder
  async function handleShowInFinder(): Promise<void> {
    const vault = getActiveVault();
    if (!vault?.baseDirectory || !activeNote) {
      // Fallback to vault directory if no active note
      if (vault?.baseDirectory) {
        await window.api?.showItemInFolder({ path: vault.baseDirectory });
      }
      return;
    }

    // Get the note type name for the path
    const noteType = getNoteType(activeNote.type);
    const typeName = noteType?.name ?? 'Note';

    // Construct the note file path: <vault>/notes/<TypeName>/<note-title>.md
    const notePath = `${vault.baseDirectory}/notes/${typeName}/${activeNote.title}.md`;
    await window.api?.showItemInFolder({ path: notePath });
  }

  // Focus title handler
  function handleFocusTitle(): void {
    const titleInput = document.querySelector(
      '.note-title-input, .title-input, [data-title-input]'
    ) as HTMLElement | null;
    titleInput?.focus();
  }

  // Menu event handlers
  function handleMenuNavigate(view: string): void {
    switch (view) {
      case 'inbox':
        setActiveSystemView('inbox');
        setActiveItem(null);
        break;
      case 'daily':
        setActiveSystemView('daily');
        setActiveItem(null);
        // Focus today's entry after the view mounts
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('daily-view-focus-today'));
        }, 50);
        break;
      case 'review':
        setActiveSystemView('review');
        setActiveItem(null);
        break;
      case 'routines':
        setActiveSystemView('routines');
        setActiveItem(null);
        break;
      case 'note-types':
        setActiveSystemView('types');
        setActiveItem(null);
        break;
      case 'settings':
        setActiveSystemView('settings');
        setActiveItem(null);
        break;
    }
  }

  function handleMenuAction(action: string, ...args: unknown[]): void {
    switch (action) {
      // File actions
      case 'new-note':
        handleCreateNote();
        break;
      case 'new-deck':
        handleCreateDeck();
        break;
      case 'import-file':
        handleImportFile();
        break;
      case 'import-webpage':
        showArchiveWebpageModal = true;
        break;
      case 'new-vault':
        handleCreateVault();
        break;
      case 'switch-vault': {
        // Open the vault dropdown in sidebar - toggle it by focusing
        const vaultButton = document.querySelector(
          '[data-vault-dropdown]'
        ) as HTMLElement | null;
        vaultButton?.click();
        break;
      }
      case 'show-in-finder':
        handleShowInFinder();
        break;
      case 'show-debug-logs':
        window.api?.showLogsInFolder();
        break;

      // Edit actions
      case 'find':
        if (sidebarState.leftSidebar.visible) {
          const searchInput = document.getElementById('search-input');
          searchInput?.focus();
        } else {
          quickSearchOpen = true;
          searchInputFocused = true;
        }
        break;

      // View actions
      case 'toggle-sidebar':
        toggleLeftSidebar();
        break;
      case 'focus-title':
        handleFocusTitle();
        break;
      case 'toggle-preview':
        isPreviewMode = !isPreviewMode;
        break;
      case 'toggle-agent':
        sidebarState.togglePanel('chat');
        break;
      case 'toggle-shelf':
        sidebarState.togglePanel('shelf');
        break;

      // Workspace actions
      case 'new-workspace':
        openNewWorkspaceModal();
        break;
      case 'edit-workspace':
        openEditWorkspaceModal();
        break;
      case 'delete-workspace':
        handleDeleteCurrentWorkspace();
        break;
      case 'switch-workspace':
        if (typeof args[0] === 'string') {
          setActiveWorkspace(args[0]);
        }
        break;

      // Note actions
      case 'toggle-pin':
        if (activeItem) {
          if (isPinned) {
            handleUnpin();
          } else {
            handlePin();
          }
        }
        break;
      case 'add-to-shelf':
        handleAddToShelf();
        break;
      case 'change-type':
        if (activeNote) {
          window.dispatchEvent(
            new CustomEvent('open-type-dropdown', { detail: { noteId: activeNote.id } })
          );
        }
        break;
      case 'toggle-review':
        handleToggleReview();
        break;
      case 'archive-note':
        handleArchiveFromMenu();
        break;

      // Font size actions (context-aware: reader zoom for PDF/EPUB, font size otherwise)
      case 'font-size-increase':
        if (isActiveNoteEpub || isActiveNotePdf) {
          window.dispatchEvent(
            new CustomEvent('reader-zoom', { detail: { direction: 'increase' } })
          );
        } else {
          const currentSize = settingsStore.settings.appearance.fontSize ?? 16;
          const newSize = Math.min(currentSize + 2, 24);
          handleFontSizeChange(newSize);
        }
        break;
      case 'font-size-decrease':
        if (isActiveNoteEpub || isActiveNotePdf) {
          window.dispatchEvent(
            new CustomEvent('reader-zoom', { detail: { direction: 'decrease' } })
          );
        } else {
          const currentSize = settingsStore.settings.appearance.fontSize ?? 16;
          const newSize = Math.max(currentSize - 2, 12);
          handleFontSizeChange(newSize);
        }
        break;
      case 'font-size-reset':
        if (isActiveNoteEpub || isActiveNotePdf) {
          window.dispatchEvent(
            new CustomEvent('reader-zoom', { detail: { direction: 'reset' } })
          );
        } else {
          handleFontSizeChange(16);
        }
        break;

      // Reader actions
      case 'reader-prev':
        // Dispatch a custom event for readers to handle
        window.dispatchEvent(
          new CustomEvent('reader-navigate', { detail: { direction: 'prev' } })
        );
        break;
      case 'reader-next':
        window.dispatchEvent(
          new CustomEvent('reader-navigate', { detail: { direction: 'next' } })
        );
        break;
      case 'reader-zoom-increase':
        window.dispatchEvent(
          new CustomEvent('reader-zoom', { detail: { direction: 'increase' } })
        );
        break;
      case 'reader-zoom-decrease':
        window.dispatchEvent(
          new CustomEvent('reader-zoom', { detail: { direction: 'decrease' } })
        );
        break;
      case 'reader-zoom-reset':
        window.dispatchEvent(
          new CustomEvent('reader-zoom', { detail: { direction: 'reset' } })
        );
        break;

      // Help actions
      case 'show-changelog':
        showChangelogModal = true;
        break;
      case 'check-updates':
        window.api?.checkForUpdates();
        break;
      case 'show-about':
        // Could show an about modal
        break;
    }
  }

  // Check if app was upgraded and show changelog
  async function checkForUpgrade(): Promise<void> {
    try {
      const versionInfo = await window.api?.getAppVersion();
      if (!versionInfo) return;

      const { version, channel } = versionInfo;
      const isCanary = channel === 'canary';
      const lastSeen = settingsStore.getLastSeenVersion(isCanary);

      // Only show modal if there's a previous version and it's different
      if (lastSeen && lastSeen !== version) {
        showChangelogModal = true;
      }

      // Update last seen version
      await settingsStore.updateLastSeenVersion(version, isCanary);
    } catch (err) {
      console.warn('Failed to check for upgrade:', err);
    }
  }

  // Set up menu event listeners
  onMount(() => {
    const cleanupNavigate = window.api?.onMenuNavigate(handleMenuNavigate);
    const cleanupAction = window.api?.onMenuAction(handleMenuAction);

    // Check for upgrade and show changelog if needed
    checkForUpgrade();

    return () => {
      cleanupNavigate?.();
      cleanupAction?.();
    };
  });

  // Update menu state when active note changes
  $effect(() => {
    const hasNote = activeNote !== null;
    window.api?.setMenuActiveNote(hasNote);
  });

  // Update menu state when epub viewer is active
  $effect(() => {
    window.api?.setMenuActiveEpub(isActiveNoteEpub);
  });

  // Update menu state when pdf viewer is active
  $effect(() => {
    window.api?.setMenuActivePdf(isActiveNotePdf);
  });

  // Update menu state when workspaces change
  $effect(() => {
    const workspaces = getWorkspaces();
    const workspace = getActiveWorkspace();
    if (workspace) {
      window.api?.setMenuWorkspaces({
        workspaces: workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          icon: w.icon
        })),
        activeWorkspaceId: workspace.id
      });
    }
  });

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
      onCaptureWebpage={() => {
        showArchiveWebpageModal = true;
      }}
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
          <Tooltip text="Toggle sidebar (⌘B)" position="bottom">
            <button
              class="floating-sidebar-toggle"
              onclick={toggleLeftSidebar}
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
        <UpdateWidget />
        <div class="safe-zone-actions">
          {#if activeItem}
            <!-- Pin button -->
            <Tooltip text={isPinned ? 'Unpin' : 'Pin'} position="bottom">
              <button
                class="safe-zone-button"
                class:active={isPinned}
                onclick={() => (isPinned ? handleUnpin() : handlePin())}
                aria-label={isPinned ? 'Unpin' : 'Pin'}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill={isPinned ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M12 17v5"></path>
                  <path
                    d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
                  ></path>
                </svg>
              </button>
            </Tooltip>
            <!-- Shelf button -->
            <Tooltip text={isOnShelf ? 'On Shelf' : 'Add to Shelf'} position="bottom">
              <button
                class="safe-zone-button"
                class:on-shelf={isOnShelf}
                onclick={handleAddToShelf}
                disabled={isOnShelf}
                aria-label={isOnShelf ? 'On Shelf' : 'Add to Shelf'}
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
            </Tooltip>
          {/if}
          {#if activeNote}
            <Tooltip text="More options" position="bottom">
              <button
                class="more-menu-button"
                onclick={handleMoreButtonClick}
                aria-label="More options"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2"></circle>
                  <circle cx="12" cy="12" r="2"></circle>
                  <circle cx="12" cy="19" r="2"></circle>
                </svg>
              </button>
            </Tooltip>
          {/if}
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

              <div class="settings-divider"></div>

              <!-- About / Version -->
              <AboutSettings onShowChangelog={() => (showChangelogModal = true)} />

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
                  sidebarState.openPanel('chat');
                }
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
                onUnarchive={() => handleUnarchiveNote(activeNote.id)}
              />
            {:else}
              <NoteEditor
                note={activeNote}
                previewMode={isPreviewMode}
                onTitleChange={(title) => updateNote(activeNote.id, { title })}
                onArchive={() => handleArchiveNote(activeNote.id)}
                onUnarchive={() => handleUnarchiveNote(activeNote.id)}
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

    <!-- Right Sidebar (expanded panel container) -->
    {#if rightSidebarExpanded && (chatPanelOpen || shelfPanelOpen)}
      <div
        class="right-sidebar"
        class:resizing={rightSidebarLocalWidth !== null}
        style="--sidebar-width: {currentRightSidebarWidth}px"
      >
        <ResizeHandle
          side="right"
          onResize={handleRightSidebarResize}
          minWidth={300}
          maxWidth={600}
        />
        <div class="right-sidebar-inner">
          {#if chatPanelOpen}
            <ChatPanel
              isOpen={true}
              isExpanded={true}
              onClose={() => sidebarState.closePanel()}
              onToggleExpand={togglePanelExpanded}
              onGoToSettings={() => {
                setActiveSystemView('settings');
                sidebarState.closePanel();
              }}
              initialMessage={pendingChatMessage ?? undefined}
              onInitialMessageConsumed={() => (pendingChatMessage = null)}
              onSwitchToShelf={() => sidebarState.openPanel('shelf')}
            />
          {:else if shelfPanelOpen}
            <ShelfPanel
              isOpen={true}
              isExpanded={true}
              onClose={() => sidebarState.closePanel()}
              onToggleExpand={togglePanelExpanded}
              onNavigate={(type, id) => {
                setActiveItem({ type, id });
                addItemToWorkspace({ type, id });
                setActiveSystemView(null);
                sidebarState.closePanel();
              }}
              onSwitchToChat={() => sidebarState.openPanel('chat')}
            />
          {/if}
        </div>
      </div>
    {/if}
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
    <div class="modal create-vault-modal" onclick={(e) => e.stopPropagation()}>
      <h3>Create New Vault</h3>
      <div class="create-vault-scroll">
        <input
          type="text"
          class="modal-input"
          placeholder="Vault name"
          bind:value={newVaultName}
          onkeydown={(e) => e.key === 'Enter' && submitCreateVault()}
        />
        <div class="sync-directory-section">
          <span class="sync-label">Sync to folder (optional)</span>
          {#if newVaultSyncDirectory}
            <div class="sync-directory-selected">
              <span class="sync-path" title={newVaultSyncDirectory}
                >{newVaultSyncDirectory}</span
              >
              <button
                class="sync-clear-btn"
                onclick={() => (newVaultSyncDirectory = null)}
                title="Remove sync folder"
              >
                ✕
              </button>
            </div>
          {:else}
            <button class="modal-btn secondary" onclick={handleSelectSyncDirectory}>
              Choose Folder...
            </button>
          {/if}
        </div>

        <!-- Template selection -->
        <div class="template-section">
          <span class="section-label">Choose a template</span>
          <div class="template-options">
            {#each VAULT_TEMPLATES as template (template.id)}
              <button
                class="template-card"
                class:selected={newVaultTemplateId === template.id}
                onclick={() => (newVaultTemplateId = template.id)}
                type="button"
              >
                <span class="template-icon">{template.icon}</span>
                <span class="template-name">{template.name}</span>
                <span class="template-desc">{template.description}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- Onboarding options -->
        <div class="onboarding-section">
          <span class="section-label">Include starter content (optional)</span>
          <div class="onboarding-options">
            {#each ONBOARDING_OPTIONS as option (option.id)}
              <label class="onboarding-option">
                <input
                  type="checkbox"
                  checked={newVaultOnboardingIds.includes(option.id)}
                  onchange={() => toggleNewVaultOnboarding(option.id)}
                />
                <span class="option-icon">{option.icon}</span>
                <div class="option-text">
                  <span class="option-name">{option.name}</span>
                  <span class="option-desc">{option.description}</span>
                </div>
              </label>
            {/each}
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="modal-btn cancel" onclick={() => (showCreateVaultModal = false)}
          >Cancel</button
        >
        <button class="modal-btn primary" onclick={submitCreateVault}>Create</button>
      </div>
      <div class="modal-divider"><span>or</span></div>
      <button class="modal-btn secondary full-width" onclick={handleBrowseForVault}>
        Open Vault from Directory
      </button>
    </div>
  </div>
{/if}

<!-- FAB Menu and Panels -->
<FABMenu
  chatOpen={chatPanelOpen}
  shelfOpen={shelfPanelOpen}
  onToggleChat={() => sidebarState.togglePanel('chat')}
  onToggleShelf={() => sidebarState.togglePanel('shelf')}
  autoHide={isActiveNoteEpub || isActiveNotePdf}
/>

<!-- Floating panels (only when not expanded) -->
{#if !rightSidebarExpanded}
  <ChatPanel
    isOpen={chatPanelOpen}
    isExpanded={false}
    onClose={() => sidebarState.closePanel()}
    onToggleExpand={togglePanelExpanded}
    onGoToSettings={() => {
      setActiveSystemView('settings');
      sidebarState.closePanel();
    }}
    initialMessage={pendingChatMessage ?? undefined}
    onInitialMessageConsumed={() => (pendingChatMessage = null)}
    onSwitchToShelf={() => sidebarState.openPanel('shelf')}
  />

  <ShelfPanel
    isOpen={shelfPanelOpen}
    isExpanded={false}
    onClose={() => sidebarState.closePanel()}
    onToggleExpand={togglePanelExpanded}
    onNavigate={(type, id) => {
      setActiveItem({ type, id });
      addItemToWorkspace({ type, id });
      setActiveSystemView(null);
      sidebarState.closePanel();
    }}
    onSwitchToChat={() => sidebarState.openPanel('chat')}
  />
{/if}

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

<!-- Changelog Modal -->
<ChangelogModal
  isOpen={showChangelogModal}
  onClose={() => (showChangelogModal = false)}
/>

<!-- Legacy Vault Migration Progress Overlay -->
{#if isMigratingLegacyVault && migratingVault}
  <div class="migration-overlay">
    <div class="migration-modal">
      <div class="migration-icon">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2l5 0 2 3h9a2 2 0 0 1 2 2z"
          />
        </svg>
      </div>
      <h3>Importing "{migratingVault.name}"</h3>
      {#if migrationProgress}
        <p class="migration-message">{migrationProgress.message}</p>
        <div class="progress-bar-container">
          <div
            class="progress-bar"
            style="width: {migrationProgress.total > 0
              ? (migrationProgress.current / migrationProgress.total) * 100
              : 0}%"
          ></div>
        </div>
        <p class="migration-phase">{migrationProgress.phase}</p>
      {:else}
        <p class="migration-message">Starting migration...</p>
        <div class="progress-bar-container">
          <div class="progress-bar indeterminate"></div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Migration Error Modal -->
{#if migrationError}
  <div class="migration-overlay">
    <div class="migration-modal error">
      <div class="migration-icon error">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6" />
          <path d="m9 9 6 6" />
        </svg>
      </div>
      <h3>Import Failed</h3>
      <p class="migration-error-message">{migrationError}</p>
      <button class="dismiss-button" onclick={dismissMigrationError}>Dismiss</button>
    </div>
  </div>
{/if}

<!-- Note Actions Menu -->
{#if activeNote}
  <NoteActionsMenu
    bind:visible={moreMenuOpen}
    x={moreMenuPosition.x}
    y={moreMenuPosition.y}
    {isPinned}
    {isOnShelf}
    {isPreviewMode}
    {isReviewEnabled}
    isArchived={activeNote.archived}
    showPreviewMode={!isActiveNoteDeck &&
      !isActiveNoteEpub &&
      !isActiveNotePdf &&
      !isActiveNoteWebpage}
    showShowInFinder={!!getActiveVault()?.baseDirectory}
    onClose={() => (moreMenuOpen = false)}
    onPin={handlePin}
    onUnpin={handleUnpin}
    onAddToShelf={handleAddToShelf}
    onTogglePreview={handleTogglePreview}
    onToggleReview={handleToggleReview}
    onArchive={handleArchiveFromMenu}
    onUnarchive={handleUnarchiveFromMenu}
    onShowInFinder={handleShowInFinder}
  />
{/if}

<!-- Workspace Modal -->
{#if showWorkspaceModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="modal-overlay"
    onclick={() => (showWorkspaceModal = false)}
    onkeydown={(e) => e.key === 'Escape' && (showWorkspaceModal = false)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h3>{editingWorkspaceId ? 'Edit Workspace' : 'New Workspace'}</h3>
      <div class="workspace-form">
        <div class="workspace-form-row">
          <input
            type="text"
            class="icon-input"
            placeholder="Icon"
            bind:value={workspaceModalIcon}
            maxlength="2"
          />
          <input
            type="text"
            class="modal-input flex-1"
            placeholder="Workspace name"
            bind:value={workspaceModalName}
            onkeydown={(e) => e.key === 'Enter' && handleWorkspaceModalSubmit()}
          />
        </div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick={() => (showWorkspaceModal = false)}
          >Cancel</button
        >
        <button
          class="modal-btn primary"
          onclick={handleWorkspaceModalSubmit}
          disabled={!workspaceModalName.trim()}
        >
          {editingWorkspaceId ? 'Save' : 'Create'}
        </button>
      </div>
    </div>
  </div>
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

  .safe-zone-button.on-shelf,
  .safe-zone-button.active {
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

  /* Right Sidebar */
  .right-sidebar {
    position: relative;
    height: 100%;
    background: var(--bg-primary);
    border-left: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    flex-shrink: 0;
    transition:
      width 0.2s ease-out,
      min-width 0.2s ease-out;
  }

  .right-sidebar.resizing {
    transition: none;
  }

  .right-sidebar-inner {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    position: relative;
    z-index: 0; /* Below resize handle (z-index: 100) */
  }

  /* Scroll container - full width, handles scrolling */
  .scroll-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0; /* Important for flex child with overflow */
  }

  /* Disable scrolling for PDF/EPUB viewers that handle their own scrolling */
  .scroll-container.no-scroll {
    overflow: hidden;
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

  .modal-btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-btn.secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
  }

  .modal-btn.secondary:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  .modal-btn.full-width {
    width: 100%;
    justify-content: center;
  }

  .modal-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1rem 0;
    color: var(--text-tertiary);
    font-size: 0.8rem;
  }

  .modal-divider::before,
  .modal-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-light);
  }

  /* Sync Directory Section */
  .sync-directory-section {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sync-label {
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .sync-directory-selected {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg-tertiary);
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border-light);
  }

  .sync-path {
    flex: 1;
    font-size: 0.8125rem;
    font-family: var(--font-mono);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sync-clear-btn {
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    padding: 0.25rem;
    font-size: 0.75rem;
    line-height: 1;
    border-radius: 0.25rem;
  }

  .sync-clear-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* Create Vault Modal */
  .create-vault-modal {
    max-width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .create-vault-scroll {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .section-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  .template-section {
    margin-top: 1rem;
  }

  .template-options {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .template-card {
    flex: 1;
    min-width: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 0.75rem 0.5rem;
    background: var(--bg-secondary);
    border: 2px solid var(--border-light);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .template-card:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  .template-card.selected {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .template-icon {
    font-size: 1.25rem;
  }

  .template-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.8rem;
  }

  .template-desc {
    font-size: 0.7rem;
    color: var(--text-secondary);
    line-height: 1.2;
  }

  .onboarding-section {
    margin-top: 1rem;
  }

  .onboarding-options {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .onboarding-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .onboarding-option:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  .onboarding-option input[type='checkbox'] {
    width: 0.875rem;
    height: 0.875rem;
    accent-color: var(--accent-primary);
    flex-shrink: 0;
  }

  .option-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .option-text {
    display: flex;
    flex-direction: column;
    gap: 0.0625rem;
    text-align: left;
  }

  .option-name {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.8rem;
  }

  .option-desc {
    font-size: 0.7rem;
    color: var(--text-secondary);
  }

  /* Workspace Form */
  .workspace-form {
    margin-bottom: 1rem;
  }

  .workspace-form-row {
    display: flex;
    gap: 0.5rem;
  }

  .icon-input {
    width: 3rem;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 1rem;
    text-align: center;
    outline: none;
  }

  .icon-input:focus {
    border-color: var(--accent-primary);
  }

  .flex-1 {
    flex: 1;
  }

  /* Migration Overlay */
  .migration-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .migration-modal {
    background: var(--bg-primary);
    border-radius: 1rem;
    padding: 2rem;
    max-width: 400px;
    width: 90%;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    animation: fadeInUp 0.2s ease-out;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .migration-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-light);
    border-radius: 50%;
    color: var(--accent-primary);
    animation: pulse 2s ease-in-out infinite;
  }

  .migration-icon.error {
    background: var(--error-bg, #fee);
    color: var(--error-text, #dc2626);
    animation: none;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.05);
    }
  }

  .migration-modal h3 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .migration-modal.error h3 {
    color: var(--error-text, #dc2626);
  }

  .migration-message {
    margin: 0 0 1rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .migration-error-message {
    margin: 0 0 1.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    word-break: break-word;
  }

  .migration-phase {
    margin: 0.5rem 0 0;
    color: var(--text-muted);
    font-size: 0.75rem;
    text-transform: capitalize;
  }

  .progress-bar-container {
    width: 100%;
    height: 6px;
    background: var(--bg-tertiary, var(--bg-secondary));
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--accent-primary);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-bar.indeterminate {
    width: 30%;
    animation: indeterminate 1.5s ease-in-out infinite;
  }

  @keyframes indeterminate {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(400%);
    }
  }

  .dismiss-button {
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: var(--accent-text, white);
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .dismiss-button:hover {
    background: var(--accent-primary-hover, var(--accent-primary));
  }
</style>
