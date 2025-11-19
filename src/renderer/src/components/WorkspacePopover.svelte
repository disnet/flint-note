<script lang="ts">
  import { workspacesStore } from '../stores/workspacesStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';
  import EmojiPicker from './EmojiPicker.svelte';

  interface Props {
    onCreateNote?: (noteType?: string) => void;
    onClose: () => void;
    editingWorkspaceId?: string | null;
  }

  let { onCreateNote, onClose, editingWorkspaceId = null }: Props = $props();

  // State
  let isTypeDropdownOpen = $state(false);
  let isCreatingWorkspace = $state(false);
  let isEditingWorkspace = $state(false);

  // Note type search
  let noteTypeSearchQuery = $state('');
  let noteTypeSearchInputRef = $state<HTMLInputElement | null>(null);
  let highlightedNoteTypeIndex = $state(0);

  // New workspace form
  let newWorkspaceName = $state('');
  let newWorkspaceIcon = $state('📁');
  let newWorkspaceColor = $state('');

  // Edit workspace form
  let editWorkspaceName = $state('');
  let editWorkspaceIcon = $state('');
  let editWorkspaceColor = $state('');

  const activeWorkspace = $derived(workspacesStore.activeWorkspace);

  // Detect platform for keyboard shortcut display
  const isMac = $derived(navigator.platform.toLowerCase().includes('mac'));
  const modifierKey = $derived(isMac ? '⌘' : 'Ctrl');

  // Filtered note types based on search
  const filteredNoteTypes = $derived.by(() => {
    if (!noteTypeSearchQuery.trim()) {
      return notesStore.noteTypes;
    }
    const query = noteTypeSearchQuery.toLowerCase().trim();
    return notesStore.noteTypes.filter((noteType) =>
      noteType.name.toLowerCase().includes(query)
    );
  });

  // Initialize edit mode if editingWorkspaceId is provided
  $effect(() => {
    if (editingWorkspaceId) {
      const workspace = workspacesStore.workspaces.find(
        (w) => w.id === editingWorkspaceId
      );
      if (workspace) {
        editWorkspaceName = workspace.name;
        editWorkspaceIcon = workspace.icon;
        editWorkspaceColor = workspace.color || '';
        isEditingWorkspace = true;
      }
    }
  });

  function handleCreateNote(noteType?: string): void {
    if (onCreateNote) {
      onCreateNote(noteType);
    }
    onClose();
  }

  function toggleTypeDropdown(): void {
    isTypeDropdownOpen = !isTypeDropdownOpen;
    if (isTypeDropdownOpen) {
      noteTypeSearchQuery = '';
      highlightedNoteTypeIndex = 0;
      setTimeout(() => {
        noteTypeSearchInputRef?.focus();
      }, 50);
    }
  }

  function handleNoteTypeKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      isTypeDropdownOpen = false;
      noteTypeSearchQuery = '';
      highlightedNoteTypeIndex = 0;
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const noteType = filteredNoteTypes[highlightedNoteTypeIndex];
      if (noteType) {
        handleCreateNote(noteType.name);
      }
      return;
    }

    // Arrow Down or Ctrl+N
    if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n')) {
      event.preventDefault();
      if (filteredNoteTypes.length > 0) {
        highlightedNoteTypeIndex =
          (highlightedNoteTypeIndex + 1) % filteredNoteTypes.length;
      }
      return;
    }

    // Arrow Up or Ctrl+P
    if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p')) {
      event.preventDefault();
      if (filteredNoteTypes.length > 0) {
        highlightedNoteTypeIndex =
          (highlightedNoteTypeIndex - 1 + filteredNoteTypes.length) %
          filteredNoteTypes.length;
      }
      return;
    }
  }

  // Reset highlighted index when search query changes
  $effect(() => {
    void noteTypeSearchQuery; // dependency
    highlightedNoteTypeIndex = 0;
  });

  function startCreatingWorkspace(event: Event): void {
    event.stopPropagation();
    isCreatingWorkspace = true;
    newWorkspaceName = '';
    newWorkspaceIcon = '📁';
    newWorkspaceColor = '';
  }

  async function createWorkspace(): Promise<void> {
    if (!newWorkspaceName.trim()) return;

    const workspace = await workspacesStore.createWorkspace({
      name: newWorkspaceName.trim(),
      icon: newWorkspaceIcon,
      color: newWorkspaceColor || undefined
    });

    // Switch to the new workspace
    await workspacesStore.switchWorkspace(workspace.id);

    isCreatingWorkspace = false;
    onClose();
  }

  function cancelCreateWorkspace(): void {
    isCreatingWorkspace = false;
  }

  async function saveWorkspaceEdit(): Promise<void> {
    const workspaceId = editingWorkspaceId || activeWorkspace?.id;
    if (!workspaceId || !editWorkspaceName.trim()) return;

    await workspacesStore.updateWorkspace(workspaceId, {
      name: editWorkspaceName.trim(),
      icon: editWorkspaceIcon,
      color: editWorkspaceColor || undefined
    });

    isEditingWorkspace = false;
    onClose();
  }

  function cancelEditWorkspace(): void {
    isEditingWorkspace = false;
  }

  function handleEmojiSelect(emoji: string): void {
    if (isCreatingWorkspace) {
      newWorkspaceIcon = emoji;
    } else if (isEditingWorkspace) {
      editWorkspaceIcon = emoji;
    }
  }

  // Click outside to close
  $effect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Element;
      if (
        !target.closest('.workspace-popover') &&
        !target.closest('.add-workspace-button') &&
        !target.closest('.workspace-icon') &&
        !target.closest('.emoji-picker-dropdown') &&
        !target.closest('.emoji-picker-container')
      ) {
        onClose();
      }
    }

    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 10);

    return () => document.removeEventListener('click', handleClickOutside);
  });

  // Handle escape key
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (isCreatingWorkspace) {
        cancelCreateWorkspace();
      } else if (isEditingWorkspace) {
        cancelEditWorkspace();
      } else {
        onClose();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="workspace-popover" role="dialog" aria-label="Workspace menu">
  {#if isCreatingWorkspace}
    <!-- Create workspace form -->
    <div class="workspace-form">
      <h4>New Workspace</h4>

      <div class="form-row">
        <label for="new-workspace-icon">Icon</label>
        <EmojiPicker value={newWorkspaceIcon} onselect={handleEmojiSelect} />
      </div>

      <div class="form-row">
        <label for="new-workspace-name">Name</label>
        <input
          id="new-workspace-name"
          type="text"
          bind:value={newWorkspaceName}
          placeholder="Workspace name"
          class="form-input"
        />
      </div>

      <div class="form-actions">
        <button class="btn-secondary" onclick={cancelCreateWorkspace}>Cancel</button>
        <button
          class="btn-primary"
          onclick={createWorkspace}
          disabled={!newWorkspaceName.trim()}
        >
          Create
        </button>
      </div>
    </div>
  {:else if isEditingWorkspace}
    <!-- Edit workspace form -->
    <div class="workspace-form">
      <h4>Edit Workspace</h4>

      <div class="form-row">
        <label for="edit-workspace-icon">Icon</label>
        <EmojiPicker value={editWorkspaceIcon} onselect={handleEmojiSelect} />
      </div>

      <div class="form-row">
        <label for="edit-workspace-name">Name</label>
        <input
          id="edit-workspace-name"
          type="text"
          bind:value={editWorkspaceName}
          placeholder="Workspace name"
          class="form-input"
        />
      </div>

      <div class="form-actions">
        <button class="btn-secondary" onclick={cancelEditWorkspace}>Cancel</button>
        <button
          class="btn-primary"
          onclick={saveWorkspaceEdit}
          disabled={!editWorkspaceName.trim()}
        >
          Save
        </button>
      </div>
    </div>
  {:else}
    <!-- Main popover menu -->
    <div class="popover-section">
      <button class="action-button" onclick={(e) => startCreatingWorkspace(e)}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="3" width="7" height="7" rx="1"></rect>
          <rect x="14" y="3" width="7" height="7" rx="1"></rect>
          <rect x="3" y="14" width="7" height="7" rx="1"></rect>
          <rect x="14" y="14" width="7" height="7" rx="1"></rect>
        </svg>
        New Workspace
      </button>

      <div class="create-note-button-group">
        <button
          class="action-button main-button"
          onclick={() => handleCreateNote()}
          disabled={!onCreateNote}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <span class="button-text">New Note</span>
          <span class="shortcut">{modifierKey}⇧N</span>
        </button>
        <button
          class="dropdown-button"
          onclick={toggleTypeDropdown}
          disabled={!onCreateNote}
          aria-label="Choose note type"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class:rotated={isTypeDropdownOpen}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {#if isTypeDropdownOpen && notesStore.noteTypes.length > 0}
        <div class="note-type-list">
          <div class="search-container">
            <input
              bind:this={noteTypeSearchInputRef}
              type="text"
              class="search-input"
              placeholder="Search types..."
              bind:value={noteTypeSearchQuery}
              onclick={(e) => e.stopPropagation()}
              onkeydown={handleNoteTypeKeyDown}
            />
            {#if noteTypeSearchQuery}
              <button
                class="clear-search"
                onclick={(e) => {
                  e.stopPropagation();
                  noteTypeSearchQuery = '';
                  noteTypeSearchInputRef?.focus();
                }}
                aria-label="Clear search"
                type="button"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            {/if}
          </div>
          {#if filteredNoteTypes.length === 0}
            <div class="note-type-option no-results">No matching types</div>
          {:else}
            {#each filteredNoteTypes as noteType, index (noteType.name)}
              <button
                class="note-type-option"
                class:highlighted={index === highlightedNoteTypeIndex}
                onclick={() => handleCreateNote(noteType.name)}
              >
                <div class="note-type-main">
                  {#if noteType.icon}
                    <span class="note-type-icon">{noteType.icon}</span>
                  {/if}
                  <span class="note-type-name">{noteType.name}</span>
                </div>
                <span class="note-type-count">({noteType.count})</span>
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .workspace-popover {
    position: absolute;
    bottom: 100%;
    left: 0.75rem;
    right: 0.75rem;
    z-index: 100;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px var(--shadow-medium);
    margin-bottom: 0.25rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .popover-section {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .create-note-button-group {
    display: flex;
    width: 100%;
  }

  .action-button.main-button {
    flex: 1;
    border-radius: 0.5rem 0 0 0.5rem;
    justify-content: flex-start;
    padding-left: 0.75rem;
  }

  .button-text {
    flex: 1;
    text-align: left;
  }

  .shortcut {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    font-weight: 400;
    letter-spacing: 0.025em;
    opacity: 0.5;
  }

  .action-button:hover:not(:disabled) .shortcut {
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .dropdown-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 0.625rem;
    border: none;
    border-radius: 0 0.5rem 0.5rem 0;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .dropdown-button:hover:not(:disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .dropdown-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dropdown-button .rotated {
    transform: rotate(180deg);
  }

  .note-type-list {
    margin-top: 0.25rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    max-height: 150px;
    overflow-y: auto;
  }

  .note-type-list::-webkit-scrollbar {
    width: 6px;
  }

  .note-type-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .note-type-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
    transition: background-color 0.2s ease;
  }

  .note-type-list::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  .search-container {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-primary);
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-light);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .search-input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.2s ease;
  }

  .search-input::placeholder {
    color: var(--text-tertiary);
  }

  .search-input:focus {
    border-color: var(--accent-primary);
  }

  .clear-search {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .clear-search:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .note-type-option {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
    text-align: left;
  }

  .note-type-option:hover,
  .note-type-option.highlighted {
    background: var(--bg-secondary);
  }

  .note-type-option.no-results {
    color: var(--text-secondary);
    cursor: default;
    font-style: italic;
    justify-content: center;
  }

  .note-type-option.no-results:hover {
    background: transparent;
  }

  .note-type-option:first-child {
    border-radius: 0.5rem 0.5rem 0 0;
  }

  .note-type-option:last-child {
    border-radius: 0 0 0.5rem 0.5rem;
  }

  .note-type-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .note-type-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .note-type-name {
    font-weight: 500;
  }

  .note-type-count {
    color: var(--text-secondary);
    font-size: 0.75rem;
  }

  .action-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-button:hover:not(:disabled) {
    background: var(--bg-tertiary);
  }

  .action-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-button svg {
    opacity: 0.7;
  }

  .action-button:hover:not(:disabled) svg {
    opacity: 1;
  }

  /* Form styles */
  .workspace-form {
    padding: 1rem;
  }

  .workspace-form h4 {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.75rem;
  }

  .form-row label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .form-input {
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .btn-secondary,
  .btn-primary {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-secondary {
    background: var(--bg-secondary);
    border: 1px solid var(--border-medium);
    color: var(--text-secondary);
  }

  .btn-secondary:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .btn-primary {
    background: var(--accent-primary);
    border: none;
    color: var(--accent-text);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
