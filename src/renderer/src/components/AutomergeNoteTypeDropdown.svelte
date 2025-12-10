<script lang="ts">
  /**
   * Note type dropdown for Automerge-based notes
   * Allows selecting and changing the type of a note
   */
  import { getNoteTypes, setNoteType, type NoteType } from '../lib/automerge';

  interface Props {
    noteId: string;
    currentTypeId: string;
    disabled?: boolean;
    compact?: boolean;
  }

  let { noteId, currentTypeId, disabled = false, compact = false }: Props = $props();

  // Derived state
  const noteTypes = $derived(getNoteTypes());
  const currentType = $derived(noteTypes.find((t) => t.id === currentTypeId));

  // UI state
  let isOpen = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);
  let buttonRef = $state<HTMLButtonElement | null>(null);
  let searchQuery = $state('');
  let searchInputRef = $state<HTMLInputElement | null>(null);
  let highlightedIndex = $state(0);
  let menuPosition = $state({ top: 0, left: 0 });

  // Filter types by search
  const filteredTypes = $derived.by(() => {
    if (!searchQuery.trim()) {
      return noteTypes;
    }
    const query = searchQuery.toLowerCase().trim();
    return noteTypes.filter((noteType) => noteType.name.toLowerCase().includes(query));
  });

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent): void {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      closeDropdown();
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside, true);
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
    return undefined;
  });

  // Focus search input when dropdown opens
  $effect(() => {
    if (isOpen && searchInputRef) {
      highlightedIndex = 0;
      setTimeout(() => {
        searchInputRef?.focus();
      }, 50);
    }
  });

  // Reset highlighted index when search changes
  $effect(() => {
    void searchQuery;
    highlightedIndex = 0;
  });

  function updateMenuPosition(): void {
    if (buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      menuPosition = {
        top: rect.bottom + 4,
        left: rect.left
      };
    }
  }

  function toggleDropdown(): void {
    if (disabled) return;
    if (!isOpen) {
      updateMenuPosition();
    }
    isOpen = !isOpen;
  }

  function closeDropdown(): void {
    isOpen = false;
    searchQuery = '';
    highlightedIndex = 0;
  }

  function selectType(type: NoteType): void {
    if (type.id === currentTypeId) {
      closeDropdown();
      return;
    }

    setNoteType(noteId, type.id);
    closeDropdown();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!isOpen) return;

    if (event.key === 'Escape') {
      closeDropdown();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const noteType = filteredTypes[highlightedIndex];
      if (noteType) {
        selectType(noteType);
      }
      return;
    }

    // Arrow Down
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filteredTypes.length > 0) {
        highlightedIndex = (highlightedIndex + 1) % filteredTypes.length;
      }
      return;
    }

    // Arrow Up
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filteredTypes.length > 0) {
        highlightedIndex =
          (highlightedIndex - 1 + filteredTypes.length) % filteredTypes.length;
      }
      return;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={dropdownRef} class="note-type-dropdown" class:disabled class:compact>
  <button
    bind:this={buttonRef}
    class="type-button"
    onclick={toggleDropdown}
    type="button"
    title="Change note type"
    {disabled}
    aria-haspopup="true"
    aria-expanded={isOpen}
  >
    <span class="type-icon">{currentType?.icon || '📄'}</span>
    {#if !compact}
      <span class="type-name">{currentType?.name || 'Unknown'}</span>
      <span class="dropdown-icon" class:open={isOpen}>▼</span>
    {/if}
  </button>

  {#if isOpen}
    <div
      class="dropdown-menu"
      role="menu"
      style="top: {menuPosition.top}px; left: {menuPosition.left}px;"
    >
      <div class="search-container">
        <input
          bind:this={searchInputRef}
          type="text"
          class="search-input"
          placeholder="Search types..."
          bind:value={searchQuery}
          onclick={(e) => e.stopPropagation()}
          onkeydown={handleKeyDown}
        />
        {#if searchQuery}
          <button
            class="clear-search"
            onclick={(e) => {
              e.stopPropagation();
              searchQuery = '';
              searchInputRef?.focus();
            }}
            aria-label="Clear search"
            type="button"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        {/if}
      </div>
      {#if filteredTypes.length === 0}
        <div class="dropdown-item no-results">No matching types</div>
      {:else}
        {#each filteredTypes as noteType, index (noteType.id)}
          <button
            class="dropdown-item"
            class:selected={noteType.id === currentTypeId}
            class:highlighted={index === highlightedIndex}
            onclick={() => selectType(noteType)}
            type="button"
            role="menuitem"
          >
            <div class="item-main">
              <span class="item-icon">{noteType.icon || '📄'}</span>
              <span class="item-name">{noteType.name}</span>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .note-type-dropdown {
    position: relative;
    display: inline-block;
  }

  .type-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1.5;
    height: 100%;
    color: var(--text-secondary);
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .type-button:hover {
    background: var(--bg-secondary);
    border-color: var(--border-light);
    color: var(--text-primary);
  }

  .type-button:focus {
    outline: none;
    background: transparent;
  }

  .type-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .note-type-dropdown.compact {
    display: inline-flex;
    align-items: center;
  }

  .note-type-dropdown.compact .type-button {
    padding: 0.125rem;
    gap: 0;
    height: auto;
    line-height: 1;
  }

  .note-type-dropdown.compact .type-icon {
    font-size: 0.875rem;
  }

  .type-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .type-name {
    text-transform: capitalize;
  }

  .dropdown-icon {
    font-size: 0.625rem;
    transition: transform 0.2s ease;
    opacity: 0.8;
  }

  .dropdown-icon.open {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: fixed;
    min-width: 160px;
    max-height: 20rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    animation: slideDown 0.15s ease-out;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .search-container {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-primary);
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-light);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .search-input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.2s ease;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-input:focus {
    border-color: var(--accent-primary);
  }

  .clear-search {
    padding: 0.25rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .clear-search:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .no-results {
    color: var(--text-secondary);
    cursor: default;
    font-style: italic;
  }

  .no-results:hover {
    background: transparent;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .dropdown-item:hover,
  .dropdown-item.highlighted {
    background: var(--bg-secondary);
  }

  .dropdown-item.selected {
    background: var(--accent-primary);
    color: white;
  }

  .dropdown-item.selected:hover,
  .dropdown-item.selected.highlighted {
    background: var(--accent-hover);
  }

  .item-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .item-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .item-name {
    font-weight: 500;
    text-transform: capitalize;
  }
</style>
