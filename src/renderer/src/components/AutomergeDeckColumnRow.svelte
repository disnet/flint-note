<script lang="ts">
  import type {
    ColumnConfig,
    ColumnFormat,
    AutomergeFilterFieldInfo
  } from '../lib/automerge/deck';
  import {
    SYSTEM_COLUMNS,
    getFormatsForType,
    getFormatLabel
  } from '../lib/automerge/deck';
  import AutomergeDeckFieldSelector from './AutomergeDeckFieldSelector.svelte';

  interface Props {
    column: ColumnConfig;
    fields: AutomergeFilterFieldInfo[];
    excludeFields?: string[];
    index: number;
    onChange: (column: ColumnConfig) => void;
    onRemove: () => void;
    onDragStart: (event: DragEvent, index: number) => void;
    onDragOver: (event: DragEvent, index: number) => void;
    onDragEnd: () => void;
    isDragging: boolean;
    isDragOver: boolean;
    dragPosition: 'top' | 'bottom' | null;
  }

  let {
    column,
    fields,
    excludeFields = [],
    index,
    onChange,
    onRemove,
    onDragStart,
    onDragOver,
    onDragEnd,
    isDragging,
    isDragOver,
    dragPosition
  }: Props = $props();

  let showLabelInput = $state(!!column.label);
  let showFormatSelect = $state(!!column.format && column.format !== 'default');

  // Convert system columns to FilterFieldInfo format for field lookup
  // Note: 'title' is excluded because it's always shown as the first column
  const systemFieldInfos = $derived<AutomergeFilterFieldInfo[]>(
    SYSTEM_COLUMNS.filter((col) => col.field !== 'title').map((col) => ({
      name: col.field,
      label: col.label || col.field,
      type: col.field === 'created' || col.field === 'updated' ? 'date' : 'system',
      isSystem: true
    }))
  );

  // All fields for looking up the current field's info
  const allFieldsForLookup = $derived.by(() => {
    const customFields = fields.filter((f) => !f.isSystem);
    return [...systemFieldInfos, ...customFields];
  });

  // Get field info for current field
  const selectedFieldInfo = $derived(
    allFieldsForLookup.find((f) => f.name === column.field) || null
  );

  // Get available formats for the selected field type
  const availableFormats = $derived.by(() => {
    if (!selectedFieldInfo) return ['default'] as ColumnFormat[];
    return getFormatsForType(selectedFieldInfo.type);
  });

  // Check if format options are available (more than just 'default')
  const hasFormatOptions = $derived(availableFormats.length > 1);

  function handleFieldChange(fieldName: string): void {
    onChange({
      ...column,
      field: fieldName,
      // Reset format when field changes
      format: undefined
    });
    showFormatSelect = false;
  }

  function handleLabelChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newLabel = input.value.trim();
    onChange({
      ...column,
      label: newLabel || undefined
    });
  }

  function handleFormatChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const newFormat = select.value as ColumnFormat;
    onChange({
      ...column,
      format: newFormat === 'default' ? undefined : newFormat
    });
  }

  function toggleLabelInput(): void {
    showLabelInput = !showLabelInput;
    if (!showLabelInput && column.label) {
      // Clear label when hiding
      onChange({
        ...column,
        label: undefined
      });
    }
  }

  function toggleFormatSelect(): void {
    showFormatSelect = !showFormatSelect;
    if (!showFormatSelect && column.format) {
      // Clear format when hiding
      onChange({
        ...column,
        format: undefined
      });
    }
  }

  function handleDragStartLocal(event: DragEvent): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    onDragStart(event, index);
  }

  function handleDragOverLocal(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    onDragOver(event, index);
  }
</script>

<div
  class="column-row"
  class:dragging={isDragging}
  class:drag-over={isDragOver}
  class:drag-top={isDragOver && dragPosition === 'top'}
  class:drag-bottom={isDragOver && dragPosition === 'bottom'}
  draggable="true"
  ondragstart={handleDragStartLocal}
  ondragover={handleDragOverLocal}
  ondragend={onDragEnd}
  role="listitem"
>
  <!-- Drag handle -->
  <button
    class="drag-handle"
    type="button"
    aria-label="Drag to reorder"
    title="Drag to reorder"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  </button>

  <!-- Column controls -->
  <div class="column-controls">
    <!-- Field selector -->
    <!-- Always exclude flint_title since title is always shown as first column -->
    <AutomergeDeckFieldSelector
      {fields}
      excludeFields={['flint_title', ...excludeFields]}
      selectedField={column.field}
      onSelect={handleFieldChange}
      placeholder="Select column..."
    />

    <!-- Optional: Custom label -->
    {#if showLabelInput}
      <input
        type="text"
        class="label-input"
        placeholder="Custom label..."
        value={column.label || ''}
        oninput={handleLabelChange}
      />
    {/if}

    <!-- Optional: Format selector -->
    {#if showFormatSelect && hasFormatOptions}
      <select
        class="format-select"
        value={column.format || 'default'}
        onchange={handleFormatChange}
      >
        {#each availableFormats as fmt (fmt)}
          <option value={fmt}>{getFormatLabel(fmt)}</option>
        {/each}
      </select>
    {/if}

    <!-- Toggle buttons for optional settings -->
    <div class="option-toggles">
      <button
        class="option-toggle"
        class:active={showLabelInput}
        onclick={toggleLabelInput}
        type="button"
        title={showLabelInput ? 'Remove custom label' : 'Add custom label'}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>

      {#if hasFormatOptions}
        <button
          class="option-toggle"
          class:active={showFormatSelect}
          onclick={toggleFormatSelect}
          type="button"
          title={showFormatSelect ? 'Remove format' : 'Set format'}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M4 7V4h16v3" />
            <path d="M9 20h6" />
            <path d="M12 4v16" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Remove button -->
  <button
    class="remove-btn"
    onclick={onRemove}
    type="button"
    aria-label="Remove column"
    title="Remove column"
  >
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  </button>
</div>

<style>
  .column-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-tertiary);
    border-radius: 0.375rem;
    transition: all 0.15s ease;
    position: relative;
  }

  .column-row.dragging {
    opacity: 0.5;
  }

  .column-row.drag-over {
    background: var(--bg-secondary);
  }

  .column-row.drag-top::before {
    content: '';
    position: absolute;
    top: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent-primary);
    border-radius: 1px;
  }

  .column-row.drag-bottom::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent-primary);
    border-radius: 1px;
  }

  .drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.75rem;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: grab;
    border-radius: 0.25rem;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .drag-handle:hover {
    background: var(--bg-secondary);
    color: var(--text-secondary);
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .column-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    flex: 1;
    align-items: flex-start;
  }

  .label-input {
    flex: 1;
    min-width: 100px;
    padding: 0.375rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.15s ease;
  }

  .label-input:focus {
    border-color: var(--accent-primary);
  }

  .label-input::placeholder {
    color: var(--text-muted);
  }

  .format-select {
    min-width: 120px;
    padding: 0.375rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-primary);
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .format-select:focus {
    border-color: var(--accent-primary);
  }

  .option-toggles {
    display: flex;
    gap: 0.25rem;
  }

  .option-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.75rem;
    padding: 0;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .option-toggle:hover {
    border-color: var(--border-medium);
    color: var(--text-secondary);
  }

  .option-toggle.active {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .remove-btn:hover {
    background: var(--bg-error, rgba(239, 68, 68, 0.1));
    color: var(--text-error, #ef4444);
  }

  .remove-btn svg {
    stroke: currentColor;
  }
</style>
