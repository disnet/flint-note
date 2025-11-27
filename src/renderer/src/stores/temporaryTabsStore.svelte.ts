import { getChatService } from '../services/chatService';
import { messageBus } from '../services/messageBus.svelte';
import { logger } from '../utils/logger';

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
  private isHydrated = $state(false); // NEW: Tracks if tabs are validated against notes
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initializeVault();

    // Subscribe to note events
    messageBus.subscribe('note.renamed', async (event) => {
      logger.debug('[temporaryTabsStore] note.renamed event:', {
        oldId: event.oldId,
        newId: event.newId
      });
      await this.updateNoteId(event.oldId, event.newId);
    });

    messageBus.subscribe('note.deleted', async (event) => {
      logger.debug('[temporaryTabsStore] note.deleted event:', {
        noteId: event.noteId
      });
      await this.removeTabsByNoteIds([event.noteId]);
    });

    // NOTE: vault.switched listener removed to prevent duplicate refresh
    // VaultSwitcher now explicitly calls refreshForVault() in the correct sequence
    // This prevents race conditions between event-driven and explicit refresh paths

    messageBus.subscribe('notes.bulkRefresh', async () => {
      logger.debug('[temporaryTabsStore] notes.bulkRefresh event: Validating tabs');
      await this.validateTabs();
    });
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

  /**
   * Check if tabs are ready to display (hydrated and validated)
   * Note: We don't check isVaultSwitching here because refreshForVault sets isHydrated=true
   * before endVaultSwitch() is called. The hydration status is the source of truth.
   */
  get isReady(): boolean {
    return this.isHydrated && !this.isLoading;
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
      logger.debug(
        '[temporaryTabsStore] addTab: Blocked by isVaultSwitching flag for noteId:',
        noteId
      );
      return;
    }
    logger.debug(
      '[temporaryTabsStore] addTab: Adding tab for noteId:',
      noteId,
      'source:',
      source
    );

    const existingIndex = this.state.tabs.findIndex((tab) => tab.noteId === noteId);

    if (existingIndex !== -1) {
      logger.debug(
        '[temporaryTabsStore] addTab: Tab already exists, updating lastAccessed'
      );
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

      logger.debug('[temporaryTabsStore] addTab: Creating new tab:', {
        tabId: newTab.id,
        noteId: newTab.noteId,
        source: newTab.source,
        order: newTab.order,
        totalTabsAfter: this.state.tabs.length + 1
      });

      // Add to bottom instead of top
      this.state.tabs.push(newTab);
      this.state.activeTabId = newTab.id;

      // Enforce max tabs limit by removing from the beginning (oldest tabs)
      if (this.state.tabs.length > this.state.maxTabs) {
        const removedTabs = this.state.tabs.slice(
          0,
          this.state.tabs.length - this.state.maxTabs
        );
        logger.debug('[temporaryTabsStore] addTab: Removing old tabs due to max limit:', {
          maxTabs: this.state.maxTabs,
          removedCount: removedTabs.length,
          removedTabIds: removedTabs.map((t) => ({ tabId: t.id, noteId: t.noteId }))
        });
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
    logger.debug(
      '🔒 startVaultSwitch: current vault',
      this.currentVaultId,
      'tabs:',
      this.state.tabs.length
    );
    this.isVaultSwitching = true;
    // Save current tabs to storage before clearing
    await this.saveToStorage();
    logger.debug(
      '💾 startVaultSwitch: saved tabs to storage for vault',
      this.currentVaultId
    );
    // Clear the UI but keep vault-specific storage intact
    this.state.tabs = [];
    this.state.activeTabId = null;
    logger.debug('🧹 startVaultSwitch: cleared UI tabs');
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
    const removedTabs = this.state.tabs.filter((tab) => noteIds.includes(tab.noteId));

    if (removedTabs.length > 0) {
      logger.debug('[temporaryTabsStore] removeTabsByNoteIds: Removing tabs:', {
        noteIds,
        removedTabs: removedTabs.map((t) => ({
          tabId: t.id,
          noteId: t.noteId,
          source: t.source
        }))
      });
    }

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
    const updatedTabs: string[] = [];

    this.state.tabs.forEach((tab) => {
      if (tab.noteId === oldId) {
        logger.debug('[temporaryTabsStore] updateNoteId: Updating tab:', {
          tabId: tab.id,
          oldNoteId: oldId,
          newNoteId: newId
        });
        tab.noteId = newId;
        updated = true;
        updatedTabs.push(tab.id);
      }
    });

    if (updated) {
      logger.debug('[temporaryTabsStore] updateNoteId: Updated tabs:', {
        count: updatedTabs.length,
        tabIds: updatedTabs
      });
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

  /**
   * Validate tabs against the notes cache and log warnings for orphaned tabs
   * This should be called after the notes cache is populated to detect underlying issues
   */
  async validateTabs(): Promise<void> {
    await this.ensureInitialized();

    // Import notesStore to check if notes exist
    const { notesStore } = await import('../services/noteStore.svelte');

    const orphanedTabs = this.state.tabs.filter((tab) => {
      const noteExists = notesStore.notes.some((note) => note.id === tab.noteId);
      return !noteExists;
    });

    if (orphanedTabs.length > 0) {
      console.warn(
        '[temporaryTabsStore] ⚠️ ORPHANED TABS DETECTED - Tabs reference notes that do not exist in database:',
        {
          message:
            'This indicates an underlying issue with note deletion events or database consistency',
          orphanedCount: orphanedTabs.length,
          totalTabs: this.state.tabs.length,
          orphanedTabs: orphanedTabs.map((t) => ({
            tabId: t.id,
            noteId: t.noteId,
            source: t.source,
            openedAt: t.openedAt.toISOString(),
            lastAccessed: t.lastAccessed.toISOString(),
            ageHours: Math.floor(
              (Date.now() - t.lastAccessed.getTime()) / (60 * 60 * 1000)
            )
          }))
        }
      );
    } else {
      logger.debug(
        '[temporaryTabsStore] ✓ Tab validation passed - all tabs reference valid notes'
      );
    }
  }

  private async cleanupOldTabs(): Promise<void> {
    const cutoffTime = new Date(
      Date.now() - this.state.autoCleanupHours * 60 * 60 * 1000
    );

    const originalLength = this.state.tabs.length;
    const removedTabs = this.state.tabs.filter((tab) => {
      return tab.lastAccessed <= cutoffTime;
    });

    if (removedTabs.length > 0) {
      logger.debug('[temporaryTabsStore] cleanupOldTabs: Removing old tabs:', {
        cutoffTime: cutoffTime.toISOString(),
        autoCleanupHours: this.state.autoCleanupHours,
        removedCount: removedTabs.length,
        removedTabs: removedTabs.map((t) => ({
          tabId: t.id,
          noteId: t.noteId,
          lastAccessed: t.lastAccessed.toISOString(),
          ageHours: Math.floor((Date.now() - t.lastAccessed.getTime()) / (60 * 60 * 1000))
        }))
      });
    }

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
    this.isHydrated = false;
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

      // Validate tabs on initial load
      await this.ensureNotesAvailable();
      this.isHydrated = true;
    } catch (error) {
      console.warn('Failed to initialize temporary tabs store:', error);
      // Use default state on error
      this.isHydrated = true; // Mark as ready even on error to unblock UI
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
      logger.debug(
        '[temporaryTabsStore] loadFromStorage: Loading for vault:',
        this.currentVaultId
      );
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
        logger.debug('[temporaryTabsStore] loadFromStorage: Found stored tabs:', {
          count: stored.tabs.length,
          noteIds: stored.tabs.map((t: TemporaryTab) => t.noteId)
        });

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

        logger.debug('[temporaryTabsStore] loadFromStorage: Loaded tabs:', {
          count: this.state.tabs.length,
          tabs: this.state.tabs.map((t) => ({
            tabId: t.id,
            noteId: t.noteId,
            source: t.source,
            order: t.order
          }))
        });
      } else {
        logger.debug(
          '[temporaryTabsStore] loadFromStorage: No stored tabs found or invalid format'
        );
      }
    } catch (error) {
      console.warn(
        '[temporaryTabsStore] Failed to load temporary tabs from storage:',
        error
      );
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
    logger.debug('🔄 refreshForVault: switching to vault', vaultId);
    // Note: isVaultSwitching flag is set by startVaultSwitch() and cleared by endVaultSwitch()

    // Mark as not hydrated during refresh
    this.isHydrated = false;

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

    logger.debug('🔑 refreshForVault: using vault', this.currentVaultId);

    // Reset to completely new state object to force reactivity
    this.state = {
      tabs: [],
      activeTabId: null,
      maxTabs: 10,
      autoCleanupHours: 24
    };

    // Load from storage for the new vault
    await this.loadFromStorage();
    logger.debug(
      '💾 refreshForVault: loaded',
      this.state.tabs.length,
      'tabs for vault',
      this.currentVaultId
    );
    await this.cleanupOldTabs();

    // Wait for notes to be available and validate tabs
    await this.ensureNotesAvailable();

    // Mark as hydrated and ready
    this.isHydrated = true;
    logger.debug('✅ refreshForVault: tabs validated and hydrated');

    // Note: Don't clear vault switching flag here - let VaultSwitcher control the full sequence
  }

  /**
   * Wait for notes to be available and validate all tabs against notes
   * Remove any tabs that don't have corresponding notes
   */
  private async ensureNotesAvailable(): Promise<void> {
    // If there are no tabs to validate, skip the check
    if (this.state.tabs.length === 0) {
      logger.debug('[temporaryTabsStore] No tabs to validate, skipping');
      return;
    }

    const { notesStore } = await import('../services/noteStore.svelte');

    // Wait for notes to be loaded (with timeout)
    let attempts = 0;
    const maxAttempts = 100; // 1 second max wait

    // Wait until either notes are loaded OR we've waited long enough
    while (
      (notesStore.loading || notesStore.notes.length === 0) &&
      attempts < maxAttempts
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.warn(
        '[temporaryTabsStore] Timeout waiting for notes, proceeding with validation anyway'
      );
    }

    // Wait one more tick to ensure derived values have propagated
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Validate all tabs have corresponding notes
    const availableNoteIds = new Set(notesStore.notes.map((n) => n.id));
    const invalidTabs = this.state.tabs.filter(
      (tab) => !availableNoteIds.has(tab.noteId)
    );

    if (invalidTabs.length > 0) {
      console.warn('[temporaryTabsStore] Removing tabs with missing notes:', {
        count: invalidTabs.length,
        tabs: invalidTabs.map((t) => ({
          tabId: t.id,
          noteId: t.noteId,
          source: t.source
        }))
      });

      // Remove invalid tabs
      this.state.tabs = this.state.tabs.filter((tab) => availableNoteIds.has(tab.noteId));

      // Clear active tab if it was invalid
      if (
        this.state.activeTabId &&
        !this.state.tabs.find((t) => t.id === this.state.activeTabId)
      ) {
        this.state.activeTabId = null;
      }

      // Save the cleaned state
      await this.saveToStorage();
    } else {
      logger.debug('[temporaryTabsStore] ✓ All tabs validated successfully');
    }
  }

  /**
   * Add tutorial notes to temporary tabs for new vaults
   * Called after vault creation to provide immediate guidance
   */
  async addTutorialNoteTabs(tutorialNoteIds?: string[]): Promise<void> {
    await this.ensureInitialized();

    logger.debug('addTutorialNoteTabs: tutorialNoteIds =', tutorialNoteIds);
    logger.debug('addTutorialNoteTabs: isVaultSwitching =', this.isVaultSwitching);
    logger.debug('addTutorialNoteTabs: currentVaultId =', this.currentVaultId);

    if (tutorialNoteIds && tutorialNoteIds.length > 0) {
      // Use provided tutorial note IDs
      // Temporarily clear vault switching flag to allow adding tutorial tabs
      const wasVaultSwitching = this.isVaultSwitching;
      logger.debug('addTutorialNoteTabs: Temporarily clearing vault switching flag');
      this.isVaultSwitching = false;

      for (const noteId of tutorialNoteIds) {
        logger.debug('addTutorialNoteTabs: Adding tab for noteId:', noteId);
        await this.addTab(noteId, 'navigation');
      }

      // Restore vault switching flag
      logger.debug(
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

      // Note: The note cache should already be populated via message bus events
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
