import { getChatService } from '../services/chatService';

interface NavigationEntry {
  noteId: string;
  title: string;
  source: 'search' | 'wikilink' | 'navigation' | 'history';
  timestamp: number;
  vaultId?: string;
  scrollPosition?: number;
}

interface NavigationHistoryState {
  currentVaultId: string | null;
  customHistory: NavigationEntry[];
  currentIndex: number;
  maxHistorySize: number;
}

const defaultState: NavigationHistoryState = {
  currentVaultId: null,
  customHistory: [],
  currentIndex: -1,
  maxHistorySize: 50
};

class NavigationHistoryStore {
  private state = $state<NavigationHistoryState>(defaultState);
  private useWebHistory = true;
  private isNavigating = false;
  private isVaultSwitching = false;

  constructor() {
    this.initializeVault();
  }

  get canGoBack(): boolean {
    // Always use custom history for state tracking, even when using web history for navigation
    return this.state.currentIndex > 0;
  }

  get canGoForward(): boolean {
    // Always use custom history for state tracking
    return this.state.currentIndex < this.state.customHistory.length - 1;
  }

  get currentEntry(): NavigationEntry | null {
    if (
      this.state.currentIndex >= 0 &&
      this.state.currentIndex < this.state.customHistory.length
    ) {
      return this.state.customHistory[this.state.currentIndex];
    }
    return null;
  }

  /**
   * Add a new navigation entry
   */
  addEntry(
    noteId: string,
    title: string,
    source: 'search' | 'wikilink' | 'navigation' | 'history'
  ): void {
    // Don't add entries while navigating or switching vaults
    if (this.isNavigating || this.isVaultSwitching) {
      return;
    }

    // Don't add duplicate consecutive entries
    const lastEntry = this.state.customHistory[this.state.customHistory.length - 1];
    if (lastEntry && lastEntry.noteId === noteId) {
      return;
    }

    const entry: NavigationEntry = {
      noteId,
      title,
      source,
      timestamp: Date.now(),
      vaultId: this.state.currentVaultId || undefined
    };

    // Add to custom history for vault isolation and metadata
    this.state.customHistory.push(entry);
    this.state.currentIndex = this.state.customHistory.length - 1;

    // Enforce max history size
    if (this.state.customHistory.length > this.state.maxHistorySize) {
      this.state.customHistory.shift();
      this.state.currentIndex = this.state.customHistory.length - 1;
    }

    // Use web history for browser integration
    if (this.useWebHistory && typeof window !== 'undefined') {
      try {
        const url = `#/note/${noteId}`;
        const state = { noteId, title, source, vaultId: this.state.currentVaultId };

        // Update browser history
        window.history.pushState(state, title, url);

        // Update document title
        document.title = `${title} - Flint`;
      } catch (error) {
        console.warn('Failed to update browser history:', error);
        this.useWebHistory = false;
      }
    }

    this.saveToStorage();
  }

  /**
   * Navigate backwards
   */
  goBack(): NavigationEntry | null {
    if (!this.canGoBack) {
      return null;
    }

    this.isNavigating = true;

    // Use custom history navigation for reliability
    if (this.state.currentIndex > 0) {
      this.state.currentIndex--;
      const entry = this.state.customHistory[this.state.currentIndex];

      // Update browser history if using web history
      if (this.useWebHistory && typeof window !== 'undefined') {
        try {
          const url = `#/note/${entry.noteId}`;
          const state = {
            noteId: entry.noteId,
            title: entry.title,
            source: 'history',
            vaultId: entry.vaultId
          };
          window.history.replaceState(state, entry.title, url);
          document.title = `${entry.title} - Flint`;
        } catch (error) {
          console.warn('Failed to update browser history on goBack:', error);
        }
      }

      this.isNavigating = false;
      return entry;
    }

    this.isNavigating = false;
    return null;
  }

  /**
   * Navigate forwards
   */
  goForward(): NavigationEntry | null {
    if (!this.canGoForward) {
      return null;
    }

    this.isNavigating = true;

    // Use custom history navigation for reliability
    if (this.state.currentIndex < this.state.customHistory.length - 1) {
      this.state.currentIndex++;
      const entry = this.state.customHistory[this.state.currentIndex];

      // Update browser history if using web history
      if (this.useWebHistory && typeof window !== 'undefined') {
        try {
          const url = `#/note/${entry.noteId}`;
          const state = {
            noteId: entry.noteId,
            title: entry.title,
            source: 'history',
            vaultId: entry.vaultId
          };
          window.history.replaceState(state, entry.title, url);
          document.title = `${entry.title} - Flint`;
        } catch (error) {
          console.warn('Failed to update browser history on goForward:', error);
        }
      }

      this.isNavigating = false;
      return entry;
    }

    this.isNavigating = false;
    return null;
  }

  /**
   * Handle popstate events from browser navigation
   */
  handlePopState(event: PopStateEvent): NavigationEntry | null {
    this.isNavigating = true;

    try {
      if (event.state?.noteId) {
        // Find the entry in our custom history
        const entry = this.state.customHistory.find(
          (e) =>
            e.noteId === event.state.noteId && e.vaultId === this.state.currentVaultId
        );

        if (entry) {
          // Update our current index to match
          const index = this.state.customHistory.indexOf(entry);
          if (index !== -1) {
            this.state.currentIndex = index;
            return entry;
          }
        }

        // If not found in custom history, create a temporary entry
        return {
          noteId: event.state.noteId,
          title: event.state.title || 'Unknown Note',
          source: 'history',
          timestamp: Date.now(),
          vaultId: event.state.vaultId
        };
      }
    } finally {
      this.isNavigating = false;
    }

    return null;
  }

  /**
   * Update scroll position for current entry
   */
  updateScrollPosition(scrollPosition: number): void {
    if (
      this.state.currentIndex >= 0 &&
      this.state.currentIndex < this.state.customHistory.length
    ) {
      this.state.customHistory[this.state.currentIndex].scrollPosition = scrollPosition;
      this.saveToStorage();
    }
  }

  /**
   * Clear navigation history
   */
  clearHistory(): void {
    this.state.customHistory = [];
    this.state.currentIndex = -1;
    this.saveToStorage();
  }

  /**
   * Start vault switch - prevent new entries
   */
  startVaultSwitch(): void {
    this.isVaultSwitching = true;
    this.saveToStorage();
  }

  /**
   * End vault switch and refresh for new vault
   */
  async endVaultSwitch(): Promise<void> {
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.state.currentVaultId = vault?.id || 'default';

      // Reset history state for new vault
      this.state.customHistory = [];
      this.state.currentIndex = -1;

      this.loadFromStorage();
    } catch (error) {
      console.warn('Failed to switch vault for navigation history:', error);
      this.state.currentVaultId = 'default';
    } finally {
      this.isVaultSwitching = false;
    }
  }

  private async initializeVault(): Promise<void> {
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.state.currentVaultId = vault?.id || 'default';
      this.loadFromStorage();
    } catch (error) {
      console.warn('Failed to initialize vault for navigation history:', error);
      this.state.currentVaultId = 'default';
      this.loadFromStorage();
    }
  }

  private getStorageKey(): string {
    const vaultId = this.state.currentVaultId || 'default';
    return `navigationHistory-${vaultId}`;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        const parsed = JSON.parse(stored);

        // Validate and restore state
        if (parsed.customHistory && Array.isArray(parsed.customHistory)) {
          this.state.customHistory = parsed.customHistory;
          this.state.currentIndex = parsed.currentIndex || -1;
          this.state.maxHistorySize = parsed.maxHistorySize || 50;
        }
      }
    } catch (error) {
      console.warn('Failed to load navigation history from storage:', error);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const dataToSave = {
        customHistory: this.state.customHistory,
        currentIndex: this.state.currentIndex,
        maxHistorySize: this.state.maxHistorySize
      };
      localStorage.setItem(this.getStorageKey(), JSON.stringify(dataToSave));
    } catch (error) {
      console.warn('Failed to save navigation history to storage:', error);
    }
  }
}

export const navigationHistoryStore = new NavigationHistoryStore();
