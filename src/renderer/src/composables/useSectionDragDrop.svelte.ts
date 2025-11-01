import { globalDragState } from '../stores/dragState.svelte';
import type { DragState } from '../stores/dragState.svelte';
import {
  handleDragStart as baseDragStart,
  handleDragOver as baseDragOver,
  handleDragEnd as baseDragEnd,
  calculateDropIndex
} from '../utils/dragDrop.svelte';
import { handleCrossSectionDrop } from '../utils/crossSectionDrag.svelte';

interface SectionDragDropOptions<T> {
  sectionType: 'pinned' | 'temporary';
  items: T[];
  getItemId: (item: T) => string;
  onReorder: (sourceIndex: number, targetIndex: number) => Promise<void>;
  onCrossSectionDrop?: (
    id: string,
    sourceType: string,
    dropIndex: number
  ) => Promise<boolean>;
}

export function useSectionDragDrop<T>(options: SectionDragDropOptions<T>) {
  const {
    sectionType,
    items,
    getItemId,
    onReorder,
    onCrossSectionDrop: customCrossSectionHandler
  } = options;

  const dragState = globalDragState;

  function onDragStart(event: DragEvent, item: T): void {
    const itemId = getItemId(item);
    baseDragStart(event, itemId, sectionType, dragState);
  }

  function onDragOver(event: DragEvent, index: number, element: HTMLElement): void {
    baseDragOver(event, index, sectionType, dragState, element);
  }

  async function onDrop(event: DragEvent, targetIndex: number): Promise<void> {
    event.preventDefault();

    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    const { id, type } = JSON.parse(data);
    const position = dragState.dragOverPosition || 'bottom';

    // Calculate drop index
    const sourceIndex =
      type === sectionType ? items.findIndex((item) => getItemId(item) === id) : undefined;
    const dropIndex = calculateDropIndex(targetIndex, position, sourceIndex);

    // Handle cross-section drag
    if (type !== sectionType) {
      if (customCrossSectionHandler) {
        if (await customCrossSectionHandler(id, type, dropIndex)) {
          baseDragEnd(dragState);
          return;
        }
      } else {
        if (await handleCrossSectionDrop(id, type, sectionType, dropIndex)) {
          baseDragEnd(dragState);
          return;
        }
      }
    }

    // Handle same-section reorder
    if (type === sectionType && sourceIndex !== undefined && sourceIndex !== dropIndex) {
      try {
        await onReorder(sourceIndex, dropIndex);
      } catch (error) {
        console.error(`Failed to reorder items in ${sectionType}:`, error);
      }
    }

    baseDragEnd(dragState);
  }

  function onDragEnd(): void {
    baseDragEnd(dragState);
  }

  return {
    dragState,
    handlers: {
      onDragStart,
      onDragOver,
      onDrop,
      onDragEnd
    }
  };
}
