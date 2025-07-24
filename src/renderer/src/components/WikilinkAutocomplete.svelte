<script lang="ts">
  import type { NoteMetadata } from '../services/noteStore.svelte';
  import { notesStore } from '../services/noteStore.svelte';

  interface Props {
    query: string;
    position: { x: number; y: number };
    onSelect: (noteTitle: string, noteId?: string) => void;
    onCancel: () => void;
  }

  let { query, position, onSelect, onCancel }: Props = $props();

  let selectedIndex = $state(0);

  // Get filtered notes based on query
  const filteredNotes = $derived(() => {
    const notes = notesStore.notes;
    if (!query.trim()) return notes.slice(0, 10); // Show first 10 notes if no query

    const normalizedQuery = query.toLowerCase().trim();
    const matching = notes.filter(
      (note) =>
        note.title.toLowerCase().includes(normalizedQuery) ||
        note.filename.toLowerCase().includes(normalizedQuery) ||
        note.id.toLowerCase().includes(normalizedQuery)
    );

    // Sort by relevance (exact matches first, then starts with, then contains)
    matching.sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      const aId = a.id.toLowerCase();
      const bId = b.id.toLowerCase();

      // Exact title match has highest priority
      if (aTitle === normalizedQuery) return -1;
      if (bTitle === normalizedQuery) return 1;

      // Exact ID match has second priority
      if (aId === normalizedQuery) return -1;
      if (bId === normalizedQuery) return 1;

      // Title starts with query
      if (aTitle.startsWith(normalizedQuery) && !bTitle.startsWith(normalizedQuery))
        return -1;
      if (bTitle.startsWith(normalizedQuery) && !aTitle.startsWith(normalizedQuery))
        return 1;

      // ID starts with query
      if (aId.startsWith(normalizedQuery) && !bId.startsWith(normalizedQuery)) return -1;
      if (bId.startsWith(normalizedQuery) && !aId.startsWith(normalizedQuery)) return 1;

      // Alphabetical for same relevance
      return aTitle.localeCompare(bTitle);
    });

    return matching.slice(0, 10); // Limit to 10 results
  });

  // Add option to create new note if query doesn't match exactly
  const options = $derived(() => {
    const notes = filteredNotes;
    const hasExactMatch = notes.some(
      (note) => note.title.toLowerCase() === query.toLowerCase().trim()
    );

    if (query.trim() && !hasExactMatch) {
      return [
        ...notes,
        {
          id: '__create_new__',
          title: query.trim(),
          filename: '',
          type: '',
          created: '',
          modified: '',
          size: 0,
          tags: [],
          path: '',
          isCreateOption: true
        } as NoteMetadata & { isCreateOption: true }
      ];
    }

    return notes;
  });

  // Reset selected index when options change
  $effect(() => {
    if (selectedIndex >= options.length) {
      selectedIndex = Math.max(0, options.length - 1);
    }
  });

  function handleKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, options.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        selectOption(selectedIndex);
        break;
      case 'Escape':
        event.preventDefault();
        onCancel();
        break;
    }
  }

  function selectOption(index: number): void {
    const option = options[index];
    if (option) {
      if ('isCreateOption' in option && option.isCreateOption) {
        onSelect(option.title); // No noteId for new notes
      } else {
        // Use the new format: identifier|title
        onSelect(`${option.id}|${option.title}`, option.id);
      }
    }
  }

  function handleMouseDown(event: MouseEvent, index: number): void {
    event.preventDefault(); // Prevent editor from losing focus
    selectOption(index);
  }

  // Focus handling
  let containerElement: HTMLElement;

  $effect(() => {
    if (containerElement) {
      containerElement.focus();
    }
  });
</script>

<div
  bind:this={containerElement}
  class="wikilink-autocomplete"
  style="left: {position.x}px; top: {position.y}px;"
  tabindex="-1"
  onkeydown={handleKeyDown}
>
  {#if options.length === 0}
    <div class="no-results">No notes found</div>
  {:else}
    {#each options as option, index (option.id)}
      <div
        class="autocomplete-option"
        class:selected={index === selectedIndex}
        class:create-option={'isCreateOption' in option && option.isCreateOption}
        onmousedown={(e) => handleMouseDown(e, index)}
        onmouseenter={() => (selectedIndex = index)}
      >
        {#if 'isCreateOption' in option && option.isCreateOption}
          <div class="option-content">
            <span class="create-icon">✨</span>
            <span class="option-title">Create "{option.title}"</span>
          </div>
        {:else}
          <div class="option-content">
            <div class="option-main">
              <span class="option-title">{option.title}</span>
              <span class="option-identifier">{option.id}</span>
            </div>
            {#if option.type}
              <span class="option-type">{option.type}</span>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .wikilink-autocomplete {
    position: absolute;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.15);
    max-height: 300px;
    min-width: 250px;
    max-width: 400px;
    overflow-y: auto;
    z-index: 1000;
    font-size: 0.875rem;
  }

  .no-results {
    padding: 0.75rem 1rem;
    color: var(--text-secondary);
    font-style: italic;
    text-align: center;
  }

  .autocomplete-option {
    padding: 0.5rem 1rem;
    cursor: pointer;
    border-bottom: 1px solid var(--border-lighter);
    transition: background-color 0.1s ease;
  }

  .autocomplete-option:last-child {
    border-bottom: none;
  }

  .autocomplete-option:hover,
  .autocomplete-option.selected {
    background: var(--bg-hover);
  }

  .autocomplete-option.create-option {
    border-top: 1px solid var(--border-light);
    background: var(--accent-secondary-alpha);
  }

  .autocomplete-option.create-option:hover,
  .autocomplete-option.create-option.selected {
    background: var(--accent-primary-alpha);
  }

  .option-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .option-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: 0.125rem;
  }

  .option-title {
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-identifier {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-family: var(--font-mono, 'SF Mono', 'Monaco', 'Inconsolata', monospace);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-type {
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .create-icon {
    font-size: 1rem;
    margin-right: 0.25rem;
  }

  .create-option .option-title {
    color: var(--accent-primary);
    font-weight: 600;
  }

  /* Custom scrollbar */
  .wikilink-autocomplete::-webkit-scrollbar {
    width: 6px;
  }

  .wikilink-autocomplete::-webkit-scrollbar-track {
    background: var(--bg-secondary);
    border-radius: 3px;
  }

  .wikilink-autocomplete::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 3px;
  }

  .wikilink-autocomplete::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }

  /* Firefox scrollbar */
  .wikilink-autocomplete {
    scrollbar-width: thin;
    scrollbar-color: var(--border-light) var(--bg-secondary);
  }
</style>
