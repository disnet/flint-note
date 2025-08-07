import { getChatService } from '../services/chatService';

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
  private currentVaultId: string | null = null;
  private isVaultSwitching = false;

  constructor() {
    this.initializeVault();
  }

  get tabs(): TemporaryTab[] {
    return this.state.tabs;
  }

  get activeTabId(): string | null {
    return this.state.activeTabId;
  }

  get maxTabs(): number {
    return this.state.maxTabs;
  }

  addTab(
    noteId: string,
    title: string,
    source: 'search' | 'wikilink' | 'navigation'
  ): void {
    // Don't add tabs while we're switching vaults
    if (this.isVaultSwitching) {
      return;
    }

    const existingIndex = this.state.tabs.findIndex((tab) => tab.noteId === noteId);

    if (existingIndex !== -1) {
      // Update existing tab without moving it
      this.state.tabs[existingIndex].lastAccessed = new Date();
      this.state.tabs[existingIndex].title = title; // Update title in case it changed
      this.state.activeTabId = this.state.tabs[existingIndex].id;
      // Don't move to top - keep existing position
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

      // Add to bottom instead of top
      this.state.tabs.push(newTab);
      this.state.activeTabId = newTab.id;

      // Enforce max tabs limit by removing from the beginning (oldest tabs)
      if (this.state.tabs.length > this.state.maxTabs) {
        this.state.tabs = this.state.tabs.slice(-this.state.maxTabs);
      }
    }

    this.saveToStorage();
  }

  removeTab(tabId: string): void {
    const index = this.state.tabs.findIndex((tab) => tab.id === tabId);
    if (index !== -1) {
      this.state.tabs.splice(index, 1);

      // Update active tab if the removed tab was active
      if (this.state.activeTabId === tabId) {
        this.state.activeTabId =
          this.state.tabs.length > 0 ? this.state.tabs[0].id : null;
      }
    }

    this.saveToStorage();
  }

  clearAllTabs(): void {
    this.state.tabs = [];
    this.state.activeTabId = null;
    this.saveToStorage();
  }

  startVaultSwitch(): void {
    console.log(
      '🔒 startVaultSwitch: current vault',
      this.currentVaultId,
      'tabs:',
      this.state.tabs.length
    );
    this.isVaultSwitching = true;
    // Save current tabs to storage before clearing
    this.saveToStorage();
    console.log(
      '💾 startVaultSwitch: saved tabs to storage for vault',
      this.currentVaultId
    );
    // Clear the UI but keep vault-specific storage intact
    this.state.tabs = [];
    this.state.activeTabId = null;
    console.log('🧹 startVaultSwitch: cleared UI tabs');
  }

  endVaultSwitch(): void {
    this.isVaultSwitching = false;
  }

  /**
   * Remove tabs by note IDs (used by navigation service for coordination)
   */
  removeTabsByNoteIds(noteIds: string[]): void {
    const originalLength = this.state.tabs.length;
    this.state.tabs = this.state.tabs.filter((tab) => !noteIds.includes(tab.noteId));

    // Update active tab if the removed tab was active
    if (
      this.state.activeTabId &&
      !this.state.tabs.find((tab) => tab.id === this.state.activeTabId)
    ) {
      this.state.activeTabId = this.state.tabs.length > 0 ? this.state.tabs[0].id : null;
    }

    // Only save if something was actually removed
    if (this.state.tabs.length !== originalLength) {
      this.saveToStorage();
    }
  }

  /**
   * Clear the active tab highlighting
   */
  clearActiveTab(): void {
    this.state.activeTabId = null;
    this.saveToStorage();
  }

  setActiveTab(tabId: string): void {
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (tab) {
      this.state.activeTabId = tabId;
      tab.lastAccessed = new Date();
      // Don't move to top - keep existing position
    }

    this.saveToStorage();
  }

  private cleanupOldTabs(): void {
    const cutoffTime = new Date(
      Date.now() - this.state.autoCleanupHours * 60 * 60 * 1000
    );

    this.state.tabs = this.state.tabs.filter((tab) => {
      return tab.lastAccessed > cutoffTime;
    });

    // Update active tab if it was cleaned up
    if (
      this.state.activeTabId &&
      !this.state.tabs.find((tab) => tab.id === this.state.activeTabId)
    ) {
      this.state.activeTabId = this.state.tabs.length > 0 ? this.state.tabs[0].id : null;
    }

    this.saveToStorage();
  }

  private async initializeVault(): Promise<void> {
    // Clean up old non-vault-specific data
    this.migrateOldStorage();

    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.currentVaultId = vault?.id || 'default';
      this.loadFromStorage();
      this.cleanupOldTabs();
    } catch (error) {
      console.warn('Failed to initialize vault for temporary tabs:', error);
      this.currentVaultId = 'default';
      this.loadFromStorage();
      this.cleanupOldTabs();
    }
  }

  private migrateOldStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      // Remove old non-vault-specific storage
      localStorage.removeItem('temporaryTabs');
    } catch (error) {
      console.warn('Failed to migrate old temporary tabs storage:', error);
    }
  }

  private getStorageKey(): string {
    const vaultId = this.currentVaultId || 'default';
    return `temporaryTabs-${vaultId}`;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        const parsed = JSON.parse(stored);

        // Convert date strings back to Date objects
        parsed.tabs = parsed.tabs.map(
          (tab: TemporaryTab & { openedAt: string; lastAccessed: string }) => ({
            ...tab,
            openedAt: new Date(tab.openedAt),
            lastAccessed: new Date(tab.lastAccessed)
          })
        );

        this.state = { ...defaultState, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load temporary tabs from storage:', error);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(this.state));
    } catch (error) {
      console.warn('Failed to save temporary tabs to storage:', error);
    }
  }

  async refreshForVault(vaultId?: string): Promise<void> {
    console.log('🔄 refreshForVault: switching to vault', vaultId);
    // Set vault switching flag to prevent new tabs from being added
    this.isVaultSwitching = true;

    if (vaultId) {
      this.currentVaultId = vaultId;
    } else {
      try {
        const service = getChatService();
        const vault = await service.getCurrentVault();
        this.currentVaultId = vault?.id || 'default';
      } catch (error) {
        console.warn('Failed to get current vault:', error);
      }
    }

    console.log('🔑 refreshForVault: using storage key', this.getStorageKey());

    // Reset to completely new state object to force reactivity
    this.state = {
      tabs: [],
      activeTabId: null,
      maxTabs: 10,
      autoCleanupHours: 24
    };

    // Load from storage for the new vault
    this.loadFromStorage();
    console.log(
      '💾 refreshForVault: loaded',
      this.state.tabs.length,
      'tabs for vault',
      this.currentVaultId
    );
    this.cleanupOldTabs();

    // Clear vault switching flag
    this.isVaultSwitching = false;
  }
}

export const temporaryTabsStore = new TemporaryTabsStore();
