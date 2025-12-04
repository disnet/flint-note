<script lang="ts">
  import type { DeckSort, ColumnConfig, FilterFieldInfo } from './types';
  import { SYSTEM_FIELDS } from './types';
  import PropChip from './PropChip.svelte';

  interface Props {
    /** Note type being filtered */
    typeName: string | null;
    /** Available note types */
    noteTypes: string[];
    /** Currently displayed columns/props */
    columns: ColumnConfig[];
    /** Available fields from schema */
    availableFields: FilterFieldInfo[];
    /** Current sort configuration */
    sort?: DeckSort;
    /** Called when New Note is clicked */
    onNewNote: () => void;
    /** Called when type is changed */
    onTypeChange: (typeName: string) => void;
    /** Called when a prop chip is clicked (opens filter popup) */
    onPropClick: (field: string, position: { top: number; left: number }) => void;
    /** Called when Add Prop is clicked */
    onAddProp: (event: MouseEvent) => void;
  }

  let {
    typeName,
    noteTypes,
    columns,
    availableFields,
    sort,
    onNewNote,
    onTypeChange,
    onPropClick,
    onAddProp
  }: Props = $props();

  let isTypeDropdownOpen = $state(false);
  let typeButtonRef = $state<HTMLButtonElement | null>(null);
  let typeDropdownRef = $state<HTMLDivElement | null>(null);
  let dropdownPosition = $state({ top: 0, left: 0 });

  // Get label for a column field
  function getColumnLabel(column: ColumnConfig): string {
    if (column.label) return column.label;
    // Check system fields first
    const systemField = SYSTEM_FIELDS.find(
      (f) =>
        f.name === column.field ||
        f.name === `flint_${column.field}` ||
        column.field === f.name.replace('flint_', '')
    );
    if (systemField) return systemField.label;
    // Check available fields from schema
    const schemaField = availableFields.find((f) => f.name === column.field);
    if (schemaField) return schemaField.label;
    // Fallback
    return column.field.replace(/^flint_/, '').replace(/_/g, ' ');
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent): void {
    if (
      typeDropdownRef &&
      !typeDropdownRef.contains(event.target as Node) &&
      typeButtonRef &&
      !typeButtonRef.contains(event.target as Node)
    ) {
      isTypeDropdownOpen = false;
    }
  }

  $effect(() => {
    if (isTypeDropdownOpen) {
      document.addEventListener('click', handleClickOutside, true);
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
    return undefined;
  });

  function toggleTypeDropdown(event: MouseEvent): void {
    event.stopPropagation();
    if (!isTypeDropdownOpen && typeButtonRef) {
      const rect = typeButtonRef.getBoundingClientRect();
      dropdownPosition = {
        top: rect.bottom + 4,
        left: rect.left
      };
    }
    isTypeDropdownOpen = !isTypeDropdownOpen;
  }

  function selectType(type: string): void {
    isTypeDropdownOpen = false;
    onTypeChange(type);
  }

  function handleTypeKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      isTypeDropdownOpen = false;
      event.preventDefault();
    }
  }
</script>

<div class="deck-toolbar">
  <!-- New Note button -->
  <button
    class="toolbar-btn new-note-btn"
    onclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onNewNote();
    }}
    onmousedown={(e) => e.stopPropagation()}
    type="button"
    title="Create new note"
  >
    + New
  </button>

  <!-- Type selector chip -->
  <div class="type-selector">
    <button
      bind:this={typeButtonRef}
      class="toolbar-chip type-chip"
      onclick={toggleTypeDropdown}
      type="button"
      aria-haspopup="true"
      aria-expanded={isTypeDropdownOpen}
    >
      <span class="chip-label">type="{typeName || 'note'}"</span>
      <span class="dropdown-caret" class:open={isTypeDropdownOpen}>▼</span>
    </button>

    {#if isTypeDropdownOpen}
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={typeDropdownRef}
        class="type-dropdown"
        style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px;"
        role="listbox"
        onkeydown={handleTypeKeyDown}
        onmousedown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {#each noteTypes as type (type)}
          <button
            class="type-option"
            class:selected={type === typeName}
            onclick={() => selectType(type)}
            type="button"
            role="option"
            aria-selected={type === typeName}
          >
            {type}
          </button>
        {/each}
        {#if noteTypes.length === 0}
          <div class="type-option empty">No types available</div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Prop chips -->
  {#each columns as column (column.field)}
    <PropChip
      field={column.field}
      label={getColumnLabel(column)}
      {sort}
      onClick={(event: MouseEvent) => {
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        onPropClick(column.field, { top: rect.bottom + 4, left: rect.left });
      }}
    />
  {/each}

  <!-- Add Prop button -->
  <button
    class="toolbar-btn add-prop-btn"
    onclick={onAddProp}
    type="button"
    title="Add property"
  >
    + Add Prop
  </button>
</div>

<style>
  .deck-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-light);
  }

  .toolbar-btn {
    padding: 0.25rem 0.5rem;
    border: 1px dashed var(--border-medium);
    border-radius: 1rem;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolbar-btn:hover {
    background: var(--bg-secondary);
    border-style: solid;
    color: var(--text-primary);
  }

  .new-note-btn {
    border-color: var(--accent-success, #22c55e);
    color: var(--accent-success, #22c55e);
  }

  .new-note-btn:hover {
    background: rgba(34, 197, 94, 0.1);
    border-color: var(--accent-success, #22c55e);
    color: var(--accent-success, #22c55e);
  }

  .type-selector {
    position: relative;
    display: inline-flex;
  }

  .toolbar-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 1rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolbar-chip:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
  }

  .type-chip {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }

  .type-chip:hover {
    background: var(--accent-hover, #2563eb);
    border-color: var(--accent-hover, #2563eb);
    color: white;
  }

  .chip-label {
    white-space: nowrap;
  }

  .dropdown-caret {
    font-size: 0.5rem;
    opacity: 0.8;
    transition: transform 0.15s ease;
  }

  .dropdown-caret.open {
    transform: rotate(180deg);
  }

  .type-dropdown {
    position: fixed;
    min-width: 120px;
    max-height: 200px;
    overflow-y: auto;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    animation: slideDown 0.15s ease-out;
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

  .type-option {
    display: block;
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

  .type-option:hover {
    background: var(--bg-secondary);
  }

  .type-option.selected {
    background: var(--accent-primary);
    color: white;
  }

  .type-option.selected:hover {
    background: var(--accent-hover, #2563eb);
  }

  .type-option.empty {
    color: var(--text-tertiary);
    font-style: italic;
    cursor: default;
  }

  .add-prop-btn {
    border-color: var(--border-light);
  }
</style>
