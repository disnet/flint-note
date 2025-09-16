import type { NoteMetadata } from '../services/noteStore.svelte';
import {
  type WeekRange,
  getCurrentWeek,
  getPreviousWeek,
  getNextWeek,
  getWeekDays,
  formatISODate
} from '../utils/dateUtils.svelte';

// Types for daily view data structures
export interface DailyNote extends NoteMetadata {
  type: 'daily';
  date: string; // ISO date string
  autoCreated: boolean; // Track if auto-generated
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
   * Currently uses mock data for Phase 0
   */
  async loadWeek(startDate: string, vaultId?: string): Promise<void> {
    this.state.isLoading = true;

    try {
      // For Phase 0, generate mock week data
      const weekData = this.generateMockWeekData(startDate);
      this.state.currentWeek = weekData;
      this.state.currentVaultId = vaultId || null;

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
   * Phase 0: Returns mock data
   */
  async getOrCreateDailyNote(date: string): Promise<DailyNote | null> {
    try {
      // Phase 0: Return mock daily note
      const mockDailyNote: DailyNote = {
        id: `daily-${date}`,
        title: date,
        filename: `${date}.md`,
        path: `/daily/${date}.md`,
        type: 'daily',
        created: new Date(date).toISOString(),
        modified: new Date().toISOString(),
        size: 0,
        tags: [],
        date,
        autoCreated: true
      };

      return mockDailyNote;
    } catch (error) {
      console.error('Failed to get/create daily note:', error);
      return null;
    }
  }

  /**
   * Update daily note content
   * Phase 0: Mock implementation
   */
  async updateDailyNote(date: string, content: string): Promise<void> {
    try {
      console.log(`Mock: Updating daily note for ${date} with content:`, content);

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
   * Generate mock week data for Phase 0 development
   */
  private generateMockWeekData(startDate: string): WeekData {
    const weekRange: WeekRange = {
      startDate,
      endDate: '', // Will be calculated
      year: new Date(startDate).getFullYear(),
      weekNumber: 1
    };

    // Calculate end date (6 days later)
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    weekRange.endDate = formatISODate(end);

    const weekDays = getWeekDays(weekRange);

    const days: DayData[] = weekDays.map((dateString, index) => {
      // Generate mock data for each day
      const mockCreatedNotes: NoteMetadata[] = [];
      const mockModifiedNotes: NoteMetadata[] = [];

      // Add some mock notes for demonstration
      if (index % 2 === 0) {
        // Every other day has activity
        mockCreatedNotes.push({
          id: `note-created-${dateString}-1`,
          title: 'Project Planning',
          filename: 'project-planning.md',
          path: '/notes/project-planning.md',
          type: 'note',
          created: new Date(dateString).toISOString(),
          modified: new Date(dateString).toISOString(),
          size: 1500,
          tags: ['planning', 'project']
        });

        if (index < 4) {
          // First few days have more activity
          mockModifiedNotes.push({
            id: `note-modified-${dateString}-1`,
            title: 'Research Notes',
            filename: 'research-notes.md',
            path: '/notes/research-notes.md',
            type: 'note',
            created: new Date(Date.now() - 86400000 * 3).toISOString(), // 3 days ago
            modified: new Date(dateString).toISOString(),
            size: 2300,
            tags: ['research']
          });
        }
      }

      const mockDailyNote: DailyNote = {
        id: `daily-${dateString}`,
        title: dateString,
        filename: `${dateString}.md`,
        path: `/daily/${dateString}.md`,
        type: 'daily',
        created: new Date(dateString).toISOString(),
        modified: new Date(dateString).toISOString(),
        size: 0,
        tags: [],
        date: dateString,
        autoCreated: true
      };

      return {
        date: dateString,
        dailyNote: mockDailyNote,
        createdNotes: mockCreatedNotes,
        modifiedNotes: mockModifiedNotes,
        totalActivity: mockCreatedNotes.length + mockModifiedNotes.length
      };
    });

    return {
      startDate: weekRange.startDate,
      endDate: weekRange.endDate,
      days
    };
  }
}

export const dailyViewStore = new DailyViewStore();
