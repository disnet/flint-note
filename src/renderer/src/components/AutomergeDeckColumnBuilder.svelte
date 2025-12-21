<script lang="ts">
  import type {
    ColumnConfig,
    ColumnDefinition,
    AutomergeFilterFieldInfo
  } from '../lib/automerge/deck';
  import {
    normalizeColumn,
    SYSTEM_COLUMNS,
    getAvailableFields
  } from '../lib/automerge/deck';
  import AutomergeDeckColumnRow from './AutomergeDeckColumnRow.svelte';
  import { getNoteTypesDict, getNotesDict } from '../lib/automerge/state.svelte';

  interface Props {
    columns: ColumnDefinition[];
    /** Type ID to load schema fields from (e.g., 'type-xxxxxxxx') */
    typeId?: string;
    onColumnsChange: (columns: ColumnConfig[]) => void;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for API compatibility
  let { columns, typeId: _typeId, onColumnsChange }: Props = $props();

  // Local editing state - initialized from props
  let editingColumns = $state<ColumnConfig[]>(columns.map(normalizeColumn));

  // Track previous props to detect external changes
  let prevColumnsJson = $state(JSON.stringify(columns));

  // Sync from props only when props actually change
  $effect(() => {
    const newColumnsJson = JSON.stringify(columns);
    if (newColumnsJson !== prevColumnsJson) {
      prevColumnsJson = newColumnsJson;
      editingColumns = columns.map(normalizeColumn);
    }
  });

  // Get schema fields from Automerge document
  const schemaFields = $derived.by(() => {
    const notes = Object.values(getNotesDict());
    return getAvailableFields(notes, getNoteTypesDict());
  });

  // Check if a column is complete (has a field)
  function isColumnComplete(column: ColumnConfig): boolean {
    return !!column.field && !!column.field.trim();
  }

  // Get complete columns
  function getCompleteColumns(allColumns: ColumnConfig[]): ColumnConfig[] {
    return allColumns.filter(isColumnComplete);
  }

  // Propagate complete columns to parent
  function syncToParent(): void {
    const complete = getCompleteColumns(editingColumns);
    onColumnsChange(complete);
  }

  function handleColumnChange(index: number, newColumn: ColumnConfig): void {
    editingColumns[index] = newColumn;
    editingColumns = [...editingColumns];
    syncToParent();
  }

  function handleRemoveColumn(index: number): void {
    editingColumns = editingColumns.filter((_, i) => i !== index);
    syncToParent();
  }

  function handleAddColumn(): void {
    const newColumn: ColumnConfig = {
      field: ''
    };
    editingColumns = [...editingColumns, newColumn];
    // Don't sync - incomplete column
  }

  // Drag and drop state
  let draggedIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let dragPosition = $state<'top' | 'bottom' | null>(null);

  function handleDragStart(_event: DragEvent, index: number): void {
    draggedIndex = index;
  }

  function handleDragOver(event: DragEvent, index: number): void {
    if (draggedIndex === null || draggedIndex === index) return;

    dragOverIndex = index;

    // Determine position based on mouse Y
    const target = event.currentTarget as HTMLElement;
    if (target) {
      const rect = target.getBoundingClientRect();
      const mouseY = event.clientY;
      const elementMiddle = rect.top + rect.height / 2;
      dragPosition = mouseY < elementMiddle ? 'top' : 'bottom';
    }
  }

  function handleDragEnd(): void {
    if (
      draggedIndex !== null &&
      dragOverIndex !== null &&
      draggedIndex !== dragOverIndex
    ) {
      // Reorder columns
      const newColumns = [...editingColumns];
      const [removed] = newColumns.splice(draggedIndex, 1);

      // Calculate insert position
      let insertIndex = dragOverIndex;
      if (dragPosition === 'bottom') {
        insertIndex = dragOverIndex + 1;
      }
      // Adjust for the removed item
      if (draggedIndex < insertIndex) {
        insertIndex--;
      }

      newColumns.splice(insertIndex, 0, removed);
      editingColumns = newColumns;
      syncToParent();
    }

    draggedIndex = null;
    dragOverIndex = null;
    dragPosition = null;
  }

  // Get available fields that aren't already selected
  // Note: 'title' is excluded because it's always shown as the first column
  const availableFields = $derived.by(() => {
    const selectedFields = new Set(editingColumns.map((c) => c.field));
    const systemFieldInfos: AutomergeFilterFieldInfo[] = SYSTEM_COLUMNS.filter(
      (col) => col.field !== 'title'
    ).map((col) => ({
      name: col.field,
      label: col.label || col.field,
      type: col.field === 'created' || col.field === 'updated' ? 'date' : 'system',
      isSystem: true
    }));
    const allFields = [...systemFieldInfos, ...schemaFields];
    return allFields.filter((f) => !selectedFields.has(f.name));
  });
</script>

<div class="column-builder">
  <div class="column-builder-header">
    <span class="header-title">Columns</span>
  </div>

  <div class="column-list" role="list">
    {#if editingColumns.length === 0}
      <div class="empty-state">
        <span>No columns configured</span>
        <span class="empty-hint">Add columns to display in the table</span>
      </div>
    {:else}
      {#each editingColumns as column, index (index)}
        <AutomergeDeckColumnRow
          {column}
          fields={schemaFields}
          excludeFields={editingColumns
            .filter((_, i) => i !== index)
            .map((c) => c.field)
            .filter(Boolean)}
          {index}
          onChange={(newColumn) => handleColumnChange(index, newColumn)}
          onRemove={() => handleRemoveColumn(index)}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          isDragging={draggedIndex === index}
          isDragOver={dragOverIndex === index}
          {dragPosition}
        />
      {/each}
    {/if}
  </div>

  <button class="add-column-btn" onclick={handleAddColumn} type="button">
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
    Add Column
  </button>

  {#if availableFields.length > 0 && editingColumns.length > 0}
    <div class="available-hint">
      <span class="hint-text"
        >{availableFields.length} more field{availableFields.length === 1 ? '' : 's'} available</span
      >
    </div>
  {/if}
</div>

<style>
  .column-builder {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
    border: 1px solid var(--border-light);
  }

  .column-builder-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .header-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .column-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    color: var(--text-secondary);
    font-size: 0.8rem;
    text-align: center;
  }

  .empty-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
  }

  .add-column-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: 1px dashed var(--border-medium);
    border-radius: 0.375rem;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-column-btn:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .add-column-btn svg {
    stroke: currentColor;
  }

  .available-hint {
    display: flex;
    justify-content: center;
  }

  .hint-text {
    font-size: 0.7rem;
    color: var(--text-muted);
  }
</style>
