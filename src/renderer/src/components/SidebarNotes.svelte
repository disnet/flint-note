<script lang="ts">
  import { sidebarNotesStore } from '../stores/sidebarNotesStore.svelte';
  import { wikilinkService } from '../services/wikilinkService.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';

  // Debounce timers for content updates
  const contentDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Track original titles for cancel/revert
  const originalTitles = new Map<string, string>();

  function handleDisclosureToggle(noteId: string): void {
    sidebarNotesStore.toggleExpanded(noteId);
  }

  function handleRemoveNote(noteId: string): void {
    sidebarNotesStore.removeNote(noteId);
  }

  function handleContentChange(noteId: string, content: string): void {
    // Clear existing timer for this note
    const existingTimer = contentDebounceTimers.get(noteId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer - update after 500ms of no typing
    const timer = setTimeout(() => {
      sidebarNotesStore.updateNote(noteId, { content });
      contentDebounceTimers.delete(noteId);
    }, 500);

    contentDebounceTimers.set(noteId, timer);
  }

  function handleTitleFocus(noteId: string, currentTitle: string): void {
    // Save original title when editing starts
    originalTitles.set(noteId, currentTitle);
  }

  function handleTitleBlur(noteId: string, newTitle: string): void {
    const originalTitle = originalTitles.get(noteId);
    if (originalTitle !== undefined && newTitle !== originalTitle) {
      sidebarNotesStore.updateNote(noteId, { title: newTitle });
    }
    originalTitles.delete(noteId);
  }

  function handleTitleKeyDown(event: KeyboardEvent, noteId: string): void {
    const target = event.target as HTMLInputElement;

    if (event.key === 'Enter') {
      event.preventDefault();
      target.blur(); // Trigger blur which will save
    } else if (event.key === 'Escape') {
      event.preventDefault();
      const originalTitle = originalTitles.get(noteId);
      if (originalTitle !== undefined) {
        target.value = originalTitle; // Revert to original
      }
      originalTitles.delete(noteId);
      target.blur();
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

            <input
              type="text"
              class="title-input"
              value={note.title || ''}
              onfocus={(e) => handleTitleFocus(note.noteId, e.currentTarget.value)}
              onblur={(e) => handleTitleBlur(note.noteId, e.currentTarget.value)}
              onkeydown={(e) => handleTitleKeyDown(e, note.noteId)}
              placeholder="Untitled"
            />

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
                variant="sidebar-note"
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

  .title-input {
    flex: 1;
    padding: 0.25rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.9rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .title-input:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-light);
  }

  .title-input:focus {
    outline: none;
    background: var(--bg-primary);
    border-color: var(--accent-primary);
  }

  .title-input::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
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
    max-height: 400px;
    display: flex;
    flex-direction: column;
  }

  .note-content :global(.editor-content) {
    min-height: 0;
  }
</style>
