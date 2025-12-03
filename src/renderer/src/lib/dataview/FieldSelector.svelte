<script lang="ts">
  import type { FilterFieldInfo } from './types';
  import { SYSTEM_FIELDS } from './types';

  interface Props {
    fields: FilterFieldInfo[];
    selectedField: string | null;
    onSelect: (fieldName: string) => void;
    placeholder?: string;
    excludeFields?: string[];
  }

  let {
    fields,
    selectedField,
    onSelect,
    placeholder = 'Select field...',
    excludeFields = []
  }: Props = $props();

  let isOpen = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);
  let buttonRef = $state<HTMLButtonElement | null>(null);
  let searchQuery = $state('');
  let searchInputRef = $state<HTMLInputElement | null>(null);
  let highlightedIndex = $state(0);
  let dropdownPosition = $state({ top: 0, left: 0, minWidth: 0 });

  // Combine system fields and custom fields, excluding specified fields
  const allFields = $derived.by(() => {
    const customFields = fields.filter((f) => !f.isSystem);
    const combined = [...SYSTEM_FIELDS, ...customFields];
    // Filter out excluded fields (used to prevent duplicate column selection)
    if (excludeFields.length === 0) return combined;
    const excludeSet = new Set(excludeFields);
    return combined.filter((f) => !excludeSet.has(f.name));
  });

  const filteredFields = $derived.by(() => {
    if (!searchQuery.trim()) {
      return allFields;
    }
    const query = searchQuery.toLowerCase().trim();
    return allFields.filter(
      (field) =>
        field.name.toLowerCase().includes(query) ||
        field.label.toLowerCase().includes(query) ||
        field.description?.toLowerCase().includes(query)
    );
  });

  const selectedFieldInfo = $derived(allFields.find((f) => f.name === selectedField));

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
      // Use capture phase to detect clicks before stopPropagation() in parent elements
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

  function toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    if (!isOpen && buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      dropdownPosition = {
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: rect.width
      };
    }
    isOpen = !isOpen;
  }

  function selectField(fieldName: string): void {
    isOpen = false;
    searchQuery = '';
    highlightedIndex = 0;
    onSelect(fieldName);
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
      const field = filteredFields[highlightedIndex];
      if (field) {
        selectField(field.name);
      }
      return;
    }

    if ((event.ctrlKey && event.key === 'n') || event.key === 'ArrowDown') {
      event.preventDefault();
      if (filteredFields.length > 0) {
        highlightedIndex = (highlightedIndex + 1) % filteredFields.length;
      }
      return;
    }

    if ((event.ctrlKey && event.key === 'p') || event.key === 'ArrowUp') {
      event.preventDefault();
      if (filteredFields.length > 0) {
        highlightedIndex =
          (highlightedIndex - 1 + filteredFields.length) % filteredFields.length;
      }
      return;
    }
  }

  function getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      string: 'T',
      number: '#',
      boolean: '?',
      date: 'D',
      array: '[]',
      select: 'S',
      system: '*'
    };
    return icons[type] || 'T';
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={dropdownRef} class="field-selector">
  <button
    bind:this={buttonRef}
    class="field-button"
    onclick={toggleDropdown}
    type="button"
    aria-haspopup="true"
    aria-expanded={isOpen}
  >
    <span class="field-label">
      {#if selectedFieldInfo}
        <span class="type-icon" title={selectedFieldInfo.type}
          >{getTypeIcon(selectedFieldInfo.type)}</span
        >
        {selectedFieldInfo.label}
      {:else}
        {placeholder}
      {/if}
    </span>
    <span class="dropdown-icon" class:open={isOpen}>▼</span>
  </button>

  {#if isOpen}
    <div
      class="dropdown-menu"
      role="listbox"
      style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; min-width: {dropdownPosition.minWidth}px;"
    >
      <div class="search-container">
        <input
          bind:this={searchInputRef}
          type="text"
          class="search-input"
          placeholder="Search fields..."
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

      {#if filteredFields.length === 0}
        <div class="dropdown-item no-results">No matching fields</div>
      {:else}
        {#each filteredFields as field, index (field.name)}
          <button
            class="dropdown-item"
            class:selected={field.name === selectedField}
            class:highlighted={index === highlightedIndex}
            onclick={() => selectField(field.name)}
            type="button"
            role="option"
            aria-selected={field.name === selectedField}
          >
            <div class="item-main">
              <span class="type-icon" title={field.type}>{getTypeIcon(field.type)}</span>
              <span class="item-name">{field.label}</span>
            </div>
            {#if field.isSystem}
              <span class="item-badge system">system</span>
            {:else if field.type !== 'system'}
              <span class="item-badge type">{field.type}</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .field-selector {
    position: relative;
    display: inline-block;
    min-width: 140px;
  }

  .field-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-primary);
    transition: all 0.2s ease;
    text-align: left;
  }

  .field-button:hover {
    border-color: var(--border-medium);
  }

  .field-button:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .field-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    background: var(--bg-tertiary);
    border-radius: 0.25rem;
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .dropdown-icon {
    font-size: 0.5rem;
    opacity: 0.6;
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .dropdown-icon.open {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: fixed;
    width: max-content;
    max-width: 280px;
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

  .no-results {
    color: var(--text-secondary);
    cursor: default;
    font-style: italic;
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
    gap: 0.75rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.75rem;
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
    overflow: hidden;
  }

  .item-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .item-badge.system {
    background: var(--accent-blue-alpha, rgba(59, 130, 246, 0.1));
    color: var(--accent-blue, #3b82f6);
  }

  .item-badge.type {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .dropdown-item.selected .item-badge {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .dropdown-item.selected .type-icon {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }
</style>
