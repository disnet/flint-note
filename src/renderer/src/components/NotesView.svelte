<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';

  const noteTypes = $derived.by(() => {
    // Filter out the 'type' system type from the list
    return notesStore.noteTypes.filter((t) => t.name !== 'type');
  });

  interface Props {
    onTypeSelect?: (noteId: string) => void;
    onCreateType?: () => void;
  }

  let { onTypeSelect, onCreateType }: Props = $props();

  function handleTypeClick(noteId: string | undefined): void {
    if (noteId) {
      onTypeSelect?.(noteId);
    }
  }

  function handleTypeKeyDown(event: KeyboardEvent, noteId: string | undefined): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleTypeClick(noteId);
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
      + New Type
    </button>
  </div>

  {#if notesStore.error}
    <div class="error-message">
      <p>{notesStore.error}</p>
    </div>
  {/if}

  <div class="divider"></div>

  {#if noteTypes.length > 0}
    <div class="type-list">
      {#each noteTypes as noteType (noteType.name)}
        <button
          class="type-row"
          onclick={() => handleTypeClick(noteType.noteId)}
          onkeydown={(e) => handleTypeKeyDown(e, noteType.noteId)}
        >
          <span class="type-icon">{noteType.icon || '📄'}</span>
          <div class="type-info">
            <span class="type-name">{noteType.name}</span>
            {#if noteType.purpose}
              <span class="type-purpose">{noteType.purpose}</span>
            {/if}
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
      <p>Loading...</p>
    </div>
  {/if}
</div>

<style>
  .notes-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 1.5rem 0;
    background: var(--bg-primary);
  }

  .notes-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.5rem;
    margin-bottom: 0.5rem;
  }

  .page-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .create-type-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    color: var(--text-secondary);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .create-type-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .error-message {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 0.5rem 0.75rem;
    margin: 0 0.5rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .error-message p {
    margin: 0;
  }

  .divider {
    height: 1px;
    background: var(--border-light);
    margin: 0 0.5rem 0.5rem;
  }

  .type-list {
    display: flex;
    flex-direction: column;
  }

  .type-row {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .type-row:hover {
    background: var(--bg-secondary);
  }

  .type-row:focus {
    outline: none;
    background: var(--bg-secondary);
  }

  .type-icon {
    font-size: 1rem;
    line-height: 1.4;
    flex-shrink: 0;
  }

  .type-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .type-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .type-purpose {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .empty-state,
  .loading-state {
    padding: 2rem 1rem;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .empty-state p,
  .loading-state p {
    margin: 0;
  }
</style>
