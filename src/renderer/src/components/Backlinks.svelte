<script lang="ts">
  import type { NoteLinkRow } from '@/server/database/schema';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { getChatService } from '../services/chatService.js';
  import { notesStore } from '../services/noteStore.svelte';

  interface Props {
    noteId: string;
    onNoteSelect: (note: NoteMetadata) => void;
  }

  let { noteId, onNoteSelect }: Props = $props();

  let backlinks = $state<NoteLinkRow[]>([]);
  let expanded = $state(true);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Load backlinks when note changes
  $effect(() => {
    if (noteId) {
      loadBacklinks(noteId);
    }
  });

  // Reload backlinks when notes are updated (in case links changed)
  $effect(() => {
    const updateCounter = notesStore.wikilinksUpdateCounter;
    if (updateCounter > 0 && noteId) {
      loadBacklinks(noteId);
    }
  });

  async function loadBacklinks(id: string): Promise<void> {
    try {
      loading = true;
      error = null;
      const noteService = getChatService();

      if (await noteService.isReady()) {
        const result = await noteService.getBacklinks({ identifier: id });
        backlinks = result;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load backlinks';
      console.error('Error loading backlinks:', err);
      backlinks = [];
    } finally {
      loading = false;
    }
  }

  async function handleBacklinkClick(link: NoteLinkRow): Promise<void> {
    // Find the note metadata for the source note
    const sourceNote = notesStore.notes.find((n) => n.id === link.source_note_id);

    if (sourceNote) {
      onNoteSelect(sourceNote);
    } else {
      // If not in the cached list, fetch the note directly
      try {
        const noteService = getChatService();
        const noteData = await noteService.getNote({ identifier: link.source_note_id });

        if (noteData) {
          const noteMetadata: NoteMetadata = {
            id: noteData.id,
            title: noteData.title || 'Untitled',
            type: noteData.type,
            filename: noteData.filename,
            created: noteData.created,
            modified: noteData.updated,
            size: noteData.size || 0,
            tags: noteData.metadata?.tags || [],
            path: noteData.path
          };
          onNoteSelect(noteMetadata);
        }
      } catch (err) {
        console.error('Error loading backlink note:', err);
      }
    }
  }

  function formatNoteId(noteId: string): string {
    // Extract readable parts from note ID (e.g., "note/my-note" -> "note")
    const parts = noteId.split('/');
    return parts[0] || noteId;
  }
</script>

<div class="backlinks-container">
  <button
    class="backlinks-header"
    onclick={() => (expanded = !expanded)}
    aria-expanded={expanded}
  >
    <span class="expand-icon" class:expanded>▼</span>
    <span class="backlinks-title">Backlinks</span>
    {#if backlinks.length > 0}
      <span class="backlinks-count">{backlinks.length}</span>
    {/if}
  </button>

  {#if expanded}
    <div class="backlinks-content">
      {#if loading}
        <div class="loading-state">Loading backlinks...</div>
      {:else if error}
        <div class="error-state">{error}</div>
      {:else if backlinks.length === 0}
        <div class="empty-state">No backlinks found</div>
      {:else}
        <div class="backlinks-list">
          {#each backlinks as link (link.id)}
            <button class="backlink-item" onclick={() => handleBacklinkClick(link)}>
              <span class="backlink-type">{formatNoteId(link.source_note_id)}</span>
              <span class="backlink-title">{link.target_title}</span>
              {#if link.link_text && link.link_text !== link.target_title}
                <span class="backlink-text">({link.link_text})</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .backlinks-container {
    border-top: 1px solid var(--border-light);
    padding: 1rem 0;
    margin-top: 2rem;
  }

  .backlinks-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    transition: color 0.2s ease;
  }

  .backlinks-header:hover {
    color: var(--text-primary);
  }

  .expand-icon {
    display: inline-block;
    transition: transform 0.2s ease;
    font-size: 0.75rem;
    transform: rotate(-90deg);
  }

  .expand-icon.expanded {
    transform: rotate(0deg);
  }

  .backlinks-title {
    flex: 1;
    text-align: left;
  }

  .backlinks-count {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: var(--bg-tertiary);
    border-radius: 12px;
    color: var(--text-muted);
  }

  .backlinks-content {
    padding: 0.5rem 0.5rem 0.5rem 2rem;
  }

  .loading-state,
  .error-state,
  .empty-state {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .error-state {
    color: var(--accent-primary);
  }

  .backlinks-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .backlink-item {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    font-size: 0.875rem;
    transition: background-color 0.2s ease;
  }

  .backlink-item:hover {
    background: var(--bg-tertiary);
  }

  .backlink-type {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .backlink-title {
    color: var(--text-primary);
    flex: 1;
  }

  .backlink-text {
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-style: italic;
  }
</style>
