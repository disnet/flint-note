declare class GlobalDragState {
    private state;
    get isDragging(): boolean;
    get draggedId(): string | null;
    get draggedType(): 'pinned' | 'temporary' | null;
    get dragOverIndex(): number | null;
    get dragOverSection(): 'pinned' | 'temporary' | null;
    get dragOverPosition(): 'top' | 'bottom' | null;
    set isDragging(value: boolean);
    set draggedId(value: string | null);
    set draggedType(value: 'pinned' | 'temporary' | null);
    set dragOverIndex(value: number | null);
    set dragOverSection(value: 'pinned' | 'temporary' | null);
    set dragOverPosition(value: 'top' | 'bottom' | null);
}
export declare const globalDragState: GlobalDragState;
export {};
