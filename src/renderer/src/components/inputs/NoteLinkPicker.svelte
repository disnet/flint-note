<script lang="ts">
  /**
   * Shared note link picker dropdown
   * Searchable dropdown for selecting notes with keyboard navigation
   */
  import { getAllNotes } from '../../lib/automerge';
  import type { NoteMetadata } from '../../lib/automerge';

  interface Props {
    /** Called when a note is selected */
    onSelect: (noteId: string) => void;
    /** Called when picker should close */
    onClose: () => void;
    /** Note IDs to exclude from picker */
    excludeNoteIds?: string[];
    /** Position of the picker */
    position: { top: number; left: number };
    /** Width of the picker */
    width?: number;
    /** Whether to keep open after selection (for multi-select) */
    multiSelect?: boolean;
    /** Initial search query */
    searchQuery?: string;
    /** Called when search query changes */
    onSearchChange?: (query: string) => void;
    /** Hide the internal search input (when search is controlled externally) */
    hideSearchInput?: boolean;
  }

  let {
    onSelect,
    onClose,
    excludeNoteIds = [],
    position,
    width = 280,
    multiSelect = false,
    searchQuery = '',
    onSearchChange,
    hideSearchInput = false
  }: Props = $props();

  let inputRef = $state<HTMLInputElement | null>(null);
  let selectedIndex = $state(0);
  // eslint-disable-next-line svelte/prefer-writable-derived -- controlled input pattern
  let internalQuery = $state(searchQuery);

  // Sync query from props when controlled externally
  $effect(() => {
    internalQuery = searchQuery;
  });

  // Focus input when mounted (only if showing internal search)
  $effect(() => {
    if (inputRef && !hideSearchInput) {
      inputRef.focus();
    }
  });

  // Get all non-archived notes excluding specified IDs
  const allNotes = $derived(
    getAllNotes().filter(
      (n: NoteMetadata) => !n.archived && !excludeNoteIds.includes(n.id)
    )
  );

  // Filter notes by search query
  const filteredNotes = $derived(
    internalQuery.trim()
      ? allNotes.filter(
          (n: NoteMetadata) =>
            n.title.toLowerCase().includes(internalQuery.toLowerCase()) ||
            n.id.toLowerCase().includes(internalQuery.toLowerCase())
        )
      : allNotes.slice(0, 10)
  );

  // Reset selection when query changes
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    internalQuery;
    selectedIndex = 0;
  });

  function handleInput(e: Event): void {
    const value = (e.currentTarget as HTMLInputElement).value;
    internalQuery = value;
    onSearchChange?.(value);
  }

  function selectNote(noteId: string): void {
    onSelect(noteId);
    if (!multiSelect) {
      onClose();
    } else {
      // Clear search for next selection
      internalQuery = '';
      onSearchChange?.('');
    }
  }

  function selectCurrentNote(): void {
    if (filteredNotes.length > 0 && selectedIndex < filteredNotes.length) {
      selectNote(filteredNotes[selectedIndex].id);
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredNotes.length - 1);
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectCurrentNote();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  function handleBlur(): void {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      onClose();
    }, 150);
  }

  // Expose keyboard handler for external use when hideSearchInput is true
  export function handleExternalKeydown(e: KeyboardEvent): void {
    handleKeydown(e);
  }
</script>

<div
  class="picker-dropdown"
  style="top: {position.top}px; left: {position.left}px; width: {width}px;"
>
  {#if !hideSearchInput}
    <input
      bind:this={inputRef}
      type="text"
      class="picker-search"
      placeholder="Search notes..."
      value={internalQuery}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onblur={handleBlur}
    />
  {/if}
  <div class="picker-results">
    {#if filteredNotes.length > 0}
      {#each filteredNotes as n, i (n.id)}
        <button
          type="button"
          class="picker-item"
          class:selected={i === selectedIndex}
          onmousedown={() => selectNote(n.id)}
          onmouseenter={() => (selectedIndex = i)}
        >
          <span class="picker-item-title">{n.title || 'Untitled'}</span>
        </button>
      {/each}
    {:else}
      <div class="picker-empty">No notes found</div>
    {/if}
  </div>
</div>

<style>
  .picker-dropdown {
    position: fixed;
    z-index: 10000;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    overflow: hidden;
  }

  .picker-search {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.8rem;
    outline: none;
  }

  .picker-search:focus {
    background: var(--bg-primary);
  }

  .picker-results {
    max-height: 240px;
    overflow-y: auto;
  }

  .picker-item {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .picker-item:hover,
  .picker-item.selected {
    background: var(--bg-secondary);
  }

  .picker-item-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-empty {
    padding: 0.75rem;
    color: var(--text-muted);
    font-size: 0.8rem;
    text-align: center;
  }
</style>
