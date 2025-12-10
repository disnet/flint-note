<script lang="ts">
  /**
   * Note Types management view for Automerge-based notes
   * Allows creating, editing, and managing note types
   */
  import {
    getNoteTypes,
    getAllNotes,
    getNoteType,
    createNoteType,
    updateNoteType,
    archiveNoteType,
    createNote,
    setActiveNoteId,
    addNoteToWorkspace
  } from '../lib/automerge';
  import EmojiPicker from './EmojiPicker.svelte';

  interface Props {
    selectedTypeId?: string | null;
    onTypeSelect: (typeId: string | null) => void;
    onNoteSelect?: (noteId: string) => void;
  }

  let { selectedTypeId = null, onTypeSelect, onNoteSelect }: Props = $props();

  // Derived state
  const noteTypes = $derived(getNoteTypes());
  const allNotes = $derived(getAllNotes());
  const selectedType = $derived(selectedTypeId ? getNoteType(selectedTypeId) : null);

  // Get note count for a type
  function getNoteCount(typeId: string): number {
    return allNotes.filter((n) => !n.archived && n.type === typeId).length;
  }

  // Get notes for a specific type
  function getNotesForType(typeId: string) {
    return allNotes
      .filter((n) => !n.archived && n.type === typeId)
      .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
  }

  // UI state for creating a new type
  let showCreateForm = $state(false);
  let newTypeName = $state('');
  let newTypeIcon = $state('');
  let newTypePurpose = $state('');
  let createError = $state<string | null>(null);

  // UI state for editing a type
  let isEditing = $state(false);
  let editName = $state('');
  let editIcon = $state('');
  let editPurpose = $state('');
  let editError = $state<string | null>(null);

  // UI state for delete confirmation
  let showDeleteConfirm = $state(false);

  // Reset create form
  function resetCreateForm(): void {
    showCreateForm = false;
    newTypeName = '';
    newTypeIcon = '';
    newTypePurpose = '';
    createError = null;
  }

  // Handle creating a new type
  function handleCreateType(): void {
    if (!newTypeName.trim()) {
      createError = 'Name is required';
      return;
    }

    // Check for duplicate name
    const existingType = noteTypes.find(
      (t) => t.name.toLowerCase() === newTypeName.trim().toLowerCase()
    );
    if (existingType) {
      createError = 'A type with this name already exists';
      return;
    }

    try {
      const id = createNoteType({
        name: newTypeName.trim(),
        purpose: newTypePurpose.trim(),
        icon: newTypeIcon || undefined
      });
      resetCreateForm();
      onTypeSelect(id);
    } catch (err) {
      createError = err instanceof Error ? err.message : 'Failed to create type';
    }
  }

  // Start editing the selected type
  function startEditing(): void {
    if (!selectedType) return;
    editName = selectedType.name;
    editIcon = selectedType.icon;
    editPurpose = selectedType.purpose;
    editError = null;
    isEditing = true;
  }

  // Cancel editing
  function cancelEditing(): void {
    isEditing = false;
    editError = null;
  }

  // Save edits to the selected type
  function saveEdits(): void {
    if (!selectedTypeId || !editName.trim()) {
      editError = 'Name is required';
      return;
    }

    // Check for duplicate name (excluding current type)
    const existingType = noteTypes.find(
      (t) =>
        t.id !== selectedTypeId && t.name.toLowerCase() === editName.trim().toLowerCase()
    );
    if (existingType) {
      editError = 'A type with this name already exists';
      return;
    }

    try {
      updateNoteType(selectedTypeId, {
        name: editName.trim(),
        purpose: editPurpose.trim(),
        icon: editIcon || undefined
      });
      isEditing = false;
      editError = null;
    } catch (err) {
      editError = err instanceof Error ? err.message : 'Failed to save changes';
    }
  }

  // Handle archiving the selected type
  function handleArchiveType(): void {
    if (!selectedTypeId) return;
    archiveNoteType(selectedTypeId);
    showDeleteConfirm = false;
    onTypeSelect(null);
  }

  // Create a new note of the selected type
  function handleCreateNote(): void {
    if (!selectedTypeId) return;
    const noteId = createNote({ type: selectedTypeId });
    setActiveNoteId(noteId);
    addNoteToWorkspace(noteId);
    onNoteSelect?.(noteId);
  }

  // Handle clicking a note in the list
  function handleNoteClick(noteId: string): void {
    setActiveNoteId(noteId);
    addNoteToWorkspace(noteId);
    onNoteSelect?.(noteId);
  }

  // Reset state when selection changes
  $effect(() => {
    if (selectedTypeId) {
      isEditing = false;
      editError = null;
      showDeleteConfirm = false;
    }
  });
</script>

<div class="note-types-view">
  {#if selectedType}
    <!-- Type Detail View -->
    <div class="type-detail">
      <div class="detail-header">
        <button class="back-button" onclick={() => onTypeSelect(null)}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Note Types
        </button>
      </div>

      <div class="type-title-section">
        {#if isEditing}
          <div class="edit-form">
            <div class="form-group">
              <label for="edit-name" class="form-label">Name</label>
              <input
                id="edit-name"
                type="text"
                class="form-input"
                bind:value={editName}
                placeholder="Type name"
              />
            </div>

            <div class="form-group">
              <span class="form-label">Icon</span>
              <EmojiPicker
                bind:value={editIcon}
                onselect={(emoji) => (editIcon = emoji)}
              />
            </div>

            <div class="form-group">
              <label for="edit-purpose" class="form-label">Purpose</label>
              <textarea
                id="edit-purpose"
                class="form-textarea"
                bind:value={editPurpose}
                placeholder="Brief description of what this type is for..."
                rows="3"
              ></textarea>
            </div>

            {#if editError}
              <div class="error-message">{editError}</div>
            {/if}

            <div class="form-actions">
              <button class="btn btn-secondary" onclick={cancelEditing}>Cancel</button>
              <button class="btn btn-primary" onclick={saveEdits}>Save Changes</button>
            </div>
          </div>
        {:else}
          <div class="type-header">
            <div class="type-info">
              <span class="type-icon-large">{selectedType.icon || '📄'}</span>
              <div class="type-name-group">
                <h1 class="type-name">{selectedType.name}</h1>
                <span class="note-count">{getNoteCount(selectedTypeId || '')} notes</span>
              </div>
            </div>
            <div class="type-actions">
              <button class="btn btn-secondary" onclick={startEditing}>Edit</button>
              <button class="btn btn-primary" onclick={handleCreateNote}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New Note
              </button>
            </div>
          </div>

          {#if selectedType.purpose}
            <p class="type-purpose">{selectedType.purpose}</p>
          {/if}
        {/if}
      </div>

      {#if !isEditing}
        <!-- Notes in this type -->
        <div class="type-notes">
          <h2 class="section-title">Notes</h2>
          {#if getNotesForType(selectedTypeId || '').length > 0}
            <div class="notes-list">
              {#each getNotesForType(selectedTypeId || '') as note (note.id)}
                <button
                  class="note-item"
                  onclick={() => handleNoteClick(note.id)}
                  type="button"
                >
                  <span class="note-title">{note.title || 'Untitled'}</span>
                  <span class="note-date"
                    >{new Date(note.updated).toLocaleDateString()}</span
                  >
                </button>
              {/each}
            </div>
          {:else}
            <div class="empty-notes">
              <p>No notes of this type yet.</p>
              <button class="btn btn-secondary" onclick={handleCreateNote}>
                Create first note
              </button>
            </div>
          {/if}
        </div>

        <!-- Danger zone -->
        {#if selectedType.id !== 'type-default'}
          <div class="danger-zone">
            <h3 class="danger-title">Danger Zone</h3>
            {#if showDeleteConfirm}
              <div class="delete-confirm">
                <p>Are you sure you want to archive this note type?</p>
                {#if getNoteCount(selectedTypeId || '') > 0}
                  <p class="warning-text">
                    Notes using this type will keep their assignment, but the type won't
                    appear in lists.
                  </p>
                {/if}
                <div class="confirm-actions">
                  <button
                    class="btn btn-secondary"
                    onclick={() => (showDeleteConfirm = false)}
                  >
                    Cancel
                  </button>
                  <button class="btn btn-danger" onclick={handleArchiveType}>
                    Archive Type
                  </button>
                </div>
              </div>
            {:else}
              <button
                class="btn btn-danger-outline"
                onclick={() => (showDeleteConfirm = true)}
              >
                Archive Note Type
              </button>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    <!-- Type List View -->
    <div class="types-list-view">
      <div class="list-header">
        <h2>Note Types</h2>
        <button class="btn btn-primary" onclick={() => (showCreateForm = true)}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Type
        </button>
      </div>

      {#if showCreateForm}
        <div class="create-form">
          <h3>Create Note Type</h3>

          <div class="form-group">
            <label for="new-name" class="form-label">Name *</label>
            <input
              id="new-name"
              type="text"
              class="form-input"
              bind:value={newTypeName}
              placeholder="e.g., Meeting Notes, Project Ideas"
            />
          </div>

          <div class="form-group">
            <span class="form-label">Icon</span>
            <EmojiPicker
              bind:value={newTypeIcon}
              onselect={(emoji) => (newTypeIcon = emoji)}
            />
          </div>

          <div class="form-group">
            <label for="new-purpose" class="form-label">Purpose</label>
            <textarea
              id="new-purpose"
              class="form-textarea"
              bind:value={newTypePurpose}
              placeholder="Brief description of what this type is for..."
              rows="2"
            ></textarea>
          </div>

          {#if createError}
            <div class="error-message">{createError}</div>
          {/if}

          <div class="form-actions">
            <button class="btn btn-secondary" onclick={resetCreateForm}>Cancel</button>
            <button class="btn btn-primary" onclick={handleCreateType}>Create</button>
          </div>
        </div>
      {/if}

      <div class="types-grid">
        {#each noteTypes as noteType (noteType.id)}
          <button
            class="type-card"
            onclick={() => onTypeSelect(noteType.id)}
            type="button"
          >
            <span class="card-icon">{noteType.icon || '📄'}</span>
            <div class="card-content">
              <span class="card-name">{noteType.name}</span>
              <span class="card-count">{getNoteCount(noteType.id)} notes</span>
            </div>
            <svg
              class="card-chevron"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        {/each}

        {#if noteTypes.length === 0}
          <div class="empty-types">
            <p>No note types yet.</p>
            <button class="btn btn-secondary" onclick={() => (showCreateForm = true)}>
              Create your first type
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .note-types-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* List View */
  .types-list-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 1.5rem;
  }

  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-shrink: 0;
  }

  .list-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .types-grid {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .type-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    cursor: pointer;
    text-align: left;
    transition: all 0.2s ease;
  }

  .type-card:hover {
    border-color: var(--border-medium);
    background: var(--bg-hover);
  }

  .card-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .card-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .card-name {
    font-weight: 500;
    color: var(--text-primary);
  }

  .card-count {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .card-chevron {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  /* Create Form */
  .create-form {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }

  .create-form h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  /* Detail View */
  .type-detail {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .back-button:hover {
    color: var(--accent-primary);
  }

  .type-title-section {
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .type-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .type-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .type-icon-large {
    font-size: 2.5rem;
  }

  .type-name-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .type-name {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .note-count {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .type-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .type-purpose {
    margin: 1rem 0 0;
    font-size: 0.9375rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  /* Type Notes */
  .type-notes {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .section-title {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .notes-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .note-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s ease;
  }

  .note-item:hover {
    background: var(--bg-secondary);
  }

  .note-title {
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-date {
    font-size: 0.75rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .empty-notes,
  .empty-types {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--text-secondary);
  }

  .empty-notes p,
  .empty-types p {
    margin: 0 0 1rem;
  }

  /* Edit Form */
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Form Elements */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .form-input,
  .form-textarea {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--text-primary);
    background: var(--bg-primary);
    transition: border-color 0.2s ease;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .form-textarea {
    resize: vertical;
    min-height: 60px;
    line-height: 1.5;
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .error-message {
    color: var(--error-text);
    font-size: 0.8125rem;
    padding: 0.5rem;
    background: var(--error-bg);
    border-radius: 0.25rem;
  }

  /* Danger Zone */
  .danger-zone {
    margin: 1.5rem;
    padding: 1rem;
    border: 1px solid var(--error-border, #ef4444);
    border-radius: 0.5rem;
    flex-shrink: 0;
  }

  .danger-title {
    margin: 0 0 0.75rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--error-text);
  }

  .delete-confirm p {
    margin: 0 0 0.75rem;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .warning-text {
    color: var(--error-text) !important;
    font-weight: 500;
  }

  .confirm-actions {
    display: flex;
    gap: 0.5rem;
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: var(--accent-text, white);
  }

  .btn-primary:hover {
    background: var(--accent-primary-hover, var(--accent-primary));
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-medium);
  }

  .btn-secondary:hover {
    background: var(--bg-hover);
  }

  .btn-danger {
    background: var(--error-text, #c00);
    color: white;
  }

  .btn-danger:hover {
    opacity: 0.9;
  }

  .btn-danger-outline {
    background: transparent;
    color: var(--error-text, #c00);
    border: 1px solid var(--error-border, #ef4444);
  }

  .btn-danger-outline:hover {
    background: var(--error-bg);
  }
</style>
