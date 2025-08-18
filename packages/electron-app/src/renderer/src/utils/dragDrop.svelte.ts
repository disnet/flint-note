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

/**
 * Add animation classes to elements that moved during reordering
 */
export function animateReorder(
  containerSelector: string,
  sourceIndex: number,
  targetIndex: number,
  movedItemId: string
): void {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const items = container.querySelectorAll('.pinned-item, .tab-item');

  // Determine animation direction
  const movingUp = sourceIndex > targetIndex;

  // Add animation to the moved item
  const movedItem = container.querySelector(`[data-id="${movedItemId}"]`);
  if (movedItem) {
    movedItem.classList.add('fade-in');
    setTimeout(() => {
      movedItem.classList.remove('fade-in');
    }, 300);
  }

  // Add animation to affected items
  items.forEach((item, index) => {
    const element = item as HTMLElement;

    // Skip the moved item itself
    if (element.dataset.id === movedItemId) return;

    // Animate items that were displaced
    if (movingUp && index >= targetIndex && index < sourceIndex) {
      element.classList.add('moving-down');
      setTimeout(() => {
        element.classList.remove('moving-down');
      }, 300);
    } else if (!movingUp && index > sourceIndex && index <= targetIndex) {
      element.classList.add('moving-up');
      setTimeout(() => {
        element.classList.remove('moving-up');
      }, 300);
    }
  });
}

/**
 * Add a subtle pulse animation to newly added items
 */
export function animateItemAdd(itemId: string, containerSelector: string): void {
  setTimeout(() => {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const item = container.querySelector(`[data-id="${itemId}"]`);
    if (item) {
      item.classList.add('fade-in');
      setTimeout(() => {
        item.classList.remove('fade-in');
      }, 300);
    }
  }, 50); // Small delay to ensure DOM is updated
}

/**
 * Add a fade-out animation before removing an item
 */
export function animateItemRemove(
  itemId: string,
  containerSelector: string,
  callback: () => void
): void {
  const container = document.querySelector(containerSelector);
  if (!container) {
    callback();
    return;
  }

  const item = container.querySelector(`[data-id="${itemId}"]`);
  if (!item) {
    callback();
    return;
  }

  // Add fade-out class
  item.classList.add('fade-out');

  // Remove the item after animation completes
  setTimeout(() => {
    callback();
  }, 250); // Slightly shorter than fade-in for snappier feel
}
