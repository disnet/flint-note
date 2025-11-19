/**
 * Review Scheduler
 *
 * Handles scheduling logic for session-based spaced engagement system.
 * Uses a 4-point rating scale and session-based intervals instead of dates.
 */

/**
 * Review rating scale (1-4)
 */
export type ReviewRating = 1 | 2 | 3 | 4;

/**
 * Scheduling configuration
 */
export interface SchedulingConfig {
  sessionSize: number;
  sessionsPerWeek: number;
  maxIntervalSessions: number;
  minIntervalDays: number;
}

/**
 * Default scheduling configuration
 */
export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  sessionSize: 5,
  sessionsPerWeek: 7,
  maxIntervalSessions: 15,
  minIntervalDays: 1
};

/**
 * Rating multipliers for interval calculation
 */
export const RATING_MULTIPLIERS: Record<1 | 2 | 3, number> = {
  1: 0.5, // Need more time
  2: 1.5, // Productive
  3: 2.5 // Already familiar
};

export interface ReviewHistoryEntry {
  date: string;
  sessionNumber: number;
  rating: ReviewRating;
  response?: string;
  prompt?: string;
  feedback?: string;
}

/**
 * Result of calculating next session
 */
export interface NextSessionResult {
  nextSession: number;
  interval: number;
}

/**
 * Calculate the next session number based on rating
 * Returns 'retired' for rating 4 (fully processed)
 */
export function calculateNextSession(
  currentSession: number,
  currentInterval: number,
  rating: ReviewRating,
  config: SchedulingConfig = DEFAULT_SCHEDULING_CONFIG
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
 * Calculate the next review date based on rating
 * This is a helper for backward compatibility - converts session to date
 * @deprecated Use calculateNextSession for new code
 */
export function getNextReviewDate(
  rating: ReviewRating,
  currentInterval: number,
  currentSession: number,
  config: SchedulingConfig = DEFAULT_SCHEDULING_CONFIG,
  baseDate?: Date
): string {
  const result = calculateNextSession(currentSession, currentInterval, rating, config);

  if (result === 'retired') {
    // Return far future date for retired items
    return '9999-12-31';
  }

  const targetDate = estimateSessionDate(
    result.nextSession,
    currentSession,
    config.sessionsPerWeek,
    baseDate
  );

  return targetDate.toISOString().split('T')[0];
}

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
 * Parse review history from JSON string
 * Handles legacy format with `passed: boolean` by converting to `rating`
 */
export function parseReviewHistory(historyJson: string | null): ReviewHistoryEntry[] {
  if (!historyJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(historyJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Convert legacy format if needed
    return parsed.map((entry) => {
      // If already has rating, return as-is
      if ('rating' in entry) {
        return entry;
      }

      // Convert legacy passed/failed to rating
      // passed: true -> rating 2 (Productive)
      // passed: false -> rating 1 (Need more time)
      const rating = entry.passed ? 2 : 1;

      return {
        date: entry.date || entry.timestamp,
        rating,
        sessionNumber: entry.sessionNumber || 0,
        response: entry.response || entry.userResponse,
        prompt: entry.prompt,
        feedback: entry.feedback
      };
    });
  } catch {
    return [];
  }
}

/**
 * Serialize review history to JSON string
 */
export function serializeReviewHistory(history: ReviewHistoryEntry[]): string {
  return JSON.stringify(history);
}

/**
 * Add an entry to review history
 */
export function appendToReviewHistory(
  existingHistoryJson: string | null,
  sessionNumber: number,
  rating: ReviewRating,
  userResponse?: string,
  prompt?: string,
  feedback?: string
): string {
  const history = parseReviewHistory(existingHistoryJson);
  const newEntry = createReviewHistoryEntry(
    sessionNumber,
    rating,
    userResponse,
    prompt,
    feedback
  );
  history.push(newEntry);
  return serializeReviewHistory(history);
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
