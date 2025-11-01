import type { DragState } from '../utils/dragDrop.svelte';

// Re-export DragState type for convenience
export type { DragState };

// Create a global drag state that can be shared between components
class GlobalDragState {
  private state = $state<DragState>({
    isDragging: false,
    draggedId: null,
    draggedType: null,
    dragOverIndex: null,
    dragOverSection: null,
    dragOverPosition: null
  });

  get isDragging(): boolean {
    return this.state.isDragging;
  }

  get draggedId(): string | null {
    return this.state.draggedId;
  }

  get draggedType(): 'pinned' | 'temporary' | null {
    return this.state.draggedType;
  }

  get dragOverIndex(): number | null {
    return this.state.dragOverIndex;
  }

  get dragOverSection(): 'pinned' | 'temporary' | null {
    return this.state.dragOverSection;
  }

  get dragOverPosition(): 'top' | 'bottom' | null {
    return this.state.dragOverPosition;
  }

  set isDragging(value: boolean) {
    this.state.isDragging = value;
  }

  set draggedId(value: string | null) {
    this.state.draggedId = value;
  }

  set draggedType(value: 'pinned' | 'temporary' | null) {
    this.state.draggedType = value;
  }

  set dragOverIndex(value: number | null) {
    this.state.dragOverIndex = value;
  }

  set dragOverSection(value: 'pinned' | 'temporary' | null) {
    this.state.dragOverSection = value;
  }

  set dragOverPosition(value: 'top' | 'bottom' | null) {
    this.state.dragOverPosition = value;
  }
}

export const globalDragState = new GlobalDragState();
