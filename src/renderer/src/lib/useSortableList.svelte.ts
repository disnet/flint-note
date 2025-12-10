/**
 * Custom drag-and-drop hook for sortable lists with FLIP animations
 *
 * Uses native HTML5 Drag and Drop API with smooth animations.
 * Based on the POC implementation from flint-web.
 */

import { tick } from 'svelte';

export interface SortableItem {
  id: string;
}

export interface UseSortableListOptions {
  getItems: () => SortableItem[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  animationDuration?: number;
}

interface ListProps {
  ondragover: (e: DragEvent) => void;
  ondrop: (e: DragEvent) => void;
}

interface ItemProps {
  draggable: 'true';
  ondragstart: (e: DragEvent) => void;
  ondragend: () => void;
  'data-sortable-item': '';
  'data-sortable-id': string;
}

interface SortableListReturn {
  readonly draggedIndex: number | null;
  readonly isAnimating: boolean;
  setListElement: (el: HTMLElement) => void;
  getItemTransform: (index: number) => string | undefined;
  isDragging: (index: number) => boolean;
  getListProps: () => ListProps;
  getItemProps: (index: number, id: string) => ItemProps;
}

export function useSortableList(options: UseSortableListOptions): SortableListReturn {
  const { getItems, onReorder, animationDuration = 200 } = options;

  // Pre-create transparent drag image (loaded once, reused)
  const emptyDragImage = new Image();
  emptyDragImage.src =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // Drag state
  let draggedIndex = $state<number | null>(null);
  let targetIndex = $state<number | null>(null);
  let dragOffsetY = $state(0);
  let isAnimating = $state(false);

  // Internal refs
  let listElement: HTMLElement | null = null;
  let itemHeight = 0;
  let dragStartY = 0;

  function setListElement(el: HTMLElement): void {
    listElement = el;
  }

  function handleDragStart(e: DragEvent, index: number): void {
    draggedIndex = index;
    targetIndex = index;
    dragOffsetY = 0;

    // Measure item height for animations
    const item = (e.target as HTMLElement).closest('[data-sortable-item]') as HTMLElement;
    if (item) {
      itemHeight = item.offsetHeight;
    }

    // Record the starting Y position
    dragStartY = e.clientY;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      // Use pre-loaded transparent image to hide native drag ghost
      e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
    }
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (draggedIndex === null || !listElement) return;

    const items = getItems();

    // Update dragged item's position to follow cursor
    dragOffsetY = e.clientY - dragStartY;

    // Calculate which index the cursor is over based on Y position
    const listRect = listElement.getBoundingClientRect();
    const y = e.clientY - listRect.top + listElement.scrollTop;
    let newTargetIndex = Math.floor(y / itemHeight);
    newTargetIndex = Math.max(0, Math.min(items.length - 1, newTargetIndex));

    if (newTargetIndex !== targetIndex) {
      targetIndex = newTargetIndex;
    }
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    finishDrag();
  }

  function handleDragEnd(): void {
    finishDrag();
  }

  async function finishDrag(): Promise<void> {
    if (draggedIndex === null || targetIndex === null) {
      draggedIndex = null;
      targetIndex = null;
      dragOffsetY = 0;
      return;
    }

    const items = getItems();
    const from = draggedIndex;
    const to = targetIndex;

    if (from === to) {
      draggedIndex = null;
      targetIndex = null;
      dragOffsetY = 0;
      return;
    }

    // Save the dragged item's current pixel offset (it follows the cursor)
    const draggedItemId = items[from].id;
    const draggedItemOffset = dragOffsetY;

    // Record the current visual position of each item (where user sees them)
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Map used only for local computation, not reactive state
    const visualPositions = new Map<string, number>();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Calculate where this item visually appears based on drag state
      let visualIndex = i;
      if (i === from) {
        visualIndex = to;
      } else if (from < to && i > from && i <= to) {
        visualIndex = i - 1;
      } else if (from > to && i >= to && i < from) {
        visualIndex = i + 1;
      }
      visualPositions.set(item.id, visualIndex);
    }

    // Enter animating state
    isAnimating = true;

    // Reset drag state
    draggedIndex = null;
    targetIndex = null;
    dragOffsetY = 0;

    // Apply the reorder
    onReorder(from, to);

    // Wait for Svelte to update the DOM with new order
    await tick();

    if (!listElement) {
      isAnimating = false;
      return;
    }

    // Query fresh element references
    const freshElements =
      listElement.querySelectorAll<HTMLElement>('[data-sortable-item]');

    // Now items are in their new DOM positions (0, 1, 2, ...)
    // We need to animate them FROM their old visual positions TO their new positions
    freshElements.forEach((el, newIndex) => {
      const id = el.dataset.sortableId;
      if (!id) return;

      let deltaY: number;

      if (id === draggedItemId) {
        // The dragged item was at its original index + dragOffsetY pixels
        // Now it's at newIndex (which equals 'to')
        // deltaY = (from - newIndex) * itemHeight + draggedItemOffset
        deltaY = (from - newIndex) * itemHeight + draggedItemOffset;
      } else {
        const oldVisualIndex = visualPositions.get(id);
        if (oldVisualIndex === undefined) return;

        // Calculate how many positions to offset (old visual - new actual)
        const indexDelta = oldVisualIndex - newIndex;
        deltaY = indexDelta * itemHeight;
      }

      // Disable transition and apply inverse transform immediately
      el.style.transition = 'none';
      el.style.transform = deltaY !== 0 ? `translateY(${deltaY}px)` : '';
    });

    // Force reflow - accessing offsetHeight triggers layout recalculation
    void listElement.offsetHeight;

    // Disable pointer events during animation to reset hover states
    listElement.style.pointerEvents = 'none';

    // Animate to final position
    freshElements.forEach((el) => {
      el.style.transition = `transform ${animationDuration}ms cubic-bezier(0.2, 0, 0, 1)`;
      el.style.transform = '';
    });

    // Clean up
    setTimeout(() => {
      freshElements.forEach((el) => {
        el.style.transition = '';
      });
      if (listElement) {
        listElement.style.pointerEvents = '';
      }
      isAnimating = false;
    }, animationDuration);
  }

  // Calculate transform for each item based on drag state
  function getItemTransform(index: number): string | undefined {
    // During FLIP animation, don't set transform via Svelte - we control it directly
    if (isAnimating) return undefined;

    if (draggedIndex === null || targetIndex === null) return undefined;

    // The dragged item follows the cursor
    if (index === draggedIndex) {
      return `translateY(${dragOffsetY}px)`;
    }

    // Items between draggedIndex and targetIndex need to shift
    if (draggedIndex < targetIndex) {
      // Dragging down: items between drag and target shift up
      if (index > draggedIndex && index <= targetIndex) {
        return `translateY(-${itemHeight}px)`;
      }
    } else {
      // Dragging up: items between target and drag shift down
      if (index >= targetIndex && index < draggedIndex) {
        return `translateY(${itemHeight}px)`;
      }
    }
    return undefined;
  }

  // Check if a specific index is currently being dragged
  function isDragging(index: number): boolean {
    return draggedIndex === index;
  }

  // Props to spread on the list container
  function getListProps(): ListProps {
    return {
      ondragover: handleDragOver,
      ondrop: handleDrop
    };
  }

  // Props to spread on each item
  function getItemProps(index: number, id: string): ItemProps {
    return {
      draggable: 'true',
      ondragstart: (e: DragEvent) => handleDragStart(e, index),
      ondragend: handleDragEnd,
      'data-sortable-item': '',
      'data-sortable-id': id
    };
  }

  return {
    // State (read-only)
    get draggedIndex() {
      return draggedIndex;
    },
    get isAnimating() {
      return isAnimating;
    },

    // Methods
    setListElement,
    getItemTransform,
    isDragging,
    getListProps,
    getItemProps
  };
}
