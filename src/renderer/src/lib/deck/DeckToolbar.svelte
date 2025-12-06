<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
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
    /** Called when visibility is toggled on a prop */
    onVisibilityToggle?: (field: string, visible: boolean) => void;
    /** Called when sort is toggled on a prop */
    onSort?: (field: string, order: 'asc' | 'desc') => void;
    /** Called when props are reordered via drag-and-drop */
    onReorder?: (columns: ColumnConfig[]) => void;
  }

  let {
    columns,
    availableFields,
    sort,
    onNewNote,
    onPropClick,
    onAddProp,
    onVisibilityToggle,
    onSort,
    onReorder
  }: Props = $props();

  // Pointer-based drag state
  let draggedIndex = $state<number | null>(null);
  let targetIndex = $state<number | null>(null);
  let ghostElement = $state<HTMLElement | null>(null);
  let initialY = $state<number>(0);
  let grabOffsetX = $state<number>(0); // Offset from cursor to left edge of chip
  let chipRects = new SvelteMap<number, DOMRect>();
  let draggedWidth = $state<number>(0);

  // Calculate which direction each item should shift
  function getShiftDirection(index: number): 'left' | 'right' | null {
    if (draggedIndex === null || targetIndex === null) return null;
    if (index === draggedIndex) return null;

    // If dragging right (to higher index)
    if (targetIndex > draggedIndex) {
      // Items between draggedIndex and targetIndex shift left
      if (index > draggedIndex && index <= targetIndex) {
        return 'left';
      }
    }
    // If dragging left (to lower index)
    else if (targetIndex < draggedIndex) {
      // Items between targetIndex and draggedIndex shift right
      if (index >= targetIndex && index < draggedIndex) {
        return 'right';
      }
    }
    return null;
  }

  function handleDragHandlePointerDown(event: PointerEvent, index: number): void {
    // Only handle left mouse button
    if (event.button !== 0) return;

    const target = event.currentTarget as HTMLElement;
    const chipWrapper = target.closest('.prop-chip-wrapper') as HTMLElement;
    if (!chipWrapper) return;

    event.preventDefault();
    event.stopPropagation();

    // Store all chip positions before drag starts
    const toolbar = chipWrapper.closest('.deck-toolbar');
    if (toolbar) {
      const chips = toolbar.querySelectorAll('.prop-chip-wrapper');
      chipRects = new SvelteMap();
      chips.forEach((chip, idx) => {
        chipRects.set(idx, chip.getBoundingClientRect());
      });
    }

    draggedIndex = index;
    targetIndex = index;
    draggedWidth = chipWrapper.offsetWidth;
    const rect = chipWrapper.getBoundingClientRect();
    initialY = rect.top;
    // Calculate offset from cursor to left edge of chip (so ghost stays where grabbed)
    grabOffsetX = event.clientX - rect.left;

    // Create ghost element
    const ghost = chipWrapper.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 10000;
      width: ${chipWrapper.offsetWidth}px;
      top: ${initialY}px;
      left: ${rect.left}px;
      opacity: 0.95;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      transform: scale(1.02);
      border-radius: 1rem;
    `;
    document.body.appendChild(ghost);
    ghostElement = ghost;

    // Capture pointer on the handle
    target.setPointerCapture(event.pointerId);

    // Add move and up listeners to the handle
    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerUp);
    target.addEventListener('pointercancel', handlePointerUp);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (draggedIndex === null || !ghostElement) return;

    // Update ghost position (locked to initial Y, follows X using grab offset)
    ghostElement.style.left = `${event.clientX - grabOffsetX}px`;

    // Find which position we should move to based on X
    const centerX = event.clientX;
    const currentDraggedIndex = draggedIndex; // Store to satisfy TypeScript in forEach
    let newTargetIndex = currentDraggedIndex;

    chipRects.forEach((rect, idx) => {
      if (idx === currentDraggedIndex) return;
      const chipCenterX = rect.left + rect.width / 2;

      // When moving right, check if we've passed the center of items to the right
      if (idx > currentDraggedIndex && centerX > chipCenterX) {
        newTargetIndex = Math.max(newTargetIndex, idx);
      }
      // When moving left, check if we've passed the center of items to the left
      else if (idx < currentDraggedIndex && centerX < chipCenterX) {
        newTargetIndex = Math.min(newTargetIndex, idx);
      }
    });

    targetIndex = newTargetIndex;
  }

  function handlePointerUp(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement;

    // Remove listeners
    target.removeEventListener('pointermove', handlePointerMove);
    target.removeEventListener('pointerup', handlePointerUp);
    target.removeEventListener('pointercancel', handlePointerUp);
    target.releasePointerCapture(event.pointerId);

    // Remove ghost
    if (ghostElement) {
      ghostElement.remove();
      ghostElement = null;
    }

    // Perform reorder if target changed
    if (
      draggedIndex !== null &&
      targetIndex !== null &&
      draggedIndex !== targetIndex &&
      onReorder
    ) {
      const newColumns = [...columns];
      const [removed] = newColumns.splice(draggedIndex, 1);
      newColumns.splice(targetIndex, 0, removed);
      onReorder(newColumns);
    }

    draggedIndex = null;
    targetIndex = null;
    chipRects = new SvelteMap();
  }

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
  {#each columns as column, index (column.field)}
    <PropChip
      field={column.field}
      label={getColumnLabel(column)}
      visible={column.visible !== false}
      {sort}
      onClick={(event: MouseEvent) => {
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        onPropClick(column.field, { top: rect.bottom + 4, left: rect.left });
      }}
      {onVisibilityToggle}
      {onSort}
      isDragging={draggedIndex === index}
      shiftDirection={getShiftDirection(index)}
      shiftAmount={draggedWidth}
      onDragHandlePointerDown={(event) => handleDragHandlePointerDown(event, index)}
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
