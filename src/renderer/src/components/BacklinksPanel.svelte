<script lang="ts">
  /**
   * Backlinks Panel Component
   *
   * Displays backlinks to the current note with collapsible note sections
   * and editable CodeMirror line editors for each link occurrence.
   */
  import { SvelteSet } from 'svelte/reactivity';
  import type { BacklinkResult, WikilinkClickHandler } from '../lib/automerge';
  import { getNoteType } from '../lib/automerge';
  import BacklinkLineEditor from './BacklinkLineEditor.svelte';

  interface Props {
    backlinks: BacklinkResult[];
    onNavigate: (noteId: string) => void;
    onWikilinkClick?: WikilinkClickHandler;
  }

  let { backlinks, onNavigate, onWikilinkClick }: Props = $props();

  // Track expanded notes
  let expandedNotes = new SvelteSet<string>();

  // Overall panel expansion state - starts collapsed
  let isPanelExpanded = $state(false);

  function toggleNote(noteId: string): void {
    if (expandedNotes.has(noteId)) {
      expandedNotes.delete(noteId);
    } else {
      expandedNotes.add(noteId);
    }
  }

  function expandAll(): void {
    backlinks.forEach((bl) => expandedNotes.add(bl.note.id));
  }

  function collapseAll(): void {
    expandedNotes.clear();
  }

  function handleNoteClick(noteId: string): void {
    onNavigate(noteId);
  }

  function getNoteIcon(note: { type?: string }): string {
    if (note.type) {
      const noteType = getNoteType(note.type);
      return noteType?.icon || '📝';
    }
    return '📝';
  }
</script>

{#if backlinks.length > 0}
  <div class="backlinks-panel">
    <!-- Header - clicking toggles expand -->
    <div class="backlinks-header">
      <button
        class="header-toggle"
        onclick={() => (isPanelExpanded = !isPanelExpanded)}
        aria-expanded={isPanelExpanded}
      >
        <span class="header-arrow" class:expanded={isPanelExpanded}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </span>
        <span class="header-title">Backlinks</span>
        <span class="header-count">{backlinks.length}</span>
      </button>

      {#if isPanelExpanded}
        <div class="header-controls">
          <button
            class="control-btn"
            onclick={() => expandAll()}
            title="Expand all"
            aria-label="Expand all backlinks"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="7 13 12 18 17 13"></polyline>
              <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
          </button>
          <button
            class="control-btn"
            onclick={() => collapseAll()}
            title="Collapse all"
            aria-label="Collapse all backlinks"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="17 11 12 6 7 11"></polyline>
              <polyline points="17 18 12 13 7 18"></polyline>
            </svg>
          </button>
        </div>
      {/if}
    </div>

    {#if isPanelExpanded}
      <div class="backlinks-list">
        {#each backlinks as backlink (backlink.note.id)}
          <div class="backlink-note">
            <!-- Note header row - clicking row toggles expand -->
            <button
              class="note-row"
              onclick={() => toggleNote(backlink.note.id)}
              aria-expanded={expandedNotes.has(backlink.note.id)}
            >
              <span
                class="disclosure-arrow"
                class:expanded={expandedNotes.has(backlink.note.id)}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </span>
              <span class="note-icon">{getNoteIcon(backlink.note)}</span>
              <span
                class="note-title"
                role="link"
                onclick={(e) => {
                  e.stopPropagation();
                  handleNoteClick(backlink.note.id);
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    handleNoteClick(backlink.note.id);
                  }
                }}
                tabindex="0"
              >
                {backlink.note.title || 'Untitled'}
              </span>
              <span class="row-spacer"></span>
              <span class="occurrence-count">{backlink.occurrences.length}</span>
            </button>

            <!-- Expanded occurrences -->
            {#if expandedNotes.has(backlink.note.id)}
              <div class="occurrences-list">
                {#each backlink.occurrences as occurrence, idx (idx)}
                  <div class="occurrence-line">
                    <span class="line-gutter">|</span>
                    <BacklinkLineEditor
                      sourceNoteId={backlink.note.id}
                      lineNumber={occurrence.lineNumber}
                      initialText={occurrence.lineText}
                      {onWikilinkClick}
                    />
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .backlinks-panel {
    flex-shrink: 0;
    padding-bottom: 1.5rem;
  }

  /* Header */
  .backlinks-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0.5rem 1rem;
    width: 100%;
    border-radius: 4px;
  }

  .header-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    border-radius: 4px;
    transition: background 0.15s ease;
  }

  .header-toggle:hover {
    background: var(--bg-hover);
  }

  .header-arrow {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    transition: transform 0.15s ease;
  }

  .header-arrow.expanded {
    transform: rotate(90deg);
  }

  .header-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .header-count {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .header-controls {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }

  .control-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .control-btn:hover {
    color: var(--text-secondary);
    background: var(--bg-hover);
  }

  /* Note row */
  .backlink-note {
    margin-top: 0.25rem;
  }

  .note-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0.25rem 1rem;
    width: 100%;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    border-radius: 4px;
    transition: background 0.15s ease;
  }

  .note-row:hover {
    background: var(--bg-hover);
  }

  .disclosure-arrow {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    transition: transform 0.15s ease;
  }

  .disclosure-arrow.expanded {
    transform: rotate(90deg);
  }

  .note-icon {
    flex-shrink: 0;
    font-size: 14px;
    line-height: 1;
  }

  .note-title {
    color: var(--text-primary);
    font-size: 1rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .note-title:hover {
    text-decoration: underline;
    color: var(--accent-primary);
  }

  .row-spacer {
    flex: 1;
  }

  .occurrence-count {
    flex-shrink: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* Occurrences list */
  .occurrences-list {
    padding: 0 1rem 0.25rem 2.5rem;
  }

  .occurrence-line {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 0.125rem 0;
  }

  .line-gutter {
    flex-shrink: 0;
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1.5;
    user-select: none;
    opacity: 0.5;
  }
</style>
