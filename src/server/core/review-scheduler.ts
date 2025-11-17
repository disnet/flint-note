/**
 * Review Scheduler
 *
 * Handles scheduling logic for spaced repetition review system.
 * MVP implementation uses simple binary intervals: 1 day (fail) or 7 days (pass).
 */

export interface ReviewHistoryEntry {
  date: string;
  passed: boolean;
  response?: string;
  prompt?: string;
  feedback?: string;
}

/**
 * Calculate the next review date based on pass/fail outcome
 * MVP: Simple binary intervals (1 day fail / 7 days pass)
 */
export function getNextReviewDate(passed: boolean, baseDate?: Date): string {
  const now = baseDate || new Date();
  const nextDate = new Date(now);

  if (passed) {
    // Pass: review in 7 days
    nextDate.setDate(nextDate.getDate() + 7);
  } else {
    // Fail: retry tomorrow
    nextDate.setDate(nextDate.getDate() + 1);
  }

  // Return as YYYY-MM-DD format
  return nextDate.toISOString().split('T')[0];
}

/**
 * Create a review history entry
 */
export function createReviewHistoryEntry(
  passed: boolean,
  userResponse?: string,
  prompt?: string,
  feedback?: string
): ReviewHistoryEntry {
  return {
    date: new Date().toISOString(),
    passed,
    response: userResponse,
    prompt,
    feedback
  };
}

/**
 * Parse review history from JSON string
 */
export function parseReviewHistory(historyJson: string | null): ReviewHistoryEntry[] {
  if (!historyJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(historyJson);
    return Array.isArray(parsed) ? parsed : [];
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
  passed: boolean,
  userResponse?: string,
  prompt?: string,
  feedback?: string
): string {
  const history = parseReviewHistory(existingHistoryJson);
  const newEntry = createReviewHistoryEntry(passed, userResponse, prompt, feedback);
  history.push(newEntry);
  return serializeReviewHistory(history);
}
