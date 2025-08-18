interface SidebarState {
    leftSidebar: {
        visible: boolean;
        width: number;
        activeSection: 'system' | 'pinned' | 'tabs';
    };
    rightSidebar: {
        visible: boolean;
        width: number;
        mode: 'ai' | 'metadata' | 'threads';
    };
    layout: 'single-column' | 'three-column';
    breakpoint: number;
}
declare class SidebarStateStore {
    private state;
    constructor();
    get leftSidebar(): SidebarState['leftSidebar'];
    get rightSidebar(): SidebarState['rightSidebar'];
    get layout(): SidebarState['layout'];
    get breakpoint(): number;
    toggleLeftSidebar(): void;
    toggleRightSidebar(): void;
    setRightSidebarMode(mode: 'ai' | 'metadata' | 'threads'): void;
    setActiveSection(section: 'system' | 'pinned' | 'tabs'): void;
    private updateLayoutMode;
    private loadFromStorage;
    private saveToStorage;
}
export declare const sidebarState: SidebarStateStore;
export {};
