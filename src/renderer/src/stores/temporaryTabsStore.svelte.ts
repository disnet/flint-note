interface TemporaryTab {
  id: string;
  noteId: string;
  title: string;
  openedAt: Date;
  lastAccessed: Date;
  source: 'search' | 'wikilink' | 'navigation';
}

interface TemporaryTabsState {
  tabs: TemporaryTab[];
  activeTabId: string | null;
  maxTabs: number;
  autoCleanupHours: number;
}

const defaultState: TemporaryTabsState = {
  tabs: [],
  activeTabId: null,
  maxTabs: 10,
  autoCleanupHours: 24
};

class TemporaryTabsStore {
  private state = $state<TemporaryTabsState>(defaultState);

  constructor() {
    this.loadFromStorage();
    this.cleanupOldTabs();
  }

  get tabs() {
    return this.state.tabs;
  }

  get activeTabId() {
    return this.state.activeTabId;
  }

  get maxTabs() {
    return this.state.maxTabs;
  }

  addTab(noteId: string, title: string, source: 'search' | 'wikilink' | 'navigation') {
    const existingIndex = this.state.tabs.findIndex(tab => tab.noteId === noteId);
    
    if (existingIndex !== -1) {
      // Update existing tab
      this.state.tabs[existingIndex].lastAccessed = new Date();
      this.state.tabs[existingIndex].title = title; // Update title in case it changed
      this.state.activeTabId = this.state.tabs[existingIndex].id;
      this.moveToTop(existingIndex);
    } else {
      // Create new tab
      const newTab: TemporaryTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        noteId,
        title,
        openedAt: new Date(),
        lastAccessed: new Date(),
        source
      };

      this.state.tabs.unshift(newTab);
      this.state.activeTabId = newTab.id;

      // Enforce max tabs limit
      if (this.state.tabs.length > this.state.maxTabs) {
        this.state.tabs = this.state.tabs.slice(0, this.state.maxTabs);
      }
    }

    this.saveToStorage();
  }

  removeTab(tabId: string) {
    const index = this.state.tabs.findIndex(tab => tab.id === tabId);
    if (index !== -1) {
      this.state.tabs.splice(index, 1);
      
      // Update active tab if the removed tab was active
      if (this.state.activeTabId === tabId) {
        this.state.activeTabId = this.state.tabs.length > 0 ? this.state.tabs[0].id : null;
      }
    }

    this.saveToStorage();
  }

  clearAllTabs() {
    this.state.tabs = [];
    this.state.activeTabId = null;
    this.saveToStorage();
  }

  setActiveTab(tabId: string) {
    const tab = this.state.tabs.find(t => t.id === tabId);
    if (tab) {
      this.state.activeTabId = tabId;
      tab.lastAccessed = new Date();
      
      // Move to top of list
      const index = this.state.tabs.findIndex(t => t.id === tabId);
      if (index > 0) {
        this.moveToTop(index);
      }
    }

    this.saveToStorage();
  }

  private moveToTop(index: number) {
    const [tab] = this.state.tabs.splice(index, 1);
    this.state.tabs.unshift(tab);
  }

  private cleanupOldTabs() {
    const cutoffTime = new Date(Date.now() - (this.state.autoCleanupHours * 60 * 60 * 1000));
    
    this.state.tabs = this.state.tabs.filter(tab => {
      return tab.lastAccessed > cutoffTime;
    });

    // Update active tab if it was cleaned up
    if (this.state.activeTabId && !this.state.tabs.find(tab => tab.id === this.state.activeTabId)) {
      this.state.activeTabId = this.state.tabs.length > 0 ? this.state.tabs[0].id : null;
    }

    this.saveToStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem('temporaryTabs');
      if (stored) {
        const parsed = JSON.parse(stored);
        
        // Convert date strings back to Date objects
        parsed.tabs = parsed.tabs.map((tab: any) => ({
          ...tab,
          openedAt: new Date(tab.openedAt),
          lastAccessed: new Date(tab.lastAccessed)
        }));
        
        this.state = { ...defaultState, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load temporary tabs from storage:', error);
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem('temporaryTabs', JSON.stringify(this.state));
    } catch (error) {
      console.warn('Failed to save temporary tabs to storage:', error);
    }
  }
}

export const temporaryTabsStore = new TemporaryTabsStore();