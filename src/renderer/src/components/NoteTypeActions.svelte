<script lang="ts">
  import type { GetNoteTypeInfoResult } from '@flint-note/server/dist/server/types';
  /* eslint-disable @typescript-eslint/no-explicit-any */
  import { getChatService } from '../services/chatService';

  interface Props {
    typeName: string;
    onCreateNote: (noteType: string) => void;
  }

  let { typeName, onCreateNote }: Props = $props();

  let showTypeInfo = $state(false);
  let typeInfo = $state<GetNoteTypeInfoResult | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function loadTypeInfo(): Promise<void> {
    if (typeInfo || loading) return;

    try {
      loading = true;
      error = null;
      const noteService = getChatService();
      if (await noteService.isReady()) {
        typeInfo = await noteService.getNoteTypeInfo({ typeName });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load note type info';
      console.error('Error loading note type info:', err);
    } finally {
      loading = false;
    }
  }

  function toggleTypeInfo(): void {
    showTypeInfo = !showTypeInfo;
    if (showTypeInfo && !typeInfo) {
      loadTypeInfo();
    }
  }

  function handleCreateNote(): void {
    onCreateNote(typeName);
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Element;
    const popover = target.closest('.note-type-actions');
    if (!popover && showTypeInfo) {
      showTypeInfo = false;
    }
  }

  $effect(() => {
    if (showTypeInfo) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return;
  });
</script>

<div class="note-type-actions">
  <button
    class="action-btn info-btn"
    onclick={toggleTypeInfo}
    title="View note type information"
    aria-label="View note type information"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M12 16v-4"></path>
      <path d="M12 8h.01"></path>
    </svg>
  </button>

  <button
    class="action-btn create-btn"
    onclick={handleCreateNote}
    title="Create new {typeName} note"
    aria-label="Create new {typeName} note"
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
  </button>
</div>

{#if showTypeInfo}
  <div class="type-info-popover">
    {#if loading}
      <div class="loading">Loading note type information...</div>
    {:else if error}
      <div class="error">Error: {error}</div>
    {:else if typeInfo}
      <div class="type-info-content">
        <h4>{typeName}</h4>

        {#if typeInfo.purpose}
          <div class="info-section">
            <h5>Description</h5>
            <p>{typeInfo.purpose}</p>
          </div>
        {:else}
          <div class="info-section">
            <h5>Description</h5>
            <p class="no-data">No description available</p>
          </div>
        {/if}

        {#if typeInfo.instructions && typeInfo.instructions.length > 0}
          <div class="info-section">
            <h5>Agent Instructions</h5>
            <ul>
              {#each typeInfo.instructions as instruction, index (`${typeName}-instruction-${index}`)}
                <li>{instruction}</li>
              {/each}
            </ul>
          </div>
        {:else}
          <div class="info-section">
            <h5>Agent Instructions</h5>
            <p class="no-data">No agent instructions defined</p>
          </div>
        {/if}

        {#if typeInfo.metadata_schema}
          <div class="info-section">
            <h5>Metadata Schema</h5>
            <div class="schema-info">
              {#if typeInfo.metadata_schema.fields && Object.keys(typeInfo.metadata_schema.fields).length > 0}
                {#each Object.entries(typeInfo.metadata_schema.fields) as [_, fieldInfo] (`${typeName}-field-${fieldInfo.name}`)}
                  <div class="schema-field">
                    <span class="field-name">{fieldInfo.name}</span>
                    <span class="field-type">({fieldInfo.type})</span>
                    {#if fieldInfo.description}
                      <span class="field-description">
                        {fieldInfo.description}
                      </span>
                    {/if}
                  </div>
                {/each}
              {:else}
                <p class="no-data">No metadata schema fields defined</p>
              {/if}
            </div>
          </div>
        {:else}
          <div class="info-section">
            <h5>Metadata Schema</h5>
            <p class="no-data">No metadata schema defined</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .note-type-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .action-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 0.25rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: var(--bg-secondary);
    color: var(--accent-primary);
  }

  .type-info-popover {
    position: absolute;
    top: 100%;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    padding: 1rem;
    min-width: 300px;
    max-width: 400px;
    box-shadow: var(--shadow-medium);
    z-index: 1000;
    margin-top: 0.5rem;
    animation: popoverSlideIn 0.2s ease-out;
  }

  @keyframes popoverSlideIn {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .loading,
  .error {
    text-align: center;
    padding: 1rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .error {
    color: var(--error-text);
  }

  .type-info-content h4 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .info-section {
    margin-bottom: 1rem;
  }

  .info-section:last-child {
    margin-bottom: 0;
  }

  .info-section h5 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .info-section p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .info-section ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .info-section li {
    margin-bottom: 0.25rem;
  }

  .schema-info {
    font-size: 0.875rem;
  }

  .schema-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding: 0.25rem;
    background: var(--bg-secondary);
    border-radius: 0.25rem;
  }

  .field-name {
    font-weight: 500;
    color: var(--text-primary);
  }

  .field-type {
    color: var(--text-muted);
    font-family: monospace;
    font-size: 0.8rem;
  }

  .field-description {
    color: var(--text-secondary);
    flex: 1;
  }

  .no-data {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.875rem;
  }
</style>
