<script lang="ts">
  import type { FilterFieldInfo } from '../lib/automerge/deck';
  import { SYSTEM_FIELDS } from '../lib/automerge/deck';

  interface Props {
    /** Whether the dialog is open */
    isOpen: boolean;
    /** Available fields from schema */
    fields: FilterFieldInfo[];
    /** Fields already selected (to exclude) */
    excludeFields: string[];
    /** Position for the dialog */
    position: { top: number; left: number };
    /** Called when a field is selected */
    onSelect: (fieldName: string) => void;
    /** Called when dialog should close */
    onClose: () => void;
  }

  let { isOpen, fields, excludeFields, position, onSelect, onClose }: Props = $props();

  let dialogRef = $state<HTMLDivElement | null>(null);
  let searchQuery = $state('');
  let searchInputRef = $state<HTMLInputElement | null>(null);
  let highlightedIndex = $state(0);

  // Combine system fields and custom fields, excluding already selected
  const allFields = $derived.by(() => {
    const customFields = fields.filter((f) => !f.isSystem);
    const combined = [...SYSTEM_FIELDS, ...customFields];
    // Filter out excluded fields
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

  // Close when clicking outside
  function handleClickOutside(event: MouseEvent): void {
    if (dialogRef && !dialogRef.contains(event.target as Node)) {
      onClose();
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

  // Focus and reset when opening
  $effect(() => {
    if (isOpen) {
      searchQuery = '';
      highlightedIndex = 0;
      setTimeout(() => {
        searchInputRef?.focus();
      }, 50);
    }
  });

  // Reset highlighted index on search
  $effect(() => {
    void searchQuery;
    highlightedIndex = 0;
  });

  function selectField(fieldName: string): void {
    searchQuery = '';
    onSelect(fieldName);
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
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

{#if isOpen}
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={dialogRef}
    class="prop-picker-dialog"
    style="top: {position.top}px; left: {position.left}px;"
    role="dialog"
    aria-label="Add property"
    onmousedown={(e) => {
      // Don't prevent default for input elements
      if ((e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
      }
      e.stopPropagation();
    }}
    onclick={(e) => e.stopPropagation()}
  >
    <div class="search-container">
      <input
        bind:this={searchInputRef}
        type="text"
        class="search-input"
        placeholder="Search fields..."
        bind:value={searchQuery}
        onkeydown={handleKeyDown}
      />
    </div>

    <div class="fields-list">
      {#if filteredFields.length === 0}
        <div class="no-results">
          {searchQuery ? 'No matching fields' : 'No fields available'}
        </div>
      {:else}
        {#each filteredFields as field, index (field.name)}
          <button
            class="field-option"
            class:highlighted={index === highlightedIndex}
            onclick={() => selectField(field.name)}
            type="button"
          >
            <span class="type-icon" title={field.type}>{getTypeIcon(field.type)}</span>
            <span class="field-label">{field.label}</span>
            {#if field.isSystem}
              <span class="field-badge system">system</span>
            {:else if field.type !== 'system'}
              <span class="field-badge">{field.type}</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .prop-picker-dialog {
    position: fixed;
    min-width: 200px;
    max-width: 280px;
    max-height: 300px;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    animation: slideDown 0.15s ease-out;
    display: flex;
    flex-direction: column;
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

  .search-container {
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .search-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.15s ease;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-input:focus {
    border-color: var(--accent-primary);
  }

  .fields-list {
    overflow-y: auto;
    flex: 1;
  }

  .no-results {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-style: italic;
  }

  .field-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .field-option:hover,
  .field-option.highlighted {
    background: var(--bg-secondary);
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

  .field-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-badge {
    font-size: 0.6rem;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    background: var(--bg-tertiary);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .field-badge.system {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
  }
</style>
