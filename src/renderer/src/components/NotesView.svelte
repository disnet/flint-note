<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';

  const groupedNotes = $derived.by(() => {
    const notes = notesStore.groupedNotes;
    return notes;
  });

  const noteTypes = $derived.by(() => {
    const types = notesStore.noteTypes;
    return types;
  });

  interface Props {
    onTypeSelect?: (typeName: string) => void;
    onCreateType?: () => void;
  }

  let { onTypeSelect, onCreateType }: Props = $props();

  function handleTypeClick(typeName: string): void {
    onTypeSelect?.(typeName);
  }

  function handleTypeKeyDown(event: KeyboardEvent, typeName: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleTypeClick(typeName);
    }
  }
</script>

<div class="notes-view">
  <div class="notes-header">
    <h1 class="page-title">Note Types</h1>
    <button
      class="create-type-btn"
      onclick={() => onCreateType?.()}
      title="Create new note type"
    >
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

  {#if notesStore.error}
    <div class="error-message">
      <h3>Failed to load note types</h3>
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
    <div class="type-grid">
      {#each noteTypes as noteType (noteType.name)}
        {@const notes = groupedNotes[noteType.name] || []}
        <button
          class="type-card"
          onclick={() => handleTypeClick(noteType.name)}
          onkeydown={(e) => handleTypeKeyDown(e, noteType.name)}
        >
          <div class="card-content">
            <div class="card-header">
              {#if noteType.icon}
                <span class="type-icon">{noteType.icon}</span>
              {/if}
              <h2 class="type-name">{noteType.name}</h2>
            </div>
            {#if noteType.purpose}
              <p class="type-purpose">{noteType.purpose}</p>
            {/if}
            <p class="note-count">
              {notes.length}
              {notes.length === 1 ? 'note' : 'notes'}
            </p>
          </div>
        </button>
      {/each}
    </div>
  {:else if !notesStore.loading}
    <div class="empty-state">
      <p>No note types found.</p>
    </div>
  {:else}
    <div class="loading-state">
      <p>Loading note types...</p>
    </div>
  {/if}
</div>

<style>
  .notes-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    background: var(--bg-primary);
  }

  .notes-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .page-title {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .create-type-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .create-type-btn:hover {
    background: var(--accent-primary-hover);
  }

  .error-message {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 1rem;
    border-radius: 0.375rem;
    margin-bottom: 1.5rem;
    border-left: 3px solid var(--error-border, #ef4444);
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

  .type-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
    padding: 0.5rem 0;
  }

  .type-card {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    background: transparent;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    min-height: 100px;
  }

  .type-card:hover {
    border-color: var(--accent-primary);
    transform: translateY(-2px);
  }

  .type-card:active {
    transform: translateY(0);
  }

  .type-card:focus {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .type-icon {
    font-size: 1.5rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .type-name {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .type-purpose {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    font-weight: 400;
    line-height: 1.4;
    flex: 1;
  }

  .note-count {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-weight: 400;
  }

  .empty-state,
  .loading-state {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-secondary);
  }

  .empty-state p,
  .loading-state p {
    margin: 0;
    font-size: 0.9375rem;
  }
</style>
