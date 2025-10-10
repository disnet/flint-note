import { getChatService } from '../services/chatService';

interface TemporaryTab {
  id: string;
  noteId: string;
  openedAt: Date;
  lastAccessed: Date;
  source: 'search' | 'wikilink' | 'navigation' | 'history';
  order: number;
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
  private isLoading = $state(true);
  private isInitialized = $state(false);
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initializeVault();
  }

  get tabs(): TemporaryTab[] {
    return [...this.state.tabs].sort((a, b) => a.order - b.order);
  }

  get activeTabId(): string | null {
    return this.state.activeTabId;
  }

  get maxTabs(): number {
    return this.state.maxTabs;
  }

  get loading(): boolean {
    return this.isLoading;
  }

  get initialized(): boolean {
    return this.isInitialized;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  async addTab(
    noteId: string,
    source: 'search' | 'wikilink' | 'navigation' | 'history'
  ): Promise<void> {
    await this.ensureInitialized();
    // Don't add tabs while we're switching vaults
    if (this.isVaultSwitching) {
      console.log('addTab: Blocked by isVaultSwitching flag for noteId:', noteId);
      return;
    }
    console.log('addTab: Adding tab for noteId:', noteId, 'source:', source);

    const existingIndex = this.state.tabs.findIndex((tab) => tab.noteId === noteId);

    if (existingIndex !== -1) {
      // Update existing tab without moving it
      this.state.tabs[existingIndex].lastAccessed = new Date();
      this.state.activeTabId = this.state.tabs[existingIndex].id;
      // Don't move to top - keep existing position
    } else {
      // Create new tab
      const newTab: TemporaryTab = {
        id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        noteId,
        openedAt: new Date(),
        lastAccessed: new Date(),
        source,
        order: this.state.tabs.length
      };

      // Add to bottom instead of top
      this.state.tabs.push(newTab);
      this.state.activeTabId = newTab.id;

      // Enforce max tabs limit by removing from the beginning (oldest tabs)
      if (this.state.tabs.length > this.state.maxTabs) {
        this.state.tabs = this.state.tabs.slice(-this.state.maxTabs);
      }
    }

    await this.saveToStorage();
  }

  async removeTab(tabId: string): Promise<void> {
    await this.ensureInitialized();
    const index = this.state.tabs.findIndex((tab) => tab.id === tabId);
    if (index !== -1) {
      this.state.tabs.splice(index, 1);

      // Reassign order values to maintain sequence
      this.state.tabs.forEach((tab, index) => {
        tab.order = index;
      });

      // Update active tab if the removed tab was active
      if (this.state.activeTabId === tabId) {
        this.state.activeTabId =
          this.state.tabs.length > 0 ? this.state.tabs[0].id : null;
      }
    }

    await this.saveToStorage();
  }

  async clearAllTabs(): Promise<void> {
    await this.ensureInitialized();
    this.state.tabs = [];
    this.state.activeTabId = null;
    await this.saveToStorage();
  }

  async startVaultSwitch(): Promise<void> {
    await this.ensureInitialized();
    console.log(
      '🔒 startVaultSwitch: current vault',
      this.currentVaultId,
      'tabs:',
      this.state.tabs.length
    );
    this.isVaultSwitching = true;
    // Save current tabs to storage before clearing
    await this.saveToStorage();
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
  async removeTabsByNoteIds(
    noteIds: string[],
    autoSelectNext: boolean = false
  ): Promise<void> {
    await this.ensureInitialized();
    const originalLength = this.state.tabs.length;
    this.state.tabs = this.state.tabs.filter((tab) => !noteIds.includes(tab.noteId));

    // Update active tab if the removed tab was active
    if (
      this.state.activeTabId &&
      !this.state.tabs.find((tab) => tab.id === this.state.activeTabId)
    ) {
      // Only auto-select the next tab if explicitly requested
      this.state.activeTabId =
        autoSelectNext && this.state.tabs.length > 0 ? this.state.tabs[0].id : null;
    }

    // Only save if something was actually removed
    if (this.state.tabs.length !== originalLength) {
      await this.saveToStorage();
    }
  }

  /**
   * Clear the active tab highlighting
   */
  async clearActiveTab(): Promise<void> {
    await this.ensureInitialized();
    this.state.activeTabId = null;
    await this.saveToStorage();
  }

  async setActiveTab(tabId: string): Promise<void> {
    await this.ensureInitialized();
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (tab) {
      this.state.activeTabId = tabId;
      tab.lastAccessed = new Date();
      // Don't move to top - keep existing position
    }

    await this.saveToStorage();
  }

  async reorderTabs(sourceIndex: number, targetIndex: number): Promise<void> {
    await this.ensureInitialized();
    const tabs = [...this.state.tabs].sort((a, b) => a.order - b.order);
    const movedTab = tabs[sourceIndex];
    const [removed] = tabs.splice(sourceIndex, 1);
    tabs.splice(targetIndex, 0, removed);

    // Reassign order values
    tabs.forEach((tab, index) => {
      tab.order = index;
    });

    this.state.tabs = tabs;
    await this.saveToStorage();

    // Trigger animation after DOM update
    if (movedTab && typeof window !== 'undefined') {
      import('../utils/dragDrop.svelte.js')
        .then(({ animateReorder }) => {
          setTimeout(() => {
            animateReorder('.tabs-list', sourceIndex, targetIndex, movedTab.id);
          }, 10);
        })
        .catch(() => {
          // Silently fail if animation utilities aren't available
        });
    }
  }

  async updateNoteId(oldId: string, newId: string): Promise<void> {
    await this.ensureInitialized();
    let updated = false;

    this.state.tabs.forEach((tab) => {
      if (tab.noteId === oldId) {
        tab.noteId = newId;
        updated = true;
      }
    });

    if (updated) {
      await this.saveToStorage();
    }
  }

  async addTabAtPosition(
    tab: {
      noteId: string;
      source: 'search' | 'wikilink' | 'navigation' | 'history';
      order?: number;
    },
    targetIndex?: number
  ): Promise<void> {
    await this.ensureInitialized();
    const tabs = [...this.state.tabs].sort((a, b) => a.order - b.order);
    const position = targetIndex ?? tabs.length;

    const newTab: TemporaryTab = {
      id: crypto.randomUUID(),
      noteId: tab.noteId,
      openedAt: new Date(),
      lastAccessed: new Date(),
      source: tab.source,
      order: position
    };

    tabs.splice(position, 0, newTab);

    // Reassign order values
    tabs.forEach((t, index) => {
      t.order = index;
    });

    this.state.tabs = tabs;
    this.state.activeTabId = newTab.id;
    await this.saveToStorage();

    // Trigger animation for newly added tab
    if (typeof window !== 'undefined') {
      import('../utils/dragDrop.svelte.js')
        .then(({ animateItemAdd }) => {
          animateItemAdd(newTab.id, '.tabs-list');
        })
        .catch(() => {
          // Silently fail if animation utilities aren't available
        });
    }
  }

  private migrateTabsWithoutOrder(tabs: TemporaryTab[]): TemporaryTab[] {
    return tabs.map((tab, index) => ({
      ...tab,
      order: tab.order ?? index
    }));
  }

  private async cleanupOldTabs(): Promise<void> {
    const cutoffTime = new Date(
      Date.now() - this.state.autoCleanupHours * 60 * 60 * 1000
    );

    const originalLength = this.state.tabs.length;
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

    // Only save if something was cleaned up
    if (this.state.tabs.length !== originalLength) {
      await this.saveToStorage();
    }
  }

  private async initializeVault(): Promise<void> {
    this.isLoading = true;
    try {
      // Clean up old non-vault-specific data
      this.migrateOldStorage();

      try {
        const service = getChatService();
        const vault = await service.getCurrentVault();
        this.currentVaultId = vault?.id || 'default';
      } catch (error) {
        console.warn('Failed to get current vault for temporary tabs:', error);
        this.currentVaultId = 'default';
      }

      await this.loadFromStorage();
      await this.cleanupOldTabs();
    } catch (error) {
      console.warn('Failed to initialize temporary tabs store:', error);
      // Use default state on error
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
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

  private async loadFromStorage(): Promise<void> {
    if (!this.currentVaultId) return;

    try {
      const stored = await window.api?.loadUIState({
        vaultId: this.currentVaultId,
        stateKey: 'temporary_tabs'
      });
      if (
        stored &&
        typeof stored === 'object' &&
        'tabs' in stored &&
        Array.isArray(stored.tabs)
      ) {
        // Convert date strings back to Date objects and migrate order field
        const parsedTabs = this.migrateTabsWithoutOrder(
          stored.tabs.map(
            (tab: TemporaryTab & { openedAt: string; lastAccessed: string }) => ({
              ...tab,
              openedAt: new Date(tab.openedAt),
              lastAccessed: new Date(tab.lastAccessed)
            })
          ) || []
        );

        this.state = {
          ...defaultState,
          ...stored,
          tabs: parsedTabs
        };
      }
    } catch (error) {
      console.warn('Failed to load temporary tabs from storage:', error);
      // Use default state on error
    }
  }

  private async saveToStorage(): Promise<void> {
    if (!this.currentVaultId) return;

    try {
      const serializable = $state.snapshot(this.state);
      await window.api?.saveUIState({
        vaultId: this.currentVaultId,
        stateKey: 'temporary_tabs',
        stateValue: serializable
      });
    } catch (error) {
      console.warn('Failed to save temporary tabs to storage:', error);
      throw error; // Let component handle user feedback
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

    console.log('🔑 refreshForVault: using vault', this.currentVaultId);

    // Reset to completely new state object to force reactivity
    this.state = {
      tabs: [],
      activeTabId: null,
      maxTabs: 10,
      autoCleanupHours: 24
    };

    // Load from storage for the new vault
    await this.loadFromStorage();
    console.log(
      '💾 refreshForVault: loaded',
      this.state.tabs.length,
      'tabs for vault',
      this.currentVaultId
    );
    await this.cleanupOldTabs();

    // Clear vault switching flag
    this.isVaultSwitching = false;
  }

  /**
   * Add tutorial notes to temporary tabs for new vaults
   * Called after vault creation to provide immediate guidance
   */
  async addTutorialNoteTabs(tutorialNoteIds?: string[]): Promise<void> {
    await this.ensureInitialized();

    console.log('addTutorialNoteTabs: tutorialNoteIds =', tutorialNoteIds);
    console.log('addTutorialNoteTabs: isVaultSwitching =', this.isVaultSwitching);
    console.log('addTutorialNoteTabs: currentVaultId =', this.currentVaultId);

    if (tutorialNoteIds && tutorialNoteIds.length > 0) {
      // Use provided tutorial note IDs
      // Temporarily clear vault switching flag to allow adding tutorial tabs
      const wasVaultSwitching = this.isVaultSwitching;
      console.log('addTutorialNoteTabs: Temporarily clearing vault switching flag');
      this.isVaultSwitching = false;

      for (const noteId of tutorialNoteIds) {
        console.log('addTutorialNoteTabs: Adding tab for noteId:', noteId);
        await this.addTab(noteId, 'navigation');
      }

      // Restore vault switching flag
      console.log(
        'addTutorialNoteTabs: Restoring vault switching flag to:',
        wasVaultSwitching
      );
      this.isVaultSwitching = wasVaultSwitching;
    } else {
      // Fallback: try to find tutorial notes by title
      const tutorialTitles = [
        'Tutorial 1: Your First Daily Note',
        'Tutorial 2: Connecting Ideas with Wikilinks',
        'Tutorial 3: Your AI Assistant in Action',
        'Tutorial 4: Understanding Note Types'
      ];

      // Import notesStore dynamically to avoid circular dependencies
      const { notesStore } = await import('../services/noteStore.svelte');

      // Refresh notes to ensure we have the latest list
      await notesStore.refresh();

      for (const title of tutorialTitles) {
        const tutorialNote = notesStore.notes.find((note) => note.title === title);
        if (tutorialNote) {
          await this.addTab(tutorialNote.id, 'navigation');
        }
      }
    }
  }
}

export const temporaryTabsStore = new TemporaryTabsStore();
