interface SidebarState {
  leftSidebar: {
    visible: boolean;
    width: number;
    activeSection: 'system' | 'pinned' | 'tabs';
  };
  rightSidebar: {
    visible: boolean;
    width: number;
    mode: 'ai' | 'threads' | 'notes';
  };
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
  }
};

class SidebarStateStore {
  private state = $state<SidebarState>(defaultState);
  private isLoading = $state(true);
  private isInitialized = $state(false);
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initialize();
  }

  get leftSidebar(): SidebarState['leftSidebar'] {
    return this.state.leftSidebar;
  }

  get rightSidebar(): SidebarState['rightSidebar'] {
    return this.state.rightSidebar;
  }

  get loading(): boolean {
    return this.isLoading;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Ensure initialization is complete before operations
   */
  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Initialize the store by loading data from file system
   */
  private async initialize(): Promise<void> {
    this.isLoading = true;
    try {
      const storedState = (await window.api?.loadAppSettings()) as
        | { sidebarState?: SidebarState }
        | undefined;

      if (storedState?.sidebarState) {
        this.state = { ...defaultState, ...storedState.sidebarState };
        // Handle legacy metadata mode by defaulting to AI
        if ((this.state.rightSidebar.mode as string) === 'metadata') {
          this.state.rightSidebar.mode = 'ai';
        }
      }
    } catch (error) {
      console.warn('Failed to load sidebar state from storage:', error);
      // Keep default state on error
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  /**
   * Save current state to file system
   */
  private async saveToStorage(): Promise<void> {
    await this.ensureInitialized();

    try {
      // Snapshot the state to make it serializable for IPC
      const stateSnapshot = $state.snapshot(this.state);

      // Load existing settings and update the sidebar state portion
      const currentSettings =
        ((await window.api?.loadAppSettings()) as Record<string, unknown>) || {};
      const updatedSettings = {
        ...currentSettings,
        sidebarState: stateSnapshot
      };
      await window.api?.saveAppSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to save sidebar state to storage:', error);
    }
  }

  async toggleLeftSidebar(): Promise<void> {
    await this.ensureInitialized();
    this.state.leftSidebar.visible = !this.state.leftSidebar.visible;
    await this.saveToStorage();
  }

  async toggleRightSidebar(): Promise<void> {
    await this.ensureInitialized();
    this.state.rightSidebar.visible = !this.state.rightSidebar.visible;
    await this.saveToStorage();
  }

  async setRightSidebarMode(mode: 'ai' | 'threads' | 'notes'): Promise<void> {
    await this.ensureInitialized();
    this.state.rightSidebar.mode = mode;
    await this.saveToStorage();
  }

  async setActiveSection(section: 'system' | 'pinned' | 'tabs'): Promise<void> {
    await this.ensureInitialized();
    this.state.leftSidebar.activeSection = section;
    await this.saveToStorage();
  }

  async setLeftSidebarWidth(width: number): Promise<void> {
    await this.ensureInitialized();
    this.state.leftSidebar.width = width;
    await this.saveToStorage();
  }

  async setRightSidebarWidth(width: number): Promise<void> {
    await this.ensureInitialized();
    this.state.rightSidebar.width = width;
    await this.saveToStorage();
  }
}

export const sidebarState = new SidebarStateStore();
