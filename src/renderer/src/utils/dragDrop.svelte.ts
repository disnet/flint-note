export interface DragState {
  isDragging: boolean;
  draggedId: string | null;
  draggedType: 'pinned' | 'temporary' | null;
  dragOverIndex: number | null;
  dragOverSection: 'pinned' | 'temporary' | null;
  dragOverPosition: 'top' | 'bottom' | null;
}

export function createDragState(): DragState {
  const dragState = $state({
    isDragging: false,
    draggedId: null,
    draggedType: null,
    dragOverIndex: null,
    dragOverSection: null,
    dragOverPosition: null
  });
  return dragState;
}

export function handleDragStart(
  event: DragEvent,
  id: string,
  type: 'pinned' | 'temporary',
  dragState: DragState
): void {
  if (!event.dataTransfer) return;

  dragState.isDragging = true;
  dragState.draggedId = id;
  dragState.draggedType = type;

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', JSON.stringify({ id, type }));
}

export function handleDragOver(
  event: DragEvent,
  index: number,
  section: 'pinned' | 'temporary',
  dragState: DragState,
  element?: HTMLElement
): void {
  event.preventDefault();
  dragState.dragOverIndex = index;
  dragState.dragOverSection = section;

  // Calculate if mouse is in top or bottom half of the element
  if (element) {
    const rect = element.getBoundingClientRect();
    const mouseY = event.clientY;
    const elementMiddle = rect.top + rect.height / 2;
    dragState.dragOverPosition = mouseY < elementMiddle ? 'top' : 'bottom';
  } else {
    dragState.dragOverPosition = 'bottom';
  }
}

export function handleDragEnd(dragState: DragState): void {
  dragState.isDragging = false;
  dragState.draggedId = null;
  dragState.draggedType = null;
  dragState.dragOverIndex = null;
  dragState.dragOverSection = null;
  dragState.dragOverPosition = null;
}

/**
 * Calculate the final drop index based on the target index and position
 */
export function calculateDropIndex(
  targetIndex: number,
  position: 'top' | 'bottom',
  sourceIndex?: number
): number {
  let dropIndex = targetIndex;

  // If dropping in bottom half, we want to insert after the target
  if (position === 'bottom') {
    dropIndex = targetIndex + 1;
  }

  // Adjust for same-section drags where source is before target
  if (sourceIndex !== undefined && sourceIndex < dropIndex) {
    dropIndex = Math.max(0, dropIndex - 1);
  }

  return dropIndex;
}
