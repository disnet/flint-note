<script lang="ts">
  import { workspacesStore } from '../stores/workspacesStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';
  import EmojiPicker from './EmojiPicker.svelte';

  interface Props {
    onCreateNote?: (noteType?: string) => void;
    onClose: () => void;
  }

  let { onCreateNote, onClose }: Props = $props();

  // State
  let isTypeDropdownOpen = $state(false);
  let isCreatingWorkspace = $state(false);
  let isEditingWorkspace = $state(false);

  // New workspace form
  let newWorkspaceName = $state('');
  let newWorkspaceIcon = $state('📁');
  let newWorkspaceColor = $state('');

  // Edit workspace form
  let editWorkspaceName = $state('');
  let editWorkspaceIcon = $state('');
  let editWorkspaceColor = $state('');

  const activeWorkspace = $derived(workspacesStore.activeWorkspace);

  // Color options for appearance
  const colorOptions = [
    { value: '', label: 'Default' },
    { value: '#ef4444', label: 'Red' },
    { value: '#f97316', label: 'Orange' },
    { value: '#eab308', label: 'Yellow' },
    { value: '#22c55e', label: 'Green' },
    { value: '#3b82f6', label: 'Blue' },
    { value: '#8b5cf6', label: 'Purple' },
    { value: '#ec4899', label: 'Pink' }
  ];

  function handleCreateNote(noteType?: string): void {
    if (onCreateNote) {
      onCreateNote(noteType);
    }
    onClose();
  }

  function toggleTypeDropdown(): void {
    isTypeDropdownOpen = !isTypeDropdownOpen;
  }

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

  function startEditingWorkspace(event: Event): void {
    event.stopPropagation();
    if (!activeWorkspace) return;
    isEditingWorkspace = true;
    editWorkspaceName = activeWorkspace.name;
    editWorkspaceIcon = activeWorkspace.icon;
    editWorkspaceColor = activeWorkspace.color || '';
  }

  async function saveWorkspaceEdit(): Promise<void> {
    if (!activeWorkspace || !editWorkspaceName.trim()) return;

    await workspacesStore.updateWorkspace(activeWorkspace.id, {
      name: editWorkspaceName.trim(),
      icon: editWorkspaceIcon,
      color: editWorkspaceColor || undefined
    });

    isEditingWorkspace = false;
  }

  function cancelEditWorkspace(): void {
    isEditingWorkspace = false;
  }

  async function deleteWorkspace(): Promise<void> {
    if (!activeWorkspace) return;

    if (workspacesStore.workspaces.length <= 1) {
      alert('Cannot delete the last workspace');
      return;
    }

    const confirmed = confirm(
      `Delete workspace "${activeWorkspace.name}"? This will remove all pinned notes and tabs from this workspace.`
    );
    if (!confirmed) return;

    await workspacesStore.deleteWorkspace(activeWorkspace.id);
    onClose();
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

      <div class="form-row">
        <label for="new-workspace-color">Color</label>
        <select
          id="new-workspace-color"
          bind:value={newWorkspaceColor}
          class="form-select"
        >
          {#each colorOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
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

      <div class="form-row">
        <label for="edit-workspace-color">Color</label>
        <select
          id="edit-workspace-color"
          bind:value={editWorkspaceColor}
          class="form-select"
        >
          {#each colorOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
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
    {#if activeWorkspace}
      <div class="workspace-header">
        <span class="workspace-icon-large">{activeWorkspace.icon}</span>
        <span class="workspace-name">{activeWorkspace.name}</span>
      </div>
    {/if}

    <div class="popover-section">
      <div class="create-note-button-group">
        <button
          class="new-note-button main-button"
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
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Note
        </button>
        <button
          class="new-note-button dropdown-button"
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
          {#each notesStore.noteTypes as noteType (noteType.name)}
            <button
              class="note-type-option"
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
        </div>
      {/if}
    </div>

    <div class="popover-divider"></div>

    <div class="popover-section workspace-actions">
      <button class="action-button" onclick={(e) => startEditingWorkspace(e)}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
        </svg>
        Edit
      </button>
      <button
        class="action-button danger"
        onclick={deleteWorkspace}
        disabled={workspacesStore.workspaces.length <= 1}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="3 6 5 6 21 6"></polyline>
          <path
            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          ></path>
        </svg>
        Delete
      </button>
      <button class="action-button" onclick={(e) => startCreatingWorkspace(e)}>
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
        New Workspace
      </button>
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

  .workspace-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-light);
  }

  .workspace-icon-large {
    font-size: 1.25rem;
  }

  .workspace-name {
    font-weight: 500;
    color: var(--text-primary);
  }

  .popover-section {
    padding: 0.5rem;
  }

  .popover-divider {
    height: 1px;
    background: var(--border-light);
    margin: 0;
  }

  .create-note-button-group {
    display: flex;
    width: 100%;
  }

  .new-note-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-medium);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .new-note-button.main-button {
    flex: 1;
    border-radius: 0.5rem 0 0 0.5rem;
    border-right: none;
  }

  .new-note-button.dropdown-button {
    padding: 0.5rem;
    border-radius: 0 0.5rem 0.5rem 0;
    min-width: 2rem;
    width: 2rem;
  }

  .new-note-button:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  .new-note-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .new-note-button .rotated {
    transform: rotate(180deg);
  }

  .note-type-list {
    margin-top: 0.25rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    max-height: 150px;
    overflow-y: auto;
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

  .note-type-option:hover {
    background: var(--bg-secondary);
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

  .workspace-actions {
    display: flex;
    gap: 0.25rem;
  }

  .action-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.5rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-button:hover:not(:disabled) {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-button.danger:hover:not(:disabled) {
    background: var(--error-bg, rgba(239, 68, 68, 0.1));
    color: var(--error-text, #ef4444);
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

  .form-input,
  .form-select {
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .form-input:focus,
  .form-select:focus {
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
