<script lang="ts">
  import { notesStore, type NoteMetadata } from '../services/noteStore.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore';

  const { groupedNotes } = notesStore;

  interface Props {
    onNoteSelect?: (note: NoteMetadata) => void;
    onCreateNote?: () => void;
  }

  let { onNoteSelect, onCreateNote }: Props = $props();

  let expandedTypes = $state<Set<string>>(new Set());

  function toggleType(typeName: string): void {
    const newExpandedTypes = new Set(expandedTypes);
    if (newExpandedTypes.has(typeName)) {
      newExpandedTypes.delete(typeName);
    } else {
      newExpandedTypes.add(typeName);
    }
    expandedTypes = newExpandedTypes;
  }

  function handleNoteClick(note: NoteMetadata): void {
    onNoteSelect?.(note);
  }

  function handleNoteKeyDown(event: KeyboardEvent, note: NoteMetadata): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleNoteClick(note);
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString() +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return Math.round(bytes / (1024 * 1024)) + ' MB';
  }
</script>

<div class="notes-view">
  <div class="notes-header">
    <h2>📄 Notes</h2>
    <div class="header-actions">
      {#if notesStore.loading}
        <div class="loading-indicator">...</div>
      {/if}
      <button
        class="create-note-btn"
        onclick={() => onCreateNote?.()}
        title="Create new note (Ctrl+N)"
      >
        <span class="create-icon">+</span>
      </button>
    </div>
  </div>

  {#if notesStore.error}
    <div class="error-message">
      <h3>Failed to load notes</h3>
      <p>{notesStore.error}</p>
      <details>
        <summary>Troubleshooting</summary>
        <ul>
          <li>Check that the flint-note MCP server is running</li>
          <li>Verify that the note service initialized successfully</li>
          <li>Check the browser console for detailed error logs</li>
        </ul>
      </details>
    </div>
  {/if}

  {#if notesStore.notes.length > 0 && Object.keys(groupedNotes()).length > 0}
    <div class="notes-tree">
      {#each Object.entries(groupedNotes()) as [typeName, notes] (typeName)}
        <div class="note-type">
          <button
            class="type-header"
            class:expanded={expandedTypes.has(typeName)}
            onclick={() => toggleType(typeName)}
          >
            <span class="type-icon">
              {expandedTypes.has(typeName) ? '▼' : '▶'}
            </span>
            <span class="type-name">{typeName}</span>
            <span class="note-count">({notes.length})</span>
          </button>

          {#if expandedTypes.has(typeName)}
            <div class="notes-list">
              {#each notes as note, index (note.id || `${typeName}-${index}`)}
                <div
                  class="note-item"
                  role="button"
                  tabindex="0"
                  onclick={() => handleNoteClick(note)}
                  onkeydown={(e) => handleNoteKeyDown(e, note)}
                >
                  <div class="note-title">
                    {#if pinnedNotesStore.isPinned(note.id)}
                      <span class="pin-indicator" title="Pinned note">📌</span>
                    {/if}
                    {note.title}
                  </div>
                  <div class="note-meta">
                    <span class="note-filename">{note.filename}</span>
                    <span class="note-modified"
                      >Modified: {formatDate(note.modified)}</span
                    >
                    <span class="note-size">{formatFileSize(note.size)}</span>
                  </div>
                  {#if note.tags.length > 0}
                    <div class="note-tags">
                      {#each note.tags as tag, tagIndex (`${note.id || index}-tag-${tagIndex}`)}
                        <span class="tag">{tag}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else if !notesStore.loading}
    <div style="padding: 20px; text-align: center; color: #666;">No notes found.</div>
  {:else}
    <div style="padding: 20px; text-align: center; color: #666;">Loading notes...</div>
  {/if}
</div>

<style>
  .notes-view {
    height: 100%;
    overflow-y: auto;
    padding: 0.5rem;
    background: var(--bg-primary);
  }

  .notes-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .notes-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .loading-indicator {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .create-note-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 0.25rem;
    padding: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 1.75rem;
    height: 1.75rem;
  }

  .create-note-btn:hover {
    background: var(--accent-primary-hover);
    transform: translateY(-1px);
  }

  .create-note-btn:active {
    transform: translateY(0);
  }

  .create-icon {
    font-size: 1rem;
    font-weight: 600;
    line-height: 1;
  }

  .error-message {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
    border-left: 4px solid var(--error-border, #ef4444);
  }

  .error-message h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .error-message p {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-family: monospace;
    background: rgba(0, 0, 0, 0.1);
    padding: 0.5rem;
    border-radius: 0.25rem;
  }

  .error-message details {
    font-size: 0.875rem;
  }

  .error-message summary {
    cursor: pointer;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .error-message ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .error-message li {
    margin-bottom: 0.25rem;
  }

  .notes-tree {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .note-type {
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .type-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    cursor: pointer;
    transition: background-color 0.2s ease;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .type-header:hover {
    background: var(--bg-hover);
  }

  .type-header.expanded {
    background: var(--bg-hover);
  }

  .type-icon {
    font-size: 0.75rem;
    color: var(--text-secondary);
    width: 1rem;
    text-align: center;
  }

  .type-name {
    flex: 1;
    text-align: left;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .note-count {
    color: var(--text-secondary);
    font-size: 0.75rem;
  }

  .notes-list {
    border-top: 1px solid var(--border-light);
  }

  .note-item {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-light);
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .note-item:hover {
    background: var(--bg-hover);
  }

  .note-item:focus {
    background: var(--bg-hover);
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }

  .note-item:last-child {
    border-bottom: none;
  }

  .note-title {
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pin-indicator {
    font-size: 0.875rem;
    opacity: 0.8;
    color: var(--accent-primary);
  }

  .note-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }

  .note-tags {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .tag {
    background: var(--accent-secondary);
    color: var(--accent-text);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.65rem;
    font-weight: 500;
  }
</style>
