<script lang="ts">
  import { sidebarNotesStore } from '../stores/sidebarNotesStore.svelte';
  import { wikilinkService } from '../services/wikilinkService.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';

  let editingTitleId = $state<string | null>(null);
  let editedTitle = $state('');

  function handleDisclosureToggle(noteId: string): void {
    sidebarNotesStore.toggleExpanded(noteId);
  }

  function handleRemoveNote(noteId: string): void {
    sidebarNotesStore.removeNote(noteId);
  }

  function handleContentChange(noteId: string, content: string): void {
    sidebarNotesStore.updateNote(noteId, { content });
  }

  function startEditingTitle(noteId: string, currentTitle: string): void {
    editingTitleId = noteId;
    editedTitle = currentTitle;
  }

  function cancelEditingTitle(): void {
    editingTitleId = null;
    editedTitle = '';
  }

  async function saveTitle(noteId: string): Promise<void> {
    if (editedTitle.trim()) {
      await sidebarNotesStore.updateNote(noteId, { title: editedTitle });
    }
    cancelEditingTitle();
  }

  function handleTitleKeyDown(event: KeyboardEvent, noteId: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTitle(noteId);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditingTitle();
    }
  }

  async function handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean
  ): Promise<void> {
    // Use centralized wikilink service for navigation
    await wikilinkService.handleWikilinkClick(noteId, title, shouldCreate);
  }
</script>

<div class="sidebar-notes">
  <div class="sidebar-notes-header">
    <h3>Sidebar Notes</h3>
  </div>

  <div class="notes-list">
    {#if sidebarNotesStore.notes.length === 0}
      <div class="empty-state">
        <p>No notes in sidebar</p>
        <p class="hint">Use "Add to Sidebar" in the note editor to add notes here</p>
      </div>
    {:else}
      {#each sidebarNotesStore.notes as note (note.noteId)}
        <div class="sidebar-note">
          <div class="note-header">
            <button
              class="disclosure-button"
              onclick={() => handleDisclosureToggle(note.noteId)}
              aria-label={note.isExpanded ? 'Collapse' : 'Expand'}
            >
              <svg
                class="disclosure-icon"
                class:expanded={note.isExpanded}
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>

            {#if editingTitleId === note.noteId}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                type="text"
                class="title-input"
                bind:value={editedTitle}
                onkeydown={(e) => handleTitleKeyDown(e, note.noteId)}
                onblur={() => saveTitle(note.noteId)}
                autofocus
              />
            {:else}
              <button
                class="note-title"
                onclick={() => startEditingTitle(note.noteId, note.title)}
              >
                {note.title || 'Untitled'}
              </button>
            {/if}

            <button
              class="remove-button"
              onclick={() => handleRemoveNote(note.noteId)}
              aria-label="Remove note"
              title="Remove from sidebar"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {#if note.isExpanded}
            <div class="note-content">
              <CodeMirrorEditor
                content={note.content}
                onContentChange={(content) => handleContentChange(note.noteId, content)}
                onWikilinkClick={handleWikilinkClick}
                placeholder="Note content..."
              />
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .sidebar-notes {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .sidebar-notes-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .sidebar-notes-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .notes-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .empty-state {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-state p {
    margin: 0.5rem 0;
  }

  .empty-state .hint {
    font-size: 0.85rem;
    color: var(--text-tertiary);
  }

  .sidebar-note {
    margin-bottom: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
  }

  .note-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .disclosure-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
  }

  .disclosure-button:hover {
    color: var(--text-primary);
  }

  .disclosure-icon {
    transition: transform 0.2s ease;
  }

  .disclosure-icon.expanded {
    transform: rotate(90deg);
  }

  .note-title {
    flex: 1;
    text-align: left;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 0.25rem;
    transition: background-color 0.2s ease;
  }

  .note-title:hover {
    background: var(--bg-tertiary);
  }

  .title-input {
    flex: 1;
    padding: 0.25rem;
    border: 1px solid var(--accent-primary);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
  }

  .title-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .remove-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .remove-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .note-content {
    border-top: 1px solid var(--border-light);
    padding: 0.5rem;
    min-height: 150px;
    max-height: 400px;
  }
</style>
