<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import type { DeckSort, ColumnConfig, FilterFieldInfo } from '../lib/automerge/deck';
  import { SYSTEM_FIELDS } from '../lib/automerge/deck';
  import DeckPropChip from './DeckPropChip.svelte';

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
  let grabOffsetX = $state<number>(0);
  let grabOffsetY = $state<number>(0);
  let chipRects = new SvelteMap<number, DOMRect>();
  let activePointerId = $state<number | null>(null);

  // Calculate the transform offset for each item to animate to its new position
  function getShiftOffset(index: number): { x: number; y: number } | null {
    if (draggedIndex === null || targetIndex === null) return null;
    if (index === draggedIndex) return null;
    if (draggedIndex === targetIndex) return null;

    const currentRect = chipRects.get(index);
    if (!currentRect) return null;

    // Determine the visual index this item should move to
    let visualIndex: number;

    if (targetIndex > draggedIndex) {
      // Dragging right: items between dragged+1 and target shift left (to previous index)
      if (index > draggedIndex && index <= targetIndex) {
        visualIndex = index - 1;
      } else {
        return null;
      }
    } else {
      // Dragging left: items between target and dragged-1 shift right (to next index)
      if (index >= targetIndex && index < draggedIndex) {
        visualIndex = index + 1;
      } else {
        return null;
      }
    }

    // Get the rect of the position this item should move to
    const targetRect = chipRects.get(visualIndex);
    if (!targetRect) return null;

    // Calculate offset from current position to target position
    return {
      x: targetRect.left - currentRect.left,
      y: targetRect.top - currentRect.top
    };
  }

  function handleDragHandlePointerDown(event: PointerEvent, index: number): void {
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
      chipRects.clear();
      chips.forEach((chip, idx) => {
        chipRects.set(idx, chip.getBoundingClientRect());
      });
    }

    draggedIndex = index;
    targetIndex = index;
    const rect = chipWrapper.getBoundingClientRect();
    grabOffsetX = event.clientX - rect.left;
    grabOffsetY = event.clientY - rect.top;

    // Create ghost element
    const ghost = chipWrapper.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 10000;
      width: ${chipWrapper.offsetWidth}px;
      top: ${rect.top}px;
      left: ${rect.left}px;
      opacity: 0.95;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      transform: scale(1.02);
      border-radius: 1rem;
    `;
    document.body.appendChild(ghost);
    ghostElement = ghost;

    activePointerId = event.pointerId;
    target.setPointerCapture(event.pointerId);

    // Use document-level listeners for more reliable cleanup
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (draggedIndex === null || !ghostElement) return;
    if (event.pointerId !== activePointerId) return;

    // Update ghost position (follows cursor with grab offset)
    ghostElement.style.left = `${event.clientX - grabOffsetX}px`;
    ghostElement.style.top = `${event.clientY - grabOffsetY}px`;

    // Find closest chip position based on cursor
    const cursorX = event.clientX;
    const cursorY = event.clientY;
    const currentDraggedIndex = draggedIndex;
    let newTargetIndex = currentDraggedIndex;
    let minDistance = Infinity;

    chipRects.forEach((rect, idx) => {
      // Calculate distance to chip center
      const chipCenterX = rect.left + rect.width / 2;
      const chipCenterY = rect.top + rect.height / 2;
      const distance = Math.sqrt(
        Math.pow(cursorX - chipCenterX, 2) + Math.pow(cursorY - chipCenterY, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        newTargetIndex = idx;
      }
    });

    targetIndex = newTargetIndex;
  }

  function handlePointerUp(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return;

    cleanupDrag();

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
    chipRects.clear();
    activePointerId = null;
  }

  function cleanupDrag(): void {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerUp);

    if (ghostElement) {
      ghostElement.remove();
      ghostElement = null;
    }
  }

  // Clean up on component destroy
  onDestroy(() => {
    cleanupDrag();
  });

  // Get label for a column field
  function getColumnLabel(column: ColumnConfig): string {
    if (column.label) return column.label;
    const systemField = SYSTEM_FIELDS.find(
      (f) =>
        f.name === column.field ||
        f.name === `flint_${column.field}` ||
        column.field === f.name.replace('flint_', '')
    );
    if (systemField) return systemField.label;
    const schemaField = availableFields.find((f) => f.name === column.field);
    if (schemaField) return schemaField.label;
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
    <DeckPropChip
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
      shiftOffset={getShiftOffset(index)}
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
