/**
 * Routine Scheduler Service
 *
 * Browser-based timer service that periodically checks for due routines
 * and can trigger notifications or callbacks. Uses setInterval in the
 * renderer process - routines only run when the app is open.
 */

import { getRoutinesDueNow, getUpcomingRoutines } from './state.svelte';
import type { RoutineListItem } from './types';

/**
 * Scheduler configuration options
 */
export interface SchedulerConfig {
  /** Check interval in milliseconds (default: 60000 = 1 minute) */
  checkIntervalMs: number;
  /** Whether to show browser notifications for due routines */
  enableNotifications: boolean;
  /** Callback when a routine becomes due */
  onRoutineDue?: (routine: RoutineListItem) => void;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  checkIntervalMs: 60000,
  enableNotifications: true
};

/**
 * Routine Scheduler class with reactive state
 */
class RoutineScheduler {
  private intervalId: number | null = null;
  private config: SchedulerConfig = DEFAULT_CONFIG;
  private lastCheckedDue: Set<string> = new Set();

  // Reactive state using Svelte 5 runes
  private _dueRoutines = $state<RoutineListItem[]>([]);
  private _upcomingRoutines = $state<RoutineListItem[]>([]);
  private _isRunning = $state(false);

  /** Due routines (reactive) */
  get dueRoutines(): RoutineListItem[] {
    return this._dueRoutines;
  }

  /** Upcoming routines in next 7 days (reactive) */
  get upcomingRoutines(): RoutineListItem[] {
    return this._upcomingRoutines;
  }

  /** Whether scheduler is running (reactive) */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Start the scheduler
   */
  start(config?: Partial<SchedulerConfig>): void {
    if (this.intervalId !== null) {
      this.stop();
    }

    this.config = { ...DEFAULT_CONFIG, ...config };
    this._isRunning = true;

    // Initial check
    this.check();

    // Set up interval
    this.intervalId = window.setInterval(() => {
      this.check();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._isRunning = false;
  }

  /**
   * Check for due routines
   */
  check(): void {
    const dueNow = getRoutinesDueNow();
    const upcoming = getUpcomingRoutines(7);

    this._dueRoutines = dueNow;
    this._upcomingRoutines = upcoming;

    // Notify about newly due routines
    for (const routine of dueNow) {
      if (!this.lastCheckedDue.has(routine.id)) {
        this.lastCheckedDue.add(routine.id);

        if (this.config.enableNotifications) {
          this.showNotification(routine);
        }

        if (this.config.onRoutineDue) {
          this.config.onRoutineDue(routine);
        }
      }
    }

    // Clean up completed routines from tracking
    const dueIds = new Set(dueNow.map((r) => r.id));
    for (const id of this.lastCheckedDue) {
      if (!dueIds.has(id)) {
        this.lastCheckedDue.delete(id);
      }
    }
  }

  /**
   * Show browser notification for a due routine
   */
  private showNotification(routine: RoutineListItem): void {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      new Notification('Routine Due', {
        body: `${routine.name}: ${routine.purpose}`,
        tag: `routine-${routine.id}`,
        icon: '/icon.png'
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  /**
   * Manually trigger a routine check
   */
  forceCheck(): void {
    this.check();
  }

  /**
   * Get count of due routines
   */
  getDueCount(): number {
    return this._dueRoutines.length;
  }

  /**
   * Request notification permission
   */
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }
    return Notification.requestPermission();
  }

  /**
   * Check if notifications are enabled and permitted
   */
  canShowNotifications(): boolean {
    if (!('Notification' in window)) return false;
    return Notification.permission === 'granted' && this.config.enableNotifications;
  }
}

// Singleton instance
let schedulerInstance: RoutineScheduler | null = null;

/**
 * Get the singleton routine scheduler instance
 */
export function getRoutineScheduler(): RoutineScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new RoutineScheduler();
  }
  return schedulerInstance;
}

/**
 * Reset the routine scheduler (for cleanup/testing)
 */
export function resetRoutineScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}
