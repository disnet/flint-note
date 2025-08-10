import { aiThreadsStore } from '../stores/aiThreadsStore.svelte';

export interface CleanupConfig {
  maxAgeMonths: number;
  maxInactiveMonths: number;
  maxArchivedThreads: number;
  autoCleanupEnabled: boolean;
}

const DEFAULT_CONFIG: CleanupConfig = {
  maxAgeMonths: 6,
  maxInactiveMonths: 3,
  maxArchivedThreads: 100,
  autoCleanupEnabled: true
};

// Storage key for cleanup config
const CLEANUP_CONFIG_KEY = 'flint-thread-cleanup-config';
const LAST_CLEANUP_KEY = 'flint-last-thread-cleanup';

// Load cleanup configuration from localStorage
function loadCleanupConfig(): CleanupConfig {
  try {
    const stored = localStorage.getItem(CLEANUP_CONFIG_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn('Failed to load thread cleanup config:', error);
  }
  return DEFAULT_CONFIG;
}

// Save cleanup configuration to localStorage
function saveCleanupConfig(config: CleanupConfig): void {
  try {
    localStorage.setItem(CLEANUP_CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('Failed to save thread cleanup config:', error);
  }
}

// Get last cleanup timestamp
function getLastCleanup(): Date {
  try {
    const stored = localStorage.getItem(LAST_CLEANUP_KEY);
    if (stored) {
      return new Date(stored);
    }
  } catch (error) {
    console.warn('Failed to get last cleanup timestamp:', error);
  }
  return new Date(0); // Unix epoch if never cleaned
}

// Set last cleanup timestamp
function setLastCleanup(date: Date = new Date()): void {
  try {
    localStorage.setItem(LAST_CLEANUP_KEY, date.toISOString());
  } catch (error) {
    console.warn('Failed to set last cleanup timestamp:', error);
  }
}

// Check if cleanup is needed (run once per day max)
function shouldRunCleanup(): boolean {
  const lastCleanup = getLastCleanup();
  const now = new Date();
  const daysSinceCleanup =
    (now.getTime() - lastCleanup.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceCleanup >= 1; // Run max once per day
}

// Perform thread cleanup based on configuration
export function cleanupThreads(config?: Partial<CleanupConfig>): {
  deletedThreads: number;
  archivedThreads: number;
} {
  const cleanupConfig = { ...loadCleanupConfig(), ...config };
  const now = new Date();
  let deletedThreads = 0;
  let archivedThreads = 0;

  const maxAgeMs = cleanupConfig.maxAgeMonths * 30 * 24 * 60 * 60 * 1000;
  const maxInactiveMs = cleanupConfig.maxInactiveMonths * 30 * 24 * 60 * 60 * 1000;

  // Get all threads for cleanup analysis
  const allThreads = aiThreadsStore.threads;

  // Phase 1: Delete very old threads
  const threadsToDelete = allThreads.filter((thread) => {
    const age = now.getTime() - thread.createdAt.getTime();
    const inactivity = now.getTime() - thread.lastActivity.getTime();

    return (
      // Delete if older than max age
      age > maxAgeMs ||
      // Delete if inactive for too long
      inactivity > maxInactiveMs
    );
  });

  threadsToDelete.forEach((thread) => {
    if (aiThreadsStore.deleteThread(thread.id)) {
      deletedThreads++;
    }
  });

  // Phase 2: Archive old threads (but not too many)
  const remainingThreads = aiThreadsStore.threads.filter((t) => !t.isArchived);
  const threadsToArchive = remainingThreads
    .filter((thread) => {
      const inactivity = now.getTime() - thread.lastActivity.getTime();
      // Archive if inactive for half the max inactive time
      return inactivity > maxInactiveMs / 2;
    })
    .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime()) // Oldest first
    .slice(0, Math.max(0, remainingThreads.length - 20)); // Keep at least 20 active threads

  threadsToArchive.forEach((thread) => {
    if (aiThreadsStore.archiveThread(thread.id)) {
      archivedThreads++;
    }
  });

  // Phase 3: Limit archived threads
  const archivedThreadsList = aiThreadsStore.archivedThreads;
  if (archivedThreadsList.length > cleanupConfig.maxArchivedThreads) {
    const excessArchived = archivedThreadsList
      .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime()) // Oldest first
      .slice(0, archivedThreadsList.length - cleanupConfig.maxArchivedThreads);

    excessArchived.forEach((thread) => {
      if (aiThreadsStore.deleteThread(thread.id)) {
        deletedThreads++;
      }
    });
  }

  // Update last cleanup timestamp
  setLastCleanup(now);

  return { deletedThreads, archivedThreads };
}

// Auto-cleanup function that runs on app startup
export function runAutoCleanup(): void {
  const config = loadCleanupConfig();

  if (!config.autoCleanupEnabled || !shouldRunCleanup()) {
    return;
  }

  try {
    const result = cleanupThreads(config);
    if (result.deletedThreads > 0 || result.archivedThreads > 0) {
      console.log(
        `Thread cleanup completed: ${result.deletedThreads} deleted, ${result.archivedThreads} archived`
      );
    }
  } catch (error) {
    console.warn('Thread auto-cleanup failed:', error);
  }
}

// Configuration management
export const threadCleanupConfig = {
  get current(): CleanupConfig {
    return loadCleanupConfig();
  },

  update(newConfig: Partial<CleanupConfig>): CleanupConfig {
    const updated = { ...loadCleanupConfig(), ...newConfig };
    saveCleanupConfig(updated);
    return updated;
  },

  reset(): CleanupConfig {
    saveCleanupConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
};

// Manual cleanup with preview
export function previewCleanup(config?: Partial<CleanupConfig>): {
  threadsToDelete: string[];
  threadsToArchive: string[];
  config: CleanupConfig;
} {
  const cleanupConfig = { ...loadCleanupConfig(), ...config };
  const now = new Date();

  const maxAgeMs = cleanupConfig.maxAgeMonths * 30 * 24 * 60 * 60 * 1000;
  const maxInactiveMs = cleanupConfig.maxInactiveMonths * 30 * 24 * 60 * 60 * 1000;

  const allThreads = aiThreadsStore.threads;

  const threadsToDelete = allThreads
    .filter((thread) => {
      const age = now.getTime() - thread.createdAt.getTime();
      const inactivity = now.getTime() - thread.lastActivity.getTime();
      return age > maxAgeMs || inactivity > maxInactiveMs;
    })
    .map((thread) => thread.title);

  const remainingThreads = allThreads.filter((t) => !t.isArchived);
  const threadsToArchive = remainingThreads
    .filter((thread) => {
      const inactivity = now.getTime() - thread.lastActivity.getTime();
      return inactivity > maxInactiveMs / 2;
    })
    .slice(0, Math.max(0, remainingThreads.length - 20))
    .map((thread) => thread.title);

  return {
    threadsToDelete,
    threadsToArchive,
    config: cleanupConfig
  };
}

// Initialize cleanup on app startup (call this from your main app component)
export function initThreadCleanup(): void {
  // Run cleanup after a short delay to allow app to fully load
  setTimeout(() => {
    runAutoCleanup();
  }, 5000); // 5 second delay
}
