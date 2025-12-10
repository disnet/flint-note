<script lang="ts">
  /**
   * Main view component using Automerge for data storage
   * Contains the sidebar, note list, editor, and workspace management
   */
  import {
    getNotes,
    getNoteTypes,
    getWorkspaces,
    getActiveWorkspace,
    getOpenNotes,
    getActiveNoteId,
    getActiveNote,
    setActiveNoteId,
    createNote,
    updateNote,
    archiveNote,
    addNoteToWorkspace,
    removeNoteFromWorkspace,
    setActiveWorkspace,
    createWorkspace,
    searchNotes,
    type Note
  } from '../lib/automerge';
  import AutomergeNoteEditor from './AutomergeNoteEditor.svelte';
  import { settingsStore } from '../stores/settingsStore.svelte';

  // Derived state
  const notes = $derived(getNotes());
  const workspaces = $derived(getWorkspaces());
  const activeWorkspace = $derived(getActiveWorkspace());
  const openNotes = $derived(getOpenNotes());
  const activeNoteId = $derived(getActiveNoteId());
  const activeNote = $derived(getActiveNote());

  // UI state
  let searchQuery = $state('');
  let showSettings = $state(false);

  // Search results
  const searchResults = $derived(searchQuery.trim() ? searchNotes(searchQuery) : []);

  // Handlers
  function handleNoteSelect(note: Note): void {
    setActiveNoteId(note.id);
    addNoteToWorkspace(note.id);
  }

  function handleCreateNote(): void {
    const id = createNote({ title: '', content: '' });
    setActiveNoteId(id);
  }

  function handleCloseNote(noteId: string): void {
    const nextId = removeNoteFromWorkspace(noteId);
    if (activeNoteId === noteId) {
      setActiveNoteId(nextId);
    }
  }

  function handleArchiveNote(noteId: string): void {
    archiveNote(noteId);
  }

  function handleWorkspaceSelect(workspaceId: string): void {
    setActiveWorkspace(workspaceId);
    setActiveNoteId(null);
  }

  function handleCreateWorkspace(): void {
    const name = prompt('Enter workspace name:');
    if (name?.trim()) {
      createWorkspace({ name: name.trim(), icon: '📋' });
    }
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
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="main-view">
  <!-- Title Bar -->
  <div class="title-bar">
    <div class="title-bar-content">
      <div class="title-bar-left">
        <span class="app-title">Flint</span>
      </div>
      <div class="title-bar-center">
        <div class="search-container">
          <input
            id="search-input"
            type="text"
            class="search-input"
            placeholder="Search notes... (⌘K)"
            bind:value={searchQuery}
          />
          {#if searchQuery && searchResults.length > 0}
            <div class="search-results">
              {#each searchResults.slice(0, 10) as note (note.id)}
                <button
                  class="search-result-item"
                  onclick={() => {
                    handleNoteSelect(note);
                    searchQuery = '';
                  }}
                >
                  <span class="result-title">{note.title || 'Untitled'}</span>
                  <span class="result-type"
                    >{getNoteTypes().find((t) => t.id === note.type)?.name ||
                      'Note'}</span
                  >
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <div class="title-bar-right">
        <button
          class="settings-btn"
          onclick={() => (showSettings = !showSettings)}
          title="Settings"
        >
          ⚙️
        </button>
      </div>
    </div>
  </div>

  <!-- Main Layout -->
  <div class="app-layout">
    <!-- Left Sidebar -->
    <div class="left-sidebar">
      <!-- Workspaces -->
      <div class="workspaces-section">
        <div class="section-header">
          <span>Workspaces</span>
          <button class="add-btn" onclick={handleCreateWorkspace} title="New workspace"
            >+</button
          >
        </div>
        <div class="workspace-list">
          {#each workspaces as workspace (workspace.id)}
            <button
              class="workspace-item"
              class:active={activeWorkspace?.id === workspace.id}
              onclick={() => handleWorkspaceSelect(workspace.id)}
            >
              <span class="workspace-icon">{workspace.icon}</span>
              <span class="workspace-name">{workspace.name}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Open Notes -->
      <div class="open-notes-section">
        <div class="section-header">
          <span>Open Notes</span>
          <button class="add-btn" onclick={handleCreateNote} title="New note">+</button>
        </div>
        <div class="note-list">
          {#each openNotes as note (note.id)}
            <div class="note-item" class:active={activeNoteId === note.id}>
              <button class="note-item-button" onclick={() => setActiveNoteId(note.id)}>
                {note.title || 'Untitled'}
              </button>
              <button
                class="close-note-btn"
                onclick={() => handleCloseNote(note.id)}
                title="Close note"
              >
                ×
              </button>
            </div>
          {/each}
          {#if openNotes.length === 0}
            <div class="empty-state">No open notes</div>
          {/if}
        </div>
      </div>

      <!-- All Notes -->
      <div class="all-notes-section">
        <div class="section-header">
          <span>All Notes ({notes.length})</span>
        </div>
        <div class="note-list scrollable">
          {#each notes.slice(0, 50) as note (note.id)}
            <button
              class="note-item-button"
              class:active={activeNoteId === note.id}
              onclick={() => handleNoteSelect(note)}
            >
              <span class="note-title">{note.title || 'Untitled'}</span>
              <span class="note-date">{new Date(note.updated).toLocaleDateString()}</span>
            </button>
          {/each}
          {#if notes.length === 0}
            <div class="empty-state">No notes yet. Create your first note!</div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      {#if showSettings}
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
          <button class="close-settings" onclick={() => (showSettings = false)}
            >Close</button
          >
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

  .app-title {
    font-weight: 600;
    color: var(--text-primary);
    margin-left: 80px; /* Space for traffic lights on macOS */
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

  .search-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    margin-top: 0.25rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 100;
    max-height: 300px;
    overflow-y: auto;
  }

  .search-result-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: none;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
  }

  .search-result-item:hover {
    background: var(--bg-hover);
  }

  .result-title {
    font-weight: 500;
  }

  .result-type {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .settings-btn {
    padding: 0.25rem 0.5rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 1rem;
    -webkit-app-region: no-drag;
  }

  /* App Layout */
  .app-layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  /* Left Sidebar */
  .left-sidebar {
    width: 260px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .add-btn {
    padding: 0.125rem 0.375rem;
    border: none;
    background: var(--bg-tertiary);
    border-radius: 0.25rem;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .add-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .workspaces-section {
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-light);
  }

  .workspace-list {
    padding: 0 0.5rem 0.5rem;
  }

  .workspace-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: none;
    border-radius: 0.375rem;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
  }

  .workspace-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .workspace-item.active {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .workspace-icon {
    font-size: 1rem;
  }

  .workspace-name {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .open-notes-section {
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-light);
    max-height: 200px;
    overflow-y: auto;
  }

  .all-notes-section {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .note-list {
    padding: 0 0.5rem 0.5rem;
  }

  .note-list.scrollable {
    flex: 1;
    overflow-y: auto;
  }

  .note-item {
    display: flex;
    align-items: center;
    border-radius: 0.375rem;
  }

  .note-item.active {
    background: var(--bg-tertiary);
  }

  .note-item-button {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: none;
    border-radius: 0.375rem;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
    font-size: 0.875rem;
  }

  .note-item-button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .note-item-button.active {
    color: var(--text-primary);
  }

  .note-title {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .note-date {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .close-note-btn {
    padding: 0.25rem 0.5rem;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .note-item:hover .close-note-btn {
    opacity: 1;
  }

  .close-note-btn:hover {
    color: var(--text-primary);
  }

  .empty-state {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* Main Content */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
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
    color: var(--accent-text);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
  }

  .create-note-btn:hover {
    background: var(--accent-primary-hover);
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
    background: var(--bg-tertiary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    color: var(--text-primary);
    cursor: pointer;
  }
</style>
