import { getChatService } from './chatService';

interface CursorPosition {
  noteId: string;
  position: number;
  selectionStart?: number;
  selectionEnd?: number;
  lastUpdated: string;
}

interface CursorPositionState {
  currentVaultId: string | null;
  positions: Record<string, CursorPosition>;
}

const defaultState: CursorPositionState = {
  currentVaultId: null,
  positions: {}
};

class CursorPositionStore {
  private state = $state<CursorPositionState>(defaultState);
  private isLoading = $state(false);
  private isInitialized = $state(false);
  private initializationPromise: Promise<void> | null = null;

  // Debounced save operations to prevent excessive IPC calls
  private saveTimeouts = new Map<string, NodeJS.Timeout>();
  private pendingPositions = new Map<string, CursorPosition>();

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

  /**
   * Get cursor position for a specific note
   */
  async getCursorPosition(noteId: string): Promise<CursorPosition | null> {
    await this.ensureInitialized();

    // Check pending positions first (most recent)
    if (this.pendingPositions.has(noteId)) {
      return this.pendingPositions.get(noteId) || null;
    }

    // Check in-memory cache
    return this.state.positions[noteId] || null;
  }

  /**
   * Set cursor position for a specific note with debounced persistence
   */
  async setCursorPosition(
    noteId: string,
    position: CursorPosition,
    immediate = false
  ): Promise<void> {
    await this.ensureInitialized();

    // Update in-memory state immediately
    this.state.positions[noteId] = position;
    this.pendingPositions.set(noteId, position);

    if (immediate) {
      // Save immediately and clear any pending debounced save
      this.clearSaveTimeout(noteId);
      await this.savePositionToStorage(noteId, position);
    } else {
      // Debounced save - 1000ms for cursor movement, 500ms for content changes
      this.debounceSavePosition(noteId, position, 1000);
    }
  }

  /**
   * Save cursor position immediately when content changes
   */
  async setCursorPositionOnContentChange(
    noteId: string,
    position: CursorPosition
  ): Promise<void> {
    await this.ensureInitialized();

    this.state.positions[noteId] = position;
    this.pendingPositions.set(noteId, position);

    // Clear any pending cursor-movement saves and save immediately with content change timing
    this.clearSaveTimeout(noteId);
    this.debounceSavePosition(noteId, position, 500);
  }

  /**
   * Save cursor position immediately before note switch
   */
  async saveCurrentCursorPosition(
    noteId: string,
    position: CursorPosition
  ): Promise<void> {
    await this.ensureInitialized();

    this.state.positions[noteId] = position;
    this.clearSaveTimeout(noteId);
    await this.savePositionToStorage(noteId, position);
  }

  /**
   * Start vault switch - clear positions for vault transition
   */
  async startVaultSwitch(): Promise<void> {
    await this.ensureInitialized();

    // Flush any pending saves before switching
    await this.flushPendingSaves();

    // Clear state for new vault
    this.state.positions = {};
    this.pendingPositions.clear();
    this.clearAllSaveTimeouts();
  }

  /**
   * End vault switch and load positions for new vault
   */
  async endVaultSwitch(): Promise<void> {
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.state.currentVaultId = vault?.id || 'default';

      // Clear state and load new vault's positions
      this.state.positions = {};
      this.pendingPositions.clear();
      this.clearAllSaveTimeouts();

      await this.loadFromStorage();
    } catch (error) {
      console.warn('Failed to switch vault for cursor positions:', error);
      this.state.currentVaultId = 'default';
    }
  }

  /**
   * Flush all pending saves - useful before app close
   */
  async flushPendingSaves(): Promise<void> {
    await this.ensureInitialized();

    const savePromises: Promise<void>[] = [];

    for (const [noteId, position] of this.pendingPositions) {
      this.clearSaveTimeout(noteId);
      savePromises.push(this.savePositionToStorage(noteId, position));
    }

    await Promise.all(savePromises);
  }

  private async initializeVault(): Promise<void> {
    this.isLoading = true;
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.state.currentVaultId = vault?.id || 'default';
      await this.loadFromStorage();
    } catch (error) {
      console.warn('Failed to initialize vault for cursor positions:', error);
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
        stateKey: 'cursor_positions'
      });

      if (stored && typeof stored === 'object' && 'positions' in stored) {
        this.state.positions = stored.positions as Record<string, CursorPosition>;
      } else {
        this.state.positions = {};
      }
    } catch (error) {
      console.warn('Failed to load cursor positions from storage:', error);
      this.state.positions = {};
    }
  }

  private async savePositionToStorage(
    noteId: string,
    position: CursorPosition
  ): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const vaultId = this.state.currentVaultId || 'default';

      // Update the local state
      this.state.positions[noteId] = position;

      // Save the entire positions object
      const snapshotPositions = $state.snapshot({ positions: this.state.positions });
      await window.api?.saveUIState({
        vaultId,
        stateKey: 'cursor_positions',
        stateValue: snapshotPositions
      });

      // Remove from pending after successful save
      this.pendingPositions.delete(noteId);
    } catch (error) {
      console.warn('Failed to save cursor position to storage:', error);
      throw error;
    }
  }

  private debounceSavePosition(
    noteId: string,
    position: CursorPosition,
    delay: number
  ): void {
    this.clearSaveTimeout(noteId);

    const timeout = setTimeout(async () => {
      try {
        await this.savePositionToStorage(noteId, position);
      } catch (error) {
        console.warn('Failed to save debounced cursor position:', error);
      }
    }, delay);

    this.saveTimeouts.set(noteId, timeout);
  }

  private clearSaveTimeout(noteId: string): void {
    const timeout = this.saveTimeouts.get(noteId);
    if (timeout) {
      clearTimeout(timeout);
      this.saveTimeouts.delete(noteId);
    }
  }

  private clearAllSaveTimeouts(): void {
    for (const timeout of this.saveTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.saveTimeouts.clear();
  }
}

export const cursorPositionStore = new CursorPositionStore();
