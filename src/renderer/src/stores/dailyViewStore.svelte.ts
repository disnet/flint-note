import type { NoteMetadata } from '../services/noteStore.svelte';
import { getCurrentWeek, getPreviousWeek, getNextWeek } from '../utils/dateUtils.svelte';

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
  getOrCreateDailyNote: (params: { date: string; vaultId: string }) => Promise<ApiNote>;
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

  constructor() {
    // Initialize with current week on creation
    this.loadCurrentWeek();
  }

  get loading(): boolean {
    return this.state.isLoading;
  }

  get weekData(): WeekData | null {
    return this.state.currentWeek;
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
        throw new Error('No vault available');
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
  async getOrCreateDailyNote(date: string): Promise<DailyNote | null> {
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
        vaultId: currentVaultId
      });

      if (!apiNote) {
        throw new Error('Failed to get/create daily note');
      }

      return this.convertApiNoteToDailyNote(apiNote);
    } catch (error) {
      console.error('Failed to get/create daily note:', error);
      return null;
    }
  }

  /**
   * Update daily note content
   * Phase 1: Uses real IPC APIs
   */
  async updateDailyNote(date: string, content: string): Promise<void> {
    try {
      // Get current vault
      const currentVaultId = await this.getCurrentVaultId();
      if (!currentVaultId) {
        throw new Error('No vault available');
      }

      // Update daily note via IPC
      await (window as unknown as { api?: DailyViewApi }).api?.updateDailyNote({
        date,
        content,
        vaultId: currentVaultId
      });

      // Refresh current week data to reflect changes
      if (this.state.currentWeek) {
        await this.loadWeek(
          this.state.currentWeek.startDate,
          this.state.currentVaultId || undefined
        );
      }
    } catch (error) {
      console.error('Failed to update daily note:', error);
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
      tags: [],
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
      size: 0,
      tags: []
    };
  }
}

export const dailyViewStore = new DailyViewStore();
