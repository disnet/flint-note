const defaultState = {
    leftSidebar: {
        visible: true,
        width: 300,
        activeSection: 'system'
    },
    rightSidebar: {
        visible: false,
        width: 400,
        mode: 'ai'
    },
    layout: 'single-column',
    breakpoint: 1400
};
class SidebarStateStore {
    state = $state(defaultState);
    constructor() {
        this.loadFromStorage();
        this.updateLayoutMode();
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', () => this.updateLayoutMode());
        }
    }
    get leftSidebar() {
        return this.state.leftSidebar;
    }
    get rightSidebar() {
        return this.state.rightSidebar;
    }
    get layout() {
        return this.state.layout;
    }
    get breakpoint() {
        return this.state.breakpoint;
    }
    toggleLeftSidebar() {
        this.state.leftSidebar.visible = !this.state.leftSidebar.visible;
        this.saveToStorage();
    }
    toggleRightSidebar() {
        this.state.rightSidebar.visible = !this.state.rightSidebar.visible;
        this.saveToStorage();
    }
    setRightSidebarMode(mode) {
        this.state.rightSidebar.mode = mode;
        this.saveToStorage();
    }
    setActiveSection(section) {
        this.state.leftSidebar.activeSection = section;
        this.saveToStorage();
    }
    updateLayoutMode() {
        if (typeof window === 'undefined')
            return;
        const width = window.innerWidth;
        this.state.layout = width > this.state.breakpoint ? 'three-column' : 'single-column';
    }
    loadFromStorage() {
        if (typeof window === 'undefined')
            return;
        try {
            const stored = localStorage.getItem('sidebarState');
            if (stored) {
                const parsed = JSON.parse(stored);
                this.state = { ...defaultState, ...parsed };
            }
        }
        catch (error) {
            console.warn('Failed to load sidebar state from storage:', error);
        }
    }
    saveToStorage() {
        if (typeof window === 'undefined')
            return;
        try {
            localStorage.setItem('sidebarState', JSON.stringify(this.state));
        }
        catch (error) {
            console.warn('Failed to save sidebar state to storage:', error);
        }
    }
}
export const sidebarState = new SidebarStateStore();
