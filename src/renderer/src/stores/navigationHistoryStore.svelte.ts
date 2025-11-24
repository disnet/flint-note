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
  private isNavigating = false;
  private isVaultSwitching = false;
  private isLoading = $state(true);
  private isInitialized = $state(false);
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializationPromise = this.initializeVault();
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
  async addEntry(
    noteId: string,
    title: string,
    source: 'search' | 'wikilink' | 'navigation' | 'history'
  ): Promise<void> {
    await this.ensureInitialized();
    // Don't add entries while navigating or switching vaults
    if (this.isNavigating || this.isVaultSwitching) {
      return;
    }

    // Don't add duplicate consecutive entries - check CURRENT entry, not last
    const currentEntry = this.state.customHistory[this.state.currentIndex];
    if (currentEntry && currentEntry.noteId === noteId) {
      return;
    }

    const entry: NavigationEntry = {
      noteId,
      title,
      source,
      timestamp: Date.now(),
      vaultId: this.state.currentVaultId || undefined
    };

    // Truncate forward history when adding from middle position
    // This matches standard browser behavior: going back then navigating discards forward history
    if (this.state.currentIndex < this.state.customHistory.length - 1) {
      this.state.customHistory = this.state.customHistory.slice(
        0,
        this.state.currentIndex + 1
      );
    }

    // Add to custom history
    this.state.customHistory.push(entry);
    this.state.currentIndex = this.state.customHistory.length - 1;

    // Enforce max history size
    if (this.state.customHistory.length > this.state.maxHistorySize) {
      this.state.customHistory.shift();
      this.state.currentIndex = this.state.customHistory.length - 1;
    }

    await this.saveToStorage();
  }

  /**
   * Navigate backwards
   */
  goBack(): NavigationEntry | null {
    if (!this.canGoBack) {
      return null;
    }

    this.isNavigating = true;

    this.state.currentIndex--;
    const entry = this.state.customHistory[this.state.currentIndex];

    this.isNavigating = false;
    this.saveToStorage();
    return entry;
  }

  /**
   * Navigate forwards
   */
  goForward(): NavigationEntry | null {
    if (!this.canGoForward) {
      return null;
    }

    this.isNavigating = true;

    this.state.currentIndex++;
    const entry = this.state.customHistory[this.state.currentIndex];

    this.isNavigating = false;
    this.saveToStorage();
    return entry;
  }

  /**
   * Update scroll position for current entry
   */
  async updateScrollPosition(scrollPosition: number): Promise<void> {
    await this.ensureInitialized();
    if (
      this.state.currentIndex >= 0 &&
      this.state.currentIndex < this.state.customHistory.length
    ) {
      this.state.customHistory[this.state.currentIndex].scrollPosition = scrollPosition;
      await this.saveToStorage();
    }
  }

  /**
   * Clear navigation history
   */
  async clearHistory(): Promise<void> {
    await this.ensureInitialized();
    this.state.customHistory = [];
    this.state.currentIndex = -1;
    await this.saveToStorage();
  }

  /**
   * Start vault switch - prevent new entries
   */
  async startVaultSwitch(): Promise<void> {
    await this.ensureInitialized();
    this.isVaultSwitching = true;
    await this.saveToStorage();
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

      await this.loadFromStorage();
    } catch (error) {
      console.warn('Failed to switch vault for navigation history:', error);
      this.state.currentVaultId = 'default';
    } finally {
      this.isVaultSwitching = false;
    }
  }

  private async initializeVault(): Promise<void> {
    this.isLoading = true;
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.state.currentVaultId = vault?.id || 'default';
      await this.loadFromStorage();
    } catch (error) {
      console.warn('Failed to initialize vault for navigation history:', error);
      this.state.currentVaultId = 'default';
    } finally {
      this.isLoading = false;
      this.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  private async loadFromStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const vaultId = this.state.currentVaultId || 'default';
      const stored = await window.api?.loadUIState({
        vaultId,
        stateKey: 'navigation_history'
      });

      if (stored) {
        // Validate and restore state
        if (
          stored &&
          typeof stored === 'object' &&
          'customHistory' in stored &&
          Array.isArray(stored.customHistory)
        ) {
          this.state.customHistory = stored.customHistory;
          this.state.currentIndex =
            'currentIndex' in stored && typeof stored.currentIndex === 'number'
              ? stored.currentIndex
              : -1;
          this.state.maxHistorySize =
            'maxHistorySize' in stored && typeof stored.maxHistorySize === 'number'
              ? stored.maxHistorySize
              : 50;
        }
      }
    } catch (error) {
      console.warn('Failed to load navigation history from storage:', error);
      // Use default state on error
      this.state.customHistory = [];
      this.state.currentIndex = -1;
      this.state.maxHistorySize = 50;
    }
  }

  private async saveToStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const vaultId = this.state.currentVaultId || 'default';
      const dataToSave = {
        customHistory: $state.snapshot(this.state.customHistory),
        currentIndex: this.state.currentIndex,
        maxHistorySize: this.state.maxHistorySize
      };
      await window.api?.saveUIState({
        vaultId,
        stateKey: 'navigation_history',
        stateValue: dataToSave
      });
    } catch (error) {
      console.warn('Failed to save navigation history to storage:', error);
      throw error; // Re-throw to let calling code handle
    }
  }
}

export const navigationHistoryStore = new NavigationHistoryStore();
