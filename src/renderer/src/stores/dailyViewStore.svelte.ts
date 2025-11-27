import type { NoteMetadata } from '../services/noteStore.svelte';
import { getCurrentWeek, getPreviousWeek, getNextWeek } from '../utils/dateUtils';
import { messageBus } from '../services/messageBus.svelte';
import { logger } from '../utils/logger';

// Types for daily view data structures
export interface DailyNote extends NoteMetadata {
  type: 'daily';
  date: string; // ISO date string
  autoCreated: boolean; // Track if auto-generated
  content?: string; // Note content
}

// Interface for API note type
interface ApiNote {
  id: string;
  title: string;
  filename: string;
  path: string;
  content: string;
  created: string;
  updated: string;
  size?: number;
  content_hash: string;
  metadata?: Record<string, unknown>;
}

// Interface for the daily view specific API methods
interface DailyViewApi {
  getCurrentVault: () => Promise<{ id: string; name: string; path: string } | null>;
  getWeekData: (params: { startDate: string; vaultId: string }) => Promise<{
    startDate: string;
    endDate: string;
    days: Array<{
      date: string;
      dailyNote: ApiNote | null;
      createdNotes: Array<{ id: string; title: string; type: string }>;
      modifiedNotes: Array<{ id: string; title: string; type: string }>;
      totalActivity: number;
    }>;
  }>;
  getOrCreateDailyNote: (params: {
    date: string;
    vaultId: string;
    createIfMissing?: boolean;
  }) => Promise<ApiNote | null>;
  updateDailyNote: (params: {
    date: string;
    content: string;
    vaultId: string;
  }) => Promise<{ success: boolean }>;
}

export interface DayData {
  date: string; // ISO date string
  dailyNote: DailyNote | null;
  createdNotes: NoteMetadata[];
  modifiedNotes: NoteMetadata[];
  totalActivity: number;
}

export interface WeekData {
  startDate: string;
  endDate: string;
  days: DayData[];
}

interface DailyViewState {
  currentWeek: WeekData | null;
  selectedDate: string | null;
  isLoading: boolean;
  navigationHistory: string[];
  currentVaultId: string | null;
}

const defaultState: DailyViewState = {
  currentWeek: null,
  selectedDate: null,
  isLoading: false,
  navigationHistory: [],
  currentVaultId: null
};

class DailyViewStore {
  private state = $state<DailyViewState>(defaultState);
  private updateDebounceTimeout: number | null = null;

  constructor() {
    // Don't load data in constructor to avoid errors during first-time setup
    // Data will be loaded when DailyView component mounts via $effect

    // Subscribe to note events to keep daily notes in sync
    messageBus.subscribe('note.created', (event) => {
      if (event.note.type === 'daily') {
        this.handleNoteCreated(event.note as DailyNote);
      }
    });

    messageBus.subscribe('note.updated', (event) => {
      this.handleNoteUpdated(event.noteId, event.updates);
    });

    messageBus.subscribe('note.deleted', (event) => {
      this.handleNoteDeleted(event.noteId);
    });

    messageBus.subscribe('vault.switched', () => {
      this.reinitialize();
    });
  }

  get loading(): boolean {
    return this.state.isLoading;
  }

  get weekData(): WeekData | null {
    return this.state.currentWeek;
  }

  /**
   * Reinitialize the store after vault setup
   */
  async reinitialize(): Promise<void> {
    this.state = { ...defaultState };
    await this.loadCurrentWeek();
  }

  get selectedDate(): string | null {
    return this.state.selectedDate;
  }

  get navigationHistory(): string[] {
    return this.state.navigationHistory;
  }

  /**
   * Load the current week's data
   */
  async loadCurrentWeek(): Promise<void> {
    const currentWeek = getCurrentWeek();
    await this.loadWeek(currentWeek.startDate);
  }

  /**
   * Load week data for a specific start date
   * Phase 1: Uses real IPC APIs
   */
  async loadWeek(startDate: string, vaultId?: string): Promise<void> {
    this.state.isLoading = true;

    try {
      // Get current vault if vaultId not provided
      const currentVaultId = vaultId || (await this.getCurrentVaultId());
      if (!currentVaultId) {
        // During first-time setup, no vault may be available yet
        logger.debug('No vault available for daily view, waiting for vault setup');
        this.state.currentWeek = null;
        return;
      }

      // Load real week data via IPC
      const apiWeekData = await (
        window as unknown as { api?: DailyViewApi }
      ).api?.getWeekData({
        startDate,
        vaultId: currentVaultId
      });

      if (!apiWeekData) {
        throw new Error('Failed to load week data');
      }

      // Convert API response to our format
      const weekData: WeekData = {
        startDate: apiWeekData.startDate,
        endDate: apiWeekData.endDate,
        days: apiWeekData.days.map((day) => ({
          date: day.date,
          dailyNote: day.dailyNote ? this.convertApiNoteToDailyNote(day.dailyNote) : null,
          createdNotes: day.createdNotes.map(this.convertApiNoteToMetadata),
          modifiedNotes: day.modifiedNotes.map(this.convertApiNoteToMetadata),
          totalActivity: day.totalActivity
        }))
      };

      this.state.currentWeek = weekData;
      this.state.currentVaultId = currentVaultId;

      // Add to navigation history
      if (!this.state.navigationHistory.includes(startDate)) {
        this.state.navigationHistory = [...this.state.navigationHistory, startDate].slice(
          -10
        ); // Keep last 10
      }
    } catch (error) {
      console.error('Failed to load week data:', error);
      this.state.currentWeek = null;
    } finally {
      this.state.isLoading = false;
    }
  }

  /**
   * Navigate to previous week
   */
  async navigateToPreviousWeek(): Promise<void> {
    if (!this.state.currentWeek) return;

    const currentWeekRange = {
      startDate: this.state.currentWeek.startDate,
      endDate: this.state.currentWeek.endDate,
      year: new Date(this.state.currentWeek.startDate).getFullYear(),
      weekNumber: 1 // Mock value
    };

    const previousWeek = getPreviousWeek(currentWeekRange);
    await this.loadWeek(previousWeek.startDate, this.state.currentVaultId || undefined);
  }

  /**
   * Navigate to next week
   */
  async navigateToNextWeek(): Promise<void> {
    if (!this.state.currentWeek) return;

    const currentWeekRange = {
      startDate: this.state.currentWeek.startDate,
      endDate: this.state.currentWeek.endDate,
      year: new Date(this.state.currentWeek.startDate).getFullYear(),
      weekNumber: 1 // Mock value
    };

    const nextWeek = getNextWeek(currentWeekRange);
    await this.loadWeek(nextWeek.startDate, this.state.currentVaultId || undefined);
  }

  /**
   * Set selected date for editing
   */
  setSelectedDate(date: string | null): void {
    this.state.selectedDate = date;
  }

  /**
   * Get or create daily note for a specific date
   * Phase 1: Uses real IPC APIs
   */
  async getOrCreateDailyNote(
    date: string,
    createIfMissing: boolean = true
  ): Promise<DailyNote | null> {
    try {
      // Get current vault
      const currentVaultId = await this.getCurrentVaultId();
      if (!currentVaultId) {
        throw new Error('No vault available');
      }

      // Get or create daily note via IPC
      const apiNote = await (
        window as unknown as { api?: DailyViewApi }
      ).api?.getOrCreateDailyNote({
        date,
        vaultId: currentVaultId,
        createIfMissing
      });

      if (!apiNote) {
        return null;
      }

      return this.convertApiNoteToDailyNote(apiNote);
    } catch (error) {
      console.error('Failed to get/create daily note:', error);
      return null;
    }
  }

  /**
   * Open a daily note, creating it if necessary
   * Returns the full note metadata for navigation
   */
  async openDailyNote(date: string): Promise<DailyNote | null> {
    try {
      // Get or create the note
      const dailyNote = await this.getOrCreateDailyNote(date, true);

      if (dailyNote) {
        // Update local state to ensure the note is reflected
        this.updateLocalDailyNoteMetadata(date, dailyNote);

        // Optimistically add the note to the cache immediately
        // This ensures it's available for temporary tabs before the IPC event is processed
        const { noteCache } = await import('../services/noteCache.svelte');
        noteCache.addNote({
          id: dailyNote.id,
          title: dailyNote.title,
          filename: dailyNote.filename,
          path: dailyNote.path,
          type: dailyNote.type,
          created: dailyNote.created,
          modified: dailyNote.modified,
          size: dailyNote.size
        });
      }

      return dailyNote;
    } catch (error) {
      console.error('Failed to open daily note:', error);
      return null;
    }
  }

  /**
   * Update daily note content with debouncing to prevent database busy errors
   */
  async updateDailyNote(date: string, content: string): Promise<void> {
    // Clear existing timeout
    if (this.updateDebounceTimeout) {
      clearTimeout(this.updateDebounceTimeout);
    }

    // Update local state immediately for UI responsiveness
    this.updateLocalDailyNote(date, content);

    // Debounce the actual API call
    this.updateDebounceTimeout = setTimeout(async () => {
      await this.performDailyNoteUpdate(date, content);
    }, 300) as unknown as number;
  }

  /**
   * Update the local state with a fully loaded daily note
   */
  private updateLocalDailyNoteMetadata(date: string, dailyNote: DailyNote): void {
    if (this.state.currentWeek) {
      const updatedWeek = { ...this.state.currentWeek };
      updatedWeek.days = updatedWeek.days.map((day) => {
        if (day.date === date) {
          return {
            ...day,
            dailyNote
          };
        }
        return day;
      });
      this.state.currentWeek = updatedWeek;
    }
  }

  /**
   * Update the local state optimistically
   */
  private updateLocalDailyNote(date: string, content: string): void {
    if (this.state.currentWeek) {
      const updatedWeek = { ...this.state.currentWeek };
      updatedWeek.days = updatedWeek.days.map((day) => {
        if (day.date === date) {
          // If no daily note exists and we have content, create it locally
          if (!day.dailyNote && content.trim()) {
            return {
              ...day,
              dailyNote: {
                id: `daily/${date}`,
                title: date,
                filename: `${date}.md`,
                path: `/daily/${date}.md`,
                type: 'daily',
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
                size: content.length,
                date: date,
                autoCreated: true,
                content
              }
            };
          } else if (day.dailyNote) {
            return {
              ...day,
              dailyNote: {
                ...day.dailyNote,
                content,
                modified: new Date().toISOString()
              }
            };
          }
        }
        return day;
      });
      this.state.currentWeek = updatedWeek;
    }
  }

  /**
   * Perform the actual API update
   */
  private async performDailyNoteUpdate(date: string, content: string): Promise<void> {
    try {
      // Get current vault
      const currentVaultId = await this.getCurrentVaultId();
      if (!currentVaultId) {
        throw new Error('No vault available');
      }

      // If content is empty and no note exists, don't create one
      if (!content.trim()) {
        const existingNote = await this.getOrCreateDailyNote(date, false);
        if (!existingNote) {
          return;
        }
      }

      await (window as unknown as { api?: DailyViewApi }).api?.updateDailyNote({
        date,
        content,
        vaultId: currentVaultId
      });
    } catch (error) {
      console.error('Failed to update daily note:', error);
      // If the API call failed, refresh to ensure consistency
      if (this.state.currentWeek) {
        await this.loadWeek(
          this.state.currentWeek.startDate,
          this.state.currentVaultId || undefined
        );
      }
    }
  }

  /**
   * Handle note created event from message bus
   */
  private handleNoteCreated(note: DailyNote): void {
    if (this.state.currentWeek && note.type === 'daily') {
      const date = note.date;
      this.updateLocalDailyNoteMetadata(date, note);
    }
  }

  /**
   * Handle note updated event from message bus
   */
  private handleNoteUpdated(noteId: string, updates: Partial<NoteMetadata>): void {
    if (this.state.currentWeek) {
      // Find the day containing this note
      for (const day of this.state.currentWeek.days) {
        if (day.dailyNote && day.dailyNote.id === noteId) {
          // Ensure we maintain the DailyNote type by casting after merge
          day.dailyNote = { ...day.dailyNote, ...updates } as DailyNote;
          break;
        }
      }
    }
  }

  /**
   * Handle note deleted event from message bus
   */
  private handleNoteDeleted(noteId: string): void {
    if (this.state.currentWeek) {
      // Find and remove the daily note
      for (const day of this.state.currentWeek.days) {
        if (day.dailyNote && day.dailyNote.id === noteId) {
          day.dailyNote = null;
          break;
        }
      }
    }
  }

  /**
   * Get current vault ID
   */
  private async getCurrentVaultId(): Promise<string | null> {
    try {
      const currentVault = await (
        window as unknown as { api?: DailyViewApi }
      ).api?.getCurrentVault();
      return currentVault?.id || null;
    } catch (error) {
      console.error('Failed to get current vault:', error);
      return null;
    }
  }

  /**
   * Convert API note to DailyNote
   */
  private convertApiNoteToDailyNote(apiNote: ApiNote): DailyNote {
    return {
      id: apiNote.id,
      title: apiNote.title,
      filename: apiNote.filename,
      path: apiNote.path,
      type: 'daily',
      created: apiNote.created,
      modified: apiNote.updated,
      size: apiNote.size || 0,
      date: (apiNote.metadata?.date as string) || apiNote.title,
      autoCreated: (apiNote.metadata?.autoCreated as boolean) || false,
      content: apiNote.content
    };
  }

  /**
   * Convert API note to NoteMetadata
   */
  private convertApiNoteToMetadata(apiNote: {
    id: string;
    title: string;
    type: string;
  }): NoteMetadata {
    return {
      id: apiNote.id,
      title: apiNote.title,
      filename: `${apiNote.title}.md`,
      path: `/${apiNote.type}/${apiNote.title}.md`,
      type: apiNote.type,
      created: new Date().toISOString(), // API doesn't provide these in the simple format
      modified: new Date().toISOString(),
      size: 0
    };
  }
}

export const dailyViewStore = new DailyViewStore();
