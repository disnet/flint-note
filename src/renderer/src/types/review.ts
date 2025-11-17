/**
 * Type definitions for the review session feature
 */

/**
 * Entry in a note's review history
 * Note: Must match server-side ReviewHistoryEntry in review-scheduler.ts
 */
export interface ReviewHistoryEntry {
  date: string; // ISO datetime
  passed: boolean;
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
  nextReview: string; // YYYY-MM-DD
  reviewCount: number;
  reviewHistory: ReviewHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Review statistics
 */
export interface ReviewStats {
  dueToday: number;
  dueThisWeek: number;
  totalEnabled: number;
}

/**
 * Review session state machine states
 */
export type ReviewSessionState =
  | 'idle' // Stats dashboard, no active session
  | 'loading' // Loading notes or generating content
  | 'prompting' // Waiting for user response to prompt
  | 'feedback' // Showing agent feedback, awaiting pass/fail
  | 'transition' // Brief transition between notes
  | 'complete'; // Session finished, showing summary

/**
 * Result of a single review within a session
 */
export interface ReviewResult {
  noteId: string;
  noteTitle: string;
  passed: boolean;
  userResponse: string;
  agentFeedback: string;
  timestamp: string; // ISO datetime
  scheduledFor: string; // YYYY-MM-DD of next review
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
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  startTime: string; // ISO datetime
  endTime: string; // ISO datetime
  durationMinutes: number;
  results: ReviewResult[];
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
    nextReview: string;
  };
  skipped?: boolean; // True if user skipped this note
  prompt?: string; // Generated prompt for this note
  userResponse?: string; // User's response
  agentFeedback?: string; // Agent's feedback
  reviewedAt?: string; // ISO datetime when reviewed in this session
}
