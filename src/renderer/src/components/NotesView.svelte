<script lang="ts">
  import { notesStore, type NoteMetadata, type NoteType } from '../services/noteStore.svelte';
  import { pinnedNotesStore } from '../services/pinnedStore.svelte';
  import NoteTypeActions from './NoteTypeActions.svelte';
  import TypeInfoOverlay from './TypeInfoOverlay.svelte';

  const { groupedNotes, noteTypes } = notesStore;

  interface Props {
    onNoteSelect?: (note: NoteMetadata) => void;
    onCreateNote?: (noteType?: string) => void;
  }

  let { onNoteSelect, onCreateNote }: Props = $props();

  let expandedTypes = $state<Set<string>>(new Set());
  let showTypeInfoOverlay = $state<string | null>(null);

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

  function handleCreateNoteWithType(noteType: string): void {
    onCreateNote?.(noteType);
  }

  function handleShowTypeInfo(typeName: string): void {
    showTypeInfoOverlay = showTypeInfoOverlay === typeName ? null : typeName;
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

  {#if noteTypes.length > 0}
    <div class="notes-tree">
      {#each noteTypes as noteType (noteType.name)}
        {@const notes = groupedNotes[noteType.name] || []}
        <div class="note-type">
          <div class="type-header-container">
            <button
              class="type-header"
              class:expanded={expandedTypes.has(noteType.name)}
              onclick={() => toggleType(noteType.name)}
            >
              <span class="type-icon">
                {expandedTypes.has(noteType.name) ? '▼' : '▶'}
              </span>
              <span class="type-name">{noteType.name}</span>
              <span class="note-count">({notes.length})</span>
            </button>
            <div class="type-actions">
              <NoteTypeActions
                typeName={noteType.name}
                onCreateNote={handleCreateNoteWithType}
                onShowTypeInfo={handleShowTypeInfo}
              />
            </div>
          </div>

          {#if showTypeInfoOverlay === noteType.name}
            <div class="full-width-overlay">
              <TypeInfoOverlay typeName={noteType.name} onClose={() => (showTypeInfoOverlay = null)} />
            </div>
          {/if}

          {#if expandedTypes.has(noteType.name)}
            <div class="notes-list">
              {#if notes.length > 0}
                {#each notes as note, index (note.id || `${noteType.name}-${index}`)}
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
                    {#if note.snippet}
                      <div class="note-snippet">
                        {note.snippet}
                      </div>
                    {/if}
                  </div>
                {/each}
              {:else}
                <div class="empty-type-message">
                  No notes of this type yet. 
                  <button 
                    class="create-first-note-btn"
                    onclick={() => handleCreateNoteWithType(noteType.name)}
                  >
                    Create first note
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else if !notesStore.loading}
    <div style="padding: 20px; text-align: center; color: #666;">No note types found.</div>
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
    gap: 1.5rem;
  }

  .note-type {
    background: transparent;
    position: relative;
  }

  .type-header-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .type-header {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0;
    background: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 1.2rem;
    font-weight: 600;
    text-align: left;
  }

  .type-actions {
    position: relative;
  }

  .type-header:hover {
    color: var(--accent-primary);
  }

  .type-header:hover .type-icon {
    color: var(--accent-primary);
  }

  .type-icon {
    font-size: 1rem;
    color: var(--text-secondary);
    width: 1.2rem;
    text-align: center;
    transition: color 0.2s ease;
  }

  .type-name {
    flex: 1;
    text-align: left;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .note-count {
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-weight: 400;
  }

  .notes-list {
    margin-left: 2rem;
    margin-top: 0.5rem;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .note-item {
    padding: 0.5rem 0;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 0.25rem;
    margin-bottom: 0.25rem;
  }

  .note-item:hover {
    background: var(--bg-secondary);
    padding-left: 0.5rem;
    margin-left: -0.5rem;
  }

  .note-item:focus {
    background: var(--bg-secondary);
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
    border-radius: 0.25rem;
  }

  .note-title {
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.375rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pin-indicator {
    font-size: 0.875rem;
    opacity: 0.8;
    color: var(--accent-primary);
  }

  .note-snippet {
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.4;
    margin-bottom: 0.25rem;
  }

  .full-width-overlay {
    width: 100%;
    margin-top: 0.5rem;
    margin-bottom: 1rem;
  }

  .empty-type-message {
    padding: 1rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
    background: var(--bg-secondary);
    border-radius: 0.25rem;
    margin: 0.5rem 0;
  }

  .create-first-note-btn {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .create-first-note-btn:hover {
    background: var(--accent-primary-hover);
    transform: translateY(-1px);
  }

  .create-first-note-btn:active {
    transform: translateY(0);
  }
</style>
