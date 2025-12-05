<script lang="ts">
  import type { DeckSort, ColumnConfig, FilterFieldInfo } from './types';
  import { SYSTEM_FIELDS } from './types';
  import PropChip from './PropChip.svelte';

  interface Props {
    /** Currently displayed columns/props */
    columns: ColumnConfig[];
    /** Available fields from schema */
    availableFields: FilterFieldInfo[];
    /** Current sort configuration */
    sort?: DeckSort;
    /** Called when New Note is clicked */
    onNewNote: () => void;
    /** Called when a prop chip is clicked (opens filter popup) */
    onPropClick: (field: string, position: { top: number; left: number }) => void;
    /** Called when Add Prop is clicked */
    onAddProp: (event: MouseEvent) => void;
    /** Called when sort is toggled on a prop */
    onSort?: (field: string, order: 'asc' | 'desc') => void;
  }

  let {
    columns,
    availableFields,
    sort,
    onNewNote,
    onPropClick,
    onAddProp,
    onSort
  }: Props = $props();

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
      {onSort}
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

  .add-prop-btn {
    border-color: var(--border-light);
  }
</style>
