<script lang="ts">
  import { onMount } from 'svelte';
  import { reviewStore } from '../../stores/reviewStore.svelte';
  import { notesStore } from '../../services/noteStore.svelte';

  interface Props {
    onReviewNote: (noteId: string) => void;
    onSearchChange: (query: string) => void;
  }

  let { onReviewNote, onSearchChange }: Props = $props();

  interface SearchableNote {
    id: string;
    noteId: string;
    title: string;
    nextReview: string;
    reviewCount: number;
  }

  let searchQuery = $state('');
  let searchableNotes = $state<SearchableNote[]>([]);
  let isDropdownOpen = $state(false);
  let selectedIndex = $state(-1);
  let searchInputRef: HTMLInputElement | undefined = $state();

  // Filter notes based on search query
  const filteredNotes = $derived.by(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    return searchableNotes
      .filter((note) => note.title.toLowerCase().includes(query))
      .slice(0, 8); // Limit to 8 results
  });

  onMount(() => {
    loadSearchableNotes();
  });

  async function loadSearchableNotes(): Promise<void> {
    try {
      const items = await reviewStore.getAllReviewHistory();

      searchableNotes = items.map((item) => {
        const note = notesStore.allNotes.find((n) => n.id === item.noteId);
        return {
          id: item.id,
          noteId: item.noteId,
          title: note?.title || 'Unknown Note',
          nextReview: item.nextReview,
          reviewCount: item.reviewCount
        };
      });
    } catch (error) {
      console.error('Failed to load searchable notes:', error);
    }
  }

  function handleInput(): void {
    onSearchChange(searchQuery);
    isDropdownOpen = searchQuery.trim().length > 0;
    selectedIndex = -1;
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!isDropdownOpen || filteredNotes.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filteredNotes.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredNotes.length) {
          selectNote(filteredNotes[selectedIndex].noteId);
        }
        break;
      case 'Escape':
        event.preventDefault();
        closeDropdown();
        break;
    }
  }

  function selectNote(noteId: string): void {
    onReviewNote(noteId);
    closeDropdown();
    searchQuery = '';
    onSearchChange('');
  }

  function closeDropdown(): void {
    isDropdownOpen = false;
    selectedIndex = -1;
  }

  function handleBlur(): void {
    // Delay to allow click events on dropdown items
    setTimeout(() => {
      if (!searchInputRef?.contains(document.activeElement)) {
        closeDropdown();
      }
    }, 200);
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateStr = date.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'Due today';
    if (dateStr === tomorrowStr) return 'Due tomorrow';
    if (dateStr < todayStr) return 'Overdue';

    return `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
</script>

<div class="review-search-bar">
  <div class="search-input-container">
    <svg
      class="search-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="11" cy="11" r="8"></circle>
      <path d="m21 21-4.35-4.35"></path>
    </svg>

    <input
      bind:this={searchInputRef}
      type="text"
      class="search-input"
      placeholder="Search notes to review..."
      bind:value={searchQuery}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      onblur={handleBlur}
      aria-label="Search notes"
      aria-autocomplete="list"
      aria-controls="search-results"
    />

    {#if searchQuery}
      <button
        class="clear-btn"
        onclick={() => {
          searchQuery = '';
          handleInput();
        }}
        aria-label="Clear search"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    {/if}
  </div>

  {#if isDropdownOpen && filteredNotes.length > 0}
    <div class="search-dropdown" id="search-results" role="listbox">
      {#each filteredNotes as note, index (note.noteId)}
        <button
          class="search-result"
          class:selected={index === selectedIndex}
          onclick={() => selectNote(note.noteId)}
          role="option"
          aria-selected={index === selectedIndex}
        >
          <div class="result-content">
            <div class="result-title">{note.title}</div>
            <div class="result-meta">
              <span class="meta-item">{formatDate(note.nextReview)}</span>
              <span class="meta-separator">•</span>
              <span class="meta-item"
                >{note.reviewCount} review{note.reviewCount === 1 ? '' : 's'}</span
              >
            </div>
          </div>
          <div class="result-action">
            <span class="action-text">Review →</span>
          </div>
        </button>
      {/each}
    </div>
  {:else if isDropdownOpen && searchQuery.trim() && filteredNotes.length === 0}
    <div class="search-dropdown">
      <div class="no-results">
        No notes found matching "{searchQuery}"
      </div>
    </div>
  {/if}
</div>

<style>
  .review-search-bar {
    position: relative;
    width: 100%;
  }

  .search-input-container {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary);
    border: 2px solid var(--border);
    border-radius: 8px;
    transition: all 0.2s;
  }

  .search-input-container:focus-within {
    border-color: var(--accent-primary);
    background: var(--bg-primary);
  }

  .search-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-size: 1rem;
    color: var(--text-primary);
    font-family: inherit;
  }

  .search-input::placeholder {
    color: var(--text-tertiary);
  }

  .clear-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
    transition: color 0.2s;
    flex-shrink: 0;
  }

  .clear-btn:hover {
    color: var(--text-primary);
  }

  .search-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 400px;
    overflow-y: auto;
    z-index: 1000;
  }

  .search-result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    padding: 0.875rem 1rem;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }

  .search-result:last-child {
    border-bottom: none;
  }

  .search-result:hover,
  .search-result.selected {
    background: var(--bg-hover);
  }

  .result-content {
    flex: 1;
    min-width: 0;
  }

  .result-title {
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .meta-item {
    white-space: nowrap;
  }

  .meta-separator {
    color: var(--text-tertiary);
  }

  .result-action {
    flex-shrink: 0;
  }

  .action-text {
    font-size: 0.875rem;
    color: var(--accent-primary);
    font-weight: 500;
  }

  .no-results {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
</style>
