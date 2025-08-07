<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface SearchBarProps {
    onNoteSelect?: (note: NoteMetadata) => void;
  }

  let { onNoteSelect }: SearchBarProps = $props();

  let searchValue = $state('');
  let isSearchFocused = $state(false);
  let suggestionText = $state('');
  const filteredResults = $derived.by(() => {
    if (!searchValue.trim()) {
      return [];
    }

    const query = searchValue.toLowerCase();

    // Get all notes directly from the store
    const allNotes = notesStore.notes;

    if (allNotes.length === 0) {
      return [];
    }

    // Filter and sort results
    const results = allNotes
      .filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.filename.toLowerCase().includes(query) ||
          note.tags.some((tag) => tag.toLowerCase().includes(query))
      )
      .sort((a, b) => {
        // Prioritize title matches over filename matches
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();

        if (aTitle.startsWith(query) && !bTitle.startsWith(query)) return -1;
        if (bTitle.startsWith(query) && !aTitle.startsWith(query)) return 1;

        return aTitle.localeCompare(bTitle);
      })
      .slice(0, 10);

    return results;
  });

  let selectedIndex = $state(-1);

  // Auto-select first result and set suggestion text when search value changes
  $effect(() => {
    if (searchValue && filteredResults.length > 0) {
      selectedIndex = 0;
      const firstResult = filteredResults[0];
      const query = searchValue.toLowerCase();

      // Show suggestion text if the first result starts with the query
      if (firstResult.title.toLowerCase().startsWith(query)) {
        suggestionText = firstResult.title;
      } else {
        suggestionText = '';
      }
    } else {
      selectedIndex = -1;
      suggestionText = '';
    }
  });

  function handleSearchFocus(): void {
    isSearchFocused = true;
  }

  function handleSearchBlur(): void {
    setTimeout(() => {
      isSearchFocused = false;
    }, 200);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const results = filteredResults;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        selectNote(results[selectedIndex]);
      }
    } else if (event.key === 'Tab' || event.key === 'ArrowRight') {
      // Accept the suggestion on Tab or Right arrow
      if (suggestionText && suggestionText !== searchValue) {
        event.preventDefault();
        searchValue = suggestionText;
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      searchValue = '';
      selectedIndex = -1;
      suggestionText = '';
      (event.target as HTMLInputElement).blur();
    }
  }

  function selectNote(note: NoteMetadata): void {
    searchValue = '';
    selectedIndex = -1;
    suggestionText = '';
    isSearchFocused = false;
    onNoteSelect?.(note);
  }
</script>

<div class="search-container">
  <div class="search-input-wrapper">
    <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
      <path
        fill-rule="evenodd"
        d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
        clip-rule="evenodd"
      />
    </svg>
    <div class="input-container">
      <!-- Suggestion text background -->
      {#if suggestionText && searchValue && suggestionText
          .toLowerCase()
          .startsWith(searchValue.toLowerCase())}
        <div class="suggestion-text" aria-hidden="true">
          <span class="suggestion-typed">{searchValue}</span><span
            class="suggestion-completion">{suggestionText.slice(searchValue.length)}</span
          >
        </div>
      {/if}
      <input
        id="global-search"
        type="text"
        placeholder="Search notes..."
        bind:value={searchValue}
        onfocus={handleSearchFocus}
        onblur={handleSearchBlur}
        onkeydown={handleKeyDown}
        class="search-input"
      />
    </div>
  </div>

  {#if isSearchFocused && filteredResults.length > 0}
    <div class="search-results">
      {#each filteredResults as note, index (note.id)}
        <button
          class="search-result-item"
          class:selected={index === selectedIndex}
          onclick={() => selectNote(note)}
        >
          <div class="result-title">{note.title}</div>
          <div class="result-meta">
            <span class="result-path">{note.filename}</span>
            {#if note.type}
              <span class="result-type">{note.type}</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .search-container {
    position: relative;
    min-width: 50ch;
    max-width: 75ch;
  }

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-container {
    position: relative;
    flex: 1;
  }

  .input-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-primary);
    border-radius: 1rem;
    z-index: 0;
  }

  .search-icon {
    position: absolute;
    left: 1rem;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--text-tertiary);
    pointer-events: none;
    z-index: 3;
  }

  .search-input {
    width: 100%;
    padding: 1rem 1rem 1rem 3rem;
    border: 1px solid var(--border-light);
    border-radius: 1rem;
    background: transparent !important;
    color: var(--text-primary);
    font-size: 1.125rem;
    transition: all 0.2s ease;
    box-shadow:
      0 20px 40px rgba(0, 0, 0, 0.3),
      0 10px 20px rgba(0, 0, 0, 0.2),
      0 4px 8px rgba(0, 0, 0, 0.1);
    position: relative;
    z-index: 2;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow:
      0 0 0 3px rgba(99, 102, 241, 0.2),
      0 20px 40px rgba(0, 0, 0, 0.3),
      0 10px 20px rgba(0, 0, 0, 0.2),
      0 4px 8px rgba(0, 0, 0, 0.1);
  }

  .search-input::placeholder {
    color: var(--text-tertiary);
  }

  .suggestion-text {
    position: absolute;
    top: 1px;
    left: 1px;
    right: 1px;
    bottom: 1px;
    padding: 1rem 1rem 1rem 3rem;
    border-radius: 1rem;
    background: transparent;
    font-size: 1.125rem;
    pointer-events: none;
    white-space: nowrap;
    overflow: hidden;
    z-index: 1;
    display: flex;
    align-items: center;
  }

  .suggestion-typed {
    color: transparent;
    visibility: hidden;
  }

  .suggestion-completion {
    color: var(--text-primary);
    opacity: 0.4;
    font-weight: normal;
  }

  .search-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.75rem;
    box-shadow:
      0 25px 50px rgba(0, 0, 0, 0.25),
      0 10px 20px rgba(0, 0, 0, 0.15);
    z-index: 1001;
    max-height: 400px;
    overflow-y: auto;
    margin-top: 0.5rem;
  }

  .search-result-item {
    width: 100%;
    padding: 1rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .search-result-item:last-child {
    border-bottom: none;
  }

  .search-result-item:hover,
  .search-result-item.selected {
    background: var(--bg-secondary);
  }

  .result-title {
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .result-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .result-path {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    flex: 1;
  }

  .result-type {
    font-size: 0.625rem;
    color: var(--accent-primary);
    background: var(--accent-secondary-alpha);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  @media (max-width: 768px) {
    .search-container {
      max-width: 200px;
    }

    .search-input {
      font-size: 0.8rem;
      padding: 0.4rem 0.6rem 0.4rem 2rem;
    }

    .search-icon {
      left: 0.6rem;
      width: 0.9rem;
      height: 0.9rem;
    }
  }
</style>
