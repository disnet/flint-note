// Create a global drag state that can be shared between components
class GlobalDragState {
    state = $state({
        isDragging: false,
        draggedId: null,
        draggedType: null,
        dragOverIndex: null,
        dragOverSection: null,
        dragOverPosition: null
    });
    get isDragging() {
        return this.state.isDragging;
    }
    get draggedId() {
        return this.state.draggedId;
    }
    get draggedType() {
        return this.state.draggedType;
    }
    get dragOverIndex() {
        return this.state.dragOverIndex;
    }
    get dragOverSection() {
        return this.state.dragOverSection;
    }
    get dragOverPosition() {
        return this.state.dragOverPosition;
    }
    set isDragging(value) {
        this.state.isDragging = value;
    }
    set draggedId(value) {
        this.state.draggedId = value;
    }
    set draggedType(value) {
        this.state.draggedType = value;
    }
    set dragOverIndex(value) {
        this.state.dragOverIndex = value;
    }
    set dragOverSection(value) {
        this.state.dragOverSection = value;
    }
    set dragOverPosition(value) {
        this.state.dragOverPosition = value;
    }
}
export const globalDragState = new GlobalDragState();
