<script lang="ts">
  import { notesStore } from '../services/noteStore.svelte';

  interface Props {
    currentType: string;
    onTypeChange: (newType: string) => Promise<void>;
    disabled?: boolean;
  }

  let { currentType, onTypeChange, disabled = false }: Props = $props();

  let isOpen = $state(false);
  let isSaving = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);
  let searchQuery = $state('');
  let searchInputRef = $state<HTMLInputElement | null>(null);
  let highlightedIndex = $state(0);

  // Get available note types from the store
  let availableTypes = $derived(notesStore.noteTypes);

  const filteredTypes = $derived.by(() => {
    if (!searchQuery.trim()) {
      return availableTypes;
    }
    const query = searchQuery.toLowerCase().trim();
    return availableTypes.filter((noteType) =>
      noteType.name.toLowerCase().includes(query)
    );
  });

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent): void {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      isOpen = false;
      searchQuery = '';
      highlightedIndex = 0;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
    return undefined;
  });

  // Focus search input and reset highlighted index when dropdown opens
  $effect(() => {
    if (isOpen && searchInputRef) {
      highlightedIndex = 0;
      setTimeout(() => {
        searchInputRef?.focus();
      }, 50);
    }
  });

  // Reset highlighted index when search query changes
  $effect(() => {
    searchQuery; // dependency
    highlightedIndex = 0;
  });

  // Listen for menu event to open dropdown
  $effect(() => {
    function handleMenuChangeType(): void {
      if (!disabled && !isSaving) {
        isOpen = true;
      }
    }

    document.addEventListener('menu-change-type', handleMenuChangeType);
    return () => {
      document.removeEventListener('menu-change-type', handleMenuChangeType);
    };
  });

  function toggleDropdown(): void {
    if (!disabled && !isSaving) {
      isOpen = !isOpen;
    }
  }

  async function selectType(type: string): Promise<void> {
    if (type === currentType || isSaving) return;

    try {
      isSaving = true;
      isOpen = false;
      searchQuery = '';
      highlightedIndex = 0;
      await onTypeChange(type);
    } catch (error) {
      console.error('Failed to change type:', error);
    } finally {
      isSaving = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!isOpen) return;

    if (event.key === 'Escape') {
      isOpen = false;
      searchQuery = '';
      highlightedIndex = 0;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const noteType = filteredTypes[highlightedIndex];
      if (noteType) {
        selectType(noteType.name);
      }
      return;
    }

    // Ctrl+N or Arrow Down - move down
    if ((event.ctrlKey && event.key === 'n') || event.key === 'ArrowDown') {
      event.preventDefault();
      if (filteredTypes.length > 0) {
        highlightedIndex = (highlightedIndex + 1) % filteredTypes.length;
      }
      return;
    }

    // Ctrl+P or Arrow Up - move up
    if ((event.ctrlKey && event.key === 'p') || event.key === 'ArrowUp') {
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
<div
  bind:this={dropdownRef}
  class="note-type-dropdown"
  class:disabled
  class:saving={isSaving}
>
  <button
    class="type-button"
    onclick={toggleDropdown}
    type="button"
    title="Change note type"
    {disabled}
    aria-haspopup="true"
    aria-expanded={isOpen}
  >
    {#if availableTypes.find((t) => t.name === currentType)?.icon}
      <span class="type-icon"
        >{availableTypes.find((t) => t.name === currentType)?.icon}</span
      >
    {/if}
    <span class="type-name">{currentType}</span>
    <span class="dropdown-icon" class:open={isOpen}>▼</span>
  </button>

  {#if isOpen}
    <div class="dropdown-menu" role="menu">
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
              stroke-linecap="round"
              stroke-linejoin="round"
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
        {#each filteredTypes as noteType, index (noteType.name)}
          <button
            class="dropdown-item"
            class:selected={noteType.name === currentType}
            class:highlighted={index === highlightedIndex}
            onclick={() => selectType(noteType.name)}
            type="button"
            role="menuitem"
          >
            <div class="item-main">
              {#if noteType.icon}
                <span class="item-icon">{noteType.icon}</span>
              {/if}
              <span class="item-name">{noteType.name}</span>
            </div>
            <span class="item-count">{noteType.count}</span>
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

  .note-type-dropdown.saving .type-button {
    opacity: 0.7;
    cursor: wait;
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
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    min-width: 100%;
    max-height: 24rem; /* ~10 items at 2.4rem each */
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
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
    color: var(--text-tertiary);
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

  .clear-search svg {
    stroke: currentColor;
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

  .item-count {
    font-size: 0.7rem;
    opacity: 0.7;
    font-weight: 400;
  }

  .dropdown-item.selected .item-count {
    opacity: 0.9;
  }
</style>
