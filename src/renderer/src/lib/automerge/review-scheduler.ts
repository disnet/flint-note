/**
 * Review Scheduler
 *
 * Pure functions for session-based spaced engagement scheduling.
 * Handles interval calculation, session availability, and date estimation.
 */

import type { ReviewRating, ReviewConfig, ReviewHistoryEntry } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default scheduling configuration
 */
export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  sessionSize: 5,
  sessionsPerWeek: 7,
  maxIntervalSessions: 15,
  minIntervalDays: 1
};

/**
 * Rating multipliers for interval calculation
 * Rating 4 results in retirement, so not included here
 */
export const RATING_MULTIPLIERS: Record<1 | 2 | 3, number> = {
  1: 0.5, // Need more time - see sooner
  2: 1.5, // Productive - good progress
  3: 2.5 // Already familiar - can wait longer
};

/**
 * Rating labels for UI display
 */
export const RATING_LABELS: Record<ReviewRating, string> = {
  1: 'Need more time',
  2: 'Productive',
  3: 'Already familiar',
  4: 'Fully processed'
};

/**
 * Rating descriptions for UI display
 */
export const RATING_DESCRIPTIONS: Record<ReviewRating, string> = {
  1: 'See sooner',
  2: 'Normal',
  3: 'See later',
  4: 'Done with this'
};

// ============================================================================
// Types
// ============================================================================

/**
 * Result of calculating next session
 */
export interface NextSessionResult {
  /** Next session number when the note should be reviewed */
  nextSession: number;
  /** New interval value in sessions */
  interval: number;
}

/**
 * Review stats for dashboard display
 */
export interface ReviewStats {
  /** Number of notes due in the current session */
  dueThisSession: number;
  /** Total number of notes with review enabled */
  totalEnabled: number;
  /** Number of retired notes */
  retired: number;
  /** Current session number */
  currentSessionNumber: number;
}

// ============================================================================
// Scheduling Functions
// ============================================================================

/**
 * Calculate the next session number based on rating
 * Returns 'retired' for rating 4 (fully processed)
 */
export function calculateNextSession(
  currentSession: number,
  currentInterval: number,
  rating: ReviewRating,
  config: ReviewConfig = DEFAULT_REVIEW_CONFIG
): NextSessionResult | 'retired' {
  if (rating === 4) {
    return 'retired';
  }

  const multiplier = RATING_MULTIPLIERS[rating];
  const newInterval = Math.max(1, Math.round(currentInterval * multiplier));
  const cappedInterval = Math.min(newInterval, config.maxIntervalSessions);

  return {
    nextSession: currentSession + cappedInterval,
    interval: cappedInterval
  };
}

/**
 * Calculate approximate date for a future session
 * Used for UI display purposes
 */
export function estimateSessionDate(
  sessionNumber: number,
  currentSession: number,
  sessionsPerWeek: number,
  baseDate?: Date
): Date {
  const now = baseDate || new Date();
  const sessionsAway = sessionNumber - currentSession;
  const daysAway = Math.round((sessionsAway / sessionsPerWeek) * 7);
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + daysAway);
  return targetDate;
}

/**
 * Format a date for display (e.g., "Dec 23" or "Today")
 */
export function formatSessionDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays} days`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Check if a new session is available based on the 1 AM reset logic
 *
 * Sessions reset at 1 AM local time to prevent late-night sessions
 * from blocking the next day's session.
 */
export function isNewSessionAvailable(lastSessionDate: string | null): boolean {
  if (!lastSessionDate) {
    // Never completed a session, so one is available
    return true;
  }

  const now = new Date();
  const lastDate = new Date(lastSessionDate);

  // Get the "session day" for each date
  // A session day runs from 1 AM to 1 AM the next day
  const getSessionDay = (date: Date): string => {
    const adjusted = new Date(date);
    // If before 1 AM, consider it the previous day
    if (adjusted.getHours() < 1) {
      adjusted.setDate(adjusted.getDate() - 1);
    }
    return adjusted.toISOString().split('T')[0];
  };

  const currentSessionDay = getSessionDay(now);
  const lastSessionDay = getSessionDay(lastDate);

  // A new session is available if we're in a different session day
  return currentSessionDay !== lastSessionDay;
}

/**
 * Get the next time a session will become available
 * Returns null if a session is currently available
 */
export function getNextSessionAvailableAt(lastSessionDate: string | null): Date | null {
  if (isNewSessionAvailable(lastSessionDate)) {
    return null;
  }

  const now = new Date();

  // Next session available at 1 AM tomorrow
  const nextAvailable = new Date(now);
  nextAvailable.setDate(nextAvailable.getDate() + 1);
  nextAvailable.setHours(1, 0, 0, 0);

  return nextAvailable;
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
export function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================================
// History Helpers
// ============================================================================

/**
 * Create a review history entry
 */
export function createReviewHistoryEntry(
  sessionNumber: number,
  rating: ReviewRating,
  userResponse?: string,
  prompt?: string,
  feedback?: string
): ReviewHistoryEntry {
  return {
    date: new Date().toISOString(),
    sessionNumber,
    rating,
    response: userResponse,
    prompt,
    feedback
  };
}

/**
 * Get rating statistics from review history
 */
export function getHistoryStats(history: ReviewHistoryEntry[]): {
  totalReviews: number;
  ratingCounts: Record<ReviewRating, number>;
  averageRating: number;
} {
  const ratingCounts: Record<ReviewRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let totalRating = 0;

  for (const entry of history) {
    ratingCounts[entry.rating]++;
    totalRating += entry.rating;
  }

  return {
    totalReviews: history.length,
    ratingCounts,
    averageRating: history.length > 0 ? totalRating / history.length : 0
  };
}

/**
 * Check if a review history entry represents a "pass" (rating >= 2)
 */
export function isPassingRating(rating: ReviewRating): boolean {
  return rating >= 2;
}

/**
 * Get the last review entry from history
 */
export function getLastReview(history: ReviewHistoryEntry[]): ReviewHistoryEntry | null {
  if (history.length === 0) return null;
  return history[history.length - 1];
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}
