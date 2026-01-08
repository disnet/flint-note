/**
 * Performance logging utility for the renderer process
 *
 * Provides timing utilities to track startup and operation performance.
 * Uses console grouping for nice hierarchical output in browser devtools.
 */

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
  private startupTime: number;

  private constructor() {
    // Enable perf logging if localStorage flag is set or URL param
    const urlParams =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlEnabled = urlParams?.get('perf') === 'true';
    const localStorageEnabled =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('FLINT_PERF') === 'true';

    // Check if explicitly disabled
    const explicitlyDisabled =
      urlParams?.get('perf') === 'false' ||
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('FLINT_PERF') === 'false');

    // Enable by default in development mode (Vite sets import.meta.env.DEV)
    // Can be disabled by setting ?perf=false or localStorage FLINT_PERF=false
    const isDev =
      typeof import.meta !== 'undefined' &&
      (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

    this.enabled = !explicitlyDisabled && (urlEnabled || localStorageEnabled || isDev);
    this.startupTime = performance.now();
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

    // Use console.group for nice browser devtools nesting
    console.group(`%c[PERF] ▶ ${label}`, 'color: #6366f1; font-weight: bold');
  }

  /**
   * End the current timing section.
   */
  end(label?: string): number {
    if (!this.enabled || !this.currentEntry) return 0;

    // If label is provided, verify it matches
    if (label && this.currentEntry.label !== label) {
      console.warn(
        `[PERF] Mismatched end label: expected "${this.currentEntry.label}", got "${label}"`
      );
    }

    this.currentEntry.endTime = performance.now();
    const duration = this.currentEntry.endTime - this.currentEntry.startTime;

    const color = this.getDurationColor(duration);
    console.log(
      `%c[PERF] ◼ ${this.currentEntry.label}: ${this.formatDuration(duration)}`,
      `color: ${color}; font-weight: bold`
    );
    console.groupEnd();

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
    const elapsed = performance.now() - this.startupTime;
    console.log(
      `%c[PERF] • ${label} at ${this.formatDuration(elapsed)}`,
      'color: #8b5cf6'
    );
  }

  /**
   * Print a summary of all recorded timings.
   */
  summary(): void {
    if (!this.enabled || this.rootEntries.length === 0) return;

    console.log('%c═══════════════════════════════════════════', 'color: #6366f1');
    console.log(
      '%c  RENDERER STARTUP PERFORMANCE SUMMARY',
      'color: #6366f1; font-weight: bold'
    );
    console.log('%c═══════════════════════════════════════════', 'color: #6366f1');

    this.printEntries(this.rootEntries, 0);

    const totalTime = this.rootEntries.reduce((sum, entry) => {
      return sum + (entry.endTime ? entry.endTime - entry.startTime : 0);
    }, 0);

    console.log('%c───────────────────────────────────────────', 'color: #6366f1');
    console.log(
      `%cTotal renderer startup time: ${this.formatDuration(totalTime)}`,
      'color: #6366f1; font-weight: bold'
    );
    console.log('%c═══════════════════════════════════════════', 'color: #6366f1');
  }

  private printEntries(entries: TimingEntry[], depth: number): void {
    const indent = '  '.repeat(depth);
    for (const entry of entries) {
      if (entry.endTime) {
        const duration = entry.endTime - entry.startTime;
        const color = this.getDurationColor(duration);
        console.log(
          `%c${indent}├─ ${entry.label}: ${this.formatDuration(duration)}`,
          `color: ${color}`
        );
      } else {
        console.log(`%c${indent}├─ ${entry.label}: (not completed)`, 'color: #f59e0b');
      }
      if (entry.children.length > 0) {
        this.printEntries(entry.children, depth + 1);
      }
    }
  }

  private getDurationColor(ms: number): string {
    if (ms < 50) return '#22c55e'; // green - fast
    if (ms < 200) return '#eab308'; // yellow - moderate
    if (ms < 1000) return '#f97316'; // orange - slow
    return '#ef4444'; // red - very slow
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
    this.startupTime = performance.now();
  }

  /**
   * Enable or disable performance logging.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (typeof localStorage !== 'undefined') {
      if (enabled) {
        localStorage.setItem('FLINT_PERF', 'true');
      } else {
        localStorage.removeItem('FLINT_PERF');
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const perf = PerfLogger.getInstance();
