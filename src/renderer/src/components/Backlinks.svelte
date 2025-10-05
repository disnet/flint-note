<script lang="ts">
  import type { NoteLinkRow } from '@/server/database/schema';
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { getChatService } from '../services/chatService.js';
  import { notesStore } from '../services/noteStore.svelte';
  import { wikilinkService } from '../services/wikilinkService.svelte.js';
  import BacklinkContextEditor from './BacklinkContextEditor.svelte';

  interface Props {
    noteId: string;
    onNoteSelect: (note: NoteMetadata, lineNumber?: number) => void;
  }

  interface BacklinkWithContext {
    link: NoteLinkRow;
    context: string | null;
    sourceTitle: string | null;
    sourceType: string | null;
    contextExpanded: boolean;
  }

  interface GroupedBacklink {
    sourceNoteId: string;
    sourceTitle: string | null;
    sourceType: string | null;
    links: BacklinkWithContext[];
  }

  let { noteId, onNoteSelect }: Props = $props();

  let backlinks = $state<BacklinkWithContext[]>([]);
  let expanded = $state(true);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Group backlinks by source note
  let groupedBacklinks = $derived.by(() => {
    const groups = new Map<string, GroupedBacklink>();

    for (const backlink of backlinks) {
      const sourceId = backlink.link.source_note_id;

      if (!groups.has(sourceId)) {
        groups.set(sourceId, {
          sourceNoteId: sourceId,
          sourceTitle: backlink.sourceTitle,
          sourceType: backlink.sourceType,
          links: []
        });
      }

      groups.get(sourceId)!.links.push(backlink);
    }

    return Array.from(groups.values());
  });

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
        const rawBacklinks = await noteService.getBacklinks({ identifier: id });

        // Fetch context for each backlink
        backlinks = await Promise.all(
          rawBacklinks.map(async (link) => {
            try {
              const sourceNote = await noteService.getNote({
                identifier: link.source_note_id
              });

              let context: string | null = null;
              if (sourceNote?.content && link.line_number != null) {
                const lines = sourceNote.content.split('\n');
                context = lines[link.line_number - 1]?.trim() || null;
              }

              return {
                link,
                context,
                sourceTitle: sourceNote?.title || null,
                sourceType: sourceNote?.type || null,
                contextExpanded: true
              };
            } catch {
              return {
                link,
                context: null,
                sourceTitle: null,
                sourceType: null,
                contextExpanded: true
              };
            }
          })
        );
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load backlinks';
      console.error('Error loading backlinks:', err);
      backlinks = [];
    } finally {
      loading = false;
    }
  }

  function expandAll(event: Event): void {
    event.stopPropagation();
    backlinks.forEach((backlink) => {
      if (backlink.context) {
        backlink.contextExpanded = true;
      }
    });
  }

  function collapseAll(event: Event): void {
    event.stopPropagation();
    backlinks.forEach((backlink) => {
      if (backlink.context) {
        backlink.contextExpanded = false;
      }
    });
  }

  async function handleGroupClick(group: GroupedBacklink): Promise<void> {
    // Navigate to the source note without a line number
    await handleNoteNavigation(group.sourceNoteId);
  }

  async function handleBacklinkClick(
    backlink: BacklinkWithContext,
    lineNumber?: number
  ): Promise<void> {
    await handleNoteNavigation(backlink.link.source_note_id, lineNumber);
  }

  async function handleNoteNavigation(
    noteId: string,
    lineNumber?: number
  ): Promise<void> {
    // Find the note metadata for the source note
    const sourceNote = notesStore.notes.find((n) => n.id === noteId);

    if (sourceNote) {
      onNoteSelect(sourceNote, lineNumber);
    } else {
      // If not in the cached list, fetch the note directly
      try {
        const noteService = getChatService();
        const noteData = await noteService.getNote({
          identifier: noteId
        });

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
          onNoteSelect(noteMetadata, lineNumber);
        }
      } catch (err) {
        console.error('Error loading backlink note:', err);
      }
    }
  }

  function handleNavigateToSource(backlink: BacklinkWithContext): void {
    handleBacklinkClick(backlink, backlink.link.line_number ?? undefined);
  }

  async function handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean
  ): Promise<void> {
    // Use centralized wikilink service
    await wikilinkService.handleWikilinkClick(noteId, title, shouldCreate);
  }
</script>

<div class="backlinks-container">
  <div class="backlinks-header-wrapper">
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
    {#if expanded && backlinks.length > 0 && backlinks.some((b) => b.context)}
      <div class="context-controls">
        <button class="context-control-btn" onclick={expandAll}>Show all</button>
        <button class="context-control-btn" onclick={collapseAll}>Hide all</button>
      </div>
    {/if}
  </div>

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
          {#each groupedBacklinks as group (group.sourceNoteId)}
            <div class="backlink-group">
              <div class="group-header">
                <span class="backlink-type">{group.sourceType || 'note'}</span>
                <button
                  class="backlink-title-button"
                  onclick={() => handleGroupClick(group)}
                >
                  <span class="backlink-title"
                    >{group.sourceTitle || group.sourceNoteId}</span
                  >
                </button>
                {#if group.links.length > 1}
                  <span class="link-count">{group.links.length}</span>
                {/if}
              </div>

              <div class="group-contexts">
                {#each group.links as backlink, index (backlink.link.id)}
                  <div class="backlink-context-item">
                    {#if index > 0}
                      <div class="context-separator"></div>
                    {/if}
                    {#if backlink.context}
                      <BacklinkContextEditor
                        sourceNoteId={backlink.link.source_note_id}
                        lineNumber={backlink.link.line_number ?? 1}
                        initialContent={backlink.context}
                        onNavigate={() => handleNavigateToSource(backlink)}
                        onWikilinkClick={handleWikilinkClick}
                      />
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
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

  .backlinks-header-wrapper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .backlinks-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
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

  .context-controls {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem;
  }

  .context-control-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid var(--border-light);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-secondary);
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
  }

  .context-control-btn:hover {
    background: var(--bg-tertiary);
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
    gap: 0.75rem;
  }

  .backlink-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .group-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.5rem;
    background: transparent;
    border-radius: 4px;
    transition: background-color 0.2s ease;
  }

  .group-header:hover {
    background: var(--bg-tertiary);
  }

  .group-contexts {
    display: flex;
    flex-direction: column;
    margin-left: 1.5rem;
    padding-left: 0.5rem;
    border-left: 2px solid var(--border-light);
  }

  .backlink-context-item {
    display: flex;
    flex-direction: column;
  }

  .context-separator {
    height: 1px;
    background: var(--border-light);
    margin: 0.5rem 0 0.5rem 1.25rem;
  }

  .link-count {
    font-size: 0.75rem;
    padding: 0.125rem 0.375rem;
    background: var(--bg-tertiary);
    border-radius: 10px;
    color: var(--text-muted);
    margin-left: auto;
  }

  .backlink-title-button {
    display: inline-flex;
    align-items: baseline;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    color: inherit;
    text-align: left;
    flex: 1;
  }

  .backlink-title-button:hover .backlink-title {
    text-decoration: underline;
  }

  .backlink-type {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .backlink-title {
    color: var(--text-primary);
    font-weight: 500;
  }
</style>
