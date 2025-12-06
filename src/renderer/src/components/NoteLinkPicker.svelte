<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';

  interface Props {
    /** Current value - note ID for single, array of IDs for multiple */
    value: string | string[] | null;
    /** Whether multiple selection is allowed */
    multiple?: boolean;
    /** Callback when selection changes */
    onSelect: (value: string | string[] | null) => void;
    /** Optional placeholder text */
    placeholder?: string;
    /** Compact mode - simpler dropdown with just icon + title */
    compact?: boolean;
    /** Callback when a selected note is clicked (to open it) */
    onNoteClick?: (noteId: string) => void;
  }

  let {
    value,
    multiple = false,
    onSelect,
    placeholder = 'Select a note...',
    compact = false,
    onNoteClick
  }: Props = $props();

  // Get icon for a note type
  function getNoteIcon(typeName: string): string {
    const noteType = notesStore.noteTypes.find((t) => t.name === typeName);
    return noteType?.icon || '📄';
  }

  let searchQuery = $state('');
  let isOpen = $state(false);
  let selectedIndex = $state(0);
  let isExpanded = $state(false);
  let pickerInputRef = $state<HTMLDivElement | null>(null);
  let dropdownPosition = $state({ top: 0, left: 0, width: 0 });

  // Max items to show before collapsing
  const MAX_VISIBLE_ITEMS = 3;

  // Convert value to array for consistent handling
  const selectedIds = $derived(
    value === null ? [] : Array.isArray(value) ? value : [value]
  );

  // Get note info for selected IDs
  const selectedNotes = $derived(
    selectedIds
      .map((id) => notesStore.notes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined)
  );

  // Notes to display (limited when collapsed)
  const visibleNotes = $derived(
    isExpanded ? selectedNotes : selectedNotes.slice(0, MAX_VISIBLE_ITEMS)
  );

  // Count of hidden notes
  const hiddenCount = $derived(Math.max(0, selectedNotes.length - MAX_VISIBLE_ITEMS));

  // Filter notes based on search query
  const filteredNotes = $derived.by(() => {
    const notes = notesStore.notes;
    if (!searchQuery.trim()) return notes.slice(0, 15);

    const normalizedQuery = searchQuery.toLowerCase().trim();
    const matching = notes.filter(
      (note) =>
        note.title.toLowerCase().includes(normalizedQuery) ||
        note.filename.toLowerCase().includes(normalizedQuery) ||
        note.id.toLowerCase().includes(normalizedQuery)
    );

    // Sort by relevance
    matching.sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();

      if (aTitle === normalizedQuery) return -1;
      if (bTitle === normalizedQuery) return 1;
      if (aTitle.startsWith(normalizedQuery) && !bTitle.startsWith(normalizedQuery))
        return -1;
      if (bTitle.startsWith(normalizedQuery) && !aTitle.startsWith(normalizedQuery))
        return 1;
      return aTitle.localeCompare(bTitle);
    });

    return matching.slice(0, 15);
  });

  // Filter out already selected notes for multiple mode
  const availableNotes = $derived(
    multiple ? filteredNotes.filter((n) => !selectedIds.includes(n.id)) : filteredNotes
  );

  // Reset selected index when options change
  $effect(() => {
    if (selectedIndex >= availableNotes.length) {
      selectedIndex = Math.max(0, availableNotes.length - 1);
    }
  });

  function handleKeyDown(event: KeyboardEvent): void {
    if (!isOpen) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        isOpen = true;
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, availableNotes.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        selectNote(selectedIndex);
        break;
      case 'Escape':
        event.preventDefault();
        isOpen = false;
        searchQuery = '';
        break;
      case 'Backspace':
        if (searchQuery === '' && selectedIds.length > 0 && multiple) {
          // Remove last selected note
          removeNote(selectedIds[selectedIds.length - 1]);
        }
        break;
    }
  }

  function selectNote(index: number): void {
    const note = availableNotes[index];
    if (!note) return;

    if (multiple) {
      onSelect([...selectedIds, note.id]);
      searchQuery = '';
    } else {
      onSelect(note.id);
      isOpen = false;
      searchQuery = '';
    }
    selectedIndex = 0;
  }

  function removeNote(noteId: string): void {
    if (multiple) {
      const newIds = selectedIds.filter((id) => id !== noteId);
      onSelect(newIds.length > 0 ? newIds : null);
    } else {
      onSelect(null);
    }
  }

  function updateDropdownPosition(): void {
    if (pickerInputRef) {
      const rect = pickerInputRef.getBoundingClientRect();
      dropdownPosition = {
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 200)
      };
    }
  }

  function handleInputFocus(): void {
    updateDropdownPosition();
    isOpen = true;
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.note-link-picker')) {
      isOpen = false;
      searchQuery = '';
    }
  }

  // Close dropdown on click outside
  $effect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return;
  });
</script>

<div class="note-link-picker">
  <div bind:this={pickerInputRef} class="picker-input" class:is-open={isOpen}>
    {#if multiple}
      <div class="selected-notes">
        {#each visibleNotes as note (note.id)}
          <span class="selected-tag">
            {#if onNoteClick}
              <button
                class="tag-link"
                onclick={(e) => {
                  e.stopPropagation();
                  onNoteClick(note.id);
                }}
                type="button"
              >
                <span class="tag-icon">{getNoteIcon(note.type)}</span>
                <span class="tag-title">{note.title || 'Untitled'}</span>
              </button>
            {:else}
              <span class="tag-icon">{getNoteIcon(note.type)}</span>
              <span class="tag-title">{note.title || 'Untitled'}</span>
            {/if}
            <button
              class="tag-remove"
              onclick={(e) => {
                e.stopPropagation();
                removeNote(note.id);
              }}
              aria-label="Remove {note.title}"
            >
              &times;
            </button>
          </span>
        {/each}
        {#if hiddenCount > 0 && !isExpanded}
          <button
            class="expand-toggle"
            onclick={(e) => {
              e.stopPropagation();
              isExpanded = true;
            }}
            type="button"
            title="Show {hiddenCount} more"
          >
            +{hiddenCount}
          </button>
        {:else if isExpanded && selectedNotes.length > MAX_VISIBLE_ITEMS}
          <button
            class="expand-toggle"
            onclick={(e) => {
              e.stopPropagation();
              isExpanded = false;
            }}
            type="button"
            title="Show less"
          >
            −
          </button>
        {/if}
        <input
          type="text"
          bind:value={searchQuery}
          onfocus={handleInputFocus}
          onkeydown={handleKeyDown}
          placeholder={selectedNotes.length === 0 ? placeholder : ''}
          class="search-input"
        />
      </div>
    {:else if selectedNotes.length > 0}
      <div class="single-selected">
        {#if onNoteClick}
          <button
            class="selected-link"
            onclick={(e) => {
              e.stopPropagation();
              onNoteClick(selectedNotes[0].id);
            }}
            type="button"
          >
            <span class="selected-icon">{getNoteIcon(selectedNotes[0].type)}</span>
            <span class="selected-title">{selectedNotes[0].title || 'Untitled'}</span>
          </button>
        {:else}
          <span class="selected-icon">{getNoteIcon(selectedNotes[0].type)}</span>
          <span class="selected-title">{selectedNotes[0].title || 'Untitled'}</span>
        {/if}
        <button
          class="clear-btn"
          onclick={(e) => {
            e.stopPropagation();
            removeNote(selectedIds[0]);
          }}
          aria-label="Clear"
        >
          &times;
        </button>
      </div>
    {:else}
      <input
        type="text"
        bind:value={searchQuery}
        onfocus={handleInputFocus}
        onkeydown={handleKeyDown}
        {placeholder}
        class="search-input full-width"
      />
    {/if}
  </div>

  {#if isOpen}
    <div
      class="dropdown"
      role="listbox"
      style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; width: {dropdownPosition.width}px;"
    >
      {#if availableNotes.length === 0}
        <div class="no-results">
          {searchQuery ? 'No matching notes' : 'No notes available'}
        </div>
      {:else}
        {#each availableNotes as note, index (note.id)}
          <div
            class="dropdown-option"
            class:selected={index === selectedIndex}
            class:compact
            onmousedown={(e) => {
              e.preventDefault();
              selectNote(index);
            }}
            onmouseenter={() => (selectedIndex = index)}
            role="option"
            aria-selected={index === selectedIndex}
            tabindex="-1"
          >
            {#if compact}
              <span class="option-icon">{getNoteIcon(note.type)}</span>
              <span class="option-title">{note.title || 'Untitled'}</span>
            {:else}
              <div class="option-main">
                <span class="option-title">{note.title || 'Untitled'}</span>
                <span class="option-id">{note.id}</span>
              </div>
              {#if note.type}
                <span class="option-type">{note.type}</span>
              {/if}
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .note-link-picker {
    position: relative;
    width: 100%;
  }

  .picker-input {
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    min-height: 2.25rem;
    transition: border-color 0.15s ease;
  }

  .picker-input:focus-within,
  .picker-input.is-open {
    border-color: var(--accent-primary);
    outline: none;
  }

  .selected-notes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
    align-items: center;
  }

  .selected-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--accent-primary-alpha);
    color: var(--accent-primary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.8125rem;
  }

  .tag-icon,
  .selected-icon {
    flex-shrink: 0;
  }

  .tag-title {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-link,
  .selected-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .tag-link:hover .tag-title,
  .selected-link:hover .selected-title {
    text-decoration: underline;
  }

  .tag-remove {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
    font-size: 1rem;
    line-height: 1;
    opacity: 0.7;
  }

  .tag-remove:hover {
    opacity: 1;
  }

  .expand-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary);
    border: none;
    border-radius: 0.25rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    padding: 0.125rem 0.375rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .expand-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .search-input {
    border: none;
    background: transparent;
    outline: none;
    padding: 0.375rem 0.5rem;
    font-size: 0.875rem;
    color: var(--text-primary);
    flex: 1;
    min-width: 100px;
  }

  .search-input.full-width {
    width: 100%;
    padding: 0.5rem 0.75rem;
  }

  .single-selected {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    gap: 0.5rem;
  }

  .selected-title {
    color: var(--text-primary);
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .clear-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.125rem 0.25rem;
    font-size: 1rem;
    line-height: 1;
    border-radius: 0.25rem;
  }

  .clear-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .dropdown {
    position: fixed;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.15);
    max-height: 250px;
    overflow-y: auto;
    z-index: 10000;
  }

  .no-results {
    padding: 0.75rem 1rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    text-align: center;
    font-style: italic;
  }

  .dropdown-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    border-bottom: 1px solid var(--border-lighter);
    gap: 0.5rem;
  }

  .dropdown-option:last-child {
    border-bottom: none;
  }

  .dropdown-option:hover,
  .dropdown-option.selected {
    background: var(--bg-hover);
  }

  .option-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: 0.125rem;
  }

  .option-title {
    font-size: 0.875rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-id {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-family: var(--font-mono, monospace);
  }

  .option-type {
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .dropdown-option.compact {
    padding: 0.375rem 0.5rem;
    gap: 0.375rem;
    justify-content: flex-start;
  }

  .option-icon {
    flex-shrink: 0;
    font-size: 0.875rem;
  }

  .dropdown-option.compact .option-title {
    font-size: 0.8125rem;
  }

  /* Scrollbar styling */
  .dropdown::-webkit-scrollbar {
    width: 6px;
  }

  .dropdown::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }

  .dropdown::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 3px;
  }

  .dropdown {
    scrollbar-width: thin;
    scrollbar-color: var(--border-light) var(--bg-secondary);
  }
</style>
