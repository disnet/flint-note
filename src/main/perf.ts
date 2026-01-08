/**
 * Performance logging utility for the main process
 *
 * Provides timing utilities to track startup and operation performance.
 * Logs are written through the main logger for persistence.
 */

import { logger } from './logger';

interface TimingEntry {
  label: string;
  startTime: number;
  endTime?: number;
  children: TimingEntry[];
  parent?: TimingEntry;
}

class PerfLogger {
  private static instance: PerfLogger;
  private rootEntries: TimingEntry[] = [];
  private currentEntry: TimingEntry | null = null;
  private enabled: boolean;

  private constructor() {
    // Enable perf logging if FLINT_PERF env var is set or in development
    this.enabled =
      process.env.FLINT_PERF === 'true' || process.env.NODE_ENV !== 'production';
  }

  static getInstance(): PerfLogger {
    if (!PerfLogger.instance) {
      PerfLogger.instance = new PerfLogger();
    }
    return PerfLogger.instance;
  }

  /**
   * Start a timing section. Can be nested.
   */
  start(label: string): void {
    if (!this.enabled) return;

    const entry: TimingEntry = {
      label,
      startTime: performance.now(),
      children: [],
      parent: this.currentEntry || undefined
    };

    if (this.currentEntry) {
      this.currentEntry.children.push(entry);
    } else {
      this.rootEntries.push(entry);
    }

    this.currentEntry = entry;
    logger.info(`[PERF] ▶ ${label}`);
  }

  /**
   * End the current timing section.
   */
  end(label?: string): number {
    if (!this.enabled || !this.currentEntry) return 0;

    // If label is provided, verify it matches
    if (label && this.currentEntry.label !== label) {
      logger.warn(
        `[PERF] Mismatched end label: expected "${this.currentEntry.label}", got "${label}"`
      );
    }

    this.currentEntry.endTime = performance.now();
    const duration = this.currentEntry.endTime - this.currentEntry.startTime;

    logger.info(`[PERF] ◼ ${this.currentEntry.label}: ${this.formatDuration(duration)}`);

    // Move up to parent
    this.currentEntry = this.currentEntry.parent || null;

    return duration;
  }

  /**
   * Time a synchronous operation.
   */
  time<T>(label: string, fn: () => T): T {
    this.start(label);
    try {
      return fn();
    } finally {
      this.end(label);
    }
  }

  /**
   * Time an async operation.
   */
  async timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.start(label);
    try {
      return await fn();
    } finally {
      this.end(label);
    }
  }

  /**
   * Log a single point-in-time marker.
   */
  mark(label: string): void {
    if (!this.enabled) return;
    logger.info(`[PERF] • ${label} at ${this.formatDuration(performance.now())}`);
  }

  /**
   * Print a summary of all recorded timings.
   */
  summary(): void {
    if (!this.enabled || this.rootEntries.length === 0) return;

    logger.info('[PERF] ═══════════════════════════════════════════');
    logger.info('[PERF] STARTUP PERFORMANCE SUMMARY');
    logger.info('[PERF] ═══════════════════════════════════════════');

    this.printEntries(this.rootEntries, 0);

    const totalTime = this.rootEntries.reduce((sum, entry) => {
      return sum + (entry.endTime ? entry.endTime - entry.startTime : 0);
    }, 0);

    logger.info('[PERF] ───────────────────────────────────────────');
    logger.info(`[PERF] Total startup time: ${this.formatDuration(totalTime)}`);
    logger.info('[PERF] ═══════════════════════════════════════════');
  }

  private printEntries(entries: TimingEntry[], depth: number): void {
    const indent = '  '.repeat(depth);
    for (const entry of entries) {
      if (entry.endTime) {
        const duration = entry.endTime - entry.startTime;
        logger.info(
          `[PERF] ${indent}├─ ${entry.label}: ${this.formatDuration(duration)}`
        );
      } else {
        logger.info(`[PERF] ${indent}├─ ${entry.label}: (not completed)`);
      }
      if (entry.children.length > 0) {
        this.printEntries(entry.children, depth + 1);
      }
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1) {
      return `${(ms * 1000).toFixed(0)}µs`;
    } else if (ms < 1000) {
      return `${ms.toFixed(1)}ms`;
    } else {
      return `${(ms / 1000).toFixed(2)}s`;
    }
  }

  /**
   * Reset all timing data.
   */
  reset(): void {
    this.rootEntries = [];
    this.currentEntry = null;
  }

  /**
   * Enable or disable performance logging.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const perf = PerfLogger.getInstance();
