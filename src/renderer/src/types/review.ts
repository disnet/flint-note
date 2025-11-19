/**
 * Type definitions for the review session feature
 */

/**
 * Review rating scale (1-4)
 * 1: Need more time - struggled, need to revisit sooner
 * 2: Productive - good engagement, appropriate timing
 * 3: Already familiar - could have waited longer
 * 4: Fully processed - no more reviews needed, retire
 */
export type ReviewRating = 1 | 2 | 3 | 4;

/**
 * Review item status
 */
export type ReviewStatus = 'active' | 'retired';

/**
 * Entry in a note's review history
 * Note: Must match server-side ReviewHistoryEntry in review-scheduler.ts
 */
export interface ReviewHistoryEntry {
  date: string; // ISO datetime
  sessionNumber: number;
  rating: ReviewRating;
  response?: string;
  prompt?: string;
  feedback?: string;
}

/**
 * Review item (metadata for a reviewable note)
 */
export interface ReviewItem {
  id: string;
  noteId: string;
  vaultId: string;
  enabled: boolean;
  lastReviewed: string | null;
  nextReview: string; // YYYY-MM-DD (kept for backward compatibility)
  nextSessionNumber: number;
  currentInterval: number;
  status: ReviewStatus;
  reviewCount: number;
  reviewHistory: ReviewHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Review statistics
 */
export interface ReviewStats {
  dueThisSession: number;
  totalEnabled: number;
  retired: number;
  currentSessionNumber: number;
}

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

/**
 * Review session state machine states
 */
export type ReviewSessionState =
  | 'idle' // Stats dashboard, no active session
  | 'loading' // Loading notes or generating content
  | 'prompting' // Waiting for user response to prompt
  | 'feedback' // Showing agent feedback, awaiting rating
  | 'transition' // Brief transition between notes
  | 'complete'; // Session finished, showing summary

/**
 * Result of a single review within a session
 */
export interface ReviewResult {
  noteId: string;
  noteTitle: string;
  rating: ReviewRating;
  userResponse: string;
  agentFeedback: string;
  timestamp: string; // ISO datetime
  scheduledForSession: number; // Next session number (or -1 if retired)
}

/**
 * Agent's feedback on a user's response
 */
export interface AgentFeedback {
  feedback: string; // Markdown formatted feedback text
  suggestedLinks?: string[]; // Note IDs the agent suggests linking to
}

/**
 * Request to generate a review prompt
 */
export interface GenerateReviewPromptRequest {
  noteId: string;
}

/**
 * Response containing the generated review prompt
 */
export interface GenerateReviewPromptResponse {
  success: boolean;
  prompt?: string; // Markdown formatted prompt
  error?: string;
}

/**
 * Request to analyze a user's review response
 */
export interface AnalyzeReviewResponseRequest {
  noteId: string;
  prompt: string; // Original prompt that was shown
  userResponse: string;
}

/**
 * Response containing agent's analysis
 */
export interface AnalyzeReviewResponseResponse {
  success: boolean;
  feedback?: AgentFeedback;
  error?: string;
}

/**
 * Complete review session summary
 */
export interface ReviewSessionSummary {
  totalNotes: number;
  ratingCounts: Record<ReviewRating, number>;
  skippedCount: number;
  startTime: string; // ISO datetime
  endTime: string; // ISO datetime
  durationMinutes: number;
  results: ReviewResult[];
  sessionNumber: number;
}

/**
 * Note in a review session (matches getNotesForReview return type)
 */
export interface SessionReviewNote {
  id: string;
  title: string;
  content: string | null;
  reviewItem: {
    reviewCount: number;
    nextSessionNumber: number;
    currentInterval: number;
  };
  skipped?: boolean; // True if user skipped this note
  prompt?: string; // Generated prompt for this note
  userResponse?: string; // User's response
  agentFeedback?: string; // Agent's feedback
  reviewedAt?: string; // ISO datetime when reviewed in this session
  rating?: ReviewRating; // Rating given in this session
}
