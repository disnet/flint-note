<script lang="ts">
  /**
   * Main view component using Automerge for data storage
   * Contains the left sidebar, note list/editor, and workspace management
   */
  import {
    getNotes,
    getAllNotes,
    getNoteTypes,
    getActiveNoteId,
    getActiveNote,
    setActiveNoteId,
    createNote,
    updateNote,
    archiveNote,
    addNoteToWorkspace,
    getNonArchivedVaults,
    getActiveVault,
    createVault,
    switchVault,
    searchNotesEnhanced,
    type Note,
    type SearchResult
  } from '../lib/automerge';
  import AutomergeLeftSidebar from './AutomergeLeftSidebar.svelte';
  import AutomergeNoteEditor from './AutomergeNoteEditor.svelte';
  import AutomergeSearchResults from './AutomergeSearchResults.svelte';
  import AutomergeNoteTypesView from './AutomergeNoteTypesView.svelte';
  import { settingsStore } from '../stores/settingsStore.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';

  // Derived state
  const notes = $derived(getNotes());
  const allNotes = $derived(getAllNotes());
  const noteTypes = $derived(getNoteTypes());
  const activeNoteId = $derived(getActiveNoteId());
  const activeNote = $derived(getActiveNote());
  const vaults = $derived(getNonArchivedVaults());
  const activeVault = $derived(getActiveVault());

  // Build note types record for search
  const noteTypesRecord = $derived(Object.fromEntries(noteTypes.map((t) => [t.id, t])));

  // UI state
  let searchQuery = $state('');
  let activeSystemView = $state<'notes' | 'settings' | 'search' | 'types' | null>(null);
  let showCreateVaultModal = $state(false);
  let newVaultName = $state('');
  let searchInputFocused = $state(false);
  let selectedNoteTypeId = $state<string | null>(null);

  // Enhanced search results with highlighting
  const searchResults: SearchResult[] = $derived(
    searchQuery.trim()
      ? searchNotesEnhanced(allNotes, searchQuery, { noteTypes: noteTypesRecord })
      : []
  );

  // Handlers
  function handleNoteSelect(note: Note): void {
    setActiveNoteId(note.id);
    addNoteToWorkspace(note.id);
    activeSystemView = null; // Clear system view when selecting a note
    searchQuery = ''; // Clear search when selecting a note
    searchInputFocused = false;
  }

  function handleSearchResultSelect(note: Note): void {
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
      (event.target as HTMLInputElement)?.blur();
    }
    // Enter opens the dedicated search view if there are results
    if (event.key === 'Enter' && searchQuery.trim() && searchResults.length > 0) {
      activeSystemView = 'search';
      setActiveNoteId(null);
    }
  }

  function handleCreateNote(): void {
    const id = createNote({ title: '', content: '' });
    setActiveNoteId(id);
    activeSystemView = null;
  }

  function handleArchiveNote(noteId: string): void {
    archiveNote(noteId);
  }

  function handleSystemViewSelect(view: 'notes' | 'settings' | 'types' | null): void {
    activeSystemView = view;
    if (view) {
      setActiveNoteId(null); // Clear active note when viewing system views
    }
    // Reset selected note type when leaving types view
    if (view !== 'types') {
      selectedNoteTypeId = null;
    }
  }

  function handleNoteTypeSelect(typeId: string | null): void {
    selectedNoteTypeId = typeId;
  }

  function handleNoteSelectFromTypes(_noteId: string): void {
    // Navigate to the note from the types view
    // The note is already selected via setActiveNoteId in the NoteTypesView
    activeSystemView = null;
    selectedNoteTypeId = null;
  }

  async function handleVaultSelect(vaultId: string): Promise<void> {
    await switchVault(vaultId);
    setActiveNoteId(null);
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
  function handleKeyDown(event: KeyboardEvent): void {
    // Cmd/Ctrl + N: New note
    if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
      event.preventDefault();
      handleCreateNote();
    }
    // Cmd/Ctrl + K: Focus search
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      const searchInput = document.getElementById('search-input');
      searchInput?.focus();
    }
    // Cmd/Ctrl + B: Toggle sidebar
    if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
      event.preventDefault();
      toggleLeftSidebar();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="main-view">
  <!-- Title Bar -->
  <div class="title-bar">
    <div class="title-bar-content">
      <div class="title-bar-left">
        <button
          class="sidebar-toggle"
          onclick={toggleLeftSidebar}
          title="Toggle sidebar (⌘B)"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <line x1="9" y1="3" x2="9" y2="21"></line>
          </svg>
        </button>
        <span class="app-title">Flint</span>
      </div>
      <div class="title-bar-center">
        <div class="search-container">
          <input
            id="search-input"
            type="text"
            class="search-input"
            class:active={searchInputFocused && searchQuery.trim()}
            placeholder="Search notes... (⌘K)"
            bind:value={searchQuery}
            onfocus={handleSearchFocus}
            onblur={handleSearchBlur}
            onkeydown={handleSearchKeyDown}
          />
          {#if searchInputFocused && searchQuery.trim()}
            <div class="search-dropdown">
              {#if searchResults.length > 0}
                <AutomergeSearchResults
                  results={searchResults}
                  onSelect={handleSearchResultSelect}
                  maxResults={8}
                />
                {#if searchResults.length > 8}
                  <button
                    class="view-all-btn"
                    onclick={() => {
                      activeSystemView = 'search';
                      setActiveNoteId(null);
                    }}
                  >
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
      <div class="title-bar-right">
        <!-- Vault Switcher -->
        {#if vaults.length > 1}
          <div class="vault-switcher">
            <select
              class="vault-select"
              value={activeVault?.id}
              onchange={(e) => handleVaultSelect((e.target as HTMLSelectElement).value)}
            >
              {#each vaults as vault (vault.id)}
                <option value={vault.id}>{vault.name}</option>
              {/each}
            </select>
          </div>
        {/if}
        <button class="add-vault-btn" onclick={handleCreateVault} title="New vault">
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
        </button>
      </div>
    </div>
  </div>

  <!-- Main Layout -->
  <div class="app-layout">
    <!-- Left Sidebar -->
    <AutomergeLeftSidebar
      {activeSystemView}
      onNoteSelect={handleNoteSelect}
      onSystemViewSelect={handleSystemViewSelect}
      onCreateNote={handleCreateNote}
    />

    <!-- Main Content -->
    <div class="main-content">
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
          <button class="close-settings" onclick={() => (activeSystemView = null)}
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
              onclick={() => (activeSystemView = null)}
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
            <AutomergeSearchResults
              results={searchResults}
              onSelect={handleSearchResultSelect}
              maxResults={50}
            />
          </div>
        </div>
      {:else if activeSystemView === 'types'}
        <!-- Note Types View -->
        <AutomergeNoteTypesView
          selectedTypeId={selectedNoteTypeId}
          onTypeSelect={handleNoteTypeSelect}
          onNoteSelect={handleNoteSelectFromTypes}
        />
      {:else if activeSystemView === 'notes'}
        <!-- All Notes View -->
        <div class="all-notes-view">
          <div class="all-notes-header">
            <h2>All Notes ({notes.length})</h2>
            <button class="create-btn" onclick={handleCreateNote}>
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
              New Note
            </button>
          </div>
          <div class="notes-grid">
            {#each notes as note (note.id)}
              <button
                class="note-card"
                class:active={activeNoteId === note.id}
                onclick={() => handleNoteSelect(note)}
              >
                <div class="note-card-icon">
                  {getNoteTypes().find((t) => t.id === note.type)?.icon || '📝'}
                </div>
                <div class="note-card-content">
                  <span class="note-card-title">{note.title || 'Untitled'}</span>
                  <span class="note-card-preview"
                    >{note.content.slice(0, 100) || 'No content'}</span
                  >
                  <span class="note-card-date"
                    >{new Date(note.updated).toLocaleDateString()}</span
                  >
                </div>
              </button>
            {/each}
            {#if notes.length === 0}
              <div class="empty-notes">
                <p>No notes yet</p>
                <button class="create-first-btn" onclick={handleCreateNote}>
                  Create your first note
                </button>
              </div>
            {/if}
          </div>
        </div>
      {:else if activeNote}
        <AutomergeNoteEditor
          note={activeNote}
          onTitleChange={(title) => updateNote(activeNote.id, { title })}
          onContentChange={(content) => updateNote(activeNote.id, { content })}
          onArchive={() => handleArchiveNote(activeNote.id)}
        />
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

<style>
  .main-view {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  /* Title Bar */
  .title-bar {
    height: 38px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
    -webkit-app-region: drag;
    user-select: none;
    flex-shrink: 0;
  }

  .title-bar-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
    padding: 0 1rem;
  }

  .title-bar-left,
  .title-bar-right {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .title-bar-right {
    justify-content: flex-end;
  }

  .title-bar-center {
    flex: 2;
    display: flex;
    justify-content: center;
    -webkit-app-region: no-drag;
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
    margin-left: 70px; /* Space for traffic lights on macOS */
  }

  .sidebar-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .app-title {
    font-weight: 600;
    color: var(--text-primary);
  }

  .search-container {
    position: relative;
    width: 100%;
    max-width: 400px;
  }

  .search-input {
    width: 100%;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
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
    font-size: 0.875rem;
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

  .vault-switcher {
    -webkit-app-region: no-drag;
  }

  .vault-select {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.75rem;
    cursor: pointer;
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
  }

  .add-vault-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* App Layout */
  .app-layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  /* Main Content */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
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

  /* All Notes View */
  .all-notes-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 1.5rem;
  }

  .all-notes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }

  .all-notes-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .create-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: var(--accent-primary);
    color: var(--accent-text, white);
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .create-btn:hover {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  .notes-grid {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
    align-content: start;
  }

  .note-card {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    cursor: pointer;
    text-align: left;
    transition: all 0.2s ease;
  }

  .note-card:hover {
    border-color: var(--border-medium);
    background: var(--bg-hover);
  }

  .note-card.active {
    border-color: var(--accent-primary);
    background: var(--accent-light);
  }

  .note-card-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .note-card-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .note-card-title {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .note-card-preview {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .note-card-date {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  .empty-notes {
    grid-column: 1 / -1;
    text-align: center;
    padding: 3rem;
    color: var(--text-secondary);
  }

  .empty-notes p {
    margin: 0 0 1rem;
  }

  .create-first-btn {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-primary);
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .create-first-btn:hover {
    background: var(--bg-hover);
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

  .close-settings {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--bg-tertiary, var(--bg-hover));
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    color: var(--text-primary);
    cursor: pointer;
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
</style>
