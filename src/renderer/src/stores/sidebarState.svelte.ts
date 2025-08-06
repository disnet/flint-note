interface SidebarState {
  leftSidebar: {
    visible: boolean;
    width: number;
    activeSection: 'system' | 'pinned' | 'tabs';
  };
  rightSidebar: {
    visible: boolean;
    width: number;
    mode: 'ai' | 'metadata';
  };
  layout: 'single-column' | 'three-column';
  breakpoint: number;
}

const defaultState: SidebarState = {
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
  private state = $state<SidebarState>(defaultState);

  constructor() {
    this.loadFromStorage();
    this.updateLayoutMode();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.updateLayoutMode());
    }
  }

  get leftSidebar(): SidebarState['leftSidebar'] {
    return this.state.leftSidebar;
  }

  get rightSidebar(): SidebarState['rightSidebar'] {
    return this.state.rightSidebar;
  }

  get layout(): SidebarState['layout'] {
    return this.state.layout;
  }

  get breakpoint(): number {
    return this.state.breakpoint;
  }

  toggleLeftSidebar(): void {
    this.state.leftSidebar.visible = !this.state.leftSidebar.visible;
    this.saveToStorage();
  }

  toggleRightSidebar(): void {
    this.state.rightSidebar.visible = !this.state.rightSidebar.visible;
    this.saveToStorage();
  }

  setRightSidebarMode(mode: 'ai' | 'metadata'): void {
    this.state.rightSidebar.mode = mode;
    this.saveToStorage();
  }

  setActiveSection(section: 'system' | 'pinned' | 'tabs'): void {
    this.state.leftSidebar.activeSection = section;
    this.saveToStorage();
  }

  private updateLayoutMode(): void {
    if (typeof window === 'undefined') return;

    const width = window.innerWidth;
    this.state.layout = width > this.state.breakpoint ? 'three-column' : 'single-column';
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('sidebarState');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = { ...defaultState, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load sidebar state from storage:', error);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem('sidebarState', JSON.stringify(this.state));
    } catch (error) {
      console.warn('Failed to save sidebar state to storage:', error);
    }
  }
}

export const sidebarState = new SidebarStateStore();
