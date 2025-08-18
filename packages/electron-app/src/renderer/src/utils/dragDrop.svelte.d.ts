export interface DragState {
    isDragging: boolean;
    draggedId: string | null;
    draggedType: 'pinned' | 'temporary' | null;
    dragOverIndex: number | null;
    dragOverSection: 'pinned' | 'temporary' | null;
    dragOverPosition: 'top' | 'bottom' | null;
}
export declare function createDragState(): DragState;
export declare function handleDragStart(event: DragEvent, id: string, type: 'pinned' | 'temporary', dragState: DragState): void;
export declare function handleDragOver(event: DragEvent, index: number, section: 'pinned' | 'temporary', dragState: DragState, element?: HTMLElement): void;
export declare function handleDragEnd(dragState: DragState): void;
/**
 * Calculate the final drop index based on the target index and position
 */
export declare function calculateDropIndex(targetIndex: number, position: 'top' | 'bottom', sourceIndex?: number): number;
/**
 * Add animation classes to elements that moved during reordering
 */
export declare function animateReorder(containerSelector: string, sourceIndex: number, targetIndex: number, movedItemId: string): void;
/**
 * Add a subtle pulse animation to newly added items
 */
export declare function animateItemAdd(itemId: string, containerSelector: string): void;
/**
 * Add a fade-out animation before removing an item
 */
export declare function animateItemRemove(itemId: string, containerSelector: string, callback: () => void): void;
